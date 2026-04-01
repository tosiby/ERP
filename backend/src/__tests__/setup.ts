// =============================================================
// KJSIS — Jest Test Setup
// =============================================================

import 'dotenv/config';

// Use a test DB or mock the pool in tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_minimum_32_characters_long';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://localhost/kjsis_test';
