# CLAUDE.md

<!-- Written by repo-setup because this repository had no CLAUDE.md. It is this repository's own
     file: fill it in, keep it current, and delete this comment. The org's shared rules are in
     .claude/rules/baseline.md, which loads in every session. -->

## Where each fact lives

| Fact | Lives in |
|---|---|
| Git hooks and the commands they run | `lefthook.yml`, which extends `.baseline/lefthook.yml` |
| Commands Claude's hooks run after an edit and before a turn ends | `.baseline/claude-checks.json` |
| Tool versions | `package.json`, <build file: `build.gradle.kts`, `pyproject.toml`> |
| <fact> | <file> |
| Vocabulary | `CONTEXT.md` |
| Why things are the way they are | `docs/adr/` |

## Commands

<!-- How to build, test and run this repository, if its README doesn't say. -->
