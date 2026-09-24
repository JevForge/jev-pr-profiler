# jev-pr-profiler threat model

## Scope and deployment

This repository builds a Node 24 JavaScript GitHub Action executed in GitHub Actions.
It reads pull-request metadata, changed-file metadata, local configuration/evidence,
CODEOWNERS, Sentinel reports/SARIF, and Jev responses, then may write PR comments,
labels, Check Runs, reviewer requests, and local report artifacts.

## Assets and trust boundaries

| Boundary | Asset / risk | Existing or required control |
| --- | --- | --- |
| PR metadata → evidence | Prompt injection, secret leakage to Jev | sanitize/truncate; send summaries only; never execute prose |
| Workspace files → collectors | Malformed JSON/YAML/SARIF, path traversal, resource exhaustion | Zod schemas, bounded file size/counts, workspace containment |
| CODEOWNERS → reviewer suggestions | Reviewer spoofing or unintended write | parse allowlisted owner tokens; suggestions read-only; opt-in requests |
| Sentinel/SARIF → risk floor | Under-counting or duplicate security findings | JSON precedence, strict parser, bounded severity summary, stable reason code |
| Jev → policy | Unsafe enum/check injection or weakened floor | schema + enum validation; deterministic floor merge |
| Action → GitHub API | Comment/label/check/reviewer side effects | least-privilege token, idempotent writes, no merge/approval capability |
| CI logs/artifacts | Sensitive metadata disclosure | structured redacted fields; no body, tokens, raw findings, or secret matches |

## Abuse paths and mitigations

1. An attacker puts instructions or a token-like string in a PR title/body/path.
   The collector sanitizes and truncates data, the Jev prompt labels it untrusted, and
   no returned prose is executed. Tests assert no raw secret body is sent.
2. A repository-controlled artifact uses `../` or an oversized/malformed file to read
   outside the workspace or exhaust the runner. All configured paths are resolved
   inside the workspace, files are bounded, and parsers accept only bounded schemas.
3. A malicious Jev or custom endpoint returns a shell-looking check, weak risk, or
   invalid enum. Zod/allowlist validation rejects it; the deterministic floor remains
   authoritative; only static allowlisted IDs reach outputs/effects.
4. A CODEOWNERS rule injects arbitrary text into reviewer requests. Owners are parsed
   from bounded tokens, filtered to `@user`, `@org/team`, or `team:slug` forms, and
   automatic requests are opt-in.
5. Sentinel JSON and SARIF for the same run are both present and counted twice, or an
   attacker crafts a report to hide critical findings. JSON is preferred, summaries
   are recomputed from visible findings where possible, and malformed input is not
   silently accepted.
6. A workflow grants excessive GitHub permissions or interpolates untrusted PR data
   into shell. The repository workflow uses `pull_request`, explicit read permissions,
   and no untrusted values in `run` commands; the action itself never executes shell.

## Residual risk

- A repository that explicitly enables reviewer requests or write effects still needs
  appropriate GitHub token permissions and branch/workflow governance.
- A valid but misleading security artifact is trusted as repository evidence; this is
  mitigated by provenance/documentation but cannot be cryptographically verified by
  this local Action.
- CODEOWNERS matching is intentionally bounded and does not claim full parity with
  every GitHub CODEOWNERS edge case.
