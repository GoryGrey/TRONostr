TRONostr launch draft

1. TRONostr is an open realtime TRON event layer.
2. It turns raw TRON activity into structured machine-readable telemetry instead of making every downstream system build its own TRON ingestion stack.
3. The repo ships with a stable schema, deterministic local showcase, Nostr distribution as the first transport, and optional webhook mirroring.
4. Current detectors cover block telemetry plus large TRX and USDT transfers.
5. It is built for bots, dashboards, alerting systems, and automation that need clean TRON signals.
6. Best first run: `npm run showcase`
