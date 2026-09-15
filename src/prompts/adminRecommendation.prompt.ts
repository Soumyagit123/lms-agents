import { SubjectStats } from '../types';

/**
 * Generate the prompt for the Admin Recommendation LLM node.
 */
export function getAdminRecommendationPrompt(
  studentName: string,
  targetSubject: string,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  riskScore: number,
  overallAvg: number,
  subjectsBreakdown: SubjectStats[]
): string {
  const subjectSummary = subjectsBreakdown.map((s) => {
    return `- ${s.subject}: Avg ${s.avgScore.toFixed(1)}% (${s.label}) | Trend: ${s.trend} | Min: ${s.minScore.toFixed(1)}% | Max: ${s.maxScore.toFixed(1)}%`;
  }).join('\n');

  return `You are a professional academic performance analyst writing a diagnostic coaching report for a school teacher or administrator. 
Your goal is to provide a data-driven, actionable intervention plan for a student named ${studentName}, specifically regarding their performance in ${targetSubject}.

Here is the student's analytical profile:
- Student Name: ${studentName}
- Target Subject: ${targetSubject}
- Calculated Risk Level: ${riskLevel.toUpperCase()} (Score: ${riskScore.toFixed(1)}/100)
- Overall average in this subject: ${overallAvg.toFixed(1)}%
- Assessment metrics:
${subjectSummary}

Instructions:
1. Determine an urgency level for intervention: "monitor" (for low risk), "attention" (for medium risk), or "urgent" (for high/critical risk).
2. Provide a 1-2 sentence concise summary of the student's status in this subject for the teacher's overview card.
3. Prescribe a specific coaching action and assign a priority level (low, medium, high).
4. List 2-3 school-level interventions (e.g. "Assign 1-on-1 peer tutor", "Place in remedial class", "Schedule parent-teacher conference").
5. Recommend a monitoring frequency (e.g., "Check again in 1 week", "Monitor after next assessment").
6. Return ONLY a valid JSON object matching the JSON schema below. Do not wrap the JSON in markdown code blocks or add any other text outside the JSON.

JSON Schema:
{
  "urgencyLevel": "monitor | attention | urgent",
  "summary": "...",
  "subjectActions": [
    {
      "subject": "${targetSubject}",
      "action": "...",
      "priority": "low | medium | high"
    }
  ],
  "interventions": [
    "...",
    "..."
  ],
  "monitoringFrequency": "..."
}
`;
}
