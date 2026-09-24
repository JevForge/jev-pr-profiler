import * as core from '@actions/core';
import * as github from '@actions/github';
import { collectPrFromPayload, buildEvidence } from './collectors/evidence.js';
import { collectPullDiffSignals } from './collectors/pull-diff.js';
import { summarizeDiffFiles, toDiffFiles, emptyDiffSignals } from './collectors/diff-signals.js';
import { loadSecurityFindings } from './collectors/security-findings.js';
import { loadCoverageSignals } from './collectors/coverage.js';
import { loadIncidentSignals } from './collectors/incidents.js';
import {
  coalescePolicy,
  coalesceProvider,
  loadJeConfig,
} from './collectors/config.js';
import { runProfiler } from './run.js';
import { applyPolicyToAction } from './github/outputs.js';
import { parseBoolean, parseStringList } from './utils/sanitize.js';

function resolveApiKey(jevProvider: string): string | undefined {
  if (jevProvider === 'vercel-ai-gateway') {
    return process.env.AI_GATEWAY_API_KEY || undefined;
  }
  if (jevProvider === 'typesafe-native') {
    return process.env.TYPESAFE_API_KEY || undefined;
  }
  return process.env.JEV_CUSTOM_API_KEY || process.env.CUSTOM_JEV_API_KEY || undefined;
}

async function main(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const config = loadJeConfig(workspace);

  const jev_provider = coalesceProvider(core.getInput('jev_provider') || undefined, config);
  const low_confidence_policy = coalescePolicy(
    core.getInput('low_confidence_policy') || undefined,
    config,
  );

  const pullNumberInput = core.getInput('pull_number');
  const pullNumber = pullNumberInput ? Number(pullNumberInput) : undefined;
  const labelOverride = parseStringList(core.getInput('labels') || undefined);
  const changedPathsRaw = core.getInput('changed_paths');

  const collected = collectPrFromPayload(
    github.context.payload as Record<string, unknown>,
    {
      title: core.getInput('title') || undefined,
      body: core.getInput('body') || undefined,
      labels: labelOverride.length ? labelOverride : undefined,
      pullNumber: Number.isFinite(pullNumber) ? pullNumber : undefined,
    },
  );

  if (!collected.metadata.number && !changedPathsRaw) {
    throw new Error(
      '[JEV Pull Request Profiler] No pull request number found. Use pull_request events or pass pull_number / changed_paths.',
    );
  }

  const token = core.getInput('github_token') || process.env.GITHUB_TOKEN;
  const octokit = token ? github.getOctokit(token) : null;
  const max_files = Number(core.getInput('max_files') || config.max_files || 100);
  const include_security = parseBoolean(
    core.getInput('include_security_findings') || undefined,
    true,
  );
  const include_coverage = parseBoolean(core.getInput('include_coverage') || undefined, true);
  const include_incidents = parseBoolean(core.getInput('include_incidents') || undefined, true);

  let diff = emptyDiffSignals();
  if (changedPathsRaw.trim()) {
    const paths = parseStringList(changedPathsRaw);
    diff = summarizeDiffFiles(
      toDiffFiles(paths.map(filename => ({ filename, status: 'modified', additions: 0, deletions: 0 }))),
    );
  } else if (collected.metadata.number && octokit) {
    try {
      diff = await collectPullDiffSignals(collected.metadata.number, {
        async listFiles(n) {
          const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            pull_number: n,
            per_page: 100,
          });
          return files.map(f => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            previous_filename: f.previous_filename,
          }));
        },
      }, { maxFiles: max_files });
      core.info(
        `PR diff signals: files=${diff.file_count} +${diff.additions}/-${diff.deletions}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.warning(`[JEV Pull Request Profiler] Failed to collect PR diff: ${message}`);
    }
  }

  const securityPath =
    core.getInput('security_findings_path') ||
    config.security_findings_path ||
    '.jev/security-findings.json';
  const coveragePath =
    core.getInput('coverage_path') || config.coverage_path || '.jev/coverage.json';
  const incidentsPath =
    core.getInput('incidents_path') || config.incidents_path || '.jev/incidents.json';

  const security = include_security
    ? loadSecurityFindings(workspace, securityPath)
    : null;
  const coverage = include_coverage ? loadCoverageSignals(workspace, coveragePath) : null;
  const incidents = include_incidents
    ? loadIncidentSignals(workspace, incidentsPath, diff.top_paths)
    : null;

  const evidence = buildEvidence({
    metadata: collected.metadata,
    diff,
    security,
    coverage,
    incidents,
  });

  const issueNumber = collected.metadata.number;
  const commentClient =
    octokit && issueNumber
      ? {
          async listComments() {
            const comments = await octokit.paginate(octokit.rest.issues.listComments, {
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              per_page: 100,
            });
            return comments.map(c => ({ id: c.id, body: c.body }));
          },
          async createComment(body: string) {
            await octokit.rest.issues.createComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              body,
            });
          },
          async updateComment(id: number, body: string) {
            await octokit.rest.issues.updateComment({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              comment_id: id,
              body,
            });
          },
        }
      : null;

  const labelClient =
    octokit && issueNumber
      ? {
          async listLabels() {
            const issue = await octokit.rest.issues.get({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
            });
            return (issue.data.labels ?? [])
              .map(label => (typeof label === 'string' ? label : label.name))
              .filter((name): name is string => typeof name === 'string');
          },
          async ensureLabel(name: string) {
            try {
              await octokit.rest.issues.createLabel({
                owner: github.context.repo.owner,
                repo: github.context.repo.repo,
                name,
                color: '5319E7',
                description: 'Managed by JEV Pull Request Profiler',
              });
            } catch (error) {
              const status =
                error && typeof error === 'object' && 'status' in error
                  ? Number((error as { status?: number }).status)
                  : undefined;
              if (status !== 422) throw error;
            }
          },
          async setLabels(next: string[]) {
            await octokit.rest.issues.setLabels({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              issue_number: issueNumber,
              labels: next,
            });
          },
        }
      : null;

  const headSha =
    github.context.payload.pull_request?.head?.sha ?? github.context.sha ?? null;

  const checkRunClient = octokit
    ? {
        async createCheckRun(input: {
          name: string;
          headSha: string;
          conclusion: 'success' | 'neutral' | 'failure';
          title: string;
          summary: string;
        }) {
          await octokit.rest.checks.create({
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            name: input.name,
            head_sha: input.headSha,
            status: 'completed',
            conclusion: input.conclusion,
            output: {
              title: input.title,
              summary: input.summary,
            },
          });
        },
      }
    : null;

  const reviewerClient =
    octokit && issueNumber
      ? {
          async requestReviewers(input: { users: string[]; teams: string[] }) {
            await octokit.rest.pulls.requestReviewers({
              owner: github.context.repo.owner,
              repo: github.context.repo.repo,
              pull_number: issueNumber,
              reviewers: input.users,
              team_reviewers: input.teams,
            });
          },
        }
      : null;

  core.info(`Jev provider: ${jev_provider}`);
  core.info(
    'Data sent to Jev: sanitized PR title/body excerpt, labels, compact diff metadata (paths/counts only), optional security/coverage/incident summaries. Secrets and patch hunks are never sent.',
  );

  if (parseBoolean(core.getInput('structured_logs') || undefined, false)) {
    core.info(
      JSON.stringify({
        event: 'jev_pr_profiler_evidence',
        file_count: diff.file_count,
        additions: diff.additions,
        deletions: diff.deletions,
        security_total: security?.total ?? null,
        coverage_delta: coverage?.delta_lines_pct ?? null,
        incidents: incidents?.recent_count ?? null,
      }),
    );
  }

  const result = await runProfiler({
    evidence,
    min_confidence: Number(core.getInput('min_confidence') || config.min_confidence || 0.7),
    low_confidence_policy,
    jev_provider,
    jev_endpoint: core.getInput('jev_endpoint') || config.jev_endpoint || undefined,
    jev_model: core.getInput('jev_model') || config.jev_model || undefined,
    timeout_ms: Number(core.getInput('timeout_ms') || 45_000),
    comment_on_github: parseBoolean(
      core.getInput('comment_on_github') || undefined,
      config.comment_on_github ?? false,
    ),
    apply_labels: parseBoolean(
      core.getInput('apply_labels') || undefined,
      config.apply_labels ?? false,
    ),
    create_check_run: parseBoolean(
      core.getInput('create_check_run') || undefined,
      config.create_check_run ?? true,
    ),
    write_report_artifact: parseBoolean(
      core.getInput('write_report_artifact') || undefined,
      config.write_report_artifact ?? false,
    ),
    dry_run: parseBoolean(core.getInput('dry_run') || undefined, false),
    request_reviewers: parseStringList(core.getInput('request_reviewers') || undefined),
    workspace,
    head_sha: headSha,
    apiKey: resolveApiKey(jev_provider),
    commentClient,
    labelClient,
    checkRunClient,
    reviewerClient,
  });

  applyPolicyToAction(
    {
      setOutput: (name, value) => core.setOutput(name, value),
      setFailed: message => core.setFailed(message),
      warning: message => core.warning(message),
      info: message => core.info(message),
    },
    result.outcome,
    result.summary,
    {
      fileCount: evidence.diff.file_count,
      additions: evidence.diff.additions,
      deletions: evidence.diff.deletions,
      commentStatus: result.commentStatus,
      labelStatus: result.labelStatus,
      checkStatus: result.checkStatus,
      reviewersStatus: result.reviewersStatus,
      reportMarkdown: result.reportMarkdown,
      reportJson: result.reportJson,
    },
  );

  core.info(`Comment: ${result.commentStatus}`);
  core.info(`Labels: ${result.labelStatus}`);
  core.info(`Check run: ${result.checkStatus}`);
  core.info(`Reviewers: ${result.reviewersStatus}`);
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  const prefixed = message.startsWith('[JEV Pull Request Profiler]')
    ? message
    : `[JEV Pull Request Profiler] ${message}`;
  core.setFailed(prefixed);
});
