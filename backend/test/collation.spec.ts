import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { setupTestDatabase } from '../scripts/setup-test-db.js';
import { assertTestDatabase } from './support/database-guard.js';

describe('Step 1: Position Collation "C" in PostgreSQL (Integration)', () => {
  let prisma: PrismaClient;
  const testDbUrl =
    'postgresql://postgres:postgres@localhost:5432/proj_manager_test?schema=public';

  beforeAll(async () => {
    assertTestDatabase(testDbUrl);
    process.env.DATABASE_URL = testDbUrl;
    await setupTestDatabase();
    prisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });
    await prisma.$connect();
  }, 30000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('verifies that orderBy position asc returns identical order to JavaScript code-unit sort', async () => {
    // 1. Create a workspace
    const workspace = await prisma.workspace.create({
      data: {
        name: 'Collation Test Workspace',
        slug: `collation-test-${Date.now()}`,
      },
    });

    // 2. Insert spaces with positions mixing upper and lower case
    const testPositions = ['a0', 'a1', 'Zz', 'a0V', 'B'];

    for (const pos of testPositions) {
      await prisma.space.create({
        data: {
          workspaceId: workspace.id,
          name: `Space ${pos}`,
          position: pos,
        },
      });
    }

    // 3. Query with orderBy: { position: 'asc' }
    const results = await prisma.space.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { position: true },
    });

    const dbPositions = results.map((r) => r.position);

    // 4. In JS, code-unit sort: 'B' (66), 'Zz' (90, 122), 'a0' (97, 48), 'a0V' (97, 48, 86), 'a1' (97, 49)
    const jsSorted = [...testPositions].sort();

    expect(dbPositions).toEqual(jsSorted);
    expect(dbPositions).toEqual(['B', 'Zz', 'a0', 'a0V', 'a1']);

    // Cleanup
    await prisma.workspace.delete({ where: { id: workspace.id } });
  });
});
