import assert from 'node:assert/strict';
import { TronWeb } from 'tronweb';
import { WhaleTransferDetector } from '../src/detectors/WhaleTransferDetector';
import { createTrxTransferTx, createUsdtTransferFromTx, createUsdtTransferTx, OWNER_ADDRESS_HEX, RECIPIENT_ADDRESS_HEX, TEST_USDT_CONTRACT, withRet } from './fixtures';
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
    {
        name: 'skips transfers whose transaction failed on-chain (REVERT / OUT_OF_ENERGY)',
        run: () => {
            const detector = new WhaleTransferDetector({ trxThreshold: 1000, usdtThreshold: 1000, usdtContract: TEST_USDT_CONTRACT });
            assert.equal(detector.onTransaction(withRet(createUsdtTransferTx(5000), 'REVERT')).length, 0);
            assert.equal(detector.onTransaction(withRet(createUsdtTransferTx(5000), 'OUT_OF_ENERGY')).length, 0);
            assert.equal(detector.onTransaction(withRet(createUsdtTransferTx(5000), 'SUCCESS')).length, 1);
        },
    },
    {
        name: 'detects USDT transferFrom with the real token holder as sender',
        run: () => {
            const detector = new WhaleTransferDetector({ trxThreshold: 1000, usdtThreshold: 1000, usdtContract: TEST_USDT_CONTRACT });
            const [insight] = detector.onTransaction(createUsdtTransferFromTx(7500));
            assert.equal(insight.content.data.amount, 7500);
            assert.equal(insight.content.data.method, 'transferFrom');
            assert.equal(insight.content.data.from, TronWeb.address.fromHex(OWNER_ADDRESS_HEX));
            assert.equal(insight.content.data.to, TronWeb.address.fromHex(RECIPIENT_ADDRESS_HEX));
        },
    },
    {
        name: 'includes block metadata when the watcher attached it',
        run: () => {
            const detector = new WhaleTransferDetector({ trxThreshold: 1000, usdtThreshold: 1000, usdtContract: TEST_USDT_CONTRACT });
            const tx = createTrxTransferTx(5000);
            Object.defineProperty(tx, 'tronostrBlock', { value: { height: 123, hash: 'h', timestamp: 1 }, enumerable: false });
            const [insight] = detector.onTransaction(tx);
            assert.equal(insight.content.block?.height, 123);
        },
    },
];
