// Collects today's GitHub trending list into data/YYYY-MM-DD.json and READMEs into .work/readme/.
// Analysis fields are left empty for the report author to fill in. Pass --force to overwrite.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const README_DIR = join(ROOT, '.work', 'readme');
const README_LIMIT = 8000;
const UA = { 'User-Agent': 'Mozilla/5.0 (today-trending report)' };

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const outPath = join(DATA_DIR, `${date}.json`);

if (existsSync(outPath) && !process.argv.includes('--force')) {
  console.error(`${outPath} already exists. Pass --force to overwrite it.`);
  process.exit(1);
}

const decode = (s) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (s) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const num = (s) => (s ? Number(s.replace(/,/g, '')) : 0);

function parseTrending(html) {
  const blocks = html.match(/<article class="Box-row">[\s\S]*?<\/article>/g) ?? [];
  return blocks.map((block, i) => {
    const fullName = block.match(/<h2[^>]*>\s*<a[^>]*href="\/([^"]+)"/)?.[1];
    if (!fullName || !/^[\w.-]+\/[\w.-]+$/.test(fullName)) {
      throw new Error(`Could not parse repository name in entry ${i + 1}`);
    }
    return {
      rank: i + 1,
      fullName,
      url: `https://github.com/${fullName}`,
      language: block.match(/itemprop="programmingLanguage">([^<]+)</)?.[1] ?? null,
      stars: num(block.match(/\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      forks: num(block.match(/\/forks"[\s\S]*?<\/svg>\s*([\d,]+)/)?.[1]),
      starsToday: num(block.match(/([\d,]+) stars? today/)?.[1]),
      description: text(block.match(/<p class="col-9[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? ''),
    };
  });
}

function previousReport() {
  const prev = readdirSync(DATA_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f < `${date}.json`)
    .sort().at(-1);
  return prev ? JSON.parse(readFileSync(join(DATA_DIR, prev), 'utf8')) : null;
}

async function fetchReadme(fullName) {
  for (const name of ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README']) {
    const res = await fetch(`https://raw.githubusercontent.com/${fullName}/HEAD/${name}`, { headers: UA });
    if (res.ok) {
      const body = (await res.text()).replace(/<!--[\s\S]*?-->|<[^>]+>/g, '').replace(/\n\s*\n+/g, '\n');
      return body.slice(0, README_LIMIT);
    }
  }
  return null;
}

const res = await fetch('https://github.com/trending', { headers: UA });
if (!res.ok) throw new Error(`GitHub trending returned ${res.status}`);
const repos = parseTrending(await res.text());
if (repos.length === 0) throw new Error('No repositories found: the trending page markup may have changed');

const prev = previousReport();
const prevByName = new Map((prev?.repos ?? []).map((r) => [r.fullName, r]));

mkdirSync(README_DIR, { recursive: true });
const missing = [];
for (const repo of repos) {
  const seen = prevByName.get(repo.fullName);
  repo.isNew = Boolean(prev) && !seen;
  repo.streak = seen ? seen.streak + 1 : 1;
  Object.assign(repo, { category: '', oneLiner: '', whyTrending: '', useCase: '' });

  const readme = await fetchReadme(repo.fullName);
  if (readme === null) missing.push(repo.fullName);
  else writeFileSync(join(README_DIR, `${repo.fullName.replace('/', '__')}.md`), readme);
}

writeFileSync(outPath, JSON.stringify({ date, previousDate: prev?.date ?? null, summary: [], repos }, null, 2) + '\n');
console.log(`Saved ${repos.length} repositories to data/${date}.json (compared with ${prev?.date ?? 'nothing'})`);
if (missing.length) console.log(`No README found: ${missing.join(', ')}`);
