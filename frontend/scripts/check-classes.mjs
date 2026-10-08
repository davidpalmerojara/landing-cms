// Fails if the source uses Tailwind-looking classes that generate no CSS.
//
// Tailwind silently ignores classes it does not understand, so a typo or a
// token that was never registered (e.g. `hover:bg-surface-card` when the
// token lived in a hand-written @layer) ships as a no-op. This script uses
// Tailwind's own scanner and design system (both installed with
// @tailwindcss/postcss) to find them.
//
// Usage: node scripts/check-classes.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scanner } from '@tailwindcss/oxide';
import { __unstable__loadDesignSystem } from '@tailwindcss/node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['app', 'components', 'hooks', 'lib'];

// Only candidates shaped like a color/spacing utility are checked; the
// scanner also returns plain words from strings, which are not classes.
const UTILITY = /^(?:[\w-]+(?:\[[^\]]*\])?:)*!?-?(?:bg|text|border|ring|outline|divide|placeholder|from|via|to|fill|stroke|shadow|decoration|accent|caret)-[a-z0-9[]/;

function listFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full);
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : [];
  });
}

const css = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
const designSystem = await __unstable__loadDesignSystem(css, { base: path.join(root, 'app') });
const scanner = new Scanner({});

const usages = new Map(); // candidate -> ["file:line", ...]
for (const file of SOURCE_DIRS.flatMap((dir) => listFiles(path.join(root, dir)))) {
  const content = fs.readFileSync(file, 'utf8');
  const extension = path.extname(file).slice(1);
  for (const { candidate, position } of scanner.getCandidatesWithPositions({ content, extension })) {
    if (!UTILITY.test(candidate)) continue;
    const line = content.slice(0, position).split('\n').length;
    const where = `${path.relative(root, file)}:${line}`;
    usages.set(candidate, [...(usages.get(candidate) ?? []), where]);
  }
}

const candidates = [...usages.keys()];
const results = designSystem.candidatesToCss(candidates);
const unknown = candidates.filter((_, i) => !results[i]).sort();

if (unknown.length === 0) {
  console.log(`check-classes: ${candidates.length} utility classes checked, all generate CSS.`);
  process.exit(0);
}

console.error(`check-classes: ${unknown.length} classes generate no CSS:\n`);
for (const candidate of unknown) {
  console.error(`  ${candidate}`);
  for (const where of usages.get(candidate).slice(0, 3)) console.error(`      ${where}`);
}
process.exit(1);
