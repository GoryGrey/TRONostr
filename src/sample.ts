/**
 * Live, read-only sample capture against TRON mainnet.
 *
 *   npm run sample -- --seconds 120 --usdt 10000 --trx 100000 --delegation 100000
 *
 * Polls public TronGrid (TRON_PRO_API_KEY optional), runs every enabled detector, serves the JSON API
 * on an ephemeral local port, queries it over HTTP, and writes everything to ./samples/ with
 * timestamped filenames. It never signs, publishes to Nostr, or sends transactions.
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { Watcher } from './tron/Watcher';
import { TRONostrRuntime } from './runtime/TRONostrRuntime';
import { TRONostrStatusTracker } from './runtime/StatusTracker';
import { EventStore } from './output/EventStore';
import { JsonlFileOutput } from './output/JsonlFileOutput';
import { ApiServer } from './api/ApiServer';
import { buildDetectors, loadConfig } from './config';
import { formatEventSummary } from './cli/format';

dotenv.config();

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

function getJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let body = '';
            res.on('data', (c) => (body += c));
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function easternTime(d: Date) {
    return d.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'long' });
}

async function main() {
    const config = loadConfig();
    const seconds = Number(arg('seconds') ?? 90);
    const outDir = path.resolve(arg('out') ?? 'samples');
    const d = config.detectors;
    if (arg('usdt')) d.whaleTransfer.usdtThreshold = Number(arg('usdt'));
    if (arg('trx')) d.whaleTransfer.trxThreshold = Number(arg('trx'));
    if (arg('delegation')) d.resourceDelegation.trxThreshold = Number(arg('delegation'));

    const started = new Date();
    const stamp = started.toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(outDir, { recursive: true });
    const eventsPath = path.join(outDir, `${stamp}-mainnet-events.jsonl`);
    const summaryPath = path.join(outDir, `${stamp}-mainnet-summary.json`);

    const store = new EventStore({ capacity: 100000 });
    const statusTracker = new TRONostrStatusTracker();
    const watcher = new Watcher({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        apiKey: process.env.TRON_PRO_API_KEY || undefined,
        pollIntervalMs: config.tron.pollIntervalMs,
        maxBackoffMs: config.tron.maxBackoffMs,
        backoffMultiplier: config.tron.backoffMultiplier,
        jitterMs: config.tron.jitterMs,
    });
    const runtime = new TRONostrRuntime({
        watcher,
        detectors: buildDetectors(config, (m) => console.log(m)),
        outputs: [store, new JsonlFileOutput({ path: eventsPath })],
        statusTracker,
        kindRange: config.nostr.kindRange,
    });

    let errors = 0;
    let backoffs = 0;
    runtime.on('error', (e) => { errors += 1; console.error('[sample] error:', (e as Error)?.message ?? e); });
    runtime.on('state', (s) => { if (s.state === 'backoff') backoffs += 1; });
    runtime.on('event', (e) => { if (e.parsedContent.eventType !== 'block_metrics') console.log(`[event] ${formatEventSummary(e)}`); });

    const api = new ApiServer({ store, getStatus: () => runtime.getStatusSnapshot(), port: 0, kindRange: config.nostr.kindRange });
    const { host, port } = await api.listen();
    console.log(`Sampling TRON mainnet for ${seconds}s via ${config.tron.fullHost} (API key: ${process.env.TRON_PRO_API_KEY ? 'yes' : 'none'})`);
    console.log(`API: http://${host}:${port}/api/v1/summary`);

    await runtime.start();
    await new Promise((r) => setTimeout(r, seconds * 1000));
    await runtime.stop();
    const ended = new Date();

    const base = `http://${host}:${port}`;
    const apiCapture = {
        health: await getJson(`${base}/health`),
        summary: await getJson(`${base}/api/v1/summary?top=5`),
        latestAlerts: await getJson(`${base}/api/v1/events?minSeverity=high&limit=10`),
        latestUsdt: await getJson(`${base}/api/v1/events?type=usdt_transfer&limit=5`),
        latestDelegations: await getJson(`${base}/api/v1/events?type=resource_delegation&limit=5`),
    };
    await api.close();

    const output = {
        note: 'Real data captured live from TRON mainnet by TRONostr (read-only). Nothing in this file is synthetic.',
        capture: {
            startedAtUtc: started.toISOString(),
            endedAtUtc: ended.toISOString(),
            startedAtEastern: easternTime(started),
            endedAtEastern: easternTime(ended),
            requestedSeconds: seconds,
            source: config.tron.fullHost,
            apiKeyUsed: Boolean(process.env.TRON_PRO_API_KEY),
            nostrPublishing: false,
            thresholds: {
                whaleTrx: d.whaleTransfer.trxThreshold,
                whaleUsdt: d.whaleTransfer.usdtThreshold,
                delegationStakedTrx: d.resourceDelegation?.enabled ? d.resourceDelegation.trxThreshold : null,
                exchangeFlow: d.exchangeFlow?.enabled ? 'enabled' : 'disabled (no labeled addresses configured)',
            },
            pollingErrors: errors,
            backoffs,
            eventsFile: path.basename(eventsPath),
        },
        status: runtime.getStatusSnapshot(),
        api: apiCapture,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(output, null, 2) + '\n');
    console.log(`Wrote ${eventsPath}`);
    console.log(`Wrote ${summaryPath}`);
    process.exit(0);
}

main().catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
});
