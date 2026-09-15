# LMS Student Analysis Agent — Implementation Plan

> **Stack:** Node.js · TypeScript · LangChain.js · LangGraph · Google Gemini · BullMQ · Redis · Angular

---

## What This System Does

An AI-powered analysis layer that sits on top of your existing LMS. It reads every student's assessment and quiz results, runs them through an intelligent pipeline, and produces:

- **Personalized feedback** for the student (subject-by-subject, in plain language)
- **Coaching recommendations** for the school admin / teacher
- **Analytics dashboards** for three roles: Student, Admin/Teacher, School Tenant

---

## Who It Serves

| Persona | Gets |
|---------|------|
| **Student** | Their own performance breakdown, subject labels, AI feedback, badges |
| **Teacher / Admin** | Class overview, at-risk student list, coaching actions per student |
| **School / Tenant** | School-wide KPIs, class comparisons, intervention summary |

---

## System Layers

```
┌────────────────────────────────────────────────────────────┐
│                   ANGULAR DASHBOARD                        │
│   Student View  ·  Admin/Teacher View  ·  School/Tenant    │
└──────────────────────────┬─────────────────────────────────┘
                           │ REST API + WebSocket
┌──────────────────────────▼─────────────────────────────────┐
│             NODE.JS API SERVER  (Express)                  │
│  Trigger analysis · Serve reports · Auth middleware        │
└──────────────────────────┬─────────────────────────────────┘
                           │
                    ┌──────▼──────┐
                    │  JOB QUEUE  │  BullMQ + Redis
                    │  Nightly    │  Scheduled cron
                    │  On-Demand  │  API-triggered
                    └──────┬──────┘
                           │  Worker picks up job
┌──────────────────────────▼─────────────────────────────────┐
│         LANGGRAPH AGENT PIPELINE  (TypeScript)             │
│                                                            │
│   [1] Data Fetcher                                         │
│        ↓                                                   │
│   [2] Preprocessor                                         │
│        ↓                                                   │
│   [3] Subject Analyzer                                     │
│        ↓                                                   │
│   [4] Risk Scorer                                          │
│        ↓                                                   │
│   [5] Feedback Generator  ← Gemini LLM                    │
│        ↓                                                   │
│   [6] Admin Recommender   ← Gemini LLM                    │
│        ↓                                                   │
│   [7] Report Builder                                       │
│        ↓                                                   │
│       END → Save report → Notify dashboard                 │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│             YOUR EXISTING LMS APIS                         │
│   Results · Students · Assessments · Classes · Subjects    │
└────────────────────────────────────────────────────────────┘
```

---

## Analysis Trigger Strategy

### Primary Trigger — Post-Assessment Submission

Every time a student submits an assessment or quiz, the **LMS backend already saves the result to the database**. Immediately after saving, it calls the analysis service via a webhook. This is the main and only required trigger.

```
Student submits assessment / quiz
        ↓
LMS backend saves result to DB  (already done in your system)
        ↓
LMS backend calls:  POST /api/analyze/student/:studentId
  (with the studentId in the body — no result data needed,
   the agent will fetch all results directly from the LMS API)
        ↓
Analysis API server receives the call
  → Validates the request
  → Enqueues one job in BullMQ for this student
  → Returns 202 Accepted immediately  (non-blocking)
        ↓
BullMQ Worker picks up the job (usually within 1–3 seconds)
  → Fetches the student's FULL result history from LMS API
    (all assessments ever taken, all subjects)
  → Runs the 7-node LangGraph agent
  → Saves the updated report
        ↓
WebSocket fires: { studentId, status: "COMPLETED" }
        ↓
Dashboard refreshes with the latest report
```

> **Why fetch ALL results, not just the latest?**
> The agent needs the full history to compute trends, percentile ranks, and risk scores accurately. A single new score only makes sense in context of all past scores.

### Secondary Trigger — On-Demand (Optional)

If an admin or student wants to manually regenerate a report at any time:

```
Admin / Student clicks "Refresh Report"
  → POST /api/analyze/student/:studentId
  → Same flow as above — job queued, agent runs, report updated
```

**Job lifecycle:** `PENDING → ACTIVE → COMPLETED | FAILED (auto-retry x3)`

---

## The LangGraph Pipeline — 7 Nodes, Linear Flow

Every node reads from and writes to a shared **Agent State** object — think of it as a notebook that fills up as the job progresses. No conditional branching. Every student goes through all 7 nodes in order.

> **What triggers a run:** The LMS backend calls `POST /api/analyze/student/:id` right after it saves a new assessment result to the database. The agent then fetches the student's complete result history (all subjects, all past assessments) and produces a fresh, updated report.

```
START
  ↓
[1] dataFetcherNode      — pulls data from LMS APIs
  ↓
[2] preprocessorNode     — cleans and groups data by subject
  ↓
[3] subjectAnalyzerNode  — scores and labels each subject
  ↓
[4] riskScorerNode       — computes overall academic risk level
  ↓
[5] feedbackGeneratorNode — Gemini writes personalized student feedback
  ↓
[6] adminRecommenderNode  — Gemini writes coaching advice for admin
  ↓
[7] reportBuilderNode     — assembles and saves the final report
  ↓
END
```

---

## Node-by-Node Breakdown

---

### Node 1 — Data Fetcher

**What it does:** Makes HTTP calls to your LMS APIs and loads everything needed for analysis into the Agent State.

**Data it collects:**

| Data | Source API | Purpose |
|------|-----------|---------|
| Student profile | `/students/:id/profile` | Name, class, school, enrolled subjects |
| Assessment results | `/students/:id/results` | All quiz/test scores with dates |
| Assessment metadata | `/assessments/:id` | Subject name, total marks |
| Class averages | `/classes/:id/subject-averages` | Benchmark: how the class scored per subject |

**Output into state:** A complete raw dataset — student info + all result records + class benchmarks.

**Error handling:** If any API call fails, it logs the error into `state.errors[]` and the pipeline continues with partial data. The report will note which data was unavailable.

---

### Node 2 — Preprocessor

**What it does:** Takes the raw results and transforms them into structured analytics-ready tables. No LLM involved — pure data processing.

**Transformations:**
- Converts every raw score to a **percentage** (score / totalMarks × 100)
- **Groups results by subject** — one bucket per enrolled subject
- Within each subject bucket, calculates:
  - Average percentage score
  - Minimum and maximum scores
  - Number of assessments attempted
  - Number of assessments missed (not attempted)
- Detects **score drops** — if the last 2 assessments are significantly lower than the earlier average, flags a "declining" trend
- Calculates the **gap vs. class average** per subject

**Output into state:** A structured map of subjects, each with clean stats ready for analysis.

---

### Node 3 — Subject Analyzer

**What it does:** Evaluates each subject independently and assigns meaningful labels and rankings. Still no LLM — logic-based.

**Per subject, it computes:**

| Metric | How |
|--------|-----|
| **Average Score** | Mean of all percentage scores in this subject |
| **Trend** | Compare last 3 assessments avg vs. earlier avg → Improving / Declining / Stable |
| **Class Rank** | Student's avg vs. all classmates' avg → percentile rank |
| **Consistency** | Standard deviation of scores — low = consistent, high = unpredictable |
| **Subject Label** | Assigned based on average score |

**Subject Labels:**

| Score Range | Label |
|-------------|-------|
| ≥ 75% | 🟢 Strong |
| 50–74% | 🟡 Average |
| 30–49% | 🟠 Weak |
| < 30% | 🔴 Critical |

**Output into state:** A fully labeled, ranked breakdown of every enrolled subject.

---

### Node 4 — Risk Scorer

**What it does:** Looks across all subjects and computes a single **overall academic risk level** for the student.

**Risk Formula (weighted score out of 100):**

```
Risk Score =
  (100 − overallAvgScore)        × 0.40   ← how low are the scores overall?
  + declineTrendPenalty          × 0.30   ← are things getting worse?
  + (weakSubjectCount × 10)      × 0.20   ← how many subjects are in danger?
  + (missedAssessmentRatio × 100)× 0.10   ← is the student skipping tests?
```

**Risk Levels:**

| Score | Level | Meaning |
|-------|-------|---------|
| 0–25 | 🟢 LOW | Performing well overall |
| 26–50 | 🟡 MEDIUM | Some subjects need attention |
| 51–75 | 🟠 HIGH | Multiple weak areas, needs intervention |
| 76–100 | 🔴 CRITICAL | Urgent — at serious academic risk |

**Output into state:** `riskLevel`, `riskScore`, `weakSubjects[]`, `strongSubjects[]`

---

### Node 5 — Feedback Generator *(Gemini LLM)*

**What it does:** Uses Google Gemini to write warm, personalized feedback **for the student** — in plain language they can understand and act on.

**Input given to Gemini (structured summary, not raw data):**
- Student's first name
- Each subject: name, label (Strong/Weak/etc.), trend direction, score vs. class avg
- List of weak subjects with specific improvement notes
- Overall risk level
- Whether they're improving or declining overall

**What Gemini writes:**
1. An opening line acknowledging something specific they did well
2. A subject-by-subject section — brief, honest, and encouraging per subject
3. 2–3 specific action tips per weak subject (how to study it, not just "study harder")
4. A motivational closing tailored to their situation

**Prompt approach:** Role = "You are a warm, experienced academic coach writing to a school student. Be honest but encouraging. Use simple language."

**Gemini model:** `gemini-1.5-flash` for nightly batch · `gemini-1.5-pro` for on-demand

**Output into state:** `studentFeedback` — a structured text object with sections.

---

### Node 6 — Admin Recommender *(Gemini LLM)*

**What it does:** Uses Gemini to write a **professional coaching report for the school admin or teacher** about this student.

**Important:** Every student gets an admin report — not just high-risk ones. For low-risk students the report is brief ("Student is performing well. Continue monitoring."). For high/critical risk, it is detailed and urgent.

**Input given to Gemini:**
- Student name, class, school
- Risk level and risk score
- Subject labels and trends
- Weak subjects with gap vs. class average
- Number of missed assessments

**What Gemini writes (structured JSON output):**
- **Urgency level** (Monitor / Attention Needed / Urgent Intervention)
- **Subject-wise coaching actions** (specific per weak subject)
- **Recommended interventions** (remedial class, 1-on-1 session, parent meeting, extra assessment)
- **Monitoring frequency** (check again in 1 week / 2 weeks / next assessment)
- **Short summary** for the admin dashboard card

**Prompt approach:** Role = "You are an academic performance analyst writing a professional report for a school teacher or administrator."

**Output format:** JSON (so the dashboard can render it as structured cards, not a wall of text)

**Output into state:** `adminRecommendations` — parsed JSON object.

---

### Node 7 — Report Builder

**What it does:** Collects everything from the Agent State and assembles the final report object. Saves it to Redis (cache) and triggers a database write via your LMS API or a dedicated reports endpoint.

**Final report structure:**

```
Report
├── metadata
│     studentId, schoolId, classId
│     generatedAt (timestamp)
│     triggeredBy (batch | on-demand)
│     agentVersion
│
├── analytics
│     overallScore (%)
│     riskLevel + riskScore
│     subjectBreakdown[]
│       └── subject, avgScore, trend, rank, label
│     strongSubjects[]
│     weakSubjects[]
│
├── aiFeedback (student-facing text with sections)
│
├── adminReport (JSON with urgency, actions, monitoring)
│
└── badges[]
      (auto-awarded: "Science Star", "Most Improved", "Consistent Performer")
```

**Output:** Saved report. WebSocket event fired to notify the dashboard that the report is ready.

---

## Analysis Modes

The same 7-node pipeline runs in three modes depending on the job payload:

| Mode | Triggered By | How It Works |
|------|-------------|--------------|
| **Single Student** | On-demand click or post-assessment hook | One job, one full report |
| **Class / Batch** | Teacher's class dashboard, nightly batch | One job per student in the class, run in parallel by the worker pool, then aggregated |
| **School-wide** | Tenant dashboard, nightly batch | All classes processed → results aggregated into school-level KPIs |

Aggregation (for class/school modes) is a separate lightweight step after all student jobs complete — it summarizes risk counts, subject health scores, and top/bottom lists.

---

## Dashboard Metrics

### Student Dashboard

| Widget | Shows | Chart |
|--------|-------|-------|
| Report Card | Score per subject with label (Strong/Weak) | Color-coded score cards |
| Performance Radar | All subjects at once — visual shape of strengths | Spider / Radar Chart |
| Score Trend | Score history per subject over time | Multi-line Chart |
| AI Feedback Card | Gemini's personalized message | Rich text with sections |
| Class Standing | Percentile rank per subject | Bar with marker |
| Badges | Auto-awarded achievement badges | Badge icon grid |

### Admin / Teacher Dashboard

| Widget | Shows | Chart |
|--------|-------|-------|
| Class Overview | Avg score, pass %, at-risk count | KPI summary cards |
| Score Distribution | How many students in each score band | Histogram |
| Subject Health Matrix | Color grid: class performance per subject | Heatmap matrix |
| At-Risk Student Table | Sorted list with risk level, urgency, weak subjects | Sortable table |
| Coaching Action Cards | Per-student recommendations from Gemini | Card list |
| Top & Bottom 5 | Best and worst performing students | Ranked leaderboard |

### School / Tenant Dashboard

| Widget | Shows |
|--------|-------|
| School KPIs | % at-risk, school avg score, total students analyzed |
| Class Ranking | Which classes perform best/worst |
| Subject Weakness Map | Which subjects are consistently weak across all classes |
| Intervention Summary | Students flagged for coaching this cycle |
| Monthly School Trend | Is overall school performance improving? |

---

## API Endpoints (This Agent Service)

### Called by the LMS Backend (Webhook)

| Method | Route | Called When |
|--------|-------|-------------|
| `POST` | `/api/analyze/student/:studentId` | LMS backend calls this immediately after saving a new assessment result for this student |

Body: `{ schoolId, classId }` — the student ID comes from the URL param.

### Called by the Angular Dashboard

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/reports/student/:id` | Fetch the latest completed student report |
| `GET` | `/api/reports/class/:classId` | Fetch aggregated class report |
| `GET` | `/api/reports/school/:schoolId` | Fetch school-wide report |
| `GET` | `/api/jobs/:jobId/status` | Poll job status (PENDING / ACTIVE / COMPLETED) |
| `WS` | `/ws/student/:studentId` | WebSocket — notify dashboard when student's report is ready |

---

## LMS APIs Needed (Your Existing Backend)

| Endpoint | What It Returns |
|----------|----------------|
| `GET /students/:id/profile` | Name, class, school, enrolled subjects |
| `GET /students/:id/results` | All assessment results with scores and dates |
| `GET /assessments/:id` | Subject name, total marks |
| `GET /classes/:id/students` | All student IDs in a class |
| `GET /classes/:id/subject-averages` | Class avg score per subject |
| `GET /schools/:id/classes` | All class IDs in a school |

---

## File Structure

```
Lms-analysis-agent/
│
├── src/
│   │
│   ├── agent/                        ← LangGraph agent
│   │   ├── graph.ts                  # Defines nodes, edges, compiles the graph
│   │   ├── state.ts                  # AgentState type definition
│   │   └── nodes/
│   │       ├── 01-dataFetcher.ts     # Calls LMS APIs
│   │       ├── 02-preprocessor.ts    # Normalizes & groups data
│   │       ├── 03-subjectAnalyzer.ts # Labels and ranks subjects
│   │       ├── 04-riskScorer.ts      # Computes risk level
│   │       ├── 05-feedbackGenerator.ts  # Gemini: student feedback
│   │       ├── 06-adminRecommender.ts   # Gemini: admin coaching report
│   │       └── 07-reportBuilder.ts   # Assembles & saves final report
│   │
│   ├── prompts/                      ← Gemini prompt templates
│   │   ├── studentFeedback.prompt.ts
│   │   └── adminRecommendation.prompt.ts
│   │
│   ├── api/                          ← Express HTTP server
│   │   ├── server.ts
│   │   └── routes/
│   │       ├── analyze.routes.ts     # POST /api/analyze/*
│   │       ├── reports.routes.ts     # GET /api/reports/*
│   │       └── jobs.routes.ts        # GET /api/jobs/:id/status
│   │
│   ├── workers/                      ← BullMQ job processing
│   │   ├── analysisWorker.ts         # Picks up jobs, runs agent, saves report
│   │   └── scheduler.ts             # Nightly cron job setup
│   │
│   ├── services/
│   │   ├── lmsApi.service.ts         # HTTP wrapper for all LMS API calls
│   │   ├── gemini.service.ts         # LangChain Gemini client setup
│   │   └── cache.service.ts          # Redis get/set helpers
│   │
│   ├── utils/
│   │   ├── scoring.utils.ts          # Risk formula, percentile calculator
│   │   └── analytics.utils.ts        # Trend detection, stat helpers
│   │
│   ├── types/
│   │   └── index.ts                  # All shared TypeScript types
│   │
│   └── config/
│       └── index.ts                  # Env vars, Gemini key, Redis URL, etc.
│
├── .env
├── package.json
└── tsconfig.json
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Agent Framework | LangGraph (TypeScript) | Stateful multi-step pipeline |
| LLM Orchestration | LangChain.js | Prompt management, Gemini integration |
| LLM | Google Gemini 1.5 Flash / Pro | Flash for batch (cost), Pro for on-demand (quality) |
| API Server | Node.js + Express | Existing stack |
| Job Queue | BullMQ + Redis | Async processing, retry logic, concurrency control |
| Report Cache | Redis | Fast dashboard loads without re-running the agent |
| Scheduler | BullMQ repeatable jobs | Nightly cron without extra tooling |
| Frontend | Angular (existing) | Dashboard UI |
| Charts | Apache ECharts | Rich interactive charts (radar, heatmap, line, histogram) |
| Data Source | LMS APIs | No direct DB access — all via HTTP |

---

## Implementation Phases

| Phase | Work | Duration |
|-------|------|----------|
| **Phase 1** | Project setup: TypeScript, LangGraph, Gemini config, LMS API service, AgentState types | Week 1 |
| **Phase 2** | Build nodes 1–4: dataFetcher, preprocessor, subjectAnalyzer, riskScorer | Week 2 |
| **Phase 3** | Build nodes 5–7: feedbackGenerator (Gemini), adminRecommender (Gemini), reportBuilder | Week 3 |
| **Phase 4** | API server, BullMQ workers, nightly cron, Redis caching, WebSocket job status | Week 4 |
| **Phase 5** | Angular dashboard: student view, admin view, school view, charts, polish | Week 5–6 |
