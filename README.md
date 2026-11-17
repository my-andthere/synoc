# synoc

Static dashboard — **live online** via GitHub Pages.

## URL

Once deployed: **https://my-andthere.github.io/synoc/**

## What it is

- `index.html` — single-page dashboard shell
- `styles.css` — dark glassmorphism UI, responsive, respects `prefers-reduced-motion`
- `app.js` — zero-dependency fetch layer against the public GitHub API, with a
  `localStorage` snapshot fallback so the page still renders when the API is
  rate-limited or the network is down
- `.github/workflows/deploy.yml` — auto-deploy to GitHub Pages on every push to `main`

No build step. No backend. No dependencies.

## Local preview

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Deploy

Push to `main` — the workflow handles the rest. To trigger manually:

```bash
gh workflow run deploy.yml
```

## Activate Pages (one time)

```bash
gh api -X POST repos/my-andthere/synoc/pages \
  -f 'source[branch]=main' -f 'source[path]=/' \
  -H "Accept: application/vnd.github+json"
```

> If the branch-based source is rejected, switch Pages to **GitHub Actions** in
> Settings → Pages; the included workflow deploys the same content.