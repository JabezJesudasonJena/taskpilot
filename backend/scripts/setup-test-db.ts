import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertTestDatabase } from '../test/support/database-guard.js';

export async function setupTestDatabase(): Promise<void> {
  const adminUrl =
    'postgresql://postgres:postgres@localhost:5432/postgres?schema=public';
  const testDbUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/proj_manager_test?schema=public';

  assertTestDatabase(testDbUrl);

  const adminClient = new PrismaClient({
    datasources: { db: { url: adminUrl } },
  });

  try {
    const dbs: any[] = await adminClient.$queryRawUnsafe(
      "SELECT 1 FROM pg_database WHERE datname = 'proj_manager_test'",
    );
    if (dbs.length === 0) {
      console.log('Creating proj_manager_test database...');
      await adminClient.$executeRawUnsafe('CREATE DATABASE proj_manager_test;');
    }
  } catch (err) {
    console.warn(
      'Could not query admin db, proceeding with migrations:',
      err,
    );
  } finally {
    await adminClient.$disconnect();
  }

  console.log('Running prisma migrate deploy on proj_manager_test...');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });
}

if (process.argv[1]?.endsWith('setup-test-db.ts') || process.argv[1]?.endsWith('setup-test-db.js')) {
  setupTestDatabase().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
