# CODING STANDARDS — KJSIS

## LANGUAGE

- Use TypeScript (strict mode)
- Use ES modules
- Prefer arrow functions

## NAMING CONVENTIONS

- Use descriptive names
- camelCase for variables/functions
- PascalCase for classes/types

## API DESIGN

- Follow REST conventions
- Use proper HTTP status codes
- Always return JSON responses

## ERROR HANDLING

- Use try/catch blocks
- Log errors internally
- Return safe error messages to client

## VALIDATION

- Use Zod for request validation
- Validate all inputs before processing

## STRUCTURE RULES

- No business logic in controllers
- Use service layer for logic
- Keep functions small and focused

## DATABASE ACCESS

- Use parameterized queries
- Avoid raw string queries
- Always handle null/undefined safely
