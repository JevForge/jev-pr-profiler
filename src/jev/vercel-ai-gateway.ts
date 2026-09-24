import { createGateway, experimental_evaluate as evaluate } from 'ai';
import type { JevProvider, JevProviderOptions, JevEvaluationState } from './types.js';
import { buildProfileQuestions, summarizeState } from './questions.js';
import { normalizeProfile, unavailableDecision, choiceFromAnswers } from './normalize.js';
import type { ProfilerDecision } from '../schemas/profiler.js';

function confidenceFromAnswer(answer: {
  type?: string;
  confidence?: number;
  probability?: number;
}): number {
  if (typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)) {
    return Math.min(1, Math.max(0, answer.confidence));
  }
  if (typeof answer.probability === 'number' && Number.isFinite(answer.probability)) {
    return Math.min(1, Math.max(0, answer.probability));
  }
  return 0.5;
}

export function createVercelAiGatewayProvider(options: JevProviderOptions): JevProvider {
  return {
    id: 'vercel-ai-gateway',
    async evaluatePrProfile(state: JevEvaluationState): Promise<ProfilerDecision> {
      if (!options.apiKey) {
        return unavailableDecision('AI_GATEWAY_API_KEY is required for vercel-ai-gateway');
      }
      try {
        const gateway = createGateway({ apiKey: options.apiKey });
        const model = gateway.evaluationModel(options.model ?? 'typesafe-ai/jev');
        const questions = buildProfileQuestions();
        const result = await evaluate({
          model,
          state: JSON.stringify(summarizeState(state)),
          questions,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(options.timeoutMs),
          providerOptions: {
            gateway: { zeroDataRetention: true },
          },
        });

        const risk = result.answers.risk_level;
        const depth = result.answers.review_depth;
        if (!risk || risk.type !== 'choice' || typeof risk.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing risk_level choice');
        }
        if (!depth || depth.type !== 'choice' || typeof depth.choice !== 'string') {
          throw new Error('SCHEMA_REJECTED: missing review_depth choice');
        }

        const typesafeConfidence = (
          result as {
            providerMetadata?: { typesafe?: { confidence?: Record<string, number> } };
          }
        ).providerMetadata?.typesafe?.confidence?.risk_level;

        const answers = result.answers as Record<
          string,
          { type?: string; choice?: string; probability?: number }
        >;

        return normalizeProfile(
          {
            riskLevel: risk.choice,
            reviewDepth: depth.choice,
            recommendedChecks: [
              choiceFromAnswers(answers, 'recommended_check_primary'),
              choiceFromAnswers(answers, 'recommended_check_secondary'),
              choiceFromAnswers(answers, 'recommended_check_tertiary'),
              choiceFromAnswers(answers, 'recommended_check'),
            ],
            confidence:
              typeof typesafeConfidence === 'number'
                ? typesafeConfidence
                : confidenceFromAnswer(risk as { confidence?: number }),
            abstainProbability:
              result.answers.abstain?.type === 'boolean'
                ? result.answers.abstain.probability
                : undefined,
            requestReviewProbability:
              result.answers.request_review?.type === 'boolean'
                ? result.answers.request_review.probability
                : undefined,
            provisional: false,
            explanation: `Jev (vercel-ai-gateway) profiled risk=${risk.choice} depth=${depth.choice}`,
          },
          state.evidence,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('SCHEMA_REJECTED')) throw error;
        return unavailableDecision(`vercel-ai-gateway error: ${message}`);
      }
    },
  };
}
