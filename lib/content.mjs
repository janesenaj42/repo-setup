// What a repository should contain, from its Areas: the Baseline Blocks for .gitignore,
// .gitattributes and .editorconfig, and the Baseline Files. Nothing here writes files.
import { readFileSync } from "node:fs";
import { STACKS, stacksIn, stopChecks } from "./stacks.mjs";

const BASELINE = new URL("../baseline/", import.meta.url);
const read = (path) => readFileSync(new URL(path, BASELINE), "utf8");

const COMMON_GITIGNORE = `# The git hook tools every repository installs (package.json at the root)
node_modules/

# OS and editor files
.DS_Store
Thumbs.db
*.swp
.idea/
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json

# Secrets
.env
.env.*
!.env.example

# Personal Claude Code settings
.claude/settings.local.json
CLAUDE.local.md
.claude/scheduled_tasks.lock`;

const COMMON_GITATTRIBUTES = `* text=auto
# Scripts that run on Linux (containers, CI) keep LF line endings, even in a Windows checkout
# with core.autocrlf: with CRLF, \`#!/bin/sh\` asks for \`sh\\r\`, which doesn't exist.
*.sh text eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.png binary
*.jpg binary
*.gif binary
*.ico binary
*.pdf binary`;

const COMMON_EDITORCONFIG = `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 2

[*.md]
trim_trailing_whitespace = false

[{Makefile,*.mk}]
indent_style = tab

[*.{bat,cmd}]
end_of_line = crlf`;

const COMMITLINT = `// Conventional Commits, with commitlint's defaults.
export default { extends: ["@commitlint/config-conventional"] };
`;

// Prettier would reformat the files repo-setup owns, which the baseline check then rejects.
const PRETTIERIGNORE = `.baseline/
.claude/rules/
docs/adr/template.md
commitlint.config.mjs`;

/** One stack's .gitignore blocks: GitHub's templates for it. */
const gitignoreBlocks = (stack) =>
  STACKS[stack].gitignore.map((name) => ({ name: `gitignore/${name}`, body: read(`gitignore/${name}.gitignore`) }));

/**
 * The blocks each block file gets: the common block first, then one per stack present. A stack's
 * .gitignore blocks go in its own folder's .gitignore, because GitHub's templates ignore folders
 * by name (Python's ignores `lib/` and `build/` anywhere), which would hide another stack's files.
 */
export function blocksFor(areas, { prettier = false } = {}) {
  const stacks = stacksIn(areas);
  const atRoot = areas.filter((area) => area.root === ".").map((area) => area.stack);
  const nested = Object.fromEntries(
    areas.filter((area) => area.root !== ".").map((area) => [`${area.root}/.gitignore`, gitignoreBlocks(area.stack)]),
  );
  const perStack = (key) =>
    stacks
      .filter((stack) => STACKS[stack][key])
      .map((stack) => ({ name: `${key}/${stack}`, body: STACKS[stack][key].join("\n") }));
  return {
    ".gitignore": [{ name: "gitignore/common", body: COMMON_GITIGNORE }, ...atRoot.flatMap(gitignoreBlocks)],
    ...nested,
    ".gitattributes": [{ name: "gitattributes/common", body: COMMON_GITATTRIBUTES }, ...perStack("gitattributes")],
    ".editorconfig": [{ name: "editorconfig/common", body: COMMON_EDITORCONFIG }, ...perStack("editorconfig")],
    ...(prettier ? { ".prettierignore": [{ name: "prettierignore/common", body: PRETTIERIGNORE }] } : {}),
  };
}

/**
 * Prettier reads `.gitignore` and `.prettierignore` only from the folder it runs in, and an Area's
 * commands run in the Area's folder. A nested Area's Prettier also gets the root's ignore files,
 * so lines a project adds there (e.g. `CHANGELOG.md`) apply to it too.
 */
function prettierIgnoreArgs(area) {
  if (area.root === ".") return [];
  const up = "../".repeat(area.root.split("/").length);
  return [".gitignore", ".prettierignore", `${up}.gitignore`, `${up}.prettierignore`].flatMap((file) => [
    "--ignore-path",
    file,
  ]);
}

/** A hook command (a string) or a Claude command (an argument list), with prettierIgnoreArgs. */
function withPrettierIgnores(area, run) {
  const args = prettierIgnoreArgs(area);
  if (args.length === 0) return run;
  if (typeof run === "string") return run.replace(/(^|\s)prettier(?=\s)/, `$1prettier ${args.join(" ")}`);
  return run.flatMap((arg) => (arg === "prettier" ? [arg, ...args] : [arg]));
}

/** A name for an Area's commands, unique in the repository. */
const areaName = (area) => (area.root === "." ? area.stack : area.root.replace(/\//g, "-"));

/** The commands every repository gets, by hook: [name, lines under the name]. */
const COMMON_HOOKS = {
  "commit-msg": [["conventional-commit", ["run: npx --no -- commitlint --edit {1}"]]],
  "pre-push": [["branch-name", ["run: node .baseline/checks/branch-name.mjs"]]],
  "pre-commit": [
    ["baseline", ["run: node .baseline/checks/baseline.mjs"]],
    ["json-valid", ['glob: "*.{json,jsonc}"', "run: node .baseline/checks/json-valid.mjs {staged_files}"]],
  ],
};

/**
 * lefthook merges an extended file after lefthook.yml, so a command here would replace the
 * project's own command of the same name. `own` ({ hook: Set of names }, from lefthook.yml) lists
 * the project's commands; the baseline leaves those out, so the project's run instead.
 */
function lefthookFor(areas, own = {}) {
  const hooks = structuredClone(COMMON_HOOKS);
  for (const area of areas) {
    const root = area.root === "." ? [] : [`root: "${area.root}/"`];
    for (const [hook, { glob, run }] of Object.entries(STACKS[area.stack].hooks)) {
      hooks["pre-commit"].push([`${areaName(area)}-${hook}`, [...root, `glob: "${glob}"`, `run: ${withPrettierIgnores(area, run)}`]]);
    }
    // The full unit tests, only when the push changes a file in the Area: a glob makes lefthook
    // match the pushed files against the root (a new branch's push matches every file).
    if (!area.browserTests) {
      hooks["pre-push"].push([`${areaName(area)}-test`, [...root, 'glob: "*"', `run: ${STACKS[area.stack].prePush}`]]);
    }
  }
  const sections = Object.entries(hooks)
    .map(([hook, commands]) => [hook, commands.filter(([name]) => !own[hook]?.has(name))])
    .filter(([, commands]) => commands.length > 0)
    .map(([hook, commands]) =>
      [
        `${hook}:`,
        ...(hook === "pre-commit" ? ["  parallel: true"] : []),
        "  commands:",
        ...commands.flatMap(([name, lines]) => [`    ${name}:`, ...lines.map((line) => `      ${line}`)]),
      ].join("\n"),
    );
  return `# Git hooks every repository gets. Your own commands go in lefthook.yml, which extends this
# file. lefthook lets this file win over lefthook.yml, so repo-setup leaves out a command that
# lefthook.yml already has under the same hook and name: give yours the same name to replace one,
# then re-run repo-setup.
${sections.join("\n\n")}
`;
}

/** Says what .baseline/claude-checks.json is: its onEdit and onStop keys read like hook events. */
const CHECKS_ABOUT =
  "Not a Claude Code hooks file: the commands the baseline plugin's hooks run. Its PostToolUse hook runs onEdit after each edit, its Stop hook runs onStop before a turn ends. Format: hooks/run.mjs in repo-setup.";

function checksFor(areas) {
  const config = {
    about: CHECKS_ABOUT,
    areas: areas.map((area) => {
      const checks = STACKS[area.stack].checks;
      const onEdit = checks.onEdit.map((command) => ({ ...command, run: withPrettierIgnores(area, command.run) }));
      const onStop = stopChecks(area).map((command) => ({ ...command, run: withPrettierIgnores(area, command.run) }));
      return { name: areaName(area), root: area.root, onEdit, onStop };
    }),
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/**
 * Every Baseline File: { path, content } with paths from the repository root. ownHooks: the
 * project's own lefthook.yml commands (lefthookFor).
 */
export function filesFor(areas, { ownHooks = {} } = {}) {
  const rules = ["baseline", "docs", "writing-style", ...new Set(stacksIn(areas).flatMap((s) => STACKS[s].rules))];
  return [
    ...["baseline", "branch-name", "json-valid", "markdown-links", "pr-description"].map(
      (name) => `.baseline/checks/${name}.mjs`,
    ),
    ...rules.map((name) => `.claude/rules/${name}.md`),
    "docs/adr/template.md",
  ]
    .map((path) => ({ path, content: read(`files/${path}`) }))
    .concat([
      { path: "commitlint.config.mjs", content: COMMITLINT },
      { path: ".baseline/lefthook.yml", content: lefthookFor(areas, ownHooks) },
      { path: ".baseline/claude-checks.json", content: checksFor(areas) },
    ]);
}

/**
 * Files written only when the repository has none: they are the project's own from then on.
 * alsoAt: other paths that count as having one (Claude Code also reads .claude/CLAUDE.md).
 */
export function starterFiles() {
  return [
    { path: "CLAUDE.md", alsoAt: [".claude/CLAUDE.md"] },
    { path: "CONTEXT.md", alsoAt: [] },
  ].map((file) => ({ ...file, content: read(`new/${file.path}`) }));
}
