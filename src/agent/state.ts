import { Annotation } from '@langchain/langgraph';
import { StudentProfile, ResultRecord, AssessmentMeta, SubjectStats, StudentFeedback, AdminReport, FinalReport } from '../types';

export const AgentState = Annotation.Root({
  studentId: Annotation<string>(),
  schoolId: Annotation<string>(),
  classId: Annotation<string>(),
  mode: Annotation<'student' | 'class' | 'school'>(),
  triggeredBy: Annotation<'batch' | 'on-demand'>(),
  targetSubject: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),

  // Raw data loaded by Node 1
  studentProfile: Annotation<StudentProfile | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  rawResults: Annotation<ResultRecord[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  assessmentMeta: Annotation<Record<string, AssessmentMeta>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  classAverages: Annotation<Record<string, number>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),

  // Processed data
  subjectStats: Annotation<Record<string, SubjectStats>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  overallAvgScore: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  riskScore: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
  riskLevel: Annotation<'low' | 'medium' | 'high' | 'critical'>({
    reducer: (x, y) => y ?? x,
    default: () => 'low',
  }),
  weakSubjects: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),
  strongSubjects: Annotation<string[]>({
    reducer: (x, y) => y ?? x,
    default: () => [],
  }),

  // AI recommendations
  studentFeedback: Annotation<StudentFeedback | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  adminReport: Annotation<AdminReport | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // Final Output
  report: Annotation<FinalReport | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  reportSavedAt: Annotation<string | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),

  // Meta tracking
  errors: Annotation<string[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
  nodeTimings: Annotation<Record<string, number>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
});
