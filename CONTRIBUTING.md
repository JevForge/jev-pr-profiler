# Contributing

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
```

## Guidelines

- Keep the public decision contract stable (`risk_level`, `review_depth`, `recommended_checks`, `reason_codes`).
- Never execute free-form text from Jev. Only allowlisted enums reach GitHub effects.
- Add unit/contract coverage for schema rejection, low confidence, and Jev unavailability.
- Prefer small, focused PRs. Run `npm run all` before opening a PR.
