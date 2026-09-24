# Changelog

## [Unreleased]

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
