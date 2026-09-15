import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from '../config';
import { graph } from '../agent/graph';
import { lmsApiService } from '../services/lmsApi.service';
import { geminiPro } from '../services/gemini.service';
import { cacheService } from '../services/cache.service';
import { getSubjectAnalysisPrompt } from '../prompts/subjectAnalysis.prompt';
import { getAttemptAnalysisPrompt } from '../prompts/attemptAnalysis.prompt';
import { HumanMessage } from '@langchain/core/messages';

const app = express();
const PORT = config.port || 3002;

app.use(cors());
app.use(express.json());

// Removed static dashboard UI

function buildInitialState(studentId: string, subjectId: string) {
  return {
    studentId,
    schoolId: '',
    classId: '',
    mode: 'student' as const,
    triggeredBy: 'on-demand' as const,
    targetSubject: subjectId,  // passed to dataFetcher to call the correct endpoint
    rawResults: [],
    assessmentMeta: {},
    subjectStats: {},
    overallAvgScore: 0,
    riskScore: 0,
    riskLevel: 'low' as const,
    weakSubjects: [],
    strongSubjects: [],
    studentFeedback: null,
    adminReport: null,
    report: null,
    reportSavedAt: null,
    errors: [],
    nodeTimings: {}
  };
}

/**
 * SSE Streaming Endpoint — streams real-time node progress to the browser
 * Frontend uses EventSource to listen for 'node_update' and 'complete' events
 */
app.get('/api/reports/student/:id/subject/:subjectId/stream', async (req, res) => {
  const studentId = req.params.id;
  const subjectId = req.params.subjectId;
  console.log(`\n[API-STREAM] Starting streaming analysis for student: ${studentId}, subject: ${subjectId}`);

  // SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const NODE_LABELS: Record<string, string> = {
    dataFetcher:       '📡 Node 1: Fetching student data from LMS...',
    preprocessor:      '⚙️  Node 2: Normalising scores and subject groups...',
    subjectAnalyzer:   '📊 Node 3: Analysing subject trends & performance...',
    riskScorer:        '⚠️  Node 4: Calculating risk score...',
    feedbackGenerator: '🤖 Node 5: Gemini generating personalised feedback...',
    adminRecommender:  '📋 Node 6: Gemini writing educator coaching report...',
    reportBuilder:     '📝 Node 7: Assembling final report & badges...',
  };

  try {
    send('status', { message: '🚀 LangGraph pipeline starting...', step: 0, total: 7 });

    const NODE_ORDER = ['dataFetcher','preprocessor','subjectAnalyzer','riskScorer','feedbackGenerator','adminRecommender','reportBuilder'];
    let stepIndex = 0;
    let lastState: any = null;

    // streamMode: "values" gives us the FULL accumulated state after each node.
    // The last chunk IS the final state — no second invoke() needed.
    for await (const stateSnapshot of await graph.stream(buildInitialState(studentId, subjectId), { streamMode: 'values' })) {
      lastState = stateSnapshot;
      stepIndex++;

      // Identify which node just ran by comparing step index to node order
      const nodeName = NODE_ORDER[stepIndex - 1] || `step_${stepIndex}`;
      const label = NODE_LABELS[nodeName] || `🔄 Running node: ${nodeName}`;
      const timings = stateSnapshot?.nodeTimings || {};
      const duration = timings[nodeName] ? `${timings[nodeName]}ms` : null;

      // Collect only THIS node's errors (not all accumulated errors)
      const allErrors: string[] = stateSnapshot?.errors || [];
      const nodeErrors = allErrors.filter((e: string) =>
        e.toLowerCase().includes(nodeName.toLowerCase().replace('node','').trim())
      );

      send('node_update', {
        node: nodeName,
        label,
        step: stepIndex,
        total: 7,
        duration,
        hasError: nodeErrors.length > 0,
        errorMessage: nodeErrors[0] || null,
      });

      console.log(`[STREAM] Node complete: ${nodeName} (${duration || '?ms'})`);
    }

    // Use the last accumulated state as the final result — no second invoke() needed!
    if (!lastState || !lastState.report) {
      const errors = lastState?.errors || ['Pipeline produced no report'];
      console.warn('[API-STREAM] Pipeline completed with errors:', errors);
      send('error', { message: 'Failed to build report', details: errors });
      res.end();
      return;
    }

    if (lastState.errors?.length > 0) {
      console.warn('[API-STREAM] Pipeline completed with errors:', lastState.errors);
    }

    send('complete', { report: lastState.report });
    res.end();

  } catch (err: any) {
    console.error('[API-STREAM] Pipeline crashed:', err);
    send('error', { message: 'Critical pipeline error', details: err.message });
    res.end();
  }
});

/**
 * Original REST Endpoint (kept for backward compatibility)
 */
app.get('/api/reports/student/:id/subject/:subjectId', async (req, res) => {
  const studentId = req.params.id;
  const subjectId = req.params.subjectId;
  console.log(`\n[API] Running analysis graph on-demand for student: ${studentId}, subject: ${subjectId}`);

  try {
    const result = await graph.invoke(buildInitialState(studentId, subjectId));
    
    if (result.errors && result.errors.length > 0) {
      console.warn('[API] Pipeline completed with errors:', result.errors);
    }

    if (!result.report) {
      return res.status(500).json({ 
        error: 'Failed to build report', 
        details: result.errors 
      });
    }

    return res.json(result.report);
  } catch (err: any) {
    console.error('[API] Pipeline execution crashed:', err);
    return res.status(500).json({ 
      error: 'Critical server error running analysis', 
      details: err.message 
    });
  }
});

/**
 * ----------------------------------------------------
 * NEW ENDPOINTS FOR SPECIFIC JSON STRUCTURES
 * ----------------------------------------------------
 */

// 1. Subject AI Analysis
app.get('/api/reports/student/:id/subject-ai/:subjectId', async (req, res) => {
  const studentId = req.params.id;
  const subjectId = req.params.subjectId;
  const authHeader = req.headers.authorization;
  const cacheKey = `ai:subject:${studentId}:${subjectId}`;

  try {
    // Check Cache (DISABLED TEMPORARILY)
    // const cached = await cacheService.get(cacheKey);
    // if (cached) {
    //   return res.json({ success: true, data: cached });
    // }

    // Fetch Data using the CORRECT endpoint that gets the whole data
    const fullData = await lmsApiService.getSubjectPerformanceData(studentId, subjectId, authHeader);
    if (!fullData || !fullData.data) {
      throw new Error('Failed to parse subject performance payload');
    }
    const dataFromLms = fullData.data;

    const subjectName = dataFromLms.subject?.name || 'Unknown Subject';
    const subjectCode = dataFromLms.subject?.code || 'SUB_' + subjectId;
    const studentName = dataFromLms.student?.fullName || 'Unknown Student';
    
    // Map results from the trend array
    const results = (dataFromLms.trend || []).map((asm: any) => ({
      assessmentId: asm.assessmentId?.toString() || '0',
      rawScore: asm.scoreObtained || 0,
      attemptedAt: asm.attemptedAt || new Date().toISOString()
    }));

    // Build stats
    const avgScore = results.length ? results.reduce((acc: number, r: any) => acc + r.rawScore, 0) / results.length : 0;
    const stats = {
      subject: subjectName,
      avgScore: avgScore * 10, // Adjusting scale if needed
      minScore: 0,
      maxScore: 100,
      attemptCount: results.length,
      trend: 'stable' as const,
      label: 'average' as const
    };

    // Prompt Gemini
    const prompt = getSubjectAnalysisPrompt(studentName, subjectName, subjectCode, JSON.stringify(dataFromLms.trend || [], null, 2), stats);
    const response = await geminiPro.invoke([new HumanMessage(prompt)]);
    
    // Parse
    const text = response.content.toString().replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(text);
    data.generatedAt = new Date().toISOString();

    // Save to Cache
    await cacheService.set(cacheKey, data, 86400 * 30);

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Subject AI Analysis Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Specific Exam AI Analysis
app.get('/api/reports/student/:id/subject/:subjectId/attempt-ai/:attemptId', async (req, res) => {
  const studentId = req.params.id;
  const subjectId = req.params.subjectId;
  const attemptId = req.params.attemptId;
  const authHeader = req.headers.authorization;
  const cacheKey = `ai:attempt:${studentId}:${attemptId}`;

  try {
    // Check Cache (DISABLED TEMPORARILY)
    // const cached = await cacheService.get(cacheKey);
    // if (cached) {
    //   return res.json({ success: true, data: cached });
    // }

    // Fetch Data using the CORRECT endpoint that gets the whole data
    const fullData = await lmsApiService.getSubjectPerformanceData(studentId, subjectId, authHeader);
    if (!fullData || !fullData.data) {
      throw new Error('Failed to parse subject performance payload');
    }
    const dataFromLms = fullData.data;
    const studentName = dataFromLms.student?.fullName || 'Unknown Student';
    const subjectName = dataFromLms.subject?.name || 'Unknown Subject';

    // Map results from the trend array
    const results = (dataFromLms.trend || []).map((asm: any) => ({
      assessmentId: asm.assessmentId?.toString() || '0',
      title: asm.assessmentTitle || 'Untitled',
      rawScore: asm.scoreObtained || 0,
      totalMarks: asm.maximumMarks || 10,
      attemptedAt: asm.attemptedAt || new Date().toISOString()
    }));
    
    console.log(`\n[Attempt-AI] Requested attemptId: ${attemptId}, subjectId: ${subjectId}`);
    console.log(`[Attempt-AI] LMS trend array:`, JSON.stringify(dataFromLms.trend, null, 2));

    // Find attempt (checking attemptId, assessmentId, id, resultId, or index)
    let asmMatch = dataFromLms.trend?.find((r: any) => 
      r.attemptId?.toString() === attemptId?.toString() || 
      r.assessmentId?.toString() === attemptId?.toString() ||
      r.id?.toString() === attemptId?.toString() ||
      r.resultId?.toString() === attemptId?.toString()
    );

    // Fallback: match by 1-based index if array length allows
    if (!asmMatch && dataFromLms.trend) {
      const idx = parseInt(attemptId, 10) - 1;
      if (idx >= 0 && idx < dataFromLms.trend.length) {
        asmMatch = dataFromLms.trend[idx];
      }
    }

    if (!asmMatch) {
      asmMatch = dataFromLms.trend?.[0] || {
        assessmentId: attemptId,
        assessmentTitle: 'Practice Test',
        scoreObtained: 5,
        maximumMarks: 10,
        attemptedAt: new Date().toISOString()
      };
    }

    console.log(`[Attempt-AI] Matched Assessment:`, asmMatch);
    
    const meta = {
      assessmentId: asmMatch.assessmentId || attemptId,
      title: asmMatch.assessmentTitle || asmMatch.title || 'Unknown Title',
      subject: subjectName,
      totalMarks: asmMatch.maximumMarks ?? asmMatch.totalMarks ?? 10
    };

    // Calculate historical average for context
    const avgScore = results.length ? results.reduce((acc: number, r: any) => acc + r.rawScore, 0) / results.length : 5;

    // Prompt Gemini
    const prompt = getAttemptAnalysisPrompt(studentName, JSON.stringify(asmMatch, null, 2), meta, avgScore * 10);
    const response = await geminiPro.invoke([new HumanMessage(prompt)]);
    
    // Parse
    const text = response.content.toString().replace(/```json/g, '').replace(/```/g, '').trim();
    const data = JSON.parse(text);

    // Explicitly enforce exact scores from LMS data onto the AI response
    data.attemptId = parseInt(attemptId, 10);
    data.examTitle = meta.title;
    data.subjectName = subjectName;

    const realScore = asmMatch.scoreObtained ?? asmMatch.score ?? 0;
    const realTotal = asmMatch.maximumMarks ?? asmMatch.totalMarks ?? 10;
    const realPct = Math.round((realScore / realTotal) * 100);

    data.metrics = data.metrics || {};
    data.metrics.scoreObtained = realScore;
    data.metrics.totalMarks = realTotal;
    data.metrics.percentage = realPct;
    data.metrics.isPassed = realPct >= 50;
    data.metrics.grade = realPct >= 90 ? 'A+' : realPct >= 80 ? 'A' : realPct >= 70 ? 'B' : realPct >= 60 ? 'C' : realPct >= 50 ? 'D' : 'F';

    // Save to Cache
    await cacheService.set(cacheKey, data, 86400 * 30);

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error('Attempt AI Analysis Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Removed fallback SPA routing

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` LMS Analysis Microservice running on port ${PORT}`);
  console.log(` API Endpoints available at: http://localhost:${PORT}/api/reports/...`);
  console.log(`==================================================`);
});
