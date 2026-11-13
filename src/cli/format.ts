import { PreparedTRONostrEvent } from '../eventEnvelope';
import { RuntimeStatusSnapshot } from '../runtime/StatusTracker';

export function formatBanner(title: string, subtitle: string) {
    return [
        '==================================================',
        title,
        subtitle,
        '==================================================',
    ].join('\n');
}

export function formatSection(title: string) {
    return [
        '',
        title,
        '-'.repeat(Math.max(title.length, 12)),
    ].join('\n');
}

export function formatStatusSnapshot(snapshot: RuntimeStatusSnapshot) {
    const eventTypeLines = Object.entries(snapshot.eventTypeCounts)
        .map(([eventType, count]) => `  ${eventType}: ${count}`)
        .join('\n') || '  none';

    return [
        'Status Snapshot',
        `  activeRelays: ${snapshot.activeRelayCount}`,
        `  queueLength: ${snapshot.queueLength}`,
        `  latestBlockSeen: ${snapshot.latestBlockSeen ?? 'n/a'}`,
        `  eventsProcessed: ${snapshot.eventsProcessed}`,
        `  alertsSurfaced: ${snapshot.alertsSurfaced}`,
        `  publishAttempts: ${snapshot.publishAttempts}`,
        `  deliveredCount: ${snapshot.deliveredCount}`,
        `  reconnectAttempts: ${snapshot.reconnectAttempts}`,
        `  lastEventType: ${snapshot.lastEventType ?? 'n/a'}`,
        '  eventTypeCounts:',
        eventTypeLines,
    ].join('\n');
}

export function formatEventSummary(event: PreparedTRONostrEvent) {
    const base = `[${event.parsedContent.eventType}] severity=${event.parsedContent.severity}`;

    if (event.parsedContent.eventType === 'block_metrics') {
        return `${base} block=${event.parsedContent.block?.height} txCount=${event.parsedContent.data.txCount}`;
    }

    const d = event.parsedContent.data as Record<string, unknown>;
    const tx = event.parsedContent.transaction?.hash;

    if (event.parsedContent.eventType === 'resource_delegation') {
        return `${base} ${d.action} ${d.resource} stakedTrx=${d.stakedTrx} owner=${d.owner} receiver=${d.receiver} tx=${tx}`;
    }

    if (event.parsedContent.eventType === 'exchange_flow') {
        return `${base} ${d.direction} ${d.entity} asset=${event.parsedContent.asset} amount=${d.amount} tx=${tx}`;
    }

    return `${base} asset=${event.parsedContent.asset ?? 'n/a'} amount=${d.amount} tx=${tx}`;
}

export function formatKeyValueGrid(entries: Array<{ key: string; value: string | number }>) {
    const width = Math.max(...entries.map((entry) => entry.key.length), 0);
    return entries
        .map((entry) => `${entry.key.padEnd(width, ' ')} : ${entry.value}`)
        .join('\n');
}

export function formatLaunchSummary(items: string[]) {
    return items.map((item) => `- ${item}`).join('\n');
}
