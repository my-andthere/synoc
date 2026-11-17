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

Push to `main`. Two workflows are included:

| File | Target | Requires |
|---|---|---|
| `.github/workflows/deploy.yml` | GitHub Pages | Pages enabled on the repo (one-time) |
| `.github/workflows/netlify.yml` | Netlify | `NETLIFY_AUTH_TOKEN` + `NETLIFY_SITE_ID` secrets |

### Target A — GitHub Pages

Pages must be enabled once in the UI. The API token used by this workspace has
`repo` + `workflow` only, so it cannot create the Pages site:

1. Open **Settings → Pages**
2. Under *Build and deployment → Source*, choose **GitHub Actions**
3. Re-run the workflow (push any commit, or *Actions → Deploy to GitHub Pages → Run workflow*)

Live URL: `https://my-andthere.github.io/synoc/`

### Target B — Netlify (no UI step)

```bash
# create the site once, get the site ID
npx netlify-cli sites:create --name synoc

gh secret set NETLIFY_AUTH_TOKEN   # paste a personal access token from app.netlify.com
gh secret set NETLIFY_SITE_ID      # paste the site ID printed above
```

Then push. Live URL: `https://synoc.netlify.app/` (or the generated subdomain).

### Target C — any static host

The site is three files (`index.html`, `styles.css`, `app.js`). Drop them on
Cloudflare Pages, Vercel, Render, S3, or any web server. No build step.