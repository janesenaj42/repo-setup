// Reconciles a repository with the baseline. Every change is staged in a Plan first, so a dry
// run prints exactly what a real run would write.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  hash,
  markFile,
  normalize,
  parseBlocks,
  PLUGIN,
  readMarkedFile,
  renderBlock,
} from "../baseline/files/.baseline/checks/baseline.mjs";
import { blocksFor, filesFor, starterFiles } from "./content.mjs";
import { detectAreas, nodeDependencies, STACKS, stopChecks } from "./stacks.mjs";

const HOOKS_FILE = ".baseline/lefthook.yml";
/** This package's git repository, which is also the plugin's marketplace (.claude-plugin/). */
const DEFAULT_MARKETPLACE_URL = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))
  .repository.url.replace(/^git\+/, "");
const MARKETPLACE = PLUGIN.split("@")[1];
const COMMITLINT_FILE = "commitlint.config.mjs";
/** commitlint's config files (cosmiconfig): it reads the first it finds, so a repository has one. */
const COMMITLINT_CONFIG = /^(\.commitlintrc(\.(json|ya?ml|js|cjs|mjs|ts|cts|mts))?|commitlint\.config\.(js|cjs|mjs|ts|cts|mts))$/;
/** Tools a TypeScript Area's lint and format commands run; init-react installs them in a React one. */
const TS_TOOLS = ["eslint", "prettier"];
/** Baseline Files that earlier versions wrote elsewhere: removed when the file is still marked. */
/** Baseline Files earlier versions wrote, now elsewhere: [old path, where it moved]. */
const RETIRED_FILES = [
  ...["baseline", "branch-name", "json-valid"].map((name) => [`scripts/checks/${name}.mjs`, ".baseline/checks/"]),
  [".claude/hooks/checks.json", ".baseline/claude-checks.json"],
];
const JSON_INDENT = 2;
const PNPM_WORKSPACE = "pnpm-workspace.yaml";
const LOCKFILES = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];
// false: lefthook's own install script stays off; the prepare script installs the hooks.
const ALLOW_LEFTHOOK = "allowBuilds:\n  lefthook: false\n";
const DEV_DEPENDENCIES = {
  lefthook: "^2.1.17",
  "@commitlint/cli": "^21.2.3",
  "@commitlint/config-conventional": "^21.2.3",
  // .baseline/checks/branch-name.mjs reads the commit types from it; pnpm doesn't hoist it.
  "@commitlint/load": "^21.2.3",
};

export class Plan {
  constructor(root, { force = false, marketplace = null } = {}) {
    this.root = root;
    this.force = force;
    this.marketplace = marketplace;
    this.writes = new Map();
    this.entries = [];
    /** What --force overrides: your files ({ path, before, after }) and lefthook.yml commands ({ hook, name }). */
    this.forced = [];
  }
  read(path) {
    if (this.writes.has(path)) return this.writes.get(path);
    const full = join(this.root, path);
    return existsSync(full) ? normalize(readFileSync(full, "utf8")) : null;
  }
  /** Stages a file's removal: read() then sees no file. */
  remove(path, why) {
    if (this.read(path) === null) return;
    this.writes.set(path, null);
    this.log("-", `${path} (${why})`);
  }
  write(path, content, why) {
    const before = this.read(path);
    if (before === content) return;
    this.writes.set(path, content);
    this.log(before === null ? "+" : "~", `${path}${why ? ` (${why})` : ""}`);
  }
  log(symbol, text) {
    this.entries.push({ symbol, text });
  }
  apply() {
    for (const [path, content] of this.writes) {
      const full = join(this.root, path);
      if (content === null) {
        rmSync(full, { force: true });
        removeEmptyFolders(this.root, dirname(path));
        continue;
      }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
}

/** Removes `folder` and its parents up to the repository root, while they are empty. */
function removeEmptyFolders(root, folder) {
  for (let dir = folder; dir !== "." && dir !== ""; dir = dirname(dir)) {
    const full = join(root, dir);
    if (!existsSync(full) || readdirSync(full).length > 0) return;
    rmdirSync(full);
  }
}

/** Blocks first, in order; the project's own lines after them, untouched. */
export function withBlocks(text, blocks) {
  const own = text === null ? "" : parseBlocks(text).own.trimEnd();
  const rendered = blocks.map(({ name, body }) => renderBlock(name, body)).join("\n\n");
  return `${rendered}\n${own ? `\n${own}\n` : ""}`;
}

function reconcileFile(plan, { path, content }) {
  const desired = markFile(path, content);
  const current = plan.read(path);
  if (current === null || current === desired) return plan.write(path, desired);
  const marked = readMarkedFile(current);
  if (marked !== null) {
    const edited = hash(marked.content) !== marked.digest;
    return plan.write(path, desired, edited ? "restoring a hand edit" : "updated to the current baseline");
  }
  if (plan.force) {
    plan.forced.push({ path, before: current, after: desired });
    return plan.write(path, desired, "replacing your own file (--force)");
  }
  plan.log("!", `${path}: your own file, kept. Compare it with the baseline's, or re-run with --force to replace it.`);
}

function reconcileJson(plan, path, change, create) {
  const text = plan.read(path);
  let data;
  try {
    data = text === null ? create() : JSON.parse(text);
  } catch (error) {
    return plan.log("!", `${path}: not valid JSON (${error.message}); fix it, then re-run.`);
  }
  const indent = text?.match(/^[ \t]+(?=")/m)?.[0] ?? " ".repeat(JSON_INDENT);
  change(data);
  plan.write(path, `${JSON.stringify(data, null, indent)}\n`);
}

/**
 * The repository's name for a new package.json: the last part of the origin remote's URL, so a
 * checkout in any folder (e.g. a Docker mount at /src) gets the same name; the folder's name when
 * there is no origin. Lowercase, as npm requires (General-Docs → general-docs).
 */
export function repositoryName(root) {
  const name = basename((originUrl(root) ?? "").replace(/\/+$/, "")).replace(/\.git$/, "");
  return (name || basename(root)).toLowerCase();
}

/** The origin remote's URL, or null when there is none. */
function originUrl(root) {
  try {
    return execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

/** The host of an https, ssh:// or scp-style (git@host:path) git URL. */
function gitHost(url) {
  return url.match(/^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)/i)?.[1].toLowerCase() ?? null;
}

function reconcilePackageJson(plan) {
  reconcileJson(
    plan,
    "package.json",
    (pkg) => {
      const deps = { ...pkg.devDependencies };
      for (const [name, range] of Object.entries(DEV_DEPENDENCIES)) deps[name] ??= range;
      // Sorted, as npm writes them, so adding one causes no other change.
      pkg.devDependencies = Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
      pkg.scripts ??= {};
      const prepare = pkg.scripts.prepare;
      if (prepare === undefined) pkg.scripts.prepare = "lefthook install";
      else if (!prepare.includes("lefthook install")) {
        plan.log("!", `package.json scripts.prepare is "${prepare}": add "lefthook install" to it so the git hooks install.`);
      }
    },
    () => ({ name: repositoryName(plan.root), private: true }),
  );
}

/**
 * The package manager that installs the root package.json: the one its lockfile shows; for a
 * repository with none, pnpm when it has a Node folder and pnpm is installed, npm otherwise.
 */
export function packageManager(root, areas) {
  const found = LOCKFILES.find(([file]) => existsSync(join(root, file)));
  if (found) return found[1];
  const node = areas.some((area) => area.stack === "react" || area.stack === "ts");
  return node && hasPnpm() ? "pnpm" : "npm";
}

export function hasPnpm() {
  // pnpm is a .cmd shim on Windows, which only a shell can start.
  return spawnSync("pnpm", ["--version"], { stdio: "ignore", shell: process.platform === "win32" }).status === 0;
}

/**
 * pnpm 12 fails `pnpm install` on a dependency build script that pnpm-workspace.yaml doesn't
 * mention, and lefthook has one.
 */
function reconcilePnpmWorkspace(plan) {
  const current = plan.read(PNPM_WORKSPACE);
  if (current === null) return plan.write(PNPM_WORKSPACE, `# pnpm settings for this repository.\n${ALLOW_LEFTHOOK}`);
  if (/^\s+lefthook\s*:/m.test(current)) return;
  if (/^allowBuilds:/m.test(current)) {
    return plan.log("!", `${PNPM_WORKSPACE} has allowBuilds: add "  lefthook: false" to it so pnpm install runs.`);
  }
  plan.write(PNPM_WORKSPACE, `${current.replace(/\n*$/, "\n")}\n${ALLOW_LEFTHOOK}`, "lists lefthook's build script as not allowed");
}

/**
 * Claude Code adds the plugin's marketplace when a developer trusts the folder, and loads the
 * plugin from it. The URL: --marketplace; else the repository's own entry; else this package's
 * repository, only when the repository is on the same git host (an on-prem one can't reach it).
 */
function reconcileMarketplace(plan, settings) {
  const own = settings.extraKnownMarketplaces?.[MARKETPLACE];
  if (own && !plan.marketplace) return;
  const sameHost = gitHost(originUrl(plan.root) ?? "") === gitHost(DEFAULT_MARKETPLACE_URL);
  const url = plan.marketplace ?? (sameHost ? DEFAULT_MARKETPLACE_URL : null);
  if (!url) {
    return plan.log(
      "!",
      `.claude/settings.json: no source for the Claude Code plugin. Re-run with --marketplace <git URL of repo-setup on your git host>, so Claude Code loads the plugin for each developer.`,
    );
  }
  settings.extraKnownMarketplaces = {
    ...settings.extraKnownMarketplaces,
    [MARKETPLACE]: { source: { source: "git", url } },
  };
}

function reconcileSettings(plan) {
  reconcileJson(
    plan,
    ".claude/settings.json",
    (settings) => {
      settings.enabledPlugins = { ...settings.enabledPlugins, [PLUGIN]: true };
      reconcileMarketplace(plan, settings);
      const own = ["PostToolUse", "Stop"].filter((event) => settings.hooks?.[event]?.length);
      if (own.length) {
        plan.log(
          "!",
          `.claude/settings.json has its own ${own.join(" and ")} hooks, which run beside the baseline plugin's (.baseline/claude-checks.json): remove the ones that format, lint, typecheck or test the same files, or each runs twice.`,
        );
      }
    },
    () => ({}),
  );
}

function reconcileLefthook(plan) {
  const current = plan.read("lefthook.yml");
  if (current === null) return plan.write("lefthook.yml", `# This repository's own git hooks.\nextends:\n  - ${HOOKS_FILE}\n`);
  if (current.includes(HOOKS_FILE)) return;
  if (/^extends:/m.test(current)) {
    return plan.log("!", `lefthook.yml already extends other files: add "  - ${HOOKS_FILE}" to its extends list.`);
  }
  plan.write("lefthook.yml", `extends:\n  - ${HOOKS_FILE}\n\n${current}`, `extends ${HOOKS_FILE}`);
}

/**
 * The command names lefthook.yml defines under each hook: { "pre-commit": Set { "lint" } }. Reads
 * the `commands:` map of each top-level hook, at any indentation; enough for lefthook's own format.
 */
export function ownHookCommands(text) {
  const own = {};
  let hook = null;
  let commandsIndent = null;
  let childIndent = null;
  for (const line of (text ?? "").split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    const key = /^\s*("[^"]+"|'[^']+'|[^\s:#]+)\s*:/.exec(line)?.[1]?.replace(/^["']|["']$/g, "");
    if (indent === 0) {
      [hook, commandsIndent, childIndent] = [key ?? null, null, null];
    } else if (hook !== null && commandsIndent !== null && indent <= commandsIndent) {
      [commandsIndent, childIndent] = [key === "commands" ? indent : null, null];
    } else if (hook !== null && commandsIndent === null) {
      if (key === "commands") commandsIndent = indent;
    } else if (hook !== null && key) {
      childIndent ??= indent;
      if (indent === childIndent) (own[hook] ??= new Set()).add(key);
    }
  }
  return own;
}

/**
 * The lefthook.yml commands that --force overrides: lefthook runs the extended file's command over
 * a same-named one in lefthook.yml, so with --force, .baseline/lefthook.yml keeps them all.
 */
function replacedHookCommands(areas, ownHooks) {
  const hooksFile = filesFor(areas).find((file) => file.path === HOOKS_FILE);
  const baseline = ownHookCommands(hooksFile.content);
  return Object.entries(ownHooks).flatMap(([hook, names]) =>
    [...names].filter((name) => baseline[hook]?.has(name)).map((name) => ({ hook, name })),
  );
}

/** The repository's own commitlint config (a file, or "commitlint" in package.json), or null. */
function ownCommitlintConfig(plan) {
  const file = readdirSync(plan.root).find((name) => COMMITLINT_CONFIG.test(name) && name !== COMMITLINT_FILE);
  if (file) return file;
  const pkg = plan.read("package.json");
  return pkg !== null && /"commitlint"\s*:\s*\{/.test(pkg) ? 'package.json "commitlint"' : null;
}

/** Keeps commitlint on the project's own config: a second file would never be read. */
function reconcileCommitlint(plan, file) {
  const own = ownCommitlintConfig(plan);
  if (!own) return reconcileFile(plan, file);
  if (plan.force && plan.read(own) !== null) return replaceCommitlint(plan, file, own);
  const current = plan.read(COMMITLINT_FILE);
  if (current !== null && readMarkedFile(current) !== null) plan.remove(COMMITLINT_FILE, `${own} is the config commitlint reads`);
  plan.log("!", `${own} is your commitlint config, kept; the baseline's ${COMMITLINT_FILE} isn't written. Make sure it extends @commitlint/config-conventional${own.endsWith('"commitlint"') ? "" : ", or re-run with --force to replace it"}.`);
}

/** --force: the baseline's config instead of the project's file (commitlint reads only one). */
function replaceCommitlint(plan, file, own) {
  const desired = markFile(file.path, file.content);
  plan.forced.push({ path: `${own} → ${file.path}`, before: plan.read(own), after: desired });
  plan.remove(own, `replaced by the baseline's ${file.path} (--force)`);
  plan.write(file.path, desired, "replacing your commitlint config (--force)");
}

/** The TS_TOOLS that neither the Area's package.json nor a parent folder's (workspaces) lists. */
function missingTools(root, area) {
  const deps = [];
  for (let dir = area.root; ; dir = dirname(dir)) {
    deps.push(nodeDependencies(join(root, dir)) ?? {});
    if (dir === "." || dir === "") break;
  }
  return TS_TOOLS.filter((tool) => !deps.some((found) => tool in found));
}

/**
 * The npm scripts an Area's Claude Stop commands (`npm run <script>`) and its pre-push tests run
 * that its package.json lacks.
 */
function missingScripts(plan, area) {
  const pkg = plan.read(area.root === "." ? "package.json" : `${area.root}/package.json`);
  const scripts = pkg === null ? {} : (JSON.parse(pkg).scripts ?? {});
  const stops = stopChecks(area)
    .filter((command) => command.run[0] === "npm" && command.run[1] === "run")
    .map((command) => command.run[2]);
  const prePush = area.browserTests ? [] : [STACKS[area.stack].prePush.replace(/^npm run /, "")];
  return [...new Set([...stops, ...prePush])].filter((script) => !(script in scripts));
}

function reportMissingScripts(plan) {
  for (const area of plan.areas.filter((a) => a.stack === "ts" || a.stack === "react")) {
    const missing = missingScripts(plan, area);
    if (missing.length === 0) continue;
    const names = missing.map((name) => `"${name}"`).join(" and ");
    plan.log("!", `${area.root}/package.json has no ${names} script, so Claude's Stop check or the pre-push hook fails there until you add ${missing.length > 1 ? "them" : "it"}.`);
  }
}

// Where a project keeps its environment variables' names: Claude may read these, not .env.
const ENV_EXAMPLES = [".env.example", ".env.sample", ".env.template"];

/** Says where a .env has no example beside it: Claude can't read .env (hooks/guard.mjs). */
function reportMissingEnvExamples(plan) {
  const dirs = new Set([".", ...plan.areas.map((area) => area.root)]);
  for (const dir of dirs) {
    if (!existsSync(join(plan.root, dir, ".env"))) continue;
    if (ENV_EXAMPLES.some((name) => existsSync(join(plan.root, dir, name)))) continue;
    const path = dir === "." ? "" : `${dir}/`;
    plan.log("!", `${path}.env has no ${path}.env.example: add one with each variable's name and a placeholder value, so Claude (which doesn't read .env) and new developers know what to set.`);
  }
}

function reportMissingTools(plan) {
  for (const area of plan.areas.filter((a) => a.stack === "ts")) {
    const missing = missingTools(plan.root, area);
    if (missing.length === 0) continue;
    plan.log(
      "!",
      `${area.root}/ has no ${missing.join(" or ")} in its package.json or a parent's, so its lint and format hooks fail until you add ${missing.length > 1 ? "them" : "it"} (see the lint setup below).`,
    );
  }
}

/** Another hook runner owns the hooks: lefthook would install nothing (core.hooksPath). */
function otherHookRunner(root) {
  if (existsSync(join(root, ".husky"))) return "husky (.husky/)";
  try {
    const path = execFileSync("git", ["config", "core.hooksPath"], { cwd: root, encoding: "utf8" }).trim();
    return path ? `core.hooksPath (${path})` : null;
  } catch {
    return null;
  }
}

/** Prettier runs here: a Node stack, Prettier in the root package.json, or a .prettierignore. */
function usesPrettier(result, areas) {
  if (areas.some((area) => area.stack === "react" || area.stack === "ts")) return true;
  if (result.read(".prettierignore") !== null) return true;
  const pkg = result.read("package.json");
  return pkg !== null && /"prettier"\s*:/.test(pkg);
}

/** Builds the plan for the repository at `root`. */
/**
 * A folder's .gitignore blocks from a folder that is no longer an Area (a workspace, or a folder
 * deleted from the repository): the blocks are removed, and the file too when nothing else is in it.
 */
function removeStaleGitignores(plan, blockFiles) {
  const nested = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: plan.root,
    encoding: "utf8",
  })
    .split("\n")
    .filter((path) => path.endsWith("/.gitignore") && !(path in blockFiles));
  for (const path of nested) {
    const { blocks, own } = parseBlocks(plan.read(path) ?? "");
    if (!blocks.some((block) => block.name.startsWith("gitignore/"))) continue;
    if (own.trim() === "") plan.remove(path, "its folder isn't an Area");
    else plan.write(path, `${own.trimEnd()}\n`, "its folder isn't an Area; your own lines kept");
  }
}

export function plan(root, options = {}) {
  const result = new Plan(root, options);
  const areas = detectAreas(root);
  result.areas = areas;
  const blockFiles = blocksFor(areas, { prettier: usesPrettier(result, areas) });
  for (const [path, blocks] of Object.entries(blockFiles)) {
    result.write(path, withBlocks(result.read(path), blocks));
  }
  removeStaleGitignores(result, blockFiles);
  const ownHooks = ownHookCommands(result.read("lefthook.yml"));
  if (result.force) result.forced.push(...replacedHookCommands(areas, ownHooks));
  for (const file of filesFor(areas, { ownHooks: result.force ? {} : ownHooks })) {
    if (file.path === COMMITLINT_FILE) reconcileCommitlint(result, file);
    else reconcileFile(result, file);
  }
  reportMissingTools(result);
  reportMissingScripts(result);
  reportMissingEnvExamples(result);
  for (const [path, moved] of RETIRED_FILES) {
    const text = result.read(path);
    if (text !== null && readMarkedFile(text) !== null) result.remove(path, `moved to ${moved}`);
  }
  for (const file of starterFiles()) {
    const existing = [file.path, ...file.alsoAt].some((path) => result.read(path) !== null);
    if (!existing) result.write(file.path, file.content, "yours to fill in");
  }
  reconcilePackageJson(result);
  result.packageManager = options.packageManager ?? packageManager(root, areas);
  if (result.packageManager === "pnpm") reconcilePnpmWorkspace(result);
  reconcileSettings(result);
  const runner = otherHookRunner(root);
  if (runner) {
    result.log("!", `Git hooks run through ${runner}, so lefthook can't install. Run /baseline:adopt-baseline in Claude Code, or move those hooks into lefthook.yml.`);
  } else {
    reconcileLefthook(result);
  }
  return result;
}
