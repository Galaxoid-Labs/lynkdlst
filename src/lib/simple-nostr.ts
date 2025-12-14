// simple-nostr-ts.ts
// A simple Nostr package. No fluff, no frills.
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32 } from '@scure/base';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Private key handle for signing Nostr data.
 *
 * Notes
 * - `hex` is a 32-byte lowercase hex string
 * - `nsec` is the Bech32-encoded private key (NIP-19)
 * - `bytes` is a 32-byte Uint8Array
 */
interface PrivateKey {
    readonly hex: string;
    readonly nsec: string;
    readonly bytes: Uint8Array;
    readonly publicKey: PublicKey;

    signEvent(event: NostrEvent): NostrEvent;
    signMessage(message: string): string;
}

/**
 * Public key handle for verification and addressing.
 *
 * Notes
 * - `hex` is a 32-byte lowercase hex string
 * - `npub` is the Bech32-encoded public key (NIP-19)
 * - `bytes` is a 32-byte Uint8Array
 */
interface PublicKey {
    readonly hex: string;
    readonly npub: string;
    readonly bytes: Uint8Array;

    verifyEvent(event: NostrEvent): boolean;
    verifySignature(message: string, signature: string): boolean;
}

/**
 * NostrKeyPair represents a private key and its derived public key.
 *
 * Use {@link NostrKeyPair.generate} to create a new keypair, or
 * import an existing one with {@link NostrKeyPair.fromHex},
 * {@link NostrKeyPair.fromBytes}, or {@link NostrKeyPair.fromNsec}.
 */
export class NostrKeyPair implements PrivateKey {
    readonly hex: string;
    readonly nsec: string;
    readonly bytes: Uint8Array;
    readonly publicKey: NostrPublicKey;

    /**
     * Create a keypair from 32-byte hex or Uint8Array.
     * @param bytesOrHex 32-byte private key as hex string or bytes
     * @throws Error if the input is not a valid 32-byte private key
     */
    constructor(bytesOrHex: string | Uint8Array) {
        try {
            this.bytes = typeof bytesOrHex === 'string' ? hexToBytes(bytesOrHex) : bytesOrHex;
            if (this.bytes.length !== 32) {
                throw new Error('Invalid private key length');
            }
            this.hex = bytesToHex(this.bytes);
            this.nsec = bech32.encode('nsec', bech32.toWords(this.bytes));
            this.publicKey = NostrPublicKey.fromPrivateKey(this);
        } catch (_error) {
            throw new Error('Invalid private key hex');
        }
    }

    /**
     * Sign a Nostr event and return a copy with `id` and `sig` populated.
     */
    signEvent(event: NostrEvent): NostrEvent {
        return Nostr.signEvent(event, this.bytes);
    }

    /**
     * Sign an arbitrary message. Returns hex-encoded signature.
     */
    signMessage(message: string): string {
        const messageBytes = new TextEncoder().encode(message);
        const hash = sha256(messageBytes);
        const sigBytes = schnorr.sign(hash, this.bytes);
        return bytesToHex(sigBytes);
    }

    /**
     * Generate a new random private key and derive its public key.
     */
    static generate(): NostrKeyPair {
        const { privateKey } = Nostr.generateKey();
        return new NostrKeyPair(privateKey);
    }

    /**
     * Import a keypair from a hex-encoded private key.
     */
    static fromHex(hex: string): NostrKeyPair {
        return new NostrKeyPair(hex);
    }

    /**
     * Import a keypair from 32-byte private key bytes.
     */
    static fromBytes(bytes: Uint8Array): NostrKeyPair {
        return new NostrKeyPair(bytesToHex(bytes));
    }

    /**
     * Import a keypair from an `nsec1...` Bech32-encoded private key.
     * @throws Error if the nsec is invalid or wrong length
     */
    static fromNsec(nsec: string): NostrKeyPair {
        try {
            const { prefix, words } = bech32.decode(nsec as `${string}1${string}`);
            if (prefix !== 'nsec') {
                throw new Error('Invalid nsec prefix');
            }
            const bytes = new Uint8Array(bech32.fromWords(words));
            if (bytes.length !== 32) {
                throw new Error('Invalid nsec length');
            }
            const hex = bytesToHex(bytes);
            return new NostrKeyPair(hex);
        } catch (_error) {
            throw new Error('Invalid nsec format');
        }
    }
}

/**
 * NostrPublicKey represents a public key (hex/npub/bytes) and
 * provides verification helpers.
 */
export class NostrPublicKey implements PublicKey {
    readonly hex: string;
    readonly npub: string;
    readonly bytes: Uint8Array;

    /**
     * Create a public key from 32-byte hex or Uint8Array.
     */
    constructor(bytesOrHex: string | Uint8Array) {
        if (typeof bytesOrHex === 'string') {
            this.bytes = hexToBytes(bytesOrHex);
        } else {
            this.bytes = bytesOrHex;
        }
        this.hex = bytesToHex(this.bytes);
        this.npub = bech32.encode('npub', bech32.toWords(this.bytes));
    }

    /**
     * Derive a public key from a {@link PrivateKey}.
     */
    static fromPrivateKey(privateKey: PrivateKey): NostrPublicKey {
        return new NostrPublicKey(schnorr.getPublicKey(privateKey.bytes));
    }

    /**
     * Import a public key from a hex string.
     */
    static fromHex(hex: string): NostrPublicKey {
        return new NostrPublicKey(hexToBytes(hex));
    }

    /**
     * Import a public key from an `npub1...` Bech32 string.
     * @throws Error if the npub prefix/length is invalid
     */
    static fromNpub(npub: string): NostrPublicKey {
        const { prefix, words } = bech32.decode(npub as `${string}1${string}`);
        if (prefix !== 'npub') {
            throw new Error('Invalid npub prefix');
        }
        const bytes = new Uint8Array(bech32.fromWords(words));
        if (bytes.length !== 32) {
            throw new Error('Invalid npub length');
        }
        return new NostrPublicKey(bytes);
    }

    /**
     * Verify a signed Nostr event with this public key.
     */
    verifyEvent(event: NostrEvent): boolean {
        return Nostr.verifyEvent(event);
    }

    /**
     * Verify a raw message signature.
     * @param message Arbitrary UTF-8 string
     * @param signature Hex-encoded signature
     */
    verifySignature(message: string, signature: string): boolean {
        const messageBytes = new TextEncoder().encode(message);
        const hash = sha256(messageBytes);
        return schnorr.verify(hexToBytes(signature), hash, this.bytes);
    }
}

/**
 * Nostr event per NIP-01.
 * `id` and `sig` are filled by signing.
 */
export interface NostrEvent {
    id?: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig?: string;
}

/**
 * Minimal WebSocket relay pool.
 *
 * Notes
 * - Exposes simple publish/subscribe helpers and event hooks.
 * - Requires a runtime that provides `WebSocket` (browser, Bun, Deno, or Node with a polyfill like `ws`).
 */
export class NostrRelayPool {
    private verifyEvents: boolean = true;
    private relays: Map<string, WebSocket> = new Map();
    private subscriptions: Map<string, Set<string>> = new Map();
    private onConnectedCallback: (relayUrl: string) => void = () => { };
    private onClosedCallback: (closeEvent: CloseEvent, relayUrl: string) => void = () => { };
    private onErrorCallback: (error: Error, relayUrl: string) => void = () => { };
    private onEventCallback: (subId: string, event: NostrEvent, relayUrl: string) => void = () => { };
    private onOkCallback: (eventId: string, accepted: boolean, message: string, relayUrl: string) => void = () => { };
    private onEoseCallback: (subId: string, relayUrl: string) => void = () => { };
    private onSubClosedCallback: (subId: string, relayUrl: string) => void = () => { };
    private onNoticeCallback: (notice: string, relayUrl: string) => void = () => { };

    /**
     * Create and connect to the provided relay URLs.
     * @param relayUrls Array of wss:// or ws:// endpoints
     * @param verifyEvents Whether to verify incoming events before emitting
     */
    constructor(relayUrls: string[], verifyEvents: boolean = true) {
        this.verifyEvents = verifyEvents;
        for (const url of relayUrls) {
            if (!/^wss?:\/\//.test(url)) {
                console.warn(`Invalid WebSocket URL: ${url}, skipping`);
                continue;
            }
            this.connect(url);
        }
    }

    /** Connect to a relay if not already connected. */
    private connect(url: string): void {
        if (this.relays.has(url)) return;
        const ws = new WebSocket(url);
        ws.onopen = () => this.onConnectedCallback(url);
        ws.onclose = (ev) => this.onClosedCallback(ev, url);
        ws.onerror = (err) => this.onErrorCallback(Error(`WebSocket error`), url);
        ws.onmessage = (msg) => this.handleMessage(msg.data, url);
        this.relays.set(url, ws);
    }

    /** Handle incoming message payloads from relays. */
    private handleMessage(data: string, url: string): void {
        try {
            const [type, ...args] = JSON.parse(data);
            if (type === 'EVENT') {
                const [subId, event] = args;
                if (this.verifyEvents) {
                    if (this.verifyEvent(event)) {
                        this.onEventCallback(subId, event, url);
                    } else {
                        console.warn(`Invalid event received from ${url}`);
                    }
                } else {
                    this.onEventCallback(subId, event, url);
                }
            } else if (type === 'NOTICE') {
                const [notice] = args;
                this.onNoticeCallback(notice, url);
            } else if (type === 'EOSE') {
                const [subId] = args;
                this.onEoseCallback(subId, url);
            } else if (type === 'OK') {
                const [eventId, accepted, message] = args;
                this.onOkCallback(eventId, accepted, message, url);
            } else if (type === 'CLOSED') {
                const [subId] = args;
                this.onSubClosedCallback(subId, url);
            }
        } catch (err) {
            console.error(`Invalid message from ${url}:`, err);
        }
    }

    // Verify an event received from a relay
    /** Verify an event received from a relay. */
    private verifyEvent(event: NostrEvent): boolean {
        return Nostr.verifyEvent(event);
    }

    /** Get all relay URLs currently connected. */
    getRelayUrls(): string[] {
        return Array.from(this.relays.keys());
    }

    /** Get all subscription IDs currently active. */
    getSubscriptionIds(): string[] {
        return Array.from(this.subscriptions.keys());
    }

    // Publish an event to specified relays or all relays if relayUrls is empty
    /**
     * Publish an event to specific relays or all connected relays.
     */
    publish(event: NostrEvent, relayUrls: string[] = []): void {
        const msg = JSON.stringify(['EVENT', event]);
        const targetRelays = relayUrls.length > 0
            ? new Map([...this.relays].filter(([url]) => relayUrls.includes(url)))
            : this.relays;
        for (const [url, ws] of targetRelays) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
            } else {
                console.warn(`Cannot publish to ${url}: WebSocket is not open`);
            }
        }
    }

    // Subscribe to filters on specified relays or all relays if relayUrls is empty
    /**
     * Subscribe using a subId and filters.
     * Callbacks: `onEvent`, `onEose`, `onNotice`, `onSubClosed`.
     */
    subscribe(subId: string, filters: NostrFilter[] | object[], relayUrls: string[] = []): void {
        const msg = JSON.stringify(['REQ', subId, ...filters]);
        const targetRelays = relayUrls.length > 0
            ? new Map([...this.relays].filter(([url]) => relayUrls.includes(url)))
            : this.relays;
        for (const [url, ws] of targetRelays) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(msg);
                if (!this.subscriptions.has(subId)) {
                    this.subscriptions.set(subId, new Set());
                }
                this.subscriptions.get(subId)!.add(url);
            } else {
                console.warn(`Cannot subscribe to ${url}: WebSocket is not open`);
            }
        }
    }

    // Unsubscribe from specified relays or all relays if relayUrls is empty
    /** Unsubscribe a subId from specific relays or all. */
    unsubscribe(subId: string, relayUrls: string[] = []): void {
        const msg = JSON.stringify(['CLOSE', subId]);
        const relays = this.subscriptions.get(subId);
        if (relays) {
            const targetRelays = relayUrls.length > 0
                ? new Set([...relays].filter(url => relayUrls.includes(url)))
                : relays;
            for (const url of targetRelays) {
                const ws = this.relays.get(url);
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(msg);
                } else {
                    console.warn(`Cannot unsubscribe from ${url}: WebSocket is not open`);
                }
                relays.delete(url);
            }
            if (relays.size === 0) {
                this.subscriptions.delete(subId);
            }
        }
    }

    // Close connections to specified relays or all relays if relayUrls is empty
    /** Close connections to specific relays or all. */
    close(relayUrls: string[] = []): void {
        const targetRelays = relayUrls.length > 0
            ? new Map([...this.relays].filter(([url]) => relayUrls.includes(url)))
            : this.relays;
        for (const [url, ws] of targetRelays) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close(1000, "Normal Closure");
            }
            this.relays.delete(url);
            // Remove associated subscriptions
            for (const [subId, urls] of this.subscriptions) {
                urls.delete(url);
                if (urls.size === 0) {
                    this.subscriptions.delete(subId);
                }
            }
        }
        if (relayUrls.length === 0) {
            this.subscriptions.clear();
        }
    }

    /** Enable periodic PING messages every 30 seconds to keep the connection alive. */
    // TODO: Potential for mutliple intervals for some edge cases
    // Should track interval IDs per relay and clear on close
    enablePing(relayUrl: string): void {
        const intervalId = setInterval(() => {
            const ws = this.relays.get(relayUrl);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(['PING']));
            } else {
                console.log(`${new Date().toISOString()} :: Ping cancelled for ${relayUrl}: WebSocket is not open`);
                clearInterval(intervalId);
            }
        }, 30000); // 30 seconds
    }

    /** Fired when a relay connection is opened. */
    onConnected(callback: (relayUrl: string) => void): this {
        this.onConnectedCallback = callback;
        return this;
    }

    /** Fired when a relay connection is closed. */
    onClosed(callback: (closeEvent: CloseEvent, relayUrl: string) => void): this {
        this.onClosedCallback = callback;
        return this;
    }

    /** Fired when a WebSocket error occurs. */
    onError(callback: (error: Error, relayUrl: string) => void): void {
        this.onErrorCallback = callback;
    }

    /** Fired for each EVENT message from relays (after optional verification). */
    onEvent(callback: (subId: string, event: NostrEvent, relayUrl: string) => void): void {
        this.onEventCallback = callback;
    }

    /** Fired for OK responses after publishing. */
    onOk(callback: (eventId: string, accepted: boolean, message: string, relayUrl: string) => void): void {
        this.onOkCallback = callback;
    }

    /** Fired for EOSE messages indicating end-of-stored-events. */
    onEose(callback: (subId: string, relayUrl: string) => void): void {
        this.onEoseCallback = callback;
    }

    /** Fired when a server closes a subscription. */
    onSubClosed(callback: (subId: string, relayUrl: string) => void): void {
        this.onSubClosedCallback = callback;
    }

    /** Fired for NOTICE messages from a relay. */
    onNotice(callback: (notice: string, relayUrl: string) => void): void {
        this.onNoticeCallback = callback;
    }

}

/**
 * Static helpers for key generation, conversions, and event signing/verification.
 */
export class Nostr {

    // Generate new private and public keys
    /** Generate a new private/public key pair (hex-encoded). */
    static generateKey(): { privateKey: string; publicKey: string } {
        const privateKeyBytes = schnorr.utils.randomSecretKey();
        const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
        const privateKey = bytesToHex(privateKeyBytes);
        const publicKey = bytesToHex(publicKeyBytes);
        return { privateKey, publicKey };
    }

    // Recover (import) private key from hex string and derive public key
    /**
     * Validate and normalize a 32-byte private key, deriving its public key.
     */
    static recoverKey(privateKeyHex: string): { privateKey: string; publicKey: string } {
        try {
            const privateKeyBytes = hexToBytes(privateKeyHex);
            if (privateKeyBytes.length !== 32) {
                throw new Error('Invalid private key length');
            }
            const publicKeyBytes = schnorr.getPublicKey(privateKeyBytes);
            const publicKey = bytesToHex(publicKeyBytes);
            return { privateKey: privateKeyHex, publicKey };
        } catch (_error) {
            throw new Error('Invalid private key hex');
        }
    }

    // Decode nsec (Bech32 encoded private key) to hex
    /** Convert an `nsec1...` Bech32 private key to hex. */
    static nsecToHex(nsec: string): string {
        try {
            const { prefix, words } = bech32.decode(nsec as `${string}1${string}`);
            if (prefix !== 'nsec') {
                throw new Error('Invalid nsec prefix');
            }
            const bytes = new Uint8Array(bech32.fromWords(words));
            if (bytes.length !== 32) {
                throw new Error('Invalid nsec length');
            }
            return bytesToHex(bytes);
        } catch (_error) {
            throw new Error('Invalid nsec format');
        }
    }

    // Encode hex private key to nsec (Bech32)
    /** Convert a 32-byte hex private key to `nsec1...` Bech32. */
    static hexToNsec(hex: string): string {
        try {
            const bytes = hexToBytes(hex);
            if (bytes.length !== 32) {
                throw new Error('Invalid private key length');
            }
            return bech32.encode('nsec', bech32.toWords(bytes));
        } catch (_error) {
            throw new Error('Invalid hex format');
        }
    }

    // Decode npub (Bech32 encoded public key) to hex
    /** Convert an `npub1...` Bech32 public key to hex. */
    static npubToHex(npub: string): string {
        try {
            const { prefix, words } = bech32.decode(npub as `${string}1${string}`);
            if (prefix !== 'npub') {
                throw new Error('Invalid npub prefix');
            }
            const bytes = new Uint8Array(bech32.fromWords(words));
            if (bytes.length !== 32) {
                throw new Error('Invalid npub length');
            }
            return bytesToHex(bytes);
        } catch (_error) {
            throw new Error('Invalid npub format');
        }
    }

    // Encode hex public key to npub (Bech32)
    /** Convert a 32-byte hex public key to `npub1...` Bech32. */
    static hexToNpub(hex: string): string {
        try {
            const bytes = hexToBytes(hex);
            if (bytes.length !== 32) {
                throw new Error('Invalid public key length');
            }
            return bech32.encode('npub', bech32.toWords(bytes));
        } catch (_error) {
            throw new Error('Invalid hex format');
        }
    }

    // Sign a Nostr event
    /** Sign a Nostr event with a private key (hex or bytes). */
    static signEvent(event: NostrEvent, hexOrBytes: string | Uint8Array): NostrEvent {
        const privateKeyBytes = typeof hexOrBytes === 'string' ? hexToBytes(hexOrBytes) : hexOrBytes;
        const serialized = JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags,
            event.content,
        ]);
        const hash = sha256(new TextEncoder().encode(serialized));
        const sigBytes = schnorr.sign(hash, privateKeyBytes, schnorr.utils.randomSecretKey());
        const sig = bytesToHex(sigBytes);
        const id = bytesToHex(hash);

        return {
            ...event,
            id,
            sig,
        };
    }

    // Verify a signed event (optional utility)
    /** Verify a Nostr event signature and recomputed id. */
    static verifyEvent(event: NostrEvent): boolean {
        if (!event.id || !event.sig) return false;
        const serialized = JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags,
            event.content,
        ]);
        const hash = sha256(new TextEncoder().encode(serialized));
        const idCheck = bytesToHex(hash) === event.id;
        if (!idCheck) return false;
        return schnorr.verify(hexToBytes(event.sig), hash, hexToBytes(event.pubkey));
    }
}

/**
 * NIP-07 browser extension interface for signing and encryption helpers.
 */
export interface NIP07 {
    getPublicKey(): Promise<string>
    signEvent(event: NostrEvent): Promise<NostrEvent> // Pass event with no id or sig
    nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>
        decrypt(pubkey: string, ciphertext: string): Promise<string>
    }
    nip44?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>
        decrypt(pubkey: string, ciphertext: string): Promise<string>
    }
}

/**
 * Nostr REQ filter type (NIP-01-compatible). Minimal representation used by the pool.
 */
export type NostrFilter = {
    ids?: string[];
    authors?: string[];
    kinds: number[];
    since?: number;
    until?: number;
    limit?: number;
} | Record<string, string[]>;
