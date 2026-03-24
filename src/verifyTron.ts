import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as yaml from 'yaml';
import { TronWeb } from 'tronweb';

dotenv.config();

async function main() {
    const config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));
    const tronWeb = new TronWeb({
        fullHost: config.tron.fullHost,
        eventServer: config.tron.eventServer,
        headers: process.env.TRON_PRO_API_KEY ? { 'TRON-PRO-API-KEY': process.env.TRON_PRO_API_KEY } : {},
    });

    const block = await tronWeb.trx.getCurrentBlock();
    const raw = block?.block_header?.raw_data;

    if (!raw || !Number.isInteger(raw.number)) {
        throw new Error('TRON connectivity check returned an invalid block payload.');
    }

    console.log(`[verify:tron] Connected to ${config.tron.fullHost}`);
    console.log(`[verify:tron] Latest block height=${raw.number} timestamp=${raw.timestamp}`);
}

main().catch((error) => {
    console.error('[verify:tron] Failed:', error);
    process.exit(1);
});
