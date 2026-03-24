import assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import { promises as fs } from 'fs';
import { TestCase } from './runner';
import { FileCheckpointStore } from '../src/tron/CheckpointStore';

export const checkpointStoreCases: TestCase[] = [
    {
        name: 'persists checkpoint values to disk',
        run: async () => {
            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tronostr-checkpoint-'));
            const filePath = path.join(tempDir, 'checkpoint.json');
            const store = new FileCheckpointStore(filePath);

            await store.save('alpha', 42);
            const reloaded = new FileCheckpointStore(filePath);

            assert.equal(await reloaded.load('alpha'), 42);

            await fs.rm(tempDir, { recursive: true, force: true });
        },
    },
];
