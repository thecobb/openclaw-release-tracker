const state = {
  data: null,
  releases: [],
  visible: [],
  showAll: false,
  activeChip: null,
};

const $ = (id) => document.getElementById(id);
const fmtDate = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const relTemplate = $('release-template');

function formatDate(value) {
  if (!value) return 'unknown date';
  return fmtDate.format(new Date(value));
}

function monthsAgoFromLatest(data) {
  return new Date(data.defaults?.since || Date.now() - 90 * 864e5);
}

function scoreSort(a, b) {
  return (b.summary?.score || 0) - (a.summary?.score || 0) || new Date(b.publishedAt) - new Date(a.publishedAt);
}

function releaseSearchText(rel) {
  return [
    rel.tag, rel.version, rel.name, rel.summary?.headline,
    ...(rel.summary?.reasons || []),
    ...(rel.items || []).slice(0, 80).map(i => `${i.section} ${i.text} ${(i.labels || []).join(' ')}`)
  ].join(' ').toLowerCase();
}

function labelForImportance(level) {
  if (level === 'high') return 'High attention';
  if (level === 'medium') return 'Medium';
  return 'Routine';
}

function isRelevant(rel) {
  return (rel.summary?.hitCounts?.relevant || 0) > 0 || (rel.items || []).some(i => i.labels?.includes('relevant'));
}

function matchesChip(rel, chip) {
  if (!chip) return true;
  return (rel.items || []).some(i => i.labels?.includes(chip));
}

function baseVisibleReleases() {
  let releases = [...state.releases];
  if (!state.showAll) {
    const since = monthsAgoFromLatest(state.data);
    releases = releases.filter(rel => new Date(rel.publishedAt) >= since);
  }
  return releases;
}

function applyFilters() {
  const q = $('search').value.trim().toLowerCase();
  const importance = $('importance-filter').value;
  const releaseType = $('release-type').value;
  let releases = baseVisibleReleases();

  if (releaseType === 'stable') releases = releases.filter(rel => !rel.prerelease);
  if (releaseType === 'prerelease') releases = releases.filter(rel => rel.prerelease);

  if (importance === 'high') releases = releases.filter(rel => rel.summary?.importance === 'high');
  if (importance === 'medium') releases = releases.filter(rel => ['high', 'medium'].includes(rel.summary?.importance));
  if (importance === 'routine') releases = releases.filter(rel => rel.summary?.importance === 'routine');

  if (state.activeChip) releases = releases.filter(rel => matchesChip(rel, state.activeChip));
  if (q) releases = releases.filter(rel => releaseSearchText(rel).includes(q));

  state.visible = releases;
  render();
}

function renderSummary() {
  const latest = state.data.latest;
  $('latest-version').textContent = latest?.tag || '—';
  $('latest-date').textContent = latest ? formatDate(latest.publishedAt) : '—';
  $('showing-count').textContent = state.visible.length.toLocaleString();
  $('showing-mode').textContent = state.showAll ? `of ${state.releases.length} indexed releases` : `last ${state.data.defaults?.months || 3} months`;
  $('high-count').textContent = state.visible.filter(r => r.summary?.importance === 'high').length.toLocaleString();
  $('relevant-count').textContent = state.visible.filter(isRelevant).length.toLocaleString();
}

function renderDigest() {
  const digest = [...state.visible].filter(r => r.summary?.importance !== 'routine' || isRelevant(r)).sort(scoreSort).slice(0, 6);
  const container = $('digest-list');
  container.textContent = '';
  if (!digest.length) {
    container.innerHTML = '<p class="muted">No prioritized releases match the current filters.</p>';
    return;
  }
  for (const rel of digest) {
    const item = document.createElement('article');
    item.className = 'digest-item';
    const reasons = rel.summary?.reasons?.slice(0, 2).join(' · ') || 'Notable release activity';
    item.innerHTML = `
      <h3><a href="${rel.url}">${rel.tag}</a></h3>
      <p><strong>${labelForImportance(rel.summary?.importance)}</strong> · ${formatDate(rel.publishedAt)}</p>
      <p>${escapeHtml(rel.summary?.headline || '')}</p>
      <p>${escapeHtml(reasons)}</p>
    `;
    container.append(item);
  }
}

function renderReleaseList() {
  const list = $('release-list');
  list.textContent = '';
  if (!state.visible.length) {
    const empty = document.createElement('article');
    empty.className = 'release-card';
    empty.textContent = 'No releases match the current filters.';
    list.append(empty);
    return;
  }
  for (const rel of state.visible) {
    const node = relTemplate.content.cloneNode(true);
    const card = node.querySelector('.release-card');
    const link = node.querySelector('.release-link');
    const badge = node.querySelector('.importance-badge');
    const pre = node.querySelector('.pre-badge');
    const meta = node.querySelector('.release-meta');
    const headline = node.querySelector('.headline');
    const reasons = node.querySelector('.reason-list');
    const topItems = node.querySelector('.top-items');

    link.href = rel.url;
    link.textContent = rel.tag;
    badge.className = `importance-badge ${rel.summary?.importance || 'routine'}`;
    badge.textContent = labelForImportance(rel.summary?.importance);
    pre.hidden = !rel.prerelease;
    meta.textContent = `${formatDate(rel.publishedAt)} · ${rel.items?.length || 0} parsed changes · score ${Math.round(rel.summary?.score || 0)}`;
    headline.textContent = rel.summary?.headline || 'Release notes available.';

    const reasonTexts = rel.summary?.reasons?.length ? rel.summary.reasons : ['No strong keyword signals; skim when convenient.'];
    for (const reason of reasonTexts.slice(0, 4)) {
      const span = document.createElement('span');
      span.className = 'label';
      span.textContent = reason;
      reasons.append(span);
    }

    const top = rel.summary?.topItems?.length ? rel.summary.topItems : (rel.items || []).slice(0, 5);
    for (const item of top.slice(0, 7)) {
      const li = document.createElement('li');
      const labels = item.labels?.length ? ` · ${item.labels.join(', ')}` : '';
      li.innerHTML = `${escapeHtml(item.text)}<small>${escapeHtml(item.section || 'Notes')}${escapeHtml(labels)}</small>`;
      topItems.append(li);
    }

    list.append(card);
  }
}

function renderCompareOptions() {
  const from = $('compare-from');
  const to = $('compare-to');
  if (from.options.length) return;
  for (const rel of state.releases.filter(r => !r.prerelease)) {
    const a = new Option(`${rel.tag} (${formatDate(rel.publishedAt)})`, rel.tag);
    const b = new Option(`${rel.tag} (${formatDate(rel.publishedAt)})`, rel.tag);
    from.add(a);
    to.add(b);
  }
  if (to.options.length > 0) to.selectedIndex = 0;
  if (from.options.length > 1) from.selectedIndex = Math.min(5, from.options.length - 1);
  from.addEventListener('change', renderCompare);
  to.addEventListener('change', renderCompare);
  renderCompare();
}

function renderCompare() {
  const fromTag = $('compare-from').value;
  const toTag = $('compare-to').value;
  const stable = state.releases.filter(r => !r.prerelease);
  const fromIndex = stable.findIndex(r => r.tag === fromTag);
  const toIndex = stable.findIndex(r => r.tag === toTag);
  const output = $('compare-output');
  if (fromIndex < 0 || toIndex < 0) return;
  const older = Math.max(fromIndex, toIndex);
  const newer = Math.min(fromIndex, toIndex);
  const span = stable.slice(newer, older + 1);
  const top = [...span].sort(scoreSort).slice(0, 5);
  const security = span.filter(r => (r.summary?.hitCounts?.security || 0) > 0).length;
  const relevant = span.filter(isRelevant).length;
  output.innerHTML = `
    <p><strong>${span.length}</strong> stable releases included, from <strong>${stable[older].tag}</strong> through <strong>${stable[newer].tag}</strong>. ${security} security-sensitive, ${relevant} likely relevant to Jacob's setup.</p>
    <ul>${top.map(r => `<li><a href="${r.url}">${r.tag}</a>: ${escapeHtml(r.summary?.headline || '')}</li>`).join('')}</ul>
  `;
}

function render() {
  renderSummary();
  renderDigest();
  renderReleaseList();
  renderCompareOptions();
}

function showApp() {
  for (const id of ['summary-grid', 'controls', 'digest', 'compare', 'release-list']) $(id).hidden = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

async function loadLocalData() {
  const res = await fetch('data/releases.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load local release index: ${res.status}`);
  return res.json();
}

function acceptData(data, sourceLabel = 'local index') {
  state.data = data;
  state.releases = data.releases || [];
  $('load-status').textContent = `Loaded ${data.releaseCount || state.releases.length} OpenClaw releases from ${sourceLabel}. Data generated ${formatDate(data.generatedAt)}.`;
  showApp();
  applyFilters();
}

async function tryLiveRefresh() {
  $('refresh-live').disabled = true;
  $('load-status').textContent = 'Trying direct GitHub API refresh in this browser…';
  try {
    // Robust by design: the app does not require this path. GitHub Pages can normally use it,
    // but the local JSON remains the primary path for artifact/Pages reliability.
    const res = await fetch('https://api.github.com/repos/openclaw/openclaw/releases?per_page=10', {
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const latest = await res.json();
    const latestTag = latest[0]?.tag_name;
    $('load-status').textContent = latestTag
      ? `Live GitHub API is reachable; latest there is ${latestTag}. The full UI is still using the bundled indexed data.`
      : 'Live GitHub API responded, but no releases were returned. Continuing with bundled data.';
  } catch (err) {
    $('load-status').textContent = `Live refresh failed (${err.message}). Continuing safely with bundled local data.`;
  } finally {
    $('refresh-live').disabled = false;
  }
}

$('load-default').addEventListener('click', () => { state.showAll = false; applyFilters(); });
$('load-all').addEventListener('click', () => { state.showAll = true; applyFilters(); });
$('refresh-live').addEventListener('click', tryLiveRefresh);
$('search').addEventListener('input', applyFilters);
$('importance-filter').addEventListener('change', applyFilters);
$('release-type').addEventListener('change', applyFilters);
for (const chip of document.querySelectorAll('.chip')) {
  chip.addEventListener('click', () => {
    const filter = chip.dataset.filter;
    if (filter === 'clear') state.activeChip = null;
    else state.activeChip = state.activeChip === filter ? null : filter;
    for (const c of document.querySelectorAll('.chip')) c.classList.toggle('active', c.dataset.filter === state.activeChip);
    applyFilters();
  });
}

loadLocalData()
  .then(data => acceptData(data))
  .catch(err => {
    $('load-status').textContent = `${err.message}. This deployment is missing data/releases.json; rebuild with npm run build:data.`;
  });
