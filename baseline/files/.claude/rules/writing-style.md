# Writing style

Applies to chat replies and to every file written in this repo: docs, ADRs, READMEs, code
comments, commit messages, PR bodies, subagent prompts. A template governs *structure*; these
rules govern the *prose inside it*. Markdown files also follow `docs.md`.

Write for a reviewer with none of your context and no time to reconstruct it.

1. **Lead with the answer.** Conclusion first, evidence under it. Never build to a point.
2. **Name the thing.** No bare "this", "that", "the behaviour", "the endpoint". Every noun
   phrase must resolve for someone who has not read the preceding thread.
3. **Lists and tables, not run-on sentences.** Any set of problems, steps, options or missing
   items becomes a numbered list or a table, never comma-separated inside a sentence.
4. **Every step names the actor, the repository, the file, and the exact edit.**
   Write: "Add `"lint": "eslint ."` to `scripts` in `package.json`." Not: "set up linting".
5. **Expand every identifier on first use** in a reply or section: "ADR-0007 (orders are
   stored as events)", never a bare `ADR-0007`.
6. **Define jargon at first use, or drop it.**
7. **Delete sentences carrying no fact.** Scene-setting, transitions, self-commentary,
   restatement of the previous paragraph.
8. **Executive summaries are bullets and tables.** A narrative executive summary is a defect.
9. **Separate verified fact from assumption.** Say what was checked and how. Never state an
   assumption in the voice of a finding.
10. **Blockers go in a table:** the blocker, who resolves it, which repository, and whether the
    items are one task or several.

**Length:** short because each sentence carries a fact, never short by dropping a blocker,
caveat, failed check or open assumption.
