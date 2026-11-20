// Regression test for openclaw-release-tag-unescaped-innerhtml:
// release tag_name/html_url come from a third-party repo and must never reach
// innerHTML as markup or as a non-http(s) link target.
import { readFile } from 'node:fs/promises';
import { escapeHtml, httpUrl, safeHref, releaseLink } from '../html.js';

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const evil = { tag: 'v9.9.9<img/src=x/onerror=window.__xss=1>', url: 'https://github.com/example/example/releases/tag/v9.9.9"><img src=x onerror=alert(1)>' };
const html = releaseLink(evil);
check(!/<img/i.test(html), `markup in tag/url survived: ${html}`);
check(html.includes('v9.9.9&lt;img/src=x/onerror=window.__xss=1&gt;'), `tag not escaped as text: ${html}`);
check(!/"[^"]*"[^>]*onerror/.test(html.slice(0, html.indexOf('>'))), `href attribute broken out: ${html}`);

for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '/relative', '', null, undefined]) {
  check(httpUrl(bad) === '#', `non-http(s) url allowed: ${String(bad)}`);
  check(releaseLink({ tag: 'v1', url: bad }).startsWith('<a href="#">'), `non-http(s) href rendered: ${String(bad)}`);
}
check(escapeHtml(`&<>'"`) === '&amp;&lt;&gt;&#39;&quot;', 'escapeHtml mapping changed');

// No change for legitimate data: plain tags and GitHub URLs render exactly as before.
// (Only plain values are compared, so an unusual future tag cannot stall the daily refresh.)
const data = JSON.parse(await readFile(new URL('../data/releases.json', import.meta.url), 'utf8'));
const plain = data.releases.filter(r => /^[0-9A-Za-z._-]+$/.test(r.tag) && /^https:\/\/github\.com\/[0-9A-Za-z._\/-]+$/.test(r.url));
check(plain.length > 0, 'no plain releases to compare');
for (const rel of plain) {
  const before = `<a href="${rel.url}">${rel.tag}</a>`;
  check(releaseLink(rel) === before, `legitimate release rendering changed: ${rel.tag}`);
  check(safeHref(rel.url) === rel.url, `legitimate url changed: ${rel.url}`);
}

// Guard against reintroducing raw interpolation of tag/url in app.js templates.
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const raw = app.match(/\$\{\s*(?:rel|r|stable\[[a-z]+\])\.(?:tag|url)\s*\}/g) || [];
// The only allowed raw uses are the two new Option(...) labels, which are text, not HTML.
const optionLabels = (app.match(/new Option\(`\$\{rel\.tag\} \(/g) || []).length;
check(raw.length === optionLabels, `raw tag/url interpolation in app.js: ${raw.join(', ')}`);
check(!/\.href\s*=\s*rel\.url/.test(app), 'link.href assigned from rel.url without httpUrl()');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`OK: render escaping holds; ${plain.length}/${data.releases.length} indexed releases render unchanged`);
