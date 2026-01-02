import { finalizeEvent, getPublicKey, Relay } from 'nostr-tools';
import { Insight } from '../detectors/Detector';
import { WebSocket } from 'ws';

// Shim for WebSocket if needed by nostr-tools in Node environment
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
}

export class Publisher {
    private relays: string[];
    private privKey: string;
    private pubKey: string;
    private kindRange: { start: number; end: number };
    private activeRelays: Relay[] = [];
    private queue: any[] = [];
    private rateLimit: { eventsPerMinute: number; queueSize: number };
    private isProcessing: boolean = false;

    constructor(config: PublisherConfig) {
        this.relays = config.relays;
        this.privKey = config.privateKey;
        this.pubKey = getPublicKey(Buffer.from(this.privKey, 'hex'));
        this.kindRange = config.kindRange;
        this.rateLimit = config.rateLimit || { eventsPerMinute: 60, queueSize: 1000 };
    }

    async connect() {
        for (const url of this.relays) {
            try {
                const relay = await Relay.connect(url);
                console.log(`Connected to relay: ${url}`);
                this.activeRelays.push(relay);
            } catch (e) {
                console.error(`Failed to connect to relay ${url}:`, (e as Error).message);
            }
        }

        if (!this.isProcessing) {
            this.startProcessing();
        }
    }

    async publish(insight: Insight) {
        const eventTemplate = {
            kind: this.getKind(insight.type),
            created_at: Math.floor(insight.timestamp / 1000),
            tags: insight.tags,
            content: JSON.stringify(insight.content),
        };

        const signedEvent = finalizeEvent(eventTemplate, Buffer.from(this.privKey, 'hex'));

        if (this.queue.length >= this.rateLimit.queueSize) {
            console.warn("Publisher queue full, dropping event.");
            return;
        }

        this.queue.push(signedEvent);
    }

    private async startProcessing() {
        this.isProcessing = true;
        const intervalMs = (60 * 1000) / this.rateLimit.eventsPerMinute;

        console.log(`Publisher loop started. Rate: ${this.rateLimit.eventsPerMinute} events/min (${intervalMs}ms interval)`);

        while (this.isProcessing) {
            if (this.queue.length > 0 && this.activeRelays.length > 0) {
                const event = this.queue.shift();

                for (const relay of this.activeRelays) {
                    try {
                        await relay.publish(event);
                    } catch (e) {
                        console.error(`Failed to publish to relay ${relay.url}:`, (e as Error).message);
                    }
                }

                // Wait for the next slot
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            } else {
                // Wait a bit before checking queue again if empty
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    private getKind(type: string): number {
        switch (type) {
            case 'TRON_BLOCK': return this.kindRange.start;
            case 'TRX_TRANSFER': return this.kindRange.start + 1;
            case 'USDT_TRANSFER': return this.kindRange.start + 2;
            default: return this.kindRange.start + 9;
        }
    }

    stop() {
        this.isProcessing = false;
    }
}
