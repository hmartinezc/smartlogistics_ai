/**
 * Secret scanner — scans the entire project for potential leaks.
 * Run: node scripts/quality/check-secrets.js
 *
 * Checks for:
 * - Hardcoded API keys, tokens, passwords
 * - .env files accidentally tracked
 * - Common secret patterns
 */

import { readFileSync, existsSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, relative, resolve, extname } from 'path';
import { createInterface } from 'readline';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'data', '.vscode', '.agents']);
const SKIP_EXTENSIONS = new Set([
  '.db',
  '.db-wal',
  '.db-shm',
  '.png',
  '.jpg',
  '.ico',
  '.svg',
  '.woff',
  '.woff2',
  '.lock',
  '.json',
]);
const SECRET_PATTERNS = [
  { regex: /(=|:)\s*['"][A-Za-z0-9+/=]{32,}['"]/, name: 'long base64-like string (possible key)' },
  { regex: /sk-[A-Za-z0-9]{32,}/, name: 'OpenAI/LLM API key pattern' },
  { regex: /AIza[0-9A-Za-z\-_]{35}/, name: 'Google API key pattern (Gemini)' },
  { regex: /ghp_[A-Za-z0-9]{36}/, name: 'GitHub personal access token' },
  { regex: /gho_[A-Za-z0-9]{36}/, name: 'GitHub OAuth token' },
  { regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, name: 'private key' },
  {
    regex: /password\s*[:=]\s*['"](?!.*(?:example|test|dummy|1234))[^'"]+['"]/i,
    name: 'hardcoded password',
  },
  { regex: /secret\s*[:=]\s*['"][^'"]{6,}['"]/i, name: 'hardcoded secret' },
];

async function scanDir(dir) {
  const results = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = relative(ROOT, fullPath);

      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        const subResults = await scanDir(fullPath);
        results.push(...subResults);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (SKIP_EXTENSIONS.has(ext)) continue;

        if (/\.env$/.test(entry.name) && entry.name !== '.env.example') {
          results.push(`${relPath} — .env file tracked (should be in .gitignore!)`);
          continue;
        }

        try {
          const content = readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            for (const { regex, name } of SECRET_PATTERNS) {
              if (regex.test(lines[i])) {
                results.push(`${relPath}:${i + 1} — possible ${name}`);
                break;
              }
            }
          }
        } catch {
          // Skip binary/unreadable files
        }
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results;
}

// Main
console.log('Scanning project for secrets...\n');

const findings = await scanDir(ROOT);

if (findings.length === 0) {
  console.log('No potential secrets found.');
} else {
  console.error(`Found ${findings.length} potential issue(s):\n`);
  for (const finding of findings) {
    console.warn(`  WARN  ${finding}`);
  }
  console.error('\nReview each finding. False positives are common with this scanner.');
}

process.exit(0);
