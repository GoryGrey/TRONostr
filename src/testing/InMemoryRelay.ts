import { Filter } from 'nostr-tools';

export type EventHandler = { onevent(event: any): void; onclose?(reason?: string): void };

export interface Subscription {
    relayUrl: string;
    filters: Filter[];
    handlers: EventHandler;
    closed: boolean;
}

export class InMemoryRelayHub {
    public publishedEvents: any[] = [];
    public subscriptions: Subscription[] = [];
    private relays = new Map<string, InMemoryRelay[]>();

    publish(event: any) {
        this.publishedEvents.push(event);

        for (const subscription of this.subscriptions) {
            if (!subscription.closed && matchesFilters(event, subscription.filters)) {
                subscription.handlers.onevent(event);
            }
        }
    }

    registerRelay(relay: InMemoryRelay) {
        const relays = this.relays.get(relay.url) ?? [];
        relays.push(relay);
        this.relays.set(relay.url, relays);
    }

    subscribe(relayUrl: string, filters: Filter[], handlers: EventHandler) {
        const subscription: Subscription = {
            relayUrl,
            filters,
            handlers,
            closed: false,
        };
        this.subscriptions.push(subscription);

        return {
            close: (reason?: string) => {
                if (subscription.closed) {
                    return;
                }
                subscription.closed = true;
                handlers.onclose?.(reason);
            }
        };
    }

    disconnectRelay(relay: InMemoryRelay, reason = 'relay disconnected') {
        relay.connected = false;
        for (const subscription of this.subscriptions) {
            if (subscription.relayUrl === relay.url && !subscription.closed) {
                subscription.closed = true;
                subscription.handlers.onclose?.(reason);
            }
        }
        relay.onclose?.();
    }

    getRelays(url: string) {
        return [...(this.relays.get(url) ?? [])];
    }

    getLatestRelay(url: string) {
        const relays = this.relays.get(url) ?? [];
        return relays[relays.length - 1];
    }
}

export class InMemoryRelay {
    public connected = true;
    public onclose: (() => void) | null = null;

    constructor(
        public readonly url: string,
        private readonly hub: InMemoryRelayHub,
    ) {
        this.hub.registerRelay(this);
    }

    subscribe(filters: Filter[], handlers: EventHandler) {
        return this.hub.subscribe(this.url, filters, handlers);
    }

    async publish(event: any) {
        if (!this.connected) {
            throw new Error(`relay ${this.url} is disconnected`);
        }
        this.hub.publish(event);
    }

    close() {
        if (!this.connected) {
            return;
        }
        this.connected = false;
        this.onclose?.();
    }

    disconnect(reason?: string) {
        if (!this.connected) {
            return;
        }
        this.hub.disconnectRelay(this, reason);
    }
}

export function createInMemoryRelayConnector(hub: InMemoryRelayHub) {
    return async (url: string) => new InMemoryRelay(url, hub);
}

function matchesFilters(event: any, filters: Filter[]) {
    return filters.some((filter) => matchesFilter(event, filter));
}

function matchesFilter(event: any, filter: Filter) {
    if (filter.kinds && !filter.kinds.includes(event.kind)) {
        return false;
    }

    return true;
}
