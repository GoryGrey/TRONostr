import { PreparedTRONostrEvent } from '../eventEnvelope';
import { TRONostrEventType } from '../schema';

export interface StoredEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    event: PreparedTRONostrEvent['parsedContent'];
}

export interface EventQuery {
    eventType?: TRONostrEventType | string;
    asset?: string;
    minSeverity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
    sinceSeconds?: number;
    limit?: number;
}

export interface EventSummary {
    windowEvents: number;
    oldestEventAt: number | null;
    newestEventAt: number | null;
    blocks: { count: number; firstHeight: number | null; lastHeight: number | null; totalTx: number; avgTxPerBlock: number | null };
    countsByType: Record<string, number>;
    transferVolume: Record<string, { count: number; total: number; largest: number }>;
    topSenders: Array<{ address: string; asset: string; total: number; count: number }>;
    topReceivers: Array<{ address: string; asset: string; total: number; count: number }>;
    resourceDelegation: Record<string, { delegatedTrx: number; undelegatedTrx: number; count: number }>;
    /** Keyed by "<entity>:<asset>". Entity labels may themselves contain colons, so read `entity`, not the key. */
    exchangeFlows: Record<string, { entity: string; asset: string; inflow: number; outflow: number; net: number; count: number }>;
}

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 } as const;

/**
 * In-memory ring buffer of prepared events. It is an output transport (deliver) and the read model
 * for the HTTP API, so dashboards (the built-in one, or downstream platforms) can query recent events and a
 * rolled-up summary without running a relay client.
 */
export class EventStore {
    protected readonly capacity: number;
    private readonly events: StoredEvent[] = [];

    constructor(options: { capacity?: number } = {}) {
        this.capacity = Math.max(1, options.capacity ?? 5000);
    }

    async deliver(event: PreparedTRONostrEvent) {
        this.add(event);
    }

    add(event: PreparedTRONostrEvent) {
        this.events.push({ kind: event.kind, created_at: event.created_at, tags: event.tags, event: event.parsedContent });
        if (this.events.length > this.capacity) {
            this.events.splice(0, this.events.length - this.capacity);
        }
    }

    size() {
        return this.events.length;
    }

    query(q: EventQuery = {}): StoredEvent[] {
        const limit = Math.min(Math.max(q.limit ?? 50, 1), 1000);
        const minRank = q.minSeverity ? SEVERITY_RANK[q.minSeverity] : 0;
        const since = q.sinceSeconds !== undefined ? this.latestTimestamp() - q.sinceSeconds : undefined;
        const out: StoredEvent[] = [];
        for (let i = this.events.length - 1; i >= 0 && out.length < limit; i--) {
            const e = this.events[i];
            if (q.eventType && e.event.eventType !== q.eventType) continue;
            if (q.asset && e.event.asset !== q.asset.toUpperCase()) continue;
            if (SEVERITY_RANK[e.event.severity] < minRank) continue;
            if (since !== undefined && e.created_at < since) continue;
            out.push(e);
        }
        return out;
    }

    summary(options: { sinceSeconds?: number; top?: number } = {}): EventSummary {
        const top = options.top ?? 5;
        const since = options.sinceSeconds !== undefined ? this.latestTimestamp() - options.sinceSeconds : undefined;
        const window = since === undefined ? this.events : this.events.filter((e) => e.created_at >= since);

        const countsByType: Record<string, number> = {};
        const transferVolume: EventSummary['transferVolume'] = {};
        const senders = new Map<string, { address: string; asset: string; total: number; count: number }>();
        const receivers = new Map<string, { address: string; asset: string; total: number; count: number }>();
        const resourceDelegation: EventSummary['resourceDelegation'] = {};
        const exchangeFlows: EventSummary['exchangeFlows'] = {};
        const blocks = { count: 0, firstHeight: null as number | null, lastHeight: null as number | null, totalTx: 0, avgTxPerBlock: null as number | null };

        for (const { event } of window) {
            countsByType[event.eventType] = (countsByType[event.eventType] ?? 0) + 1;
            const d = event.data as Record<string, any>;

            if (event.eventType === 'block_metrics' && event.block) {
                blocks.count += 1;
                blocks.totalTx += Number(d.txCount ?? 0);
                blocks.firstHeight = blocks.firstHeight === null ? event.block.height : Math.min(blocks.firstHeight, event.block.height);
                blocks.lastHeight = blocks.lastHeight === null ? event.block.height : Math.max(blocks.lastHeight, event.block.height);
            }

            if ((event.eventType === 'trx_transfer' || event.eventType === 'usdt_transfer') && event.asset) {
                const amount = Number(d.amount ?? 0);
                const v = transferVolume[event.asset] ?? { count: 0, total: 0, largest: 0 };
                v.count += 1;
                v.total = round(v.total + amount);
                v.largest = Math.max(v.largest, amount);
                transferVolume[event.asset] = v;
                bump(senders, `${event.asset}:${d.from}`, String(d.from), event.asset, amount);
                bump(receivers, `${event.asset}:${d.to}`, String(d.to), event.asset, amount);
            }

            if (event.eventType === 'resource_delegation') {
                const r = resourceDelegation[d.resource] ?? { delegatedTrx: 0, undelegatedTrx: 0, count: 0 };
                r.count += 1;
                if (d.action === 'delegate') r.delegatedTrx = round(r.delegatedTrx + Number(d.stakedTrx));
                else r.undelegatedTrx = round(r.undelegatedTrx + Number(d.stakedTrx));
                resourceDelegation[d.resource] = r;
            }

            if (event.eventType === 'exchange_flow' && event.asset) {
                const key = `${d.entity}:${event.asset}`;
                const f = exchangeFlows[key] ?? { entity: String(d.entity), asset: event.asset, inflow: 0, outflow: 0, net: 0, count: 0 };
                f.count += 1;
                if (d.direction === 'inflow') f.inflow = round(f.inflow + Number(d.amount));
                if (d.direction === 'outflow') f.outflow = round(f.outflow + Number(d.amount));
                f.net = round(f.inflow - f.outflow);
                exchangeFlows[key] = f;
            }
        }
        if (blocks.count > 0) {
            blocks.avgTxPerBlock = round(blocks.totalTx / blocks.count);
        }

        const sortTop = (m: Map<string, { address: string; asset: string; total: number; count: number }>) =>
            Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, top);

        return {
            windowEvents: window.length,
            oldestEventAt: window.length ? window[0].created_at : null,
            newestEventAt: window.length ? window[window.length - 1].created_at : null,
            blocks,
            countsByType,
            transferVolume,
            topSenders: sortTop(senders),
            topReceivers: sortTop(receivers),
            resourceDelegation,
            exchangeFlows,
        };
    }

    private latestTimestamp() {
        return this.events.length ? this.events[this.events.length - 1].created_at : Math.floor(Date.now() / 1000);
    }
}

function bump(map: Map<string, { address: string; asset: string; total: number; count: number }>, key: string, address: string, asset: string, amount: number) {
    const entry = map.get(key) ?? { address, asset, total: 0, count: 0 };
    entry.total = round(entry.total + amount);
    entry.count += 1;
    map.set(key, entry);
}

function round(n: number) {
    return Math.round(n * 1e6) / 1e6;
}
