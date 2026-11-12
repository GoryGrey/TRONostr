# DRAFT: TRON Builders League application outline (not submitted)

> Internal draft for GoryGrey to review. Nothing has been posted to the TRON DAO forum. Fill in
> or confirm every item marked **[YOU]** before submitting. Every number below comes from code in
> this repo or the real captures in `samples/`. No users, revenue, or partnerships are claimed
> because there are none yet.

Applying requires a TRON DAO Forum account and access to the TBL group
(https://forum.trondao.org/g/TBL). The application is then posted as a thread in the TBL category
using the forum's "Basic Information" template, which this outline follows.

---

## Basic Information

- **Project name:** TRONostr, the open data engine behind The Tron Report
- **Track:** Infrastructure & Security. Secondary fit: AI & Automation ("agentic data
  analytics"); confirm which one TBL wants listed first. **[YOU]**
- **Team:** GoryGrey (solo builder, US-based). **[YOU: add a real name or handle, any
  collaborators, and relevant background]**
- **Socials and links:**
  - Code: https://github.com/GoryGrey/TRONostr (the public repo does not include the v1.1.0 work
    yet; push it first) **[YOU]**
  - Community: r/theTRONreport (https://www.reddit.com/r/theTRONreport/). GoryGrey has posted
    TRON daily reports and ecosystem deep dives there; posts found via search are dated Nov 2025
    through Jul 11, 2026.
  - Related community run by the same builder: r/SelfTeachingAI
    (https://www.reddit.com/r/SelfTeachingAI/)
  - Subscriber counts are not cited because Reddit blocked automated reads when this draft was
    written. **[YOU: add counts from the subreddit pages if you want them included]**
  - thetronreport.com: did not respond when checked on Nov 12, 2026, so leave it out until it is
    back up. **[YOU]**
  - npm: `tronostr` is not published yet (the name was unclaimed on Nov 12, 2026). **[YOU]**

## Project overview / goal

TRON settles a very large share of the world's USDT, but builders who want clean, realtime signals
from it (whale moves, stablecoin flows, energy-rental activity, exchange in/outflows) each end up
writing their own block parser. **TRONostr** is an open-source (MIT) TypeScript engine that watches
TRON mainnet and emits validated, machine-readable events (`tronostr.v1`). Consumers can read them
over Nostr relays, a local JSON API, JSONL files, or webhooks, without running a TRON indexer.

**The Tron Report** is the consumer product built on top of it: a US-based TRON analytics and
research platform. It is currently a subreddit with daily reports, with a dashboard planned
(whale/contract heatmap, stablecoin rail, energy market, governance feed). TRONostr supplies the
data, and The Tron Report turns it into public research. Anyone else (bots, wallets, compliance
tools, AI agents) can consume the same open feed.

What The Tron Report needs from the data layer, based on what its own posts cover and its promised
waitlist features:

| Tron Report section | TRONostr source today | status |
| --- | --- | --- |
| Stablecoin rail / USDT flow | `usdt_transfer` + `/api/v1/summary` volume and top senders/receivers | **working** |
| Whale heatmap | `trx_transfer`, `usdt_transfer` with severity tiers | **working** |
| Energy / resource market (TRON-native) | `resource_delegation` (Stake 2.0 ENERGY/BANDWIDTH) | **working, new in v1.1.0** |
| Exchange in/outflow | `exchange_flow` with 13 bundled Tronscan public-tag labels (source cited, evidence committed) | **working locally (v1.2.0); lower bound only** |
| Network telemetry | `block_metrics` (transactions per block, witness, per-block activity counts) | **working** |
| History + hourly trends | SQLite store, `/api/v1/history`, `/api/v1/trends` (30-day retention) | **working locally (v1.2.0)** |
| Live dashboard | static The Tron Report page served by the API at `/` | **working locally (v1.2.0); not hosted yet** |
| Compliance flagging, DEX/SunPump, governance feed | none yet | milestone 3+ |
| Price / market data | out of scope for TRONostr (third-party price feeds) | n/a |

## Demo

- Local, reproducible: `npm install && npm run sample -- --seconds 60` writes real mainnet events
  plus a JSON API snapshot to `samples/`. `npm start` serves `GET /api/v1/summary`.
- Real capture included in the repo (`samples/`, Nov 12, 2026, 2:32–2:37 PM ET, public TronGrid,
  no API key):
  - 99 contiguous blocks (87946037–87946135), 34,749 transactions, 0 polling errors
  - 454 USDT transfers of 10,000 USDT or more, totaling 32.85M USDT (largest 1.4M)
  - 468 Stake 2.0 resource (un)delegations of 100,000 staked TRX or more. 148 of them are
    same-amount delegate/reclaim round trips within 5 minutes, which looks like energy-rental
    behavior (an inference, not a label).
  - 8 of 8 randomly sampled events re-verified against TronGrid's independent endpoints
- **[YOU: record a 60–90 s screen capture of `npm run sample` and the API output; a hosted public
  demo is milestone 2]**

## Expected completion and current progress

- **Current progress:** about 65% toward a "public, hosted data feed + dashboard MVP". History
  storage, trend endpoints, the dashboard page, cited labels, a Dockerfile and deploy docs work
  locally (v1.2.0, 67 tests). It is **not yet hosted**, nothing has been published to Nostr under a
  dedicated key, and there is no npm release, demo video or users yet. **[YOU: adjust]**
- Engine status (v1.1.0, local): 5 event types, 4 detectors, 55 passing unit tests, read-only JSON
  API, npm-ready package (dry-run pack verified, not published), 0 `npm audit` advisories in
  production dependencies.
- **Expected completion:** milestone dates are below. **[YOU: confirm the dates you can commit to]**

## Technical details

- TypeScript on Node 22+, using tronweb (TronGrid HTTP) and nostr-tools.
- Watcher → Detectors → validated `tronostr.v1` envelope → outputs (Nostr kinds 6500–6504,
  EventStore/JSON API, JSONL, webhook).
- Polls blocks with bounded backoff, jitter and file checkpoints, and catches up on missed blocks
  sequentially.
- Correctness: failed transactions (REVERT, OUT_OF_ENERGY) are excluded. TRC-20 calldata is
  decoded with BigInt (`transfer` and `transferFrom`).
- Works with no paid keys. `TRON_PRO_API_KEY` is optional for higher rate limits.
- **No smart contracts and no token.** TRONostr is read-only infrastructure and never holds
  user funds.

## Risks and mitigations

| risk | mitigation |
| --- | --- |
| Public TronGrid rate limits | optional API key; option to run our own java-tron node later (milestone 3) |
| Wrong exchange/entity labels | no bundled labels; every label needs a citable source carried in each event |
| Solo maintainer | open MIT code, tests, typed SDK, and docs so others can run and extend it |
| Polling misses mempool-level signals | stated in README limitations; event-stream or node plugin is future work |
| Nostr relay reliability | multi-relay publishing with reconnect; JSON API/webhook as alternatives |

## Contract links

None. TRONostr deploys no contracts.

## Funding and milestones

TBL funding is discretionary and milestone-based. **[YOU: decide whether to request a specific
amount. Do not copy the program's headline pool figure as an ask. If you request a number, tie it
to concrete costs: hosting, an archive node or API plan, an audit of the label pipeline, and your
time.]**

| milestone | deliverables | evidence a reviewer can check |
| --- | --- | --- |
| **M1, engine v1.1.0 (done locally, Nov 12, 2026)** | new resource-delegation and exchange-flow detectors, failed-tx fix, `transferFrom`, JSON API, JSONL, optional Nostr, npm-ready package, 55 tests, real mainnet sample | repo tag + `samples/` + `npm test` |
| **M2, public feed (target: ~2–3 weeks after start)** | hosted always-on instance; public read-only API + status page; publishing to 2+ public Nostr relays under a dedicated key; npm release; persistent storage (SQLite/Postgres) for 7–30 days of history; first cited exchange labels | public URL, npm page, relay event IDs |
| **M3, The Tron Report dashboard MVP** | dashboard on the API (stablecoin rail, whale heatmap, energy-market panel, exchange flows); weekly research post generated from real data and published on r/theTRONreport | public site + linked posts |
| **M4, ecosystem integrations** | more TRC-20 tokens (USDD and others), SunSwap/SunPump events, governance/SR vote feed, an alert bot and agent example | release notes + an integration from someone else |

## Ecosystem impact

- An open, free, documented TRON event feed that bots, wallets, compliance tools and AI agents can
  use without building their own indexer.
- First-class coverage of TRON-specific mechanics (Stake 2.0 energy/bandwidth delegation) that
  generic multi-chain tools ignore.
- A US-based research outlet (The Tron Report) that publishes reproducible numbers backed by open
  code.

---

### Pre-submission checklist **[YOU]**

- [ ] Push v1.1.0 to GitHub (review the diff first) and tag the release
- [ ] Optionally publish `tronostr` to npm (needs your npm account)
- [ ] Create a TRON DAO Forum account and request TBL group access
- [ ] Fill in the team and background, track, dates, funding ask, and subscriber counts if wanted
- [ ] Record the short demo video
- [ ] Final read-through; then you post it (or explicitly ask for it to be posted)
