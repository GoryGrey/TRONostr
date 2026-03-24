import { InsightType, Severity, TRONostrEventContent } from '../schema';

export interface Insight {
    type: InsightType;
    timestamp: number;
    severity: Severity;
    content: TRONostrEventContent;
}

export interface Detector {
    name: string;
    onBlock(block: any): Insight[];
    onTransaction?(tx: any): Insight[];
}
