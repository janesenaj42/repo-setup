# CLAUDE.md

The org's shared rules are in `.claude/rules/baseline.md`.

## Where each fact lives

| Fact | Lives in |
|---|---|
| What each stack gets, and how it's detected | `lib/stacks.mjs` |
| The common blocks, `commitlint.config.mjs`, the generated hooks file | `lib/content.mjs` |
| What a Baseline File contains | `baseline/files/<path>` |
| The marker format and the check | `baseline/files/.baseline/checks/baseline.mjs` |
| GitHub's `.gitignore` templates and their commit | `baseline/gitignore/`, `README.md` |
| This repository's own git hooks | `lefthook.yml`, which extends `.baseline/lefthook.yml` |
| Tool versions, release settings | `package.json` |
| How a release is tagged and published | `.github/workflows/publish.yml` |
| Vocabulary | `CONTEXT.md` |
| Why things are the way they are | `docs/adr/` |

## Commands

`npm test` runs the tests (`node --test`). `npm run release:<patch|minor|major>` prepares a
release on a branch; after the PR is merged, run the Release workflow from the Actions tab. `node cli/repo-setup.mjs` applies the baseline to this
repository itself; run it after changing `baseline/` and commit the result.
