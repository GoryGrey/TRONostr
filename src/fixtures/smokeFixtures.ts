import { TronWeb } from 'tronweb';

const usdtContract = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

const ownerAddressHex = '41' + '11'.repeat(20);
const recipientAddressHex = '41' + '22'.repeat(20);

export function getSmokeConfig() {
    return {
        tron: {
            fullHost: 'https://api.trongrid.io',
            eventServer: 'https://api.trongrid.io',
        },
        nostr: {
            relays: ['memory://tronostr-demo'],
            kindRange: { start: 6500, end: 6599 },
            rateLimit: {
                eventsPerMinute: 120,
                queueSize: 20,
            },
        },
        detectors: {
            whaleTransfer: {
                enabled: true,
                trxThreshold: 1000,
                usdtThreshold: 1000,
                usdtContract,
            },
            blockMetrics: {
                enabled: true,
            },
        },
    };
}

export function getSmokeBlock() {
    return {
        blockID: '000000000000000000demo-block',
        block_header: {
            raw_data: {
                number: 57000001,
                timestamp: 1710000000000,
                witness_address: ownerAddressHex,
            },
        },
        transactions: [
            getSmokeTrxTransferTransaction(),
            getSmokeUsdtTransferTransaction(),
        ],
    };
}

export function getSmokeTrxTransferTransaction() {
    return {
        txID: 'trx-smoke-hash',
        raw_data: {
            timestamp: 1710000001000,
            contract: [
                {
                    type: 'TransferContract',
                    parameter: {
                        value: {
                            owner_address: ownerAddressHex,
                            to_address: recipientAddressHex,
                            amount: 2500 * 1_000_000,
                        },
                    },
                },
            ],
        },
    };
}

export function getSmokeUsdtTransferTransaction() {
    const toAddressWord = recipientAddressHex.slice(2).padStart(64, '0');
    const amountWord = (2500n * 1_000_000n).toString(16).padStart(64, '0');

    return {
        txID: 'usdt-smoke-hash',
        raw_data: {
            timestamp: 1710000002000,
            contract: [
                {
                    type: 'TriggerSmartContract',
                    parameter: {
                        value: {
                            owner_address: ownerAddressHex,
                            contract_address: TronWeb.address.toHex(usdtContract).toLowerCase(),
                            data: `a9059cbb${toAddressWord}${amountWord}`,
                        },
                    },
                },
            ],
        },
    };
}
