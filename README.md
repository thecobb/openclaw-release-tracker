# OpenClaw Release Radar

A small Simon Willison-style utility for understanding OpenClaw releases: what changed, what looks security-sensitive, what seems broadly important, and what is likely relevant to Jacob's OpenClaw setup.

Live app: https://thecobb.github.io/openclaw-release-tracker/

## How it works

- `scripts/build-data.mjs` fetches all releases from `openclaw/openclaw` using the GitHub API.
- The app loads `data/releases.json` locally, so first load does not depend on browser-side GitHub API calls.
- By default the UI shows the latest three months of releases; click **Load all releases** to expand the complete indexed history.
- A scheduled GitHub Action refreshes release data daily.

## Local development

```bash
npm run build:data
npm test
python -m http.server 8000
```
