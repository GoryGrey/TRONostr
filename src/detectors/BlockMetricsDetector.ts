import { Detector, Insight } from './Detector';
import { decodeTrc20Transfer, isTransactionSuccessful, normalizeHexAddress } from './tronUtils';

export interface BlockMetricsConfig {
    /** USDT-TRC20 contract (base58 or hex). When set, successful USDT transfer() calls are counted per block. */
    usdtContract?: string;
}

/**
 * One telemetry event per block. Besides height/hash/txCount it carries per-block activity counts
 * over ALL successful transactions (not only whale-sized ones), which power the hourly trend
 * series: TRX transfers, USDT transfers, and Stake 2.0 delegate/undelegate calls (the energy
 * rental market).
 */
export class BlockMetricsDetector implements Detector {
    name = "BlockMetricsDetector";
    private readonly usdtContract?: string;

    constructor(config: BlockMetricsConfig = {}) {
        this.usdtContract = config.usdtContract ? normalizeHexAddress(config.usdtContract) : undefined;
    }

    onBlock(block: any): Insight[] {
        const insights: Insight[] = [];
        const blockHeader = block.block_header.raw_data;
        const transactions: any[] = Array.isArray(block.transactions) ? block.transactions : [];
        const txCount = transactions.length;

        const activity = { trxTransfers: 0, usdtTransfers: 0, delegations: 0, undelegations: 0, energyDelegations: 0, failedTx: 0 };
        for (const tx of transactions) {
            const contracts = tx?.raw_data?.contract;
            if (!Array.isArray(contracts)) continue;
            if (!isTransactionSuccessful(tx)) {
                activity.failedTx += 1;
                continue;
            }
            for (const c of contracts) {
                switch (c?.type) {
                    case 'TransferContract':
                        activity.trxTransfers += 1;
                        break;
                    case 'DelegateResourceContract':
                        activity.delegations += 1;
                        if (c.parameter?.value?.resource === 'ENERGY') activity.energyDelegations += 1;
                        break;
                    case 'UnDelegateResourceContract':
                        activity.undelegations += 1;
                        break;
                    case 'TriggerSmartContract': {
                        const v = c.parameter?.value;
                        if (this.usdtContract && v && String(v.contract_address || '').toLowerCase() === this.usdtContract
                            && decodeTrc20Transfer(v.data, String(v.owner_address || ''))) {
                            activity.usdtTransfers += 1;
                        }
                        break;
                    }
                }
            }
        }

        insights.push({
            type: 'TRON_BLOCK',
            timestamp: blockHeader.timestamp,
            severity: 'info',
            content: {
                schema: 'tronostr.v1',
                chain: 'tron',
                category: 'telemetry',
                eventType: 'block_metrics',
                severity: 'info',
                source: {
                    detector: this.name,
                },
                block: {
                    height: blockHeader.number,
                    hash: block.blockID,
                    timestamp: blockHeader.timestamp,
                },
                data: {
                    height: blockHeader.number,
                    hash: block.blockID,
                    txCount: txCount,
                    witness: blockHeader.witness_address,
                    activity,
                }
            },
        });

        return insights;
    }
}
