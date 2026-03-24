import { TRONostrClient } from '../src/lib';

async function main() {
    const client = new TRONostrClient({
        relays: ['wss://nos.lol', 'wss://relay.damus.io'],
    });

    await client.connect();

    client.onBlock((event) => {
        const payload = event.parsedContent;
        console.log(
            `[telemetry] height=${payload.block?.height} txCount=${payload.data.txCount} witness=${payload.data.witness}`,
        );
    });

    process.on('SIGINT', () => {
        client.close();
        process.exit(0);
    });
}

main().catch((error) => {
    console.error('[telemetry] Failed:', error);
    process.exit(1);
});
