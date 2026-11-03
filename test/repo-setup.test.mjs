import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";
import {
  blockProblems,
  check,
  fileProblems,
  markFile,
  renderBlock,
} from "../baseline/files/.baseline/checks/baseline.mjs";
import { ownHookCommands, packageManager, plan, repositoryName, withBlocks } from "../lib/apply.mjs";
import { detectAreas } from "../lib/stacks.mjs";
import { gradleFilters, relatedTests } from "../hooks/run.mjs";

/** A git repository with a React folder, a Gradle folder and a Python folder. */
function mixedRepo() {
  const root = mkdtempSync(join(tmpdir(), "repo-setup-test-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/janesenaj42/mixed.git"], { cwd: root });
  for (const dir of ["web", "api", "tools"]) mkdirSync(join(root, dir));
  writeFileSync(
    join(root, "web/package.json"),
    JSON.stringify({
      scripts: { typecheck: "tsc", test: "vitest run" },
      dependencies: { react: "^19" },
      devDependencies: { typescript: "~5.9" },
    }),
  );
  writeFileSync(join(root, "api/build.gradle.kts"), "plugins { java }\n");
  writeFileSync(join(root, "api/gradlew"), "#!/bin/sh\n");
  writeFileSync(join(root, "tools/pyproject.toml"), '[project]\nname = "tools"\n');
  return root;
}

const read = (root, path) => readFileSync(join(root, path), "utf8");
const setUp = (root, options) => plan(root, options).apply();
const marketplace = (url) => ({ "repo-setup": { source: { source: "git", url } } });

describe("markers", () => {
  it("accept a block or file as written, and reject an edit", () => {
    const block = renderBlock("gitignore/common", "node_modules/\n.env");
    assert.deepEqual(blockProblems(".gitignore", block), []);
    assert.equal(blockProblems(".gitignore", block.replace(".env", ".envx")).length, 1);

    const file = markFile("a.mjs", "export const a = 1;\n");
    assert.deepEqual(fileProblems("a.mjs", file), []);
    assert.deepEqual(fileProblems("a.mjs", file.replace("1", "2")), ["a.mjs: was edited"]);
  });

  it("put a Markdown file's marker after its front matter, so `paths:` still loads", () => {
    const file = markFile("rule.md", "---\npaths:\n  - '**/*.ts'\n---\n\n# Rule\n");
    assert.match(file, /^---\npaths:\n {2}- '\*\*\/\*\.ts'\n---\n<!-- baseline-file/);
  });

  it("keep the project's own lines after the blocks, and replace only the blocks", () => {
    const first = withBlocks("secrets/\n", [{ name: "a", body: "one" }]);
    assert.match(first, /^# >>> baseline: a .*\none\n# <<< baseline: a\n\nsecrets\/\n$/);
    const second = withBlocks(first, [{ name: "a", body: "two" }]);
    assert.match(second, /\ntwo\n# <<< baseline: a\n\nsecrets\/\n$/);
    assert.equal(withBlocks(second, [{ name: "a", body: "two" }]), second);
  });
});

describe("a repository with React, Gradle and Python folders", () => {
  it("finds each folder's stack", () => {
    const root = mixedRepo();
    assert.deepEqual(detectAreas(root), [
      { root: "api", stack: "java-gradle" },
      { root: "tools", stack: "python" },
      { root: "web", stack: "react" },
    ]);
  });

  it("ignores test fixtures: sample projects a test copies are not Areas", () => {
    const root = mixedRepo();
    mkdirSync(join(root, "web/test/fixtures/vite"), { recursive: true });
    writeFileSync(
      join(root, "web/test/fixtures/vite/package.json"),
      JSON.stringify({ dependencies: { react: "^19" }, devDependencies: { typescript: "~5.9" } }),
    );
    assert.deepEqual(detectAreas(root).map((area) => area.root), ["api", "tools", "web"]);
  });

  it("puts each stack's .gitignore in its own folder, and the common block at the root", () => {
    const root = mixedRepo();
    setUp(root);
    assert.match(read(root, ".gitignore"), /baseline: gitignore\/common/);
    assert.doesNotMatch(read(root, ".gitignore"), /gitignore\/Python/);
    assert.match(read(root, "tools/.gitignore"), /baseline: gitignore\/Python/);
    assert.match(read(root, "api/.gitignore"), /gitignore\/Gradle[\s\S]*gitignore\/Java/);
    assert.match(read(root, "web/.gitignore"), /baseline: gitignore\/Node/);
  });

  it("writes each stack's hooks, rules and Claude checks", () => {
    const root = mixedRepo();
    setUp(root);
    const hooks = read(root, ".baseline/lefthook.yml");
    assert.match(hooks, /api-format:\n {6}root: "api\/"/);
    assert.match(hooks, /tools-lint:\n {6}root: "tools\/"/);
    assert.match(hooks, /web-lint:\n {6}root: "web\/"/);
    for (const rule of ["baseline", "docs", "writing-style", "typescript", "java", "python"]) {
      assert.ok(read(root, `.claude/rules/${rule}.md`));
    }
    const checks = JSON.parse(read(root, ".baseline/claude-checks.json"));
    assert.deepEqual(checks.areas.map((area) => area.root), ["api", "tools", "web"]);
    assert.match(checks.about, /^Not a Claude Code hooks file/);
    assert.equal(read(root, "lefthook.yml").includes(".baseline/lefthook.yml"), true);
    const settings = JSON.parse(read(root, ".claude/settings.json"));
    assert.deepEqual(settings.enabledPlugins, { "baseline@repo-setup": true });
    assert.deepEqual(
      settings.extraKnownMarketplaces,
      marketplace("https://github.com/janesenaj42/repo-setup.git"),
    );
  });

  it("keeps the repository's own source for the plugin's marketplace", () => {
    const root = mixedRepo();
    const mirror = marketplace("https://gitlab.example/acme/repo-setup.git");
    mkdirSync(join(root, ".claude"));
    writeFileSync(join(root, ".claude/settings.json"), JSON.stringify({ extraKnownMarketplaces: mirror }));
    setUp(root);
    assert.deepEqual(JSON.parse(read(root, ".claude/settings.json")).extraKnownMarketplaces, mirror);
  });

  it("writes no GitHub source for the plugin in a repository on another git host", () => {
    const root = mixedRepo();
    execFileSync("git", ["remote", "set-url", "origin", "git@gitlab.example:acme/app.git"], { cwd: root });
    const warnings = plan(root).entries.filter((e) => e.symbol === "!").map((e) => e.text);
    assert.ok(warnings.some((text) => text.includes("--marketplace")));
    setUp(root);
    assert.equal(JSON.parse(read(root, ".claude/settings.json")).extraKnownMarketplaces, undefined);
    const url = "https://gitlab.example/acme/repo-setup.git";
    setUp(root, { marketplace: url });
    assert.deepEqual(JSON.parse(read(root, ".claude/settings.json")).extraKnownMarketplaces, marketplace(url));
  });

  it("keeps Prettier off the files it owns when the repository uses Prettier", () => {
    const root = mixedRepo();
    setUp(root);
    assert.match(read(root, ".prettierignore"), /baseline: prettierignore\/common[\s\S]*\.claude\/rules\//);
  });

  it("gives a nested folder's Prettier the root's ignore files, which it doesn't read itself", () => {
    const root = mixedRepo();
    mkdirSync(join(root, "packages/ui"), { recursive: true });
    writeFileSync(join(root, "packages/ui/package.json"), JSON.stringify({ devDependencies: { typescript: "~5.9" } }));
    setUp(root);
    const ignores = (up) =>
      `--ignore-path .gitignore --ignore-path .prettierignore --ignore-path ${up}.gitignore --ignore-path ${up}.prettierignore`;
    const hooks = read(root, ".baseline/lefthook.yml");
    assert.match(hooks, new RegExp(`web-format:[\\s\\S]*?run: npx --no -- prettier ${ignores("../")} --check`));
    assert.match(hooks, new RegExp(`packages-ui-format:[\\s\\S]*?prettier ${ignores("../../")} --check`));
    const checks = JSON.parse(read(root, ".baseline/claude-checks.json"));
    const web = checks.areas.find((area) => area.root === "web");
    assert.deepEqual(web.onEdit[0].run.slice(3, 6), ["prettier", "--ignore-path", ".gitignore"]);
    assert.deepEqual(web.onEdit[1].run, [
      "npx",
      "--no",
      "--",
      "eslint",
      "--fix",
      "--max-warnings",
      "0",
      "--no-warn-ignored",
      "{file}",
    ]);
  });

  it("lists lefthook's build script as not allowed when pnpm installs the root", () => {
    const root = mixedRepo();
    setUp(root, { packageManager: "pnpm" });
    assert.match(read(root, "pnpm-workspace.yaml"), /^allowBuilds:\n {2}lefthook: false$/m);
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - web\n");
    setUp(root, { packageManager: "pnpm" });
    assert.equal(read(root, "pnpm-workspace.yaml"), "packages:\n  - web\n\nallowBuilds:\n  lefthook: false\n");
  });

  it("writes no pnpm-workspace.yaml when npm installs the root", () => {
    const root = mixedRepo();
    setUp(root, { packageManager: "npm" });
    assert.equal(existsSync(join(root, "pnpm-workspace.yaml")), false);
  });

  it("takes the root's package manager from its lockfile", () => {
    const root = mixedRepo();
    const areas = detectAreas(root);
    writeFileSync(join(root, "package-lock.json"), "{}\n");
    assert.equal(packageManager(root, areas), "npm");
    writeFileSync(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    assert.equal(packageManager(root, areas), "pnpm");
  });

  it("changes nothing when run again, and passes its own check", () => {
    const root = mixedRepo();
    setUp(root);
    assert.deepEqual(plan(root).entries, []);
    execFileSync("git", ["add", "-A"], { cwd: root });
    const cwd = process.cwd();
    process.chdir(root);
    try {
      assert.deepEqual(check(), []);
    } finally {
      process.chdir(cwd);
    }
  });

  it("keeps the project's own file at a baseline path unless forced", () => {
    const root = mixedRepo();
    mkdirSync(join(root, ".claude/rules"), { recursive: true });
    writeFileSync(join(root, ".claude/rules/docs.md"), "# Our docs rules\n");
    const result = plan(root);
    result.apply();
    assert.equal(read(root, ".claude/rules/docs.md"), "# Our docs rules\n");
    assert.ok(result.entries.some((e) => e.symbol === "!" && e.text.startsWith(".claude/rules/docs.md")));
    setUp(root, { force: true });
    assert.match(read(root, ".claude/rules/docs.md"), /baseline-file sha256:/);
  });

  it("restores a hand edit to a Baseline File", () => {
    const root = mixedRepo();
    setUp(root);
    const path = join(root, ".claude/rules/docs.md");
    writeFileSync(path, `${readFileSync(path, "utf8")}\nOur extra rule.\n`);
    const result = plan(root);
    assert.ok(result.entries.some((e) => e.text === ".claude/rules/docs.md (restoring a hand edit)"));
  });

  it("removes the checks earlier versions wrote to scripts/checks/, and keeps the project's own", () => {
    const root = mixedRepo();
    mkdirSync(join(root, "scripts/checks"), { recursive: true });
    writeFileSync(join(root, "scripts/checks/baseline.mjs"), markFile("baseline.mjs", "// old\n"));
    writeFileSync(join(root, "scripts/checks/json-valid.mjs"), markFile("json-valid.mjs", "// old\n"));
    writeFileSync(join(root, "scripts/checks/our-check.mjs"), "// ours\n");
    setUp(root);
    assert.throws(() => read(root, "scripts/checks/baseline.mjs"));
    assert.throws(() => read(root, "scripts/checks/json-valid.mjs"));
    assert.equal(read(root, "scripts/checks/our-check.mjs"), "// ours\n");
    assert.match(read(root, ".baseline/checks/baseline.mjs"), /baseline-file sha256:/);
    assert.match(read(root, ".baseline/lefthook.yml"), /run: node \.baseline\/checks\/baseline\.mjs/);
  });

  it("removes the Claude checks earlier versions wrote to .claude/hooks/", () => {
    const root = mixedRepo();
    mkdirSync(join(root, ".claude/hooks"), { recursive: true });
    writeFileSync(join(root, ".claude/hooks/checks.json"), markFile("checks.json", '{\n  "areas": []\n}\n'));
    setUp(root);
    assert.equal(existsSync(join(root, ".claude/hooks/checks.json")), false);
    assert.ok(JSON.parse(read(root, ".baseline/claude-checks.json")).areas.length);
  });

  it("removes scripts/ when the old checks were all it held", () => {
    const root = mixedRepo();
    mkdirSync(join(root, "scripts/checks"), { recursive: true });
    writeFileSync(join(root, "scripts/checks/branch-name.mjs"), markFile("branch-name.mjs", "// old\n"));
    setUp(root);
    assert.equal(existsSync(join(root, "scripts")), false);
  });

  it("leaves hooks alone when another hook runner owns them", () => {
    const root = mixedRepo();
    mkdirSync(join(root, ".husky"));
    const result = plan(root);
    result.apply();
    assert.ok(result.entries.some((e) => e.symbol === "!" && e.text.includes("husky")));
    assert.throws(() => read(root, "lefthook.yml"));
  });
});

describe("a single-project repository", () => {
  it("puts the stack's .gitignore blocks at the root", () => {
    const root = mixedRepo();
    const single = mkdtempSync(join(tmpdir(), "repo-setup-single-"));
    cpSync(join(root, "tools"), single, { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: single });
    setUp(single);
    assert.match(read(single, ".gitignore"), /gitignore\/common[\s\S]*gitignore\/Python/);
  });

  it("names a new package.json after the origin remote, or the folder without one", () => {
    const single = mkdtempSync(join(tmpdir(), "repo-setup-single-"));
    execFileSync("git", ["init", "-q"], { cwd: single });
    assert.equal(repositoryName(single), basename(single).toLowerCase());
    const urls = ["https://github.com/janesenaj42/assets.git", "git@gitlab.example:web/assets.git", "https://x/Assets/"];
    execFileSync("git", ["remote", "add", "origin", urls[0]], { cwd: single });
    for (const url of urls) {
      execFileSync("git", ["remote", "set-url", "origin", url], { cwd: single });
      assert.equal(repositoryName(single), "assets");
    }
    setUp(single);
    assert.equal(JSON.parse(read(single, "package.json")).name, "assets");
  });

  it("runs Prettier at the root with its default ignore files", () => {
    const single = mkdtempSync(join(tmpdir(), "repo-setup-single-"));
    execFileSync("git", ["init", "-q"], { cwd: single });
    writeFileSync(join(single, "package.json"), JSON.stringify({ devDependencies: { typescript: "~5.9" } }));
    setUp(single);
    assert.match(read(single, ".baseline/lefthook.yml"), /run: npx --no -- prettier --check/);
    assert.doesNotMatch(read(single, ".baseline/claude-checks.json"), /--ignore-path/);
  });
});

/** A git repository whose `app` folder is a TypeScript workspace root with ESLint and Prettier. */
function workspaceRepo() {
  const root = mkdtempSync(join(tmpdir(), "repo-setup-own-"));
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", "git@github.com:janesenaj42/own.git"], { cwd: root });
  mkdirSync(join(root, "app/mfes/chat"), { recursive: true });
  writeFileSync(
    join(root, "app/package.json"),
    JSON.stringify({
      workspaces: ["mfes/*"],
      scripts: { typecheck: "tsc", test: "vitest" },
      devDependencies: { typescript: "~5.9", eslint: "^9", prettier: "^3" },
    }),
  );
  writeFileSync(join(root, "app/mfes/chat/package.json"), JSON.stringify({ name: "chat" }));
  return root;
}

describe("a repository that already has its own setup", () => {
  it("reads the command names lefthook.yml defines under each hook", () => {
    const yaml = [
      "extends:",
      "  - .baseline/lefthook.yml",
      "pre-commit:",
      "  parallel: true",
      "  commands:",
      "    json-valid:",
      '      glob: "*.json"',
      "      run: node ours.mjs",
      "    app-lint:",
      "      root: app/",
      "pre-push:",
      "  commands:",
      "    branch-name:",
      "      run: node .lefthook/branch-name.mjs",
    ].join("\n");
    assert.deepEqual(ownHookCommands(yaml), {
      "pre-commit": new Set(["json-valid", "app-lint"]),
      "pre-push": new Set(["branch-name"]),
    });
  });

  it("leaves out the baseline's commands that lefthook.yml replaces, since lefthook runs the extended file's", () => {
    const root = workspaceRepo();
    writeFileSync(
      join(root, "lefthook.yml"),
      "pre-commit:\n  commands:\n    app-lint:\n      root: app/\n      run: npm run lint\npre-push:\n  commands:\n    branch-name:\n      run: node ours.mjs\n",
    );
    setUp(root);
    const hooks = read(root, ".baseline/lefthook.yml");
    assert.doesNotMatch(hooks, /app-lint:/);
    assert.doesNotMatch(hooks, /branch-name:/);
    assert.match(hooks, /pre-push:\n {2}commands:\n {4}app-test:\n {6}root: "app\/"\n {6}glob: "\*"\n {6}run: npm run test\n/);
    assert.match(hooks, /app-format:/);
    assert.match(hooks, /json-valid:/);
    assert.match(read(root, "lefthook.yml"), /^extends:\n {2}- \.baseline\/lefthook\.yml\n/);
    assert.deepEqual(plan(root).entries, []);
  });

  it("lists what --force overrides: your files, and lefthook.yml commands the baseline outranks", () => {
    const root = workspaceRepo();
    writeFileSync(join(root, "lefthook.yml"), "pre-commit:\n  commands:\n    app-lint:\n      run: ours\n");
    mkdirSync(join(root, ".claude/rules"), { recursive: true });
    writeFileSync(join(root, ".claude/rules/docs.md"), "# Ours\n");
    assert.deepEqual(plan(root).forced, []);
    const forced = plan(root, { force: true });
    assert.deepEqual(
      forced.forced.map((item) => item.path ?? `${item.hook}.${item.name}`),
      ["pre-commit.app-lint", ".claude/rules/docs.md"],
    );
    assert.equal(forced.forced[1].before, "# Ours\n");
    forced.apply();
    assert.match(read(root, ".baseline/lefthook.yml"), /app-lint:/);
  });

  it("keeps the project's own commitlint config, and removes a baseline one beside it", () => {
    const root = workspaceRepo();
    setUp(root);
    assert.match(read(root, "commitlint.config.mjs"), /baseline-file sha256:/);
    writeFileSync(join(root, "commitlint.config.js"), "export default {};\n");
    const result = plan(root);
    result.apply();
    assert.equal(existsSync(join(root, "commitlint.config.mjs")), false);
    assert.ok(result.entries.some((e) => e.symbol === "!" && e.text.startsWith("commitlint.config.js is your")));
  });

  it("writes no CLAUDE.md at the root when the repository keeps it in .claude/", () => {
    const root = workspaceRepo();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude/CLAUDE.md"), "# CLAUDE.md\n");
    setUp(root);
    assert.equal(existsSync(join(root, "CLAUDE.md")), false);
    assert.equal(existsSync(join(root, "CONTEXT.md")), true);
  });

  it("replaces the project's own commitlint config with --force, and lists it in what --force overrides", () => {
    const root = workspaceRepo();
    writeFileSync(join(root, "commitlint.config.js"), "export default {};\n");
    const result = plan(root, { force: true });
    assert.deepEqual(result.forced.map((item) => item.path), ["commitlint.config.js → commitlint.config.mjs"]);
    result.apply();
    assert.equal(existsSync(join(root, "commitlint.config.js")), false);
    assert.match(read(root, "commitlint.config.mjs"), /baseline-file sha256:/);
  });

  it("says when a TypeScript folder has no ESLint or Prettier for its hooks", () => {
    const root = workspaceRepo();
    mkdirSync(join(root, "e2e"));
    writeFileSync(join(root, "e2e/package.json"), JSON.stringify({ devDependencies: { typescript: "~5.9" } }));
    const warnings = plan(root).entries.filter((e) => e.symbol === "!").map((e) => e.text);
    assert.ok(warnings.some((text) => text.startsWith("e2e/ has no eslint or prettier")));
    assert.ok(!warnings.some((text) => text.startsWith("app/")));
  });

  it("checks a browser-test folder on Stop without running its tests, which need the app running", () => {
    const root = workspaceRepo();
    mkdirSync(join(root, "e2e"));
    writeFileSync(
      join(root, "e2e/package.json"),
      JSON.stringify({ devDependencies: { typescript: "~5.9", "@playwright/test": "^1" } }),
    );
    setUp(root);
    const checks = JSON.parse(read(root, ".baseline/claude-checks.json"));
    const stops = Object.fromEntries(checks.areas.map((area) => [area.root, area.onStop.map((c) => c.run.join(" "))]));
    assert.deepEqual(stops.e2e.slice(2), ["npm run typecheck"]);
    assert.deepEqual(stops.app.slice(2), ["npm run typecheck", "npm run test"]);
    assert.doesNotMatch(read(root, ".baseline/lefthook.yml"), /e2e-test:/);
    assert.equal(checks.areas.find((area) => area.root === "e2e").onEdit.length, 2);
  });

  it("says when a folder lacks a script Claude's Stop check or the pre-push hook runs", () => {
    const root = workspaceRepo();
    const warnings = () => plan(root).entries.filter((e) => e.symbol === "!").map((e) => e.text);
    assert.ok(!warnings().some((text) => text.startsWith("app/package.json")));
    const pkg = JSON.parse(read(root, "app/package.json"));
    writeFileSync(join(root, "app/package.json"), JSON.stringify({ ...pkg, scripts: {} }));
    const expected = 'app/package.json has no "typecheck" and "test" script, so Claude\'s Stop check or the pre-push hook fails there until you add them.';
    assert.ok(warnings().includes(expected));
  });

  it("treats a workspace in the same stack as part of its folder's Area", () => {
    const root = workspaceRepo();
    const kit = { name: "ui-kit", scripts: { typecheck: "tsc" }, devDependencies: { typescript: "~5.9" } };
    writeFileSync(join(root, "app/mfes/chat/package.json"), JSON.stringify(kit));
    assert.deepEqual(detectAreas(root).map((area) => area.root), ["app"]);
    assert.ok(!plan(root).entries.some((e) => e.text.startsWith("app/mfes/chat/package.json")));
  });

  it("removes .gitignore blocks from a folder that isn't an Area", () => {
    const root = workspaceRepo();
    setUp(root);
    const blocks = read(root, "app/.gitignore");
    writeFileSync(join(root, "app/mfes/chat/.gitignore"), blocks);
    writeFileSync(join(root, "app/mfes/chat/package.json"), JSON.stringify({ name: "chat" }));
    mkdirSync(join(root, "app/mfes/mail"));
    writeFileSync(join(root, "app/mfes/mail/.gitignore"), `${blocks}\ncoverage/\n`);
    setUp(root);
    assert.equal(existsSync(join(root, "app/mfes/chat/.gitignore")), false);
    assert.equal(read(root, "app/mfes/mail/.gitignore"), "coverage/\n");
    assert.match(read(root, "app/.gitignore"), /# >>> baseline: gitignore\/Node/);
  });

  it("says when .claude/settings.json has Claude hooks of its own", () => {
    const root = workspaceRepo();
    mkdirSync(join(root, ".claude"));
    writeFileSync(
      join(root, ".claude/settings.json"),
      JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "node ours.mjs" }] }] } }),
    );
    const warnings = plan(root).entries.filter((e) => e.symbol === "!").map((e) => e.text);
    assert.ok(warnings.some((text) => text.startsWith(".claude/settings.json has its own Stop hooks")));
  });
});

describe("the Claude Stop hook", () => {
  /**
   * Runs hooks/on-stop.mjs in `root` with each Area's onStop commands made by `commands(record)`;
   * returns, per command that ran, the folder it ran in and its arguments.
   */
  function stopIn(root, commands = (record) => [{ run: record }]) {
    const log = join(root, "ran.log");
    const script = `require("fs").appendFileSync(${JSON.stringify(log)}, [process.cwd().slice(${realpathSync(root).length + 1}), ...process.argv.slice(1)].join(" ") + "\\n")`;
    const checks = JSON.parse(read(root, ".baseline/claude-checks.json"));
    for (const area of checks.areas) area.onStop = commands(["node", "-e", script]);
    writeFileSync(join(root, ".baseline/claude-checks.json"), JSON.stringify(checks));
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--no-verify", "-m", "chore: set up"], { cwd: root });
    return (changed) => {
      writeFileSync(log, "");
      for (const file of changed) writeFileSync(join(root, file), "// changed\n");
      execFileSync("node", [join(process.cwd(), "hooks/on-stop.mjs")], { cwd: root, input: "{}", env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
      execFileSync("git", ["checkout", "-q", "--", "."], { cwd: root });
      execFileSync("git", ["clean", "-qfd", "-e", "ran.log"], { cwd: root });
      return read(root, "ran.log").split("\n").filter(Boolean).sort();
    };
  }

  it("runs in each changed workspace, and in the whole folder for a change outside them", () => {
    const root = workspaceRepo();
    setUp(root);
    const stop = stopIn(root);
    assert.deepEqual(stop(["app/mfes/chat/index.ts"]), ["app/mfes/chat"]);
    assert.deepEqual(stop(["app/mfes/chat/index.ts", "app/vite.config.ts"]), ["app"]);
    assert.deepEqual(stop(["app/README.md"]), []);
  });

  it("gives a command the changed files that match it, and skips it when none do", () => {
    const root = workspaceRepo();
    setUp(root);
    const stop = stopIn(root, (record) => [
      { match: "\\.ts$", run: [...record, "{files}"] },
      { match: "\\.py$", run: [...record, "python"] },
      { run: [...record, "{testFiles}"] },
    ]);
    assert.deepEqual(stop(["app/mfes/chat/index.ts", "app/vite.config.ts", "app/data.json"]), ["app mfes/chat/index.ts vite.config.ts"]);
    assert.deepEqual(stop(["app/mfes/chat/index.ts"]), ["app/mfes/chat index.ts"]);
  });

  it("finds the tests for changed Java and Python files by their names", () => {
    const root = mkdtempSync(join(tmpdir(), "repo-setup-tests-"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    const files = ["src/main/java/a/Foo.java", "src/test/java/a/FooTest.java", "src/tools/bar.py", "tests/test_bar.py", "src/baz.py"];
    for (const file of files) {
      mkdirSync(join(root, dirname(file)), { recursive: true });
      writeFileSync(join(root, file), "");
    }
    assert.deepEqual(relatedTests(root, ["src/main/java/a/Foo.java", "src/tools/bar.py", "src/baz.py"]), ["src/test/java/a/FooTest.java", "tests/test_bar.py"]);
    assert.deepEqual(relatedTests(root, ["tests/test_bar.py"]), ["tests/test_bar.py"]);
    assert.deepEqual(gradleFilters(["src/test/java/a/FooTest.java", "tests/test_bar.py"]), ["--tests", "FooTest"]);
  });

  it("runs the tests that import a changed file when the folder has Vitest or Jest", () => {
    const root = workspaceRepo();
    const pkg = JSON.parse(read(root, "app/package.json"));
    writeFileSync(join(root, "app/mfes/chat/package.json"), JSON.stringify({ name: "chat", devDependencies: { vitest: "^3" } }));
    setUp(root);
    const app = () => JSON.parse(read(root, ".baseline/claude-checks.json")).areas[0].onStop.at(-1).run.join(" ");
    assert.equal(app(), "npx --no -- vitest related --run --passWithNoTests {files}");
    writeFileSync(join(root, "app/mfes/chat/package.json"), JSON.stringify({ name: "chat" }));
    writeFileSync(join(root, "app/package.json"), JSON.stringify({ ...pkg, devDependencies: { ...pkg.devDependencies, jest: "^30" } }));
    setUp(root);
    assert.equal(app(), "npx --no -- jest --findRelatedTests --passWithNoTests {files}");
  });
});

describe("the Claude guard hook", () => {
  /** Runs hooks/guard.mjs on a tool call in `root`; returns its message, or null if allowed. */
  function guard(root, tool_name, tool_input) {
    try {
      execFileSync("node", [join(process.cwd(), "hooks/guard.mjs")], {
        cwd: root,
        input: JSON.stringify({ tool_name, tool_input, cwd: root }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        stdio: "pipe",
      });
      return null;
    } catch (error) {
      assert.equal(error.status, 2);
      return error.stderr.toString();
    }
  }

  it("blocks a commit or push that skips the git hooks", () => {
    const root = workspaceRepo();
    for (const command of ["git commit --no-verify -m x", "git add . && git commit -nm x", "LEFTHOOK=0 git push", "git -c core.hooksPath=/dev/null commit -m x"]) {
      assert.match(guard(root, "Bash", { command }) ?? "", /skips the git hooks/, command);
    }
    for (const command of ['git commit -m "about -n"', "git push -n origin main", "npm test -- --no-verify"]) {
      assert.equal(guard(root, "Bash", { command }), null, command);
    }
  });

  it("blocks reading secrets, and points to .env.example", () => {
    const root = workspaceRepo();
    assert.match(guard(root, "Read", { file_path: join(root, "app/.env.local") }) ?? "", /\.env\.example instead/);
    assert.match(guard(root, "Bash", { command: "cat app/.env | grep KEY" }) ?? "", /may hold secrets/);
    assert.match(guard(root, "Grep", { pattern: "x", path: "certs/server.key" }) ?? "", /may hold secrets/);
    assert.equal(guard(root, "Read", { file_path: join(root, "app/.env.example") }), null);
    assert.equal(guard(root, "Bash", { command: "cp .env.example .env" }), null);
  });

  it("blocks edits to what repo-setup owns, and allows the project's own lines", () => {
    const root = workspaceRepo();
    setUp(root);
    const edit = (file_path, old_string, new_string) => guard(root, "Edit", { file_path: join(root, file_path), old_string, new_string });
    assert.match(edit(".baseline/lefthook.yml", "pre-commit", "pre-commit") ?? "", /is a file repo-setup owns/);
    assert.match(edit(".gitignore", "node_modules/", "deps/") ?? "", /has lines repo-setup owns/);
    const gitignore = read(root, ".gitignore");
    assert.equal(guard(root, "Write", { file_path: join(root, ".gitignore"), content: `${gitignore}secrets/\n` }), null);
    assert.equal(edit("app/package.json", "tsc", "tsc -b"), null);
  });
});

describe("repo-setup's warnings", () => {
  it("says when a .env has no .env.example beside it", () => {
    const root = workspaceRepo();
    writeFileSync(join(root, "app/.env"), "KEY=1\n");
    const warnings = () => plan(root).entries.filter((e) => e.symbol === "!").map((e) => e.text);
    assert.ok(warnings().some((text) => text.startsWith("app/.env has no app/.env.example")));
    writeFileSync(join(root, "app/.env.example"), "KEY=\n");
    assert.ok(!warnings().some((text) => text.includes(".env has no")));
  });
});

describe("the pull request checks", () => {
  const TEMPLATE = ".github/pull_request_template.md";
  const BODY = [
    "Closes #12",
    "## Summary\nAdds CSV export.",
    "## How it was tested\nnpm test",
    "## Deviations and assumptions\nNone",
    "## Definition of Done\n- [x] CI green",
  ].join("\n\n");

  /** The exit code and output of a check run in the repository. */
  function run(root, name, env = {}) {
    try {
      const out = execFileSync("node", [`.baseline/checks/${name}.mjs`], {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: "utf8",
        stdio: "pipe",
      });
      return { code: 0, out };
    } catch (error) {
      return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
  }

  const SECTIONS = "## Summary\n\n## How it was tested\n\n## Screenshots (optional)\n\n## Deviations and assumptions\n\n## Definition of Done\n";

  /** A repository set up with the PR template at path, or none. */
  function repoWithTemplate(path = TEMPLATE) {
    const root = mixedRepo();
    setUp(root);
    if (path) {
      mkdirSync(join(root, dirname(path)), { recursive: true });
      writeFileSync(join(root, path), `Closes #\n\n${SECTIONS}`);
    }
    return root;
  }

  it("writes no PR template, so the organization's default one applies", () => {
    assert.ok(!existsSync(join(repoWithTemplate(null), TEMPLATE)));
  });

  it("checks against the organization's template in PR_TEMPLATE when the repository has none", () => {
    const root = repoWithTemplate(null);
    const orgTemplate = join(root, "..", `${basename(root)}-org-template.md`);
    writeFileSync(orgTemplate, SECTIONS);
    const result = run(root, "pr-description", { PR_BODY: "Closes #12\n\n## Summary\nx", PR_TEMPLATE: orgTemplate });
    assert.equal(result.code, 1);
    assert.match(result.out, /organization's PR template/);
    assert.equal(run(root, "pr-description", { PR_BODY: BODY, PR_TEMPLATE: orgTemplate }).code, 0);
    assert.equal(run(root, "pr-description", { PR_BODY: "Closes #12" }).code, 0);
  });

  it("prefers the repository's own template, in any place GitHub reads, over PR_TEMPLATE", () => {
    const root = repoWithTemplate("docs/PULL_REQUEST_TEMPLATE.md");
    const orgTemplate = join(root, "..", `${basename(root)}-org-template.md`);
    writeFileSync(orgTemplate, "## Something else\n");
    assert.equal(run(root, "pr-description", { PR_BODY: BODY, PR_TEMPLATE: orgTemplate }).code, 0);
  });

  it("passes a description that follows the template and leaves out an optional section", () => {
    const root = repoWithTemplate();
    assert.equal(run(root, "pr-description", { PR_BODY: BODY }).code, 0);
    assert.equal(run(root, "pr-description", { PR_BODY: BODY.replace("Closes #12", "No issue: hotfix") }).code, 0);
  });

  it("names each problem in a description that doesn't follow the template", () => {
    const root = repoWithTemplate();
    const result = run(root, "pr-description", {
      PR_BODY: BODY.replace("Closes #12", "Adds export").replace("npm test", "").replace(/## Deviations[^#]*/, ""),
    });
    assert.equal(result.code, 1);
    assert.match(result.out, /Start with "Closes #<issue>"/);
    assert.match(result.out, /"## How it was tested" is empty/);
    assert.match(result.out, /Missing "## Deviations and assumptions"/);
  });

  it("skips the description of a PR a dependency bot opened", () => {
    const root = mixedRepo();
    setUp(root);
    assert.equal(run(root, "pr-description", { PR_BODY: "Bumps x", BRANCH: "dependabot/npm/x-2" }).code, 0);
  });

  it("fails on a relative Markdown link to a file that doesn't exist, and ignores code blocks", () => {
    const root = mixedRepo();
    setUp(root);
    writeFileSync(join(root, "README.md"), "[ADRs](docs/adr/template.md#top) [web](https://x.dev)\n```\n[x](gone.md)\n```\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    assert.equal(run(root, "markdown-links").code, 0);
    writeFileSync(join(root, "README.md"), "[Setup](docs/setup.md)\n");
    const result = run(root, "markdown-links");
    assert.equal(result.code, 1);
    assert.match(result.out, /README\.md: docs\/setup\.md/);
  });

  it("skips inline code and the files listed in .markdown-links-ignore", () => {
    const root = mixedRepo();
    setUp(root);
    mkdirSync(join(root, "templates"));
    writeFileSync(join(root, "templates", "readme.md"), "[Changelog](CHANGELOG.md)\n");
    writeFileSync(join(root, "README.md"), "Write `[Guide](docs/guide.md)` for a relative link.\n");
    execFileSync("git", ["add", "-A"], { cwd: root });
    assert.equal(run(root, "markdown-links").code, 1);
    writeFileSync(join(root, ".markdown-links-ignore"), "# copied into other repos\ntemplates/\n");
    assert.equal(run(root, "markdown-links").code, 0);
  });
});
