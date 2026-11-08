# SailsSite

Dynamic personal website and writing studio for [sails.oxygenai.top](https://sails.oxygenai.top).

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

Deployment notes are in [`deploy/lax/README.zh.md`](deploy/lax/README.zh.md).
