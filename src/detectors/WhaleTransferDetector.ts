import { Detector, Insight } from './Detector';
import { TronWeb } from 'tronweb';

export interface WhaleConfig {
    trxThreshold: number;
    usdtThreshold: number;
    usdtContract: string;
}

export class WhaleTransferDetector implements Detector {
    name = "WhaleTransferDetector";
    private trxThreshold: number;
    private usdtThreshold: number;
    private usdtContract: string;

    constructor(config: WhaleConfig) {
        this.trxThreshold = config.trxThreshold;
        this.usdtThreshold = config.usdtThreshold;
        this.usdtContract = TronWeb.address.toHex(config.usdtContract).toLowerCase();
    }

    onBlock(block: any): Insight[] {
        return [];
    }

    onTransaction(tx: any): Insight[] {
        const insights: Insight[] = [];

        if (tx.raw_data && tx.raw_data.contract) {
            for (const contract of tx.raw_data.contract) {
                if (contract.type === 'TransferContract') {
                    const amount = contract.parameter.value.amount / 1000000;
                    const severity = amount >= this.trxThreshold * 10 ? 'high' : 'medium';
                    if (amount >= this.trxThreshold) {
                        insights.push({
                            type: 'TRX_TRANSFER',
                            timestamp: tx.raw_data.timestamp || Date.now(),
                            severity,
                            content: {
                                schema: 'tronostr.v1',
                                chain: 'tron',
                                category: 'transfer',
                                eventType: 'trx_transfer',
                                asset: 'TRX',
                                severity,
                                source: {
                                    detector: this.name,
                                },
                                transaction: {
                                    hash: tx.txID,
                                },
                                data: {
                                    from: TronWeb.address.fromHex(contract.parameter.value.owner_address),
                                    to: TronWeb.address.fromHex(contract.parameter.value.to_address),
                                    amount,
                                }
                            }
                        });
                    }
                }

                if (contract.type === 'TriggerSmartContract') {
                    const targetContract = String(contract.parameter.value.contract_address || '').toLowerCase();
                    if (targetContract === this.usdtContract) {
                        const data = contract.parameter.value.data;
                        if (data && data.startsWith('a9059cbb')) {
                            try {
                                const toHex = '41' + data.substring(32, 72);
                                const toAddress = TronWeb.address.fromHex(toHex);
                                const amountHex = data.substring(72);
                                const amount = parseInt(amountHex, 16) / 1000000;
                                const severity = amount >= this.usdtThreshold * 10 ? 'high' : 'medium';

                                if (amount >= this.usdtThreshold) {
                                    insights.push({
                                        type: 'USDT_TRANSFER',
                                        timestamp: tx.raw_data.timestamp || Date.now(),
                                        severity,
                                        content: {
                                            schema: 'tronostr.v1',
                                            chain: 'tron',
                                            category: 'transfer',
                                            eventType: 'usdt_transfer',
                                            asset: 'USDT',
                                            severity,
                                            source: {
                                                detector: this.name,
                                            },
                                            transaction: {
                                                hash: tx.txID,
                                            },
                                            data: {
                                                from: TronWeb.address.fromHex(contract.parameter.value.owner_address),
                                                to: toAddress,
                                                amount,
                                            }
                                        }
                                    });
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                }
            }
        }

        return insights;
    }
}
