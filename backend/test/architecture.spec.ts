import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.spec.ts') &&
      !entry.name.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

describe('Architecture Rules: Modular Monolith', () => {
  const modulesDir = path.resolve(process.cwd(), 'src/modules');

  it('each module must have an index.ts file', () => {
    const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
    const moduleNames = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);

    for (const mod of moduleNames) {
      const indexPath = path.join(modulesDir, mod, 'index.ts');
      expect(
        fs.existsSync(indexPath),
        `Module ${mod} is missing index.ts`,
      ).toBe(true);
    }
  });

  it('cross-module imports must only target another module index.js', () => {
    const files = getAllTsFiles(modulesDir);
    const importRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;

    const violations: Array<{ file: string; importPath: string; reason: string }> = [];

    for (const file of files) {
      // Determine which module this file belongs to
      const relativeToModules = path.relative(modulesDir, file).replace(/\\/g, '/');
      const currentModule = relativeToModules.split('/')[0];

      const content = fs.readFileSync(file, 'utf-8');
      let match: RegExpExecArray | null;

      while ((match = importRegex.exec(content)) !== null) {
        const importPath = match[1];

        // Check if this is a relative import pointing to another module
        const resolvedPath = path.resolve(path.dirname(file), importPath);
        const relativeToModulesDir = path
          .relative(modulesDir, resolvedPath)
          .replace(/\\/g, '/');

        // If the import resolves to something inside src/modules/
        if (
          !relativeToModulesDir.startsWith('..') &&
          !path.isAbsolute(relativeToModulesDir)
        ) {
          const targetModule = relativeToModulesDir.split('/')[0];

          // If it targets a different module:
          if (targetModule !== currentModule) {
            // Must strictly target that module's index.js
            const isIndexImport =
              importPath.endsWith(`/${targetModule}/index.js`) ||
              importPath.endsWith(`/${targetModule}/index`) ||
              importPath === `../${targetModule}/index.js` ||
              importPath === `../../${targetModule}/index.js`;

            if (!isIndexImport) {
              violations.push({
                file: path.relative(process.cwd(), file).replace(/\\/g, '/'),
                importPath,
                reason: `Cross-module import from module '${currentModule}' to '${targetModule}' must import through '${targetModule}/index.js', but imported '${importPath}'`,
              });
            }
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
