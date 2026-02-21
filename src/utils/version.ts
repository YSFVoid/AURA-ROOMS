import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let cachedVersion: string | null = null;

function candidatePackageJsonPaths(): string[] {
  const fromCwd = resolve(process.cwd(), 'package.json');
  const fromModule = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
  const fromDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'package.json');
  return [fromCwd, fromModule, fromDist];
}

export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  for (const packagePath of candidatePackageJsonPaths()) {
    if (!existsSync(packagePath)) {
      continue;
    }

    try {
      const raw = readFileSync(packagePath, 'utf-8');
      const pkg = JSON.parse(raw) as { version?: string };
      if (pkg.version && pkg.version.length > 0) {
        cachedVersion = pkg.version;
        return cachedVersion;
      }
    } catch {
      continue;
    }
  }

  cachedVersion = 'unknown';
  return cachedVersion;
}
