# PR Profiler updates — implementation-ready slice

## Ready for implementation

This specification covers the remaining roadmap work after v0.3.1: baseline rules,
diff areas, Sentinel/SARIF evidence, CODEOWNERS suggestions, stable telemetry,
review checklist output, `fail_on_risk`, and action/example contract validation.

## Confirmed behavior

- The deterministic floor is authoritative: Jev may raise risk, never lower it.
- Docs-only diffs take an early floor path; evidence overlays may still raise risk.
- `ABSTAIN` becomes `REQUEST_REVIEW` with the deterministic floor and explicit reason
  codes.
- Check Runs are updated for the same head SHA and profiler name.
- `recommended_checks` remains an allowlisted JSON array and may contain multiple
  typed Jev selections plus deterministic defaults.
- `fail_on_risk` defaults to empty and accepts `HIGH` or `CRITICAL`. When reached,
  the Action fails after outputs and configured effects have been produced.

## Baseline contract

`.jev/pr-profiler.yml` is optional:

```yaml
version: 1
floors:
  - paths: ["src/auth/**"]
    risk: HIGH
    review_depth: EXPERT
    recommended_checks: [security_scan, codeowners_review]
    skip_jev: false
overrides:
  - paths: ["docs/**"]
    risk: LOW
    review_depth: LIGHT
    recommended_checks: [docs_review]
    skip_jev: true
```

Rules are matched against changed paths. `floors` and `overrides` are deterministic
policy inputs; they can only raise the computed floor. `skip_jev: true` is allowed
only for a matching rule and produces a provisional deterministic profile without a
remote Jev call. Invalid config fails closed with a schema error.

## Evidence additions

- Diff evidence contains bounded area summaries for `auth`, `api`, `infra`, and `ui`.
- Sentinel evidence reads `.jev/security-sentinel-report.json` when present and
  otherwise `.jev/security-sentinel.sarif`; explicit action inputs override paths.
- When both Sentinel formats exist, JSON is authoritative and SARIF is not counted
  twice.
- `review_checklist` is a bounded list of stable allowlisted item IDs rendered as
  human-readable bullets in comments/reports.
- CODEOWNERS owners for sensitive changed paths are exposed in
  `suggested_reviewers`. They are requested only when
  `request_codeowners_reviewers: true` and the normal high-risk reviewer gate opens.

## Acceptance criteria

1. Existing tests and coverage thresholds remain green.
2. Baseline glob rules raise the floor and can skip Jev only when explicitly set.
3. Invalid baseline rules, unsafe paths, malformed Sentinel artifacts, and malformed
   SARIF are rejected or reported without executing their contents.
4. Area summaries are present in deterministic evidence and Jev state.
5. Sentinel JSON/SARIF evidence maps to the existing security summary without
   duplicate counting.
6. CODEOWNERS suggestions use the last matching rule and never include arbitrary
   free-form content as commands.
7. Structured logs default to enabled, remain redacted, and use stable field names.
8. `review_checklist` contains only allowlisted IDs and is emitted as an Action output.
9. `fail_on_risk` fails only at the configured threshold and preserves outputs/effects.
10. Every example workflow references only declared action inputs/outputs.

## Non-goals

No merge/approval automation, no shell execution from evidence, no arbitrary network
fetches, no patch hunks sent to Jev, and no automatic reviewer writes unless explicitly
enabled.
