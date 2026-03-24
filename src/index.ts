import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { Watcher } from './tron/Watcher';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { Publisher } from './nostr/Publisher';
import { Detector } from './detectors/Detector';
import { FileCheckpointStore } from './tron/CheckpointStore';
import { TRONostrRuntime } from './runtime/TRONostrRuntime';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { WebhookOutput } from './output/WebhookOutput';
import { formatBanner, formatEventSummary, formatStatusSnapshot } from './cli/format';

dotenv.config();

const config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));

async function main() {
    console.log(formatBanner(
        'TRONostr Runtime',
        'Live TRON watcher with structured telemetry publishing over Nostr and optional secondary outputs.',
    ));

    if (!process.env.NOSTR_PRIVATE_KEY) {
        console.error("CRITICAL: NOSTR_PRIVATE_KEY is not set in .env");
        process.exit(1);
    }

    // 1. Initialize Publisher
    const publisher = new Publisher({
        relays: config.nostr.relays,
        privateKey: process.env.NOSTR_PRIVATE_KEY,
        kindRange: config.nostr.kindRange,
        rateLimit: config.nostr.rateLimit,
        reconnect: config.nostr.reconnect,
    });
    const detectors: Detector[] = [];
    if (config.detectors.whaleTransfer.enabled) {
        detectors.push(new WhaleTransferDetector(config.detectors.whaleTransfer));
        console.log("Enabled: WhaleTransferDetector");
    }
    if (config.detectors.blockMetrics.enabled) {
        detectors.push(new BlockMetricsDetector());
        console.log("Enabled: BlockMetricsDetector");
    }

    // 3. Initialize Watcher
    const checkpointStore = config.tron.checkpoint?.enabled
        ? new FileCheckpointStore(config.tron.checkpoint.path)
        : undefined;

    const watcher = new Watcher({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        apiKey: process.env.TRON_PRO_API_KEY,
        pollIntervalMs: config.tron.pollIntervalMs,
        maxBackoffMs: config.tron.maxBackoffMs,
        backoffMultiplier: config.tron.backoffMultiplier,
        jitterMs: config.tron.jitterMs,
        checkpointStore,
        checkpointKey: config.tron.checkpoint?.key,
        startBlock: config.tron.startBlock,
    });

    const outputs = [];
    if (config.output?.webhook?.enabled) {
        outputs.push(new WebhookOutput(config.output.webhook));
        console.log(`Enabled: WebhookOutput -> ${config.output.webhook.url}`);
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
        console.error("Runtime Error:", err);
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
        console.log(formatStatusSnapshot(statusTracker.getSnapshot(publisher.getStats())));
    };

    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });

    // Start!
    await runtime.start();
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
