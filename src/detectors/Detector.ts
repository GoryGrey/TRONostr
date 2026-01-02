export interface Insight {
    type: string;
    timestamp: number;
    severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
    content: any;
    tags: string[][];
}

export interface Detector {
    name: string;
    onBlock(block: any): Insight[];
    onTransaction?(tx: any): Insight[];
}
