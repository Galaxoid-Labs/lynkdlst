<script lang="ts">
    import { type NostrEvent, NostrRelayPool, type NostrFilter } from "$lib/simple-nostr";
    import type { EventLink, AuthorMetadata } from "$lib/types";
    import { onMount } from "svelte";

    import logo from "$lib/assets/lnkdlst_logo.svg";
    import EventLinkView from "$lib/components/EventLinkView.svelte";

    let relayPool: NostrRelayPool;
    let relays = $state<string[]>(["wss://relay.damus.io"]);
    let events = $state<EventLink[]>([]);
    let authorMetadata = $state<Record<string, AuthorMetadata>>({});
    let loggedInUserPubkey = $state<string | null>(null);
    let loggedInUserMetadata = $state<AuthorMetadata | null>(null);
    let loggedInUserRelays = $state<string[] | null>(null);

    onMount(() => {
        connectRelays();
    });

    function connectRelays() {
        relayPool?.close(); // Disconnect existing pool if any
        events = [];
        authorMetadata = {};
        relayPool = new NostrRelayPool(relays)
            .onConnected((relayUrl) => {
                const filter: NostrFilter = {
                    kinds: [39701],
                    limit: 200,
                };
                relayPool.subscribe("event-links", [filter], [relayUrl]);
                relayPool.enablePing(relayUrl);
        });

        relayPool?.onEvent((subId, event, relayUrl) => {
            switch (subId) {
                case "event-links":
                    processLinkEvent(event, relayUrl);
                    break;
                case "author-metadata":
                    processAuthorMetadataEvent(event, relayUrl);
                    break;
                case "logged-in-user-metadata":
                    processLoggedInUserMetadataEvent(event, relayUrl);
                    break;
                case "logged-in-user-relays":
                    processLoggedInUserRelaysEvent(event, relayUrl);
                    break;
                default:
                    console.warn(`Unknown subscription ID: ${subId}`);
            }
        });

        relayPool?.onEose((subId, relayUrl) => {
            if (subId == "event-links") {
                const filter: NostrFilter = {
                    kinds: [0],
                    authors: [...new Set(events.map((e) => e.author))],
                };
                relayPool.subscribe("author-metadata", [filter], [relayUrl]);
            }
        });

        relayPool?.onClosed((ev, relayUrl) => {
            console.log(`${new Date().toISOString()} :: Disconnected from relay: ${relayUrl}`, ev);
        });
        relayPool?.onError((err, relayUrl) => {
            console.error(`${new Date().toISOString()} :: Error on relay ${relayUrl}:`, err);
        });
    }

    function processLinkEvent(event: NostrEvent, relayUrl: string) {
        if (event.content === "" || !event.content) {
            return; // Skip empty content events
        }

        // TODO: For now lets skip bookmarks that have nevents in their content
        if (event.content.includes("nostr:nevent")) {
            return; // Skip bookmark events
        }

        // Get linkUrl from "d" tag
        const linkTag = getTagValue(event, "d");
        if (!linkTag) {
            return; // Skip events without "d" tag
        }

        // Get title from "title" tag
        const titleTag = getTagValue(event, "title");
        if (!titleTag) {
            return; // Skip events without "title" tag
        }

        let el: EventLink = {
            id: event.id || "",
            relay: relayUrl,
            author: event.pubkey || "",
            description: event.content || "",
            linkUrl: "https://" + linkTag,
            title: titleTag,
            tags: getTagValues(event, "t"),
            publishedAt: new Date(event.created_at * 1000),
        };

        events.push(el);
        // Sort events by publishedAt descending
        events.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
    }

    function processAuthorMetadataEvent(event: NostrEvent, relayUrl: string) {
        // Placeholder for processing author metadata events if needed
        const metadata: AuthorMetadata = JSON.parse(event.content);
        authorMetadata[event.pubkey] = {
            pubkey: event.pubkey,
            name: metadata.name,
            display_name: metadata.display_name,
            picture: metadata.picture,
        };
    }

    function processLoggedInUserMetadataEvent(event: NostrEvent, relayUrl: string) {
        // Placeholder for processing logged-in user metadata events if needed
        const metadata: AuthorMetadata = JSON.parse(event.content);
        console.log("Logged-in user metadata:", metadata);
        loggedInUserMetadata = {
            pubkey: event.pubkey,
            name: metadata.name,
            display_name: metadata.display_name,
            picture: metadata.picture,
        };
    }

    function processLoggedInUserRelaysEvent(event: NostrEvent, relayUrl: string) {
        // Placeholder for processing logged-in user relays events if needed
        console.log("Logged-in user relays event:", event);
        // Extrat relay urls from tags
        // TODO: Only grab "write" relays for now. This means "r" tags with no marker value or "write" as second value
        const relays = getTagValues(event, "r");
        loggedInUserRelays = relays;
    }

    // Get first value of a specific tag
    function getTagValue(event: NostrEvent, tag: string): string | undefined {
        const found = event.tags.find((t) => t[0] === tag);
        if (found && found.length > 1) {
            return found[1];
        }
        return undefined;
    }

    // Get all values of a specific tag
    function getTagValues(event: NostrEvent, tag: string): string[] {
        return event.tags
            .filter((t) => t[0] === tag)
            .map((t) => t.slice(1))
            .flat();
    }

    function login() {
        if (window.nostr) {
            window.nostr.getPublicKey().then((pubkey: string) => {
                console.log("Logged in with pubkey:", pubkey);
                loggedInUserPubkey = pubkey;
                fetchLoggedInUserMetadata();
                fetchLoggedInUserRelays();
            });
        } else {
            alert("Nostr extension not found!");
        }
    }

    function togglePostLinkModal() {
        const modal = document.getElementById("post-link-modal") as HTMLDialogElement;
        if (modal) {
            if (modal.open) {
                modal.close();
                // allow background scrolling
                document.documentElement.classList.remove("modal-is-open");
            } else {
                modal.showModal();
                // prevent background scrolling
                document.documentElement.classList.add("modal-is-open");
            }
        }
    }

    function submitLink() {
        // fetch link
        const urlInput = document.querySelector('input[name="post-link-url"]') as HTMLInputElement;
        const linkUrl = urlInput ? urlInput.value : "";

        // fetch title
        const titleInput = document.querySelector('input[name="post-link-title"]') as HTMLInputElement;
        const title = titleInput ? titleInput.value : "";

        // fetch description
        const descriptionInput = document.querySelector('textarea[name="post-link-description"]') as HTMLTextAreaElement;
        const description = descriptionInput ? descriptionInput.value : "";

        // fetch tags
        const tagsInput = document.querySelector('input[name="post-link-tags"]') as HTMLInputElement;
        const tags = tagsInput ? tagsInput.value.split(",").map((tag) => tag.trim()) : [];
        console.log("Submitting link:", { linkUrl, description, tags });

        // clear inputs
        if (urlInput) urlInput.value = "";
        if (titleInput) titleInput.value = "";
        if (descriptionInput) descriptionInput.value = "";
        if (tagsInput) tagsInput.value = "";

        // Create NostrEvent
        const dTag = linkUrl.replace(/^https?:\/\//, ""); // remove protocol for "d" tag
        const nostrEvent: NostrEvent = {
            kind: 39701,
            pubkey: loggedInUserPubkey || "",
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ["d", dTag],
                ["title", title],
                ["published_at", `${Math.floor(Date.now() / 1000)}`],
                ...tags.map((tag) => ["t", tag]),
            ],
            content: description,
        };

        // Request signature from Nostr extension
        if (window.nostr) {
            let signedEvent: NostrEvent;
            window.nostr
                .signEvent(nostrEvent)
                .then((event: NostrEvent) => {
                    signedEvent = event;
                    // Publish to relay pool
                    relayPool.publish(signedEvent);
                })
                .catch((err: Error) => {
                    console.error("Error signing event:", err);
                });
        }

        togglePostLinkModal();
    }

    function fetchLoggedInUserMetadata() {
        if (window.nostr) {
            window.nostr.getPublicKey().then((pubkey: string) => {
                const filter: NostrFilter = {
                    kinds: [0],
                    authors: [pubkey],
                };
                relayPool.subscribe("logged-in-user-metadata", [filter], relayPool.getRelayUrls());
            });
        }
    }

    function fetchLoggedInUserRelays() {
        if (window.nostr) {
            window.nostr.getPublicKey().then((pubkey: string) => {
                const filter: NostrFilter = {
                    kinds: [10002],
                    authors: [pubkey],
                };
                relayPool.subscribe("logged-in-user-relays", [filter], relayPool.getRelayUrls());
            });
        }
    }

    function close() {
        relayPool?.close();
    }

</script>

<!-- Post Link Modal -->
<dialog id="post-link-modal">
    <article>
        <h2>Post a new link</h2>
        <label for="post-link-url"
            ><small>Link URL</small>
            <input id="post-link-url" type="url" name="post-link-url" aria-label="Link URL" required />
        </label>
        <label for="post-link-title"
            ><small>Title</small>
            <input id="post-link-title" type="text" name="post-link-title" aria-label="Title" required />
        </label>
        <label for="post-link-description"
            ><small>Description <em>(Optional)</em></small>
            <textarea
                id="post-link-description"
                name="post-link-description"
                aria-label="Link description or notes"
                style="opacity: 0.5;"
            ></textarea>
        </label>
        <label for="post-link-tags"
            ><small>Tags <em>(Optional)</em></small>
            <input id="post-link-tags" type="text" name="post-link-tags" placeholder="nostr,bookmark,web" aria-label="Tags" />
        </label>
        <footer>
            <button class="secondary" onclick={togglePostLinkModal}> Cancel</button><button onclick={submitLink}>
                Submit
            </button>
        </footer>
    </article>
</dialog>

<header>
    <!-- <img src={logo} alt="icon" width="64" height="64" style="margin-bottom: 0.5em;" /> -->
    <h1>Web bookmarks</h1>
    <p class="muted">Decentralized web bookmarks</p>
    <div class="user-controls">
            {#if loggedInUserMetadata}
                {#if loggedInUserMetadata.picture}
                    <!-- svelte-ignore a11y_missing_attribute -->
                    <img class="avatar" src={loggedInUserMetadata.picture} />
                {:else}
                    <!-- svelte-ignore a11y_missing_attribute -->
                    <img class="avatar" src="https://robohash.org/{loggedInUserPubkey || ''}" />
                {/if}
                <span class="author-name"
                    >{loggedInUserMetadata.display_name || loggedInUserMetadata.name || loggedInUserMetadata.pubkey.slice(0, 8)}
                </span>
                <span style="padding-left: 0.4em;">::</span>
                <a href="#" style="padding-left: 0.5em;" onclick={close}>Logout</a>
                <a href="#" class="right" onclick={togglePostLinkModal}>📝 Post Link</a>
            {:else}
                <a href="#" onclick={login}>Login</a>
            {/if}
    </div>
    <!-- <nav aria-label="breadcrumb">
        <ul>
            <li><span style="margin-left: 0.2em; font-weight: 800;">Tag &nbsp;</span></li>
            <li><a href="#">music</a></li>
        </ul>
    </nav> -->

</header>

<main class="grid">

    {#if events.length > 0}
        <div class="event-list">
            {#each events as event}
                <EventLinkView {event} authorMetadata={authorMetadata[event.author]} />
            {/each}
        </div>
    {/if}
</main>

<footer>
    <p class="muted">Connected Relays: {relays.length}</p>
</footer>

<style>
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    #post-link-modal {
        animation: fadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }
    .user-controls {
        padding: 0.4em 0.5em;
        display: grid;
        align-items: center;
        grid-template-columns: auto auto auto 1fr auto;
    }
    /* .user-controls, a, a:hover, a:visited {
        color: var(--accent);
    } */
    .author-name {
        font-weight: 500;
        font-size: 1em;
    }
    .avatar {
        background-color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        margin-right: 6px;
    }
    .grid {
        padding: 1em;
        border-top: 1px solid var(--line);
        border-bottom: none; 
        border-left: none;
        border-right: none;
    }
    header {
        padding: 1em;
    }

</style>
