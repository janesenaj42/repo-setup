---
status: proposed
date: YYYY-MM-DD
decision-makers: <names>
consulted: <names, or delete the line>
informed: <names, or delete the line>
---

<!-- Copy to docs/adr/NNNN-<kebab-slug>.md, numbered one above the highest existing record
     (the first is 0001), fill it in, and delete every comment.

     Based on MADR 4.0 (adr.github.io/madr), with an explicit scope and a checkable decision.

     Write a record only when all three hold:
     1. Hard to reverse: changing course later has a meaningful cost.
     2. Surprising without context: a future reader would ask "why was it done this way?"
     3. A real trade-off: there were genuine alternatives and one was picked for stated reasons.

     One decision per record. Open it as `proposed` in the PR/MR that makes the change; merge it
     as `accepted` or `rejected` (a rejected record stops the same option being proposed again).
     An accepted record is not edited: a later record replaces it, and the old one's status
     becomes `superseded by NNNN`. Other statuses: `deprecated` (no longer applies, nothing
     replaces it). A section marked (optional) may be deleted. -->

# <The decision as a short statement, e.g. "Store orders as events">

## Context and problem statement

<!-- The forces: what is true now, what problem surfaced, which constraints bind. Cite
     evidence (files, issues, measurements), not opinion. End with the question being decided.
     Scope: what this decision covers, and what it doesn't. -->

## Decision drivers (optional)

<!-- The qualities, constraints or concerns the options are judged against. -->

- <driver>

## Considered options

- <option>
- <option>

## Decision outcome

Chosen option: "<option>", because <reason, in terms of the drivers>.

<!-- The rule, worded so a reviewer can tell whether a given change complies. More than one
     rule: number them, with MUST / MUST NOT / SHOULD. -->

### Consequences

<!-- Include the inconvenient ones: what becomes harder, what new obligation exists. -->

- Good, because <consequence>
- Bad, because <consequence>

### Confirmation

<!-- How compliance is checked: the CI job, lint rule, test or review step. If no check can
     enforce it, say so: the rule is then for review only. -->

## Pros and cons of the options (optional)

### <option>

- Good, because <argument>
- Bad, because <argument>

## More information (optional)

<!-- Links: the issue, the PR/MR, related or superseded records; when to revisit the decision. -->
