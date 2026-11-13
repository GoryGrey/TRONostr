import { Detector, Insight } from './Detector';
import { blockMetaFromTx } from './WhaleTransferDetector';
import { hexToBase58, isTransactionSuccessful, toUnits } from './tronUtils';
import { Severity } from '../schema';

/**
 * Detects large Stake 2.0 resource delegations on TRON.
 *
 * TRON transactions are paid with ENERGY and BANDWIDTH, which come from staked TRX. Holders can
 * delegate those resources to other accounts (DelegateResourceContract) and take them back
 * (UnDelegateResourceContract). This is how the TRON "energy rental" market works, and large
 * delegations are a useful signal for analytics: who is subsidising USDT throughput, when big
 * rental providers rebalance, and when a large holder's stake moves.
 *
 * `balance` in these contracts is the amount of staked TRX (in SUN) backing the delegation.
 */
export interface ResourceDelegationConfig {
    /** Minimum staked TRX backing the (un)delegation to emit an event. */
    trxThreshold: number;
    /** Which resources to watch. Default both. */
    resources?: Array<'ENERGY' | 'BANDWIDTH'>;
    /** Emit undelegations too. Default true. */
    includeUndelegations?: boolean;
    highMultiplier?: number;
}

export class ResourceDelegationDetector implements Detector {
    name = 'ResourceDelegationDetector';
    private readonly trxThreshold: number;
    private readonly resources: Set<string>;
    private readonly includeUndelegations: boolean;
    private readonly highMultiplier: number;

    constructor(config: ResourceDelegationConfig) {
        this.trxThreshold = config.trxThreshold;
        this.resources = new Set(config.resources ?? ['ENERGY', 'BANDWIDTH']);
        this.includeUndelegations = config.includeUndelegations ?? true;
        this.highMultiplier = config.highMultiplier ?? 10;
    }

    onBlock(_block: any): Insight[] {
        return [];
    }

    onTransaction(tx: any): Insight[] {
        const insights: Insight[] = [];
        if (!tx?.raw_data?.contract || !isTransactionSuccessful(tx)) {
            return insights;
        }
        const block = blockMetaFromTx(tx);

        for (const contract of tx.raw_data.contract) {
            const isDelegate = contract?.type === 'DelegateResourceContract';
            const isUndelegate = contract?.type === 'UnDelegateResourceContract';
            if (!isDelegate && !(isUndelegate && this.includeUndelegations)) {
                continue;
            }
            const value = contract.parameter?.value;
            if (!value) {
                continue;
            }
            // Protobuf JSON omits enum default values: a missing resource means BANDWIDTH (0).
            const resource: 'ENERGY' | 'BANDWIDTH' = value.resource === 'ENERGY' ? 'ENERGY' : 'BANDWIDTH';
            if (!this.resources.has(resource)) {
                continue;
            }

            try {
                const stakedTrx = toUnits(BigInt(value.balance ?? 0), 6);
                if (stakedTrx < this.trxThreshold) {
                    continue;
                }
                const severity: Severity = stakedTrx >= this.trxThreshold * this.highMultiplier ? 'high' : 'medium';
                const data: Record<string, unknown> = {
                    action: isDelegate ? 'delegate' : 'undelegate',
                    resource,
                    owner: hexToBase58(value.owner_address),
                    receiver: hexToBase58(value.receiver_address),
                    stakedTrx,
                };
                if (isDelegate) {
                    data.lock = Boolean(value.lock);
                    if (value.lock_period !== undefined) {
                        // lock_period is expressed in blocks (~3s each).
                        data.lockPeriodBlocks = Number(value.lock_period);
                    }
                }

                insights.push({
                    type: 'RESOURCE_DELEGATION',
                    timestamp: tx.raw_data.timestamp || Date.now(),
                    severity,
                    content: {
                        schema: 'tronostr.v1',
                        chain: 'tron',
                        category: 'resource',
                        eventType: 'resource_delegation',
                        asset: 'TRX',
                        severity,
                        source: { detector: this.name },
                        ...(block ? { block } : {}),
                        transaction: { hash: tx.txID },
                        data,
                    },
                });
            } catch {
                // skip malformed payloads
            }
        }

        return insights;
    }
}
