// See https://svelte.dev/docs/kit/types#app.d.ts

import type { NIP07 } from "$lib/simple-nostr";

// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	interface Window {
		nostr?: NIP07;
	}
}

export {};
