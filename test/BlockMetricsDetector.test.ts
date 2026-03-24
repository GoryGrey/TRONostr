import assert from 'node:assert/strict';
import { BlockMetricsDetector } from '../src/detectors/BlockMetricsDetector';
import { createBlock } from './fixtures';
import { TestCase } from './runner';

export const blockMetricsDetectorCases: TestCase[] = [
    {
        name: 'emits expected block metrics shape',
        run: () => {
            const detector = new BlockMetricsDetector();

            const insights = detector.onBlock(createBlock(3));

            assert.equal(insights.length, 1);
            assert.equal(insights[0].content.schema, 'tronostr.v1');
            assert.equal(insights[0].content.eventType, 'block_metrics');
            assert.equal(insights[0].content.category, 'telemetry');
        },
    },
    {
        name: 'reports correct height, txCount, and hash',
        run: () => {
            const detector = new BlockMetricsDetector();

            const insight = detector.onBlock(createBlock(4))[0];

            assert.equal(insight.content.block?.height, 57000001);
            assert.equal(insight.content.data.txCount, 4);
            assert.equal(insight.content.data.hash, '0000000000000000blockhash');
        },
    },
];
