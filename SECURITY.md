# Security Policy

## Supported versions

Security fixes target the latest release on `main` and the current major tag (`v0`).

## Reporting a vulnerability

Do **not** open a public Issue for secrets or exploitable defects.

Prefer [GitHub Security Advisories](https://docs.github.com/en/code-security/security-advisories) on this repository when available. Do not include API keys, tokens, or private data in the report.

## Secrets handling

* Store provider credentials as GitHub Actions secrets (`AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, or `JEV_CUSTOM_API_KEY`).
* Never commit secrets or paste them into Issues, PRs, or workflow logs.
* The Action redacts common token patterns from PR text before calling Jev.
* Patch hunks and full file contents are never sent to Jev—only path metadata and line counts.
* Free-form Jev `explanation` text is display-only and is never executed as a command, path, or GitHub operation.
