import { finalizeEvent, Relay } from 'nostr-tools';
import { Insight } from '../detectors/Detector';
import { WebSocket } from 'ws';
import { assertValidTRONostrEventContent, buildEventTags, getKindForInsightType } from '../schema';
import { calculateReconnectDelay, ReconnectPolicy, resolveReconnectPolicy, ResolvedReconnectPolicy } from './reconnect';

if (typeof (global as any).WebSocket === 'undefined') {
    (global as any).WebSocket = WebSocket;
}

export interface PublisherConfig {
    relays: string[];
    privateKey: string;
    kindRange: { start: number; end: number };
    rateLimit?: {
        eventsPerMinute: number;
        queueSize: number;
    };
    reconnect?: ReconnectPolicy;
    connectRelay?: (url: string) => Promise<RelayLike>;
    autoProcess?: boolean;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
}

export interface RelayLike {
    url: string;
    publish(event: any): Promise<unknown> | unknown;
    close(): void;
    onclose?: (() => void) | null;
}

interface RelayState {
    url: string;
    relay: RelayLike | null;
    status: 'disconnected' | 'connecting' | 'connected';
    reconnectAttempt: number;
    reconnectTimer: NodeJS.Timeout | null;
}

export interface PublisherStats {
    queueLength: number;
    activeRelayCount: number;
    publishAttempts: number;
    deliveredCount: number;
    droppedCount: number;
    invalidPayloadCount: number;
    skippedNoRelayCount: number;
    queuedCount: number;
    reconnectAttempts: number;
    connectedRelayCount: number;
    disconnectCount: number;
}

export class Publisher {
    private privKey: string;
    private kindRange: { start: number; end: number };
    private queue: any[] = [];
    private rateLimit: { eventsPerMinute: number; queueSize: number };
    private isProcessing = false;
    private connectRelay: (url: string) => Promise<RelayLike>;
    private autoProcess: boolean;
    private logger: Pick<Console, 'log' | 'warn' | 'error'>;
    private sleep: (ms: number) => Promise<void>;
    private random: () => number;
    private reconnectPolicy: ResolvedReconnectPolicy;
    private relayStates = new Map<string, RelayState>();
    private warnedNoRelays = false;
    private stopping = false;
    private stats: Omit<PublisherStats, 'queueLength' | 'activeRelayCount'> = {
        publishAttempts: 0,
        deliveredCount: 0,
        droppedCount: 0,
        invalidPayloadCount: 0,
        skippedNoRelayCount: 0,
        queuedCount: 0,
        reconnectAttempts: 0,
        connectedRelayCount: 0,
        disconnectCount: 0,
    };

    constructor(config: PublisherConfig) {
        this.privKey = config.privateKey;
        this.kindRange = config.kindRange;
        this.rateLimit = config.rateLimit || { eventsPerMinute: 60, queueSize: 1000 };
        this.connectRelay = config.connectRelay || Relay.connect;
        this.autoProcess = config.autoProcess ?? true;
        this.logger = config.logger || console;
        this.sleep = config.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.random = config.random || Math.random;
        this.reconnectPolicy = resolveReconnectPolicy(config.reconnect);

        for (const url of dedupeUrls(config.relays)) {
            this.relayStates.set(url, {
                url,
                relay: null,
                status: 'disconnected',
                reconnectAttempt: 0,
                reconnectTimer: null,
            });
        }
    }

    async connect() {
        this.stopping = false;
        await Promise.all(Array.from(this.relayStates.values(), (state) => this.ensureRelayConnected(state)));

        if (this.getActiveRelayCount() === 0) {
            this.warnNoRelays('No active relays connected. Events can be queued, but they cannot be delivered yet.');
        }

        if (this.autoProcess && !this.isProcessing) {
            void this.startProcessing();
        }

        return this.getActiveRelayCount();
    }

    async publish(insight: Insight) {
        let normalizedContent;
        try {
            normalizedContent = assertValidTRONostrEventContent({
                ...insight.content,
                severity: insight.severity,
            });
        } catch (error) {
            this.stats.invalidPayloadCount += 1;
            throw error;
        }

        const eventTemplate = {
            kind: getKindForInsightType(this.kindRange, insight.type),
            created_at: Math.floor(insight.timestamp / 1000),
            tags: buildEventTags(normalizedContent),
            content: JSON.stringify(normalizedContent),
        };

        const signedEvent = finalizeEvent(eventTemplate, Buffer.from(this.privKey, 'hex'));

        if (this.queue.length >= this.rateLimit.queueSize) {
            this.stats.droppedCount += 1;
            this.logger.warn('Publisher queue full, dropping event.');
            return;
        }

        this.queue.push(signedEvent);
        this.stats.queuedCount += 1;

        if (this.getActiveRelayCount() === 0) {
            this.stats.skippedNoRelayCount += 1;
            this.warnNoRelays('Event queued with no active relays. Delivery is pending until a relay connection succeeds.');
        }
    }

    async flush() {
        if (this.getActiveRelayCount() === 0) {
            this.stats.skippedNoRelayCount += 1;
            this.warnNoRelays('Flush requested with no active relays. No events were delivered.');
            return 0;
        }

        let publishedCount = 0;
        while (this.queue.length > 0) {
            const delivered = await this.publishNext();
            if (delivered === 0) {
                break;
            }
            publishedCount += delivered;
        }

        return publishedCount;
    }

    stop() {
        this.stopping = true;
        this.isProcessing = false;

        for (const state of this.relayStates.values()) {
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }

            state.relay?.close();
            state.relay = null;
            state.status = 'disconnected';
            state.reconnectAttempt = 0;
        }
    }

    getActiveRelayCount() {
        let count = 0;
        for (const state of this.relayStates.values()) {
            if (state.status === 'connected' && state.relay) {
                count += 1;
            }
        }
        return count;
    }

    getStats(): PublisherStats {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            activeRelayCount: this.getActiveRelayCount(),
        };
    }

    private async publishNext() {
        const event = this.queue[0];
        if (!event) {
            return 0;
        }

        const activeStates = Array.from(this.relayStates.values()).filter((state) => state.status === 'connected' && state.relay);
        if (activeStates.length === 0) {
            this.stats.skippedNoRelayCount += 1;
            this.warnNoRelays('Publisher has queued events but no active relays. Delivery is waiting for reconnect.');
            return 0;
        }

        let deliveredCount = 0;
        for (const state of activeStates) {
            const relay = state.relay!;
            this.stats.publishAttempts += 1;
            try {
                await relay.publish(event);
                deliveredCount += 1;
                this.stats.deliveredCount += 1;
            } catch (error) {
                this.logger.error(`Failed to publish to relay ${relay.url}:`, (error as Error).message);
                this.handleRelayDisconnect(state, `publish failure: ${(error as Error).message}`);
            }
        }

        if (deliveredCount > 0) {
            this.queue.shift();
            return deliveredCount;
        }

        this.stats.skippedNoRelayCount += 1;
        this.warnNoRelays('Event delivery failed because no relay remained available. The event stays queued for retry.');
        return 0;
    }

    private async startProcessing() {
        this.isProcessing = true;
        const intervalMs = (60 * 1000) / this.rateLimit.eventsPerMinute;

        this.logger.log(`Publisher loop started. Rate: ${this.rateLimit.eventsPerMinute} events/min (${intervalMs}ms interval)`);

        while (this.isProcessing) {
            if (this.queue.length > 0) {
                const delivered = await this.publishNext();
                if (delivered > 0) {
                    await this.sleep(intervalMs);
                    continue;
                }
            }

            await this.sleep(1000);
        }
    }

    private async ensureRelayConnected(state: RelayState) {
        if (this.stopping || state.status === 'connecting' || state.status === 'connected') {
            return;
        }

        state.status = 'connecting';

        try {
            const relay = await this.connectRelay(state.url);
            state.relay = relay;
            state.status = 'connected';
            state.reconnectAttempt = 0;
            this.warnedNoRelays = false;
            this.stats.connectedRelayCount += 1;
            this.bindRelayLifecycle(state, relay);
            this.logger.log(`Connected to relay: ${state.url}`);
        } catch (error) {
            state.status = 'disconnected';
            this.logger.error(`Failed to connect to relay ${state.url}:`, (error as Error).message);
            this.scheduleReconnect(state, `connect failure: ${(error as Error).message}`);
        }
    }

    private bindRelayLifecycle(state: RelayState, relay: RelayLike) {
        const previousOnClose = relay.onclose;
        relay.onclose = () => {
            previousOnClose?.();
            this.handleRelayDisconnect(state, 'relay closed');
        };
    }

    private handleRelayDisconnect(state: RelayState, reason: string) {
        if (this.stopping || state.status === 'disconnected') {
            return;
        }

        state.status = 'disconnected';
        const relay = state.relay;
        state.relay = null;
        this.stats.disconnectCount += 1;
        this.logger.warn(`Relay ${state.url} disconnected (${reason}).`);
        this.scheduleReconnect(state, reason);
        relay?.close();
    }

    private scheduleReconnect(state: RelayState, reason: string) {
        if (this.stopping || !this.reconnectPolicy.enabled || state.reconnectTimer) {
            return;
        }

        state.reconnectAttempt += 1;
        this.stats.reconnectAttempts += 1;
        const delay = calculateReconnectDelay(this.reconnectPolicy, state.reconnectAttempt, this.random);
        this.logger.warn(`Scheduling relay reconnect for ${state.url} in ${delay}ms (${reason}).`);

        state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = null;
            void this.ensureRelayConnected(state);
        }, delay);
    }

    private warnNoRelays(message: string) {
        if (!this.warnedNoRelays) {
            this.logger.warn(message);
            this.warnedNoRelays = true;
        }
    }
}

function dedupeUrls(urls: string[]) {
    return Array.from(new Set(urls));
}
