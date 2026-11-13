import * as fs from 'fs';
import { getPublicKey, nip19 } from 'nostr-tools';

/**
 * Resolves the Nostr publisher secret key from the environment. The key is never read from
 * config.yaml (which is committed) and is never logged; only the derived public key is exposed.
 *
 * Order: TRONOSTR_PUBLISHER_KEY, TRONOSTR_PUBLISHER_KEY_FILE (e.g. a Docker/Fly secret file),
 * then the legacy NOSTR_PRIVATE_KEY. Accepts 64-char hex or an nsec1... bech32 string.
 *
 * Use a key created only for publishing TRONostr events. Never use a wallet key or seed.
 */
export interface ResolvedPublisherKey {
    /** 64-char lowercase hex secret. Keep in memory only. */
    secretHex: string;
    pubkeyHex: string;
    npub: string;
    sourceVar: 'TRONOSTR_PUBLISHER_KEY' | 'TRONOSTR_PUBLISHER_KEY_FILE' | 'NOSTR_PRIVATE_KEY';
}

export function resolvePublisherKey(env: NodeJS.ProcessEnv = process.env): ResolvedPublisherKey | undefined {
    let raw: string | undefined;
    let sourceVar: ResolvedPublisherKey['sourceVar'] | undefined;
    if (env.TRONOSTR_PUBLISHER_KEY?.trim()) {
        raw = env.TRONOSTR_PUBLISHER_KEY.trim();
        sourceVar = 'TRONOSTR_PUBLISHER_KEY';
    } else if (env.TRONOSTR_PUBLISHER_KEY_FILE?.trim()) {
        const file = env.TRONOSTR_PUBLISHER_KEY_FILE.trim();
        if (!fs.existsSync(file)) {
            throw new Error(`TRONOSTR_PUBLISHER_KEY_FILE points to a missing file: ${file}`);
        }
        raw = fs.readFileSync(file, 'utf8').trim();
        sourceVar = 'TRONOSTR_PUBLISHER_KEY_FILE';
    } else if (env.NOSTR_PRIVATE_KEY?.trim()) {
        raw = env.NOSTR_PRIVATE_KEY.trim();
        sourceVar = 'NOSTR_PRIVATE_KEY';
    }
    if (!raw || !sourceVar) return undefined;

    const secretHex = normalizeSecret(raw, sourceVar);
    const pubkeyHex = getPublicKey(Buffer.from(secretHex, 'hex'));
    return { secretHex, pubkeyHex, npub: nip19.npubEncode(pubkeyHex), sourceVar };
}

function normalizeSecret(raw: string, sourceVar: string): string {
    if (raw.startsWith('nsec1')) {
        try {
            const decoded = nip19.decode(raw);
            if (decoded.type !== 'nsec') throw new Error('not an nsec');
            return Buffer.from(decoded.data as Uint8Array).toString('hex');
        } catch {
            throw new Error(`${sourceVar} is not a valid nsec1 key`);
        }
    }
    const hex = raw.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{64}$/.test(hex)) {
        // Do not echo the value: it may be a secret pasted into the wrong variable.
        throw new Error(`${sourceVar} must be a 64-character hex secret key or an nsec1... string`);
    }
    if (/^0+$/.test(hex)) {
        throw new Error(`${sourceVar} must not be all zeros`);
    }
    return hex;
}
