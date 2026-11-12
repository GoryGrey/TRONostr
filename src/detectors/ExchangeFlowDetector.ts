import { Detector, Insight } from './Detector';
import { blockMetaFromTx } from './WhaleTransferDetector';
import { decodeTrc20Transfer, hexToBase58, isTransactionSuccessful, normalizeHexAddress, toUnits } from './tronUtils';
import { Severity } from '../schema';

/**
 * Labels TRX and USDT-TRC20 transfers that touch a user-supplied address book of exchange (or any
 * other entity) wallets, and classifies them as inflow / outflow / internal.
 *
 * TRONostr deliberately ships NO built-in exchange labels: address attribution must come from a
 * source the operator trusts and can cite (e.g. an exchange's published proof-of-reserves wallets
 * or a block explorer's public tag). Configure entries under detectors.exchangeFlow.addresses.
 */
export interface LabeledAddress {
    address: string;
    label: string;
    /** Where this label came from, kept in every event for auditability. */
    source?: string;
}

export interface ExchangeFlowConfig {
    addresses: LabeledAddress[];
    trxThreshold: number;
    usdtThreshold: number;
    usdtContract: string;
    highMultiplier?: number;
}

export class ExchangeFlowDetector implements Detector {
    name = 'ExchangeFlowDetector';
    private readonly book = new Map<string, LabeledAddress>();
    private readonly trxThreshold: number;
    private readonly usdtThreshold: number;
    private readonly usdtContract: string;
    private readonly highMultiplier: number;

    constructor(config: ExchangeFlowConfig) {
        for (const entry of config.addresses ?? []) {
            if (!entry?.address || !entry?.label) {
                throw new Error('exchangeFlow address entries need both "address" and "label"');
            }
            this.book.set(normalizeHexAddress(entry.address), entry);
        }
        this.trxThreshold = config.trxThreshold;
        this.usdtThreshold = config.usdtThreshold;
        this.usdtContract = normalizeHexAddress(config.usdtContract);
        this.highMultiplier = config.highMultiplier ?? 10;
    }

    get labeledAddressCount() {
        return this.book.size;
    }

    onBlock(_block: any): Insight[] {
        return [];
    }

    onTransaction(tx: any): Insight[] {
        const insights: Insight[] = [];
        if (this.book.size === 0 || !tx?.raw_data?.contract || !isTransactionSuccessful(tx)) {
            return insights;
        }
        const block = blockMetaFromTx(tx);

        for (const contract of tx.raw_data.contract) {
            const value = contract?.parameter?.value;
            if (!value) {
                continue;
            }
            try {
                let asset: 'TRX' | 'USDT' | null = null;
                let fromHex = '';
                let toHex = '';
                let amount = 0;

                if (contract.type === 'TransferContract') {
                    asset = 'TRX';
                    fromHex = String(value.owner_address).toLowerCase();
                    toHex = String(value.to_address).toLowerCase();
                    amount = toUnits(BigInt(value.amount ?? 0), 6);
                } else if (contract.type === 'TriggerSmartContract'
                    && String(value.contract_address || '').toLowerCase() === this.usdtContract) {
                    const decoded = decodeTrc20Transfer(value.data, String(value.owner_address || ''));
                    if (!decoded) {
                        continue;
                    }
                    asset = 'USDT';
                    fromHex = decoded.fromHex;
                    toHex = decoded.toHex;
                    amount = toUnits(decoded.rawAmount, 6);
                }

                if (!asset) {
                    continue;
                }
                const threshold = asset === 'TRX' ? this.trxThreshold : this.usdtThreshold;
                if (amount < threshold) {
                    continue;
                }

                const fromLabel = this.book.get(fromHex);
                const toLabel = this.book.get(toHex);
                if (!fromLabel && !toLabel) {
                    continue;
                }
                const direction = fromLabel && toLabel ? 'internal' : toLabel ? 'inflow' : 'outflow';
                const entity = (direction === 'outflow' ? fromLabel : toLabel)!;
                const severity: Severity = amount >= threshold * this.highMultiplier ? 'high' : 'medium';

                insights.push({
                    type: 'EXCHANGE_FLOW',
                    timestamp: tx.raw_data.timestamp || Date.now(),
                    severity,
                    content: {
                        schema: 'tronostr.v1',
                        chain: 'tron',
                        category: 'flow',
                        eventType: 'exchange_flow',
                        asset,
                        severity,
                        source: { detector: this.name },
                        ...(block ? { block } : {}),
                        transaction: { hash: tx.txID },
                        data: {
                            direction,
                            entity: entity.label,
                            labelSource: entity.source ?? null,
                            from: hexToBase58(fromHex),
                            fromLabel: fromLabel?.label ?? null,
                            to: hexToBase58(toHex),
                            toLabel: toLabel?.label ?? null,
                            amount,
                        },
                    },
                });
            } catch {
                // skip malformed payloads
            }
        }

        return insights;
    }
}
