import axios from 'axios';
import { config } from '../config';
import { StudentProfile, ResultRecord, AssessmentMeta } from '../types';

let currentAccessToken = config.lmsAuthToken;

const httpClient = axios.create({
  baseURL: config.lmsBaseUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
});

// Attach token to every request
httpClient.interceptors.request.use((reqConfig) => {
  if (currentAccessToken && !reqConfig.headers['Authorization']) {
    reqConfig.headers['Authorization'] = `Bearer ${currentAccessToken}`;
  }
  return reqConfig;
});

// Auto-refresh on 401
let isRefreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

httpClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        // Queue the request while refresh is in progress
        return new Promise((resolve) => {
          refreshQueue.push((token: string) => {
            originalRequest.headers['Authorization'] = `Bearer ${token}`;
            resolve(httpClient(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        console.log('[LMS API] Access token expired, attempting refresh...');
        const refreshRes = await axios.post(
          `${config.lmsBaseUrl}/auth/refresh`,
          {},
          {
            headers: {
              Cookie: `refreshToken=${config.lmsRefreshToken}`,
              'Content-Type': 'application/json',
            },
            withCredentials: true,
          }
        );

        const newToken = refreshRes.data?.data?.accessToken || refreshRes.data?.accessToken;
        if (!newToken) throw new Error('No access token in refresh response');

        currentAccessToken = newToken;
        console.log('[LMS API] Token refreshed successfully.');

        // Flush the queue
        refreshQueue.forEach((cb) => cb(newToken));
        refreshQueue = [];

        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return httpClient(originalRequest);
      } catch (refreshErr: any) {
        console.error('[LMS API] Token refresh failed:', refreshErr.message);
        refreshQueue = [];
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);


export const lmsApiService = {
  /**
   * Fetch student profile information
   */
  async getStudentProfile(studentId: string): Promise<StudentProfile> {
    const response = await httpClient.get<StudentProfile>(`/students/${studentId}/profile`);
    return response.data;
  },

  /**
   * Fetch student's raw assessment attempts
   */
  async getStudentResults(studentId: string): Promise<ResultRecord[]> {
    const response = await httpClient.get<ResultRecord[]>(`/students/${studentId}/results`);
    return response.data;
  },

  /**
   * Fetch assessment metadata
   */
  async getAssessmentMeta(assessmentId: string): Promise<AssessmentMeta> {
    const response = await httpClient.get<AssessmentMeta>(`/assessments/${assessmentId}`);
    return response.data;
  },

  /**
   * Fetch list of students in a class
   */
  async getClassStudents(classId: string): Promise<string[]> {
    const response = await httpClient.get<{ studentIds: string[] }>(`/classes/${classId}/students`);
    return response.data.studentIds;
  },

  /**
   * Fetch averages for a class per subject
   */
  async getClassSubjectAverages(classId: string): Promise<Record<string, number>> {
    const response = await httpClient.get<Record<string, number>>(`/classes/${classId}/subject-averages`);
    return response.data;
  },

  /**
   * Fetch specific subject AI performance data from new endpoint
   */
  async getSubjectPerformanceData(studentId: string, subjectId: string, authHeader?: string): Promise<any> {
    // The endpoint is /api/v1/student/ai-performance/subjects/${subjectId}
    // Assuming config.lmsBaseUrl is http://13.63.27.242/api/v1
    const reqConfig: any = {};
    if (authHeader) {
      reqConfig.headers = { 'Authorization': authHeader };
    }
    const response = await httpClient.get(`/student/ai-performance/subjects/${subjectId}`, reqConfig);
    return response.data;
  },

  /**
   * Fetch classes in a school
   */
  async getSchoolClasses(schoolId: string): Promise<string[]> {
    const response = await httpClient.get<{ classIds: string[] }>(`/schools/${schoolId}/classes`);
    return response.data.classIds;
  }
};
