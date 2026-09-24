# Changelog

## [Unreleased]

### Added

* Optional `.jev/pr-profiler.yml` deterministic floors/overrides with explicit `skip_jev`
* `auth` / `api` / `infra` / `ui` diff-area evidence and area-specific floor checks
* Native JEV Security Sentinel JSON/SARIF evidence loading with JSON precedence
* Allowlisted `review_checklist`, CODEOWNERS suggestions, and opt-in CODEOWNERS reviewer requests
* Redacted structured decision logs enabled by default and optional `fail_on_risk` gating
* Contract tests validating example workflow inputs/outputs against `action.yml`

### Security

* Workspace evidence loaders now reject path traversal and oversized JSON artifacts

## [0.3.1] — 2026-09-24

### Changed

* Check Runs are idempotent per head SHA: existing runs are updated instead of duplicated

## [0.3.0] — 2026-09-24

### Added

* Jev now returns up to three typed recommended checks (`primary` / `secondary` / `tertiary`), merged with risk defaults

## [0.2.3] — 2026-09-24

### Changed

* CI and `npm run all` enforce coverage thresholds via `test:coverage`

## [0.2.2] — 2026-09-24

### Changed

* Clarify ABSTAIN handling: policy sets `REQUEST_REVIEW` with floor risk/depth/checks and `FLOOR_AFTER_ABSTAIN`

## [0.2.1] — 2026-09-24

### Added

* `changed_paths` accepts JSON objects with optional `additions` / `deletions` / `status` for accurate churn without the Pulls API

## [0.2.0] — 2026-09-24

### Fixed

* Docs-only PRs no longer escalate risk from documentation churn volume (`MANY_FILES` / size floors). Only label, security, coverage, and incident overlays may raise severity.

### Added

* Release roadmap for v0.2–v0.4 series (`docs/ROADMAP.md`)

## [0.1.0] — 2026-09-24

### Added

* Initial public release of **JEV Pull Request Profiler**
* Profiles PR risk, review depth, and recommended checks via configurable Jev providers
* Deterministic policy floor from diff, labels, optional security findings, coverage, and incident history
* Idempotent PR comments, managed labels, Checks API runs, optional reviewer requests, and report artifacts
* Never approves, merges, or blocks merge by itself
