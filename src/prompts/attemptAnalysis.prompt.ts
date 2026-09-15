import { ResultRecord, AssessmentMeta } from '../types';

export function getAttemptAnalysisPrompt(
  studentName: string,
  attemptRawJson: string,
  meta: AssessmentMeta,
  historyAvgScore: number
): string {
  const percentage = 0; // Calculate in LLM
  
  return `You are a professional academic AI coach analyzing a specific exam attempt for a student.
You MUST respond with ONLY a valid JSON object matching the provided JSON schema. Do not wrap it in markdown block quotes.

Student Name: ${studentName}
Assessment Title: ${meta.title}
Subject: ${meta.subject}
Score Details: See Raw Data below
Total Marks: ${meta.totalMarks}
Historical Average in this Subject: ${historyAvgScore.toFixed(1)}%

Raw Assessment Attempt Data from LMS API:
${attemptRawJson}

JSON Schema Requirements:
{
    "attemptId": <number>,
    "assessmentId": <number>,
    "examTitle": "${meta.title}",
    "subjectName": "${meta.subject}",
    "assessmentType": "PRACTICE_TEST",
    "date": "<string: extract attemptedAt from raw data>",
    "metrics": {
        "scoreObtained": <number: extract score from raw data>,
        "totalMarks": ${meta.totalMarks},
        "percentage": <number>,
        "grade": "<A, B, C, D, or F based on percentage>",
        "isPassed": <boolean based on percentage >= 50>,
        "classRank": <number or null>
    },
    "questionSummary": {
        "totalQuestions": <number>,
        "correctCount": <number>,
        "incorrectCount": <number>,
        "skippedCount": <number>,
        "accuracyPercentage": <number>
    },
    "timeAnalysis": {
        "timeSpentMinutes": <number>,
        "durationMinutes": <number>,
        "timeEfficiency": "<e.g., 'Optimal Pace', 'Rushed', or 'Too Slow'>"
    },
    "weakAreas": [
        "<string: identified weak area based on context, or empty array>",
        ...
    ],
    "recommendations": [
        "<string: specific actionable recommendation for this attempt>",
        ...
    ]
}

INSTRUCTIONS:
1. Populate all fields intelligently based on the student's exam attempt.
2. For fields like 'questionSummary' and 'timeAnalysis', infer reasonable default values (e.g., totalQuestions could be totalMarks if each question is 1 mark) if you don't have the exact data.
3. Ensure the JSON is valid and can be parsed by JSON.parse().
4. Ensure numerical fields contain actual numbers, not strings.`;
}
