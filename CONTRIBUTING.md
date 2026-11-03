# Contributing to `repo-setup`

Where each fact lives: [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

## Run from source

**Toolchain:** Node.js 22 or later

```bash
git clone <repo-url>
cd repo-setup
npm ci             # also installs the git hooks
```

**Check it works:** `node cli/repo-setup.mjs --help` prints the commands and options.

To try a change on another repository: `cd <other-repo> && node <this-repo>/cli/repo-setup.mjs --dry-run`.

## Before a PR

```bash
npm test                    # node --test
node cli/repo-setup.mjs     # after changing baseline/: apply it to this repository, commit the result
```

## Release

1. On a branch: `npm run release:<patch|minor|major>`. It bumps `package.json` and
   `.claude-plugin/plugin.json` and writes `CHANGELOG.md`. Open a PR.
2. After it's merged: Actions → **Release** → Run workflow.
