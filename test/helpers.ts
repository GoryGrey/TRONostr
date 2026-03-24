import { createInMemoryRelayConnector, InMemoryRelayHub } from '../src/testing/InMemoryRelay';
import { CheckpointStore } from '../src/tron/CheckpointStore';

export function createRelayTestKit() {
    const hub = new InMemoryRelayHub();
    const connectRelay = createInMemoryRelayConnector(hub);
    return { hub, connectRelay };
}

export function createLoggerSpy() {
    const logs: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];

    const format = (args: unknown[]) => args.map((value) => String(value)).join(' ');

    return {
        logger: {
            log: (...args: unknown[]) => {
                logs.push(format(args));
            },
            warn: (...args: unknown[]) => {
                warnings.push(format(args));
            },
            error: (...args: unknown[]) => {
                errors.push(format(args));
            },
        },
        logs,
        warnings,
        errors,
    };
}

export async function waitFor(assertion: () => void, timeoutMs = 250, intervalMs = 5) {
    const start = Date.now();
    let lastError: unknown;

    while (Date.now() - start < timeoutMs) {
        try {
            assertion();
            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }

    throw lastError instanceof Error ? lastError : new Error('waitFor timed out');
}

export class MemoryCheckpointStore implements CheckpointStore {
    private readonly state = new Map<string, number>();

    async load(key: string) {
        return this.state.get(key) ?? null;
    }

    async save(key: string, blockHeight: number) {
        this.state.set(key, blockHeight);
    }
}
