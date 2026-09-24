import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import { buildProfileQuestions, summarizeState } from './questions.js';
import { normalizeProfile, unavailableDecision } from './normalize.js';
import type { ProfilerDecision } from '../schemas/profiler.js';

type EvaluateBody = {
  answers?: Record<
    string,
    { type?: string; choice?: string; probability?: number; confidence?: number }
  >;
  confidence?: Record<string, number>;
};

/**
 * Custom HTTPS endpoint that speaks the same evaluate contract as TypeSafe native.
 */
export function createCustomCompatibleProvider(options: JevProviderOptions): JevProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    id: 'custom-compatible',
    async evaluatePrProfile(state: JevEvaluationState): Promise<ProfilerDecision> {
      if (!options.apiKey) {
        return unavailableDecision('Custom Jev secret is required for custom-compatible');
      }
      if (!options.endpoint) {
        return unavailableDecision('jev_endpoint is required for custom-compatible');
      }
      if (!options.endpoint.startsWith('https://')) {
        return unavailableDecision('jev_endpoint must be HTTPS for custom-compatible');
      }
      if (!options.model) {
        return unavailableDecision('jev_model is required for custom-compatible');
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        const response = await fetchImpl(options.endpoint!, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            state: summarizeState(state),
            questions: buildProfileQuestions(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
          return unavailableDecision(`custom-compatible HTTP ${response.status}`.slice(0, 200));
        }
        const body = (await response.json()) as EvaluateBody;
        const risk = body.answers?.risk_level;
        const depth = body.answers?.review_depth;
        const check = body.answers?.recommended_check;
        if (!risk || risk.type !== 'choice' || typeof risk.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing risk_level choice');
        }
        if (!depth || depth.type !== 'choice' || typeof depth.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing review_depth choice');
        }

        return normalizeProfile(
          {
            riskLevel: risk.choice,
            reviewDepth: depth.choice,
            recommendedCheck:
              check?.type === 'choice' && typeof check.choice === 'string'
                ? check.choice
                : null,
            confidence: body.confidence?.risk_level ?? risk.confidence ?? 0.5,
            abstainProbability:
              body.answers?.abstain?.type === 'boolean'
                ? body.answers.abstain.probability
                : undefined,
            requestReviewProbability:
              body.answers?.request_review?.type === 'boolean'
                ? body.answers.request_review.probability
                : undefined,
            provisional: false,
            explanation: `Jev (custom-compatible) profiled risk=${risk.choice}`,
          },
          state.evidence,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`custom-compatible error: ${message}`);
      }
    },
  };
}
