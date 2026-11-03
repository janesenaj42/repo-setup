---
paths:
  - "**/*.md"
---

# Writing docs

Applies to every Markdown file in the repo. Readers are engineers. Where an area has its own
style rules (`writing-style.md`), both apply.

## Wording

1. Literal, technical wording. Say what a thing is, what it does, and the command or file
   involved.
2. No metaphors, personification, slogans or marketing tone ("safety net", "the record",
   "stops a mistake going further", "single pane of glass").
3. No idioms for plain events: write "is added", "is merged", "runs", "is enabled", not
   "lands", "ships", "kicks in", "under the hood".
4. No sentence that restates the heading, introduces the next section, or comments on the doc.
5. Name the file, command, job or setting; never describe one vaguely when it can be named.

## Current state, not history

A doc says how things are now. How they got that way belongs in the commit message and the PR.

1. Don't record what was moved, renamed, fixed, repaired, removed or withdrawn, or when. Write
   the result. Not: "Both commands had broken frontmatter and were repaired on copy; the other
   five arrived intact." Instead, if a reader needs it: "`change.md` and `rebaseline.md`
   differ from the source by their frontmatter."
2. When a fact changes, rewrite the sentence. Don't add "previously…", "now…", "since #58…",
   "as of <date>", "(updated)".
3. Exception, history by design: ADRs (`docs/adr/`).

## Size

1. Before adding a section, check whether a config file, a script header or a code comment
   already says it. If so, link to it; don't restate it (`.claude/rules/baseline.md`, "Single
   source of truth").
2. A README covers what its folder's files can't say: how to start, what a convention is for,
   the non-obvious gotcha. Not a per-item list of what the files contain.
3. Keep the commands and snippets a reader runs or copies to do the task, next to the step that
   needs them, even if another doc has the same ones. Cut explanation, not instructions.
4. Prefer one table to several paragraphs. Prefer deleting a stale section to updating it.
