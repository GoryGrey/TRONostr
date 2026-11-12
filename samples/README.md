# Live mainnet samples

Real output captured by `npm run sample` against TRON mainnet via public TronGrid
(`https://api.trongrid.io`), with no API key, read-only, and no Nostr publishing. Nothing here is
synthetic. Each `*-summary.json` records UTC and Eastern start/end times, the thresholds used, and
the JSON API responses captured over HTTP at the end of the run.

| file prefix | window (ET, Nov 12, 2026) | thresholds | blocks | events |
| --- | --- | --- | --- | --- |
| `2026-11-12T19-32-43-953Z-*` | 2:32:43–2:37:43 PM (300 s) | USDT ≥ 10,000 · TRX ≥ 100,000 · delegation ≥ 100,000 staked TRX | 99 (87946037–87946135, contiguous) | 1,021 |
| `defaults/2026-11-12T19-32-45-841Z-*` | 2:32:45–2:35:48 PM (180 s) | shipped defaults: USDT ≥ 100,000 · TRX ≥ 1,000,000 · delegation ≥ 1,000,000 | 59 (87946037–87946095) | 166 |

300-second run, from its summary:

- 34,749 transactions across 99 blocks, an average of 351 per block. Polling errors: 0.
- 454 USDT transfers of 10,000 USDT or more, totaling 32,853,101.39 USDT. The largest was
  1,400,000 USDT. 2 of them were `transferFrom` calls.
- 468 resource (un)delegations of 100,000 staked TRX or more. ENERGY: 442 events, 132.64M TRX
  delegated and 130.84M undelegated. BANDWIDTH: 26 events, 8.67M delegated and 8.67M undelegated.
- 148 owner→receiver pairs both delegated and undelegated the identical amount inside the window.
  These short delegate/reclaim cycles look like energy-rental activity. That is an inference, not a
  label.
- 0 native TRX transfers of 100,000 TRX or more occurred in this window.
- Exchange-flow detection was disabled because no source-cited labels are configured.

`2026-11-12T19-32-43-953Z-spot-verification.txt` re-checks 8 randomly picked events against
TronGrid's independent endpoints (`/v1/transactions/{id}/events` and `/wallet/gettransactionbyid`).
All 8 matched.

Addresses that appear here are public on-chain data. No entity attribution is implied.
