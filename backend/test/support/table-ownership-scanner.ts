export const ALLOWED_DELEGATES: Record<string, string[]> = {
  auth: ['refreshToken', 'passwordResetToken', 'emailVerificationToken'],
  users: ['user'],
  workspaces: ['workspace', 'workspaceMember', 'workspaceInvite'],
  hierarchy: ['space', 'folder', 'list', 'status'],
  tasks: ['task', 'taskAssignee', 'tag', 'taskTag'],
  mail: [],
};

export const ALL_PRISMA_DELEGATES = [
  'user',
  'refreshToken',
  'passwordResetToken',
  'emailVerificationToken',
  'workspace',
  'workspaceMember',
  'workspaceInvite',
  'space',
  'folder',
  'list',
  'status',
  'task',
  'taskAssignee',
  'tag',
  'taskTag',
  'comment',
  'activityLog',
];

export const ALL_SCHEMA_TABLES = [
  'users',
  'refresh_tokens',
  'password_reset_tokens',
  'email_verification_tokens',
  'workspaces',
  'workspace_members',
  'workspace_invites',
  'spaces',
  'folders',
  'lists',
  'statuses',
  'tasks',
  'task_assignees',
  'tags',
  'task_tags',
  'comments',
  'activity_logs',
];

export const ALLOWED_RAW_TABLES: Record<string, string[]> = {
  auth: ['refresh_tokens', 'password_reset_tokens', 'email_verification_tokens'],
  users: ['users'],
  workspaces: ['workspaces', 'workspace_members', 'workspace_invites'],
  hierarchy: ['spaces', 'folders', 'lists', 'statuses'],
  tasks: ['tasks', 'task_assignees', 'tags', 'task_tags'],
  mail: [],
};

export interface OwnershipViolation {
  module: string;
  type: 'delegate' | 'raw_sql';
  target: string;
  line?: number;
  match: string;
}

export function scanRepositorySource(
  moduleName: string,
  sourceCode: string,
): OwnershipViolation[] {
  const violations: OwnershipViolation[] = [];
  const allowedDelegates = ALLOWED_DELEGATES[moduleName] ?? [];
  const allowedTables = ALLOWED_RAW_TABLES[moduleName] ?? [];

  const lines = sourceCode.split('\n');

  // 1. Delegate calls: (prisma|tx).delegate.method(
  const delegateRegex =
    /(?:prisma|tx)\.([a-zA-Z0-9_]+)\.(?:findUnique|findFirst|findMany|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\b/g;

  // 2. Raw SQL queries: FROM/JOIN/UPDATE/INTO table_name
  const rawSqlRegex =
    /\b(?:FROM|JOIN|UPDATE|INTO)\s+["']?([a-zA-Z0-9_]+)["']?/gi;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip single-line comments
    if (line.trim().startsWith('//')) {
      continue;
    }

    let dMatch: RegExpExecArray | null;
    while ((dMatch = delegateRegex.exec(line)) !== null) {
      const delegate = dMatch[1];
      if (ALL_PRISMA_DELEGATES.includes(delegate) && !allowedDelegates.includes(delegate)) {
        violations.push({
          module: moduleName,
          type: 'delegate',
          target: delegate,
          line: i + 1,
          match: dMatch[0],
        });
      }
    }

    let rMatch: RegExpExecArray | null;
    while ((rMatch = rawSqlRegex.exec(line)) !== null) {
      const table = rMatch[1].toLowerCase();
      if (ALL_SCHEMA_TABLES.includes(table) && !allowedTables.includes(table)) {
        violations.push({
          module: moduleName,
          type: 'raw_sql',
          target: table,
          line: i + 1,
          match: rMatch[0],
        });
      }
    }
  }

  return violations;
}
