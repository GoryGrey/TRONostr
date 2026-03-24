import assert from 'node:assert/strict';
import { TestCase } from './runner';
import { Watcher } from '../src/tron/Watcher';
import { createLoggerSpy, MemoryCheckpointStore } from './helpers';

function createFakeBlock(height: number) {
    return {
        blockID: `block-${height}`,
        block_header: {
            raw_data: {
                number: height,
                timestamp: 1710000000000 + height,
                witness_address: '411111111111111111111111111111111111111111',
            },
        },
        transactions: [],
    };
}

export const watcherCases: TestCase[] = [
    {
        name: 'starts, processes a block, and stops cleanly',
        run: async () => {
            const { logger, logs } = createLoggerSpy();
            const block = createFakeBlock(10);
            const watcher = new Watcher({
                fullHost: 'unused',
                eventServer: 'unused',
                tronWeb: {
                    trx: {
                        async getCurrentBlock() {
                            return block;
                        },
                        async getBlock() {
                            return block;
                        },
                    },
                },
                sleep: async () => undefined,
                jitterMs: 0,
                logger,
            });

            const blockSeen = new Promise<void>((resolve) => {
                watcher.on('block', () => {
                    resolve();
                    void watcher.stop();
                });
            });

            await watcher.start();
            await blockSeen;
            await watcher.stop();

            assert.equal(watcher.getLastBlockNum(), 10);
            assert.ok(logs.some((entry) => entry.includes('Watcher started.')));
            assert.ok(logs.some((entry) => entry.includes('Watcher stopped.')));
        },
    },
    {
        name: 'backs off after transient failures and recovers',
        run: async () => {
            const { logger, warnings, logs } = createLoggerSpy();
            const delays: number[] = [];
            let attempts = 0;
            const block = createFakeBlock(20);

            const watcher = new Watcher({
                fullHost: 'unused',
                eventServer: 'unused',
                tronWeb: {
                    trx: {
                        async getCurrentBlock() {
                            attempts += 1;
                            if (attempts < 3) {
                                throw new Error(`temporary failure ${attempts}`);
                            }
                            return block;
                        },
                        async getBlock() {
                            return block;
                        },
                    },
                },
                sleep: async (ms) => {
                    delays.push(ms);
                },
                random: () => 0,
                jitterMs: 0,
                logger,
            });

            const recovered = new Promise<void>((resolve) => {
                watcher.on('block', () => {
                    resolve();
                    void watcher.stop();
                });
            });

            await watcher.start();
            await recovered;
            await watcher.stop();

            assert.deepEqual(delays.slice(0, 2), [3000, 6000]);
            assert.equal(warnings.length, 2);
            assert.ok(logs.some((entry) => entry.includes('recovered after 2 consecutive polling failure')));
        },
    },
    {
        name: 'restores and updates persisted checkpoints when enabled',
        run: async () => {
            const checkpointStore = new MemoryCheckpointStore();
            await checkpointStore.save('watcher-test', 8);
            const processedBlocks: number[] = [];
            let resolveDone: (() => void) | undefined;
            const done = new Promise<void>((resolve) => {
                resolveDone = resolve;
            });

            const watcher = new Watcher({
                fullHost: 'unused',
                eventServer: 'unused',
                checkpointStore,
                checkpointKey: 'watcher-test',
                tronWeb: {
                    trx: {
                        async getCurrentBlock() {
                            return createFakeBlock(10);
                        },
                        async getBlock(blockNum: number) {
                            return createFakeBlock(blockNum);
                        },
                    },
                },
                sleep: async () => undefined,
                jitterMs: 0,
            });

            watcher.on('block', (block) => {
                processedBlocks.push(block.block_header.raw_data.number);
                if (block.block_header.raw_data.number === 10) {
                    resolveDone?.();
                    void watcher.stop();
                }
            });

            await watcher.start();
            await done;
            await watcher.stop();

            assert.deepEqual(processedBlocks, [9, 10]);
            assert.equal(await checkpointStore.load('watcher-test'), 10);
            assert.equal(watcher.getLastBlockNum(), 10);
        },
    },
];
