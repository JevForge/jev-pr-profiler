import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import { buildProfileQuestions, summarizeState } from './questions.js';
import { normalizeProfile, unavailableDecision, choiceFromAnswers } from './normalize.js';
import type { ProfilerDecision } from '../schemas/profiler.js';

type EvaluateBody = {
  answers?: Record<
    string,
    { type?: string; choice?: string; probability?: number; confidence?: number }
  >;
  confidence?: Record<string, number>;
};

/**
 * TypeSafe native adapter.
 * POST { state, questions, model } → { answers, confidence? }
 */
export function createTypesafeNativeProvider(options: JevProviderOptions): JevProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? 'https://api.typesafe.ai/v1/evaluate';

  return {
    id: 'typesafe-native',
    async evaluatePrProfile(state: JevEvaluationState): Promise<ProfilerDecision> {
      if (!options.apiKey) {
        return unavailableDecision('TYPESAFE_API_KEY is required for typesafe-native');
      }
      if (!options.model) {
        return unavailableDecision(
          'jev_model is required for typesafe-native (pin a catalog model id)',
        );
      }

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), options.timeoutMs);
        const response = await fetchImpl(endpoint, {
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
          return unavailableDecision(
            `typesafe-native HTTP ${response.status}: ${await response.text().catch(() => '')}`.slice(
              0,
              500,
            ),
          );
        }
        const body = (await response.json()) as EvaluateBody;
        const risk = body.answers?.risk_level;
        const depth = body.answers?.review_depth;
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
            recommendedChecks: [
              choiceFromAnswers(body.answers, 'recommended_check_primary'),
              choiceFromAnswers(body.answers, 'recommended_check_secondary'),
              choiceFromAnswers(body.answers, 'recommended_check_tertiary'),
              choiceFromAnswers(body.answers, 'recommended_check'),
            ],
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
            explanation: `Jev (typesafe-native/${options.model}) profiled risk=${risk.choice}`,
          },
          state.evidence,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`typesafe-native error: ${message}`);
      }
    },
  };
}
