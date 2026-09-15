# LMS Analysis Agent — Project Details, Workflow & Agent Guide

> This document explains **how the system works end-to-end** — from a student submitting a quiz to seeing their AI feedback on the dashboard. It is a companion to `lms-arc.md`.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [How a Job Flows End-to-End](#2-how-a-job-flows-end-to-end)
3. [The Agent State — Shared Memory](#3-the-agent-state--shared-memory)
4. [Each Agent Node in Detail](#4-each-agent-node-in-detail)
5. [Gemini LLM — What It Receives & What It Returns](#5-gemini-llm--what-it-receives--what-it-returns)
6. [The Job Queue System](#6-the-job-queue-system)
7. [Three Analysis Modes](#7-three-analysis-modes)
8. [Dashboard Data — What the API Returns](#8-dashboard-data--what-the-api-returns)
9. [Scoring & Analytics Logic](#9-scoring--analytics-logic)
10. [Report Badges — Auto-Awarded](#10-report-badges--auto-awarded)

---

## 1. Project Overview

### What This Project Is

A **standalone TypeScript microservice** that:
- Runs independently of the main LMS backend
- Connects to the LMS via its existing REST APIs (no direct database access)
- Runs a **LangGraph AI agent pipeline** to analyze every student's performance
- Generates two outputs per student: a **student feedback card** and an **admin coaching report**
- Serves both outputs via its own REST API to the Angular dashboard

### What This Project Is NOT

- It does not replace the LMS backend
- It does not store student records itself (reads only via API)
- It does not send emails or notifications directly (those stay in the LMS)
- It does not run in real-time for every click — it uses a background job queue

---

## 2. How a Job Flows End-to-End

### The Only Required Trigger — Post-Assessment Submission

The result is already saved to your LMS database. The LMS backend just needs to call the analysis service immediately after saving. That one webhook call kicks off everything.

```
Student submits an assessment or quiz on the LMS
    │
    ▼
LMS backend saves the result to the database  ← already happening in your system
    │
    ▼
LMS backend calls:  POST /api/analyze/student/:studentId
    Body: { schoolId, classId }
    │  The agent does NOT need the result data in this call.
    │  It will fetch everything from the LMS API itself.
    │
    ▼
Analysis API server (analyze.routes.ts) receives the call
    │  Validates studentId, schoolId, classId
    │  Enqueues one job in BullMQ
    │  Returns 202 Accepted immediately  ← non-blocking, LMS backend is not waiting
    │
    ▼
BullMQ Queue: "student-analysis"
    Job sits here, picked up within 1–3 seconds
    │
    ▼
analysisWorker.ts picks up the job
    │  Initializes AgentState with { studentId, schoolId, classId }
    │  Compiles and runs the LangGraph agent
    │
    ▼
Agent runs nodes 1 → 7 sequentially
    │  Node 1 fetches the student's FULL result history
    │    (all assessments ever submitted, all subjects)
    │  Each subsequent node enriches the AgentState
    │
    ▼
Node 7 (Report Builder) saves the final report
    │  Writes to Redis cache  (key: report:{studentId}, TTL: 7 days)
    │  Persists to DB via LMS API or dedicated reports endpoint
    │
    ▼
Job marked COMPLETED in BullMQ
    │
    ▼
WebSocket fires:  { studentId, status: "COMPLETED" }
    │  If the student's dashboard is open, it auto-refreshes
    │  If not open, the new report is ready the next time they log in
```

> **Why fetch ALL results, not just the new one?**
> Trend detection, risk scoring, percentile ranking, and subject labels all depend on the full history. The latest result only makes sense in context. So every time the agent runs, it re-reads the complete history and produces a fully up-to-date report.

---

### Secondary Flow — On-Demand Refresh (Optional)

If a teacher or student wants to manually regenerate a report:

```
User clicks "Refresh Report" on the dashboard
    │
    ▼
Angular calls: POST /api/analyze/student/:studentId
    │
    ▼
Same flow as above — job enqueued → agent runs → report saved → WebSocket fires
```

---

## 3. The Agent State — Shared Memory

The **Agent State** is the central object that every node reads from and writes to. It travels through all 7 nodes. Think of it as a document that starts empty and gets filled in, section by section.

```
AgentState
│
├── INPUT (set when job starts)
│   ├── studentId         string
│   ├── schoolId          string
│   ├── classId           string
│   ├── mode              "student" | "class" | "school"
│   └── triggeredBy       "batch" | "on-demand"
│
├── RAW DATA (filled by Node 1 — Data Fetcher)
│   ├── studentProfile
│   │   ├── name, email
│   │   ├── className, schoolName
│   │   └── enrolledSubjects[]
│   ├── rawResults[]
│   │   └── { assessmentId, subject, rawScore, totalMarks, attemptedAt }
│   ├── assessmentMeta{}
│   │   └── assessmentId → { subject, totalMarks, title }
│   └── classAverages{}
│       └── subject → averageScore (%)
│
├── PROCESSED DATA (filled by Nodes 2–4)
│   ├── subjectStats{}
│   │   └── subject → {
│   │         avgScore, minScore, maxScore,
│   │         attemptCount, missedCount,
│   │         trend,        ← "improving" | "declining" | "stable"
│   │         classGap,     ← student avg − class avg
│   │         percentileRank,
│   │         consistency,  ← standard deviation
│   │         label         ← "strong" | "average" | "weak" | "critical"
│   │       }
│   ├── overallAvgScore    number (%)
│   ├── riskScore          number (0–100)
│   ├── riskLevel          "low" | "medium" | "high" | "critical"
│   ├── weakSubjects[]     subject names with label weak/critical
│   └── strongSubjects[]   subject names with label strong
│
├── AI OUTPUT (filled by Nodes 5–6)
│   ├── studentFeedback
│   │   ├── openingLine    string
│   │   ├── subjectNotes[] ← { subject, note, tips[] }
│   │   └── closingMessage string
│   └── adminReport
│       ├── urgencyLevel   "monitor" | "attention" | "urgent"
│       ├── summary        string
│       ├── subjectActions[] ← { subject, action, priority }
│       ├── interventions[]  ← ["1-on-1 session", "remedial batch"]
│       └── monitoringFrequency string
│
├── FINAL OUTPUT (filled by Node 7 — Report Builder)
│   ├── report{}           (complete structured report — see Section 8)
│   └── reportSavedAt      timestamp
│
└── META
    ├── errors[]           any API or processing errors
    └── nodeTimings{}      time each node took (for monitoring)
```

---

## 4. Each Agent Node in Detail

### Node 1 — Data Fetcher

**Role in the system:** The entry point. Gets everything the rest of the pipeline needs.

**Step-by-step work:**
1. Call `GET /students/:studentId/profile` → populates `state.studentProfile`
2. Call `GET /students/:studentId/results` → populates `state.rawResults[]`
3. For each unique `assessmentId` in results, call `GET /assessments/:id` → builds `state.assessmentMeta{}`
4. Call `GET /classes/:classId/subject-averages` → populates `state.classAverages{}`

**Design note:** Uses `Promise.all` for parallel API calls where possible to reduce total fetch time. Gracefully handles 404s (e.g. missing assessment metadata) by using defaults.

---

### Node 2 — Preprocessor

**Role in the system:** Converts raw API data into clean, grouped, percentage-based statistics.

**Step-by-step work:**
1. For each result record in `rawResults[]`:
   - Look up `assessmentMeta` to get `totalMarks` and `subject`
   - Calculate `percentage = (rawScore / totalMarks) * 100`
   - Attach it to the correct subject bucket
2. For each subject bucket:
   - Calculate `avgScore`, `minScore`, `maxScore`
   - Count `attemptCount` and `missedCount`
   - Detect score trend: compare average of the last 3 attempts vs. average of all earlier attempts
   - Calculate `classGap`: `studentAvg − classAverage[subject]`
3. Write completed `subjectStats{}` to state

---

### Node 3 — Subject Analyzer

**Role in the system:** Assigns a human-readable label and percentile rank to each subject.

**Step-by-step work:**
1. For each subject in `subjectStats{}`:
   - Assign **label** based on `avgScore`:
     - ≥75% → `strong`
     - 50–74% → `average`
     - 30–49% → `weak`
     - <30% → `critical`
   - Assign **percentile rank** using `classGap` as a proxy (positive gap = above average)
   - Calculate **consistency**: use standard deviation of scores — lower = more consistent
2. Collect all `weak` and `critical` subjects into `state.weakSubjects[]`
3. Collect all `strong` subjects into `state.strongSubjects[]`
4. Calculate `state.overallAvgScore` as the mean of all subject averages

---

### Node 4 — Risk Scorer

**Role in the system:** Produces a single number and level that summarizes how much at-risk this student is.

**Step-by-step work:**
1. Gather the four inputs to the risk formula:
   - `overallAvgScore` from state
   - `declineTrendPenalty`: count how many subjects have a "declining" trend → multiply by 8 (each declining subject adds to risk)
   - `weakSubjectCount`: number of subjects labelled weak or critical
   - `missedAssessmentRatio`: total missed / total possible across all subjects
2. Apply the weighted formula:
   ```
   riskScore =
     (100 − overallAvgScore)           × 0.40
     + declineTrendPenalty             × 0.30
     + (weakSubjectCount × 10)         × 0.20
     + (missedAssessmentRatio × 100)   × 0.10
   ```
3. Clamp result to 0–100
4. Assign `riskLevel` based on score
5. Write `riskScore` and `riskLevel` to state

---

### Node 5 — Feedback Generator *(Gemini LLM)*

**Role in the system:** Translates numbers and labels into a warm, human message the student can actually use.

**Step-by-step work:**
1. Build a structured **prompt context** object from state:
   - Student's first name
   - Each subject: label, trend, score vs. class (above/below and by how much)
   - List of weak subjects with specific data points
   - Overall risk level
   - Whether they are generally improving or declining
2. Inject context into `studentFeedback.prompt.ts` template
3. Call Gemini API via LangChain (`ChatGoogleGenerativeAI`)
4. Parse the response into structured sections:
   - `openingLine`
   - `subjectNotes[]` — one per subject (note + 2–3 tips for weak ones)
   - `closingMessage`
5. Write parsed result to `state.studentFeedback`

**Gemini model used:**
- Nightly batch → `gemini-1.5-flash` (cheaper, fast, good enough)
- On-demand → `gemini-1.5-pro` (higher quality, slightly slower)

---

### Node 6 — Admin Recommender *(Gemini LLM)*

**Role in the system:** Gives the school admin or teacher a professional, structured action plan for this student.

**Step-by-step work:**
1. Build a structured **prompt context** object from state:
   - Student name, class, school
   - Risk level and score
   - Weak subjects with scores and trend direction
   - Missed assessment count
   - Gap vs. class average per weak subject
2. Inject context into `adminRecommendation.prompt.ts` template
   - Instructs Gemini to **return structured JSON**
3. Call Gemini API
4. Parse the JSON response into:
   - `urgencyLevel`
   - `summary` (1–2 sentence overview for the admin card)
   - `subjectActions[]` (per weak subject: specific action + priority)
   - `interventions[]` (recommended actions: remedial class, 1-on-1, parent meeting)
   - `monitoringFrequency`
5. Write parsed result to `state.adminReport`

**For low-risk students:** Gemini still runs, but the prompt context signals good performance. Output will be brief — "Student is performing well. No intervention required. Continue regular monitoring."

---

### Node 7 — Report Builder

**Role in the system:** The final assembly step. Takes everything in state and packages it into the report that the dashboard will display.

**Step-by-step work:**
1. Assemble the full `report` object from state fields (see Section 8 for structure)
2. Auto-award badges based on analytics:
   - "Subject Star" → any subject labelled `strong`
   - "Most Improved" → any subject with `improving` trend AND was previously `weak`
   - "Consistent Performer" → overall consistency score below a threshold
   - "Comeback Kid" → risk level improved compared to previous report
3. Write report to **Redis** with key `report:{studentId}` (TTL: 24 hours)
4. Optionally, `POST /api/reports` on your LMS backend to persist it to the DB
5. Mark the job COMPLETED in BullMQ
6. Fire WebSocket event for on-demand jobs

---

## 5. Gemini LLM — What It Receives & What It Returns

### Student Feedback Prompt Structure

**System Role:**
> You are a warm, experienced academic coach writing directly to a school student. Be honest but always encouraging. Use simple, clear language. Avoid jargon. Address the student by first name.

**User Prompt (template):**
```
Student: {firstName}
Overall performance: {overallAvgScore}% — {aboveOrBelow} the class average
Overall trend: {improvingOrDeclining}

Subject breakdown:
{for each subject}
- {subject}: {avgScore}% ({label}) — {trend} — {classGap}% {aboveOrBelow} class average

Weak subjects requiring specific attention:
{for each weakSubject}
- {subject}: scoring {avgScore}%, class average is {classAvg}%

Please write:
1. An opening acknowledgement of something specific they did well
2. A note for each subject (2 sentences max; for weak subjects, add 2–3 concrete study tips)
3. An encouraging closing message

Format your response as JSON:
{
  "openingLine": "...",
  "subjectNotes": [
    { "subject": "...", "note": "...", "tips": ["...", "..."] }
  ],
  "closingMessage": "..."
}
```

---

### Admin Recommendation Prompt Structure

**System Role:**
> You are an academic performance analyst writing a professional report for a school teacher or administrator. Be concise, data-driven, and action-oriented.

**User Prompt (template):**
```
Student: {name} | Class: {className} | School: {schoolName}
Risk Level: {riskLevel} (Score: {riskScore}/100)
Overall avg: {overallAvgScore}% | Missed assessments: {missedCount}

Subject performance:
{for each subject}
- {subject}: {avgScore}% ({label}), trend: {trend}, {classGap}% {aboveOrBelow} class avg

Please provide a structured coaching report:
{
  "urgencyLevel": "monitor | attention | urgent",
  "summary": "1-2 sentence overview for the dashboard card",
  "subjectActions": [
    { "subject": "...", "action": "...", "priority": "low | medium | high" }
  ],
  "interventions": ["...", "..."],
  "monitoringFrequency": "..."
}
```

---

## 6. The Job Queue System

### Why a Job Queue?

A Gemini API call takes 2–8 seconds. Running 500 students in a school nightly without a queue would:
- Overwhelm the LLM API with simultaneous requests → rate limit errors
- Block HTTP threads → API server becomes unresponsive
- Have no retry mechanism → one failure = lost data

BullMQ solves all of these.

### Queue Architecture

```
                      Redis
                        │
     ┌──────────────────▼──────────────────┐
     │          BullMQ Queue               │
     │     "student-analysis"              │
     │                                     │
     │  [job] [job] [job] [job] [job] ...  │
     └──────────────────┬──────────────────┘
                        │  (up to N jobs at once)
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
      Worker 1      Worker 2      Worker 3
    (runs agent)  (runs agent)  (runs agent)
```

### Worker Configuration

| Setting | Value | Reason |
|---------|-------|--------|
| Concurrency | 5–10 | Balances LLM rate limits vs. speed |
| Max retries | 3 | Handle transient Gemini/API errors |
| Backoff | Exponential (2s, 4s, 8s) | Don't hammer a failing service |
| Job TTL | 24 hours | Remove old completed jobs automatically |

### Nightly Scheduler

`scheduler.ts` registers a **BullMQ repeatable job** that fires nightly:
- Fetches the list of all active schools from the LMS API
- For each school → each class → each student: enqueues a `student-analysis` job
- Does NOT run the agent itself — only enqueues. Workers handle execution.

---

## 7. Three Analysis Modes

### Mode 1: Single Student

- **Payload:** `{ studentId, schoolId, classId, mode: "student" }`
- **Result:** One complete student report
- **Use case:** On-demand (student views their own dashboard)

### Mode 2: Class / Batch

- **Payload:** `{ classId, schoolId, mode: "class" }`
- **How it works:**
  1. Job runner fetches all student IDs in the class
  2. Enqueues one `mode: "student"` job per student
  3. All run in parallel via workers
  4. A separate **aggregation step** runs after all student jobs complete:
     - Calculates class avg score, pass rate, at-risk count
     - Builds subject health matrix (class avg per subject)
     - Identifies top 5 and bottom 5 students
     - Compiles the at-risk student list with their admin reports
  5. Saves the aggregated `classReport`
- **Result:** Individual student reports + aggregated class report

### Mode 3: School-wide

- **Payload:** `{ schoolId, mode: "school" }`
- **How it works:**
  1. Fetches all class IDs in the school
  2. Triggers Mode 2 for each class
  3. After all class reports are ready, a **school aggregation step** runs:
     - School-level avg score and % at-risk
     - Class comparison ranking
     - Subject weakness map (which subjects are worst across all classes)
     - Intervention summary (how many HIGH/CRITICAL students flagged)
  4. Saves the `schoolReport`
- **Result:** Student reports + class reports + school-level report

---

## 8. Dashboard Data — What the API Returns

### Student Report (`GET /api/reports/student/:id`)

```json
{
  "studentId": "stu_001",
  "studentName": "Riya Sharma",
  "className": "Class 9-A",
  "schoolName": "Greenfield Academy",
  "generatedAt": "2026-08-17T02:34:11Z",
  "triggeredBy": "batch",

  "analytics": {
    "overallAvgScore": 64.2,
    "riskLevel": "medium",
    "riskScore": 38,
    "subjectBreakdown": [
      {
        "subject": "Mathematics",
        "avgScore": 52.0,
        "label": "weak",
        "trend": "declining",
        "percentileRank": 22,
        "classGap": -11.5
      },
      {
        "subject": "Science",
        "avgScore": 78.4,
        "label": "strong",
        "trend": "improving",
        "percentileRank": 74,
        "classGap": +6.2
      }
    ],
    "weakSubjects": ["Mathematics"],
    "strongSubjects": ["Science"]
  },

  "aiFeedback": {
    "openingLine": "Riya, your Science results this month were genuinely impressive — keep that energy going!",
    "subjectNotes": [
      {
        "subject": "Mathematics",
        "note": "Your scores in Mathematics have been dipping lately, but the good news is this is very fixable with focused practice.",
        "tips": [
          "Spend 20 minutes daily on algebra problems — consistency beats cramming.",
          "Use solved examples first before attempting unseen problems.",
          "After each wrong answer, write down *why* it was wrong — this builds pattern awareness."
        ]
      },
      {
        "subject": "Science",
        "note": "You are performing above the class average in Science and your scores are improving. Well done!",
        "tips": []
      }
    ],
    "closingMessage": "You have real potential, Riya. One focused week on Mathematics can make a big difference. You've got this!"
  },

  "badges": ["Science Star"],

  "adminReport": {
    "urgencyLevel": "attention",
    "summary": "Riya is performing below average in Mathematics with a declining trend. Early intervention recommended.",
    "subjectActions": [
      { "subject": "Mathematics", "action": "Schedule additional practice sessions on algebra and equations", "priority": "high" }
    ],
    "interventions": ["Assign extra homework in Mathematics", "Monitor next 2 assessments closely"],
    "monitoringFrequency": "Check again after next Mathematics assessment"
  }
}
```

---

### Class Report (`GET /api/reports/class/:classId`)

```json
{
  "classId": "cls_9A",
  "className": "Class 9-A",
  "schoolName": "Greenfield Academy",
  "generatedAt": "2026-08-17T03:12:00Z",
  "totalStudents": 34,

  "classOverview": {
    "avgScore": 67.8,
    "passRate": 82,
    "atRiskCount": 7,
    "criticalCount": 2
  },

  "subjectHealthMatrix": {
    "Mathematics": { "classAvg": 63.5, "healthLabel": "weak" },
    "Science":     { "classAvg": 74.2, "healthLabel": "average" },
    "English":     { "classAvg": 81.0, "healthLabel": "strong" }
  },

  "atRiskStudents": [
    {
      "studentId": "stu_007",
      "name": "Arjun Patel",
      "riskLevel": "critical",
      "weakSubjects": ["Mathematics", "Science"],
      "adminSummary": "Arjun is at critical risk. Urgent 1-on-1 intervention recommended."
    }
  ],

  "topStudents": ["stu_012", "stu_028", "stu_003", "stu_019", "stu_031"],
  "bottomStudents": ["stu_007", "stu_015", "stu_022", "stu_009", "stu_027"]
}
```

---

## 9. Scoring & Analytics Logic

### Trend Detection

```
Given: scores ordered by date (oldest → newest)
If assessmentCount >= 4:
  recentAvg   = average of last 2 scores
  historicAvg = average of all scores except last 2

  if recentAvg > historicAvg + 5%  → "improving"
  if recentAvg < historicAvg - 5%  → "declining"
  else                              → "stable"

If assessmentCount < 4:
  trend = "stable" (not enough data)
```

### Percentile Rank (Proxy Method)

Since the agent only receives the class *average*, not all individual scores, we use the class gap as a proxy:

```
classGap = studentAvgScore − classAvgScore

Percentile (approximate):
  classGap >= +20  →  rank ~90th percentile
  classGap  +10    →  rank ~75th
  classGap    0    →  rank ~50th
  classGap  −10    →  rank ~25th
  classGap <= −20  →  rank ~10th
```

> For exact percentile ranks, the LMS API would need to return all student scores — this can be added later.

### Consistency Score

```
consistency = standard deviation of percentage scores for a subject

Low SD  (< 10)  → Very consistent
Mid SD  (10–20) → Somewhat consistent
High SD (> 20)  → Unpredictable / high variance
```

---

## 10. Report Badges — Auto-Awarded

Badges are computed in `reportBuilder.ts` based on analytics data. They appear on the student dashboard.

| Badge | Criteria |
|-------|---------|
| 🌟 **Subject Star** | Any subject labelled `strong` (≥75%) |
| 📈 **Most Improved** | Any subject showing `improving` trend this report |
| 🎯 **Consistent Performer** | Overall consistency score (SD) below 10 across all subjects |
| 💪 **On the Rise** | Overall avg score improved vs. previous report |
| 🏆 **Top of Class** | Percentile rank ≥ 80th in any subject |
| ⚡ **Never Miss a Beat** | Zero missed assessments this period |

Badges are stored in the report and rendered as icon cards on the student dashboard. They are intentionally achievable for all performance levels — a struggling student can still earn "Consistent Performer" or "Never Miss a Beat".
