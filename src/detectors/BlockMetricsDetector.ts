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
                height: blockHeader.number,
                hash: block.blockID,
                txCount: txCount,
                witness: blockHeader.witness_address
            },
            tags: [['chain', 'tron'], ['type', 'block_metrics']]
        });

        return insights;
    }
}
