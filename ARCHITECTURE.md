# Atomquest System Architecture & Design Document

## Executive Summary

Atomquest is an enterprise-grade HR workflow platform for goal setting, approval, achievement tracking, and performance analytics. It implements a comprehensive goal management lifecycle with role-based access control, sophisticated calculation engines, and real-time reporting.

## System Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend Layer                        │
│  React + Vite + Tailwind + Recharts                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Global Admin Dev Bar (Role + Date Switching)         │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Role-Based Views:                                    │  │
│  │ • Employee: Goal Creation & Check-in                 │  │
│  │ • Manager: Team Approval Dashboard                   │  │
│  │ • Admin: Governance & Analytics                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓ (HTTP/REST API)
┌─────────────────────────────────────────────────────────────┐
│                     API Layer (Backend)                     │
│  Express.js + TypeScript                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Authentication & Authorization                       │  │
│  │ • Dev Mode: Header-based role switching              │  │
│  │ • Production: JWT tokens                             │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Business Logic Controllers:                          │  │
│  │ • Goal Sheet Management                              │  │
│  │ • Achievement Tracking & Calculations                │  │
│  │ • Check-in Management                                │  │
│  │ • Reporting & Analytics                              │  │
│  │ • Escalations                                        │  │
│  │ • Shared Goals                                       │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ Utility Services:                                    │  │
│  │ • Calculation Engine (Progress Scores)               │  │
│  │ • Email Service (Nodemailer)                         │  │
│  │ • Escalation Rules                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↓ (SQL/Prisma ORM)
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer (Database)                    │
│  PostgreSQL 15 with Prisma ORM                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Core Tables:                                         │  │
│  │ • users (role, manager_id)                           │  │
│  │ • goal_sheets (status, cycle_year)                   │  │
│  │ • goals (uom_type, weightage, progress)              │  │
│  │ • check_in_comments (quarter, feedback)              │  │
│  │ • audit_logs (change tracking)                       │  │
│  │ • escalations (rules, status)                        │  │
│  │ • notifications (email queue)                        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Workflow Flows

### Goal Creation & Approval Cycle

```
┌─────────────────┐
│ Employee        │
│ Creates Goals   │ (May 1 - Goal Creation Window)
│ (up to 8)       │
└────────┬────────┘
         │
         ▼
    Validation:
    • Total Weightage = 100%
    • Min 10% per goal
    • Max 8 goals
         │
         ├─────────────────────────┐
         │                         │
         ▼                         ▼
    VALID ✓                  INVALID ✗
         │                         │
         ▼                         ▼
    Status: DRAFT        Show Errors
    (Save Draft)         (No Submit)
         │
         ▼
┌──────────────────────┐
│ Employee Submits     │
│ Status: SUBMITTED    │
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Manager Reviews      │
│ Can:                 │
│ • Edit Targets/Wt.   │
│ • Add Comments       │
│ • Approve            │
│ • Return for Rework  │
└────────┬─────────────┘
         │
    ┌────┴───────┐
    │             │
    ▼             ▼
 APPROVE      REJECT
    │             │
    ▼             ▼
Status:      Status:
LOCKED       DRAFT
(Locked)     (Notify)
    │             │
    └─────┬───────┘
          │
          ▼
    Check-in Opens
    (When date matches)
```

### Achievement Tracking & Check-in

```
Status: LOCKED (Approved)
    │
    ▼
System Date Advances to Check-in Window
    │
    ├─ July 15 (Q1) ──▶ Q1 Check-in Opens
    ├─ October 15 (Q2) ▶ Q2 Check-in Opens
    ├─ January 15 (Q3) ▶ Q3 Check-in Opens
    └─ April 15 (Q4)  ▶ Q4 Check-in Opens
    │
    ▼
Employee Updates Achievement
    │
    ▼
Calculation Engine Computes Progress Score:
    │
    ├─ MIN_NUMERIC: (Achievement / Target) × 100
    ├─ MAX_NUMERIC: (Target / Achievement) × 100
    ├─ TIMELINE: Achievement_Date ≤ Target_Date ? 100% : 0%
    └─ ZERO: Achievement == 0 ? 100% : 0%
    │
    ▼
Manager Reviews & Adds Comments
    │
    ▼
Check-in Saved with Progress Scores
    │
    ▼
Shared Goals (if any): Auto-sync achievement
```

### Shared Goals Synchronization

```
Admin/Manager Creates Shared Goal
    │
    ├─ Title & Target: Read-only for recipients
    └─ Weightage: Adjustable by each recipient
    │
    ▼
Goal Copied to All Recipients' Goal Sheets
    │
    ▼
When Primary Owner Updates Achievement:
    │
    ├─ Update Parent Goal
    └─ Sync Achievement to ALL Linked Goals
    │
    ▼
Recipients See Same Achievement
(Can adjust weightage independently)
```

## Core Business Rules

### Goal Validation Rules
1. **Total Weightage**: Sum must equal exactly 100%
2. **Individual Weightage**: Each goal >= 10%
3. **Maximum Goals**: 8 per employee per cycle
4. **Thrust Areas**: Predefined list of 8 categories
5. **UoM Types**: MIN_NUMERIC, MAX_NUMERIC, TIMELINE, ZERO

### Goal Lifecycle States

```
┌────────┐
│ DRAFT  │ ◄─────── Initial state or returned for rework
└───┬────┘
    │ Employee submits
    ▼
┌──────────┐
│SUBMITTED │ ◄─── Awaiting manager approval
└────┬─────┘
     │ Manager approves
     ▼
┌────────┐
│ LOCKED │ ◄─── Can't edit without admin (audit trail starts)
└────────┘
```

### Time Windows & Check-in Periods

| Date | Window | Phase |
|------|--------|-------|
| May 1 | Goal Creation | Phase 1 |
| July 15 | Q1 Check-in | Phase 2 |
| October 15 | Q2 Check-in | Phase 2 |
| January 15 | Q3 Check-in | Phase 2 |
| April 15 | Q4/Annual | Phase 2 |

## API Request/Response Examples

### Create Goal (Employee)

**Request:**
```json
POST /api/goal-sheets/{goalSheetId}/goals
{
  "thrustArea": "Financial Performance",
  "title": "Increase Q1 Revenue",
  "description": "Achieve 20% YoY growth",
  "uomType": "MIN_NUMERIC",
  "targetValue": "1000000",
  "weightage": 40
}
```

**Response:**
```json
{
  "id": "goal-001",
  "goalSheetId": "gs-001",
  "thrustArea": "Financial Performance",
  "title": "Increase Q1 Revenue",
  "uomType": "MIN_NUMERIC",
  "targetValue": "1000000",
  "weightage": 40,
  "actualAchievement": null,
  "progressScore": 0,
  "completionStatus": "NOT_STARTED",
  "isShared": false,
  "createdAt": "2026-05-01T10:00:00Z"
}
```

### Update Achievement & Calculate Progress

**Request:**
```json
PUT /api/check-ins/{goalId}/achievement
{
  "actualAchievement": "1200000",
  "completionStatus": "ON_TRACK"
}
```

**Response:**
```json
{
  "id": "goal-001",
  "actualAchievement": "1200000",
  "progressScore": 120,  // (1200000 / 1000000) × 100 = 120 (capped at 100)
  "completionStatus": "ON_TRACK",
  "updatedAt": "2026-07-15T14:30:00Z"
}
```

### Submit Goal Sheet (Validation)

**Request:**
```json
POST /api/goal-sheets/{goalSheetId}/submit
```

**Validation Response (Error):**
```json
{
  "status": 400,
  "errors": [
    "Total weightage must equal 100%. Current: 95%",
    "Goal 2: Weightage must be at least 10%. Current: 5%"
  ]
}
```

## Calculation Engine Deep Dive

### Progress Score Formula by UoM Type

#### 1. MIN_NUMERIC (Higher is Better)
Example: Sales Revenue
```
Progress = (Achievement / Target) × 100
         = (1,200,000 / 1,000,000) × 100
         = 120% → Capped at 100%
```

#### 2. MAX_NUMERIC (Lower is Better)
Example: Cost, Turnaround Time
```
Progress = (Target / Achievement) × 100
         = (30 / 25) × 100
         = 120% → Capped at 100%

Note: If achieved value is HIGHER than target, progress < 100%
```

#### 3. TIMELINE (Date-based)
Example: Project Completion
```
If Achievement_Date ≤ Target_Date:
  Progress = 100%
Else:
  Progress = 0%
```

#### 4. ZERO (Zero = Success)
Example: Safety Incidents
```
If Achievement == 0:
  Progress = 100%
Else:
  Progress = 0%
```

## Role-Based Access Control

### Employee Permissions
- ✓ Create goals (up to 8)
- ✓ Edit own goals (before submission)
- ✓ Submit goal sheet
- ✓ View approved goals
- ✓ Update achievements during check-in
- ✗ Approve goals
- ✗ View other employees' data

### Manager Permissions
- ✓ View team members' goals
- ✓ Edit goals during review (inline)
- ✓ Approve goal sheets
- ✓ Return for rework with comments
- ✓ View team check-in status
- ✓ Add check-in comments
- ✗ Create shared goals
- ✗ View analytics

### Admin Permissions
- ✓ All employee permissions
- ✓ All manager permissions
- ✓ Create and share departmental KPIs
- ✓ View org-wide analytics
- ✓ View HR escalation panel
- ✓ Trigger escalation rules
- ✓ View audit trails
- ✓ Export reports

## Database Schema Relationships

```
User (1) ───────────────────────────── (Many) GoalSheet
  │ manager_id FK                              │ user_id FK
  │                                            │
  │                                            └─→ (1) Goal ─→ (0..1) Goal (parent_id)
  │                                                    │ primary_owner_id FK
  │                                                    │
  │                                            └─→ (0..Many) CheckInComment
  │                                                    │ created_by_id FK
  │                                                    │
  │                                            └─→ (0..Many) AuditLog
  │
  └─→ (0..Many) Escalation
```

## Email Notifications

### Triggers

| Event | Recipients | Template |
|-------|-----------|----------|
| Goal Submitted | Employee | GOAL_SUBMISSION |
| Goals Approved | Employee | GOAL_APPROVAL |
| Returned for Rework | Employee | GOAL_REJECTION |
| Check-in Reminder | Employee | CHECK_IN_REMINDER |
| Escalation Alert | Manager/HR | ESCALATION_ALERT |

### Email Service Configuration

**Development Mode:**
- Uses Ethereal (test account)
- Preview URLs logged to console
- No actual emails sent

**Production Mode:**
- Uses AWS SES or custom SMTP
- HTML templates
- Styled notifications

## Audit Trail & Compliance

### What Gets Logged
- Goal modifications (after lock)
- Achievement updates
- Status changes
- Manager actions

### Example Audit Log
```json
{
  "id": "audit-001",
  "goalId": "goal-001",
  "changedByUserId": "user-123",
  "oldValue": "500000",
  "newValue": "600000",
  "actionTaken": "ACHIEVEMENT_UPDATE",
  "timestamp": "2026-07-15T14:30:00Z"
}
```

## Performance Optimizations

### Database
- Indexed foreign keys
- Indexed status fields
- Materialized views for analytics (optional)
- Connection pooling

### Backend
- Request caching (5 min for analytics)
- Batch processing for escalations
- Lazy loading for related data

### Frontend
- React memo for components
- Debounced calculations
- Chart data memoization
- Lazy route loading

## Security Considerations

### Development
- Simple header-based role switching (testing only)
- No authentication required (dev mode)

### Production
- JWT-based authentication
- Role-based authorization middleware
- HTTPS/TLS enforcement
- CORS configuration
- Rate limiting
- SQL injection prevention (Prisma ORM)
- XSS protection (React)
- CSRF tokens for state-changing operations
- Database encryption at rest
- Field-level validation

## Testing Strategy

### Unit Tests
- Calculation engine formulas
- Weightage validation logic
- Progress score calculations

### Integration Tests
- Goal submission flow
- Manager approval workflow
- Check-in updates
- Shared goal synchronization

### E2E Tests
- Complete goal lifecycle
- Role-based access verification
- Data consistency checks

## Monitoring & Observability

### Metrics to Track
- Goal submission rate
- Approval rate
- Check-in completion rate
- Average progress score
- Escalation frequency
- Email delivery rate

### Logs
- API request/response times
- Database query times
- Error rates
- Escalation triggers

### Alerts
- High error rate (>5%)
- Database connection failures
- Email delivery failures
- Escalation thresholds exceeded

## Future Enhancements

1. **Real-time Notifications**: WebSocket integration
2. **Advanced Analytics**: ML-based predictions
3. **Mobile App**: React Native
4. **Integration**: Slack/Teams notifications
5. **Customization**: Configurable thrust areas
6. **Localization**: Multi-language support
7. **Advanced Reporting**: Custom report builder
8. **Data Import**: Bulk goal creation from CSV
9. **Workflow Automation**: Conditional approvals
10. **Social Features**: Goal collaboration, comments

---

**Architecture Version:** 1.0  
**Last Updated:** May 2026  
**Status:** Production Ready
