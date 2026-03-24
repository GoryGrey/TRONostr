import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { Detector } from './detectors/Detector';
import { getSmokeBlock, getSmokeConfig } from './fixtures/smokeFixtures';
import { PreparedTRONostrEvent, prepareTRONostrEvent } from './eventEnvelope';
import { Publisher } from './nostr/Publisher';
import { WebhookOutput } from './output/WebhookOutput';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { TRONostrClient } from './Client';
import { InMemoryRelayHub, createInMemoryRelayConnector } from './testing/InMemoryRelay';
import { formatBanner, formatEventSummary, formatKeyValueGrid, formatLaunchSummary, formatSection, formatStatusSnapshot } from './cli/format';

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
    const tracker = new TRONostrStatusTracker();
    const detectors: Detector[] = [
        new WhaleTransferDetector(config.detectors.whaleTransfer),
        new BlockMetricsDetector(),
    ];
    const webhookDeliveries: any[] = [];
    const webhookOutput = new WebhookOutput({
        url: 'http://127.0.0.1:8787/tronostr',
    }, async (request) => {
        webhookDeliveries.push(JSON.parse(request.body));
        return {
            statusCode: 202,
            body: 'accepted',
        };
    });
    const consumedEvents: PreparedTRONostrEvent[] = [];

    console.log(formatBanner(
        'TRONostr Showcase',
        'Deterministic TRON telemetry demo with relay publishing, machine-readable events, and optional webhook mirroring.',
    ));
    console.log(formatKeyValueGrid([
        { key: 'chain', value: 'TRON' },
        { key: 'schema', value: 'tronostr.v1' },
        { key: 'relay transport', value: 'Nostr (default)' },
        { key: 'secondary output', value: 'Webhook (optional)' },
        { key: 'demo mode', value: 'Deterministic fixtures' },
    ]));

    await publisher.connect();
    await client.connect();

    client.onAll((event) => {
        consumedEvents.push({
            kind: event.kind,
            created_at: event.created_at,
            tags: event.tags,
            content: event.content,
            parsedContent: event.parsedContent,
        });
    });

    const block = getSmokeBlock();
    const preparedEvents: PreparedTRONostrEvent[] = [];
    tracker.recordBlock(block.block_header.raw_data.number);

    for (const insight of detectors.flatMap((detector) => detector.onBlock(block))) {
        const prepared = prepareTRONostrEvent(insight, config.nostr.kindRange);
        preparedEvents.push(prepared);
        tracker.recordEvent(prepared);
        await webhookOutput.deliver(prepared);
        await publisher.publish(insight);
    }

    for (const tx of block.transactions) {
        for (const detector of detectors) {
            if (detector.onTransaction) {
                for (const insight of detector.onTransaction(tx)) {
                    const prepared = prepareTRONostrEvent(insight, config.nostr.kindRange);
                    preparedEvents.push(prepared);
                    tracker.recordEvent(prepared);
                    await webhookOutput.deliver(prepared);
                    await publisher.publish(insight);
                }
            }
        }
    }

    await publisher.flush();

    console.log(formatSection('What TRONostr Produced'));
    for (const event of preparedEvents) {
        console.log(`  ${formatEventSummary(event)}`);
    }

    console.log(formatSection('How It Feeds Other Systems'));
    console.log(`  relayPublishedEvents: ${hub.publishedEvents.length}`);
    console.log(`  webhookMirrors: ${webhookDeliveries.length}`);
    console.log(`  sdkConsumedEvents: ${consumedEvents.length}`);

    console.log(formatSection('Operational Snapshot'));
    console.log(formatStatusSnapshot(tracker.getSnapshot(publisher.getStats())));

    console.log(formatSection('Launch Summary'));
    console.log(formatLaunchSummary([
        'TRONostr turns TRON chain activity into structured machine-readable telemetry.',
        'Nostr is the first and default transport for open relay distribution.',
        'The same event contract can also feed HTTP webhook integrations.',
        'Bots, dashboards, and automation can consume the same normalized events.',
    ]));

    console.log(formatSection('Next Steps'));
    console.log('  Use npm run demo:status for a compact status snapshot.');
    console.log('  Use examples/bot_example.ts for alert consumption.');
    console.log('  Use examples/block_telemetry_consumer.ts for dashboard-style telemetry.');
    console.log('  Use examples/webhook_receiver.ts to receive mirrored events.');
    console.log('  Use examples/event_flow_example.ts to inspect the raw event envelope.');

    client.close();
    publisher.stop();
}

main().catch((error) => {
    console.error('[showcase] Failed:', error);
    process.exit(1);
});
