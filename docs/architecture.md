# Architecture notes

## Trust boundaries

| Boundary | Trust |
| --- | --- |
| PR title/body/labels/paths | Untrusted (prompt-injection surface) |
| Security/coverage/incident JSON in workspace | Semi-trusted artifact; validated and summarized |
| Jev response | Untrusted until Zod + allowlist validation |
| Deterministic floor | Trusted code path |
| GitHub effects | Only enum-driven side effects |

## Executor limits

Allowed side effects:

- Upsert PR comment (idempotent marker)
- Apply managed `jev:risk:*` / `jev:review-depth:*` labels
- Create completed check run
- Request configured reviewers for HIGH/CRITICAL or EXPERT
- Write `.jev/pr-profiler-report.*` artifacts

Forbidden:

- Approve / merge / dismiss reviews
- Run shell from Jev text
- Silent provider fallback
- Lowering risk below the deterministic floor
