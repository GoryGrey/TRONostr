import { TRONostrClient } from '../src/Client';

async function main() {
    console.log("-----------------------------------------");
    console.log("TRONostr Bot Example Starting...");
    console.log("-----------------------------------------");

    const client = new TRONostrClient({
        relays: [
            "wss://nos.lol",
            "wss://relay.damus.io"
        ]
    });

    await client.connect();

    // 1. Listen for all WHALE transfers
    client.onTransfer((event) => {
        const data = event.parsedContent;
        console.log(`[BOT] 🚨 WHALE ALERT! ${data.amount} ${data.asset || 'TRX'} moved!`);
        console.log(`[BOT] From: ${data.from} -> To: ${data.to}`);
        console.log(`[BOT] Tx: https://tronscan.org/#/transaction/${data.hash}`);
        console.log("-----------------------------------------");
    });

    // 2. Listen for Block Metrics
    client.onBlock((event) => {
        const data = event.parsedContent;
        console.log(`[BOT] 📊 Block #${data.height} processed with ${data.txCount} transactions.`);
    });

    // 3. Listen for High Severity alerts specifically
    client.onAlerts((event) => {
        console.log(`[BOT] 🔥 CRITICAL EVENT DETECTED! Kind: ${event.kind}`);
        console.log(`[BOT] Data:`, JSON.stringify(event.parsedContent, null, 2));
    });

    process.on('SIGINT', () => {
        console.log("Shutting down bot...");
        client.close();
        process.exit();
    });
}

main().catch(console.error);
