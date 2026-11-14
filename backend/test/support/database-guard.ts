export function parseDatabaseName(urlStr: string): string {
  if (!urlStr || typeof urlStr !== 'string') {
    throw new Error('DATABASE_URL must be a non-empty string');
  }

  try {
    const parsed = new URL(urlStr);
    const pathname = parsed.pathname.replace(/^\//, '');
    const dbName = pathname.split('/')[0];
    if (!dbName) {
      throw new Error(`Cannot parse database name from URL: ${urlStr}`);
    }
    return dbName;
  } catch (err: any) {
    if (err.message && err.message.startsWith('Cannot parse')) {
      throw err;
    }
    // Fallback for custom postgres url formats
    const match = urlStr.match(/\/([^/?#]+)(?:\?|$)/);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error(`Invalid DATABASE_URL format: ${urlStr}`);
  }
}

export function assertTestDatabase(urlStr: string | undefined): void {
  if (!urlStr) {
    throw new Error('SAFETY GUARD ABORT: DATABASE_URL is not set.');
  }

  const dbName = parseDatabaseName(urlStr);
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `SAFETY GUARD ABORT: DATABASE_URL points to database "${dbName}", which does not end with "_test". Tests must run against a test database only.`,
    );
  }
}
