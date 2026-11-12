import { TronWeb } from 'tronweb';

/** TRC-20 method selectors (first 4 bytes of keccak256 of the signature). */
export const TRC20_TRANSFER_SELECTOR = 'a9059cbb'; // transfer(address,uint256)
export const TRC20_TRANSFER_FROM_SELECTOR = '23b872dd'; // transferFrom(address,address,uint256)

/**
 * A transaction included in a block can still have failed (e.g. REVERT or OUT_OF_ENERGY).
 * TRON reports this per transaction in `ret[0].contractRet`. Native transfers usually report
 * "SUCCESS" too; a missing `ret` is treated as success for compatibility with older fixtures.
 */
export function isTransactionSuccessful(tx: any): boolean {
    const ret = Array.isArray(tx?.ret) ? tx.ret[0] : undefined;
    if (!ret || ret.contractRet === undefined) {
        return true;
    }
    return ret.contractRet === 'SUCCESS';
}

export function hexToBase58(hexAddress: string): string {
    return TronWeb.address.fromHex(hexAddress);
}

export function normalizeHexAddress(address: string): string {
    return TronWeb.address.toHex(address).toLowerCase();
}

/** Converts a raw integer string/bigint with `decimals` to a JS number (safe for display/thresholds). */
export function toUnits(raw: bigint, decimals: number): number {
    const base = 10n ** BigInt(decimals);
    const whole = raw / base;
    const frac = raw % base;
    return Number(whole) + Number(frac) / Number(base);
}

export interface DecodedTrc20Transfer {
    method: 'transfer' | 'transferFrom';
    fromHex: string;
    toHex: string;
    rawAmount: bigint;
}

function wordToAddressHex(word: string): string {
    if (word.length !== 64 || !/^[0-9a-fA-F]+$/.test(word)) {
        throw new Error('invalid ABI address word');
    }
    return '41' + word.substring(24).toLowerCase();
}

function wordToUint(word: string): bigint {
    if (word.length !== 64 || !/^[0-9a-fA-F]+$/.test(word)) {
        throw new Error('invalid ABI uint word');
    }
    return BigInt('0x' + word);
}

/**
 * Decodes TRC-20 transfer / transferFrom calldata. Returns null for any other method or malformed data.
 * `ownerHex` is the transaction signer, used as `from` for `transfer`.
 */
export function decodeTrc20Transfer(data: string | undefined, ownerHex: string): DecodedTrc20Transfer | null {
    if (!data) {
        return null;
    }
    const clean = data.startsWith('0x') ? data.slice(2) : data;
    const selector = clean.substring(0, 8).toLowerCase();

    try {
        if (selector === TRC20_TRANSFER_SELECTOR) {
            return {
                method: 'transfer',
                fromHex: ownerHex.toLowerCase(),
                toHex: wordToAddressHex(clean.substring(8, 72)),
                rawAmount: wordToUint(clean.substring(72, 136)),
            };
        }
        if (selector === TRC20_TRANSFER_FROM_SELECTOR) {
            return {
                method: 'transferFrom',
                fromHex: wordToAddressHex(clean.substring(8, 72)),
                toHex: wordToAddressHex(clean.substring(72, 136)),
                rawAmount: wordToUint(clean.substring(136, 200)),
            };
        }
    } catch {
        return null;
    }
    return null;
}
