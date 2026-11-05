// Renders data/*.json into reports/YYYY-MM-DD.html and index.html (the latest report plus the archive).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const REPORT_DIR = join(ROOT, 'reports');
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const count = (n) => Number(n).toLocaleString('en-US');
const longDate = (d) => {
  const [y, m, day] = d.split('-').map(Number);
  return `${y}년 ${m}월 ${day}일 (${WEEKDAYS[new Date(y, m - 1, day).getDay()]})`;
};

const fetchedTime = (iso) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit', hour12: true,
}).format(new Date(iso));

function validate(report) {
  const problems = [];
  if (!report.summary?.length) problems.push('summary is empty');
  for (const r of report.repos) {
    for (const key of ['category', 'oneLiner', 'whyTrending', 'useCase']) {
      if (!r[key]?.trim()) problems.push(`${r.fullName}: ${key} is empty`);
    }
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(r.url)) problems.push(`${r.fullName}: invalid url`);
  }
  if (problems.length) throw new Error(`data/${report.date}.json is incomplete:\n- ${problems.join('\n- ')}`);
}

const badge = (r) => {
  if (r.isNew) return '<span class="badge badge-new">🆕 신규 진입</span>';
  return r.streak > 1 ? `<span class="badge">${r.streak}회 연속</span>` : '';
};

const repoCard = (r) => `
    <article class="repo" id="${esc(r.fullName.replace('/', '-'))}" data-category="${esc(r.category)}">
      <div class="repo-rank">${r.rank}</div>
      <div class="repo-body">
        <div class="repo-head">
          <h3><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.fullName)}</a></h3>
          ${badge(r)}
        </div>
        <p class="one-liner">${esc(r.oneLiner)}</p>
        <ul class="meta">
          <li class="today">★ +${count(r.starsToday)} 오늘</li>
          <li>★ ${count(r.stars)}</li>
          <li>⑂ ${count(r.forks)}</li>
          ${r.language ? `<li>${esc(r.language)}</li>` : ''}
          <li>${esc(r.category)}</li>
        </ul>
        <dl>
          <dt>주목받는 이유</dt><dd>${esc(r.whyTrending)}</dd>
          <dt>활용 포인트</dt><dd>${esc(r.useCase)}</dd>
        </dl>
      </div>
    </article>`;

function page(report, { dates, base, isIndex }) {
  const { date, repos, summary } = report;
  const i = dates.indexOf(date);
  const link = (d) => `${base}reports/${d}.html`;
  const older = dates[i + 1];
  const newer = dates[i - 1];
  const newCount = repos.filter((r) => r.isNew).length;
  const totalToday = repos.reduce((sum, r) => sum + r.starsToday, 0);
  const categories = [...new Set(repos.map((r) => r.category))];

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GitHub 트렌딩 리포트 ${date}</title>
<meta name="description" content="${esc(summary[0])}">
<link rel="stylesheet" href="${base}assets/style.css">
</head>
<body>
<main>
  <header>
    <p class="eyebrow"><a href="${base}index.html">Today Trending</a></p>
    <h1>${longDate(date)}</h1>
    ${report.fetchedAt ? `<p class="fetched-at">${fetchedTime(report.fetchedAt)} (KST) 기준</p>` : ''}
    <nav class="pager" aria-label="리포트 이동">
      ${older ? `<a href="${link(older)}">← ${older}</a>` : '<span></span>'}
      ${newer ? `<a href="${link(newer)}">${newer} →</a>` : '<span></span>'}
    </nav>
  </header>

  <section class="stats" aria-label="오늘의 수치">
    <div><strong>${repos.length}</strong><span>트렌딩 레포</span></div>
    <div><strong>${report.previousDate ? newCount : '–'}</strong><span>신규 진입</span></div>
    <div><strong>${count(totalToday)}</strong><span>오늘 받은 스타</span></div>
  </section>

  <section class="summary">
    <h2>오늘의 흐름</h2>
    <ul>${summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  </section>

  <section>
    <h2>레포지토리</h2>
    <div class="filters" role="group" aria-label="분야 필터">
      <button type="button" data-filter="" aria-pressed="true">전체 ${repos.length}</button>
      ${categories.map((c) => `<button type="button" data-filter="${esc(c)}" aria-pressed="false">${esc(c)} ${repos.filter((r) => r.category === c).length}</button>`).join('\n      ')}
    </div>
    <div class="repos">${repos.map(repoCard).join('')}
    </div>
  </section>
${isIndex ? `
  <section class="archive">
    <h2>지난 리포트</h2>
    <ul>${dates.map((d) => `<li><a href="${link(d)}">${longDate(d)}</a></li>`).join('')}</ul>
  </section>
` : ''}
  <footer>출처: <a href="https://github.com/trending">github.com/trending</a> · 평일 오전 자동 생성 · 설명과 분석은 AI가 작성했습니다.</footer>
</main>
<script>
const buttons = document.querySelectorAll('.filters button');
buttons.forEach((button) => button.addEventListener('click', () => {
  buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelectorAll('.repo').forEach((repo) => {
    repo.hidden = Boolean(button.dataset.filter) && repo.dataset.category !== button.dataset.filter;
  });
}));
</script>
</body>
</html>
`;
}

const files = readdirSync(DATA_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (files.length === 0) throw new Error('No reports in data/');
const reports = files.map((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')));
const dates = reports.map((r) => r.date);

mkdirSync(REPORT_DIR, { recursive: true });
for (const report of reports) {
  validate(report);
  writeFileSync(join(REPORT_DIR, `${report.date}.html`), page(report, { dates, base: '../', isIndex: false }));
}
writeFileSync(join(ROOT, 'index.html'), page(reports[0], { dates, base: '', isIndex: true }));
console.log(`Built ${reports.length} report(s); index shows ${dates[0]}`);
