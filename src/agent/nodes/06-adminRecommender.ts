import { AgentState } from '../state';
import { geminiFlash, geminiPro } from '../../services/gemini.service';
import { getAdminRecommendationPrompt } from '../../prompts/adminRecommendation.prompt';
import { AdminReport } from '../../types';
import { HumanMessage } from '@langchain/core/messages';

export async function adminRecommenderNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  let adminReport: AdminReport | null = null;

  try {
    const studentProfile = state.studentProfile;
    if (!studentProfile) {
      throw new Error('Student profile is missing. Cannot generate admin coaching report.');
    }

    const studentName = studentProfile.name;
    const targetSubject = state.targetSubject || 'this subject';
    const statsList = Object.values(state.subjectStats);

    const prompt = getAdminRecommendationPrompt(
      studentName,
      targetSubject,
      state.riskLevel,
      state.riskScore,
      state.overallAvgScore,
      statsList
    );

    // Pick Gemini client based on trigger type (Pro for on-demand dashboard clicks, Flash for batch)
    const model = state.triggeredBy === 'on-demand' ? geminiPro : geminiFlash;

    // Wrap the LLM call in a Promise.race to enforce a 60-second timeout
    const timeoutPromise = new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('Gemini API request timed out after 60 seconds.')), 60000)
    );

    // LangChain v2 requires HumanMessage format for Chat models
    const response = await Promise.race([
      model.invoke([new HumanMessage(prompt)]),
      timeoutPromise
    ]);

    const content = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

    try {
      adminReport = parseJSONContent<AdminReport>(content);
    } catch (parseErr: any) {
      errors.push(`Admin Report JSON parsing failed: ${parseErr.message}`);
      throw parseErr;
    }
  } catch (err: any) {
    errors.push(`Admin Recommender node error: ${err.message}`);
    
    // Fallback object structure
    const studentProfile = state.studentProfile;
    const studentName = studentProfile ? studentProfile.name : 'Student';
    const targetSubject = state.targetSubject || 'this subject';
    const statsList = state.subjectStats ? Object.values(state.subjectStats) : [];

    const urgency = state.riskLevel === 'high' || state.riskLevel === 'critical'
      ? 'urgent'
      : state.riskLevel === 'medium'
        ? 'attention'
        : 'monitor';

    adminReport = {
      urgencyLevel: urgency,
      summary: `${studentName} has an overall average of ${(state.overallAvgScore || 0).toFixed(1)}% in ${targetSubject}. Risk level: ${state.riskLevel || 'low'}.`,
      subjectActions: statsList.map((s) => ({
        subject: s.subject || targetSubject,
        action: s.label === 'weak' || s.label === 'critical'
          ? `Provide remedial study materials for ${s.subject || targetSubject}.`
          : `Continue standard curriculum for ${s.subject || targetSubject}.`,
        priority: s.label === 'critical' ? 'high' : s.label === 'weak' ? 'medium' : 'low'
      })),
      interventions: state.riskLevel === 'critical'
        ? ['Arrange immediate parent meeting', 'Schedule 1-on-1 counseling session']
        : ['Monitor performance in upcoming assessments'],
      monitoringFrequency: 'Bi-weekly evaluation'
    };
  }

  const duration = Date.now() - startTime;

  return {
    adminReport,
    errors,
    nodeTimings: {
      adminRecommender: duration,
    }
  };
}

/**
 * Clean and parse JSON response from LLM output (removes markdown code blocks if any)
 */
function parseJSONContent<T>(content: string): T {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/s, '').trim();
  }
  return JSON.parse(cleaned) as T;
}
