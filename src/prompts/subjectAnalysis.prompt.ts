import { SubjectStats, ResultRecord } from '../types';

export function getSubjectAnalysisPrompt(
  studentName: string,
  subjectName: string,
  subjectCode: string,
  historicalAttemptsJson: string,
  stats: SubjectStats
): string {

  return `You are a professional academic AI coach. Analyze the student's historical performance in the specified subject.
You MUST respond with ONLY a valid JSON object matching the provided JSON schema. Do not wrap it in markdown block quotes.

Student Name: ${studentName}
Subject: ${subjectName} (${subjectCode})
Overall Subject Average: ${stats.avgScore}%
Number of Assessments Taken: ${stats.attemptCount}

Raw Performance History Data from LMS:
${historicalAttemptsJson}

JSON Schema Requirements:
{
    "subjectId": <number>,
    "subjectName": "${subjectName}",
    "subjectCode": "${subjectCode}",
    "isSufficientData": <boolean based on attemptCount >= 2>,
    "generatedAt": "<current ISO timestamp>",
    "overview": {
        "currentAverage": <number>,
        "currentGrade": "<A, B, C, D, or F based on currentAverage>",
        "assessmentsCount": <number>,
        "latestScore": <number>,
        "previousScore": <number>,
        "trend": "<e.g., 'Declining trend — Requires revision' or 'Improving trend — Keep it up'>",
        "isImproving": <boolean>
    },
    "strengths": [
        "<string: e.g., 'Strong mastery in [Topic]'>",
        ...
    ],
    "areasForImprovement": [
        "<string: e.g., 'Review recent test questions where points were lost under time constraints'>",
        ...
    ],
    "trendAnalysis": {
        "previousAverage": <number>,
        "currentAverage": <number>,
        "improvementPercent": "<string with % sign, e.g. '+10%' or '-5%'>",
        "trendSummary": "<string summarizing the trend>"
    },
    "recommendedActions": [
        "<string: actionable study recommendation>",
        ...
    ],
    "recommendedStudyPlan": [
        {
            "day": "<string: e.g., 'Monday'>",
            "task": "<string: specific study task>",
            "duration": "<string: e.g., '30 min'>"
        },
        ...
    ],
    "dataTransparency": "Analysis strictly based on ${stats.attemptCount} ${subjectName} assessments."
}

INSTRUCTIONS:
1. Populate all fields intelligently based on the student's historical performance.
2. If there are no specific topics available, infer broad areas of strength and improvement from the subject.
3. Ensure the JSON is valid and can be parsed by JSON.parse().
4. Ensure numerical fields contain actual numbers, not strings.`;
}
