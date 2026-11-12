# TRONostr

![TRONostr banner](./TRONostr%20banner%20image.png)

TRONostr is open, realtime TRON event infrastructure. It watches TRON mainnet blocks, turns raw
transactions into structured, machine-readable events (whale TRX moves, USDT-TRC20 transfers,
Stake 2.0 energy/bandwidth delegations, flows to labeled wallets, block telemetry), and delivers
them over:

- **Nostr relays** (signed events, kinds 6500–6504), the default public transport
- a **local read-only JSON API** that a dashboard can poll
- **JSONL files** for archiving and replay
- **webhooks** for existing pipelines

It is the data engine planned for **The Tron Report**, a TRON analytics and research platform.

> Status: pre-release (v1.1.0, not yet published to npm). Everything below runs today on a laptop
> against public TronGrid with no API key. See `samples/` for real captured mainnet output.

## Quickstart

Requires Node.js 22 or newer.

```bash
npm install
npm test              # deterministic unit tests, no network
npm run showcase      # deterministic local demo, no network
npm run sample -- --seconds 60   # live, read-only mainnet capture -> ./samples/
```

Run the live runtime in **local mode** (no keys needed, nothing is signed or published):

```bash
npm start
curl http://127.0.0.1:8788/api/v1/summary
```

Set `NOSTR_PRIVATE_KEY` in `.env` to also publish signed events to the relays in `config.yaml`.
Use a key created only for the publisher, never a wallet key or seed phrase.

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
- **ExchangeFlowDetector**: classifies TRX/USDT transfers touching a **user-supplied address book**
  as `inflow`, `outflow` or `internal`. TRONostr ships no built-in exchange labels on purpose. Add
  only addresses whose attribution you can cite. The `source` you provide is carried in each event.
- **BlockMetricsDetector**: height, hash, transaction count and witness for each block.

Thresholds and toggles live in `config.yaml`.

## JSON API (for dashboards)

Enabled by default on `127.0.0.1:8788`. It is read-only, has no dependencies beyond `node:http`,
and sends CORS headers. It serves from an in-memory ring buffer (`api.storeCapacity`, default 5000
events).

| endpoint | what it returns |
| --- | --- |
| `GET /health` | uptime and the number of stored events |
| `GET /api/v1/status` | runtime status: latest block, event counts, publisher stats |
| `GET /api/v1/events?type=&asset=&minSeverity=&since=&limit=` | recent events, newest first |
| `GET /api/v1/summary?since=&top=` | block stats, transfer volume per asset, top senders/receivers, delegation totals, exchange net flows |
| `GET /api/v1/schema` | the kind number for each event type |

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

## Architecture

```text
TronGrid (public) -> Watcher -> Detectors -> validated tronostr.v1 events
                                                |-> EventStore -> JSON API -> dashboards (The Tron Report)
                                                |-> Nostr Publisher -> relays -> bots / agents
                                                |-> JSONL file / webhook
```

The Watcher polls with bounded backoff and jitter, can resume from a file checkpoint, and attaches
block context to each transaction. Relay connections reconnect with backoff, and the publisher is
rate limited per relay and queue-bounded.

## Commands

| command | network? | purpose |
| --- | --- | --- |
| `npm test` | no | 55 unit tests (custom runner) |
| `npm run typecheck` | no | `tsc --noEmit` |
| `npm run smoke` / `showcase` / `demo:status` | no | deterministic demos with an in-memory relay |
| `npm run sample -- --seconds N [--usdt X --trx Y --delegation Z]` | TronGrid (read) | live capture to `samples/` |
| `npm start` | TronGrid (+ relays if a key is set) | live runtime and API |
| `npm run verify:tron` / `verify:relays` | yes | live connectivity checks |
| `npm run pack:check` | no | build and list the npm tarball contents |

## Limitations (honest)

- Uses polling (about every 3 s), not a mempool or event stream. Missed blocks are caught up
  sequentially.
- Only USDT is decoded among TRC-20 tokens. There are no DEX, lending or SunPump events yet.
- `ExchangeFlowDetector` is inert until you add labeled addresses.
- The API keeps events in memory only. Use the JSONL output or a database for history.
- Public TronGrid without a key is rate limited, so heavy use needs a `TRON_PRO_API_KEY`.

## License

MIT, see `LICENSE`.
