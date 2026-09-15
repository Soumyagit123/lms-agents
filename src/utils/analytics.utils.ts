/**
 * Calculate the standard deviation of an array of numbers.
 * Used to measure score consistency (lower standard deviation = higher consistency).
 */
export function calculateStandardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map((val) => {
    const diff = val - mean;
    return diff * diff;
  });
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Detect the trend direction based on a sequence of percentage scores.
 * Compares the average of the last 2 scores with the average of all prior scores.
 * Expects scores to be sorted in chronological order (oldest first).
 */
export function detectTrend(scores: number[]): 'improving' | 'declining' | 'stable' {
  if (scores.length < 4) {
    return 'stable'; // Not enough historical data to establish a trend
  }

  const lastTwo = scores.slice(-2);
  const historic = scores.slice(0, -2);

  const recentAvg = lastTwo.reduce((sum, s) => sum + s, 0) / lastTwo.length;
  const historicAvg = historic.reduce((sum, s) => sum + s, 0) / historic.length;

  const threshold = 5.0; // 5% threshold for improvement or decline

  if (recentAvg > historicAvg + threshold) {
    return 'improving';
  } else if (recentAvg < historicAvg - threshold) {
    return 'declining';
  } else {
    return 'stable';
  }
}
