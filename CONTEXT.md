# repo-setup

A CLI and Claude Code plugin that set up and update any repository with the org's baseline.

## Language

**Target Repository**:
The git repository repo-setup runs in. It may hold several Areas, in different stacks.
_Avoid_: project (an Area is often called that)

**Area**:
A folder of the Target Repository with its own stack and checks, listed in
`.baseline/claude-checks.json`. A single-project repository has one Area: the repository root.
A workspace of a folder in the same stack belongs to that folder's Area, not to an Area of its own.
_Avoid_: "module", "package" (both mean something specific in most stacks)

**Stack**:
The kind of an Area, detected from its build file: react, ts, java-gradle or python. It decides
what the Area gets.

**Baseline Block**:
Lines in a project file (e.g. `.gitignore`) that the baseline owns, between a start and an end
marker. Only the baseline changes them. Blocks come first in the file; the project's own lines go
after them and may override them.
_Avoid_: "template" (a template is copied once and then drifts)

**Baseline File**:
A whole project file the baseline owns (e.g. `.baseline/checks/branch-name.mjs`), with no project
lines in it. Only the baseline changes it; a project that needs something else adds its own file
beside it.
_Avoid_: "template"

**Starter File**:
A file repo-setup writes only when the Target Repository has none (`CLAUDE.md`, `CONTEXT.md`).
From then on it is the repository's own.

## Relationships

- A **Baseline Block** or **Baseline File** carries the hash of what repo-setup wrote; the
  pre-commit check rejects any change to it, and re-running repo-setup restores and updates it
- An **Area**'s **Stack** decides its `.gitignore` blocks (in the Area's own folder), its
  pre-commit and Claude hook commands, and the stack rules for Claude
- Git hooks and commit checks are the repository's, set up for every **Stack** alike; ESLint and
  Prettier for react **Areas** come from init-react (janesenaj42/frontend-dev-config)
