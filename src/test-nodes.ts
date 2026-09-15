import { dataFetcherNode } from './agent/nodes/01-dataFetcher';
import { preprocessorNode } from './agent/nodes/02-preprocessor';
import { subjectAnalyzerNode } from './agent/nodes/03-subjectAnalyzer';
import { riskScorerNode } from './agent/nodes/04-riskScorer';

async function runTest() {
  console.log('--- Starting Nodes 1-4 Verification Test ---');

  // Initial mock state
  let state: any = {
    studentId: 'stu_001',
    schoolId: 'sch_42',
    classId: 'cls_9A',
    mode: 'student',
    triggeredBy: 'on-demand',
    rawResults: [],
    assessmentMeta: {},
    classAverages: {},
    errors: [],
    nodeTimings: {}
  };

  console.log('\n[1/4] Running dataFetcherNode...');
  const fetcherResult = await dataFetcherNode(state);
  state = { ...state, ...fetcherResult };
  console.log(`Fetched student: ${state.studentProfile?.name}`);
  console.log(`Fetched results count: ${state.rawResults.length}`);
  console.log(`Fetcher errors (if any):`, state.errors);

  console.log('\n[2/4] Running preprocessorNode...');
  const preprocessorResult = await preprocessorNode(state);
  state = { ...state, ...preprocessorResult };
  console.log(`Processed subjects:`, Object.keys(state.subjectStats));
  console.log(`Preprocessor errors (if any):`, state.errors);

  console.log('\n[3/4] Running subjectAnalyzerNode...');
  const analyzerResult = await subjectAnalyzerNode(state);
  state = { ...state, ...analyzerResult };
  console.log(`Strong subjects:`, state.strongSubjects);
  console.log(`Weak subjects:`, state.weakSubjects);
  console.log(`Overall average score: ${state.overallAvgScore.toFixed(2)}%`);
  console.log(`Analyzer errors (if any):`, state.errors);

  console.log('\n[4/4] Running riskScorerNode...');
  const riskResult = await riskScorerNode(state);
  state = { ...state, ...riskResult };
  console.log(`Final Risk Score: ${state.riskScore.toFixed(2)}/100`);
  console.log(`Final Risk Level: ${state.riskLevel}`);
  console.log(`Risk scorer errors (if any):`, state.errors);

  console.log('\nSubject Detailed Statistics:');
  console.dir(state.subjectStats, { depth: null });
  console.log('\nTimings:', state.nodeTimings);
  console.log('--- Verification Test Complete ---');
}

runTest().catch((err) => {
  console.error('Test execution failed:', err);
});
