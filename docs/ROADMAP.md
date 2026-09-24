# Release roadmap (v0.2 → v0.4)

Each item is a **separate branch, PR, merge, and GitHub Release** via `jev-release-forge`.

| Version | Branch | Change |
| ------- | ------ | ------ |
| `v0.2.0` | `feat/docs-only-floor` | Early-return docs-only floor (no size escalation) |
| `v0.2.1` | `feat/changed-paths-stats` | `changed_paths` accepts optional additions/deletions |
| `v0.2.2` | `feat/abstain-floor-clarity` | Clear ABSTAIN → REQUEST_REVIEW + floor semantics |
| `v0.2.3` | `feat/ci-coverage-gate` | CI runs coverage thresholds |
| `v0.3.0` | `feat/multi-recommended-checks` | Up to 3 typed Jev check choices |
| `v0.3.1` | `feat/idempotent-check-run` | Update existing Check Run for SHA |
| `v0.3.2` | `feat/codeowners-reviewers` | Suggest/request CODEOWNERS reviewers |
| `v0.3.3` | `feat/structured-logs-default` | Default `structured_logs` to true |
| `v0.3.4` | `feat/yaml-contract-tests` | Contract tests for examples vs `action.yml` |
| `v0.4.0` | `feat/baseline-config` | `.jev/pr-profiler.yml` path-glob floors |
| `v0.4.1` | `feat/diff-areas` | Diff area tags (`auth`, `api`, `infra`, `ui`, …) |
| `v0.4.2` | `feat/sentinel-integration` | Load Sentinel report/SARIF summaries |
| `v0.4.3` | `feat/review-checklist` | Allowlisted `review_checklist` output |
| `v0.4.4` | `feat/fail-on-risk` | Optional `fail_on_risk` threshold gate |

Non-goals for this series: silent provider fallback, sending patch hunks, auto-merge/approve.
