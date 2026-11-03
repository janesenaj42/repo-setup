#!/usr/bin/env node
// The repo-setup CLI. Usage: README.md, "Set up or update a repository".
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { check } from "../baseline/files/.baseline/checks/baseline.mjs";
import { hasPnpm, plan } from "../lib/apply.mjs";
import { STACKS } from "../lib/stacks.mjs";
import { workspaces } from "../lib/workspaces.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const INIT_REACT = "@janesenaj42/init-react";

const HELP = `@janesenaj42/repo-setup ${version}

Usage:
  repo-setup [options]   Set up or update this repository: git files, git hooks, commit checks,
                         Claude setup, and each React folder's ESLint and Prettier (init-react)
  repo-setup check       Fail if a file repo-setup owns was edited (the pre-commit hook runs this)
  repo-setup status      Say which files differ from this version of the baseline; change nothing

Options:
  --dry-run              Show what would change; change nothing
  --force                Replace your own files at paths the baseline uses, and let the
                         baseline's git hook commands run instead of same-named ones in
                         lefthook.yml. Shows each change and asks first
  --yes                  With --force, don't ask (for scripts)
  --no-init-react        Don't run init-react in React folders
  --marketplace <url>    Git URL of repo-setup on your git host, where Claude Code gets the
                         plugin. Default: the one in .claude/settings.json; else, for a
                         repository on GitHub, repo-setup's GitHub repository
  -h, --help             Show this help
  -v, --version          Show the version
`;

function gitRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function print(result) {
  for (const { symbol, text } of result.entries) console.log(`  ${symbol} ${text}`);
}

/** Lint setup that needs reading the project (build files): left to the skill or a person. */
function manualSteps(areas) {
  return areas
    .filter((area) => area.stack !== "react")
    .map((area) => `  i ${area.root}/ (${area.stack}): ${STACKS[area.stack].lintSetup}`);
}

// pnpm and npx are .cmd shims on Windows, which only a shell can start.
const SHELL = process.platform === "win32";

function runInitReact(root, areas) {
  const react = areas.filter((a) => a.stack === "react");
  if (react.length === 0) return;
  const [command, args] = hasPnpm() ? ["pnpm", ["dlx", INIT_REACT]] : ["npx", ["--yes", INIT_REACT]];
  for (const area of react) {
    console.log(`\ninit-react in ${area.root}/`);
    const result = spawnSync(command, args, { cwd: join(root, area.root), stdio: "inherit", shell: SHELL });
    if (result.status !== 0) console.log(`  ! init-react failed in ${area.root}/; fix the error above, then re-run.`);
  }
}

async function setup(values) {
  const root = gitRoot();
  const result = plan(root, { force: values.force, marketplace: values.marketplace });
  console.log(`repo-setup ${version}: ${root}`);
  console.log(`Areas: ${result.areas.map((a) => `${a.root}/ (${a.stack})`).join(", ") || "none found"}\n`);
  print(result);
  if (result.forced.length) showForced(result.forced);
  if (values["dry-run"]) return console.log("\nDry run: nothing was changed.");
  if (result.forced.length && !(await confirmForce(values.yes))) {
    process.exitCode = 1;
    return console.log("\nNothing was changed.");
  }
  result.apply();
  if (!values["no-init-react"]) runInitReact(root, result.areas);
  const steps = manualSteps(result.areas);
  console.log(`\nDone. Next: \`${result.packageManager} install\` (installs the git hooks), then commit.`);
  if (steps.length) console.log(`Lint setup to merge by hand, or with /baseline:adopt-baseline in Claude Code:\n${steps.join("\n")}`);
}

/** What --force overrides: each of your files as a diff, and each lefthook.yml command it outranks. */
function showForced(forced) {
  console.log("\n--force replaces what you have:");
  const dir = mkdtempSync(join(tmpdir(), "repo-setup-"));
  for (const { path, before, after, hook, name } of forced) {
    if (hook) {
      console.log(`\n  lefthook.yml ${hook}.${name}: the baseline's ${name} runs instead of yours`);
      continue;
    }
    writeFileSync(join(dir, "yours"), before);
    writeFileSync(join(dir, "baseline"), after);
    const diff = spawnSync("git", ["diff", "--no-index", "--no-color", "yours", "baseline"], { cwd: dir, encoding: "utf8" });
    console.log(`\n  ${path} (- yours, + the baseline's):\n${diff.stdout.split("\n").slice(2).join("\n")}`);
  }
  rmSync(dir, { recursive: true, force: true });
}

/** Asks before --force overwrites; without a terminal to ask on, only --yes goes ahead. */
async function confirmForce(yes) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    console.log("\nNo terminal to ask on: re-run with --force --yes to replace them.");
    return false;
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question("\nReplace them? [y/N] ");
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

/** For the plugin's SessionStart hook: silent outside a git repository or on any error. */
function status() {
  let result;
  try {
    result = plan(gitRoot());
  } catch {
    return;
  }
  const changes = result.entries.filter((e) => ["+", "~", "-"].includes(e.symbol));
  if (changes.length) {
    console.log(`repo-setup ${version}: ${changes.length} baseline file(s) in this repository differ from this version. Run \`npx @janesenaj42/repo-setup\` to update them.`);
  }
  const bare = withoutDependencies(result);
  if (bare.length) {
    console.log(`${bare.join(", ")} ha${bare.length > 1 ? "ve" : "s"} no node_modules, so Claude's hooks and the git hooks fail there. Install the dependencies there first (e.g. \`npm install\` or \`pnpm install\` in that folder).`);
  }
}

/**
 * The Node Areas with no node_modules: in their folder, or in a parent folder that lists them as
 * a workspace (which installs them there).
 */
function withoutDependencies(result) {
  const installed = (dir, area) =>
    existsSync(join(result.root, dir, "node_modules")) &&
    (dir === area.root || workspaces(join(result.root, dir)).some((ws) => posix.join(dir, ws) === area.root));
  return result.areas
    .filter((area) => area.stack === "react" || area.stack === "ts")
    .filter((area) => !ancestors(area.root).some((dir) => installed(dir, area)))
    .map((area) => `${area.root}/`);
}

/** A folder and each folder above it, up to the root: "a/b" → ["a/b", "a", "."]. */
function ancestors(dir) {
  return dir === "." ? ["."] : [dir, ...ancestors(dirname(dir) || ".")];
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean" },
      force: { type: "boolean" },
      yes: { type: "boolean" },
      "no-init-react": { type: "boolean" },
      marketplace: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(version);
  const command = positionals[0] ?? "apply";
  if (command === "apply") return setup(values);
  if (command === "status") return status();
  if (command === "check") {
    process.chdir(gitRoot());
    const problems = check();
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = problems.length ? 1 : 0;
    return;
  }
  console.error(`Unknown command "${command}".\n\n${HELP}`);
  process.exitCode = 1;
}

Promise.resolve(main()).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
