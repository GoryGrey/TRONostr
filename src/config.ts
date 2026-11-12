import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Detector } from './detectors/Detector';
import { WhaleTransferDetector } from './detectors/WhaleTransferDetector';
import { BlockMetricsDetector } from './detectors/BlockMetricsDetector';
import { ResourceDelegationDetector } from './detectors/ResourceDelegationDetector';
import { ExchangeFlowDetector } from './detectors/ExchangeFlowDetector';

/** Loads config.yaml from TRONOSTR_CONFIG, then ./config.yaml, then the packaged default. */
export function loadConfig(explicitPath?: string): any {
    const candidates = [
        explicitPath,
        process.env.TRONOSTR_CONFIG,
        path.resolve(process.cwd(), 'config.yaml'),
        path.resolve(__dirname, '..', 'config.yaml'),
    ].filter((p): p is string => Boolean(p));

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return yaml.parse(fs.readFileSync(candidate, 'utf8'));
        }
    }
    throw new Error(`No config.yaml found. Looked in: ${candidates.join(', ')}`);
}

export function buildDetectors(config: any, log: (msg: string) => void = () => undefined): Detector[] {
    const d = config.detectors ?? {};
    const usdtContract = d.whaleTransfer?.usdtContract ?? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    const detectors: Detector[] = [];

    if (d.whaleTransfer?.enabled) {
        detectors.push(new WhaleTransferDetector(d.whaleTransfer));
        log('Enabled: WhaleTransferDetector');
    }
    if (d.blockMetrics?.enabled) {
        detectors.push(new BlockMetricsDetector());
        log('Enabled: BlockMetricsDetector');
    }
    if (d.resourceDelegation?.enabled) {
        detectors.push(new ResourceDelegationDetector(d.resourceDelegation));
        log('Enabled: ResourceDelegationDetector');
    }
    if (d.exchangeFlow?.enabled) {
        const detector = new ExchangeFlowDetector({
            addresses: d.exchangeFlow.addresses ?? [],
            trxThreshold: d.exchangeFlow.trxThreshold ?? 100000,
            usdtThreshold: d.exchangeFlow.usdtThreshold ?? 50000,
            usdtContract,
        });
        detectors.push(detector);
        log(`Enabled: ExchangeFlowDetector (${detector.labeledAddressCount} labeled address(es))`);
    }
    return detectors;
}
