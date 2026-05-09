# SheTrades Digital WhatsApp Chatbot PRD
## Version 1.0 | April 27, 2026

### Overview
WhatsApp microlearning platform for 20k+ women traders in Nigeria. Menu-based learning, multilingual audio, admin dashboard, airtime rewards. Direct Meta Cloud API, Google Cloud Run backend, Next.js dashboard.

### Goals
- 20k registered users
- 99% uptime
- Module completion tracking
- Airtime incentives on milestones
- Donor-ready analytics exports

### Users
1. Learners (women traders, low-literacy)
2. Admins (TechHer staff)
3. Digital Champions (peer facilitators)

### Core Flows

#### Chatbot (WhatsApp)
```
Onboarding → Language select → Main Menu → Module → Lesson → Quiz → Reward → Repeat
```

**Key Screens:**
1. Welcome + registration
2. Main menu (5 modules)
3. Lesson (text + audio toggle)
4. Quiz (MCQ)
5. Progress summary

#### Admin Dashboard (Next.js)
```
Users | Analytics | Content | Rewards | System | Reports
```

**Pages:**
1. Dashboard overview
2. User management
3. Module analytics (funnel charts)
4. Content editor (lessons, quizzes)
5. Reward log + manual issue
6. Export reports (CSV/PDF)

### Technical Stack
| Layer | Tech | Why |
|-------|------|-----|
| WhatsApp | Direct Meta Cloud API | $25/mo vs $350 BSP |
| Backend | Node.js/TS + Cloud Run | Pay-per-request scaling |
| State | Firestore | Realtime progress |
| Analytics | PostgreSQL | Donor reports |
| Frontend | Next.js + Tailwind | Rapid iteration |
| Audio | Intron TTS | Igbo/Pidgin support |

### Data Models
```json
// User
{
  "phone": "string",
  "name": "string",
  "state": "anambra | delta",
  "language": "en | pcm | ig",
  "progress": {"module1": 80%, "module2": 0%},
  "rewards": [{"module": 1, "amount": 200, "date": "ISO"}]
}

// Lesson
{
  "id": "string",
  "module": 1,
  "title": "string",
  "text_en": "string",
  "text_pcm": "string",
  "text_ig": "string",
  "audio_en": "string",
  "quiz": [{"question": "string", "options": ["string"], "answer": 1}]
}
```

### API Endpoints
```
POST /webhook/whatsapp - Meta webhook
GET /api/users/{phone} - User state
POST /api/progress - Update lesson completion
GET /api/analytics/module/{id} - Funnel data
POST /api/rewards/issue - Manual airtime
```

### Success Metrics
- Registration rate >70%
- Module completion >30%
- Quiz pass rate >60%
- Reward distribution 100% automated

### Non-Functional
- 500ms P95 response time
- 99% uptime SLA
- <1MB audio files
- GDPR/Nigeria data residency

### Timeline
Week 1: Backend + webhook
Week 2: Dashboard MVP
Week 3: Content + rewards
Week 4: Testing + deploy

### Dependencies
- Meta app approval
- Airtime API keys
- 50 pilot phones
