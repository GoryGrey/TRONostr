import { LabeledAddress } from '../detectors/ExchangeFlowDetector';

/**
 * Address labels with a cited public source. Nothing here is guessed or inferred by TRONostr.
 *
 * Source: Tronscan's public address tags ("addressTag"), as returned by Tronscan's public API for
 * the top 200 USDT-TRC20 holders:
 *   GET https://apilist.tronscanapi.com/api/token_trc20/holders
 *       ?contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&start=0..160&limit=40
 * Retrieved 2026-11-12 (~19:55 UTC). The raw response is kept in
 * docs/labels-evidence/tronscan-usdt-top200-holders-2026-11-12.json.
 *
 * Caveats (also in docs/LABELS.md):
 * - These are explorer-attributed tags, not statements by the exchanges themselves.
 * - Only addresses that had a non-empty tag in that response are included (13 of 200).
 * - Exchanges operate many more wallets; flows to/from unlisted wallets are not detected.
 * - Tags can change. Re-verify before relying on them, and refresh this list periodically.
 */
export const TRONSCAN_TAG_SOURCE = 'Tronscan public address tag (apilist.tronscanapi.com token_trc20/holders, USDT top-200, retrieved 2026-11-12)';

export interface PublicLabel extends LabeledAddress {
    category: 'exchange' | 'issuer';
    /** Explorer page for manual re-verification. */
    explorerUrl: string;
}

const entries: Array<[string, string, PublicLabel['category']]> = [
    ['TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs', 'Tether Treasury', 'issuer'],
    ['TJCo98saj6WND61g1uuKwJ9GMWMT9WkJFo', 'Binance 3', 'exchange'],
    ['TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb', 'Binance-Cold 2', 'exchange'],
    ['TJTKCzQpsG19CSMYF9TPtxz6wSHPSyeKfa', 'Binance-Hot 12', 'exchange'],
    ['TG2CMGxnTPgQ6V58kiKd7wbyN8ewtAmY76', 'Kraken: Hot Wallet', 'exchange'],
    ['TXFBqBbqJommqZf7BV8NNYzePh97UmJodJ', 'Bitfinex', 'exchange'],
    ['TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa', 'Bybit', 'exchange'],
    ['TTH75Z9rfRgzCLNDDYBaR2WjUvuSDRtSMg', 'Bybit Cold', 'exchange'],
    ['TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv', 'OKX Hot Wallet 8', 'exchange'],
    ['TBA6CypYJizwA9XdC7Ubgc5F1bxrQ7SqPt', 'Gate', 'exchange'],
    ['TK1U4Hym23Jz9fP3p8oker4A8VQdoq88Ms', 'KuCoin 10', 'exchange'],
    ['TUpHuDkiCCmwaTZBHZvQdwWzGNm5t8J2b9', 'Kucoin 4', 'exchange'],
    ['TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb', 'Bitget 9', 'exchange'],
];

export const PUBLIC_LABELS: ReadonlyArray<PublicLabel> = entries.map(([address, label, category]) => ({
    address,
    label,
    category,
    source: TRONSCAN_TAG_SOURCE,
    explorerUrl: `https://tronscan.org/#/address/${address}`,
}));

/** Merge operator-supplied labels with the bundled public ones. Operator entries win on conflict. */
export function mergeLabels(operator: LabeledAddress[] = [], includePublic = false): LabeledAddress[] {
    const byAddress = new Map<string, LabeledAddress>();
    if (includePublic) {
        for (const l of PUBLIC_LABELS) byAddress.set(l.address, { address: l.address, label: l.label, source: l.source });
    }
    for (const l of operator) byAddress.set(l.address, l);
    return Array.from(byAddress.values());
}
