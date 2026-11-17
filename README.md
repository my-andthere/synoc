# synoc

Static dashboard — **live online**, publicly reachable over HTTPS.

## Applications

| App | URL | Stack |
|---|---|---|
| **SYNOC Dashboard** | https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/ | Static, zero-dep |
| **SYNOC NOC Helpdesk** | https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/helpdesk/ | Express + MySQL 8 |

Both are served by one public gateway on port `8000` (see
[`noc-helpdesk/`](noc-helpdesk/README.md)).

## URL

**Live now (public, HTTPS):**

**https://sturdy-carnival-r764v6wqgrf57qr-8000.app.github.dev/**

Served straight from this Codespace through GitHub's public port forwarding.
Works from any device, no install needed. The first visit in a new browser shows
a one-time GitHub "dev port" notice — click *Continue*.

GitHub Pages URL (available after the one-time step in Target A):

https://my-andthere.github.io/synoc/

## NOC Helpdesk (MySQL)

Ticket management for the NOC with **SLA** monitoring and **master data**.

```bash
cd noc-helpdesk
./start.sh demo      # MySQL + gateway + 24 demo tickets
```

- Helpdesk: `/helpdesk/` — login `admin` / `admin123`
- Full docs: [`noc-helpdesk/README.md`](noc-helpdesk/README.md)

## What it is

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

The workflow sets `enablement: true`, so `actions/configure-pages` creates the
Pages site on the first run — **but only if the token may create it**.

The token in this Codespace (`ghu_…`, a GitHub App user token) may not:
`POST /repos/{owner}/{repo}/pages` returns `403 Resource not accessible by
integration`, both from the CLI and from inside the workflow. Hence one manual
step, once:

1. Open **Settings → Pages**
2. Under *Build and deployment → Source*, choose **GitHub Actions**
3. Re-run the workflow (push any commit, or *Actions → Deploy to GitHub Pages → Run workflow*)

Live URL: `https://my-andthere.github.io/synoc/`

> Until that step is done, the Codespaces-forwarded URL at the top of this file
> is the public one.

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