# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow SemVer.

## [1.2.0] - Unreleased (milestone 2)

### Added
- `SqliteEventStore`: persistent history on SQLite through the built-in `node:sqlite` (no native
  build step). It extends `EventStore`, reloads recent rows on restart, keeps incremental hourly
  aggregates, and prunes on a retention window (`storage.sqlite.retentionDays`, default 30). It is
  configured in the new `storage.sqlite` config block, with `TRONOSTR_DB_PATH`,
  `TRONOSTR_RETENTION_DAYS` and `TRONOSTR_HISTORY` overrides.
- New API endpoints: `/api/v1/history` (filters and cursor pagination), `/api/v1/history/stats`,
  `/api/v1/trends?hours=` (zero-filled hourly buckets), and `/api/v1/labels`.
- The Tron Report live dashboard at `/`: static HTML, CSS and JS with inline SVG charts, no
  third-party scripts, a strict CSP, and an explicit non-affiliation notice. It can be turned off
  with `api.dashboard: false`.
- `BlockMetricsDetector` per-block activity counts over all successful transactions:
  `trxTransfers`, `usdtTransfers`, `delegations`, `undelegations`, `energyDelegations`, `failedTx`.
- 13 bundled exchange and issuer labels taken from Tronscan public tags, with the source cited in
  code and committed evidence (`src/labels/publicLabels.ts`, `docs/LABELS.md`). They are enabled
  with `exchangeFlow.usePublicLabels`.
- Dedicated Nostr publisher key: `TRONOSTR_PUBLISHER_KEY` (hex or nsec) or
  `TRONOSTR_PUBLISHER_KEY_FILE`. The key is validated, never logged, and only the npub is printed.
- `Dockerfile`, `.dockerignore`, `docs/DEPLOY.md` (hosting comparison and runbook), and
  `docs/LABELS.md`.
- `PORT` is honored for the API port, matching PaaS conventions.
- `TRONOSTR_CHECKPOINT_PATH` turns on resume-after-restart without editing config. The Docker image
  sets it to `/data/checkpoints.json`.
- `npm run report:history -- --url <api>`: a read-only, numbers-only snapshot of a running instance,
  written to `samples/`.
- 12 new tests (67 total).

### Changed
- `engines.node` is now `>= 22.13`, because `node:sqlite` is unflagged there.
- `config.yaml` enables `exchangeFlow` with the bundled public labels by default.
- `NOSTR_PRIVATE_KEY` is deprecated in favour of `TRONOSTR_PUBLISHER_KEY` and still works.
- On shutdown the API now closes before the runtime and store.
- Watcher reuses the full head block returned by `getCurrentBlock` instead of downloading it again,
  which roughly halves steady-state TronGrid calls. It also paces catch-up `getBlock` calls with
  `minRequestIntervalMs` (default 400 ms without an API key, 0 with one). Both changes came from a
  live run where keyless TronGrid returned HTTP 429 three times in about 7.5 minutes.
- Runtime errors are logged as one line (message, HTTP status, server detail) instead of the full
  HTTP client object.

## [1.1.0] - Unreleased

### Added
- `ResourceDelegationDetector`: Stake 2.0 energy/bandwidth delegations and undelegations above a
  staked-TRX threshold (kind 6503, `resource_delegation`).
- `ExchangeFlowDetector`: inflow, outflow and internal classification for TRX/USDT transfers that
  touch a user-supplied, source-cited address book (kind 6504, `exchange_flow`). No labels are
  bundled.
- `EventStore` (in-memory ring buffer with query and rolled-up summary) and `ApiServer`, a
  read-only JSON API (`/health`, `/api/v1/status`, `/api/v1/events`, `/api/v1/summary`,
  `/api/v1/schema`) for dashboards.
- `JsonlFileOutput` for archiving events.
- `npm run sample`: a live, read-only mainnet capture that writes timestamped JSONL and a summary to
  `samples/`.
- Client helpers `onResourceDelegation()` and `onExchangeFlow()`.
- `tronostr` CLI bin, `LICENSE` (MIT), this changelog, `docs/API.md`.
- Block context (height, hash, timestamp) on transfer and delegation events.
- 16 new tests (55 total).

### Changed
- Nostr publishing is now optional. Without `NOSTR_PRIVATE_KEY` the runtime starts in local mode
  (API/JSONL/webhook) instead of exiting.
- Config is loaded from `TRONOSTR_CONFIG`, then `./config.yaml`, then the packaged default.
- package.json: npm metadata (repository, homepage, bugs, author, engines `node >= 22`), typed
  `exports`, `files`, and `clean`, `prepublishOnly` and `pack:check` scripts.
- Dependencies were bumped through `npm audit fix`: tronweb 6.5.2, ws 8.22.2, yaml 2.9.1. This
  cleared 7 audit advisories (4 high, 3 moderate) in axios, form-data, ws, follow-redirects and
  yaml.
- README rewritten to match actual behavior, including a limitations section.

### Fixed
- USDT transfers from **failed** transactions (`REVERT`, `OUT_OF_ENERGY`) were reported as real
  transfers. They are now skipped.
- USDT amount decoding read all calldata after the address (`substring(72)`) and used
  `parseInt`. It now reads exactly one 32-byte word with BigInt.
- USDT `transferFrom` calls were ignored. They are now decoded, using the token holder as `from`.

## [1.0.0] - 2026-03-24 (repository baseline, never published to npm)

- Watcher with backoff, jitter and checkpoints; WhaleTransferDetector (TRX/USDT);
  BlockMetricsDetector; Nostr Publisher with rate limiting and reconnects; TRONostrClient SDK;
  webhook output; status tracker; deterministic smoke and showcase demos.
