# Security Policy

NadoLens is a read-only analytics dashboard for the Nado protocol (Ink L2). It never holds custody of funds and never signs transactions server-side — all wallet interactions (connect, EIP-712 signing) happen client-side via wagmi/viem/RainbowKit, directly in the user's browser.

## Scope

In scope:
- The Next.js app (`app/`, `components/`, `lib/`, `hooks/`)
- The two Fly.io microservices (`services/nado-matches`, `services/nado-funding`) and the WS proxy
- API routes under `app/api/*`

Out of scope:
- The Nado protocol itself (smart contracts, Gateway/Archive APIs) — report to [Nado](https://docs.nado.xyz) directly
- Third-party dependencies — report upstream, or open an issue here if it affects NadoLens specifically

## Reporting a vulnerability

Please report security issues privately rather than opening a public GitHub issue.

- **Preferred**: [GitHub Security Advisories](https://github.com/Stachelabs/nadoLens/security/advisories/new) (private, only visible to maintainers until resolved)
- **Alternative**: DM [@stache_dev](https://x.com/stache_dev) on X

Include what you found, how to reproduce it, and the potential impact. We'll acknowledge reports as soon as possible and keep you updated as it's investigated.

## What's intentionally public

A few things that look sensitive but aren't secrets:
- **Nado Archive/Gateway endpoints** (`archive.prod.nado.xyz`, `gateway.prod.nado.xyz`) — public hostnames, confirmed usable without authentication by the Nado team.
- **CI secret usage**: `.github/workflows/fly-deploy.yml` only reads `FLY_API_TOKEN` on `push` to `main`. GitHub does not grant repository secrets to `pull_request` runs triggered from forks, and this repo does not use `pull_request_target`, so a fork's workflow run never has access to it. `main` itself is protected (required PR review, no force-push), so the deploy workflow only ever runs against reviewed code.
- **No server-side secrets touch the browser** — `NEXT_PUBLIC_*` env vars are the only ones exposed client-side; everything else (`SERVICE_SECRET`, Redis credentials, Archive/Gateway base URLs) stays server-only.

## Never in this repo

- Private keys, seed phrases, or signed transactions
- `.env*` files (gitignored; see `.env.example` for the variable list)
- Real user wallet data beyond what's already public on-chain
