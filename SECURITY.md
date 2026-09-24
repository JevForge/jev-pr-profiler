# Security Policy

## Supported versions

Security fixes are applied to the latest release on `main` and the current major tag (`v0`).

## Reporting a vulnerability

Email security concerns to the JevForge maintainers via GitHub Security Advisories on this repository. Do not open a public issue for secrets or exploitable defects.

## Secrets handling

- Never commit `AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, or custom Jev secrets.
- The Action redacts common token patterns from PR text before calling Jev.
- Patch hunks are never sent to Jev — only path metadata and line counts.
