import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { nip19 } from 'nostr-tools';
import { ApiServer } from '../src/api/ApiServer';
import { SqliteEventStore } from '../src/output/SqliteEventStore';
import { EventStore } from '../src/output/EventStore';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { BlockMetricsDetector } from '../src/detectors/BlockMetricsDetector';
import { WhaleTransferDetector } from '../src/detectors/WhaleTransferDetector';
import { ResourceDelegationDetector } from '../src/detectors/ResourceDelegationDetector';
import { ExchangeFlowDetector } from '../src/detectors/ExchangeFlowDetector';
import { hexToBase58, normalizeHexAddress } from '../src/detectors/tronUtils';
import { resolvePublisherKey } from '../src/nostr/publisherKey';
import { PUBLIC_LABELS, mergeLabels } from '../src/labels/publicLabels';
import { resolveStorageConfig } from '../src/config';
import { createBlock, createDelegationTx, createTrxTransferTx, createUsdtTransferTx, OWNER_ADDRESS_HEX, RECIPIENT_ADDRESS_HEX, TEST_KIND_RANGE, TEST_PRIVATE_KEY, TEST_USDT_CONTRACT, withRet } from './fixtures';
import { TronWeb } from 'tronweb';
import { TestCase } from './runner';

// Fixture timestamps: block 1710000000, TRX tx 1710001000, USDT tx 1710002000, delegation 1710004000.
const NOW = 1710007200;

function tmpDb() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tronostr-hist-'));
    return { dir, file: path.join(dir, 'nested', 'h.db') };
}

function activityBlock() {
    const usdt = createUsdtTransferTx(5);
    const block = createBlock(0) as any;
    block.transactions = [
        createTrxTransferTx(1),
        createTrxTransferTx(2),
        usdt,
        createDelegationTx('DelegateResourceContract', 10, 'ENERGY'),
        createDelegationTx('DelegateResourceContract', 10, 'BANDWIDTH'),
        createDelegationTx('UnDelegateResourceContract', 10, 'ENERGY'),
        withRet(createTrxTransferTx(3), 'REVERT'),
    ];
    return block;
}

function fill(store: EventStore) {
    const whale = new WhaleTransferDetector({ trxThreshold: 1000, usdtThreshold: 1000, usdtContract: TEST_USDT_CONTRACT });
    const deleg = new ResourceDelegationDetector({ trxThreshold: 1000 });
    const insights = [
        ...new BlockMetricsDetector({ usdtContract: TEST_USDT_CONTRACT }).onBlock(activityBlock()),
        ...whale.onTransaction(createUsdtTransferTx(5000)),
        ...whale.onTransaction(createUsdtTransferTx(20000)),
        ...whale.onTransaction(createTrxTransferTx(2000)),
        ...deleg.onTransaction(createDelegationTx('DelegateResourceContract', 3000)),
        ...deleg.onTransaction(createDelegationTx('UnDelegateResourceContract', 1000)),
    ];
    for (const insight of insights) store.add(prepareTRONostrEvent(insight, TEST_KIND_RANGE));
}

function get(port: number, p: string): Promise<{ status: number; text: string; body: any; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: p }, (res) => {
            let text = '';
            res.on('data', (c) => (text += c));
            res.on('end', () => {
                let body: any = null;
                try { body = JSON.parse(text); } catch { /* html/css/js */ }
                resolve({ status: res.statusCode ?? 0, text, body, headers: res.headers });
            });
        }).on('error', reject);
    });
}

export const historyCases: TestCase[] = [
    {
        name: 'BlockMetricsDetector counts per-block activity over successful txs only',
        run: () => {
            const insight = new BlockMetricsDetector({ usdtContract: TEST_USDT_CONTRACT }).onBlock(activityBlock())[0];
            assert.deepEqual(insight.content.data.activity, {
                trxTransfers: 2, usdtTransfers: 1, delegations: 2, undelegations: 1, energyDelegations: 1, failedTx: 1,
            });
            assert.equal(insight.content.data.txCount, 7);
            // Without a USDT contract it still works and counts no USDT transfers.
            const plain = new BlockMetricsDetector().onBlock(activityBlock())[0];
            assert.equal((plain.content.data.activity as any).usdtTransfers, 0);
        },
    },
    {
        name: 'SqliteEventStore persists events, skips block rows by default, and reloads on restart',
        run: async () => {
            const { dir, file } = tmpDb();
            try {
                const a = new SqliteEventStore({ path: file, now: () => NOW, pruneIntervalMs: 0 });
                fill(a);
                assert.equal(a.size(), 6, 'ring buffer keeps all events incl. block');
                const stats = a.stats();
                assert.equal(stats.eventRows, 5, 'block_metrics not stored as a row');
                assert.equal(stats.countsByType.usdt_transfer, 2);
                assert.equal(stats.countsByType.block_metrics, undefined);
                await a.close();

                const b = new SqliteEventStore({ path: file, now: () => NOW, pruneIntervalMs: 0 });
                assert.equal(b.size(), 5, 'reloaded stored rows into the ring buffer');
                assert.equal(b.query({ eventType: 'usdt_transfer', limit: 1 })[0].event.data.amount, 20000);
                await b.close();

                const c = new SqliteEventStore({ path: ':memory:', now: () => NOW, pruneIntervalMs: 0, storeBlockMetrics: true });
                fill(c);
                assert.equal(c.stats().eventRows, 6);
                await c.close();
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        },
    },
    {
        name: 'SqliteEventStore builds zero-filled hourly aggregates',
        run: async () => {
            const s = new SqliteEventStore({ path: ':memory:', now: () => NOW, pruneIntervalMs: 0 });
            fill(s);
            const buckets = s.hourly({ hours: 3 });
            assert.equal(buckets.length, 3);
            assert.deepEqual(buckets.map((b) => b.hour), [1710000000, 1710003600, 1710007200]);
            const [h0, h1, h2] = buckets;
            assert.equal(h0.blocks, 1);
            assert.equal(h0.txCount, 7);
            assert.equal(h0.delegations, 2);
            assert.equal(h0.undelegations, 1);
            assert.equal(h0.energyDelegations, 1);
            assert.equal(h0.trxTransfers, 2);
            assert.equal(h0.usdtTransfers, 1);
            assert.equal(h0.whaleUsdtCount, 2);
            assert.equal(h0.whaleUsdtVolume, 25000);
            assert.equal(h0.whaleTrxCount, 1);
            assert.equal(h0.whaleTrxVolume, 2000);
            assert.equal(h1.whaleDelegationCount, 1);
            assert.equal(h1.whaleDelegatedTrx, 3000);
            assert.equal(h1.whaleUndelegationCount, 1);
            assert.equal(h1.whaleUndelegatedTrx, 1000);
            assert.equal(h2.blocks, 0);
            assert.equal(h2.hourIso, '2024-03-09T18:00:00.000Z');
            // hours is clamped to the retention window
            assert.equal(s.hourly({ hours: 10_000 }).length, 30 * 24);
            await s.close();
        },
    },
    {
        name: 'SqliteEventStore history filters and paginates newest-first',
        run: async () => {
            const s = new SqliteEventStore({ path: ':memory:', now: () => NOW, pruneIntervalMs: 0 });
            fill(s);
            const all = s.history({});
            assert.equal(all.length, 5);
            assert.ok(all[0].id > all[1].id);
            assert.equal(s.history({ eventType: 'usdt_transfer' }).length, 2);
            assert.equal(s.history({ asset: 'usdt' }).length, 2);
            assert.equal(s.history({ minSeverity: 'high' }).length, 1);
            assert.equal(s.history({ from: 1710003600 }).length, 2);
            assert.equal(s.history({ to: 1710001500 }).length, 1);
            const page1 = s.history({ limit: 2 });
            const page2 = s.history({ limit: 2, before: page1[1].id });
            assert.equal(page2.length, 2);
            assert.ok(page2[0].id < page1[1].id);
            await s.close();
        },
    },
    {
        name: 'SqliteEventStore prunes events and hourly buckets past retention',
        run: async () => {
            let now = NOW;
            const s = new SqliteEventStore({ path: ':memory:', retentionDays: 1, now: () => now, pruneIntervalMs: 0 });
            fill(s);
            assert.deepEqual(s.prune(), { eventsDeleted: 0, hoursDeleted: 0 });
            now = 1710003600 + 86400; // removes events and the hour bucket before 1710003600; keeps delegations
            const r = s.prune();
            assert.equal(r.eventsDeleted, 3);
            assert.equal(r.hoursDeleted, 1);
            assert.equal(s.stats().eventRows, 2);
            assert.equal(s.stats().lastPrune?.eventsDeleted, 3);
            // Constructor prunes too: a fresh store far in the future sees nothing.
            await s.close();
            const { dir, file } = tmpDb();
            try {
                const a = new SqliteEventStore({ path: file, now: () => NOW, pruneIntervalMs: 0 });
                fill(a);
                await a.close();
                const b = new SqliteEventStore({ path: file, retentionDays: 7, now: () => NOW + 8 * 86400, pruneIntervalMs: 0 });
                assert.equal(b.stats().eventRows, 0);
                assert.equal(b.stats().hourlyRows, 0);
                await b.close();
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        },
    },
    {
        name: 'ApiServer serves history, trends, stats, labels and the dashboard',
        run: async () => {
            const store = new SqliteEventStore({ path: ':memory:', now: () => NOW, pruneIntervalMs: 0 });
            fill(store);
            const api = new ApiServer({ store, history: store, host: '127.0.0.1', port: 0, publicLabelsEnabled: true });
            const { port } = await api.listen();
            try {
                const h = await get(port, '/api/v1/history?type=usdt_transfer&limit=1');
                assert.equal(h.status, 200);
                assert.equal(h.body.count, 1);
                assert.equal(h.body.events[0].event.data.amount, 20000);
                assert.equal(typeof h.body.nextBefore, 'number');
                const h2 = await get(port, `/api/v1/history?type=usdt_transfer&before=${h.body.nextBefore}`);
                assert.equal(h2.body.events[0].event.data.amount, 5000);
                assert.equal((await get(port, '/api/v1/history?from=-5')).status, 400);
                assert.equal((await get(port, '/api/v1/history?minSeverity=nope')).status, 400);

                const t = await get(port, '/api/v1/trends?hours=3');
                assert.equal(t.status, 200);
                assert.equal(t.body.buckets.length, 3);
                assert.equal(t.body.buckets[0].whaleUsdtVolume, 25000);
                assert.equal(t.body.retentionDays, 30);
                assert.equal((await get(port, '/api/v1/trends?hours=abc')).status, 400);

                const st = await get(port, '/api/v1/history/stats');
                assert.equal(st.body.history.eventRows, 5);
                assert.equal(st.body.history.path, ':memory:');

                const labels = await get(port, '/api/v1/labels');
                assert.equal(labels.body.publicLabelsEnabled, true);
                assert.equal(labels.body.labels.length, PUBLIC_LABELS.length);

                const page = await get(port, '/');
                assert.equal(page.status, 200);
                assert.match(String(page.headers['content-type']), /text\/html/);
                assert.match(String(page.headers['content-security-policy']), /script-src 'self'/);
                assert.match(page.text, /<h1>TRONostr<\/h1>/);
                assert.doesNotMatch(page.text, /Tron Report/, 'dashboard carries no Tron Report branding');
                assert.match(page.text, /not affiliated with/);
                const js = await get(port, '/assets/dashboard.js');
                assert.match(String(js.headers['content-type']), /javascript/);
                assert.doesNotMatch(js.text, /innerHTML/, 'dashboard must not inject API strings as HTML');
                assert.equal((await get(port, '/assets/dashboard.css')).status, 200);
                assert.equal((await get(port, '/health')).body.history, true);
            } finally {
                await api.close();
                await store.close();
            }
        },
    },
    {
        name: 'ApiServer returns 501 for history routes without storage and can hide the dashboard',
        run: async () => {
            const api = new ApiServer({ store: new EventStore(), host: '127.0.0.1', port: 0, dashboard: false });
            const { port } = await api.listen();
            try {
                assert.equal((await get(port, '/api/v1/history')).status, 501);
                assert.equal((await get(port, '/api/v1/trends')).status, 501);
                assert.equal((await get(port, '/api/v1/history/stats')).status, 501);
                assert.equal((await get(port, '/')).status, 404);
                assert.equal((await get(port, '/api/v1/labels')).body.publicLabelsEnabled, false);
            } finally {
                await api.close();
            }
        },
    },
    {
        name: 'resolvePublisherKey reads hex, nsec and key files from env and never echoes bad values',
        run: () => {
            assert.equal(resolvePublisherKey({}), undefined);
            const hex = resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: TEST_PRIVATE_KEY })!;
            assert.equal(hex.secretHex, TEST_PRIVATE_KEY);
            assert.equal(hex.sourceVar, 'TRONOSTR_PUBLISHER_KEY');
            assert.match(hex.npub, /^npub1/);
            assert.equal(hex.pubkeyHex.length, 64);

            const nsec = nip19.nsecEncode(Buffer.from(TEST_PRIVATE_KEY, 'hex'));
            assert.equal(resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: nsec })!.secretHex, TEST_PRIVATE_KEY);

            // Preferred var wins over the legacy one.
            const both = resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: TEST_PRIVATE_KEY, NOSTR_PRIVATE_KEY: '2'.repeat(64) })!;
            assert.equal(both.secretHex, TEST_PRIVATE_KEY);
            assert.equal(resolvePublisherKey({ NOSTR_PRIVATE_KEY: '2'.repeat(64) })!.sourceVar, 'NOSTR_PRIVATE_KEY');

            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tronostr-key-'));
            try {
                const f = path.join(dir, 'k');
                fs.writeFileSync(f, `${TEST_PRIVATE_KEY}\n`);
                assert.equal(resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY_FILE: f })!.sourceVar, 'TRONOSTR_PUBLISHER_KEY_FILE');
                assert.throws(() => resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY_FILE: path.join(dir, 'missing') }), /missing file/);
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }

            const secretLooking = 'abc123-not-a-key-but-maybe-a-seed-phrase';
            assert.throws(() => resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: secretLooking }), (err: Error) => {
                assert.match(err.message, /64-character hex/);
                assert.ok(!err.message.includes(secretLooking));
                return true;
            });
            assert.throws(() => resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: 'nsec1invalid' }), /valid nsec1/);
            assert.throws(() => resolvePublisherKey({ TRONOSTR_PUBLISHER_KEY: '0'.repeat(64) }), /all zeros/);
        },
    },
    {
        name: 'bundled public labels are valid, cited, and merge under operator labels',
        run: () => {
            assert.equal(PUBLIC_LABELS.length, 13);
            const seen = new Set<string>();
            for (const l of PUBLIC_LABELS) {
                assert.equal(hexToBase58(normalizeHexAddress(l.address)), l.address, `round-trips ${l.address}`);
                assert.match(String(l.source), /Tronscan public address tag/);
                assert.equal(l.explorerUrl, `https://tronscan.org/#/address/${l.address}`);
                assert.ok(!seen.has(l.address));
                seen.add(l.address);
            }
            assert.equal(mergeLabels([], false).length, 0);
            assert.equal(mergeLabels([], true).length, 13);
            const binance = PUBLIC_LABELS.find((l) => l.label === 'Binance 3')!;
            const merged = mergeLabels([{ address: binance.address, label: 'Mine', source: 'me' }], true);
            assert.equal(merged.length, 13);
            assert.equal(merged.find((l) => l.address === binance.address)!.label, 'Mine');
        },
    },
    {
        name: 'ExchangeFlowDetector detects inflow to a bundled public label',
        run: () => {
            const binance = PUBLIC_LABELS.find((l) => l.label === 'Binance 3')!;
            const detector = new ExchangeFlowDetector({ addresses: mergeLabels([], true), trxThreshold: 100, usdtThreshold: 100, usdtContract: TEST_USDT_CONTRACT });
            const tx = createTrxTransferTx(500) as any;
            tx.raw_data.contract[0].parameter.value.to_address = TronWeb.address.toHex(binance.address).toLowerCase();
            const [insight] = detector.onTransaction(tx);
            assert.equal(insight.content.data.direction, 'inflow');
            assert.equal(insight.content.data.entity, 'Binance 3');
            assert.match(String(insight.content.data.labelSource), /Tronscan/);
            assert.equal(detector.onTransaction(createTrxTransferTx(500)).length, 0, 'unlabeled addresses ignored');
            void OWNER_ADDRESS_HEX; void RECIPIENT_ADDRESS_HEX;
        },
    },
    {
        name: 'resolveStorageConfig applies env overrides and validates retention',
        run: () => {
            assert.deepEqual(resolveStorageConfig({}, {}), { enabled: true, path: './storage/tronostr.db', retentionDays: 30, storeBlockMetrics: false });
            const c = resolveStorageConfig({ storage: { sqlite: { enabled: true, retentionDays: 7, storeBlockMetrics: true } } }, { TRONOSTR_DB_PATH: '/data/x.db', TRONOSTR_RETENTION_DAYS: '14' });
            assert.deepEqual(c, { enabled: true, path: '/data/x.db', retentionDays: 14, storeBlockMetrics: true });
            assert.equal(resolveStorageConfig({ storage: { sqlite: { enabled: false } } }, {}).enabled, false);
            assert.equal(resolveStorageConfig({}, { TRONOSTR_HISTORY: 'off' }).enabled, false);
            assert.throws(() => resolveStorageConfig({}, { TRONOSTR_RETENTION_DAYS: '0' }), /between 1 and 365/);
            assert.throws(() => resolveStorageConfig({ storage: { sqlite: { retentionDays: 'x' } } }, {}), /between 1 and 365/);
        },
    },
    {
        name: 'summary keeps full exchange labels that contain colons',
        run: () => {
            const kraken = PUBLIC_LABELS.find((l) => l.label === 'Kraken: Hot Wallet')!;
            const detector = new ExchangeFlowDetector({ addresses: mergeLabels([], true), trxThreshold: 100, usdtThreshold: 100, usdtContract: TEST_USDT_CONTRACT });
            const tx = createTrxTransferTx(500) as any;
            tx.raw_data.contract[0].parameter.value.to_address = TronWeb.address.toHex(kraken.address).toLowerCase();
            const store = new EventStore();
            for (const insight of detector.onTransaction(tx)) store.add(prepareTRONostrEvent(insight, TEST_KIND_RANGE));
            const flows = store.summary().exchangeFlows;
            const entry = flows['Kraken: Hot Wallet:TRX'];
            assert.ok(entry, 'keyed by entity:asset');
            assert.equal(entry.entity, 'Kraken: Hot Wallet');
            assert.equal(entry.inflow, 500);
        },
    },
    {
        name: 'dashboard renders chart labels as HTML and does not split entity names',
        run: () => {
            const { DASHBOARD_JS, DASHBOARD_CSS } = require('../src/dashboard/assets');
            assert.doesNotMatch(DASHBOARD_JS, /createElementNS\(NS,\s*'text'\)/, 'no SVG <text> inside the stretched chart');
            assert.match(DASHBOARD_JS, /'chart-label'/);
            assert.match(DASHBOARD_CSS, /\.chart-label\{/);
            assert.doesNotMatch(DASHBOARD_JS, /split\(':'\)/);
            assert.match(DASHBOARD_JS, /f\.entity/);
        },
    },
];
