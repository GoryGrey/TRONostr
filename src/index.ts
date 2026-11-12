#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { Watcher } from './tron/Watcher';
import { Publisher } from './nostr/Publisher';
import { FileCheckpointStore } from './tron/CheckpointStore';
import { TRONostrOutputTransport, TRONostrRuntime } from './runtime/TRONostrRuntime';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { WebhookOutput } from './output/WebhookOutput';
import { EventStore } from './output/EventStore';
import { JsonlFileOutput } from './output/JsonlFileOutput';
import { ApiServer } from './api/ApiServer';
import { buildDetectors, loadConfig } from './config';
import { formatBanner, formatEventSummary, formatStatusSnapshot } from './cli/format';

dotenv.config();

async function main() {
    const config = loadConfig();

    console.log(formatBanner(
        'TRONostr Runtime',
        'Live TRON watcher with structured telemetry over Nostr, a local JSON API, and optional secondary outputs.',
    ));

    // Nostr publishing is the default transport, but it is optional: without a key TRONostr runs
    // in read-only "local" mode (HTTP API / JSONL / webhook only) and signs nothing.
    const nostrEnabled = config.nostr?.enabled !== false && Boolean(process.env.NOSTR_PRIVATE_KEY);
    let publisher: Publisher | undefined;
    if (nostrEnabled) {
        publisher = new Publisher({
            relays: config.nostr.relays,
            privateKey: process.env.NOSTR_PRIVATE_KEY!,
            kindRange: config.nostr.kindRange,
            rateLimit: config.nostr.rateLimit,
            reconnect: config.nostr.reconnect,
        });
        console.log(`Enabled: Nostr publisher -> ${config.nostr.relays.length} relay(s)`);
    } else {
        console.log('Nostr publishing disabled (no NOSTR_PRIVATE_KEY set or nostr.enabled=false). Running in local mode.');
    }

    const detectors = buildDetectors(config, (msg) => console.log(msg));

    const checkpointStore = config.tron.checkpoint?.enabled
        ? new FileCheckpointStore(config.tron.checkpoint.path)
        : undefined;

    const watcher = new Watcher({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        apiKey: process.env.TRON_PRO_API_KEY || undefined,
        pollIntervalMs: config.tron.pollIntervalMs,
        maxBackoffMs: config.tron.maxBackoffMs,
        backoffMultiplier: config.tron.backoffMultiplier,
        jitterMs: config.tron.jitterMs,
        checkpointStore,
        checkpointKey: config.tron.checkpoint?.key,
        startBlock: config.tron.startBlock,
    });

    const outputs: TRONostrOutputTransport[] = [];
    const store = new EventStore({ capacity: config.api?.storeCapacity ?? 5000 });
    outputs.push(store);

    if (config.output?.webhook?.enabled) {
        outputs.push(new WebhookOutput(config.output.webhook));
        console.log(`Enabled: WebhookOutput -> ${config.output.webhook.url}`);
    }
    if (config.output?.jsonl?.enabled) {
        outputs.push(new JsonlFileOutput({ path: config.output.jsonl.path }));
        console.log(`Enabled: JsonlFileOutput -> ${config.output.jsonl.path}`);
    }

    const statusTracker = new TRONostrStatusTracker();
    const runtime = new TRONostrRuntime({
        watcher,
        detectors,
        publisher,
        outputs,
        statusTracker,
        kindRange: config.nostr.kindRange,
    });

    let api: ApiServer | undefined;
    if (config.api?.enabled !== false) {
        api = new ApiServer({
            store,
            getStatus: () => runtime.getStatusSnapshot(),
            host: process.env.TRONOSTR_API_HOST || config.api?.host,
            port: process.env.TRONOSTR_API_PORT ? Number(process.env.TRONOSTR_API_PORT) : config.api?.port,
            corsOrigin: config.api?.corsOrigin,
            kindRange: config.nostr.kindRange,
        });
        const { host, port } = await api.listen();
        console.log(`Enabled: JSON API -> http://${host}:${port}/api/v1/summary`);
    }

    runtime.on('event', (event) => {
        if (event.parsedContent.eventType === 'block_metrics') {
            console.log(`[runtime] ${formatEventSummary(event)}`);
            return;
        }
        if (event.parsedContent.severity === 'high' || event.parsedContent.severity === 'critical') {
            console.log(`[alert] ${formatEventSummary(event)}`);
        }
    });

    runtime.on('error', (err) => {
        console.error('Runtime Error:', err);
    });

    runtime.on('state', (state) => {
        if (state.state === 'backoff') {
            console.warn(`Watcher entering backoff: attempt=${state.attempt} delay=${state.delay}ms`);
        }
    });

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        console.log(`Received ${signal}. Shutting down TRONostr...`);
        await runtime.stop();
        await api?.close();
        const snapshot = runtime.getStatusSnapshot();
        if (snapshot) {
            console.log(formatStatusSnapshot(snapshot));
        }
    };

    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });

    await runtime.start();
}

main().catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
});
