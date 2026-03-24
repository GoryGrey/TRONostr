import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { PreparedTRONostrEvent } from '../eventEnvelope';

export interface WebhookOutputConfig {
    url: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
}

export interface WebhookDeliveryResult {
    statusCode: number;
    body: string;
}

export interface WebhookRequest {
    url: string;
    body: string;
    timeoutMs: number;
    headers: Record<string, string>;
}

export class WebhookOutput {
    private readonly url: string;
    private readonly timeoutMs: number;
    private readonly headers: Record<string, string>;
    private readonly requestImpl: (request: WebhookRequest) => Promise<WebhookDeliveryResult>;

    constructor(
        config: WebhookOutputConfig,
        requestImpl: (request: WebhookRequest) => Promise<WebhookDeliveryResult> = sendWebhookRequest,
    ) {
        this.url = config.url;
        this.timeoutMs = config.timeoutMs ?? 5000;
        this.headers = config.headers ?? {};
        this.requestImpl = requestImpl;
    }

    async deliver(event: PreparedTRONostrEvent) {
        const response = await this.requestImpl({
            url: this.url,
            timeoutMs: this.timeoutMs,
            headers: {
                'content-type': 'application/json',
                ...this.headers,
            },
            body: JSON.stringify({
                transport: 'webhook',
                kind: event.kind,
                created_at: event.created_at,
                tags: event.tags,
                event: event.parsedContent,
            }),
        });

        if (response.statusCode < 200 || response.statusCode >= 300) {
            throw new Error(`Webhook delivery failed with status ${response.statusCode}`);
        }
    }
}

export function sendWebhookRequest(request: WebhookRequest): Promise<WebhookDeliveryResult> {
    const target = new URL(request.url);
    const client = target.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.request(target, {
            method: 'POST',
            headers: {
                'content-length': Buffer.byteLength(request.body).toString(),
                ...request.headers,
            },
            timeout: request.timeoutMs,
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode ?? 0,
                    body,
                });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error(`Webhook request timed out after ${request.timeoutMs}ms`));
        });
        req.write(request.body);
        req.end();
    });
}
