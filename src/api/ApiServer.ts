import * as http from 'http';
import { URL } from 'url';
import { EventStore } from '../output/EventStore';
import { RuntimeStatusSnapshot } from '../runtime/StatusTracker';
import { getDefaultKinds } from '../schema';

export interface ApiServerOptions {
    store: EventStore;
    getStatus?: () => RuntimeStatusSnapshot | undefined;
    host?: string;
    port?: number;
    /** Value for Access-Control-Allow-Origin. Default "*" (read-only public data). */
    corsOrigin?: string;
    kindRange?: { start: number; end: number };
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

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return send(405, { error: 'method not allowed; this API is read-only' });
        }

        const num = (name: string) => {
            const raw = url.searchParams.get(name);
            if (raw === null || raw === '') return undefined;
            const n = Number(raw);
            return Number.isFinite(n) && n >= 0 ? n : NaN;
        };

        switch (url.pathname) {
            case '/health':
                return send(200, { ok: true, uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000), storedEvents: this.options.store.size() });
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
                return send(404, { error: 'not found', endpoints: ['/health', `/api/${VERSION}/status`, `/api/${VERSION}/events`, `/api/${VERSION}/summary`, `/api/${VERSION}/schema`] });
        }
    }
}
