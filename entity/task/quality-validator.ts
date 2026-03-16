/**
 * Quality validator configuration types and defaults.
 */

export interface QualityGateConfig {
  minScore?: number
  requireSelfCheck?: boolean
  requirePeerReview?: boolean
  maxReworks?: number
  validators?: string[]
  validatorConfig?: Record<string, unknown>
}

export interface PipelineStep {
  from: string
  to: string
  qualityGate?: QualityGateConfig
}

export const DEFAULT_GATE_CONFIG: Required<QualityGateConfig> = {
  minScore: 75,
  requireSelfCheck: true,
  requirePeerReview: false,
  maxReworks: 3,
  validators: [],
  validatorConfig: {},
}
