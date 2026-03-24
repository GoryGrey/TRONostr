import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { Detector } from './detectors/Detector';
import { getSmokeBlock, getSmokeConfig } from './fixtures/smokeFixtures';
import { prepareTRONostrEvent } from './eventEnvelope';
import { Publisher } from './nostr/Publisher';
import { WebhookOutput } from './output/WebhookOutput';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { TRONostrRuntime } from './runtime/TRONostrRuntime';
import { InMemoryRelayHub, createInMemoryRelayConnector } from './testing/InMemoryRelay';
import { FileCheckpointStore } from './tron/CheckpointStore';
import { Watcher } from './tron/Watcher';
import { formatBanner, formatStatusSnapshot } from './cli/format';

dotenv.config();

const quietLogger = {
    log: () => undefined,
    warn: () => undefined,
    error: (...args: unknown[]) => {
        console.error(...args);
    },
};

async function main() {
    const liveMode = process.argv.includes('--live');

    if (liveMode) {
        await runLiveStatus();
        return;
    }

    await runSmokeStatus();
}

async function runSmokeStatus() {
    const config = getSmokeConfig();
    const hub = new InMemoryRelayHub();
    const connectRelay = createInMemoryRelayConnector(hub);
    const publisher = new Publisher({
        relays: config.nostr.relays,
        privateKey: '1'.repeat(64),
        kindRange: config.nostr.kindRange,
        rateLimit: config.nostr.rateLimit,
        connectRelay,
        autoProcess: false,
        logger: quietLogger,
    });
    const tracker = new TRONostrStatusTracker();
    const detectors: Detector[] = [
        new WhaleTransferDetector(config.detectors.whaleTransfer),
        new BlockMetricsDetector(),
    ];

    await publisher.connect();

    const block = getSmokeBlock();
    tracker.recordBlock(block.block_header.raw_data.number);

    for (const insight of detectors.flatMap((detector) => detector.onBlock(block))) {
        tracker.recordEvent(prepareTRONostrEvent(insight, config.nostr.kindRange));
        await publisher.publish(insight);
    }

    for (const tx of block.transactions) {
        for (const detector of detectors) {
            if (detector.onTransaction) {
                for (const insight of detector.onTransaction(tx)) {
                    tracker.recordEvent(prepareTRONostrEvent(insight, config.nostr.kindRange));
                    await publisher.publish(insight);
                }
            }
        }
    }

    await publisher.flush();

    console.log(formatBanner(
        'TRONostr Demo Status',
        'Deterministic local snapshot using fixtures and the in-memory relay path.',
    ));
    console.log(formatStatusSnapshot(tracker.getSnapshot(publisher.getStats())));
    console.log(`publishedEvents: ${hub.publishedEvents.length}`);

    publisher.stop();
}

async function runLiveStatus() {
    const config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));
    if (!process.env.NOSTR_PRIVATE_KEY) {
        throw new Error('NOSTR_PRIVATE_KEY is required for --live status mode.');
    }

    const publisher = new Publisher({
        relays: config.nostr.relays,
        privateKey: process.env.NOSTR_PRIVATE_KEY,
        kindRange: config.nostr.kindRange,
        rateLimit: config.nostr.rateLimit,
        reconnect: config.nostr.reconnect,
    });
    const watcher = new Watcher({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        apiKey: process.env.TRON_PRO_API_KEY,
        pollIntervalMs: config.tron.pollIntervalMs,
        maxBackoffMs: config.tron.maxBackoffMs,
        backoffMultiplier: config.tron.backoffMultiplier,
        jitterMs: config.tron.jitterMs,
        checkpointStore: config.tron.checkpoint?.enabled ? new FileCheckpointStore(config.tron.checkpoint.path) : undefined,
        checkpointKey: config.tron.checkpoint?.key,
        startBlock: config.tron.startBlock,
    });
    const detectors: Detector[] = [];
    if (config.detectors.whaleTransfer.enabled) {
        detectors.push(new WhaleTransferDetector(config.detectors.whaleTransfer));
    }
    if (config.detectors.blockMetrics.enabled) {
        detectors.push(new BlockMetricsDetector());
    }

    const outputs = [];
    if (config.output?.webhook?.enabled) {
        outputs.push(new WebhookOutput(config.output.webhook));
    }

    const tracker = new TRONostrStatusTracker();
    const runtime = new TRONostrRuntime({
        watcher,
        detectors,
        publisher,
        outputs,
        statusTracker: tracker,
        kindRange: config.nostr.kindRange,
    });

    const interval = setInterval(() => {
        const snapshot = runtime.getStatusSnapshot();
        if (!snapshot) {
            return;
        }
        console.log(formatBanner(
            'TRONostr Demo Status',
            'Live runtime snapshot from the configured watcher, publisher, and optional outputs.',
        ));
        console.log(formatStatusSnapshot(snapshot));
    }, 5000);

    let shuttingDown = false;
    const shutdown = async () => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        clearInterval(interval);
        await runtime.stop();
        const snapshot = runtime.getStatusSnapshot();
        if (snapshot) {
            console.log('[demo:status] final');
            console.log(formatStatusSnapshot(snapshot));
        }
    };

    process.on('SIGINT', () => void shutdown());
    process.on('SIGTERM', () => void shutdown());

    await runtime.start();
}

main().catch((error) => {
    console.error('[demo:status] Failed:', error);
    process.exit(1);
});
