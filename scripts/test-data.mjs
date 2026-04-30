import { readFile } from 'node:fs/promises';
const data = JSON.parse(await readFile('data/releases.json', 'utf8'));
const failures = [];
if (!data.releaseCount || data.releaseCount < 3) failures.push('expected at least 3 releases');
if (!data.latest?.tag) failures.push('missing latest release');
if (!Array.isArray(data.releases) || data.releases.length !== data.releaseCount) failures.push('releaseCount mismatch');
for (const rel of data.releases.slice(0, 10)) {
  if (!rel.tag || !rel.url || !rel.publishedAt) failures.push(`release missing basics: ${rel.tag}`);
  if (!rel.summary || !rel.items) failures.push(`release missing summary/items: ${rel.tag}`);
  if (!Array.isArray(rel.summary.filterLabels)) failures.push(`release missing filterLabels: ${rel.tag}`);
}

const since = new Date(data.defaults.since);
const defaultStable = data.releases.filter(r => !r.prerelease && new Date(r.publishedAt) >= since);
if (defaultStable.length < 3) failures.push('expected at least 3 stable releases in default window');
const highCount = defaultStable.filter(r => r.summary.importance === 'high').length;
if (highCount === 0 || highCount === defaultStable.length) failures.push(`importance filter is not selective in default stable view (${highCount}/${defaultStable.length})`);
for (const label of ['security', 'platform', 'relevant', 'quality']) {
  const count = defaultStable.filter(r => r.summary.filterLabels.includes(label)).length;
  if (count === 0 || count === defaultStable.length) failures.push(`${label} chip is not selective in default stable view (${count}/${defaultStable.length})`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`OK: ${data.releaseCount} releases, latest ${data.latest.tag}`);
