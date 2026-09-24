import type { JevProviderId, RiskLevel } from '../schemas/enums.js';
import type { PrEvidence, ProfilerDecision } from '../schemas/profiler.js';

export interface JevEvaluationState {
  evidence: PrEvidence;
  constraints: {
    min_confidence: number;
  };
  note: string;
  baseline?: {
    matched_rules: string[];
    risk: RiskLevel | null;
    skip_jev: boolean;
  };
}

export interface JevProvider {
  readonly id: JevProviderId;
  evaluatePrProfile(state: JevEvaluationState): Promise<ProfilerDecision>;
}

export interface JevProviderOptions {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}
