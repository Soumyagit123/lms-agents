/**
 * Calculate approximation of student percentile rank in a subject based on class average gap.
 */
export function estimatePercentileRank(classGap: number): number {
  if (classGap >= 20) return 90;
  if (classGap >= 10) return 75;
  if (classGap >= 0) return 50;
  if (classGap >= -10) return 25;
  return 10;
}

/**
 * Calculate the overall academic risk score (0 to 100) based on multiple parameters.
 */
export function calculateRiskScore(
  overallAvgScore: number,
  decliningSubjectsCount: number,
  weakSubjectsCount: number,
  missedAssessmentRatio: number
): number {
  const declineTrendPenalty = decliningSubjectsCount * 8;
  
  const rawRisk = 
    (100 - overallAvgScore) * 0.40 +
    declineTrendPenalty * 0.30 +
    (weakSubjectsCount * 10) * 0.20 +
    (missedAssessmentRatio * 100) * 0.10;

  // Clamp the score between 0 and 100
  return Math.max(0, Math.min(100, rawRisk));
}

/**
 * Categorize risk score into human-readable risk levels.
 */
export function determineRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score <= 25) return 'low';
  if (score <= 50) return 'medium';
  if (score <= 75) return 'high';
  return 'critical';
}
