# PROJECT AI RULES — KJSIS

Always follow these rules when writing code, designing APIs, or suggesting architecture.

## ARCHITECTURE

- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL (Supabase)
- Frontend: React Native (mobile-first)
- Auth: JWT-based authentication
- Deployment: Vercel / Railway (backend), Supabase (DB)
- Version Control: GitHub

## CORE PRINCIPLES

- Teacher-first UX (no complex filters)
- Role-based access control (strict enforcement)
- Fully dynamic configuration (no hardcoding)
- Scalable from Class 1 to Class 12
- Clean relational database design
- Minimal data redundancy

## CODING RULES

- Use TypeScript strictly
- Use modular folder structure
- Separate controllers, services, and routes
- Use async/await only
- Validate all inputs using Zod
- Never mix business logic inside controllers

## SECURITY RULES

- Never expose passwords or secrets
- Always validate request inputs
- Enforce role-based permissions at API level
- Teachers can only access their assigned data
- Exam cell can access all academic data
- Super admin has full access

## DATABASE RULES

- No JSON storage for structured data
- Use proper foreign keys
- Normalize all tables
- Each mark must be a single row
- Attendance stores only absentees
- Avoid duplicate or derived data storage

## PERFORMANCE RULES

- Use indexed queries for filtering
- Avoid N+1 queries
- Use pagination for large datasets
- Optimize joins carefully

## CODE QUALITY

- Write clean, readable code
- Add comments for complex logic
- Avoid duplication
- Use meaningful variable names
