import { TRONostrClient } from '../src/lib';

async function main() {
    const client = new TRONostrClient({
        relays: ['wss://nos.lol', 'wss://relay.damus.io'],
    });

    await client.connect();

    console.log('[bot] relay stats', client.getStats());

    client.onAlerts((event) => {
        const payload = event.parsedContent;
        console.log(`[bot] ${payload.severity.toUpperCase()} ${payload.eventType}`);
        console.log(`[bot] tx=${payload.transaction?.hash} amount=${payload.data.amount} asset=${payload.asset ?? 'TRX'}`);
    });

    client.onUSDTTransfer((event) => {
        const payload = event.parsedContent;
        console.log(`[bot] usdt flow from=${payload.data.from} to=${payload.data.to} amount=${payload.data.amount}`);
    });

    process.on('SIGINT', () => {
        client.close();
        process.exit(0);
    });
}

main().catch((error) => {
    console.error('[bot] Failed:', error);
    process.exit(1);
});
