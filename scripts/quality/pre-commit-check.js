/**
 * Quality check script — detects common issues in source files.
 * Run before committing: node scripts/quality/pre-commit-check.js
 * Use --staged to scan only staged files from a git hook.
 *
 * Checks:
 * 1. console.log / console.debug statements (warn)
 * 2. debugger statements (block)
 * 3. Potential secrets (block)
 * 4. .only() in test files (block)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = process.cwd();
const STAGED_ONLY = process.argv.includes('--staged');

function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    return output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function getProjectFiles() {
  try {
    const output = execSync('git ls-files --cached --others --exclude-standard', {
      encoding: 'utf-8',
      cwd: ROOT,
    });
    return output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function checkFile(filePath) {
  const absPath = resolve(ROOT, filePath);
  if (!existsSync(absPath)) return { errors: [], warnings: [] };

  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  const errors = [];
  const warnings = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Debugger statements — BLOCK
    if (/^\s*debugger\s*;?(?:\s*\/\/.*)?$/.test(line)) {
      errors.push(`${filePath}:${lineNum} — debugger statement found. Remove before committing.`);
    }

    // console.log — WARN (allow console.error and console.warn)
    if (/(^|[^\w.])console\.(log|debug)\s*\(/.test(line)) {
      warnings.push(
        `${filePath}:${lineNum} — console.log/debug found. Remove or replace with proper logging.`,
      );
    }

    // .only() in test files — BLOCK
    if (/\.only\(/.test(line) && /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath)) {
      errors.push(`${filePath}:${lineNum} — .only() in test file. Remove before committing.`);
    }

    // Potential secret patterns — BLOCK
    const secretPatterns = [
      {
        regex: /(api[_-]?key|apikey|secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
        name: 'hardcoded secret/credential',
      },
      { regex: /GEMINI_API_KEY\s*=\s*['"][^'"]+['"]/i, name: 'GEMINI_API_KEY' },
      { regex: /TURSO_AUTH_TOKEN\s*=\s*['"][^'"]+['"]/i, name: 'TURSO_AUTH_TOKEN' },
    ];

    for (const { regex, name } of secretPatterns) {
      if (regex.test(line)) {
        errors.push(
          `${filePath}:${lineNum} — Possible ${name} in source code. Use environment variables.`,
        );
      }
    }
  }

  return { errors, warnings };
}

function isSourceFile(filePath) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath) && !filePath.includes('node_modules');
}

const filesToCheck = (STAGED_ONLY ? getStagedFiles() : getProjectFiles()).filter(isSourceFile);

if (filesToCheck.length === 0) {
  console.log(`No ${STAGED_ONLY ? 'staged ' : ''}source files to check.`);
  process.exit(0);
}

console.log(`Checking ${filesToCheck.length} ${STAGED_ONLY ? 'staged ' : ''}source file(s)...\n`);

let totalErrors = 0;
let totalWarnings = 0;

for (const file of filesToCheck) {
  const { errors, warnings } = checkFile(file);

  for (const err of errors) {
    console.error(`  ERROR  ${err}`);
  }
  for (const warn of warnings) {
    console.warn(`  WARN   ${warn}`);
  }

  totalErrors += errors.length;
  totalWarnings += warnings.length;
}

console.log(`\n${totalErrors} error(s), ${totalWarnings} warning(s).`);

if (totalErrors > 0) {
  console.error('\nCommit blocked. Fix errors above before committing.');
  process.exit(1);
}

if (totalWarnings > 0) {
  console.warn('\nWarnings found. Review them before committing.');
}

process.exit(0);
