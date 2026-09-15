export interface StudentProfile {
  studentId: string;
  name: string;
  email: string;
  classId: string;
  className: string;
  schoolId: string;
  schoolName: string;
  enrolledSubjects: string[];
}

export interface ResultRecord {
  assessmentId: string;
  rawScore: number;
  attemptedAt: string;
}

export interface AssessmentMeta {
  assessmentId: string;
  title: string;
  subject: string;
  totalMarks: number;
}

export interface SubjectStats {
  subject: string;
  avgScore: number;       // average percentage (0-100)
  minScore: number;
  maxScore: number;
  attemptCount: number;
  trend: 'improving' | 'declining' | 'stable';
  label: 'strong' | 'average' | 'weak' | 'critical';
  consistency?: number;
  missedCount?: number;
  percentileRank?: number;
  classGap?: number;
}

export interface SubjectNote {
  subject: string;
  note: string;
  tips: string[];
}

export interface StudentFeedback {
  openingLine: string;
  subjectNotes: SubjectNote[];
  closingMessage: string;
}

export interface SubjectAction {
  subject: string;
  action: string;
  priority: 'low' | 'medium' | 'high';
}

export interface AdminReport {
  urgencyLevel: 'monitor' | 'attention' | 'urgent';
  summary: string;
  subjectActions: SubjectAction[];
  interventions: string[];
  monitoringFrequency: string;
}

export interface FinalReport {
  studentId: string;
  studentName: string;
  className: string;
  schoolName: string;
  targetSubject: string;
  generatedAt: string;
  triggeredBy: 'batch' | 'on-demand';
  analytics: {
    overallAvgScore: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;
    subjectBreakdown: SubjectStats[];
    weakSubjects: string[];
    strongSubjects: string[];
  };
  aiFeedback: StudentFeedback;
  badges: string[];
  adminReport: AdminReport;
}

export interface ClassReport {
  classId: string;
  className: string;
  schoolName: string;
  generatedAt: string;
  totalStudents: number;
  classOverview: {
    avgScore: number;
    passRate: number;
    atRiskCount: number;
    criticalCount: number;
  };
  subjectHealthMatrix: Record<string, { classAvg: number; healthLabel: 'strong' | 'average' | 'weak' | 'critical' }>;
  atRiskStudents: Array<{
    studentId: string;
    name: string;
    riskLevel: 'medium' | 'high' | 'critical';
    weakSubjects: string[];
    adminSummary: string;
  }>;
  topStudents: string[]; // studentIds
  bottomStudents: string[]; // studentIds
}

export interface SchoolReport {
  schoolId: string;
  schoolName: string;
  generatedAt: string;
  totalStudents: number;
  schoolOverview: {
    avgScore: number;
    atRiskPercentage: number;
    totalClasses: number;
  };
  classComparisons: Array<{
    classId: string;
    className: string;
    avgScore: number;
    atRiskCount: number;
  }>;
  subjectWeaknessMap: Record<string, { avgScore: number; classesAffectedCount: number }>;
  interventionSummary: {
    urgentCount: number;
    attentionCount: number;
    monitorCount: number;
  };
  monthlySchoolTrend: Array<{
    month: string;
    avgScore: number;
  }>;
}

// ----------------------------------------------------
// New specific JSON types requested by user for UI integration
// ----------------------------------------------------

export interface SubjectAIAnalysisData {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  isSufficientData: boolean;
  generatedAt: string;
  overview: {
    currentAverage: number;
    currentGrade: string;
    assessmentsCount: number;
    latestScore: number;
    previousScore: number;
    trend: string;
    isImproving: boolean;
  };
  strengths: string[];
  areasForImprovement: string[];
  trendAnalysis: {
    previousAverage: number;
    currentAverage: number;
    improvementPercent: string;
    trendSummary: string;
  };
  recommendedActions: string[];
  recommendedStudyPlan: Array<{
    day: string;
    task: string;
    duration: string;
  }>;
  dataTransparency: string;
}

export interface SubjectAIAnalysisResponse {
  success: boolean;
  data: SubjectAIAnalysisData;
}

export interface SpecificAttemptAIAnalysisData {
  attemptId: number;
  assessmentId: number;
  examTitle: string;
  subjectName: string;
  assessmentType: string;
  date: string;
  metrics: {
    scoreObtained: number;
    totalMarks: number;
    percentage: number;
    grade: string;
    isPassed: boolean;
    classRank: number | null;
  };
  questionSummary: {
    totalQuestions: number;
    correctCount: number;
    incorrectCount: number;
    skippedCount: number;
    accuracyPercentage: number;
  };
  timeAnalysis: {
    timeSpentMinutes: number;
    durationMinutes: number;
    timeEfficiency: string;
  };
  weakAreas: string[];
  recommendations: string[];
}

export interface SpecificAttemptAIAnalysisResponse {
  success: boolean;
  data: SpecificAttemptAIAnalysisData;
}
