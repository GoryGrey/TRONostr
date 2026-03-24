import { runCases } from './runner';
import { whaleTransferDetectorCases } from './WhaleTransferDetector.test';
import { blockMetricsDetectorCases } from './BlockMetricsDetector.test';
import { publisherCases } from './Publisher.test';
import { clientCases } from './Client.test';
import { alertCases } from './Alerts.test';
import { schemaCases } from './Schema.test';
import { watcherCases } from './Watcher.test';
import { checkpointStoreCases } from './CheckpointStore.test';
import { sdkCases } from './SDK.test';
import { statusTrackerCases } from './StatusTracker.test';
import { webhookOutputCases } from './WebhookOutput.test';

async function main() {
    const suites = [
        ['WhaleTransferDetector', whaleTransferDetectorCases] as const,
        ['BlockMetricsDetector', blockMetricsDetectorCases] as const,
        ['Publisher', publisherCases] as const,
        ['Client', clientCases] as const,
        ['Alerts', alertCases] as const,
        ['Schema', schemaCases] as const,
        ['Watcher', watcherCases] as const,
        ['CheckpointStore', checkpointStoreCases] as const,
        ['SDK', sdkCases] as const,
        ['StatusTracker', statusTrackerCases] as const,
        ['WebhookOutput', webhookOutputCases] as const,
    ];

    for (const [suiteName, cases] of suites) {
        await runCases(suiteName, cases);
    }

    console.log('All tests passed.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
