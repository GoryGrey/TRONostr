import assert from 'node:assert/strict';
import { TronWeb } from 'tronweb';
import { ExchangeFlowDetector } from '../src/detectors/ExchangeFlowDetector';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { createTrxTransferTx, createUsdtTransferTx, OWNER_ADDRESS_HEX, RECIPIENT_ADDRESS_HEX, TEST_KIND_RANGE, TEST_USDT_CONTRACT, withRet } from './fixtures';
import { TestCase } from './runner';

const OWNER = TronWeb.address.fromHex(OWNER_ADDRESS_HEX);
const RECIPIENT = TronWeb.address.fromHex(RECIPIENT_ADDRESS_HEX);

const make = (addresses: Array<{ address: string; label: string; source?: string }>) => new ExchangeFlowDetector({
    addresses,
    trxThreshold: 1000,
    usdtThreshold: 1000,
    usdtContract: TEST_USDT_CONTRACT,
});

export const exchangeFlowDetectorCases: TestCase[] = [
    {
        name: 'classifies USDT sent to a labeled wallet as inflow',
        run: () => {
            const [insight] = make([{ address: RECIPIENT, label: 'Test Exchange', source: 'unit-test' }]).onTransaction(createUsdtTransferTx(5000));
            assert.equal(insight.type, 'EXCHANGE_FLOW');
            assert.equal(insight.content.asset, 'USDT');
            assert.equal(insight.content.data.direction, 'inflow');
            assert.equal(insight.content.data.entity, 'Test Exchange');
            assert.equal(insight.content.data.labelSource, 'unit-test');
            assert.equal(prepareTRONostrEvent(insight, TEST_KIND_RANGE).kind, 6504);
        },
    },
    {
        name: 'classifies TRX leaving a labeled wallet as outflow and wallet-to-wallet as internal',
        run: () => {
            const [out] = make([{ address: OWNER, label: 'Ex A' }]).onTransaction(createTrxTransferTx(2000));
            assert.equal(out.content.data.direction, 'outflow');
            assert.equal(out.content.data.entity, 'Ex A');
            const [internal] = make([{ address: OWNER, label: 'Ex A' }, { address: RECIPIENT, label: 'Ex B' }]).onTransaction(createTrxTransferTx(2000));
            assert.equal(internal.content.data.direction, 'internal');
        },
    },
    {
        name: 'does nothing with an empty address book, unlabeled, small, or failed transfers',
        run: () => {
            assert.equal(make([]).onTransaction(createUsdtTransferTx(5000)).length, 0);
            assert.equal(make([{ address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', label: 'Other' }]).onTransaction(createUsdtTransferTx(5000)).length, 0);
            assert.equal(make([{ address: RECIPIENT, label: 'Ex' }]).onTransaction(createUsdtTransferTx(10)).length, 0);
            assert.equal(make([{ address: RECIPIENT, label: 'Ex' }]).onTransaction(withRet(createUsdtTransferTx(5000), 'REVERT')).length, 0);
        },
    },
    {
        name: 'rejects address book entries without a label',
        run: () => {
            assert.throws(() => make([{ address: RECIPIENT, label: '' }]));
        },
    },
];
