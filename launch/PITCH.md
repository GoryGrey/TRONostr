TRONostr is a lightweight event layer for TRON.

It watches TRON blocks and transfers, normalizes them into a stable JSON schema, and publishes those events for bots, dashboards, alerting pipelines, and automation systems.

What is implemented in this repo today:

- TRON block telemetry
- large TRX and USDT transfer detection
- signed relay distribution over Nostr
- optional webhook mirroring
- deterministic local showcase and smoke paths
- TypeScript SDK consumption
