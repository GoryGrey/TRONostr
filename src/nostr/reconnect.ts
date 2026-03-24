export interface ReconnectPolicy {
    enabled?: boolean;
    initialDelayMs?: number;
    maxDelayMs?: number;
    multiplier?: number;
    jitterMs?: number;
}

export interface ResolvedReconnectPolicy {
    enabled: boolean;
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
    jitterMs: number;
}

export function resolveReconnectPolicy(policy?: ReconnectPolicy): ResolvedReconnectPolicy {
    return {
        enabled: policy?.enabled ?? true,
        initialDelayMs: policy?.initialDelayMs ?? 1000,
        maxDelayMs: policy?.maxDelayMs ?? 30000,
        multiplier: policy?.multiplier ?? 2,
        jitterMs: policy?.jitterMs ?? 250,
    };
}

export function calculateReconnectDelay(
    policy: ResolvedReconnectPolicy,
    attempt: number,
    random: () => number,
) {
    const baseDelay = Math.min(
        policy.initialDelayMs * Math.pow(policy.multiplier, Math.max(attempt - 1, 0)),
        policy.maxDelayMs,
    );
    const jitter = policy.jitterMs > 0 ? Math.floor(random() * policy.jitterMs) : 0;
    return baseDelay + jitter;
}
