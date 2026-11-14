import { assertTestDatabase } from './database-guard.js';

// If DATABASE_URL is defined in the test environment, verify it points to a *_test database
if (process.env.DATABASE_URL) {
  assertTestDatabase(process.env.DATABASE_URL);
}

