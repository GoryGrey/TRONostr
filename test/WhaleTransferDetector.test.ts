import assert from 'node:assert/strict';
import { WhaleTransferDetector } from '../src/detectors/WhaleTransferDetector';
import { createTrxTransferTx, createUsdtTransferTx, TEST_USDT_CONTRACT } from './fixtures';
import { TestCase } from './runner';

export const whaleTransferDetectorCases: TestCase[] = [
    {
        name: 'detects large TRX transfer',
        run: () => {
            const detector = new WhaleTransferDetector({
                trxThreshold: 1000,
                usdtThreshold: 1000,
                usdtContract: TEST_USDT_CONTRACT,
            });

            const insights = detector.onTransaction(createTrxTransferTx(2500));

            assert.equal(insights.length, 1);
            assert.equal(insights[0].type, 'TRX_TRANSFER');
            assert.equal(insights[0].content.eventType, 'trx_transfer');
            assert.equal(insights[0].content.asset, 'TRX');
            assert.equal(insights[0].content.data.amount, 2500);
        },
    },
    {
        name: 'ignores below-threshold TRX transfer',
        run: () => {
            const detector = new WhaleTransferDetector({
                trxThreshold: 1000,
                usdtThreshold: 1000,
                usdtContract: TEST_USDT_CONTRACT,
            });

            const insights = detector.onTransaction(createTrxTransferTx(10));

            assert.equal(insights.length, 0);
        },
    },
    {
        name: 'detects large USDT transfer',
        run: () => {
            const detector = new WhaleTransferDetector({
                trxThreshold: 1000,
                usdtThreshold: 1000,
                usdtContract: TEST_USDT_CONTRACT,
            });

            const insights = detector.onTransaction(createUsdtTransferTx(5000));

            assert.equal(insights.length, 1);
            assert.equal(insights[0].type, 'USDT_TRANSFER');
            assert.equal(insights[0].content.eventType, 'usdt_transfer');
            assert.equal(insights[0].content.asset, 'USDT');
            assert.equal(insights[0].content.data.amount, 5000);
        },
    },
    {
        name: 'safely ignores malformed smart contract payload',
        run: () => {
            const detector = new WhaleTransferDetector({
                trxThreshold: 1000,
                usdtThreshold: 1000,
                usdtContract: TEST_USDT_CONTRACT,
            });

            const insights = detector.onTransaction(createUsdtTransferTx(5000, 'a9059cbb1234'));

            assert.equal(insights.length, 0);
        },
    },
];
