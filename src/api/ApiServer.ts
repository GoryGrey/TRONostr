import * as http from 'http';
import { URL } from 'url';
import { EventStore } from '../output/EventStore';
import { RuntimeStatusSnapshot } from '../runtime/StatusTracker';
import { getDefaultKinds } from '../schema';
import { HistoryQuery, HistoryRow, HistoryStats, HourlyBucket } from '../output/SqliteEventStore';
import { DASHBOARD_CSS, DASHBOARD_HTML, DASHBOARD_JS } from '../dashboard/assets';
import { PUBLIC_LABELS } from '../labels/publicLabels';

/** Persistent history backend (implemented by SqliteEventStore). */
export interface HistoryProvider {
    history(q: HistoryQuery): HistoryRow[];
    hourly(options: { hours?: number }): HourlyBucket[];
    stats(): HistoryStats;
    readonly retentionDays: number;
}

export interface ApiServerOptions {
    store: EventStore;
    getStatus?: () => RuntimeStatusSnapshot | undefined;
    host?: string;
    port?: number;
    /** Value for Access-Control-Allow-Origin. Default "*" (read-only public data). */
    corsOrigin?: string;
    kindRange?: { start: number; end: number };
    /** Enables /api/v1/history, /api/v1/history/stats and /api/v1/trends. */
    history?: HistoryProvider;
    /** Serve the static "The Tron Report" dashboard at "/". Default true. */
    dashboard?: boolean;
    /** Report whether bundled public labels are active (for /api/v1/labels). */
    publicLabelsEnabled?: boolean;
}

const VERSION = 'v1';

/**
 * Tiny read-only JSON API over the in-memory EventStore. No dependencies beyond node:http.
 *
 *   GET /health
 *   GET /api/v1/status
 *   GET /api/v1/events?type=usdt_transfer&asset=USDT&minSeverity=high&since=3600&limit=50
 *   GET /api/v1/summary?since=3600&top=5
 *   GET /api/v1/schema
 *   GET /api/v1/history?type=&asset=&minSeverity=&from=&to=&before=&limit=   (needs history)
 *   GET /api/v1/history/stats                                              (needs history)
 *   GET /api/v1/trends?hours=24                                            (needs history)
 *   GET /api/v1/labels
 *   GET /            static dashboard (The Tron Report), plus /assets/*
 */
export class ApiServer {
    private readonly options: ApiServerOptions;
    private server: http.Server | null = null;
    private readonly startedAt = Date.now();

    constructor(options: ApiServerOptions) {
        this.options = options;
    }

    async listen(): Promise<{ host: string; port: number }> {
        const host = this.options.host ?? '127.0.0.1';
        const port = this.options.port ?? 8788;
        this.server = http.createServer((req, res) => this.handle(req, res));
        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(port, host, () => resolve());
        });
        const address = this.server.address();
        return { host, port: typeof address === 'object' && address ? address.port : port };
    }

    async close() {
        if (!this.server) return;
        await new Promise<void>((resolve) => this.server!.close(() => resolve()));
        this.server = null;
    }

    handle(req: http.IncomingMessage, res: http.ServerResponse) {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const send = (status: number, body: unknown) => {
            res.writeHead(status, {
                'content-type': 'application/json; charset=utf-8',
                'access-control-allow-origin': this.options.corsOrigin ?? '*',
                'cache-control': 'no-store',
            });
            res.end(JSON.stringify(body));
        };

        const sendAsset = (type: string, body: string) => {
            res.writeHead(200, {
                'content-type': `${type}; charset=utf-8`,
                'cache-control': 'public, max-age=300',
                'x-content-type-options': 'nosniff',
                'referrer-policy': 'no-referrer',
                'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
            });
            res.end(req.method === 'HEAD' ? undefined : body);
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return send(405, { error: 'method not allowed; this API is read-only' });
        }

        const num = (name: string) => {
            const raw = url.searchParams.get(name);
            if (raw === null || raw === '') return undefined;
            const n = Number(raw);
            return Number.isFinite(n) && n >= 0 ? n : NaN;
        };

        const history = this.options.history;
        const noHistory = () => send(501, { error: 'history storage is not enabled on this instance (storage.sqlite.enabled=false)' });
        const dashboardOn = this.options.dashboard !== false;

        switch (url.pathname) {
            case '/':
            case '/dashboard':
                if (!dashboardOn) break;
                return sendAsset('text/html', DASHBOARD_HTML);
            case '/assets/dashboard.css':
                if (!dashboardOn) break;
                return sendAsset('text/css', DASHBOARD_CSS);
            case '/assets/dashboard.js':
                if (!dashboardOn) break;
                return sendAsset('text/javascript', DASHBOARD_JS);
            case `/api/${VERSION}/history`: {
                if (!history) return noHistory();
                const limit = num('limit');
                const from = num('from');
                const to = num('to');
                const before = num('before');
                if ([limit, from, to, before].some((v) => Number.isNaN(v))) {
                    return send(400, { error: 'limit, from, to and before must be non-negative numbers' });
                }
                const minSeverity = url.searchParams.get('minSeverity') ?? undefined;
                if (minSeverity && !['info', 'low', 'medium', 'high', 'critical'].includes(minSeverity)) {
                    return send(400, { error: 'minSeverity must be one of info, low, medium, high, critical' });
                }
                const rows = history.history({
                    eventType: url.searchParams.get('type') ?? undefined,
                    asset: url.searchParams.get('asset') ?? undefined,
                    minSeverity: minSeverity as any,
                    from,
                    to,
                    before,
                    limit,
                });
                const nextBefore = rows.length ? rows[rows.length - 1].id : null;
                return send(200, { schema: 'tronostr.v1', count: rows.length, nextBefore, events: rows });
            }
            case `/api/${VERSION}/history/stats`:
                if (!history) return noHistory();
                return send(200, { schema: 'tronostr.v1', history: history.stats() });
            case `/api/${VERSION}/trends`: {
                if (!history) return noHistory();
                const hours = num('hours');
                if (Number.isNaN(hours)) {
                    return send(400, { error: 'hours must be a non-negative number' });
                }
                const buckets = history.hourly({ hours });
                return send(200, {
                    schema: 'tronostr.v1',
                    interval: 'hour',
                    timezone: 'UTC',
                    retentionDays: history.retentionDays,
                    notes: {
                        whale: 'whale* fields count only events above the configured detector thresholds',
                        activity: 'blocks, txCount, trxTransfers, usdtTransfers, delegations, undelegations, energyDelegations count ALL successful transactions in blocks seen by this instance',
                        coverage: 'hours before this instance started, or while it was offline, read as zero',
                    },
                    buckets,
                });
            }
            case `/api/${VERSION}/labels`:
                return send(200, {
                    schema: 'tronostr.v1',
                    publicLabelsEnabled: Boolean(this.options.publicLabelsEnabled),
                    note: 'Explorer-attributed public tags with a cited source. Not statements by the entities themselves.',
                    labels: PUBLIC_LABELS,
                });
            case '/health':
                return send(200, { ok: true, uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000), storedEvents: this.options.store.size(), history: Boolean(history) });
            case `/api/${VERSION}/status`:
                return send(200, { schema: 'tronostr.v1', status: this.options.getStatus?.() ?? null, storedEvents: this.options.store.size() });
            case `/api/${VERSION}/schema`:
                return send(200, {
                    schema: 'tronostr.v1',
                    kinds: Object.fromEntries(
                        ['block_metrics', 'trx_transfer', 'usdt_transfer', 'resource_delegation', 'exchange_flow']
                            .map((t, i) => [t, getDefaultKinds(this.options.kindRange ?? { start: 6500 })[i]]),
                    ),
                });
            case `/api/${VERSION}/events`: {
                const limit = num('limit');
                const since = num('since');
                if (Number.isNaN(limit) || Number.isNaN(since)) {
                    return send(400, { error: 'limit and since must be non-negative numbers' });
                }
                const minSeverity = url.searchParams.get('minSeverity') ?? undefined;
                if (minSeverity && !['info', 'low', 'medium', 'high', 'critical'].includes(minSeverity)) {
                    return send(400, { error: 'minSeverity must be one of info, low, medium, high, critical' });
                }
                const events = this.options.store.query({
                    eventType: url.searchParams.get('type') ?? undefined,
                    asset: url.searchParams.get('asset') ?? undefined,
                    minSeverity: minSeverity as any,
                    sinceSeconds: since,
                    limit,
                });
                return send(200, { schema: 'tronostr.v1', count: events.length, events });
            }
            case `/api/${VERSION}/summary`: {
                const since = num('since');
                const top = num('top');
                if (Number.isNaN(since) || Number.isNaN(top)) {
                    return send(400, { error: 'since and top must be non-negative numbers' });
                }
                return send(200, { schema: 'tronostr.v1', summary: this.options.store.summary({ sinceSeconds: since, top }) });
            }
            default:
                break;
        }
        return send(404, {
            error: 'not found',
            endpoints: ['/', '/health', `/api/${VERSION}/status`, `/api/${VERSION}/events`, `/api/${VERSION}/summary`, `/api/${VERSION}/schema`,
                `/api/${VERSION}/history`, `/api/${VERSION}/history/stats`, `/api/${VERSION}/trends`, `/api/${VERSION}/labels`],
        });
    }
}
