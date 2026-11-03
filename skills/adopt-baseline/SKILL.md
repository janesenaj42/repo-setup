---
name: adopt-baseline
description: Set up or update a repository with the org's baseline (git files, git hooks, commit checks, lint config, Claude rules and hooks) for React, TypeScript, Java (Gradle) and Python, then do the parts that need reading the repository - merging CLAUDE.md, merging lint config into build files, moving another hook runner's hooks, and fixing what the new rules report. Use when the user wants to adopt, apply, install or update the baseline, or set up a repo's conventions or hooks.
---

# Adopt the baseline

`repo-setup` does every mechanical step; this skill does what needs reading the repository. The
**baseline** is this plugin's root, two levels up from this skill's folder, or `$BASELINE_REPO`
if set (a checkout, to try unpublished changes). The **target** is the repo the user names, or
the current one.

Never overwrite a target file without showing the diff and getting a yes.

## 1. Run repo-setup

1. On a new branch, in the target: `npx @janesenaj42/repo-setup --dry-run` (or
   `node <baseline>/cli/repo-setup.mjs --dry-run`). Show the user the output.
2. With their yes, run it without `--dry-run`. It writes the git files, hooks, checks, rules and
   Claude settings, and runs init-react in each React folder.
3. Every line marked `!` and every `i` line under "Lint setup to merge" is yours: steps 2 to 4.

## 2. CLAUDE.md

The shared rules are in `.claude/rules/baseline.md`, which loads in every session; `CLAUDE.md`
holds only this repository's facts.

1. If the target had its own `CLAUDE.md`, remove the sections `baseline.md` now covers (single
   source of truth, language, commits and branches, code review standards), and keep the rest.
2. Fill its "Where each fact lives" table with the target's real files; delete rows that don't
   apply; no `<...>` left.
3. Fill `CONTEXT.md`'s name and description from the README, if repo-setup just created it.
4. After step 3 below, search the target's Markdown for every file this adoption removed or
   replaced (for example a removed `.claude/hooks/*.mjs`, or Claude's hooks moving from
   `.claude/settings.json` to `.baseline/claude-checks.json`). Point each mention at the file that
   now holds the fact, and add the trust note where a doc says when Claude's hooks run: they
   load only after the developer trusts the folder in Claude Code's prompt.

## 3. What repo-setup left to you

| Line it printed | What to do |
|---|---|
| `i <folder>/ (ts \| java-gradle \| python): <fragment>` | Merge `<baseline>/baseline/fragments/<stack>/` into that folder's build file (`eslint.config.js`, `build.gradle.kts`, `pyproject.toml`), keeping everything the target has. Ask where they disagree |
| `! <path>: your own file, kept` | Compare it with `<baseline>/baseline/files/<path>`. If the target's version has nothing the baseline lacks, run `--force --dry-run`, show the user the diff it prints, and only with their OK run `--force --yes`; otherwise ask the user |
| `! Git hooks run through husky / core.hooksPath` | Show the user each hook script. Either move its commands into `lefthook.yml` and remove husky, or append the baseline's commands to the existing hooks as `<baseline>/baseline/husky/README.md` says. Never run two hook runners |
| `! lefthook.yml already extends other files` | Add `.baseline/lefthook.yml` to its `extends` list |
| `! package.json scripts.prepare is ...` | Add `lefthook install` to it |
| `! pnpm-workspace.yaml has allowBuilds` | Add `lefthook: false` under its `allowBuilds` |
| `! init-react failed in <folder>/` | Usually a missing registry token (`~/.npmrc`) or mirror (`--registry`); fix it and re-run |
| `! <file> is your commitlint config, kept` | Check it extends `@commitlint/config-conventional`; if not, ask the user whether to add it |
| `! <folder>/ has no eslint or prettier` | Add them as devDependencies of that folder with its package manager, then merge the lint fragment as for an `i` line |
| `! <folder>/package.json has no "<script>" script` | Ask the user what the script should run (e.g. `tsc --noEmit`, `vitest run`); never add one that does nothing |
| `! .claude/settings.json has its own ... hooks` | Read each hook script. Where it formats, lints, typechecks or tests files an Area in `.baseline/claude-checks.json` covers, show the user both and ask whether to remove the project's hook; if removed, update the docs that name it (step 2.4) |

If the new lint rules report errors in existing code, show the count and ask: fix them now, or
open an issue to fix them first.

## 4. Verify

Run each and report pass or fail with the output; fix what fails before reporting done:

1. The install command repo-setup printed (`pnpm install` or `npm install`) at the root (installs the hooks through `prepare`).
2. `node .baseline/checks/baseline.mjs`: passes.
3. `printf 'feat: x\n' | npx commitlint` passes; `printf 'bad\n' | npx commitlint` fails.
4. Every `onEdit` and `onStop` command in `.baseline/claude-checks.json`, run by hand in its folder
   with one source file of that folder in place of `{file}`, `{files}` or `{testFiles}`, and its test
   class in place of `{testClasses}`.
5. Each `pre-push` command in `.baseline/lefthook.yml`, run by hand in its folder.
6. Commit on a valid branch (`<type>/<issue>/<slug>`): the hooks run and pass. Then stage a file
   with invalid JSON and commit: rejected.

## 5. Report

A table: what changed (file), verified how. Then what's left for the user:

1. For the CI team: per folder, the lint, format and typecheck commands from
   `.baseline/lefthook.yml`; commitlint on the PR/MR title; `node .baseline/checks/branch-name.mjs`
   on the branch; `node .baseline/checks/baseline.mjs`. Git hooks can be skipped, so CI runs them too.
2. On-prem: run `npx @janesenaj42/repo-setup --marketplace <git URL of the repo-setup mirror>`
   once, so Claude Code loads the plugin for each developer who trusts the folder.
3. Squash merging with the title as the commit: the default on GitHub; on GitLab, set "Squash
   commits when merging" to required and the squash commit template to `%{title}`.
