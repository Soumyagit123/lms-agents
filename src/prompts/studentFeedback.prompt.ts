import { SubjectStats } from '../types';

/**
 * Generate the prompt for the Student Feedback LLM node (subject-specific mode).
 */
export function getStudentFeedbackPrompt(
  firstName: string,
  targetSubject: string,
  overallAvg: number,
  subjectsBreakdown: SubjectStats[]
): string {
  const subjectSummary = subjectsBreakdown.map((s) =>
    `- ${s.subject}: Average score ${s.avgScore.toFixed(1)}% (${s.label}). Trend: ${s.trend}. Min: ${s.minScore.toFixed(1)}%, Max: ${s.maxScore.toFixed(1)}%, Total attempts: ${s.attemptCount}.`
  ).join('\n');

  const weakSubjects = subjectsBreakdown.filter((s) => s.label === 'weak' || s.label === 'critical');
  const weakSummary = weakSubjects.length > 0
    ? weakSubjects.map((s) => `- ${s.subject} (avg: ${s.avgScore.toFixed(1)}%)`).join('\n')
    : 'None — good work!';

  return `You are a warm, supportive, and experienced academic coach writing directly to a student named ${firstName}.
Your task: write personalized feedback on their performance in the subject: "${targetSubject}".

Student's performance data:
- Student Name: ${firstName}
- Subject: ${targetSubject}
- Overall Average Score in this subject: ${overallAvg.toFixed(1)}%
- Assessment breakdown:
${subjectSummary}

- Areas needing attention:
${weakSummary}

Instructions:
1. Write a warm opening line acknowledging ${firstName} and one specific strength or positive trend.
2. For each subject/assessment listed, write a brief note (1-2 sentences) about their performance.
3. If performance is "weak" or "critical", provide 2-3 concrete, actionable study tips.
4. Write an encouraging closing message.
5. Return ONLY a valid JSON object matching this schema. Do NOT wrap in markdown code blocks.

JSON Schema:
{
  "openingLine": "...",
  "subjectNotes": [
    {
      "subject": "${targetSubject}",
      "note": "...",
      "tips": ["...", "..."]
    }
  ],
  "closingMessage": "..."
}
`;
}

