# Address labels

TRONostr attributes an address to an entity only when the attribution has a public source that
anyone can check. It never guesses from transaction patterns.

## Bundled labels: Tronscan public tags (13 addresses)

- **Where**: `src/labels/publicLabels.ts` (`PUBLIC_LABELS`). Turn them on with
  `detectors.exchangeFlow.usePublicLabels: true`, which is the default in `config.yaml`.
- **Source**: Tronscan's public address tag (`addressTag`) from its public API for the top 200
  USDT-TRC20 holders:
  `GET https://apilist.tronscanapi.com/api/token_trc20/holders?contract_address=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&start={0,40,80,120,160}&limit=40`
- **Retrieved**: 2026-11-12, around 19:55 UTC. The raw response, trimmed to address, tag and
  balance, is committed as evidence in
  `docs/labels-evidence/tronscan-usdt-top200-holders-2026-11-12.json`.
- **Selection rule**: every one of the 200 holders that had a non-empty tag was included. That is
  13 addresses, with nothing added or removed by hand. `Tether Treasury` is categorised `issuer`;
  the rest are `exchange`.

| address | Tronscan tag | category |
| --- | --- | --- |
| TKHuVq1oKVruCGLvqVexFs6dawKv6fQgFs | Tether Treasury | issuer |
| TJCo98saj6WND61g1uuKwJ9GMWMT9WkJFo | Binance 3 | exchange |
| TWd4WrZ9wn84f5x1hZhL4DHvk738ns5jwb | Binance-Cold 2 | exchange |
| TJTKCzQpsG19CSMYF9TPtxz6wSHPSyeKfa | Binance-Hot 12 | exchange |
| TG2CMGxnTPgQ6V58kiKd7wbyN8ewtAmY76 | Kraken: Hot Wallet | exchange |
| TXFBqBbqJommqZf7BV8NNYzePh97UmJodJ | Bitfinex | exchange |
| TU4vEruvZwLLkSfV9bNw12EJTPvNr7Pvaa | Bybit | exchange |
| TTH75Z9rfRgzCLNDDYBaR2WjUvuSDRtSMg | Bybit Cold | exchange |
| TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv | OKX Hot Wallet 8 | exchange |
| TBA6CypYJizwA9XdC7Ubgc5F1bxrQ7SqPt | Gate | exchange |
| TK1U4Hym23Jz9fP3p8oker4A8VQdoq88Ms | KuCoin 10 | exchange |
| TUpHuDkiCCmwaTZBHZvQdwWzGNm5t8J2b9 | Kucoin 4 | exchange |
| TJ7hhYhVhaxNx6BPyq7yFpqZrQULL3JSdb | Bitget 9 | exchange |

## Caveats

- These tags come from a block explorer. They are not statements by the exchanges, and TRONostr has
  not independently confirmed them with each exchange.
- Exchanges operate many more wallets than these. Inflow and outflow numbers are therefore a
  **lower bound on flows touching these specific wallets**, not exchange totals.
- Tronscan's per-address endpoint (`/api/accountv2`) returned empty responses without an API key
  during this check, so each tag was confirmed only through the holders list. Re-check any address
  by hand at `https://tronscan.org/#/address/<address>`.
- Tags can change. Refresh the list periodically, re-run the same request, and commit new
  evidence alongside any change.

## Your own labels

Add entries under `detectors.exchangeFlow.addresses` with an `address`, a `label`, and a `source`
(for example an exchange's published proof-of-reserves wallet list). Operator entries override
bundled ones on the same address. The `source` travels with every `exchange_flow` event as
`data.labelSource`.
