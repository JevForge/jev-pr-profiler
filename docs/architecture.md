# Architecture notes

## Trust boundaries

| Boundary | Trust |
| --- | --- |
| PR title/body/labels/paths | Untrusted (prompt-injection surface) |
| Security/coverage/incident/Sentinel JSON or SARIF in workspace | Semi-trusted artifact; workspace-contained, size-bounded, validated and summarized |
| `.jev/pr-profiler.yml` and CODEOWNERS | Repository policy input; schema/glob parsed, never executable |
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

Additional read-only outputs:

- Area summaries for `auth`, `api`, `infra`, and `ui`
- Allowlisted `review_checklist` items
- CODEOWNERS suggestions for sensitive paths
- Redacted structured decision telemetry (enabled by default)

The optional `fail_on_risk` threshold turns the final Action status into a failure
after these configured effects and outputs are produced. It does not grant merge,
approval, or review-dismissal capabilities.

Forbidden:

- Approve / merge / dismiss reviews
- Run shell from Jev text
- Silent provider fallback
- Lowering risk below the deterministic floor
