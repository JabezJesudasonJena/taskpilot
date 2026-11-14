import { describe, it, expect } from 'vitest';
import { parseDatabaseName, assertTestDatabase } from './database-guard.js';

describe('Database Guard (test/support)', () => {
  it('parses database name from a normal URL', () => {
    const url = 'postgresql://user:pass@localhost:5432/app_test';
    expect(parseDatabaseName(url)).toBe('app_test');
  });

  it('parses database name from a URL with query parameters', () => {
    const url =
      'postgresql://postgres:postgres@localhost:5432/proj_manager_test?schema=public&connection_limit=5';
    expect(parseDatabaseName(url)).toBe('proj_manager_test');
  });

  it('allows URLs ending with _test', () => {
    const validUrl =
      'postgresql://postgres:postgres@localhost:5432/proj_manager_test?schema=public';
    expect(() => assertTestDatabase(validUrl)).not.toThrow();
  });

  it('aborts when database name does not end with _test', () => {
    const prodUrl =
      'postgresql://postgres:postgres@localhost:5432/proj_manager?schema=public';
    expect(() => assertTestDatabase(prodUrl)).toThrow(
      /SAFETY GUARD ABORT: DATABASE_URL points to database "proj_manager", which does not end with "_test"/,
    );
  });

  it('aborts when database name is postgres or default', () => {
    const defaultUrl = 'postgresql://postgres:postgres@localhost:5432/postgres';
    expect(() => assertTestDatabase(defaultUrl)).toThrow(
      /SAFETY GUARD ABORT/,
    );
  });
});
