import { promises as fs } from 'fs';
import * as path from 'path';

export interface CheckpointStore {
    load(key: string): Promise<number | null>;
    save(key: string, blockHeight: number): Promise<void>;
}

interface FileCheckpointState {
    [key: string]: number;
}

export class FileCheckpointStore implements CheckpointStore {
    constructor(private readonly filePath: string) {}

    async load(key: string): Promise<number | null> {
        const state = await this.readState();
        const value = state[key];
        return Number.isInteger(value) && value >= 0 ? value : null;
    }

    async save(key: string, blockHeight: number): Promise<void> {
        if (!Number.isInteger(blockHeight) || blockHeight < 0) {
            throw new Error(`Checkpoint block height must be a non-negative integer. Received: ${blockHeight}`);
        }

        const state = await this.readState();
        state[key] = blockHeight;

        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
    }

    private async readState(): Promise<FileCheckpointState> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as FileCheckpointState : {};
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === 'ENOENT') {
                return {};
            }
            throw error;
        }
    }
}
