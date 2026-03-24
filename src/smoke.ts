import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { TRONostrClient } from './Client';
import { Publisher } from './nostr/Publisher';
import { getSmokeBlock, getSmokeConfig } from './fixtures/smokeFixtures';
import { Detector } from './detectors/Detector';
import { createInMemoryRelayConnector, InMemoryRelayHub } from './testing/InMemoryRelay';

async function main() {
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
    });

    const client = new TRONostrClient({
        relays: config.nostr.relays,
        kindRange: config.nostr.kindRange,
        connectRelay,
    });

    const detectors: Detector[] = [
        new WhaleTransferDetector(config.detectors.whaleTransfer),
        new BlockMetricsDetector(),
    ];

    await publisher.connect();
    await client.connect();

    client.onBlock((event) => {
        console.log('[smoke:block]', JSON.stringify(event.parsedContent));
    });

    client.onTransfer((event) => {
        console.log('[smoke:transfer]', JSON.stringify(event.parsedContent));
    });

    client.onAlerts((event) => {
        console.log('[smoke:alert]', JSON.stringify(event.parsedContent));
    });

    const block = getSmokeBlock();

    for (const insight of detectors.flatMap((detector) => detector.onBlock(block))) {
        await publisher.publish(insight);
    }

    for (const tx of block.transactions) {
        for (const detector of detectors) {
            if (detector.onTransaction) {
                for (const insight of detector.onTransaction(tx)) {
                    await publisher.publish(insight);
                }
            }
        }
    }

    await publisher.flush();

    console.log(`[smoke] Published ${hub.publishedEvents.length} events through the in-memory relay.`);

    client.close();
    publisher.stop();
}

main().catch((error) => {
    console.error('[smoke] Failed:', error);
    process.exit(1);
});
