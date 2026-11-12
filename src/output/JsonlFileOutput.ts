import * as fs from 'fs';
import * as path from 'path';
import { PreparedTRONostrEvent } from '../eventEnvelope';

/** Appends each prepared event as one JSON line. Useful for archiving, replay, and samples. */
export class JsonlFileOutput {
    private readonly filePath: string;

    constructor(config: { path: string }) {
        this.filePath = config.path;
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    }

    async deliver(event: PreparedTRONostrEvent) {
        const line = JSON.stringify({
            kind: event.kind,
            created_at: event.created_at,
            tags: event.tags,
            event: event.parsedContent,
        });
        await fs.promises.appendFile(this.filePath, line + '\n', 'utf8');
    }
}
