import { TronWeb } from 'tronweb';
import { EventEmitter } from 'events';
import { CheckpointStore } from './CheckpointStore';

export interface WatcherConfig {
    fullHost: string;
    eventServer: string;
    apiKey?: string;
    pollIntervalMs?: number;
    maxBackoffMs?: number;
    backoffMultiplier?: number;
    jitterMs?: number;
    tronWeb?: TronWebLike;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
    checkpointStore?: CheckpointStore;
    checkpointKey?: string;
    startBlock?: number;
}

export interface TronWebLike {
    trx: {
        getCurrentBlock(): Promise<any>;
        getBlock(blockNum: number): Promise<any>;
    };
}

export class Watcher extends EventEmitter {
    private tronWeb: TronWebLike;
    private isRunning: boolean = false;
    private lastBlockNum: number = 0;
    private pollIntervalMs: number;
    private maxBackoffMs: number;
    private backoffMultiplier: number;
    private jitterMs: number;
    private sleep: (ms: number) => Promise<void>;
    private random: () => number;
    private logger: Pick<Console, 'log' | 'warn' | 'error'>;
    private loopPromise: Promise<void> | null = null;
    private currentSleepHandle: NodeJS.Timeout | null = null;
    private currentSleepResolver: (() => void) | null = null;
    private consecutiveFailures = 0;
    private checkpointStore?: CheckpointStore;
    private checkpointKey: string;
    private startBlock?: number;
    private hasLoadedInitialCheckpoint = false;

    constructor(config: WatcherConfig) {
        super();
        this.tronWeb = config.tronWeb || new TronWeb({
            fullHost: config.fullHost,
            eventServer: config.eventServer,
            headers: config.apiKey ? { "TRON-PRO-API-KEY": config.apiKey } : {}
        });
        this.pollIntervalMs = config.pollIntervalMs ?? 3000;
        this.maxBackoffMs = config.maxBackoffMs ?? 30000;
        this.backoffMultiplier = config.backoffMultiplier ?? 2;
        this.jitterMs = config.jitterMs ?? 250;
        this.sleep = config.sleep || ((ms) => this.sleepWithWake(ms));
        this.random = config.random || Math.random;
        this.logger = config.logger || console;
        this.checkpointStore = config.checkpointStore;
        this.checkpointKey = config.checkpointKey ?? 'tronostr.watcher';
        this.startBlock = config.startBlock;
    }

    async start() {
        if (this.loopPromise) {
            return;
        }

        await this.loadInitialCheckpoint();
        this.isRunning = true;
        this.logger.log("Watcher started.");
        this.emit('state', { state: 'started' });
        this.loopPromise = this.poll().finally(() => {
            this.loopPromise = null;
        });
    }

    async stop() {
        if (!this.isRunning && !this.loopPromise) {
            return;
        }

        this.isRunning = false;
        this.wakeSleep();
        await this.loopPromise;
        this.logger.log("Watcher stopped.");
        this.emit('state', { state: 'stopped' });
    }

    private async poll() {
        while (this.isRunning) {
            try {
                const currentBlock = await this.fetchCurrentBlock();
                const blockNum = currentBlock.block_header.raw_data.number;

                if (blockNum > this.lastBlockNum) {
                    if (this.lastBlockNum === 0) {
                        this.lastBlockNum = blockNum - 1;
                    }

                    for (let i = this.lastBlockNum + 1; i <= blockNum && this.isRunning; i++) {
                        await this.processBlock(i);
                        await this.updateCheckpoint(i);
                    }
                }
                if (this.consecutiveFailures > 0) {
                    this.logger.log(`Watcher recovered after ${this.consecutiveFailures} consecutive polling failure(s).`);
                }
                this.consecutiveFailures = 0;
                await this.sleep(this.pollIntervalMs);
            } catch (e) {
                if (!this.isRunning) {
                    break;
                }

                this.consecutiveFailures += 1;
                const delay = this.calculateBackoffDelay();
                this.reportError(e);
                this.logger.warn(`Watcher poll failed (attempt ${this.consecutiveFailures}). Retrying in ${delay}ms.`);
                this.emit('state', { state: 'backoff', attempt: this.consecutiveFailures, delay });
                await this.sleep(delay);
            }
        }
    }

    private async processBlock(blockNum: number) {
        const block = await this.tronWeb.trx.getBlock(blockNum);
        if (!block || !block.block_header?.raw_data) {
            throw new Error(`Invalid block payload for block ${blockNum}`);
        }

        this.emit('block', block);

        if (block.transactions) {
            for (const tx of block.transactions) {
                // Inject timestamp if missing from raw_data (sometimes it's in the block header)
                if (tx.raw_data && !tx.raw_data.timestamp) {
                    tx.raw_data.timestamp = block.block_header.raw_data.timestamp;
                }
                this.emit('transaction', tx);
            }
        }
    }

    getLastBlockNum() {
        return this.lastBlockNum;
    }

    async setCheckpoint(blockHeight: number) {
        if (!Number.isInteger(blockHeight) || blockHeight < 0) {
            throw new Error(`Checkpoint block height must be a non-negative integer. Received: ${blockHeight}`);
        }

        this.lastBlockNum = blockHeight;
        if (this.checkpointStore) {
            await this.checkpointStore.save(this.checkpointKey, blockHeight);
        }
    }

    private async fetchCurrentBlock() {
        const currentBlock = await this.tronWeb.trx.getCurrentBlock();
        if (!currentBlock || !currentBlock.block_header?.raw_data || !Number.isInteger(currentBlock.block_header.raw_data.number)) {
            throw new Error("Invalid block received from node");
        }

        return currentBlock;
    }

    private calculateBackoffDelay() {
        const baseDelay = Math.min(
            this.pollIntervalMs * Math.pow(this.backoffMultiplier, Math.max(this.consecutiveFailures - 1, 0)),
            this.maxBackoffMs,
        );
        const jitter = this.jitterMs > 0 ? Math.floor(this.random() * this.jitterMs) : 0;
        return baseDelay + jitter;
    }

    private sleepWithWake(ms: number) {
        return new Promise<void>((resolve) => {
            this.currentSleepResolver = resolve;
            this.currentSleepHandle = setTimeout(() => {
                this.currentSleepHandle = null;
                this.currentSleepResolver = null;
                resolve();
            }, ms);
        });
    }

    private wakeSleep() {
        if (this.currentSleepHandle) {
            clearTimeout(this.currentSleepHandle);
            this.currentSleepHandle = null;
        }
        if (this.currentSleepResolver) {
            const resolve = this.currentSleepResolver;
            this.currentSleepResolver = null;
            resolve();
        }
    }

    private reportError(error: unknown) {
        if (this.listenerCount('error') > 0) {
            this.emit('error', error);
            return;
        }

        this.logger.error('Watcher Error:', error);
    }

    private async loadInitialCheckpoint() {
        if (this.hasLoadedInitialCheckpoint) {
            return;
        }

        this.hasLoadedInitialCheckpoint = true;

        if (this.checkpointStore) {
            const storedBlock = await this.checkpointStore.load(this.checkpointKey);
            if (storedBlock !== null) {
                this.lastBlockNum = storedBlock;
                this.logger.log(`Watcher restored checkpoint ${storedBlock} from ${this.checkpointKey}.`);
                return;
            }
        }

        if (this.startBlock !== undefined) {
            if (!Number.isInteger(this.startBlock) || this.startBlock < 0) {
                throw new Error(`startBlock must be a non-negative integer. Received: ${this.startBlock}`);
            }
            this.lastBlockNum = this.startBlock;
            this.logger.log(`Watcher starting from configured block ${this.startBlock}.`);
        }
    }

    private async updateCheckpoint(blockHeight: number) {
        this.lastBlockNum = blockHeight;

        if (!this.checkpointStore) {
            return;
        }

        await this.checkpointStore.save(this.checkpointKey, blockHeight);
    }
}
