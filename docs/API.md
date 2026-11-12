# TRONostr JSON API (v1)

Read-only HTTP API served by `npm start` (default `http://127.0.0.1:8788`). Every JSON response
carries `access-control-allow-origin` from `api.corsOrigin` (default `*`). Non-GET methods get a 405
response. Bad numeric parameters get a 400 response. History routes return 501 when
`storage.sqlite.enabled` is false.

## `GET /health`
```json
{ "ok": true, "uptimeSeconds": 10, "storedEvents": 9, "history": true }
```

## `GET /api/v1/events`
Query params (all optional):

| param | meaning |
| --- | --- |
| `type` | `block_metrics`, `trx_transfer`, `usdt_transfer`, `resource_delegation`, or `exchange_flow` |
| `asset` | `TRX` or `USDT` (case-insensitive) |
| `minSeverity` | `info`, `low`, `medium`, `high`, or `critical` |
| `since` | seconds before the newest stored event |
| `limit` | 1–1000, default 50 |

```json
{ "schema": "tronostr.v1", "count": 1, "events": [
  { "kind": 6502, "created_at": 1794511770, "tags": [["t","tron"], ...],
    "event": { "schema": "tronostr.v1", "chain": "tron", "category": "transfer",
      "eventType": "usdt_transfer", "asset": "USDT", "severity": "medium",
      "source": { "detector": "WhaleTransferDetector" },
      "block": { "height": 87945972, "hash": "...", "timestamp": 1794511770000 },
      "transaction": { "hash": "..." },
      "data": { "from": "T...", "to": "T...", "amount": 82597, "method": "transfer" } } } ] }
```

## `GET /api/v1/summary?since=&top=`
Rolls up the stored window:
- `blocks`: count, first and last height, total transactions, average transactions per block
- `countsByType`
- `transferVolume[asset]`: count, total, largest (whale-threshold transfers only)
- `topSenders` / `topReceivers`: by summed amount, per asset
- `resourceDelegation[ENERGY|BANDWIDTH]`: delegatedTrx, undelegatedTrx, count
- `exchangeFlows["<entity>:<asset>"]`: entity (full label; labels can contain colons), asset, inflow, outflow, net, count

## `GET /api/v1/status`
The runtime status snapshot: latest block seen, event counts, alerts, and publisher queue and
delivery stats.

## `GET /api/v1/schema`
`{ "schema": "tronostr.v1", "kinds": { "block_metrics": 6500, ..., "exchange_flow": 6504 } }`

## `GET /api/v1/history`
Stored events from SQLite (default retention 30 days), newest first. By default, per-block
`block_metrics` events are not stored as rows; they only feed `/trends`.

| param | meaning |
| --- | --- |
| `type`, `asset`, `minSeverity` | same as `/events` |
| `from`, `to` | unix seconds, inclusive (event time = transaction timestamp) |
| `before` | pagination cursor: pass the previous response's `nextBefore` |
| `limit` | 1–1000, default 100 |

```json
{ "schema": "tronostr.v1", "count": 100, "nextBefore": 4211,
  "events": [ { "id": 4310, "kind": 6502, "created_at": 1794513000, "tags": [...], "event": { ... } } ] }
```

## `GET /api/v1/history/stats`
```json
{ "schema": "tronostr.v1", "history": { "path": "tronostr.db", "retentionDays": 30,
  "storeBlockMetrics": false, "eventRows": 812, "hourlyRows": 3,
  "oldestEventAt": 1794512460, "newestEventAt": 1794513120,
  "countsByType": { "usdt_transfer": 40, "resource_delegation": 2 },
  "lastPrune": { "at": 1794512460, "eventsDeleted": 0, "hoursDeleted": 0 } } }
```

## `GET /api/v1/trends?hours=24`
Zero-filled hourly buckets (UTC) ending at the current hour. `hours` is clamped to 1 to
`retentionDays * 24`.

| field | meaning |
| --- | --- |
| `blocks`, `txCount` | blocks processed and transactions in them |
| `trxTransfers`, `usdtTransfers` | **all** successful native TRX transfers and USDT-TRC20 transfer/transferFrom calls |
| `delegations`, `undelegations`, `energyDelegations` | **all** successful Stake 2.0 (un)delegations (the energy rental market) |
| `whaleUsdtCount`, `whaleUsdtVolume`, `whaleTrxCount`, `whaleTrxVolume` | transfers above the whale thresholds |
| `whaleDelegationCount`, `whaleDelegatedTrx`, `whaleUndelegationCount`, `whaleUndelegatedTrx` | (un)delegations above the delegation threshold |
| `exchangeFlowCount`, `exchangeInflowUsdt`, `exchangeOutflowUsdt` | flows touching labeled wallets |

Hours before the instance started, or while it was offline, read as zero. Check
`/history/stats` and `/status` before reading a zero as "no activity".

## `GET /api/v1/labels`
The bundled public address labels (`address`, `label`, `category`, `source`, `explorerUrl`) and
whether this instance uses them (`publicLabelsEnabled`). See `docs/LABELS.md`.

## `GET /` (dashboard)
Static HTML at `/` (also `/dashboard`) plus `/assets/dashboard.js` and `/assets/dashboard.css`.
They are served with a strict Content-Security-Policy (`default-src 'self'`) and polled every 15 s.
