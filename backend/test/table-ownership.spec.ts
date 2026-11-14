import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanRepositorySource } from './support/table-ownership-scanner.js';

describe('Repository Table Ownership Architecture Test', () => {
  it('scans all repository files and enforces that each module touches only its owned tables', () => {
    const modulesDir = path.resolve(process.cwd(), 'src/modules');
    const repoFiles: { module: string; file: string; content: string }[] = [];

    function findRepoFiles(dir: string, currentModule = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const mod = currentModule || entry.name;
          findRepoFiles(fullPath, mod);
        } else if (
          entry.isFile() &&
          entry.name.endsWith('.repository.ts') &&
          !entry.name.endsWith('.spec.ts')
        ) {
          repoFiles.push({
            module: currentModule,
            file: fullPath,
            content: fs.readFileSync(fullPath, 'utf-8'),
          });
        }
      }
    }

    findRepoFiles(modulesDir);
    expect(repoFiles.length).toBeGreaterThan(0);

    const allViolations: string[] = [];

    for (const repo of repoFiles) {
      const violations = scanRepositorySource(repo.module, repo.content);
      for (const v of violations) {
        allViolations.push(
          `[${repo.module}] ${path.basename(repo.file)}:${v.line ?? 0} touches unowned ${v.type} "${v.target}": ${v.match}`,
        );
      }
    }

    if (allViolations.length > 0) {
      console.error('Repository Table Ownership Violations:\n' + allViolations.join('\n'));
    }

    expect(allViolations).toEqual([]);
  });
});
