import { prepareTRONostrEvent } from '../src/lib';

function main() {
    const prepared = prepareTRONostrEvent(
        {
            type: 'USDT_TRANSFER',
            timestamp: 1710003000000,
            severity: 'high',
            content: {
                schema: 'tronostr.v1',
                chain: 'tron',
                category: 'transfer',
                eventType: 'usdt_transfer',
                asset: 'USDT',
                severity: 'high',
                source: {
                    detector: 'ExampleDetector',
                },
                transaction: {
                    hash: 'demo-tx-hash',
                },
                data: {
                    from: 'TDemoFromAddress',
                    to: 'TDemoToAddress',
                    amount: 2500000,
                },
            },
        },
        { start: 6500, end: 6599 },
    );

    console.log('[flow] prepared event envelope');
    console.log(JSON.stringify({
        kind: prepared.kind,
        created_at: prepared.created_at,
        tags: prepared.tags,
        event: prepared.parsedContent,
    }, null, 2));
}

main();
