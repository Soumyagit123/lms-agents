import { AgentState } from '../state';

export async function subjectAnalyzerNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  const subjectStats = { ...state.subjectStats };
  const weakSubjects: string[] = [];
  const strongSubjects: string[] = [];
  let overallAvgScore = 0;

  try {
    const subjects = Object.keys(subjectStats);

    if (subjects.length > 0) {
      let total = 0;
      for (const subject of subjects) {
        const stats = subjectStats[subject];

        // Assign label based on average percentage across all attempts
        if (stats.avgScore >= 75) {
          stats.label = 'strong';
          strongSubjects.push(subject);
        } else if (stats.avgScore >= 50) {
          stats.label = 'average';
        } else if (stats.avgScore >= 30) {
          stats.label = 'weak';
          weakSubjects.push(subject);
        } else {
          stats.label = 'critical';
          weakSubjects.push(subject);
        }

        total += stats.avgScore;
      }
      overallAvgScore = total / subjects.length;
    }
  } catch (err: any) {
    errors.push(`Subject Analyzer node error: ${err.message}`);
  }

  const duration = Date.now() - startTime;

  return {
    subjectStats,
    weakSubjects,
    strongSubjects,
    overallAvgScore,
    errors,
    nodeTimings: {
      subjectAnalyzer: duration,
    }
  };
}
