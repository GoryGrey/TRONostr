# TRONostr 🚀

TRONostr is an open-source oracle daemon that bridges **TRON** blockchain activity to **Nostr**. It monitors blocks, transactions, and smart contract logs (TRC-20) and broadcasts signed, machine-readable "insights" to Nostr relays.

## Features

- **TRON Watcher**: Real-time streaming of blocks and transactions using `TronWeb`.
- **Modular Detectors**:
  - `WhaleTransferDetector`: Monitors large TRX and USDT movements.
  - `BlockMetricsDetector`: Aggregates per-block statistics (tx count, gas, etc.).
- **Nostr Publisher**: Signed event broadcasting with builtin **Rate Limiting** and message queuing to respect relay limits.
- **Configurable**: YAML-based configuration for RPC endpoints, relays, and detection thresholds.

## Quick Start

### 1. Prerequisites
- Node.js (v16+)
- A Nostr Private Key (Hex format)
- [Optional] TronGrid API Key for higher rate limits.

### 2. Installation
```bash
npm install
```

### 3. Configuration
Copy the environment template and add your keys:
```bash
cp .env.example .env
```
Edit `config.yaml` to customize thresholds and relays.

### 4. Run the Oracle
```bash
# Development mode
npm run dev

# Production build & run
npm run start
```

## Data Model

TRONostr publishes events in the `6500-6599` kind range (default):
- **Kind 6500**: Block Metrics (`TRON_BLOCK`)
- **Kind 6501**: TRX Transfers (`TRX_TRANSFER`)
- **Kind 6502**: USDT Transfers (`USDT_TRANSFER`)

Each event is tagged with `["chain", "tron"]` and relevant metadata for efficient filtering.

## License

Permissive MIT/Apache license. Built for the TRON and Nostr communities.
