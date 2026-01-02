import { Relay, Filter } from 'nostr-tools';
import { WebSocket } from 'ws';

// Shim for WebSocket if needed by nostr-tools in Node environment
if (typeof (global as any).WebSocket === 'undefined') {
    (global as any).WebSocket = WebSocket;
}

export interface TRONostrClientOptions {
    relays: string[];
    kindRange?: { start: number; end: number };
}

export class TRONostrClient {
    private relays: string[];
    private activeRelays: Relay[] = [];
    private kindRange: { start: number; end: number };

    constructor(options: TRONostrClientOptions) {
        this.relays = options.relays;
        this.kindRange = options.kindRange || { start: 6500, end: 6599 };
    }

    async connect() {
        for (const url of this.relays) {
            try {
                const relay = await Relay.connect(url);
                console.log(`[TRONostrClient] Connected to relay: ${url}`);
                this.activeRelays.push(relay);
            } catch (e) {
                console.error(`[TRONostrClient] Failed to connect to ${url}:`, (e as Error).message);
            }
        }
    }

    private subscribe(filter: Filter, callback: (event: any) => void) {
        for (const relay of this.activeRelays) {
            relay.subscribe([filter], {
                onevent(event) {
                    try {
                        const content = JSON.parse(event.content);
                        callback({ ...event, parsedContent: content });
                    } catch (e) {
                        callback(event);
                    }
                },
                ononevent() {
                    // Handled per event
                }
            });
        }
    }

    /**
     * Listen to all TRONostr events
     */
    onAll(callback: (event: any) => void) {
        this.subscribe({
            kinds: [this.kindRange.start, this.kindRange.start + 1, this.kindRange.start + 2, this.kindRange.start + 9],
            tags: [['chain', 'tron']]
        }, callback);
    }

    /**
     * Listen to TRON block metrics (Kind 6500)
     */
    onBlock(callback: (event: any) => void) {
        this.subscribe({
            kinds: [this.kindRange.start],
            tags: [['chain', 'tron'], ['type', 'block_metrics']]
        }, callback);
    }

    /**
     * Listen to TRX/USDT transfers (Kind 6501, 6502)
     */
    onTransfer(callback: (event: any) => void) {
        this.subscribe({
            kinds: [this.kindRange.start + 1, this.kindRange.start + 2],
            tags: [['chain', 'tron'], ['type', 'whale_transfer']]
        }, callback);
    }

    /**
     * Listen to High/Critical severity events
     */
    onAlerts(callback: (event: any) => void) {
        // High/Critical are usually tagged or specifically detected
        this.onAll((event) => {
            const severity = event.tags.find((t: any) => t[0] === 'severity')?.[1];
            if (severity === 'high' || severity === 'critical') {
                callback(event);
            } else if (event.parsedContent && (event.parsedContent.severity === 'high' || event.parsedContent.severity === 'critical')) {
                callback(event);
            }
        });
    }

    close() {
        for (const r of this.activeRelays) {
            r.close();
        }
    }
}
