---
paths:
  - "**/*.py"
---

# Code Review Standards (Python / FastAPI)

## Types
- No `Any` from `typing` — use `TypeVar`, `Union`, `Literal`, or proper Pydantic models
- Constrained string values must use `Literal` or `Enum`, not raw `str`

## Tooling
- `uv` as package manager — lockfile must be committed
- `poethepoet` for task automation; use `cmd` over `shell` unless pipes are needed; prefix private tasks with `_`
