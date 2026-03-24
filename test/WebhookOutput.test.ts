import assert from 'node:assert/strict';
import { TestCase } from './runner';
import { WebhookOutput } from '../src/output/WebhookOutput';
import { prepareTRONostrEvent } from '../src/eventEnvelope';
import { createInsight, TEST_KIND_RANGE } from './fixtures';

export const webhookOutputCases: TestCase[] = [
    {
        name: 'posts prepared events to the configured webhook',
        run: async () => {
            let capturedBody = '';
            const output = new WebhookOutput({
                url: 'http://127.0.0.1:8787/tronostr',
            }, async (request) => {
                capturedBody = request.body;
                return {
                    statusCode: 202,
                    body: 'accepted',
                };
            });

            await output.deliver(prepareTRONostrEvent(createInsight({}, 'TRX_TRANSFER'), TEST_KIND_RANGE));

            const payload = JSON.parse(capturedBody);
            assert.equal(payload.transport, 'webhook');
            assert.equal(payload.event.eventType, 'trx_transfer');
            assert.equal(payload.kind, 6501);
        },
    },
    {
        name: 'throws when webhook delivery returns a non-2xx response',
        run: async () => {
            const output = new WebhookOutput({
                url: 'http://127.0.0.1:8787/tronostr',
            }, async () => ({
                statusCode: 500,
                body: 'nope',
            }));

            await assert.rejects(
                output.deliver(prepareTRONostrEvent(createInsight({}, 'TRX_TRANSFER'), TEST_KIND_RANGE)),
                /Webhook delivery failed with status 500/,
            );
        },
    },
];
