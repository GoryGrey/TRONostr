# Deploying TRONostr / The Tron Report

TRONostr is one long-running Node process. It polls TronGrid about every 3 seconds, serves the JSON
API and dashboard over HTTP, and writes SQLite history to a local disk. A host needs to:

1. keep the process running 24/7 (no sleep-on-idle),
2. offer a persistent disk for `/data/tronostr.db` (about 1 GB is plenty for 30 days at default
   thresholds),
3. expose one HTTP port.

Request budget: the watcher makes about 2 TronGrid calls every 3 s (current block plus the new
block), roughly 57,600 calls per day. That is under TronGrid's free plan of 100,000 requests per day
per key, and about 0.7 req/s without a key, under the documented 3 req/s keyless limit
([TronGrid pricing](https://www.trongrid.io/price),
[rate limits](https://developers.tron.network/reference/rate-limits)). A free `TRON_PRO_API_KEY`
is still recommended for an always-on instance.

Measured locally (Node 24, Linux, defaults config, 2026-11-12): about 121 MiB RSS and about 1% of one
CPU after a few minutes. See `samples/` for the run summary.

## Hosting comparison (researched 2026-11-12, prices in USD)

| host | fits a 24/7 process + disk? | cost for TRONostr | key limits / gotchas | source |
| --- | --- | --- | --- | --- |
| **Fly.io** | Yes (Machine + volume) | `shared-cpu-1x` 256 MB **$2.19/mo** or 512 MB **$3.69/mo**, plus a 1 GB volume at $0.15/mo and egress at $0.02/GB (N. America). Bills **under $5/month are waived** for your personal org once a card is on file, so this is effectively **$0** if usage stays under $5 | There is no free tier; the $1 trial lasts 7 days. The waiver needs a credit card. A $5.00+ bill is charged in full, with no first-$5 deduction | [pricing](https://docs.fly.io/about/pricing), [free waiver](https://docs.fly.io/about/free-waiver), [trial](https://docs.fly.io/about/free-trial) |
| **Oracle Cloud Always Free** | Yes (full VM) | **$0**: Ampere A1 is 2 OCPU / 12 GB total (reduced from 4/24), or 2 AMD micro VMs; 200 GB block storage; 10 TB/mo egress | **Idle instances may be reclaimed** if, over 7 days, CPU p95, network, and (A1) memory all stay under 20%. TRONostr is light, so this is a real risk. A1 capacity can be unavailable in some home regions. Signup has required a card for identity verification ([CNX Software, 2021](https://www.cnx-software.com/2021/08/25/oracle-cloud-always-free-services-include-ampere-a1-arm-compute-instances/)), so check the current signup. You run the VM yourself (patching, Docker) | [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm), [A1 allocation change](https://community.oracle.com/customerconnect/discussion/970310/oci-always-free-updated-ampere-a1-compute-allocation) |
| Google Cloud free tier | Yes (e2-micro VM) | VM free (1 e2-micro in us-west1, us-central1 or us-east1, 30 GB pd-standard), but an in-use external IPv4 is **$0.005/h ≈ $3.65/mo**, and free egress is only **1 GB/mo** | Billing account and card required. The 1 GB of egress is used up quickly by a public dashboard | [free tier](https://docs.cloud.google.com/free/docs/free-cloud-features), [VPC/IP pricing](https://cloud.google.com/vpc/pricing) |
| Render | No (free tier) | Free web services **sleep after 15 min without inbound traffic** (about 1 min to wake), get 750 instance-hours/mo, and **cannot attach persistent disks** (the SQLite file is lost on restart, redeploy, or spin-down). Disks need a paid instance | Free Postgres expires after 30 days. Free services can be restarted at any time | [free](https://render.com/docs/free), [disks](https://render.com/docs/disks) |
| Railway | Not for free | Trial: $5 one-time credit for 30 days. Free plan: **$1/mo credit**, 0.5 GB RAM max. Usage is $10/GB-RAM-mo plus $20/vCPU-mo plus $0.15/GB volume, so 24/7 at about 125 MB is roughly $1.25/mo of RAM alone, over the $1 credit. Hobby is $5/mo including $5 of usage | Trial volumes are deleted 30 days after credits expire. Unverified trials have restricted outbound network access | [pricing](https://railway.com/pricing.md), [trial](https://docs.railway.com/pricing/free-trial) |
| Cloudflare Workers (+ D1, Cron) | No (wrong shape) | Free: 100k requests/day, **10 ms CPU per request or cron run**, 5 cron triggers, D1 5 GB / 100k rows written per day | No long-running process, and cron runs at most once a minute, so block-by-block polling would need a rewrite and would still miss the 3 s cadence. Good later for a cached read-only edge API in front of the real instance | [limits](https://developers.cloudflare.com/workers/platform/limits/), [pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| Deno Deploy | No | Free: 1M requests, 10 CPU-hours per month, cron, KV. Node app would need porting | **Deno Deploy will be sunset in April 2027** (banner on its docs) | [pricing and limits](https://docs.deno.com/deploy/pricing_and_limits/), [pricing](https://deno.com/deploy/pricing) |
| GitHub Actions cron + Pages | No | Free minutes on public repos. Could publish a static snapshot every 5+ min | Shortest schedule is **every 5 minutes**, schedules can be delayed or dropped under load, and schedules in public repos are **auto-disabled after 60 days without repo activity**. No live API. Fine as a backup snapshot publisher only | [schedule event docs](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule) |

### Recommendation

1. **Fly.io, single 512 MB Machine plus a 1 GB volume in `iad` (Ashburn) or `ewr` (Secaucus).**
   List price is about $3.84/mo plus egress, which falls under the documented under-$5 waiver, so
   the expected bill is $0. It is the least operational work: the Dockerfile in this repo deploys
   as-is, and the volume keeps SQLite across restarts and deploys. Risks: a card must be on file,
   and if usage reaches $5 the whole bill is charged. Keep it to one Machine, don't buy a dedicated
   IPv4 ($2/mo), and watch egress, which at $0.02/GB means about 60 GB of headroom.
2. **Oracle Cloud Always Free** if you want $0 with no card exposure after signup and are fine
   running a VM. Use a 1 OCPU / 6 GB A1 instance with Docker, `--restart unless-stopped`, and a bind
   mount for `/data`. Be aware of the idle-reclaim rule above. TRONostr's normal load is far below
   20%, so reclaim is possible, and you'd need to re-create the VM from these docs. History is
   lost unless you back up the SQLite file.
3. Not recommended for the live instance: Render free (no disk, sleeps), Railway free ($1 credit is
   too small for 24/7), Cloudflare/Deno/GitHub Actions (no long-running process; Deno Deploy is
   being sunset).

## Run with Docker (any host)

```bash
docker build -t tronostr .
docker volume create tronostr-data
docker run -d --name tronostr --restart unless-stopped \
  -p 8788:8788 \
  -v tronostr-data:/data \
  -e TRON_PRO_API_KEY=...            # optional, recommended
  tronostr
# dashboard: http://<host>:8788/   API: http://<host>:8788/api/v1/summary
```

The image runs as the non-root `node` user, stores history in `/data/tronostr.db` and the block
checkpoint in `/data/checkpoints.json` (so restarts resume where they stopped), binds
`0.0.0.0:8788`, and has a `/health` HEALTHCHECK. Secrets are passed at runtime only.

## Fly.io outline (not yet executed; needs your account)

```bash
fly launch --no-deploy --name <your-app> --region iad   # uses the Dockerfile
fly volumes create tronostr_data --size 1 --region iad
# fly.toml: [mounts] source="tronostr_data" destination="/data"
#           [http_service] internal_port=8788, auto_stop_machines="off", min_machines_running=1
#           [[vm]] size="shared-cpu-1x", memory="512mb"
fly secrets set TRON_PRO_API_KEY=...            # optional
fly secrets set TRONOSTR_PUBLISHER_KEY=...      # optional, publisher-only Nostr key
fly deploy
```

`auto_stop_machines = "off"` matters. If the Machine stops when idle, the watcher stops and the
history gets gaps.

## Environment variables

| variable | default | purpose |
| --- | --- | --- |
| `TRON_PRO_API_KEY` | (none) | TronGrid API key (free plan: 100k requests/day) |
| `TRONOSTR_PUBLISHER_KEY` | (none) | Nostr publisher secret (hex or nsec). Unset means local mode |
| `TRONOSTR_PUBLISHER_KEY_FILE` | (none) | Read the publisher key from a file instead |
| `TRONOSTR_API_HOST` / `TRONOSTR_API_PORT` / `PORT` | `127.0.0.1` / `8788` | Bind address. The Docker image sets `0.0.0.0` |
| `TRONOSTR_DB_PATH` | `./storage/tronostr.db` (`/data/tronostr.db` in Docker) | SQLite file |
| `TRONOSTR_CHECKPOINT_PATH` | (none; `/data/checkpoints.json` in Docker) | Saves the last processed block, so a restart or deploy catches up on missed blocks instead of leaving a gap |
| `TRONOSTR_RETENTION_DAYS` | `30` | History retention, 1–365 |
| `TRONOSTR_HISTORY` | on | Set `off` to use the in-memory store only |
| `TRONOSTR_CONFIG` | `./config.yaml` | Config file path |

## Nostr publisher key handling

- Create a fresh key used only for this feed, with any Nostr key tool you trust, **on your own
  machine**. Never reuse a wallet key, seed phrase, or personal Nostr identity.
- Store it only in the host's secret store (`fly secrets set`, Docker secret file plus
  `TRONOSTR_PUBLISHER_KEY_FILE`) or a local `.env`, which is git-ignored. Never put it in
  `config.yaml`, the Dockerfile, or a commit.
- On startup TRONostr logs only the derived `npub`, which is the public identity people follow.
- To rotate, set a new key and announce the new npub. Old events stay signed by the old key.

## Backups

SQLite runs in WAL mode. To back up, copy the file while the process is stopped, or run
`sqlite3 /data/tronostr.db ".backup /data/backup.db"`. Losing it only loses history; the live feed
recovers on restart.
