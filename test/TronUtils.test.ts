import assert from 'node:assert/strict';
import { decodeTrc20Transfer, isTransactionSuccessful, toUnits } from '../src/detectors/tronUtils';
import { OWNER_ADDRESS_HEX, RECIPIENT_ADDRESS_HEX } from './fixtures';
import { TestCase } from './runner';

const word = (hex: string) => hex.padStart(64, '0');

export const tronUtilsCases: TestCase[] = [
    {
        name: 'decodes transfer(address,uint256) and ignores trailing calldata',
        run: () => {
            const data = `a9059cbb${word(RECIPIENT_ADDRESS_HEX.slice(2))}${word((123456789n).toString(16))}deadbeef`;
            const decoded = decodeTrc20Transfer(data, OWNER_ADDRESS_HEX);
            assert.ok(decoded);
            assert.equal(decoded.method, 'transfer');
            assert.equal(decoded.fromHex, OWNER_ADDRESS_HEX);
            assert.equal(decoded.toHex, RECIPIENT_ADDRESS_HEX);
            assert.equal(decoded.rawAmount, 123456789n);
        },
    },
    {
        name: 'decodes transferFrom(address,address,uint256)',
        run: () => {
            const data = `23b872dd${word(OWNER_ADDRESS_HEX.slice(2))}${word(RECIPIENT_ADDRESS_HEX.slice(2))}${word('ff')}`;
            const decoded = decodeTrc20Transfer(data, '41' + '99'.repeat(20));
            assert.ok(decoded);
            assert.equal(decoded.method, 'transferFrom');
            assert.equal(decoded.fromHex, OWNER_ADDRESS_HEX);
            assert.equal(decoded.rawAmount, 255n);
        },
    },
    {
        name: 'returns null for other selectors and truncated data',
        run: () => {
            assert.equal(decodeTrc20Transfer('095ea7b3' + '0'.repeat(128), OWNER_ADDRESS_HEX), null);
            assert.equal(decodeTrc20Transfer('a9059cbb1234', OWNER_ADDRESS_HEX), null);
            assert.equal(decodeTrc20Transfer(undefined, OWNER_ADDRESS_HEX), null);
        },
    },
    {
        name: 'treats REVERT / OUT_OF_ENERGY as failed and missing ret as success',
        run: () => {
            assert.equal(isTransactionSuccessful({ ret: [{ contractRet: 'SUCCESS' }] }), true);
            assert.equal(isTransactionSuccessful({ ret: [{ contractRet: 'REVERT' }] }), false);
            assert.equal(isTransactionSuccessful({ ret: [{ contractRet: 'OUT_OF_ENERGY' }] }), false);
            assert.equal(isTransactionSuccessful({}), true);
        },
    },
    {
        name: 'converts large raw amounts without precision loss in the integer part',
        run: () => {
            assert.equal(toUnits(82597000000n, 6), 82597);
            assert.equal(toUnits(1103890000000n, 6), 1103890);
            assert.equal(toUnits(1500000n, 6), 1.5);
        },
    },
];
