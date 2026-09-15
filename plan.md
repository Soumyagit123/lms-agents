# LMS Student Analysis Agent — Step-by-Step Execution Plan

This plan outlines the complete implementation of the LMS Student Analysis Agent microservice. We will first set up a mock LMS API server, followed by building the analysis agent phase-by-phase.

---

## Phase 0: Mock LMS API Server (Setup & Seed Data)

To support local development and integration testing without a live LMS backend, we will create a standalone mock server.

### File: `mock-lms-api/server.js`
A simple Node.js + Express server hosting static mock datasets and dynamic endpoints matching the required LMS APIs.

#### Required Endpoints & JSON Mock Schema:

1. **`GET /students/:id/profile`**
   - Returns details about the student, including enrolled subjects.
   - Example response:
     ```json
     {
       "studentId": "stu_001",
       "name": "Riya Sharma",
       "email": "riya.sharma@example.com",
       "classId": "cls_9A",
       "className": "Class 9-A",
       "schoolId": "sch_42",
       "schoolName": "Greenfield Academy",
       "enrolledSubjects": ["Mathematics", "Science", "English"]
     }
     ```

2. **`GET /students/:id/results`**
   - Returns all assessment results attempted by the student.
   - Example response:
     ```json
     [
       { "assessmentId": "asm_math_1", "rawScore": 42, "attemptedAt": "2026-08-01T09:00:00Z" },
       { "assessmentId": "asm_math_2", "rawScore": 38, "attemptedAt": "2026-08-10T09:00:00Z" },
       { "assessmentId": "asm_sci_1", "rawScore": 75, "attemptedAt": "2026-08-03T10:30:00Z" },
       { "assessmentId": "asm_sci_2", "rawScore": 82, "attemptedAt": "2026-08-12T10:30:00Z" },
       { "assessmentId": "asm_eng_1", "rawScore": 85, "attemptedAt": "2026-08-05T11:00:00Z" }
     ]
     ```

3. **`GET /assessments/:id`**
   - Returns metadata for a specific assessment.
   - Example response for `asm_math_1`:
     ```json
     {
       "assessmentId": "asm_math_1",
       "title": "Algebra Quiz 1",
       "subject": "Mathematics",
       "totalMarks": 100
     }
     ```

4. **`GET /classes/:id/students`**
   - Returns all student IDs belonging to the class.
   - Example response:
     ```json
     {
       "classId": "cls_9A",
       "studentIds": ["stu_001", "stu_002", "stu_003"]
     }
     ```

5. **`GET /classes/:id/subject-averages`**
   - Returns class average scores (as percentages) per subject.
   - Example response:
     ```json
     {
       "classId": "cls_9A",
       "averages": {
         "Mathematics": 63.5,
         "Science": 74.2,
         "English": 81.0
       }
     }
     ```

6. **`GET /schools/:id/classes`**
   - Returns all class IDs belonging to the school.
   - Example response:
     ```json
     {
       "schoolId": "sch_42",
       "classIds": ["cls_9A", "cls_9B"]
     }
     ```

---

## Phase 1: Project Setup & Base Architecture

### Tasks:
1. Initialize the node project inside `Lms-analysis-agent`.
2. Configure `package.json` with scripts for dev, build, and worker execution.
3. Configure typescript compilation in `tsconfig.json` for ES2022 and CommonJS module support.
4. Establish config management reading environment variables from `.env`.
5. Implement common type definitions inside `src/types/index.ts`.
6. Implement baseline services:
   - `lmsApi.service.ts`: Axios wrapper calling Phase 0 mock endpoints.
   - `cache.service.ts`: Redis connection helper.
   - `gemini.service.ts`: LangChain Google Gemini client initialization.

---

## Phase 2: Agent Core & Pure Logic Nodes (1 to 4)

We will build the first 4 nodes of the LangGraph agent, which contain pure analytical calculations.

### Tasks:
1. **`scoring.utils.ts` & `analytics.utils.ts`**: Write utilities to calculate standard deviations, trends, and risk scores.
2. **`src/agent/state.ts`**: Declare initial state setup and LangGraph channels.
3. **Node 1: Data Fetcher (`src/agent/nodes/01-dataFetcher.ts`)**
   - Fetches profile, history, metadata, and averages using `Promise.all` for speed.
4. **Node 2: Preprocessor (`src/agent/nodes/02-preprocessor.ts`)**
   - Normalizes scores, groups them by subject, and calculates averages and class gaps.
5. **Node 3: Subject Analyzer (`src/agent/nodes/03-subjectAnalyzer.ts`)**
   - Computes subject trends (improving/declining/stable), consistency metrics, and applies threshold labels (`strong`, `average`, `weak`, `critical`).
6. **Node 4: Risk Scorer (`src/agent/nodes/04-riskScorer.ts`)**
   - Evaluates overall risk score (0–100) using weights.
7. **Verification Test Script**: Run a scratch script in local shell validating state transformation through Nodes 1-4.

---

## Phase 3: AI Prompts, LLM Integration & Graph Assembly (Nodes 5 to 7)

### Tasks:
1. **Prompts (`src/prompts/`)**:
   - Write templates enforcing JSON output formatting for both student-facing feedback and admin reports.
2. **Node 5: Feedback Generator (`src/agent/nodes/05-feedbackGenerator.ts`)**
   - Wires Gemini to generate friendly, constructive study tips and feedback.
3. **Node 6: Admin Recommender (`src/agent/nodes/06-adminRecommender.ts`)**
   - Wires Gemini to write structured coaching reports for educators.
4. **Node 7: Report Builder (`src/agent/nodes/07-reportBuilder.ts`)**
   - Auto-awards achievement badges and writes the output payload to Redis.
5. **LangGraph Assembly (`src/agent/graph.ts`)**
   - Wires all nodes sequentially and compiles the executable graph.
6. **E2E Node Test**: Execute the compiled graph using a script and confirm output matches the final schema.

---

## Phase 4: Job Queue, Scheduler & Express API Server

### Tasks:
1. **Express Server (`src/api/server.ts`)**:
   - Implement routes `/api/analyze/*` (enqueues jobs) and `/api/reports/*` (fetches cached/DB reports).
2. **Job Queue (`src/workers/analysisWorker.ts`)**:
   - Establish BullMQ workers listening for analysis tasks, compiling the graph, and processing them.
3. **Scheduler (`src/workers/scheduler.ts`)**:
   - Set up repeatable cron job in BullMQ to trigger nightly school-wide analysis.
4. **WebSockets**:
   - Integrate `ws` package in server to broadcast completion notifications for on-demand requests.

---

## Phase 5: Angular Frontend & Dashboard Charts

### Tasks:
1. **Angular API Services**:
   - Set up `reports.service.ts` and `analysis.service.ts` utilizing Angular Signals for state management.
2. **Student Dashboard View**:
   - Build a layout displaying:
     - Radar chart (Performance Radar) using Apache ECharts.
     - Multi-line chart (Subject Trends).
     - AI coach feedback box.
     - Auto-awarded badge collection.
3. **Teacher / Admin View**:
   - Build tables displaying at-risk students, priority recommendations, and a color-coded heatmap (Subject Health Matrix).
4. **Tenant View**:
   - Build class-by-class comparison charts and overall risk trends.
