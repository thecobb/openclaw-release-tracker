# OpenClaw Release Radar

A small Simon Willison-style utility for understanding OpenClaw releases: what changed, what looks security-sensitive, what seems broadly important, and what is likely relevant to Jacob's OpenClaw setup.

Live app: https://thecobb.github.io/openclaw-release-tracker/

## How it works

- `scripts/build-data.mjs` fetches all releases from `openclaw/openclaw` using the GitHub API.
- The app loads `data/releases.json` locally, so first load does not depend on browser-side GitHub API calls.
- By default the UI shows the latest three months of releases; click **Load all releases** to expand the complete indexed history.
- A scheduled GitHub Action refreshes release data daily.

## Public release follow-up

When a release needs public coordination, pair the radar with [TweetClaw](https://github.com/Xquik-dev/tweetclaw) after human review. Use it to search tweets and replies about the tag, monitor X/Twitter reactions, post an approved update, and track follow-up replies without adding write credentials to this static app.

Install the OpenClaw plugin from npm:

```bash
openclaw plugins install @xquik/tweetclaw
```

The [ClawHub discovery page](https://clawhub.ai/plugins/@xquik/tweetclaw) is useful for browsing the plugin, while npm is the canonical install source.

## Local development

```bash
npm run build:data
npm test
python -m http.server 8000
```
