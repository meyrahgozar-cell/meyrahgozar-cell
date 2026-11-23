// ---------------------------------------------------------------------------
// check.mjs — syntax-check every module and validate the import graph.
//   node scripts/check.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'vendor']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(m?js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT).filter(f => !f.includes(`${path.sep}scripts${path.sep}`) || f.endsWith('check.mjs'));
let errors = 0;
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    checked++;
  } catch (err) {
    errors++;
    console.error(`\n[SYNTAX] ${rel}`);
    console.error(String(err.stderr || err.stdout || err.message).split('\n').slice(0, 6).join('\n'));
  }
}

// ------------------------------------------------------- import graph checks
function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  return names;
}

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const pattern = /import\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(pattern)) {
    const clause = m[1];
    const spec = m[2];
    if (!spec.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), spec);
    if (!fs.existsSync(target)) {
      errors++;
      console.error(`[MISSING] ${rel} -> ${spec}`);
      continue;
    }
    const named = clause.match(/\{([^}]+)\}/);
    if (!named) continue;
    const targetSrc = fs.readFileSync(target, 'utf8');
    const available = exportsOf(targetSrc);
    for (const raw of named[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!available.has(name)) {
        errors++;
        console.error(`[EXPORT] ${rel}: "${name}" is not exported by ${spec}`);
      }
    }
  }
}

// ------------------------------------------------------------- asset checks
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = m[1];
  if (ref.startsWith('http') || ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('//')) continue;
  if (!fs.existsSync(path.join(ROOT, ref))) {
    errors++;
    console.error(`[ASSET] index.html references missing file: ${ref}`);
  }
}

console.log(`\nchecked ${checked} modules, ${files.length - checked} failed, ${errors} problems total`);
process.exit(errors ? 1 : 0);
