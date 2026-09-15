import { AgentState } from '../state';
import { geminiFlash, geminiPro } from '../../services/gemini.service';
import { getStudentFeedbackPrompt } from '../../prompts/studentFeedback.prompt';
import { StudentFeedback } from '../../types';
import { HumanMessage } from '@langchain/core/messages';

export async function feedbackGeneratorNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];
  let studentFeedback: StudentFeedback | null = null;

  try {
    const studentProfile = state.studentProfile;
    if (!studentProfile) {
      throw new Error('Student profile is missing. Cannot generate student feedback.');
    }

    const firstName = studentProfile.name.split(' ')[0] || 'Student';
    const overallAvg = state.overallAvgScore;
    const targetSubject = state.targetSubject || 'this subject';

    // Convert subjectStats record into list
    const statsList = Object.values(state.subjectStats);

    const prompt = getStudentFeedbackPrompt(
      firstName,
      targetSubject,
      overallAvg,
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
      studentFeedback = parseJSONContent<StudentFeedback>(content);
    } catch (parseErr: any) {
      errors.push(`Feedback JSON parsing failed: ${parseErr.message}`);
      throw parseErr; // fall through to the outer catch for fallback
    }
  } catch (err: any) {
    errors.push(`Feedback Generator node error: ${err.message}`);
    
    // Fallback object structure
    const statsList = Object.values(state.subjectStats || {});
    const studentProfile = state.studentProfile;
    const firstName = studentProfile ? (studentProfile.name.split(' ')[0] || 'Student') : 'Student';
    const targetSubject = state.targetSubject || 'this subject';

    studentFeedback = {
      openingLine: `Hello ${firstName}, here is a quick look at your performance in ${targetSubject}.`,
      subjectNotes: statsList.map((s) => ({
        subject: s.subject,
        note: `Your average score in ${s.subject} is ${(s.avgScore ?? 0).toFixed(1)}%.`,
        tips: s.label === 'weak' || s.label === 'critical'
          ? ['Review recent assessments.', 'Ask your teacher for clarity on difficult topics.']
          : []
      })),
      closingMessage: 'Keep up the effort. Consistent practice makes a big difference!'
    };
  }

  const duration = Date.now() - startTime;

  return {
    studentFeedback,
    errors,
    nodeTimings: {
      feedbackGenerator: duration,
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
