# TRONostr

![TRONostr banner](./TRONostr%20banner%20image.png)

TRONostr is open, realtime TRON event infrastructure. It watches TRON mainnet blocks, turns raw
transactions into structured, machine-readable events (whale TRX moves, USDT-TRC20 transfers,
Stake 2.0 energy/bandwidth delegations, flows to labeled wallets, block telemetry), and delivers
them over:

- **Nostr relays** (signed events, kinds 6500–6504), the default public transport
- a **read-only JSON API** with 7–30 days of **SQLite history** and hourly trend series
- a built-in, static **live dashboard** served at `/`
- **JSONL files** for archiving and replay
- **webhooks** for existing pipelines

TRONostr is a neutral, open engine that anyone can run. **The Tron Report**, a separate TRON analytics
and research platform that is still being planned, will be powered by TRONostr as its first consumer.

> Status: pre-release (v1.2.0, not yet published to npm, not yet deployed anywhere). Everything
> below runs today on a laptop against public TronGrid with no API key. See `samples/` for real
> captured mainnet output.

## Quickstart

Requires Node.js 22.13 or newer (history storage uses the built-in `node:sqlite`; on Node 22 it
prints an ExperimentalWarning, which is harmless).

```bash
npm install
npm test              # deterministic unit tests, no network
npm run showcase      # deterministic local demo, no network
npm run sample -- --seconds 60   # live, read-only mainnet capture -> ./samples/
```

Run the live runtime in **local mode** (no keys needed, nothing is signed or published):

```bash
npm start
open http://127.0.0.1:8788/            # live dashboard
curl http://127.0.0.1:8788/api/v1/summary
curl 'http://127.0.0.1:8788/api/v1/trends?hours=24'
```

History is written to `./storage/tronostr.db` and pruned after `storage.sqlite.retentionDays`
(default 30).

### Nostr publishing (optional)

Set `TRONOSTR_PUBLISHER_KEY` (64-char hex or `nsec1…`) in `.env` or your host's secret store to
also publish signed events to the relays in `config.yaml`. `TRONOSTR_PUBLISHER_KEY_FILE` reads it
from a file (Docker/Fly/Render secret files). The legacy `NOSTR_PRIVATE_KEY` still works but is
deprecated.

- Create a key used **only** for this publisher. Never use a wallet key, a seed phrase, or your
  personal Nostr identity.
- The key is never read from `config.yaml`, never committed (`.env` is git-ignored), and never
  logged. On startup only the derived `npub` is printed, so you can share it as the feed's
  identity.
- Without a key the runtime stays in local mode and signs nothing.

## Events

All events share the `tronostr.v1` schema:

| kind | eventType | category | asset | detector |
| --- | --- | --- | --- | --- |
| 6500 | `block_metrics` | telemetry | | BlockMetricsDetector |
| 6501 | `trx_transfer` | transfer | TRX | WhaleTransferDetector |
| 6502 | `usdt_transfer` | transfer | USDT | WhaleTransferDetector |
| 6503 | `resource_delegation` | resource | TRX (staked) | ResourceDelegationDetector |
| 6504 | `exchange_flow` | flow | TRX / USDT | ExchangeFlowDetector |

Common fields: `schema`, `chain`, `category`, `eventType`, `asset`, `severity`, `source.detector`,
`block` (height, hash, timestamp), `transaction.hash`, `data`. Events are validated before they
are published and again when a client consumes them.

### Detectors

- **WhaleTransferDetector**: native TRX transfers and USDT-TRC20 `transfer` / `transferFrom`
  calls above configurable thresholds. Transactions that failed on-chain (`REVERT`,
  `OUT_OF_ENERGY`, …) are skipped. Amounts are decoded with BigInt.
- **ResourceDelegationDetector**: Stake 2.0 `DelegateResourceContract` / `UnDelegateResourceContract`
  above a staked-TRX threshold, which is how the TRON energy-rental market moves resources. `data`
  includes `action`, `resource` (ENERGY/BANDWIDTH), `owner`, `receiver`, `stakedTrx`, and `lock`
  and `lockPeriodBlocks` for delegations.
- **ExchangeFlowDetector**: classifies TRX/USDT transfers touching a labeled address book as
  `inflow`, `outflow` or `internal`. With `usePublicLabels: true` it uses 13 bundled addresses whose
  labels are **Tronscan public tags**, each with its source cited in code and in every event
  (`data.labelSource`). See [`docs/LABELS.md`](docs/LABELS.md) for the evidence and caveats. Add
  your own entries only if you can cite the attribution.
- **BlockMetricsDetector**: height, hash, transaction count and witness for each block, plus
  per-block activity counts over **all** successful transactions (`trxTransfers`, `usdtTransfers`,
  `delegations`, `undelegations`, `energyDelegations`, `failedTx`). These feed the hourly trends.

Thresholds and toggles live in `config.yaml`.

## JSON API and dashboard

Enabled by default on `127.0.0.1:8788`. It is read-only, has no dependencies beyond `node:http`,
and sends CORS headers. `/events` and `/summary` serve from an in-memory ring buffer
(`api.storeCapacity`, default 5000 events), reloaded from SQLite on restart. `/history` and
`/trends` read the SQLite store.

| endpoint | what it returns |
| --- | --- |
| `GET /health` | uptime and the number of stored events |
| `GET /api/v1/status` | runtime status: latest block, event counts, publisher stats |
| `GET /api/v1/events?type=&asset=&minSeverity=&since=&limit=` | recent events, newest first |
| `GET /api/v1/summary?since=&top=` | block stats, transfer volume per asset, top senders/receivers, delegation totals, exchange net flows |
| `GET /api/v1/schema` | the kind number for each event type |
| `GET /api/v1/history?type=&asset=&minSeverity=&from=&to=&before=&limit=` | stored events from SQLite, newest first, cursor-paginated |
| `GET /api/v1/history/stats` | retention window, row counts, oldest/newest stored event, last prune |
| `GET /api/v1/trends?hours=24` | zero-filled hourly buckets: whale USDT/TRX volume, delegation counts, tx counts, exchange flows |
| `GET /api/v1/labels` | the bundled public address labels and their sources |
| `GET /` | live dashboard (static HTML/JS, no third-party scripts) |

`since` is seconds before the newest stored event. See `docs/API.md` for response shapes.

## SDK

```ts
import { TRONostrClient } from 'tronostr';

const client = new TRONostrClient({ relays: ['wss://nos.lol', 'wss://relay.damus.io'] });
await client.connect();

client.onUSDTTransfer((e) => console.log(e.parsedContent.data.amount));
client.onResourceDelegation((e) => console.log(e.parsedContent.data.action, e.parsedContent.data.stakedTrx));
client.onExchangeFlow((e) => console.log(e.parsedContent.data.direction, e.parsedContent.data.entity));
client.onAlerts((e) => console.log(e.parsedContent.severity, e.parsedContent.eventType));
```

The package also exports `Watcher`, `TRONostrRuntime`, the detectors, `Publisher`, `EventStore`,
`ApiServer`, `JsonlFileOutput`, `WebhookOutput`, `prepareTRONostrEvent()` and the schema
validators. Subpaths: `tronostr/client`, `tronostr/schema`, `tronostr/runtime`, `tronostr/status`,
`tronostr/output`, `tronostr/api`, `tronostr/store`. After install, a `tronostr` CLI runs the
runtime.

### Dashboard

`/` serves a single static page: summary cards for the last hour, 24-hour bar charts (whale USDT
volume, all energy/bandwidth delegations, network transactions), the latest whale transfers and
large delegations with Tronscan links, and labeled exchange flows. It uses only this instance's
API, inline SVG, and a strict Content-Security-Policy. It states that the project is independent
and not affiliated with TRON DAO, the TRON Foundation, Tether or any exchange. Turn it off with
`api.dashboard: false`.

## Deploying

See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the Dockerfile, environment variables, and a comparison of
free and low-cost hosts (researched November 2026).

## Architecture

```text
TronGrid (public) -> Watcher -> Detectors -> validated tronostr.v1 events
                                                |-> SqliteEventStore (ring buffer + SQLite history)
                                                |      -> JSON API + dashboard -> downstream apps (e.g. The Tron Report)
                                                |-> Nostr Publisher -> relays -> bots / agents
                                                |-> JSONL file / webhook
```

The Watcher polls with bounded backoff and jitter, can resume from a file checkpoint, and attaches
block context to each transaction. Relay connections reconnect with backoff, and the publisher is
rate limited per relay and queue-bounded.

## Commands

| command | network? | purpose |
| --- | --- | --- |
| `npm test` | no | 69 unit tests (custom runner) |
| `npm run report:history -- --url http://127.0.0.1:8788` | local API (read) | numbers-only snapshot of a running instance -> `samples/` |
| `npm run typecheck` | no | `tsc --noEmit` |
| `npm run smoke` / `showcase` / `demo:status` | no | deterministic demos with an in-memory relay |
| `npm run sample -- --seconds N [--usdt X --trx Y --delegation Z]` | TronGrid (read) | live capture to `samples/` |
| `npm start` | TronGrid (+ relays if a key is set) | live runtime and API |
| `npm run verify:tron` / `verify:relays` | yes | live connectivity checks |
| `npm run pack:check` | no | build and list the npm tarball contents |

## Limitations (honest)

- Uses polling (about every 3 s), not a mempool or event stream. Missed blocks are caught up
  sequentially, and across restarts only when a checkpoint path is set (`TRONOSTR_CHECKPOINT_PATH`,
  set by default in the Docker image).
- Only USDT is decoded among TRC-20 tokens. There are no DEX, lending or SunPump events yet.
- Exchange labels cover only 13 Tronscan-tagged wallets. Exchanges run many more, so the flow
  numbers are a lower bound, not exchange totals.
- History covers only the time this instance was running. Hours when it was offline read as zero.
- Whale and delegation event rows are threshold-based. The all-transaction activity counts in
  `/trends` are aggregated per hour, not stored per transaction.
- SQLite is single-node. That is fine for one always-on instance, but it is not a clustered
  database.
- Public TronGrid without a key is rate limited, so heavy use needs a `TRON_PRO_API_KEY`.

## License

MIT, see `LICENSE`.
