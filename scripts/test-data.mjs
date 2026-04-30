import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile('data/releases.json', 'utf8'));
const failures = [];
if (!data.releaseCount || data.releaseCount < 3) failures.push('expected at least 3 releases');
if (!data.latest?.tag) failures.push('missing latest release');
if (!Array.isArray(data.releases) || data.releases.length !== data.releaseCount) failures.push('releaseCount mismatch');
for (const rel of data.releases.slice(0, 10)) {
  if (!rel.tag || !rel.url || !rel.publishedAt) failures.push(`release missing basics: ${rel.tag}`);
  if (!rel.summary || !rel.items) failures.push(`release missing summary/items: ${rel.tag}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`OK: ${data.releaseCount} releases, latest ${data.latest.tag}`);
