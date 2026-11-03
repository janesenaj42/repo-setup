// What each stack gets, and how a folder's stack is detected. The README's "What each stack
// gets" table points here: this file is the source.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { workspaces } from "./workspaces.mjs";

const NODE_LINT = "*.{ts,tsx,js,jsx,mjs,cjs}";
const NODE_FORMAT = "*.{ts,tsx,js,jsx,mjs,cjs,json,css,scss,md,html,yml,yaml}";
const NODE_SOURCE = "\\.(ts|tsx|js|jsx|mjs|cjs)$";
const PRETTIER = ["npx", "--no", "--", "prettier", "--write", "--ignore-unknown"];
// Fix what ESLint can, then fail on what's left, warnings included, as in CI; a file ESLint
// ignores isn't a problem.
const ESLINT = ["npx", "--no", "--", "eslint", "--fix", "--max-warnings", "0", "--no-warn-ignored"];
// A folder without the script fails, and repo-setup says so (apply.mjs); only a workspace inside
// the folder may leave one out (hooks/on-stop.mjs).
const NPM_TYPECHECK = { run: ["npm", "run", "typecheck"] };
const NPM_TEST = { run: ["npm", "run", "test"] };
// Browser test runners: their tests need the running app and its services, which neither a
// turn's end nor a push can assume, so they're left to the developer and CI.
const BROWSER_TESTS = ["@playwright/test", "playwright", "cypress"];
// The tests that import a changed file, by the test runner the folder has; any other runs them all.
const RELATED_TESTS = {
  vitest: { match: NODE_SOURCE, run: ["npx", "--no", "--", "vitest", "related", "--run", "--passWithNoTests", "{files}"] },
  jest: { match: NODE_SOURCE, run: ["npx", "--no", "--", "jest", "--findRelatedTests", "--passWithNoTests", "{files}"] },
};

/** Pre-commit commands for ESLint and Prettier, shared by both Node stacks. */
const nodeHooks = {
  lint: { glob: NODE_LINT, run: "npx --no -- eslint {staged_files}" },
  format: { glob: NODE_FORMAT, run: "npx --no -- prettier --check --ignore-unknown {staged_files}" },
};

/** Claude's checks for both Node stacks; the Stop hook's tests come from RELATED_TESTS. */
const nodeChecks = {
  onEdit: [{ run: [...PRETTIER, "{file}"] }, { match: NODE_SOURCE, run: [...ESLINT, "{file}"] }],
  onStop: [{ run: [...PRETTIER, "{files}"] }, { match: NODE_SOURCE, run: [...ESLINT, "{files}"] }, NPM_TYPECHECK],
  tests: NPM_TEST,
};

/**
 * Each stack:
 *   gitignore      github/gitignore templates (baseline/gitignore/<name>.gitignore)
 *   gitattributes  lines for .gitattributes
 *   editorconfig   sections for .editorconfig
 *   rules          .claude/rules/<name>.md loaded for this stack's files
 *   hooks          pre-commit commands, run in the folder (lefthook `root`)
 *   prePush        the pre-push command: the full unit tests, run in the folder when a push
 *                  changes a file in it
 *   checks         Claude hook commands (.baseline/claude-checks.json; format: hooks/run.mjs). onStop
 *                  checks only what the turn changed; `tests` is the last onStop command (a Node
 *                  folder's runner may replace it, RELATED_TESTS). An Area with browser tests
 *                  (BROWSER_TESTS) gets no tests on Stop or pre-push
 *   lintSetup      how the stack's own lint and format config is set up
 */
export const STACKS = {
  react: {
    gitignore: ["Node"],
    rules: ["typescript"],
    hooks: nodeHooks,
    prePush: "npm run test",
    checks: nodeChecks,
    lintSetup: "init-react (frontend-dev-config): ESLint, Prettier, typecheck",
  },
  ts: {
    gitignore: ["Node"],
    rules: ["typescript"],
    hooks: nodeHooks,
    prePush: "npm run test",
    checks: nodeChecks,
    lintSetup: "baseline/fragments/ts/eslint.config.fragment.js, merged into eslint.config.js",
  },
  "java-gradle": {
    gitignore: ["Gradle", "Java"],
    gitattributes: [
      "# Spotless writes LF; gradlew must stay LF to run in Linux containers and CI.",
      "*.java text eol=lf",
      "gradlew text eol=lf",
      "*.jar binary",
    ],
    // Tabs, width 4: the Eclipse formatter (config/java-formatter.xml) the org's Java repos run in Spotless.
    editorconfig: ["[*.java]", "indent_style = tab", "indent_size = 4", "", "[*.{kt,kts}]", "indent_size = 4"],
    rules: ["java"],
    hooks: { format: { glob: "*.java", run: "sh ./gradlew spotlessCheck -q" } },
    // Without the tests, the Testcontainers suites need Docker.
    prePush: "sh ./gradlew check -x test -q",
    checks: {
      onEdit: [
        { match: "\\.java$", run: ["sh", "./gradlew", "spotlessApply", "-q", "-PspotlessIdeHook={absfile}"] },
      ],
      onStop: [{ match: "\\.java$", run: ["sh", "./gradlew", "compileJava", "compileTestJava", "-q"] }],
      tests: { match: "\\.java$", run: ["sh", "./gradlew", "test", "-q", "{testClasses}"] },
    },
    lintSetup:
      "baseline/fragments/java-gradle/build.gradle.fragment.kts (Spotless, Checkstyle), merged into build.gradle.kts",
  },
  python: {
    gitignore: ["Python"],
    editorconfig: ["[*.py]", "indent_size = 4"],
    rules: ["python"],
    hooks: {
      format: { glob: "*.py", run: "uv run ruff format --check {staged_files}" },
      lint: { glob: "*.py", run: "uv run ruff check {staged_files}" },
    },
    // pytest exits 5 when it collects no tests.
    prePush: "uv run pytest -q || test $? -eq 5",
    checks: {
      onEdit: [
        { match: "\\.py$", run: ["uv", "run", "ruff", "check", "--fix", "{file}"] },
        { match: "\\.py$", run: ["uv", "run", "ruff", "format", "{file}"] },
      ],
      onStop: [{ match: "\\.py$", run: ["uv", "run", "mypy", "{files}"] }],
      tests: { match: "\\.py$", run: ["uv", "run", "pytest", "-q", "{testFiles}"], okExitCodes: [0, 5] },
    },
    lintSetup: "baseline/fragments/python/pyproject.fragment.toml (Ruff, mypy), merged into pyproject.toml",
  },
};

/** An Area's Claude Stop commands: the stack's, then its tests unless it has browser tests. */
export function stopChecks(area) {
  const { onStop, tests } = STACKS[area.stack].checks;
  if (area.browserTests) return onStop;
  return [...onStop, RELATED_TESTS[area.testRunner] ?? tests];
}

const MANIFESTS = ["package.json", "build.gradle", "build.gradle.kts", "pyproject.toml"];
// Build output, dependencies, and test fixtures (sample projects a test copies, not Areas).
const SKIP = /(^|\/)(node_modules|dist|build|target|\.venv|venv|\.gradle|fixtures|__fixtures__)\//;

/** The dependencies and devDependencies in the folder `dir`'s package.json, or null without one. */
export function nodeDependencies(dir) {
  const pkgPath = join(dir, "package.json");
  if (!existsSync(pkgPath)) return null;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

/** The stack of the folder `dir` (absolute), or null. */
export function stackOf(dir) {
  const deps = nodeDependencies(dir);
  if (deps) {
    if (deps.typescript && deps.react && !deps.next) return "react";
    if (deps.typescript) return "ts";
  }
  const gradle = ["build.gradle", "build.gradle.kts"].some((f) => existsSync(join(dir, f)));
  if (gradle && existsSync(join(dir, "gradlew"))) return "java-gradle";
  if (existsSync(join(dir, "pyproject.toml"))) return "python";
  return null;
}

/** Every Area in the repository at `root`: { root: "web" or ".", stack, browserTests?, testRunner? }. */
export function detectAreas(root) {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  }).split("\n");
  const dirs = new Set(
    files
      .filter((file) => MANIFESTS.includes(posix.basename(file)) && !SKIP.test(file))
      .map((file) => posix.dirname(file)),
  );
  const areas = [...dirs]
    .sort()
    .map((dir) => ({ root: dir, stack: stackOf(join(root, dir)) }))
    .filter((area) => area.stack !== null);
  return withoutWorkspaces(root, areas).map((area) => withTestRunners(join(root, area.root), area));
}

// A workspace in the same stack is part of its folder's Area: the folder's checks cover it, and
// the Stop hook runs them in each changed workspace (hooks/on-stop.mjs).
function withoutWorkspaces(root, areas) {
  const covered = new Set(
    areas.flatMap((area) =>
      workspaces(join(root, area.root)).map((dir) => `${area.stack}:${posix.join(area.root, dir)}`),
    ),
  );
  return areas.filter((area) => !covered.has(`${area.stack}:${area.root}`));
}

/**
 * Marks an Area with browser tests (BROWSER_TESTS), or with a runner RELATED_TESTS knows, listed
 * in its folder or one of its workspaces.
 */
function withTestRunners(dir, area) {
  const deps = Object.assign({}, ...[".", ...workspaces(dir)].map((ws) => nodeDependencies(join(dir, ws)) ?? {}));
  if (BROWSER_TESTS.some((name) => name in deps)) return { ...area, browserTests: true };
  const testRunner = Object.keys(RELATED_TESTS).find((name) => name in deps);
  return testRunner ? { ...area, testRunner } : area;
}

/** The stacks present, in a fixed order, so generated files don't change with folder names. */
export function stacksIn(areas) {
  const present = new Set(areas.map((area) => area.stack));
  return Object.keys(STACKS).filter((stack) => present.has(stack));
}

