# SailsSite

Dynamic personal website and writing studio for [sails.oxygenai.top](https://sails.oxygenai.top).

The private writing room is deployed at
[sails-gg.oxygenai.top](https://sails-gg.oxygenai.top). Credentials are not
stored in this repository.

## Features

- Markdown articles with drafts, publishing, revisions, duplicate and
  conflict-safe saves
- Article collections with editable descriptions and visitor ordering
- Tag filtering and tag detail pages
- Site copy editing with server-injected first-paint text
- Image/video uploads with paste-ready URLs and HTTP Range playback
- Live X timeline and GitHub profile, repository, event and contribution
  heatmap views
- Desktop-quality and mobile-budgeted React Three Fiber scenes
- Separate public/admin hostnames, CSRF-protected sessions and versioned APIs

## Stack

- React, Vite, React Three Fiber
- Node.js HTTP API
- SQLite via `node:sqlite`
- Nginx and systemd on LAX

## Development

```bash
npm ci
npm run check
npm run lint
npm run test:server
npm run build
```

The public API requires `X-Sails-API-Version: 1`. Admin routes are served only
on the admin hostname.

## Verification

GitHub Actions runs type checking, ESLint, server API tests and a production
build on every push to `main`.

Deployment notes are in [`deploy/lax/README.zh.md`](deploy/lax/README.zh.md).
