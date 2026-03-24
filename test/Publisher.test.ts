import assert from 'node:assert/strict';
import { Publisher } from '../src/nostr/Publisher';
import { createInsight, TEST_KIND_RANGE, TEST_PRIVATE_KEY } from './fixtures';
import { createLoggerSpy, createRelayTestKit, waitFor } from './helpers';
import { TestCase } from './runner';

export const publisherCases: TestCase[] = [
    {
        name: 'maps insight types to kinds correctly',
        run: async () => {
            const { logger } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await publisher.publish(createInsight({}, 'TRON_BLOCK'));
            await publisher.publish(createInsight({}, 'TRX_TRANSFER'));
            await publisher.publish(createInsight({}, 'USDT_TRANSFER'));

            const queue = (publisher as any).queue;
            assert.deepEqual(queue.map((event: any) => event.kind), [6500, 6501, 6502]);
        },
    },
    {
        name: 'queues events correctly',
        run: async () => {
            const { logger } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await publisher.publish(createInsight());

            assert.equal((publisher as any).queue.length, 1);
        },
    },
    {
        name: 'respects queue size limits',
        run: async () => {
            const { logger } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                rateLimit: {
                    eventsPerMinute: 60,
                    queueSize: 1,
                },
                autoProcess: false,
                logger,
            });

            const originalWarn = console.warn;
            console.warn = () => undefined;

            try {
                await publisher.publish(createInsight());
                await publisher.publish(createInsight({ severity: 'high' }));
            } finally {
                console.warn = originalWarn;
            }

            assert.equal((publisher as any).queue.length, 1);
        },
    },
    {
        name: 'preserves the published schema',
        run: async () => {
            const { logger } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await publisher.publish(createInsight({ severity: 'high' }, 'USDT_TRANSFER'));

            const event = (publisher as any).queue[0];
            const content = JSON.parse(event.content);

            assert.equal(content.schema, 'tronostr.v1');
            assert.equal(content.chain, 'tron');
            assert.equal(content.severity, 'high');
            assert.equal(content.eventType, 'usdt_transfer');
            assert.ok(event.tags.some((tag: string[]) => tag[0] === 't' && tag[1] === 'severity:high'));
        },
    },
    {
        name: 'rejects invalid repo-native payloads before queueing',
        run: async () => {
            const { logger } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await assert.rejects(
                publisher.publish(createInsight({ transaction: undefined }, 'TRX_TRANSFER')),
                /Invalid TRONostr event content/,
            );
            assert.equal((publisher as any).queue.length, 0);
        },
    },
    {
        name: 'warns when events are queued without active relays',
        run: async () => {
            const { logger, warnings } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await publisher.publish(createInsight());

            assert.equal((publisher as any).queue.length, 1);
            assert.equal(warnings.length, 1);
            assert.ok(warnings[0].includes('no active relays'));
        },
    },
    {
        name: 'flush returns zero when no relays are connected',
        run: async () => {
            const { logger, warnings } = createLoggerSpy();
            const publisher = new Publisher({
                relays: [],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                autoProcess: false,
                logger,
            });

            await publisher.publish(createInsight());
            const delivered = await publisher.flush();

            assert.equal(delivered, 0);
            assert.ok(warnings.length >= 1);
        },
    },
    {
        name: 'exposes lightweight queue and delivery stats',
        run: async () => {
            const { connectRelay } = createRelayTestKit();
            const publisher = new Publisher({
                relays: ['memory://tronostr'],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                autoProcess: false,
            });

            await publisher.connect();
            await publisher.publish(createInsight());
            const delivered = await publisher.flush();

            const stats = publisher.getStats();
            assert.equal(delivered, 1);
            assert.equal(stats.queueLength, 0);
            assert.equal(stats.publishAttempts, 1);
            assert.equal(stats.deliveredCount, 1);
            assert.equal(stats.droppedCount, 0);
            assert.equal(stats.invalidPayloadCount, 0);
            assert.equal(stats.skippedNoRelayCount, 0);
            assert.equal(stats.activeRelayCount, 1);
        },
    },
    {
        name: 'reconnects and keeps queued events for later delivery',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const publisher = new Publisher({
                relays: ['memory://tronostr'],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                autoProcess: false,
                reconnect: {
                    enabled: true,
                    initialDelayMs: 1,
                    maxDelayMs: 1,
                    multiplier: 1,
                    jitterMs: 0,
                },
                random: () => 0,
            });

            await publisher.connect();
            const firstRelay = hub.getLatestRelay('memory://tronostr');
            firstRelay?.disconnect('test disconnect');

            await publisher.publish(createInsight());
            assert.equal(publisher.getActiveRelayCount(), 0);
            assert.equal(publisher.getStats().queueLength, 1);

            await waitFor(() => {
                assert.equal(publisher.getActiveRelayCount(), 1);
                assert.equal(hub.getRelays('memory://tronostr').length, 2);
            });

            const delivered = await publisher.flush();
            assert.equal(delivered, 1);
            assert.equal(hub.publishedEvents.length, 1);
            assert.equal(publisher.getStats().reconnectAttempts, 1);
            publisher.stop();
        },
    },
];
