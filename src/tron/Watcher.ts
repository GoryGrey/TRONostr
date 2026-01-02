import { TronWeb } from 'tronweb';
import { EventEmitter } from 'events';

export interface WatcherConfig {
    fullHost: string;
    eventServer: string;
    apiKey?: string;
}

export class Watcher extends EventEmitter {
    private tronWeb: any;
    private isRunning: boolean = false;
    private lastBlockNum: number = 0;

    constructor(config: WatcherConfig) {
        super();
        this.tronWeb = new TronWeb({
            fullHost: config.fullHost,
            eventServer: config.eventServer,
            headers: config.apiKey ? { "TRON-PRO-API-KEY": config.apiKey } : {}
        });
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        console.log("Watcher started.");
        this.poll();
    }

    stop() {
        this.isRunning = false;
        console.log("Watcher stopped.");
    }

    private async poll() {
        while (this.isRunning) {
            try {
                const currentBlock = await this.tronWeb.trx.getCurrentBlock();
                if (!currentBlock || !currentBlock.block_header) {
                    throw new Error("Invalid block received from node");
                }
                const blockNum = currentBlock.block_header.raw_data.number;

                if (blockNum > this.lastBlockNum) {
                    if (this.lastBlockNum === 0) {
                        this.lastBlockNum = blockNum - 1;
                    }

                    for (let i = this.lastBlockNum + 1; i <= blockNum; i++) {
                        await this.processBlock(i);
                    }
                    this.lastBlockNum = blockNum;
                }
            } catch (e) {
                this.emit('error', e);
            }
            await new Promise(resolve => setTimeout(resolve, 3000)); // Poll every 3 seconds
        }
    }

    private async processBlock(blockNum: number) {
        try {
            const block = await this.tronWeb.trx.getBlock(blockNum);
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
        } catch (e) {
            this.emit('error', (e as Error).message);
        }
    }
}
