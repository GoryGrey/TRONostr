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
        // In TronWeb v6, some utilities might be under TronWeb.utils
        this.usdtContract = TronWeb.address.toHex(config.usdtContract);
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
                    if (amount >= this.trxThreshold) {
                        insights.push({
                            type: 'TRX_TRANSFER',
                            timestamp: tx.raw_data.timestamp || Date.now(),
                            severity: amount >= this.trxThreshold * 10 ? 'high' : 'medium',
                            content: {
                                from: TronWeb.address.fromHex(contract.parameter.value.owner_address),
                                to: TronWeb.address.fromHex(contract.parameter.value.to_address),
                                amount: amount,
                                hash: tx.txID
                            },
                            tags: [['chain', 'tron'], ['asset', 'TRX'], ['type', 'whale_transfer']]
                        });
                    }
                }

                if (contract.type === 'TriggerSmartContract') {
                    const targetContract = contract.parameter.value.contract_address;
                    if (targetContract === this.usdtContract) {
                        const data = contract.parameter.value.data;
                        if (data && data.startsWith('a9059cbb')) {
                            try {
                                const toHex = '41' + data.substring(32, 72);
                                const toAddress = TronWeb.address.fromHex(toHex);
                                const amountHex = data.substring(72);
                                const amount = parseInt(amountHex, 16) / 1000000;

                                if (amount >= this.usdtThreshold) {
                                    insights.push({
                                        type: 'USDT_TRANSFER',
                                        timestamp: tx.raw_data.timestamp || Date.now(),
                                        severity: amount >= this.usdtThreshold * 10 ? 'high' : 'medium',
                                        content: {
                                            from: TronWeb.address.fromHex(contract.parameter.value.owner_address),
                                            to: toAddress,
                                            amount: amount,
                                            hash: tx.txID
                                        },
                                        tags: [['chain', 'tron'], ['asset', 'USDT'], ['type', 'whale_transfer']]
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
