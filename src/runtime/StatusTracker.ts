import { PreparedTRONostrEvent } from '../eventEnvelope';
import { PublisherStats } from '../nostr/Publisher';

export interface RuntimeStatusSnapshot {
    activeRelayCount: number;
    queueLength: number;
    publishAttempts: number;
    deliveredCount: number;
    droppedCount: number;
    invalidPayloadCount: number;
    skippedNoRelayCount: number;
    reconnectAttempts: number;
    disconnectCount: number;
    latestBlockSeen: number | null;
    eventsProcessed: number;
    alertsSurfaced: number;
    lastEventType: string | null;
    eventTypeCounts: Record<string, number>;
}

export class TRONostrStatusTracker {
    private latestBlockSeen: number | null = null;
    private eventsProcessed = 0;
    private alertsSurfaced = 0;
    private lastEventType: string | null = null;
    private readonly eventTypeCounts = new Map<string, number>();

    recordBlock(height: number) {
        this.latestBlockSeen = height;
    }

    recordEvent(event: PreparedTRONostrEvent) {
        this.eventsProcessed += 1;
        this.lastEventType = event.parsedContent.eventType;
        this.eventTypeCounts.set(
            event.parsedContent.eventType,
            (this.eventTypeCounts.get(event.parsedContent.eventType) ?? 0) + 1,
        );

        if (event.parsedContent.severity === 'high' || event.parsedContent.severity === 'critical') {
            this.alertsSurfaced += 1;
        }

        if (event.parsedContent.block?.height !== undefined) {
            this.latestBlockSeen = event.parsedContent.block.height;
        }
    }

    getSnapshot(publisherStats?: PublisherStats): RuntimeStatusSnapshot {
        return {
            activeRelayCount: publisherStats?.activeRelayCount ?? 0,
            queueLength: publisherStats?.queueLength ?? 0,
            publishAttempts: publisherStats?.publishAttempts ?? 0,
            deliveredCount: publisherStats?.deliveredCount ?? 0,
            droppedCount: publisherStats?.droppedCount ?? 0,
            invalidPayloadCount: publisherStats?.invalidPayloadCount ?? 0,
            skippedNoRelayCount: publisherStats?.skippedNoRelayCount ?? 0,
            reconnectAttempts: publisherStats?.reconnectAttempts ?? 0,
            disconnectCount: publisherStats?.disconnectCount ?? 0,
            latestBlockSeen: this.latestBlockSeen,
            eventsProcessed: this.eventsProcessed,
            alertsSurfaced: this.alertsSurfaced,
            lastEventType: this.lastEventType,
            eventTypeCounts: Object.fromEntries(this.eventTypeCounts.entries()),
        };
    }
}
