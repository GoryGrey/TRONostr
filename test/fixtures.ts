import { TronWeb } from 'tronweb';
import { Insight } from '../src/detectors/Detector';
import { TRONostrEventContent } from '../src/schema';

export const TEST_PRIVATE_KEY = '1'.repeat(64);
export const TEST_KIND_RANGE = { start: 6500, end: 6599 };
export const TEST_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const OWNER_ADDRESS_HEX = '41' + '11'.repeat(20);
export const RECIPIENT_ADDRESS_HEX = '41' + '22'.repeat(20);

export function createTrxTransferTx(amountTrx: number) {
    return {
        txID: `trx-${amountTrx}`,
        raw_data: {
            timestamp: 1710001000000,
            contract: [
                {
                    type: 'TransferContract',
                    parameter: {
                        value: {
                            owner_address: OWNER_ADDRESS_HEX,
                            to_address: RECIPIENT_ADDRESS_HEX,
                            amount: amountTrx * 1_000_000,
                        },
                    },
                },
            ],
        },
    };
}

export function createUsdtTransferTx(amountUsdt: number, dataOverride?: string) {
    const toAddressWord = RECIPIENT_ADDRESS_HEX.slice(2).padStart(64, '0');
    const amountWord = Math.trunc(amountUsdt * 1_000_000).toString(16).padStart(64, '0');

    return {
        txID: `usdt-${amountUsdt}`,
        raw_data: {
            timestamp: 1710002000000,
            contract: [
                {
                    type: 'TriggerSmartContract',
                    parameter: {
                        value: {
                            owner_address: OWNER_ADDRESS_HEX,
                            contract_address: TronWeb.address.toHex(TEST_USDT_CONTRACT).toLowerCase(),
                            data: dataOverride ?? `a9059cbb${toAddressWord}${amountWord}`,
                        },
                    },
                },
            ],
        },
    };
}

export function createBlock(txCount = 2) {
    return {
        blockID: '0000000000000000blockhash',
        block_header: {
            raw_data: {
                number: 57000001,
                timestamp: 1710000000000,
                witness_address: OWNER_ADDRESS_HEX,
            },
        },
        transactions: Array.from({ length: txCount }, (_, index) => ({ txID: `tx-${index}` })),
    };
}

export function createInsight(
    overrides: Partial<TRONostrEventContent> = {},
    type: Insight['type'] = 'TRX_TRANSFER',
): Insight {
    const severity = overrides.severity ?? 'medium';
    return {
        type,
        timestamp: 1710003000000,
        severity,
        content: {
            schema: 'tronostr.v1',
            chain: 'tron',
            category: type === 'TRON_BLOCK' ? 'telemetry' : 'transfer',
            eventType: type === 'USDT_TRANSFER' ? 'usdt_transfer' : type === 'TRON_BLOCK' ? 'block_metrics' : 'trx_transfer',
            asset: type === 'USDT_TRANSFER' ? 'USDT' : type === 'TRX_TRANSFER' ? 'TRX' : undefined,
            severity,
            source: {
                detector: 'TestDetector',
            },
            ...(type === 'TRON_BLOCK' ? { block: { height: 10, hash: 'block-hash', timestamp: 1710003000000 } } : { transaction: { hash: 'tx-hash' } }),
            data: {
                amount: 42,
            },
            ...overrides,
        },
    };
}
