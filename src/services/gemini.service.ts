import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { config } from '../config';

// NOTE: config/index.ts sets process.env.GOOGLE_API_KEY from GEMINI_API_KEY
// LangChain v2's ChatGoogleGenerativeAI auto-reads GOOGLE_API_KEY — no need to pass apiKey

class MockChatGemini {
  private modelName: string;
  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async invoke(messages: any) {
    const prompt = Array.isArray(messages) ? messages[0]?.content || '' : messages;
    console.log(`\n[Mock Gemini - ${this.modelName}] Processing request (offline mock)...`);
    
    // Warning text to show on UI
    const warningMessage = "AI Assistant Offline";
    const dataTransparencyWarning = "The Gemini API key is missing or invalid. Please check your .env configuration.";

    // 1. Subject AI Analysis
    if (typeof prompt === 'string' && prompt.includes('Overall Subject Average:')) {
      return {
        content: JSON.stringify({
          subjectId: 0,
          subjectName: "Subject",
          subjectCode: "N/A",
          isSufficientData: false,
          message: warningMessage,
          generatedAt: new Date().toISOString(),
          overview: { currentAverage: 0, currentGrade: "N/A", assessmentsCount: 0, latestScore: 0, previousScore: 0, trend: "N/A", isImproving: false },
          strengths: [],
          areasForImprovement: [],
          trendAnalysis: { previousAverage: 0, currentAverage: 0, improvementPercent: "0%", trendSummary: "" },
          recommendedActions: [],
          recommendedStudyPlan: [],
          dataTransparency: dataTransparencyWarning
        })
      };
    }
    
    // 2. Individual Exam AI Analysis
    if (typeof prompt === 'string' && prompt.includes('Assessment Title:')) {
      return {
        content: JSON.stringify({
          attemptId: 0,
          assessmentId: 0,
          examTitle: "Exam",
          subjectName: "Subject",
          assessmentType: "PRACTICE_TEST",
          date: new Date().toISOString(),
          metrics: { scoreObtained: 0, totalMarks: 0, percentage: 0, grade: "N/A", isPassed: false, classRank: null },
          questionSummary: { totalQuestions: 0, correctCount: 0, incorrectCount: 0, skippedCount: 0, accuracyPercentage: 0 },
          timeAnalysis: { timeSpentMinutes: 0, durationMinutes: 0, timeEfficiency: "N/A" },
          weakAreas: [warningMessage, dataTransparencyWarning],
          recommendations: ["Configure the Gemini API key to view actual recommendations."]
        })
      };
    }

    // 3. Student Feedback
    if (typeof prompt === 'string' && (prompt.includes('academic coach') || prompt.includes('student named'))) {
      return {
        content: JSON.stringify({
          openingLine: "⚠️ " + warningMessage,
          subjectNotes: [
            { subject: "System", note: dataTransparencyWarning, tips: ["Configure the .env file."] }
          ],
          closingMessage: "AI insights unavailable."
        })
      };
    } 
    
    // 4. Admin Report (Fallback)
    return {
      content: JSON.stringify({
        urgencyLevel: "monitor",
        summary: "⚠️ AI Offline: " + dataTransparencyWarning,
        subjectActions: [],
        interventions: ["Fix API key configuration"],
        monitoringFrequency: "N/A"
      })
    };
  }
}

const isMock = !config.geminiApiKey || config.geminiApiKey === 'your_gemini_api_key_here' || config.geminiApiKey.trim() === '';

if (!isMock) {
  console.log('[Gemini] API key found — using real Gemini 3.6 Flash model.');
} else {
  console.log('[Gemini] No API key — using mock fallback responses.');
}

// Gemini Flash — for batch/background jobs
// GOOGLE_API_KEY is set automatically via config/index.ts
export const geminiFlash = isMock
  ? (new MockChatGemini('gemini-3.6-flash') as any)
  : new ChatGoogleGenerativeAI({
      model: 'gemini-3.6-flash',
      temperature: 0.2,
      maxOutputTokens: 2048,
    });

// Gemini Pro — for on-demand dashboard requests (higher quality)
export const geminiPro = isMock
  ? (new MockChatGemini('gemini-3.6-flash') as any)
  : new ChatGoogleGenerativeAI({
      model: 'gemini-3.6-flash',
      temperature: 0.2,
      maxOutputTokens: 4096,
    });
