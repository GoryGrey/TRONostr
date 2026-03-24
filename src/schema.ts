export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type InsightType = 'TRON_BLOCK' | 'TRX_TRANSFER' | 'USDT_TRANSFER';

export type TRONostrEventType = 'block_metrics' | 'trx_transfer' | 'usdt_transfer';

export type TRONostrCategory = 'telemetry' | 'transfer';

export interface ValidationResult<T> {
    ok: boolean;
    value?: T;
    errors: string[];
}

export interface TRONostrEventContent {
    schema: 'tronostr.v1';
    chain: 'tron';
    category: TRONostrCategory;
    eventType: TRONostrEventType;
    asset?: 'TRX' | 'USDT';
    severity: Severity;
    source: {
        detector: string;
    };
    block?: {
        height: number;
        hash?: string;
        timestamp?: number;
    };
    transaction?: {
        hash: string;
    };
    data: Record<string, unknown>;
}

export interface ParsedTRONostrEvent {
    kind: number;
    created_at: number;
    content: string;
    tags: string[][];
    parsedContent: TRONostrEventContent;
}

const VALID_SEVERITIES: Severity[] = ['info', 'low', 'medium', 'high', 'critical'];
const VALID_EVENT_TYPES: TRONostrEventType[] = ['block_metrics', 'trx_transfer', 'usdt_transfer'];
const VALID_CATEGORIES: TRONostrCategory[] = ['telemetry', 'transfer'];
const VALID_ASSETS = ['TRX', 'USDT'] as const;

export function getKindForInsightType(kindRange: { start: number }, type: InsightType): number {
    switch (type) {
        case 'TRON_BLOCK':
            return kindRange.start;
        case 'TRX_TRANSFER':
            return kindRange.start + 1;
        case 'USDT_TRANSFER':
            return kindRange.start + 2;
        default:
            throw new Error(`Unsupported insight type: ${String(type)}`);
    }
}

export function getDefaultKinds(kindRange: { start: number }): number[] {
    return [
        getKindForInsightType(kindRange, 'TRON_BLOCK'),
        getKindForInsightType(kindRange, 'TRX_TRANSFER'),
        getKindForInsightType(kindRange, 'USDT_TRANSFER'),
    ];
}

export function buildEventTags(content: TRONostrEventContent): string[][] {
    const tags: string[][] = [
        ['t', 'tron'],
        ['t', `category:${content.category}`],
        ['t', `event:${content.eventType}`],
        ['t', `severity:${content.severity}`],
        ['t', `source:${content.source.detector}`],
    ];

    if (content.asset) {
        tags.push(['t', `asset:${content.asset.toLowerCase()}`]);
    }

    if (content.block?.height !== undefined) {
        tags.push(['h', String(content.block.height)]);
    }

    if (content.transaction?.hash) {
        tags.push(['x', content.transaction.hash]);
    }

    return tags;
}

export function isTRONostrEventContent(value: unknown): value is TRONostrEventContent {
    return validateTRONostrEventContent(value).ok;
}

export function validateTRONostrEventContent(value: unknown): ValidationResult<TRONostrEventContent> {
    const errors: string[] = [];

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { ok: false, errors: ['event content must be an object'] };
    }

    const candidate = value as Partial<TRONostrEventContent>;

    if (candidate.schema !== 'tronostr.v1') {
        errors.push('schema must be "tronostr.v1"');
    }
    if (candidate.chain !== 'tron') {
        errors.push('chain must be "tron"');
    }
    if (!VALID_CATEGORIES.includes(candidate.category as TRONostrCategory)) {
        errors.push(`category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    if (!VALID_EVENT_TYPES.includes(candidate.eventType as TRONostrEventType)) {
        errors.push(`eventType must be one of: ${VALID_EVENT_TYPES.join(', ')}`);
    }
    if (!VALID_SEVERITIES.includes(candidate.severity as Severity)) {
        errors.push(`severity must be one of: ${VALID_SEVERITIES.join(', ')}`);
    }
    if (!candidate.source || typeof candidate.source !== 'object') {
        errors.push('source must be an object');
    } else if (typeof candidate.source.detector !== 'string' || candidate.source.detector.trim().length === 0) {
        errors.push('source.detector must be a non-empty string');
    }
    if (!candidate.data || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
        errors.push('data must be an object');
    }

    if (candidate.asset !== undefined && !(VALID_ASSETS as readonly string[]).includes(candidate.asset)) {
        errors.push(`asset must be one of: ${VALID_ASSETS.join(', ')}`);
    }

    if (candidate.block !== undefined) {
        if (!candidate.block || typeof candidate.block !== 'object') {
            errors.push('block must be an object when provided');
        } else {
            if (!Number.isInteger(candidate.block.height) || (candidate.block.height as number) < 0) {
                errors.push('block.height must be a non-negative integer');
            }
            if (candidate.block.hash !== undefined && (typeof candidate.block.hash !== 'string' || candidate.block.hash.length === 0)) {
                errors.push('block.hash must be a non-empty string when provided');
            }
            if (candidate.block.timestamp !== undefined && !Number.isFinite(candidate.block.timestamp)) {
                errors.push('block.timestamp must be a finite number when provided');
            }
        }
    }

    if (candidate.transaction !== undefined) {
        if (!candidate.transaction || typeof candidate.transaction !== 'object') {
            errors.push('transaction must be an object when provided');
        } else if (typeof candidate.transaction.hash !== 'string' || candidate.transaction.hash.length === 0) {
            errors.push('transaction.hash must be a non-empty string');
        }
    }

    if (candidate.eventType === 'block_metrics') {
        if (candidate.category !== 'telemetry') {
            errors.push('block_metrics events must use category "telemetry"');
        }
        if (!candidate.block) {
            errors.push('block_metrics events must include block metadata');
        }
    }

    if (candidate.eventType === 'trx_transfer') {
        if (candidate.category !== 'transfer') {
            errors.push('trx_transfer events must use category "transfer"');
        }
        if (candidate.asset !== 'TRX') {
            errors.push('trx_transfer events must use asset "TRX"');
        }
        if (!candidate.transaction) {
            errors.push('trx_transfer events must include transaction metadata');
        }
    }

    if (candidate.eventType === 'usdt_transfer') {
        if (candidate.category !== 'transfer') {
            errors.push('usdt_transfer events must use category "transfer"');
        }
        if (candidate.asset !== 'USDT') {
            errors.push('usdt_transfer events must use asset "USDT"');
        }
        if (!candidate.transaction) {
            errors.push('usdt_transfer events must include transaction metadata');
        }
    }

    return {
        ok: errors.length === 0,
        value: errors.length === 0 ? candidate as TRONostrEventContent : undefined,
        errors,
    };
}

export function assertValidTRONostrEventContent(value: unknown): TRONostrEventContent {
    const result = validateTRONostrEventContent(value);
    if (!result.ok) {
        throw new Error(`Invalid TRONostr event content: ${result.errors.join('; ')}`);
    }

    return result.value!;
}

export function parseTRONostrEventContent(rawContent: string): ValidationResult<TRONostrEventContent> {
    try {
        const parsed = JSON.parse(rawContent);
        return validateTRONostrEventContent(parsed);
    } catch (error) {
        return {
            ok: false,
            errors: [`invalid JSON: ${(error as Error).message}`],
        };
    }
}

export function isAlertSeverity(severity: Severity): boolean {
    return severity === 'high' || severity === 'critical';
}
