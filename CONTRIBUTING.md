# Contributing

Thanks for helping improve **JEV Pull Request Profiler**.

## Setup

Requires Node.js 24+.

```bash
git clone https://github.com/JevForge/jev-pr-profiler.git
cd jev-pr-profiler
npm ci
```

## Local commands

```bash
npm run typecheck
npm test
npm run build
npm run all
```

Consumers use the committed `dist/index.js` bundle. Rebuild it before opening a PR that changes `src/`.

## Pull requests

* Keep the public decision contract stable (`risk_level`, `review_depth`, `recommended_checks`, `reason_codes`).
* Never execute free-form text from Jev. Only allowlisted enums reach GitHub effects.
* Add tests for schema rejection, low confidence, and Jev unavailability when you touch those paths.
* Update README / examples when inputs or outputs change.
* Do not commit secrets, tokens, or `.env` files.
* Prefer small, focused PRs. Run `npm run all` before opening a PR.

## Issues

Use the bug / feature templates. **Never** include API keys, tokens, credentials, or other secrets in Issues or logs.
