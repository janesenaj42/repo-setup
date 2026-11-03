# <Project name>

<One or two sentences: what the system is and who uses it.>

## Language

<!-- One entry per term. Define it here before using it in code, docs or ADRs.

**<Term>**:
<What it is, in one or two sentences.>
_Avoid_: "<synonym people use that means something else here>"
-->

**Area**:
A folder of the repo with its own stack and checks, listed in `.baseline/claude-checks.json`. A
single-project repo has one Area: the repo root.
_Avoid_: "module", "package" (both mean something specific in most stacks)

**Baseline Block**:
Lines in a project file (e.g. `.gitignore`) that the baseline owns, between a start and an end
marker. Only the baseline changes them. Blocks come first in the file; the project's own lines go
after them and may override them.
_Avoid_: "template" (a template is copied once and then drifts), "Managed File" (init-react's
term for a whole file the CLI wrote, which a person may take over by editing it)

**Baseline File**:
A whole project file the baseline owns (e.g. `.baseline/checks/branch-name.mjs`), with no project
lines in it. Only the baseline changes it; a project that needs something else adds its own file
beside it.
_Avoid_: "template", "Managed File"
