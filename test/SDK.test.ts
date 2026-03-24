import assert from 'node:assert/strict';
import { TestCase } from './runner';
import { TRONostrClient } from '../src/Client';
import { createInsight, TEST_KIND_RANGE, TEST_PRIVATE_KEY } from './fixtures';
import { createRelayTestKit } from './helpers';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { Publisher } from '../src/nostr/Publisher';

export const sdkCases: TestCase[] = [
    {
        name: 'prepares a repo-native event envelope for secondary transports',
        run: () => {
            const prepared = prepareTRONostrEvent(createInsight({}, 'USDT_TRANSFER'), TEST_KIND_RANGE);

            assert.equal(prepared.kind, 6502);
            assert.equal(prepared.parsedContent.eventType, 'usdt_transfer');
            assert.ok(prepared.tags.some((tag) => tag[1] === 'event:usdt_transfer'));
        },
    },
    {
        name: 'exposes client stats and narrower transfer helpers',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
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

            const trxEvents: string[] = [];
            const usdtEvents: string[] = [];

            client.onTRXTransfer((event) => trxEvents.push(event.parsedContent.eventType));
            client.onUSDTTransfer((event) => usdtEvents.push(event.parsedContent.eventType));

            await publisher.connect();
            await client.connect();

            await publisher.publish(createInsight({}, 'TRX_TRANSFER'));
            await publisher.publish(createInsight({}, 'USDT_TRANSFER'));
            await publisher.flush();

            assert.deepEqual(trxEvents, ['trx_transfer']);
            assert.deepEqual(usdtEvents, ['usdt_transfer']);
            assert.equal(client.getStats().activeRelayCount, 1);

            client.close();
            publisher.stop();
            void hub;
        },
    },
];
