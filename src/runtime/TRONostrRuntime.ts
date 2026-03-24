import { EventEmitter } from 'events';
import { Detector, Insight } from '../detectors/Detector';
import { PreparedTRONostrEvent, prepareTRONostrEvent } from '../eventEnvelope';
import { Publisher } from '../nostr/Publisher';
import { Watcher } from '../tron/Watcher';
import { TRONostrStatusTracker } from './StatusTracker';

export interface TRONostrOutputTransport {
    deliver(event: PreparedTRONostrEvent): Promise<void>;
    close?(): Promise<void> | void;
}

export interface TRONostrRuntimeOptions {
    watcher: Watcher;
    detectors: Detector[];
    publisher?: Publisher;
    outputs?: TRONostrOutputTransport[];
    statusTracker?: TRONostrStatusTracker;
    kindRange?: { start: number; end: number };
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

export class TRONostrRuntime extends EventEmitter {
    private readonly watcher: Watcher;
    private readonly detectors: Detector[];
    private readonly publisher?: Publisher;
    private readonly outputs: TRONostrOutputTransport[];
    private readonly statusTracker?: TRONostrStatusTracker;
    private readonly kindRange: { start: number; end: number };
    private readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;
    private started = false;

    constructor(options: TRONostrRuntimeOptions) {
        super();
        this.watcher = options.watcher;
        this.detectors = options.detectors;
        this.publisher = options.publisher;
        this.outputs = options.outputs ?? [];
        this.statusTracker = options.statusTracker;
        this.kindRange = options.kindRange ?? { start: 6500, end: 6599 };
        this.logger = options.logger ?? console;
        this.bindWatcher();
    }

    async start() {
        if (this.started) {
            return;
        }

        this.started = true;
        await this.publisher?.connect();
        await this.watcher.start();
    }

    async stop() {
        if (!this.started) {
            return;
        }

        this.started = false;
        await this.watcher.stop();
        for (const output of this.outputs) {
            await output.close?.();
        }
        this.publisher?.stop();
    }

    getStatusSnapshot() {
        return this.statusTracker?.getSnapshot(this.publisher?.getStats());
    }

    getPublisherStats() {
        return this.publisher?.getStats();
    }

    private bindWatcher() {
        this.watcher.on('block', (block) => {
            const height = block.block_header?.raw_data?.number;
            if (Number.isInteger(height)) {
                this.statusTracker?.recordBlock(height);
            }

            void this.processInsights(this.detectors.flatMap((detector) => detector.onBlock(block)));
        });

        this.watcher.on('transaction', (tx) => {
            const insights: Insight[] = [];
            for (const detector of this.detectors) {
                if (detector.onTransaction) {
                    insights.push(...detector.onTransaction(tx));
                }
            }

            void this.processInsights(insights);
        });

        this.watcher.on('error', (error) => {
            this.emit('error', error);
        });

        this.watcher.on('state', (state) => {
            this.emit('state', state);
        });
    }

    private async processInsights(insights: Insight[]) {
        for (const insight of insights) {
            try {
                const prepared = prepareTRONostrEvent(insight, this.kindRange);
                this.statusTracker?.recordEvent(prepared);
                this.emit('event', prepared);

                for (const output of this.outputs) {
                    await output.deliver(prepared);
                }

                if (this.publisher) {
                    await this.publisher.publish(insight);
                }
            } catch (error) {
                this.logger.error('[TRONostrRuntime] Failed to process insight:', error);
                this.emit('error', error);
            }
        }
    }
}
