import { AgentState } from '../state';
import { cacheService } from '../../services/cache.service';
import { FinalReport } from '../../types';

export async function reportBuilderNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  let report: FinalReport | null = null;
  const timestamp = new Date().toISOString();

  try {
    const statsList = Object.values(state.subjectStats);
    
    // --- Badge Awarding Logic ---
    const badges: string[] = [];

    if (statsList.length > 0) {
      // 1. Subject Star: any subject labeled "strong" (avgScore >= 75%)
      const hasStrong = statsList.some((s) => s.label === 'strong');
      if (hasStrong) {
        badges.push('Subject Star');
      }

      // 2. Most Improved: any subject with "improving" trend
      const hasImproving = statsList.some((s) => s.trend === 'improving');
      if (hasImproving) {
        badges.push('Most Improved');
      }

      // 3. Consistent Performer: standard deviation below 10 for all subjects
      const isConsistent = statsList.every((s) => s.consistency !== undefined && s.consistency < 10);
      if (statsList.length > 0 && isConsistent) {
        badges.push('Consistent Performer');
      }

      // 4. Never Miss a Beat: zero missed assessments overall
      const totalMissed = statsList.reduce((sum, s) => sum + (s.missedCount || 0), 0);
      if (statsList.length > 0 && totalMissed === 0 && statsList.every(s => s.missedCount !== undefined)) {
        badges.push('Never Miss a Beat');
      }

      // 5. Top of Class: percentile rank >= 80 (classGap >= 15%)
      const isTopClass = statsList.some((s) => (s.percentileRank && s.percentileRank >= 80) || (s.classGap && s.classGap >= 15));
      if (isTopClass) {
        badges.push('Top of Class');
      }
    }

    // Assemble final report object
    report = {
      studentId: state.studentId,
      studentName: state.studentProfile?.name || 'Student',
      className: state.studentProfile?.className || 'N/A',
      schoolName: state.studentProfile?.schoolName || 'N/A',
      targetSubject: state.targetSubject || 'all',
      generatedAt: timestamp,
      triggeredBy: state.triggeredBy,
      analytics: {
        overallAvgScore: state.overallAvgScore,
        riskLevel: state.riskLevel,
        riskScore: state.riskScore,
        subjectBreakdown: statsList,
        weakSubjects: state.weakSubjects,
        strongSubjects: state.strongSubjects,
      },
      aiFeedback: state.studentFeedback || {
        openingLine: 'Report generated successfully.',
        subjectNotes: [],
        closingMessage: 'Keep learning!',
      },
      badges,
      adminReport: state.adminReport || {
        urgencyLevel: 'monitor',
        summary: 'Report generated successfully. No critical alerts.',
        subjectActions: [],
        interventions: [],
        monitoringFrequency: 'Regular monitoring',
      },
    };

    // Save to Redis Cache (TTL: 7 days = 604800 seconds)
    const cacheKey = `report:${state.studentId}`;
    await cacheService.set(cacheKey, report, 604800);
  } catch (err: any) {
    errors.push(`Report Builder node error: ${err.message}`);
  }

  const duration = Date.now() - startTime;

  return {
    report,
    reportSavedAt: timestamp,
    errors,
    nodeTimings: {
      reportBuilder: duration,
    }
  };
}
