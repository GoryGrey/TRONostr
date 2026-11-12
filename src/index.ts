#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { Watcher } from './tron/Watcher';
import { Publisher } from './nostr/Publisher';
import { FileCheckpointStore } from './tron/CheckpointStore';
import { TRONostrOutputTransport, TRONostrRuntime } from './runtime/TRONostrRuntime';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { WebhookOutput } from './output/WebhookOutput';
import { EventStore } from './output/EventStore';
import { SqliteEventStore } from './output/SqliteEventStore';
import { resolvePublisherKey } from './nostr/publisherKey';
import { JsonlFileOutput } from './output/JsonlFileOutput';
import { ApiServer } from './api/ApiServer';
import { buildDetectors, loadConfig, resolveStorageConfig } from './config';
import { formatBanner, formatEventSummary, formatStatusSnapshot } from './cli/format';

dotenv.config();

async function main() {
    const config = loadConfig();

    console.log(formatBanner(
        'TRONostr Runtime',
        'Live TRON watcher with structured telemetry over Nostr, a local JSON API, and optional secondary outputs.',
    ));

    // Nostr publishing is the default transport, but it is optional: without a key TRONostr runs
    // in read-only "local" mode (HTTP API / JSONL / webhook) and signs nothing. The key comes only
    // from the environment (TRONOSTR_PUBLISHER_KEY, TRONOSTR_PUBLISHER_KEY_FILE, or legacy
    // NOSTR_PRIVATE_KEY) and is never logged; only the derived npub is printed.
    const publisherKey = config.nostr?.enabled !== false ? resolvePublisherKey() : undefined;
    let publisher: Publisher | undefined;
    if (publisherKey) {
        if (publisherKey.sourceVar === 'NOSTR_PRIVATE_KEY') {
            console.warn('NOSTR_PRIVATE_KEY is deprecated; use TRONOSTR_PUBLISHER_KEY (a key used only for this publisher).');
        }
        publisher = new Publisher({
            relays: config.nostr.relays,
            privateKey: publisherKey.secretHex,
            kindRange: config.nostr.kindRange,
            rateLimit: config.nostr.rateLimit,
            reconnect: config.nostr.reconnect,
        });
        console.log(`Enabled: Nostr publisher ${publisherKey.npub} -> ${config.nostr.relays.length} relay(s)`);
    } else {
        console.log('Nostr publishing disabled (no TRONOSTR_PUBLISHER_KEY set or nostr.enabled=false). Running in local mode.');
    }

    const detectors = buildDetectors(config, (msg) => console.log(msg));

    // TRONOSTR_CHECKPOINT_PATH enables resume-after-restart without editing config.yaml (the Docker
    // image sets it to /data), so restarts and deploys catch up instead of leaving history gaps.
    const checkpointPath = process.env.TRONOSTR_CHECKPOINT_PATH
        || (config.tron.checkpoint?.enabled ? config.tron.checkpoint.path : undefined);
    const checkpointStore = checkpointPath ? new FileCheckpointStore(checkpointPath) : undefined;
    if (checkpointPath) console.log(`Enabled: block checkpoint -> ${checkpointPath}`);

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
    const storage = resolveStorageConfig(config);
    const store = storage.enabled
        ? new SqliteEventStore({
            path: storage.path,
            retentionDays: storage.retentionDays,
            storeBlockMetrics: storage.storeBlockMetrics,
            capacity: config.api?.storeCapacity ?? 5000,
        })
        : new EventStore({ capacity: config.api?.storeCapacity ?? 5000 });
    outputs.push(store);
    if (store instanceof SqliteEventStore) {
        const stats = store.stats();
        console.log(`Enabled: SQLite history -> ${storage.path} (retention ${storage.retentionDays}d, ${stats.eventRows} stored event(s) reloaded up to ${store.size()})`);
    }

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
            // PORT is what most PaaS hosts (Render, Fly, Railway) inject.
            port: process.env.TRONOSTR_API_PORT ? Number(process.env.TRONOSTR_API_PORT) : process.env.PORT ? Number(process.env.PORT) : config.api?.port,
            corsOrigin: config.api?.corsOrigin,
            kindRange: config.nostr.kindRange,
            history: store instanceof SqliteEventStore ? store : undefined,
            dashboard: config.api?.dashboard !== false,
            publicLabelsEnabled: config.detectors?.exchangeFlow?.enabled === true && config.detectors?.exchangeFlow?.usePublicLabels === true,
        });
        const { host, port } = await api.listen();
        console.log(`Enabled: JSON API -> http://${host}:${port}/api/v1/summary`);
        if (config.api?.dashboard !== false) console.log(`Enabled: dashboard -> http://${host}:${port}/`);
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

    runtime.on('error', (err: any) => {
        // Keep logs readable: HTTP client errors carry huge request objects.
        const status = err?.response?.status;
        const detail = err?.response?.data?.Error ?? err?.response?.data?.error;
        console.error(`Runtime Error: ${err?.message ?? String(err)}${status ? ` (HTTP ${status})` : ''}${detail ? ` - ${String(detail).slice(0, 160)}` : ''}`);
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
        await api?.close();
        await runtime.stop();
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
