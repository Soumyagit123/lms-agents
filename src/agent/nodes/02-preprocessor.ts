import { AgentState } from '../state';
import { SubjectStats } from '../../types';
import { detectTrend } from '../../utils/analytics.utils';

export async function preprocessorNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  const subjectStats: Record<string, SubjectStats> = {};

  try {
    const rawResults = state.rawResults;
    const assessmentMeta = state.assessmentMeta;

    // Group attempts by subject (there will be one subject here: the target subject)
    const subjectAttempts: Record<string, Array<{ percentage: number; attemptedAt: string }>> = {};

    for (const result of rawResults) {
      const meta = assessmentMeta[result.assessmentId];
      if (!meta) continue;

      const totalMarks = meta.totalMarks || 100;
      const percentage = (result.rawScore / totalMarks) * 100;

      if (!subjectAttempts[meta.subject]) {
        subjectAttempts[meta.subject] = [];
      }
      subjectAttempts[meta.subject].push({
        percentage,
        attemptedAt: result.attemptedAt,
      });
    }

    for (const subject of Object.keys(subjectAttempts)) {
      const attempts = subjectAttempts[subject];

      // Sort chronologically (oldest to newest) for trend detection
      attempts.sort((a, b) => new Date(a.attemptedAt).getTime() - new Date(b.attemptedAt).getTime());

      const percentages = attempts.map((a) => a.percentage);
      const avgScore = percentages.reduce((sum, p) => sum + p, 0) / percentages.length;

      subjectStats[subject] = {
        subject,
        avgScore,
        minScore: Math.min(...percentages),
        maxScore: Math.max(...percentages),
        attemptCount: attempts.length,
        trend: detectTrend(percentages),
        label: 'average', // will be set in subjectAnalyzer
      };
    }
  } catch (err: any) {
    errors.push(`Preprocessor node error: ${err.message}`);
  }

  const duration = Date.now() - startTime;

  return {
    subjectStats,
    errors,
    nodeTimings: {
      preprocessor: duration,
    }
  };
}


