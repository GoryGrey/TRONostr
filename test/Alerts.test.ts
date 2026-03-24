import assert from 'node:assert/strict';
import { TRONostrClient } from '../src/Client';
import { createInsight, TEST_KIND_RANGE } from './fixtures';
import { createRelayTestKit } from './helpers';
import { TestCase } from './runner';

export const alertCases: TestCase[] = [
    {
        name: 'high and critical alerts are surfaced',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            const severities: string[] = [];

            await client.connect();
            client.onAlerts((event) => {
                severities.push(event.parsedContent.severity);
            });

            hub.publish({
                kind: 6501,
                created_at: 1710000000,
                tags: [],
                content: JSON.stringify(createInsight({ severity: 'high' }).content),
            });

            hub.publish({
                kind: 6502,
                created_at: 1710000001,
                tags: [],
                content: JSON.stringify(createInsight({ severity: 'critical' }, 'USDT_TRANSFER').content),
            });

            assert.deepEqual(severities, ['high', 'critical']);
        },
    },
    {
        name: 'lower-severity events do not trigger alerts',
        run: async () => {
            const { hub, connectRelay } = createRelayTestKit();
            const client = new TRONostrClient({
                relays: ['memory://tronostr'],
                kindRange: TEST_KIND_RANGE,
                connectRelay,
            });

            let count = 0;

            await client.connect();
            client.onAlerts(() => {
                count += 1;
            });

            hub.publish({
                kind: 6501,
                created_at: 1710000000,
                tags: [],
                content: JSON.stringify(createInsight({ severity: 'medium' }).content),
            });

            hub.publish({
                kind: 6502,
                created_at: 1710000001,
                tags: [],
                content: JSON.stringify(createInsight({ severity: 'low' }, 'USDT_TRANSFER').content),
            });

            assert.equal(count, 0);
        },
    },
];
