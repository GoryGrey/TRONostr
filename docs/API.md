# TRONostr JSON API (v1)

Read-only HTTP API served by `npm start` (default `http://127.0.0.1:8788`). Every response is JSON
with `access-control-allow-origin` set from `api.corsOrigin` (default `*`). Non-GET methods get a 405
response.

## `GET /health`
```json
{ "ok": true, "uptimeSeconds": 10, "storedEvents": 9 }
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
- `exchangeFlows["<entity>:<asset>"]`: inflow, outflow, net, count

## `GET /api/v1/status`
The runtime status snapshot: latest block seen, event counts, alerts, and publisher queue and
delivery stats.

## `GET /api/v1/schema`
`{ "schema": "tronostr.v1", "kinds": { "block_metrics": 6500, ..., "exchange_flow": 6504 } }`
