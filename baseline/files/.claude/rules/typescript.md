---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Code Review Standards (React / TypeScript)

## TypeScript
- `as` casting is a last resort — if you need it, the type upstream is wrong

## Components
- More than 3 props → group related props into typed objects (`config`, `handlers`, `state`)
- Never own a theme inside a library component — consume tokens (`background.paper`, `text.primary`) from the consumer's `ThemeProvider`
- No inline styles for anything theme-related — always use `sx` prop or `styled()`
