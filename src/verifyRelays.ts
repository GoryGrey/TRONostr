import * as fs from 'fs';
import * as yaml from 'yaml';
import { Relay } from 'nostr-tools';
import { WebSocket } from 'ws';

if (typeof (global as any).WebSocket === 'undefined') {
    (global as any).WebSocket = WebSocket;
}

async function main() {
    const config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));
    let successCount = 0;

    for (const url of config.nostr.relays as string[]) {
        try {
            const relay = await Relay.connect(url);
            console.log(`[verify:relays] Connected: ${url}`);
            relay.close();
            successCount += 1;
        } catch (error) {
            console.error(`[verify:relays] Failed: ${url} ${(error as Error).message}`);
        }
    }

    if (successCount === 0) {
        throw new Error('No relays were reachable.');
    }
}

main().catch((error) => {
    console.error('[verify:relays] Failed:', error);
    process.exit(1);
});
