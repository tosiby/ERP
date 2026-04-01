import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/db/migrations/**',
  ],
  coverageReporters: ['text', 'lcov'],
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};

export default config;
