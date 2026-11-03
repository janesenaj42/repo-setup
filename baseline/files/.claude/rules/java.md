---
paths:
  - "**/*.java"
---

# Code Review Standards (Java / Spring Boot)

## Spring WebFlux (Reactive)
- Never block inside a reactive chain — no `.block()`, no `Thread.sleep()`
- Use `thenMany()` for sequencing, `flatMap()` for async transformation, `Mono.defer()` for lazy evaluation
- Use `Mono.fromRunnable()` for side effects that return nothing
- `.switchIfEmpty()` is the reactive equivalent of null-check fallback
- Chain error handling with `.onErrorMap()` to translate exceptions to domain errors, `.onErrorResume()` to recover
- Never swallow reactive errors — always terminate the chain with an explicit error signal or fallback
