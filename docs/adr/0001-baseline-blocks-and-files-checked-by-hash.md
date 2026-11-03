---
status: accepted
date: 2026-10-07
decision-makers: janesenaj42
---

# Shared files are Baseline Blocks and Baseline Files, checked by hash

## Context and problem statement

Every repository needs the same `.gitignore`, `.gitattributes`, `.editorconfig`, check scripts,
hook config and Claude rules. Git and Claude Code read these only from the repository, so a
package can't deliver them: each repository holds a copy. The org kept them as templates before,
and the copies drifted with no way to tell or to bring them back.

## Considered options

1. Plain copies, refreshed when someone re-runs the setup.
2. Marked copies: the baseline's lines between markers holding a hash of what was written, the
   project's own lines outside them; a pre-commit check rejects an edit.
3. A check comparing each whole file with the baseline.

## Decision outcome

Chosen option: 2. An edit is rejected at commit time without the check needing the baseline,
because the hash is in the file; the plugin reports a copy older than the installed baseline; a
project still adds its own lines, after the blocks (a later line overrides an earlier one in all
three files), or its own file beside a Baseline File.

Option 1 is how the templates drifted. Option 3 fails every repository that adds its own ignores.

### Consequences

- Good: no copy changes without a commit that re-runs repo-setup; updates are one command.
- Bad: a project can't change a line inside a block; it overrides after the block instead.
- The `.gitignore` blocks for a stack go in its Area's own `.gitignore`: GitHub's templates ignore
  folders by name (Python's `lib/`, `build/`), which at the root would hide other stacks' files.

### Confirmation

`test/repo-setup.test.mjs` and the pre-commit hook in this repository.
