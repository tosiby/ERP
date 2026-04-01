# PROJECT ARCHITECTURE — KJSIS

## SYSTEM OVERVIEW

KJSIS is a School Management and Exam Intelligence System.

It manages:
- Academic structure (classes, divisions, subjects)
- Teacher assignments
- Marks entry system
- Attendance system
- Reporting system
- AI insights engine

## CORE MODULES

### USER MANAGEMENT
- Roles: super_admin, exam_cell, teacher, vp, principal
- Authentication and authorization

### ACADEMIC SETUP
- Classes (1–12)
- Divisions
- Subjects (dynamic per class)
- Electives (Hindi/French)
- Exam structure (MT, IA, TERM)
- Components (TH, PR, IA)

### TEACHER ASSIGNMENT
- teacher_subject_map
- class_teachers

### MARKS SYSTEM
- Teacher-based entry (no filters)
- Entry mode: total or component
- Status flow: draft → submitted → locked

### ATTENDANCE SYSTEM
- Only class teachers allowed
- Default present model
- Only absentees stored
- Calendar-based marking
- Saturday override logic

### REPORTING SYSTEM
- Student-wise reports
- Subject-wise reports
- Class-wise reports
- Consolidated reports (restricted access)

### AI INSIGHTS ENGINE
- Risk detection
- Trend analysis
- Performance insights
- Recommendations

## BACKEND STRUCTURE

```
backend/
  controllers/
  services/
  routes/
  middleware/
  utils/
```

## RULES

- Controllers handle HTTP requests
- Services contain business logic
- Routes define endpoints
- Middleware handles authentication and validation

## DATA FLOW

Frontend → API Routes → Controllers → Services → Database

## ROLE ACCESS FLOW

- Super Admin → Full access
- Exam Cell → Full academic control
- Teacher → Limited to assigned subjects
- Class Teacher → Attendance + consolidated reports
- VP/Principal → Reports + AI insights
