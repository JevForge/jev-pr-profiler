# Marketplace listing

## Status

Ready for first publish with release `v0.1.0`.

- Repository: https://github.com/JevForge/jev-pr-profiler
- Release: https://github.com/JevForge/jev-pr-profiler/releases/tag/v0.1.0
- Marketplace (after publish): https://github.com/marketplace/actions/jev-pull-request-profiler

## Listing copy

- **Name:** JEV Pull Request Profiler
- **Short description (≤125):** Profile PR complexity and risk with Jev. Recommends risk level, review depth, and required checks.
- **Categories:** Code quality · Continuous integration
- **Icon / color:** eye / purple
- **Pricing:** Free (MIT)

## Publish checklist

1. Public repository with root `action.yml` — done.
2. GitHub Release via `jev-release-forge` reusable workflow — done for `v0.1.0`.
3. Accept the GitHub Marketplace Developer Agreement for the JevForge org (one-time, if needed).
4. Edit the release → check **Publish this Action to the GitHub Marketplace** → choose categories → confirm 2FA → update release.

GitHub requires browser 2FA for Marketplace publish; it cannot run in CI/`gh`.
