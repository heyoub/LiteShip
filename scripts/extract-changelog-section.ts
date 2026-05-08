import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const argv = process.argv;
let version = '';
let out = '';
let changelogPath = 'CHANGELOG.md';
for (let i = 2; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--version') version = argv[++i] ?? '';
  else if (a === '--out') out = argv[++i] ?? '';
  else if (a === '--changelog') changelogPath = argv[++i] ?? changelogPath;
}
if (!version || !out) {
  throw new Error('Usage: tsx scripts/extract-changelog-section.ts --version X.Y.Z --out path');
}
const heading = `## [${version}]`;
const md = readFileSync(resolve(changelogPath), 'utf8');
const idx = md.indexOf(heading);
if (idx === -1) throw new Error(`Missing ${heading}`);
const tail = md.slice(idx);
const lines = tail.split(/\r?\n/);
const acc: string[] = [lines[0]!];
for (let i = 1; i < lines.length; i++) {
  if (lines[i]!.startsWith('## [')) break;
  acc.push(lines[i]!);
}
writeFileSync(resolve(out), `${acc.join('\n').trimEnd()}\n`, 'utf8');
console.log(`Wrote ${out}`);