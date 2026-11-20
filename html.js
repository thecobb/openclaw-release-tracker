// HTML helpers shared by app.js and scripts/test-render.mjs.
// Release tag_name and html_url come from a third-party repository, so every
// value interpolated into an innerHTML template must pass through these.

export function escapeHtml(s) {
  return String(s).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

// Returns the normalized URL for http(s) values and '#' for anything else
// (javascript:, data:, relative paths, unparsable values).
export function httpUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return '#';
  }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '#';
}

export function safeHref(url) {
  return escapeHtml(httpUrl(url));
}

export function releaseLink(rel) {
  return `<a href="${safeHref(rel?.url)}">${escapeHtml(rel?.tag ?? '')}</a>`;
}
