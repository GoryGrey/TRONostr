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
    {
        name: 'validates resource_delegation and exchange_flow payload rules',
        run: () => {
            const base = { schema: 'tronostr.v1', chain: 'tron', severity: 'medium', source: { detector: 'T' }, transaction: { hash: 'h' } };
            assert.equal(validateTRONostrEventContent({ ...base, category: 'resource', eventType: 'resource_delegation', asset: 'TRX', data: { action: 'delegate', resource: 'ENERGY', stakedTrx: 1 } }).ok, true);
            const badResource = validateTRONostrEventContent({ ...base, category: 'resource', eventType: 'resource_delegation', asset: 'TRX', data: { action: 'delegate', resource: 'CPU' } });
            assert.equal(badResource.ok, false);
            assert.equal(validateTRONostrEventContent({ ...base, category: 'flow', eventType: 'exchange_flow', asset: 'USDT', data: { direction: 'inflow' } }).ok, true);
            assert.equal(validateTRONostrEventContent({ ...base, category: 'flow', eventType: 'exchange_flow', asset: 'USDT', data: { direction: 'sideways' } }).ok, false);
        },
    },
];
