import assert from 'node:assert/strict';
import * as http from 'http';
import { ApiServer } from '../src/api/ApiServer';
import { EventStore } from '../src/output/EventStore';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { ResourceDelegationDetector } from '../src/detectors/ResourceDelegationDetector';
import { WhaleTransferDetector } from '../src/detectors/WhaleTransferDetector';
import { BlockMetricsDetector } from '../src/detectors/BlockMetricsDetector';
import { createBlock, createDelegationTx, createTrxTransferTx, createUsdtTransferTx, TEST_KIND_RANGE, TEST_USDT_CONTRACT } from './fixtures';
import { TestCase } from './runner';

function fill(store: EventStore) {
    const whale = new WhaleTransferDetector({ trxThreshold: 1000, usdtThreshold: 1000, usdtContract: TEST_USDT_CONTRACT });
    const deleg = new ResourceDelegationDetector({ trxThreshold: 1000 });
    const insights = [
        ...new BlockMetricsDetector().onBlock(createBlock(3)),
        ...whale.onTransaction(createUsdtTransferTx(5000)),
        ...whale.onTransaction(createUsdtTransferTx(20000)),
        ...whale.onTransaction(createTrxTransferTx(2000)),
        ...deleg.onTransaction(createDelegationTx('DelegateResourceContract', 3000)),
        ...deleg.onTransaction(createDelegationTx('UnDelegateResourceContract', 1000)),
    ];
    for (const insight of insights) store.add(prepareTRONostrEvent(insight, TEST_KIND_RANGE));
}

function get(port: number, path: string, method = 'GET'): Promise<{ status: number; body: any; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path, method }, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: body ? JSON.parse(body) : null, headers: res.headers }));
        });
        req.on('error', reject);
        req.end();
    });
}

export const apiCases: TestCase[] = [
    {
        name: 'EventStore summarises volumes, top addresses, and delegations',
        run: () => {
            const store = new EventStore();
            fill(store);
            const s = store.summary();
            assert.equal(s.windowEvents, 6);
            assert.equal(s.blocks.count, 1);
            assert.equal(s.blocks.totalTx, 3);
            assert.deepEqual(s.transferVolume.USDT, { count: 2, total: 25000, largest: 20000 });
            assert.equal(s.transferVolume.TRX.total, 2000);
            assert.equal(s.topSenders[0].total, 25000);
            assert.deepEqual(s.resourceDelegation.ENERGY, { delegatedTrx: 3000, undelegatedTrx: 1000, count: 2 });
        },
    },
    {
        name: 'EventStore is a bounded ring buffer with newest-first filtered queries',
        run: () => {
            const store = new EventStore({ capacity: 3 });
            fill(store);
            assert.equal(store.size(), 3);
            const latest = store.query({ limit: 1 });
            assert.equal(latest[0].event.eventType, 'resource_delegation');
            assert.equal(store.query({ eventType: 'trx_transfer' }).length, 1);
            assert.equal(store.query({ asset: 'usdt' }).length, 0);
        },
    },
    {
        name: 'ApiServer serves health, events, summary, schema and rejects writes',
        run: async () => {
            const store = new EventStore();
            fill(store);
            const api = new ApiServer({ store, port: 0, getStatus: () => undefined });
            const { port } = await api.listen();
            try {
                const health = await get(port, '/health');
                assert.equal(health.status, 200);
                assert.equal(health.body.storedEvents, 6);
                assert.equal(health.headers['access-control-allow-origin'], '*');

                const usdt = await get(port, '/api/v1/events?type=usdt_transfer&limit=1');
                assert.equal(usdt.body.count, 1);
                assert.equal(usdt.body.events[0].event.data.amount, 20000);

                const high = await get(port, '/api/v1/events?minSeverity=high');
                assert.equal(high.body.count, 1);

                const summary = await get(port, '/api/v1/summary?top=1');
                assert.equal(summary.body.summary.topReceivers.length, 1);

                const schema = await get(port, '/api/v1/schema');
                assert.equal(schema.body.kinds.resource_delegation, 6503);
                assert.equal(schema.body.kinds.exchange_flow, 6504);

                assert.equal((await get(port, '/api/v1/events?limit=-1')).status, 400);
                assert.equal((await get(port, '/api/v1/events?minSeverity=bogus')).status, 400);
                assert.equal((await get(port, '/nope')).status, 404);
                assert.equal((await get(port, '/api/v1/events', 'POST')).status, 405);
            } finally {
                await api.close();
            }
        },
    },
];
