import { Detector, Insight } from './Detector';
import { decodeTrc20Transfer, hexToBase58, isTransactionSuccessful, normalizeHexAddress, toUnits } from './tronUtils';
import { Severity } from '../schema';

export interface WhaleConfig {
    trxThreshold: number;
    usdtThreshold: number;
    usdtContract: string;
    /** Multiplier over the threshold at which an event is raised to "high". Default 10. */
    highMultiplier?: number;
}

export function blockMetaFromTx(tx: any) {
    const meta = tx?.tronostrBlock;
    if (meta && Number.isInteger(meta.height)) {
        return { height: meta.height as number, hash: meta.hash as string | undefined, timestamp: meta.timestamp as number | undefined };
    }
    return undefined;
}

export class WhaleTransferDetector implements Detector {
    name = "WhaleTransferDetector";
    private trxThreshold: number;
    private usdtThreshold: number;
    private usdtContract: string;
    private highMultiplier: number;

    constructor(config: WhaleConfig) {
        this.trxThreshold = config.trxThreshold;
        this.usdtThreshold = config.usdtThreshold;
        this.usdtContract = normalizeHexAddress(config.usdtContract);
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

        const timestamp = tx.raw_data.timestamp || Date.now();
        const block = blockMetaFromTx(tx);

        for (const contract of tx.raw_data.contract) {
            const value = contract?.parameter?.value;
            if (!value) {
                continue;
            }

            try {
                if (contract.type === 'TransferContract') {
                    const amount = toUnits(BigInt(value.amount ?? 0), 6);
                    if (amount >= this.trxThreshold) {
                        const severity = this.severityFor(amount, this.trxThreshold);
                        insights.push({
                            type: 'TRX_TRANSFER',
                            timestamp,
                            severity,
                            content: {
                                schema: 'tronostr.v1',
                                chain: 'tron',
                                category: 'transfer',
                                eventType: 'trx_transfer',
                                asset: 'TRX',
                                severity,
                                source: { detector: this.name },
                                ...(block ? { block } : {}),
                                transaction: { hash: tx.txID },
                                data: {
                                    from: hexToBase58(value.owner_address),
                                    to: hexToBase58(value.to_address),
                                    amount,
                                },
                            },
                        });
                    }
                }

                if (contract.type === 'TriggerSmartContract') {
                    const target = String(value.contract_address || '').toLowerCase();
                    if (target !== this.usdtContract) {
                        continue;
                    }
                    const decoded = decodeTrc20Transfer(value.data, String(value.owner_address || ''));
                    if (!decoded) {
                        continue;
                    }
                    const amount = toUnits(decoded.rawAmount, 6);
                    if (amount >= this.usdtThreshold) {
                        const severity = this.severityFor(amount, this.usdtThreshold);
                        insights.push({
                            type: 'USDT_TRANSFER',
                            timestamp,
                            severity,
                            content: {
                                schema: 'tronostr.v1',
                                chain: 'tron',
                                category: 'transfer',
                                eventType: 'usdt_transfer',
                                asset: 'USDT',
                                severity,
                                source: { detector: this.name },
                                ...(block ? { block } : {}),
                                transaction: { hash: tx.txID },
                                data: {
                                    from: hexToBase58(decoded.fromHex),
                                    to: hexToBase58(decoded.toHex),
                                    amount,
                                    method: decoded.method,
                                },
                            },
                        });
                    }
                }
            } catch {
                // Malformed contract payloads are skipped rather than crashing the pipeline.
            }
        }

        return insights;
    }

    private severityFor(amount: number, threshold: number): Severity {
        return amount >= threshold * this.highMultiplier ? 'high' : 'medium';
    }
}
