import { Detector, Insight } from './Detector';

export class BlockMetricsDetector implements Detector {
    name = "BlockMetricsDetector";

    onBlock(block: any): Insight[] {
        const insights: Insight[] = [];
        const blockHeader = block.block_header.raw_data;
        const txCount = block.transactions ? block.transactions.length : 0;

        insights.push({
            type: 'TRON_BLOCK',
            timestamp: blockHeader.timestamp,
            severity: 'info',
            content: {
                schema: 'tronostr.v1',
                chain: 'tron',
                category: 'telemetry',
                eventType: 'block_metrics',
                severity: 'info',
                source: {
                    detector: this.name,
                },
                block: {
                    height: blockHeader.number,
                    hash: block.blockID,
                    timestamp: blockHeader.timestamp,
                },
                data: {
                    height: blockHeader.number,
                    hash: block.blockID,
                    txCount: txCount,
                    witness: blockHeader.witness_address,
                }
            },
        });

        return insights;
    }
}
