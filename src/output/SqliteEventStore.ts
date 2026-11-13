import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync, StatementSync } from 'node:sqlite';
import { PreparedTRONostrEvent } from '../eventEnvelope';
import { EventStore, StoredEvent } from './EventStore';

export interface SqliteEventStoreOptions {
    /** SQLite file path, or ":memory:". */
    path: string;
    /** Days of history to keep (events and hourly aggregates). Default 30, min 1. */
    retentionDays?: number;
    /** In-memory ring buffer size used for /events and /summary. Default 5000. */
    capacity?: number;
    /**
     * Store every block_metrics event as a row. Default false: blocks arrive every ~3s
     * (~28,800/day), so by default they only feed the hourly aggregates.
     */
    storeBlockMetrics?: boolean;
    /** How often to prune expired rows. Default 1h. 0 disables the timer (call prune() yourself). */
    pruneIntervalMs?: number;
    /** Clock, for tests. Returns unix seconds. */
    now?: () => number;
}

export interface HistoryQuery {
    eventType?: string;
    asset?: string;
    minSeverity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    /** Unix seconds, inclusive. */
    from?: number;
    /** Unix seconds, inclusive. */
    to?: number;
    limit?: number;
    /** Return rows with id < before (pagination cursor). */
    before?: number;
}

export interface HistoryRow extends StoredEvent {
    id: number;
}

export interface HourlyBucket {
    hour: number;
    hourIso: string;
    blocks: number;
    txCount: number;
    trxTransfers: number;
    usdtTransfers: number;
    delegations: number;
    undelegations: number;
    energyDelegations: number;
    whaleUsdtCount: number;
    whaleUsdtVolume: number;
    whaleTrxCount: number;
    whaleTrxVolume: number;
    whaleDelegationCount: number;
    whaleDelegatedTrx: number;
    whaleUndelegationCount: number;
    whaleUndelegatedTrx: number;
    exchangeFlowCount: number;
    exchangeInflowUsdt: number;
    exchangeOutflowUsdt: number;
}

export interface HistoryStats {
    path: string;
    retentionDays: number;
    storeBlockMetrics: boolean;
    eventRows: number;
    hourlyRows: number;
    oldestEventAt: number | null;
    newestEventAt: number | null;
    countsByType: Record<string, number>;
    lastPrune: { at: number; eventsDeleted: number; hoursDeleted: number } | null;
}

const SEVERITY_RANK: Record<string, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

const HOURLY_COLUMNS: Array<[keyof HourlyBucket, string]> = [
    ['blocks', 'blocks'],
    ['txCount', 'tx_count'],
    ['trxTransfers', 'trx_transfers'],
    ['usdtTransfers', 'usdt_transfers'],
    ['delegations', 'delegations'],
    ['undelegations', 'undelegations'],
    ['energyDelegations', 'energy_delegations'],
    ['whaleUsdtCount', 'whale_usdt_count'],
    ['whaleUsdtVolume', 'whale_usdt_volume'],
    ['whaleTrxCount', 'whale_trx_count'],
    ['whaleTrxVolume', 'whale_trx_volume'],
    ['whaleDelegationCount', 'whale_delegation_count'],
    ['whaleDelegatedTrx', 'whale_delegated_trx'],
    ['whaleUndelegationCount', 'whale_undelegation_count'],
    ['whaleUndelegatedTrx', 'whale_undelegated_trx'],
    ['exchangeFlowCount', 'exchange_flow_count'],
    ['exchangeInflowUsdt', 'exchange_inflow_usdt'],
    ['exchangeOutflowUsdt', 'exchange_outflow_usdt'],
];

/**
 * Persistent event history on SQLite (node:sqlite, no native build step). It keeps the in-memory
 * ring buffer of EventStore for the live /events and /summary endpoints, and adds:
 *  - an `events` table (raw events, minus per-block telemetry unless storeBlockMetrics is on),
 *  - an `hourly` table of incrementally updated aggregates (whale volume, delegation counts, ...),
 *  - retention pruning of both tables.
 * On startup the most recent rows are reloaded into the ring buffer, so a restart keeps context.
 */
export class SqliteEventStore extends EventStore {
    readonly retentionDays: number;
    readonly storeBlockMetrics: boolean;
    private readonly db: DatabaseSync;
    private readonly dbPath: string;
    private readonly now: () => number;
    private readonly insertStmt: StatementSync;
    private readonly hourlyUpsert: StatementSync;
    private pruneTimer: NodeJS.Timeout | null = null;
    private lastPrune: HistoryStats['lastPrune'] = null;
    private closed = false;

    constructor(options: SqliteEventStoreOptions) {
        super({ capacity: options.capacity });
        this.retentionDays = Math.max(1, Math.floor(options.retentionDays ?? 30));
        this.storeBlockMetrics = Boolean(options.storeBlockMetrics);
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
        this.dbPath = options.path;
        if (options.path !== ':memory:') {
            fs.mkdirSync(path.dirname(path.resolve(options.path)), { recursive: true });
        }
        this.db = new DatabaseSync(options.path);
        this.migrate();

        this.insertStmt = this.db.prepare(`INSERT INTO events
            (created_at, kind, event_type, asset, severity, severity_rank, block_height, tx_hash, amount, tags, content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        const cols = HOURLY_COLUMNS.map(([, c]) => c);
        this.hourlyUpsert = this.db.prepare(`INSERT INTO hourly (hour, ${cols.join(', ')})
            VALUES (?, ${cols.map(() => '?').join(', ')})
            ON CONFLICT(hour) DO UPDATE SET ${cols.map((c) => `${c} = ${c} + excluded.${c}`).join(', ')}`);

        this.reloadRecent();
        this.prune();
        const interval = options.pruneIntervalMs ?? 3_600_000;
        if (interval > 0) {
            this.pruneTimer = setInterval(() => this.prune(), interval);
            this.pruneTimer.unref();
        }
    }

    private migrate() {
        this.db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at INTEGER NOT NULL,
                kind INTEGER NOT NULL,
                event_type TEXT NOT NULL,
                asset TEXT,
                severity TEXT NOT NULL,
                severity_rank INTEGER NOT NULL,
                block_height INTEGER,
                tx_hash TEXT,
                amount REAL,
                tags TEXT NOT NULL,
                content TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
            CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
            CREATE TABLE IF NOT EXISTS hourly (
                hour INTEGER PRIMARY KEY,
                ${HOURLY_COLUMNS.map(([, c]) => `${c} REAL NOT NULL DEFAULT 0`).join(',\n                ')}
            );
        `);
        this.db.prepare(`INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1')`).run();
    }

    private reloadRecent() {
        const rows = this.db.prepare(`SELECT kind, created_at, tags, content FROM events ORDER BY id DESC LIMIT ?`)
            .all(this.capacityHint()) as Array<{ kind: number; created_at: number; tags: string; content: string }>;
        for (const row of rows.reverse()) {
            super.add({ kind: row.kind, created_at: row.created_at, tags: JSON.parse(row.tags), content: row.content, parsedContent: JSON.parse(row.content) });
        }
    }

    private capacityHint() {
        return this.capacity;
    }

    override add(event: PreparedTRONostrEvent) {
        super.add(event);
        if (this.closed) return;
        const e = event.parsedContent;
        const d = e.data as Record<string, any>;
        const isBlock = e.eventType === 'block_metrics';
        if (!isBlock || this.storeBlockMetrics) {
            const amount = d.amount ?? d.stakedTrx;
            this.insertStmt.run(
                event.created_at,
                event.kind,
                e.eventType,
                e.asset ?? null,
                e.severity,
                SEVERITY_RANK[e.severity] ?? 0,
                e.block?.height ?? null,
                e.transaction?.hash ?? null,
                typeof amount === 'number' ? amount : null,
                JSON.stringify(event.tags),
                event.content ?? JSON.stringify(e),
            );
        }
        this.bumpHourly(event);
    }

    private bumpHourly(event: PreparedTRONostrEvent) {
        const e = event.parsedContent;
        const d = e.data as Record<string, any>;
        const inc: Partial<Record<keyof HourlyBucket, number>> = {};
        const amount = Number(d.amount ?? 0);
        switch (e.eventType) {
            case 'block_metrics': {
                const a = d.activity ?? {};
                inc.blocks = 1;
                inc.txCount = Number(d.txCount ?? 0);
                inc.trxTransfers = Number(a.trxTransfers ?? 0);
                inc.usdtTransfers = Number(a.usdtTransfers ?? 0);
                inc.delegations = Number(a.delegations ?? 0);
                inc.undelegations = Number(a.undelegations ?? 0);
                inc.energyDelegations = Number(a.energyDelegations ?? 0);
                break;
            }
            case 'usdt_transfer':
                inc.whaleUsdtCount = 1;
                inc.whaleUsdtVolume = amount;
                break;
            case 'trx_transfer':
                inc.whaleTrxCount = 1;
                inc.whaleTrxVolume = amount;
                break;
            case 'resource_delegation':
                if (d.action === 'delegate') {
                    inc.whaleDelegationCount = 1;
                    inc.whaleDelegatedTrx = Number(d.stakedTrx ?? 0);
                } else {
                    inc.whaleUndelegationCount = 1;
                    inc.whaleUndelegatedTrx = Number(d.stakedTrx ?? 0);
                }
                break;
            case 'exchange_flow':
                inc.exchangeFlowCount = 1;
                if (e.asset === 'USDT' && d.direction === 'inflow') inc.exchangeInflowUsdt = amount;
                if (e.asset === 'USDT' && d.direction === 'outflow') inc.exchangeOutflowUsdt = amount;
                break;
            default:
                return;
        }
        const hour = Math.floor(event.created_at / 3600) * 3600;
        this.hourlyUpsert.run(hour, ...HOURLY_COLUMNS.map(([k]) => inc[k] ?? 0));
    }

    /** Deletes events and hourly buckets older than the retention window. */
    prune(): { eventsDeleted: number; hoursDeleted: number } {
        if (this.closed) return { eventsDeleted: 0, hoursDeleted: 0 };
        const cutoff = this.now() - this.retentionDays * 86400;
        const ev = this.db.prepare(`DELETE FROM events WHERE created_at < ?`).run(cutoff);
        const hr = this.db.prepare(`DELETE FROM hourly WHERE hour < ?`).run(Math.floor(cutoff / 3600) * 3600);
        const result = { eventsDeleted: Number(ev.changes), hoursDeleted: Number(hr.changes) };
        this.lastPrune = { at: this.now(), ...result };
        return result;
    }

    history(q: HistoryQuery = {}): HistoryRow[] {
        const where: string[] = [];
        const params: Array<string | number> = [];
        if (q.eventType) { where.push('event_type = ?'); params.push(q.eventType); }
        if (q.asset) { where.push('asset = ?'); params.push(q.asset.toUpperCase()); }
        if (q.minSeverity) { where.push('severity_rank >= ?'); params.push(SEVERITY_RANK[q.minSeverity] ?? 0); }
        if (q.from !== undefined) { where.push('created_at >= ?'); params.push(Math.floor(q.from)); }
        if (q.to !== undefined) { where.push('created_at <= ?'); params.push(Math.floor(q.to)); }
        if (q.before !== undefined) { where.push('id < ?'); params.push(Math.floor(q.before)); }
        const limit = Math.min(Math.max(Math.floor(q.limit ?? 100), 1), 1000);
        const sql = `SELECT id, kind, created_at, tags, content FROM events ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`;
        const rows = this.db.prepare(sql).all(...params, limit) as Array<{ id: number; kind: number; created_at: number; tags: string; content: string }>;
        return rows.map((r) => ({ id: r.id, kind: r.kind, created_at: r.created_at, tags: JSON.parse(r.tags), event: JSON.parse(r.content) }));
    }

    /** Hourly buckets for the last `hours` hours (ending at the current hour), zero-filled. */
    hourly(options: { hours?: number } = {}): HourlyBucket[] {
        const maxHours = this.retentionDays * 24;
        const hours = Math.min(Math.max(Math.floor(options.hours ?? 24), 1), maxHours);
        const end = Math.floor(this.now() / 3600) * 3600;
        const start = end - (hours - 1) * 3600;
        const rows = this.db.prepare(`SELECT * FROM hourly WHERE hour >= ? AND hour <= ? ORDER BY hour ASC`).all(start, end) as Array<Record<string, number>>;
        const byHour = new Map(rows.map((r) => [Number(r.hour), r]));
        const out: HourlyBucket[] = [];
        for (let h = start; h <= end; h += 3600) {
            const r = byHour.get(h);
            const bucket = { hour: h, hourIso: new Date(h * 1000).toISOString() } as HourlyBucket;
            for (const [k, c] of HOURLY_COLUMNS) {
                (bucket as any)[k] = r ? round(Number(r[c])) : 0;
            }
            out.push(bucket);
        }
        return out;
    }

    stats(): HistoryStats {
        const agg = this.db.prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest, MAX(created_at) AS newest FROM events`).get() as { n: number; oldest: number | null; newest: number | null };
        const hourlyRows = (this.db.prepare(`SELECT COUNT(*) AS n FROM hourly`).get() as { n: number }).n;
        const byType = this.db.prepare(`SELECT event_type, COUNT(*) AS n FROM events GROUP BY event_type`).all() as Array<{ event_type: string; n: number }>;
        return {
            path: this.dbPath === ':memory:' ? ':memory:' : path.basename(this.dbPath),
            retentionDays: this.retentionDays,
            storeBlockMetrics: this.storeBlockMetrics,
            eventRows: Number(agg.n),
            hourlyRows: Number(hourlyRows),
            oldestEventAt: agg.oldest ?? null,
            newestEventAt: agg.newest ?? null,
            countsByType: Object.fromEntries(byType.map((r) => [r.event_type, Number(r.n)])),
            lastPrune: this.lastPrune,
        };
    }

    async close() {
        if (this.closed) return;
        this.closed = true;
        if (this.pruneTimer) clearInterval(this.pruneTimer);
        this.db.close();
    }
}

function round(n: number) {
    return Math.round(n * 1e6) / 1e6;
}
