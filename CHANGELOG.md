# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow SemVer.

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
