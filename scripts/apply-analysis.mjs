// Merges .work/analysis.json ({ summary, repos: { "owner/name": { category, oneLiner, whyTrending, useCase } } })
// into data/YYYY-MM-DD.json. Usage: node scripts/apply-analysis.mjs YYYY-MM-DD
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(ROOT, 'data', `${process.argv[2]}.json`);
const report = JSON.parse(readFileSync(dataPath, 'utf8'));
const analysis = JSON.parse(readFileSync(join(ROOT, '.work', 'analysis.json'), 'utf8'));

const missing = report.repos.filter((r) => !analysis.repos[r.fullName]).map((r) => r.fullName);
if (missing.length) throw new Error(`No analysis for: ${missing.join(', ')}`);

report.summary = analysis.summary;
for (const repo of report.repos) {
  const { category, oneLiner, whyTrending, useCase } = analysis.repos[repo.fullName];
  Object.assign(repo, { category, oneLiner, whyTrending, useCase });
}
writeFileSync(dataPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Applied analysis to ${report.repos.length} repositories`);
