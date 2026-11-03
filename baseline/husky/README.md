# Preset: husky and shell hooks

For a project that already runs its git hooks with husky (`.husky/`), or from a versioned folder
of shell scripts set with `git config core.hooksPath` (e.g. `.githooks/`). The files here are
plain `sh`, so they work in both. Append each to the hook of the same name in that folder, after
its existing lines; create the hook if it doesn't exist (shell hooks: `#!/bin/sh` first line,
executable). Don't add `lefthook.yml` or run `lefthook install`: husky sets `core.hooksPath`, and
`lefthook install` then installs nothing.

Every line ends in `|| exit 1`, so a failing check stops the commit whether or not the hook
runs with `sh -e` (husky does; a plain `core.hooksPath` hook doesn't).

The root `package.json` keeps its `husky` dependency and `prepare` script and drops `lefthook`.
Each stack's pre-commit lines are in `presets/<stack>/husky-pre-commit`.
