import { Insight } from './detectors/Detector';
import { assertValidTRONostrEventContent, buildEventTags, getKindForInsightType, TRONostrEventContent } from './schema';

export interface PreparedTRONostrEvent {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    parsedContent: TRONostrEventContent;
}

export function prepareTRONostrEvent(
    insight: Insight,
    kindRange: { start: number; end: number },
): PreparedTRONostrEvent {
    const parsedContent = assertValidTRONostrEventContent({
        ...insight.content,
        severity: insight.severity,
    });

    return {
        kind: getKindForInsightType(kindRange, insight.type),
        created_at: Math.floor(insight.timestamp / 1000),
        tags: buildEventTags(parsedContent),
        content: JSON.stringify(parsedContent),
        parsedContent,
    };
}
