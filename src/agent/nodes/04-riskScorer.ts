import { AgentState } from '../state';
import { calculateRiskScore, determineRiskLevel } from '../../utils/scoring.utils';

export async function riskScorerNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  let riskScore = 0;
  let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

  try {
    const stats = state.subjectStats;
    const subjects = Object.keys(stats);

    let decliningCount = 0;
    let weakCount = 0;

    for (const subject of subjects) {
      const stat = stats[subject];
      if (stat.trend === 'declining') decliningCount++;
      if (stat.label === 'weak' || stat.label === 'critical') weakCount++;
    }

    riskScore = calculateRiskScore(
      state.overallAvgScore,
      decliningCount,
      weakCount,
      0 // missedRatio not tracked from this endpoint
    );

    riskLevel = determineRiskLevel(riskScore);
  } catch (err: any) {
    errors.push(`Risk Scorer node error: ${err.message}`);
  }

  const duration = Date.now() - startTime;

  return {
    riskScore,
    riskLevel,
    errors,
    nodeTimings: {
      riskScorer: duration,
    }
  };
}
