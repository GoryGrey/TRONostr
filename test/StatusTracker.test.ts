import assert from 'node:assert/strict';
import { TestCase } from './runner';
import { TRONostrStatusTracker } from '../src/runtime/StatusTracker';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { createInsight, TEST_KIND_RANGE } from './fixtures';

export const statusTrackerCases: TestCase[] = [
    {
        name: 'tracks latest block, processed events, and alerts',
        run: () => {
            const tracker = new TRONostrStatusTracker();

            tracker.recordBlock(123);
            tracker.recordEvent(prepareTRONostrEvent(createInsight({}, 'TRON_BLOCK'), TEST_KIND_RANGE));
            tracker.recordEvent(prepareTRONostrEvent(createInsight({ severity: 'high' }, 'USDT_TRANSFER'), TEST_KIND_RANGE));

            const snapshot = tracker.getSnapshot();
            assert.equal(snapshot.latestBlockSeen, 10);
            assert.equal(snapshot.eventsProcessed, 2);
            assert.equal(snapshot.alertsSurfaced, 1);
            assert.equal(snapshot.lastEventType, 'usdt_transfer');
        },
    },
];
