import { graph } from './agent/graph';

async function runEndToEndTest() {
  console.log('=== Starting LangGraph End-to-End Verification Test ===');

  const initialState = {
    studentId: 'stu_001',
    schoolId: 'sch_42',
    classId: 'cls_9A',
    mode: 'student' as const,
    triggeredBy: 'on-demand' as const,
    rawResults: [],
    assessmentMeta: {},
    classAverages: {},
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

  try {
    console.log('\nInvoking compiled LangGraph pipeline...');
    const result = await graph.invoke(initialState);

    console.log('\n--- Pipeline Run Summary ---');
    console.log(`Student ID:      ${result.studentId}`);
    console.log(`Student Name:    ${result.report?.studentName}`);
    console.log(`Class:           ${result.report?.className}`);
    console.log(`Overall Score:   ${result.report?.analytics.overallAvgScore.toFixed(2)}%`);
    console.log(`Risk Level:      ${result.report?.analytics.riskLevel.toUpperCase()} (Score: ${result.report?.analytics.riskScore.toFixed(2)})`);
    console.log(`Badges Awarded:  `, result.report?.badges);
    console.log(`Urgency Level:   ${result.report?.adminReport.urgencyLevel.toUpperCase()}`);
    
    console.log('\n--- AI Feedback Box ---');
    console.log(`Opening: ${result.report?.aiFeedback.openingLine}`);
    console.log('Subject notes:');
    result.report?.aiFeedback.subjectNotes.forEach((n: any) => {
      console.log(`  - ${n.subject}: ${n.note}`);
      if (n.tips && n.tips.length > 0) {
        console.log(`    Tips: ${n.tips.join(' | ')}`);
      }
    });
    console.log(`Closing: ${result.report?.aiFeedback.closingMessage}`);

    console.log('\n--- Admin Recommendations ---');
    console.log(`Summary:      ${result.report?.adminReport.summary}`);
    console.log(`Interventions:`, result.report?.adminReport.interventions);
    console.log(`Frequency:    ${result.report?.adminReport.monitoringFrequency}`);

    console.log('\nNode Timings (ms):');
    console.dir(result.nodeTimings);

    console.log('\nAccumulated Errors:', result.errors);
    console.log('\n=== Verification Test Complete ===');
  } catch (err) {
    console.error('Pipeline crashed:', err);
  }
}

runEndToEndTest();
