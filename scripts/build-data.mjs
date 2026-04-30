import { writeFile, mkdir } from 'node:fs/promises';

const owner = 'openclaw';
const repo = 'openclaw';
const apiBase = `https://api.github.com/repos/${owner}/${repo}/releases`;
const userAgent = 'openclaw-release-radar/1.0 (+https://github.com/thecobb/openclaw-release-tracker)';

const monthsDefault = 3;
const jacobKeywords = [
  'telegram', 'gateway', 'browser', 'chromium', 'playwright', 'memory', 'session', 'sessions',
  'agent', 'agents', 'subagent', 'heartbeat', 'tool', 'tools', 'exec', 'approval', 'approvals',
  'codex', 'acp', 'claude', 'github', 'pages', 'plugin', 'provider', 'tts', 'voice', 'media',
  'download', 'pdf', 'crawl', 'security', 'auth', 'token', 'config', 'openclaw update'
];
const securityKeywords = [
  'security', 'vulnerab', 'cve-', 'cve ', 'exploit', 'xss', 'csrf', 'ssrf', 'injection',
  'sanitize', 'sandbox', 'permission', 'approval', 'allowlist', 'auth', 'oauth', 'token', 'secret',
  'credential', 'cookie', 'encrypt', 'tls', 'signature', 'verify', 'trusted', 'untrusted', 'redact',
  'escape', 'path traversal', 'rce', 'remote code', 'privilege'
];
const majorKeywords = [
  'breaking', 'migration', 'migrate', 'removed', 'deprecat', 'major', 'platform', 'runtime',
  'gateway', 'config', 'schema', 'protocol', 'api', 'service', 'daemon', 'installer', 'update',
  'plugin', 'provider', 'channel', 'database', 'registry', 'router', 'transport', 'desktop', 'mobile'
];
const usefulKeywords = [
  'fix', 'reliab', 'stable', 'performance', 'speed', 'faster', 'latency', 'ux', 'ui', 'docs',
  'diagnostic', 'doctor', 'status', 'logs', 'repair', 'fallback', 'retry', 'timeout', 'compatibility'
];

function normalize(text = '') {
  return String(text).toLowerCase();
}

function keywordHits(text, keywords) {
  const hay = normalize(text);
  return keywords.filter(k => hay.includes(k));
}

function splitReleaseItems(body = '') {
  const lines = body.replace(/\r/g, '').split('\n');
  const items = [];
  let section = 'Notes';
  let current = null;

  function flush() {
    if (current && current.text.trim()) items.push(current);
    current = null;
  }

  for (const line of lines) {
    const heading = line.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (heading) {
      flush();
      section = heading[2].replace(/[#*_`]/g, '').trim();
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (bullet) {
      flush();
      current = { section, text: bullet[1].trim() };
      continue;
    }
    if (current && /^\s{2,}\S/.test(line)) {
      current.text += ' ' + line.trim();
    }
  }
  flush();
  return items;
}

function plain(text = '') {
  return text
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[*_~#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyItem(item) {
  const text = `${item.section} ${item.text}`;
  const security = keywordHits(text, securityKeywords);
  const major = keywordHits(text, majorKeywords);
  const relevant = keywordHits(text, jacobKeywords);
  const useful = keywordHits(text, usefulKeywords);
  let score = 0;
  score += security.length * 8;
  score += major.length * 4;
  score += relevant.length * 5;
  score += useful.length * 2;
  if (/^highlights?$/i.test(item.section)) score += 8;
  if (/^breaking|migration/i.test(item.section)) score += 12;
  if (/^security/i.test(item.section)) score += 18;
  const labels = [];
  if (security.length) labels.push('security');
  if (major.length || /^breaking|migration/i.test(item.section)) labels.push('platform');
  if (relevant.length) labels.push('relevant');
  if (useful.length) labels.push('quality');
  return {
    section: item.section,
    text: plain(item.text),
    score,
    labels: [...new Set(labels)],
    hits: {
      security: [...new Set(security)],
      platform: [...new Set(major)],
      relevant: [...new Set(relevant)],
      quality: [...new Set(useful)]
    }
  };
}

function semverBits(tag) {
  const m = tag.match(/v?(\d+)\.(\d+)\.(\d+)(?:[-.]([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { year: +m[1], month: +m[2], patch: +m[3], suffix: m[4] || '' };
}

function releaseSummary(release, items) {
  const highlights = items.filter(i => /^highlights?$/i.test(i.section)).slice(0, 4);
  const highScore = [...items].sort((a, b) => b.score - a.score).slice(0, 5);
  const allHits = {
    security: [...new Set(items.flatMap(i => i.hits.security))],
    platform: [...new Set(items.flatMap(i => i.hits.platform))],
    relevant: [...new Set(items.flatMap(i => i.hits.relevant))],
    quality: [...new Set(items.flatMap(i => i.hits.quality))]
  };
  const maxItemScore = highScore[0]?.score || 0;
  let importance = 'routine';
  if (allHits.security.length || maxItemScore >= 45) importance = 'high';
  else if (allHits.platform.length >= 3 || allHits.relevant.length >= 3 || maxItemScore >= 25) importance = 'medium';
  const reasons = [];
  if (allHits.security.length) reasons.push('security-sensitive wording');
  if (allHits.relevant.length) reasons.push(`matches your setup: ${allHits.relevant.slice(0, 8).join(', ')}`);
  if (allHits.platform.length) reasons.push(`platform change signals: ${allHits.platform.slice(0, 8).join(', ')}`);
  if (allHits.quality.length) reasons.push(`quality/reliability: ${allHits.quality.slice(0, 6).join(', ')}`);
  return {
    title: release.name || release.tag_name,
    headline: (highlights[0]?.text || highScore[0]?.text || plain(release.body || '').slice(0, 180) || 'Release notes available.'),
    importance,
    score: items.reduce((sum, i) => sum + i.score, 0),
    topItems: (highlights.length ? highlights : highScore).slice(0, 5),
    reasons,
    hitCounts: Object.fromEntries(Object.entries(allHits).map(([k, v]) => [k, v.length]))
  };
}

async function fetchJson(url) {
  const headers = { 'User-Agent': userAgent, 'Accept': 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchAllReleases() {
  const releases = [];
  for (let page = 1; page <= 50; page++) {
    const url = `${apiBase}?per_page=100&page=${page}`;
    const batch = await fetchJson(url);
    if (!batch.length) break;
    releases.push(...batch);
    if (batch.length < 100) break;
  }
  return releases;
}

const raw = await fetchAllReleases();
const releases = raw.map(rel => {
  const items = splitReleaseItems(rel.body || '').map(classifyItem);
  const summary = releaseSummary(rel, items);
  return {
    tag: rel.tag_name,
    version: rel.tag_name.replace(/^v/, ''),
    versionParts: semverBits(rel.tag_name),
    name: rel.name || rel.tag_name,
    url: rel.html_url,
    apiUrl: rel.url,
    publishedAt: rel.published_at,
    createdAt: rel.created_at,
    prerelease: !!rel.prerelease,
    draft: !!rel.draft,
    bodyExcerpt: plain(rel.body || '').slice(0, 500),
    summary,
    items
  };
});

const generatedAt = new Date().toISOString();
const latestDate = releases[0]?.publishedAt || generatedAt;
const defaultSince = new Date(latestDate);
defaultSince.setMonth(defaultSince.getMonth() - monthsDefault);
const data = {
  schemaVersion: 1,
  generatedAt,
  source: { owner, repo, url: `https://github.com/${owner}/${repo}/releases`, apiBase },
  defaults: { months: monthsDefault, since: defaultSince.toISOString() },
  releaseCount: releases.length,
  stableCount: releases.filter(r => !r.prerelease).length,
  latest: releases[0] ? { tag: releases[0].tag, version: releases[0].version, publishedAt: releases[0].publishedAt, url: releases[0].url } : null,
  keywords: { jacobKeywords, securityKeywords, majorKeywords, usefulKeywords },
  releases
};

await mkdir('data', { recursive: true });
await writeFile('data/releases.json', JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${releases.length} releases to data/releases.json`);
