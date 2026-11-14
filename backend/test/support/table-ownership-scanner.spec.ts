import { describe, it, expect } from 'vitest';
import { scanRepositorySource } from './table-ownership-scanner.js';

describe('Table Ownership Scanner (test/support)', () => {
  it('passes a clean repository source using only owned delegates', () => {
    const cleanAuthRepo = `
      export class AuthRepository {
        async findToken(token: string) {
          return this.prisma.refreshToken.findUnique({ where: { token } });
        }
      }
    `;

    const violations = scanRepositorySource('auth', cleanAuthRepo);
    expect(violations).toHaveLength(0);
  });

  it('detects and flags a forbidden delegate call', () => {
    const dirtyAuthRepo = `
      export class AuthRepository {
        async findUser(id: string) {
          return this.prisma.user.findUnique({ where: { id } });
        }
      }
    `;

    const violations = scanRepositorySource('auth', dirtyAuthRepo);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      module: 'auth',
      type: 'delegate',
      target: 'user',
    });
  });

  it('detects and flags a forbidden raw SQL table', () => {
    const dirtyHierarchyRepo = `
      export class SpacesRepository {
        async rawQuery() {
          return this.prisma.$queryRawUnsafe('SELECT * FROM users WHERE active = true');
        }
      }
    `;

    const violations = scanRepositorySource('hierarchy', dirtyHierarchyRepo);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      module: 'hierarchy',
      type: 'raw_sql',
      target: 'users',
    });
  });

  it('allows tasks repository to use relation filter on list without calling list delegate directly', () => {
    const cleanTasksRepo = `
      export class TasksRepository {
        async findTasks(workspaceId: string) {
          return this.prisma.task.findMany({
            where: {
              workspaceId,
              list: { archivedAt: null },
            },
          });
        }
      }
    `;

    const violations = scanRepositorySource('tasks', cleanTasksRepo);
    expect(violations).toHaveLength(0);
  });
});
