import { TronWeb } from 'tronweb';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { Watcher } from './tron/Watcher';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { Publisher } from './nostr/Publisher';
import { Detector } from './detectors/Detector';

dotenv.config();

const config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));

async function main() {
    console.log("-----------------------------------------");
    console.log("TRONostr Oracle Starting...");
    console.log("-----------------------------------------");

    if (!process.env.NOSTR_PRIVATE_KEY) {
        console.error("CRITICAL: NOSTR_PRIVATE_KEY is not set in .env");
        process.exit(1);
    }

    // 1. Initialize Publisher
    const publisher = new Publisher({
        relays: config.nostr.relays,
        privateKey: process.env.NOSTR_PRIVATE_KEY,
        kindRange: config.nostr.kindRange,
        rateLimit: config.nostr.rateLimit
    });
    await publisher.connect();

    // 2. Initialize Detectors
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
    const watcher = new Watcher({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        apiKey: process.env.TRON_PRO_API_KEY
    });

    // 4. Hook everything together
    watcher.on('block', (block) => {
        console.log(`New TRON Block: ${block.block_header.raw_data.number}`);
        for (const detector of detectors) {
            const insights = detector.onBlock(block);
            for (const insight of insights) {
                console.log(`[Insight] ${insight.type}:`, insight.content);
                publisher.publish(insight);
            }
        }
    });

    watcher.on('transaction', (tx) => {
        for (const detector of detectors) {
            if (detector.onTransaction) {
                const insights = detector.onTransaction(tx);
                for (const insight of insights) {
                    console.log(`[Insight] ${insight.type} (${insight.severity}):`, insight.content);
                    publisher.publish(insight);
                }
            }
        }
    });

    watcher.on('error', (err) => {
        console.error("Watcher Error:", err);
    });

    // Start!
    await watcher.start();
}

main().catch(err => {
    console.error("Fatal Error:", err);
    process.exit(1);
});
