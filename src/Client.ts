import { Relay, Filter } from 'nostr-tools';
import { WebSocket } from 'ws';
import { getDefaultKinds, isAlertSeverity, parseTRONostrEventContent, ParsedTRONostrEvent } from './schema';
import { calculateReconnectDelay, ReconnectPolicy, resolveReconnectPolicy, ResolvedReconnectPolicy } from './nostr/reconnect';

if (typeof (global as any).WebSocket === 'undefined') {
    (global as any).WebSocket = WebSocket;
}

export interface TRONostrClientOptions {
    relays: string[];
    kindRange?: { start: number; end: number };
    reconnect?: ReconnectPolicy;
    connectRelay?: (url: string) => Promise<RelayLike>;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    random?: () => number;
}

export interface RelaySubscriptionLike {
    close?(reason?: string): void;
}

export interface RelayLike {
    url: string;
    subscribe(filters: Filter[], handlers: { onevent(event: any): void; onclose?(reason?: string): void }): RelaySubscriptionLike | void;
    close(): void;
    onclose?: (() => void) | null;
}

interface ClientSubscription {
    filter: Filter;
    callback: (event: ParsedTRONostrEvent) => void;
}

interface RelayState {
    url: string;
    relay: RelayLike | null;
    status: 'disconnected' | 'connecting' | 'connected';
    reconnectAttempt: number;
    reconnectTimer: NodeJS.Timeout | null;
    subscriptions: RelaySubscriptionLike[];
}

export interface TRONostrClientStats {
    activeRelayCount: number;
    configuredRelayCount: number;
}

export class TRONostrClient {
    private kindRange: { start: number; end: number };
    private connectRelay: (url: string) => Promise<RelayLike>;
    private logger: Pick<Console, 'log' | 'warn' | 'error'>;
    private subscriptions: ClientSubscription[] = [];
    private relayStates = new Map<string, RelayState>();
    private reconnectPolicy: ResolvedReconnectPolicy;
    private random: () => number;
    private stopping = false;

    constructor(options: TRONostrClientOptions) {
        this.kindRange = options.kindRange || { start: 6500, end: 6599 };
        this.connectRelay = options.connectRelay || Relay.connect;
        this.logger = options.logger || console;
        this.reconnectPolicy = resolveReconnectPolicy(options.reconnect);
        this.random = options.random || Math.random;

        for (const url of dedupeUrls(options.relays)) {
            this.relayStates.set(url, {
                url,
                relay: null,
                status: 'disconnected',
                reconnectAttempt: 0,
                reconnectTimer: null,
                subscriptions: [],
            });
        }
    }

    async connect() {
        this.stopping = false;
        await Promise.all(Array.from(this.relayStates.values(), (state) => this.ensureRelayConnected(state)));

        if (this.getActiveRelayCount() === 0) {
            this.logger.warn('[TRONostrClient] No active relays connected. Subscriptions will remain idle until a relay is available.');
        }

        return this.getActiveRelayCount();
    }

    onAll(callback: (event: ParsedTRONostrEvent) => void) {
        this.subscribe({
            kinds: getDefaultKinds(this.kindRange),
        } as Filter, callback);
    }

    onBlock(callback: (event: ParsedTRONostrEvent) => void) {
        this.subscribe({
            kinds: [this.kindRange.start],
        } as Filter, (event) => {
            if (event.parsedContent.eventType === 'block_metrics') {
                callback(event);
            }
        });
    }

    onTransfer(callback: (event: ParsedTRONostrEvent) => void) {
        this.subscribe({
            kinds: [this.kindRange.start + 1, this.kindRange.start + 2],
        } as Filter, (event) => {
            if (event.parsedContent.eventType === 'trx_transfer' || event.parsedContent.eventType === 'usdt_transfer') {
                callback(event);
            }
        });
    }

    onTRXTransfer(callback: (event: ParsedTRONostrEvent) => void) {
        this.subscribe({
            kinds: [this.kindRange.start + 1],
        } as Filter, (event) => {
            if (event.parsedContent.eventType === 'trx_transfer') {
                callback(event);
            }
        });
    }

    onUSDTTransfer(callback: (event: ParsedTRONostrEvent) => void) {
        this.subscribe({
            kinds: [this.kindRange.start + 2],
        } as Filter, (event) => {
            if (event.parsedContent.eventType === 'usdt_transfer') {
                callback(event);
            }
        });
    }

    onAlerts(callback: (event: ParsedTRONostrEvent) => void) {
        this.onAll((event) => {
            if (isAlertSeverity(event.parsedContent.severity)) {
                callback(event);
            }
        });
    }

    close() {
        this.stopping = true;

        for (const state of this.relayStates.values()) {
            if (state.reconnectTimer) {
                clearTimeout(state.reconnectTimer);
                state.reconnectTimer = null;
            }

            this.closeRelaySubscriptions(state);
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

    getStats(): TRONostrClientStats {
        return {
            activeRelayCount: this.getActiveRelayCount(),
            configuredRelayCount: this.relayStates.size,
        };
    }

    private subscribe(filter: Filter, callback: (event: ParsedTRONostrEvent) => void) {
        const subscription = { filter, callback };
        this.subscriptions.push(subscription);

        for (const state of this.relayStates.values()) {
            if (state.status === 'connected' && state.relay) {
                this.attachSubscription(state, subscription);
            }
        }
    }

    private attachSubscriptionsToRelay(state: RelayState) {
        for (const subscription of this.subscriptions) {
            this.attachSubscription(state, subscription);
        }
    }

    private attachSubscription(state: RelayState, subscription: ClientSubscription) {
        if (!state.relay) {
            return;
        }

        const relay = state.relay;
        const relaySubscription = relay.subscribe([subscription.filter], {
            onevent: (event) => {
                const parsedContentResult = parseTRONostrEventContent(event.content);
                if (!parsedContentResult.ok) {
                    this.logger.warn(`[TRONostrClient] Rejected malformed event from ${relay.url}: ${parsedContentResult.errors.join('; ')}`);
                    return;
                }

                subscription.callback({ ...event, parsedContent: parsedContentResult.value! });
            },
            onclose: (reason) => {
                this.handleRelayDisconnect(state, reason || 'subscription closed');
            }
        });

        if (relaySubscription) {
            state.subscriptions.push(relaySubscription);
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
            this.bindRelayLifecycle(state, relay);
            this.attachSubscriptionsToRelay(state);
            this.logger.log(`[TRONostrClient] Connected to relay: ${state.url}`);
        } catch (error) {
            state.status = 'disconnected';
            this.logger.error(`[TRONostrClient] Failed to connect to ${state.url}:`, (error as Error).message);
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
        this.closeRelaySubscriptions(state);
        this.logger.warn(`[TRONostrClient] Relay ${state.url} disconnected (${reason}).`);
        this.scheduleReconnect(state, reason);
        relay?.close();
    }

    private scheduleReconnect(state: RelayState, reason: string) {
        if (this.stopping || !this.reconnectPolicy.enabled || state.reconnectTimer) {
            return;
        }

        state.reconnectAttempt += 1;
        const delay = calculateReconnectDelay(this.reconnectPolicy, state.reconnectAttempt, this.random);
        this.logger.warn(`[TRONostrClient] Scheduling relay reconnect for ${state.url} in ${delay}ms (${reason}).`);

        state.reconnectTimer = setTimeout(() => {
            state.reconnectTimer = null;
            void this.ensureRelayConnected(state);
        }, delay);
    }

    private closeRelaySubscriptions(state: RelayState) {
        for (const subscription of state.subscriptions) {
            subscription.close?.('relay disconnected');
        }
        state.subscriptions = [];
    }
}

function dedupeUrls(urls: string[]) {
    return Array.from(new Set(urls));
}
