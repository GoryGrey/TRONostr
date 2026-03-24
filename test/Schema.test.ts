import assert from 'node:assert/strict';
import { createInsight } from './fixtures';
import { TestCase } from './runner';
import { parseTRONostrEventContent, validateTRONostrEventContent } from '../src/schema';

export const schemaCases: TestCase[] = [
    {
        name: 'accepts a valid repo-native event payload',
        run: () => {
            const result = validateTRONostrEventContent(createInsight({}, 'USDT_TRANSFER').content);

            assert.equal(result.ok, true);
            assert.equal(result.value?.eventType, 'usdt_transfer');
        },
    },
    {
        name: 'rejects inconsistent event payloads',
        run: () => {
            const result = validateTRONostrEventContent({
                ...createInsight({}, 'TRX_TRANSFER').content,
                asset: 'USDT',
            });

            assert.equal(result.ok, false);
            assert.ok(result.errors.some((error) => error.includes('trx_transfer events must use asset "TRX"')));
        },
    },
    {
        name: 'rejects malformed JSON content cleanly',
        run: () => {
            const result = parseTRONostrEventContent('{broken json');

            assert.equal(result.ok, false);
            assert.ok(result.errors[0].startsWith('invalid JSON:'));
        },
    },
];
