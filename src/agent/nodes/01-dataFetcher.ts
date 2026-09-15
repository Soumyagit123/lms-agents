import { lmsApiService } from '../../services/lmsApi.service';
import { AgentState } from '../state';
import { AssessmentMeta, ResultRecord, StudentProfile } from '../../types';

export async function dataFetcherNode(state: typeof AgentState.State) {
  const startTime = Date.now();
  const errors: string[] = [];

  const studentId = state.studentId;
  // subjectId stored in targetSubject field; default to '7' for testing
  const subjectId = state.targetSubject || '7';

  let studentProfile: StudentProfile | null = null;
  let rawResults: ResultRecord[] = [];
  const assessmentMeta: Record<string, AssessmentMeta> = {};
  let targetSubjectName = '';

  try {
    const fullData = await lmsApiService.getSubjectPerformanceData(studentId, subjectId).catch((err) => {
      errors.push(`Subject data fetch failed: ${err.message}`);
      return null;
    });

    if (fullData && fullData.data) {
      const data = fullData.data;

      targetSubjectName = data.subject?.name || 'Unknown Subject';

      // Map student profile
      studentProfile = {
        studentId: data.student?.id?.toString() || studentId,
        name: data.student?.fullName || 'Unknown Student',
        email: data.student?.email || '',
        classId: data.academicContext?.class?.code || '',
        className: data.academicContext?.class?.name || 'Unknown Class',
        schoolId: data.tenant?.id?.toString() || '',
        schoolName: data.tenant?.name || 'Unknown School',
        enrolledSubjects: [targetSubjectName]
      };

      // Map assessment attempts from `trend` array.
      // Each item = one exam the student took in this subject.
      if (data.trend && Array.isArray(data.trend)) {
        data.trend.forEach((asm: any) => {
          const id = asm.assessmentId?.toString();
          if (!id) return;

          rawResults.push({
            assessmentId: id,
            rawScore: asm.scoreObtained || 0,
            attemptedAt: asm.attemptedAt || new Date().toISOString()
          });

          assessmentMeta[id] = {
            assessmentId: id,
            title: asm.assessmentTitle || 'Untitled',
            subject: targetSubjectName,
            totalMarks: asm.maximumMarks || 100
          };
        });
      }
    } else {
      errors.push('Failed to parse subject performance payload');
    }
  } catch (err: any) {
    errors.push(`Data Fetcher critical node error: ${err.message}`);
  }

  const duration = Date.now() - startTime;

  return {
    studentProfile,
    rawResults,
    assessmentMeta,
    targetSubject: targetSubjectName,
    errors,
    nodeTimings: {
      dataFetcher: duration,
    }
  };
}
