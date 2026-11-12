/**
 * Reads a running TRONostr API and writes a screenshot-free, numbers-only summary of its history
 * and dashboard endpoints to samples/. Read-only: it only issues GET requests.
 *
 *   npm run report:history -- --url http://127.0.0.1:8788 [--label live-run]
 */
import * as fs from 'fs';
import * as path from 'path';

function arg(name: string, fallback: string) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function getJson(base: string, p: string) {
    const r = await fetch(base + p);
    return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null, bytes: Number(r.headers.get('content-length') ?? 0) };
}

async function main() {
    const base = arg('url', 'http://127.0.0.1:8788').replace(/\/$/, '');
    const label = arg('label', 'history-run');
    const now = new Date();

    const [health, status, stats, trends, summary, history, labels] = await Promise.all([
        getJson(base, '/health'),
        getJson(base, '/api/v1/status'),
        getJson(base, '/api/v1/history/stats'),
        getJson(base, '/api/v1/trends?hours=3'),
        getJson(base, '/api/v1/summary'),
        getJson(base, '/api/v1/history?limit=3'),
        getJson(base, '/api/v1/labels'),
    ]);
    const dash = await fetch(base + '/');
    const dashHtml = await dash.text();
    const assets = await Promise.all(['/assets/dashboard.js', '/assets/dashboard.css'].map(async (a) => {
        const r = await fetch(base + a);
        return { path: a, status: r.status, bytes: (await r.text()).length };
    }));

    const nonEmpty = (trends.body?.buckets ?? []).filter((b: any) => b.blocks > 0);
    const totals = nonEmpty.reduce((acc: Record<string, number>, b: any) => {
        for (const [k, v] of Object.entries(b)) if (typeof v === 'number' && k !== 'hour') acc[k] = Math.round(((acc[k] ?? 0) + v) * 1e6) / 1e6;
        return acc;
    }, {});

    const report = {
        note: 'Numbers read from a locally running TRONostr instance against public TRON mainnet (TronGrid, read-only, no API key, no Nostr publishing). Nothing here is synthetic.',
        generatedAtUtc: now.toISOString(),
        generatedAtEastern: now.toLocaleString('en-US', { timeZone: 'America/New_York' }) + ' ET',
        apiBase: base,
        uptimeSeconds: health.body?.uptimeSeconds,
        latestBlockSeen: status.body?.status?.latestBlockSeen ?? null,
        runtimeEventCounts: status.body?.status?.eventTypeCounts ?? null,
        history: stats.body?.history ?? null,
        hourlyBucketsWithData: nonEmpty,
        totalsAcrossBuckets: totals,
        summaryAllStored: summary.body?.summary ? {
            windowEvents: summary.body.summary.windowEvents,
            blocks: summary.body.summary.blocks,
            countsByType: summary.body.summary.countsByType,
            transferVolume: summary.body.summary.transferVolume,
            resourceDelegation: summary.body.summary.resourceDelegation,
            exchangeFlows: summary.body.summary.exchangeFlows,
        } : null,
        historySample: (history.body?.events ?? []).map((e: any) => ({ id: e.id, created_at: e.created_at, eventType: e.event.eventType, asset: e.event.asset ?? null, tx: e.event.transaction?.hash ?? null })),
        dashboard: {
            status: dash.status,
            bytes: dashHtml.length,
            hasTitle: dashHtml.includes('The Tron Report'),
            hasNonAffiliationNotice: dashHtml.includes('not affiliated with'),
            csp: dash.headers.get('content-security-policy'),
            assets,
        },
        publicLabelsEnabled: labels.body?.publicLabelsEnabled ?? null,
        endpointStatus: { health: health.status, status: status.status, stats: stats.status, trends: trends.status, summary: summary.status, history: history.status, labels: labels.status },
    };

    const outDir = path.resolve(__dirname, '..', 'samples');
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, `${now.toISOString().replace(/[:.]/g, '-')}-${label}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
    console.log(file);
    console.log(JSON.stringify({ history: report.history, totals, dashboard: report.dashboard.status }, null, 2));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
