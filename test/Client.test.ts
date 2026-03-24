import assert from 'node:assert/strict';
import { TRONostrClient } from '../src/Client';
import { Publisher } from '../src/nostr/Publisher';
import { createInsight, TEST_KIND_RANGE, TEST_PRIVATE_KEY } from './fixtures';
import { createLoggerSpy, createRelayTestKit, waitFor } from './helpers';
import { TestCase } from './runner';

export const clientCases: TestCase[] = [
    {
        name: 'parses JSON event content correctly',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            const received: string[] = [];

            await client.connect();
            client.onAll((event) => {
                received.push(event.parsedContent.eventType);
            });

            hub.publish({
                kind: 6501,
                created_at: 1710000000,
                tags: [],
                content: JSON.stringify(createInsight().content),
            });

            assert.deepEqual(received, ['trx_transfer']);
        },
    },
    {
        name: 'subscribes using the corrected kind-based filter approach',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            await client.connect();
            client.onTransfer(() => undefined);
            client.onBlock(() => undefined);

            assert.deepEqual(hub.subscriptions[0].filters[0].kinds, [6501, 6502]);
            assert.deepEqual(hub.subscriptions[1].filters[0].kinds, [6500]);
        },
    },
    {
        name: 'rejects malformed inbound events safely',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const { logger, warnings } = createLoggerSpy();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                logger,
            });

            let count = 0;

            await client.connect();
            client.onAll(() => {
                count += 1;
            });

            hub.publish({
                kind: 6501,
                created_at: 1710000000,
                tags: [],
                content: JSON.stringify({ schema: 'tronostr.v1', chain: 'tron' }),
            });

            assert.equal(count, 0);
            assert.equal(warnings.length, 1);
            assert.ok(warnings[0].includes('Rejected malformed event'));
        },
    },
    {
        name: 'can consume repo-native events reliably',
        run: async () => {
            const { connectRelay } = createRelayTestKit();
            const publisher = new Publisher({
                relays: ['memory://tronostr'],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                autoProcess: false,
            });
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            const received: string[] = [];

            await publisher.connect();
            await client.connect();

            client.onTransfer((event) => {
                received.push(event.parsedContent.eventType);
            });

            await publisher.publish(createInsight({}, 'USDT_TRANSFER'));
            await publisher.flush();

            assert.deepEqual(received, ['usdt_transfer']);
        },
    },
    {
        name: 'supports subscriptions registered before connect',
        run: async () => {
            const { connectRelay } = createRelayTestKit();
            const publisher = new Publisher({
                relays: ['memory://tronostr'],
                privateKey: TEST_PRIVATE_KEY,
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                autoProcess: false,
            });
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            const received: string[] = [];
            client.onTransfer((event) => {
                received.push(event.parsedContent.eventType);
            });

            await publisher.connect();
            await client.connect();

            await publisher.publish(createInsight({}, 'TRX_TRANSFER'));
            await publisher.flush();

            assert.deepEqual(received, ['trx_transfer']);
        },
    },
    {
        name: 'reconnects and restores subscriptions after relay disconnect',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
                reconnect: {
                    enabled: true,
                    initialDelayMs: 1,
                    maxDelayMs: 1,
                    multiplier: 1,
                    jitterMs: 0,
                },
                random: () => 0,
            });

            const received: string[] = [];

            client.onTransfer((event) => {
                received.push(event.parsedContent.eventType);
            });

            await client.connect();
            hub.getLatestRelay('memory://tronostr')?.disconnect('test disconnect');

            await waitFor(() => {
                assert.equal(client.getActiveRelayCount(), 1);
                assert.equal(hub.getRelays('memory://tronostr').length, 2);
            });

            hub.publish({
                kind: 6502,
                created_at: 1710000000,
                tags: [],
                content: JSON.stringify(createInsight({}, 'USDT_TRANSFER').content),
            });

            assert.deepEqual(received, ['usdt_transfer']);
            client.close();
        },
    },
];
