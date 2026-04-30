import { writeFile, mkdir } from 'node:fs/promises';

const owner = 'openclaw';
const repo = 'openclaw';
const apiBase = `https://api.github.com/repos/${owner}/${repo}/releases`;
const userAgent = 'openclaw-release-radar/1.0 (+https://github.com/thecobb/openclaw-release-tracker)';

const monthsDefault = 3;

const jacobKeywords = [
  { id: 'telegram', re: /\btelegram\b/i, weight: 5 },
  { id: 'gateway', re: /\bgateway\b/i, weight: 5 },
  { id: 'browser', re: /\b(browser|chromium|chrome|playwright|cdp)\b/i, weight: 5 },
  { id: 'memory', re: /\bmemory\b/i, weight: 5 },
  { id: 'sessions', re: /\b(subagent|subagents|session|sessions)\b/i, weight: 4 },
  { id: 'heartbeat', re: /\bheartbeat\b/i, weight: 5 },
  { id: 'tools/exec', re: /\b(exec|tool calls?|tools?\.exec|approval|approvals|allowlist)\b/i, weight: 5 },
  { id: 'codex/acp', re: /\b(codex|acp|claude code|opencode|coding agent)\b/i, weight: 5 },
  { id: 'media/pdf', re: /\b(tts|voice|media|download|pdf|crawl-to-pdf)\b/i, weight: 3 },
  { id: 'config/update', re: /\b(config|openclaw update|doctor|status)\b/i, weight: 3 },
];

const securityStrongKeywords = [
  { id: 'cve', re: /\bCVE-?\d{4}-\d+\b|\bcve\b/i, weight: 20 },
  { id: 'vulnerability', re: /\bvulnerab(?:ility|ilities|le)\b/i, weight: 18 },
  { id: 'exploit', re: /\bexploit(?:ed|able|s)?\b/i, weight: 18 },
  { id: 'xss', re: /\bxss\b|cross-site scripting/i, weight: 18 },
  { id: 'csrf', re: /\bcsrf\b/i, weight: 18 },
  { id: 'ssrf', re: /\bssrf\b/i, weight: 18 },
  { id: 'injection', re: /\b(sql|command|prompt|shell)?\s*injection\b/i, weight: 16 },
  { id: 'rce', re: /\brce\b|remote code execution/i, weight: 22 },
  { id: 'path traversal', re: /\bpath traversal\b|directory traversal/i, weight: 18 },
  { id: 'privilege escalation', re: /\bprivilege escalation\b/i, weight: 18 },
  { id: 'sandbox escape', re: /\bsandbox escape\b/i, weight: 18 },
  { id: 'auth bypass', re: /\b(auth(?:entication)?|permission|approval) bypass\b|bypass(?:es|ed|ing)?\s+(auth|permission|approval)/i, weight: 18 },
  { id: 'secret leak', re: /\b(secret|token|credential|cookie)\s+(leak|exposure|exfiltration|disclosure)\b|\bleak(?:ed|s|ing)?\s+(secret|token|credential|cookie)s?\b/i, weight: 18 },
];

const securityContextKeywords = [
  { id: 'security', re: /\bsecurity\b/i, weight: 5 },
  { id: 'sandbox', re: /\bsandbox(?:ed|ing)?\b/i, weight: 4 },
  { id: 'permission', re: /\bpermission(?:s)?\b/i, weight: 4 },
  { id: 'approval', re: /\bapproval(?:s)?\b/i, weight: 4 },
  { id: 'auth', re: /\bauth(?:entication|orization)?\b|\boauth\b/i, weight: 4 },
  { id: 'token', re: /\btoken(?:s)?\b/i, weight: 3 },
  { id: 'secret', re: /\bsecret(?:s)?\b|\bcredential(?:s)?\b/i, weight: 4 },
  { id: 'cookie', re: /\bcookie(?:s)?\b/i, weight: 3 },
  { id: 'allowlist', re: /\ballowlist\b|\bdenylist\b/i, weight: 4 },
  { id: 'redaction', re: /\bredact(?:ed|ion|s)?\b/i, weight: 4 },
  { id: 'sanitize', re: /\bsanitize(?:d|s|ation)?\b/i, weight: 4 },
  { id: 'tls/encryption', re: /\btls\b|\bencrypt(?:ed|ion)?\b/i, weight: 4 },
];

const securityActionRe = /\b(fix(?:es|ed)?|harden(?:s|ed|ing)?|protect(?:s|ed|ion)?|prevent(?:s|ed|ing)?|restrict(?:s|ed|ing)?|fail-closed|redact(?:s|ed)?|sanitize(?:s|d)?|escape(?:s|d)?|validate(?:s|d)?|enforce(?:s|d)?|require(?:s|d)?|block(?:s|ed)?|guard(?:s|ed)?)\b/i;

const platformStrongKeywords = [
  { id: 'breaking', re: /\bbreaking\b|\bbreaks\b/i, weight: 14 },
  { id: 'migration', re: /\bmigrat(?:e|es|ed|ion|ions)\b/i, weight: 12 },
  { id: 'deprecation', re: /\bdeprecat(?:e|es|ed|ion)\b|\bremoved?\b|\bremoval\b/i, weight: 10 },
  { id: 'config/schema', re: /\b(config schema|schema|configuration contract|config(?:uration)? reload)\b/i, weight: 8 },
  { id: 'gateway/service', re: /\b(gateway|service|daemon|entrypoint|installer|systemd)\b/i, weight: 7 },
  { id: 'runtime/protocol', re: /\b(runtime|protocol|transport|router|bridge|mcp)\b/i, weight: 7 },
  { id: 'plugin registry', re: /\b(plugin registry|provider index|manifest|marketplace|catalog)\b/i, weight: 7 },
  { id: 'channel/platform', re: /\b(channel|desktop|mobile|node pairing|pairing)\b/i, weight: 5 },
];

const qualityKeywords = [
  { id: 'fix', re: /\bfix(?:es|ed)?\b/i, weight: 3 },
  { id: 'reliability', re: /\breliab(?:le|ility)|\bstabil(?:ize|ity|izes|ized)\b/i, weight: 4 },
  { id: 'performance', re: /\bperformance\b|\bfaster\b|\bspeed\b|\blatency\b/i, weight: 4 },
  { id: 'diagnostics', re: /\bdiagnostic(?:s)?\b|\bdoctor\b|\bstatus\b|\blogs?\b|\brepair\b/i, weight: 3 },
  { id: 'fallback/retry', re: /\bfallback\b|\bretry\b|\btimeout\b/i, weight: 3 },
  { id: 'compatibility', re: /\bcompatib(?:le|ility)\b/i, weight: 3 },
  { id: 'ux/ui', re: /\bux\b|\bui\b|\binterface\b/i, weight: 2 },
];

function matchKeywords(text, defs) {
  return defs.filter(k => k.re.test(text)).map(k => k.id);
}

function keywordScore(text, defs) {
  return defs.reduce((sum, k) => sum + (k.re.test(text) ? k.weight : 0), 0);
}

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
  const strongSecurity = matchKeywords(text, securityStrongKeywords);
  const securityContext = matchKeywords(text, securityContextKeywords);
  const platform = matchKeywords(text, platformStrongKeywords);
  const relevant = matchKeywords(text, jacobKeywords);
  const quality = matchKeywords(text, qualityKeywords);

  const sectionSecurity = /^security/i.test(item.section);
  const securityContextual = securityContext.length >= 2 && securityActionRe.test(text);
  const security = (strongSecurity.length || sectionSecurity || securityContextual)
    ? [...new Set([...strongSecurity, ...(sectionSecurity || securityContextual ? securityContext : [])])]
    : [];

  let score = 0;
  score += keywordScore(text, securityStrongKeywords);
  if (securityContextual || sectionSecurity) score += Math.min(12, keywordScore(text, securityContextKeywords));
  score += keywordScore(text, platformStrongKeywords);
  score += keywordScore(text, jacobKeywords);
  score += keywordScore(text, qualityKeywords);
  if (/^highlights?$/i.test(item.section)) score += 5;
  if (/^breaking|migration/i.test(item.section)) score += 12;
  if (sectionSecurity) score += 18;

  const labels = [];
  if (security.length) labels.push('security');
  if (platform.length || /^breaking|migration/i.test(item.section)) labels.push('platform');
  if (relevant.length) labels.push('relevant');
  if (quality.length) labels.push('quality');
  return {
    section: item.section,
    text: plain(item.text),
    score,
    labels: [...new Set(labels)],
    hits: {
      security: [...new Set(security)],
      platform: [...new Set(platform)],
      relevant: [...new Set(relevant)],
      quality: [...new Set(quality)]
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
  const totalScore = items.reduce((sum, i) => sum + i.score, 0);
  const securityItems = items.filter(i => i.labels.includes('security')).length;
  const platformItems = items.filter(i => i.labels.includes('platform')).length;
  const relevantItems = items.filter(i => i.labels.includes('relevant')).length;
  const qualityItems = items.filter(i => i.labels.includes('quality')).length;
  const filterLabels = [];
  if (securityItems >= 10 || allHits.security.some(h => ['cve', 'vulnerability', 'exploit', 'xss', 'csrf', 'rce', 'path traversal', 'privilege escalation', 'sandbox escape', 'auth bypass', 'secret leak'].includes(h))) filterLabels.push('security');
  if (platformItems >= 50 || allHits.platform.includes('breaking')) filterLabels.push('platform');
  if (relevantItems >= 50) filterLabels.push('relevant');
  if (qualityItems >= 80) filterLabels.push('quality');

  let importance = 'routine';
  if (securityItems >= 10 || maxItemScore >= 70 || platformItems >= 90) importance = 'high';
  else if (securityItems >= 4 || platformItems >= 30 || relevantItems >= 50 || maxItemScore >= 35) importance = 'medium';
  const reasons = [];
  if (allHits.security.length) reasons.push('security-sensitive wording');
  if (allHits.relevant.length) reasons.push(`matches your setup: ${allHits.relevant.slice(0, 8).join(', ')}`);
  if (allHits.platform.length) reasons.push(`platform change signals: ${allHits.platform.slice(0, 8).join(', ')}`);
  if (allHits.quality.length) reasons.push(`quality/reliability: ${allHits.quality.slice(0, 6).join(', ')}`);
  return {
    title: release.name || release.tag_name,
    headline: (highlights[0]?.text || highScore[0]?.text || plain(release.body || '').slice(0, 180) || 'Release notes available.'),
    importance,
    score: totalScore,
    topItems: (highlights.length ? highlights : highScore).slice(0, 5),
    reasons,
    filterLabels,
    labelItemCounts: { security: securityItems, platform: platformItems, relevant: relevantItems, quality: qualityItems },
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
  keywords: {
    jacobKeywords: jacobKeywords.map(k => k.id),
    securityStrongKeywords: securityStrongKeywords.map(k => k.id),
    securityContextKeywords: securityContextKeywords.map(k => k.id),
    platformStrongKeywords: platformStrongKeywords.map(k => k.id),
    qualityKeywords: qualityKeywords.map(k => k.id)
  },
  releases
};

await mkdir('data', { recursive: true });
await writeFile('data/releases.json', JSON.stringify(data, null, 2) + '\n');
console.log(`Wrote ${releases.length} releases to data/releases.json`);
