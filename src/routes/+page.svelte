<script lang="ts">
    import {
        type NostrEvent,
        NostrRelayPool,
        type NostrFilter,
    } from "$lib/simple-nostr";
    import { onMount } from "svelte";

    let relayPool: NostrRelayPool;
    let events = $state<EventLink[]>([]);
    let authorMetadata = $state<Record<string, AuthorMetadata>>({});

    onMount(() => {
        relayPool = new NostrRelayPool(["wss://relay.damus.io"]).onConnected(
            (relayUrl) => {
                const filter: NostrFilter = {
                    kinds: [39701],
                    limit: 200,
                };
                relayPool.subscribe("event-links", [filter], [relayUrl]);
            },
        );

        relayPool?.onEvent((subId, event, relayUrl) => {
            switch (subId) {
                case "event-links":
                    processLinkEvent(event, relayUrl);
                    break;
                case "author-metadata":
                    processAuthorMetadataEvent(event, relayUrl);
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
    });

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

    // Function to extract domain from URL
    function extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace("www.", "");
        } catch (e) {
            return url; // Return the original URL if parsing fails
        }
    }

    // Function that returns string of published date since now
    function timeAgo(date: Date): string {
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

        if (seconds < 60) return `${seconds}s ago`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    type EventLink = {
        id: string;
        relay: string;
        author: string;
        description: string;
        linkUrl: string;
        title: string;
        tags: string[];
        publishedAt: Date;
    };

    type AuthorMetadata = {
        pubkey: string;
        name?: string;
        display_name?: string;
        picture?: string;
    };
</script>

<main class="container">
{#if events.length === 0}{:else}
    <div class="event-list">
            {#each events as event}
                <article>
                    <header>
                        {#if authorMetadata[event.author]}
                            {#if authorMetadata[event.author].picture}
                                <img class="avatar" src={authorMetadata[event.author].picture}/>
                            {:else}
                                <img class="avatar" src="https://robohash.org/{event.author}" />
                            {/if}
                            <span class="author-name">{authorMetadata[event.author].display_name ||
                                    authorMetadata[event.author].name ||
                                    event.author}
                            </span>
                        {/if}
                        <small class="published-at">Published {timeAgo(event.publishedAt)}</small>
                    </header>
                    <h4>
                        <a href={event.linkUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
                        <small><em class="domain"> ↗ ({extractDomain(event.linkUrl)})</em></small>
                    </h4>

                        {#if event.description && event.description.trim() !== ""}
                            <p>{event.description}</p>
                        {/if}
                        {#if event.tags.length > 0}
                            {#each event.tags as tag}
                                <button class="tag">{tag}</button>
                            {/each}
                        {/if}

                    <footer></footer>

                </article>
            {/each}
    </div>
{/if}
</main>

<style>
    .domain {
        font-weight: 500;
        font-size: 0.83em;
        opacity: 0.5;
    }
    .container {
        padding: 1em;
    }
    .avatar {
        border-radius: 50%;
        width: 20px;
        height: 20px;
        margin-right: 8px;
    }
    .tag {
        margin-right: 6px;
        border-radius: 4px;
        padding: 1px 4px;
    }
    a:hover {
        cursor: pointer;
    }
    .published-at {
        float: right;
    }
</style>

<!-- <style>
    @media (prefers-color-scheme: dark) {

        .avatar {
            border-radius: 50%;
            width: 20px;
            height: 20px;
        }

        .author-name {
            font-size: 0.85em;
            color: #fff;
        }

        .tag-pill {
            display: inline-block;
            background-color: firebrick;
            color: #fff;
            border-radius: 2px;
            padding: 0px 6px;
            margin-right: 4px;
            font-size: 0.8em;
            vertical-align: middle;
            letter-spacing: 0.02em;
        }
        .source-domain {
            font-size: 0.85em;
            color: #888;
            margin-left: 0.5em;
        }
        div#footer-info {
            display: flex;
            flex-direction: row;
            column-gap: 5px;
            align-items: center;
            height: 60px;
            height: fit-content;
            padding-top: 12px;
        }
        .published-at {
            color: #a9a9a9;
            font-size: 0.85em;
        }
        em {
            color: #555;
            font-size: 0.93em;
        }
        ul {
            list-style-type: none;
            padding: 0;
        }
        div.event-list {
            max-width: 1000px;
            margin: 0 auto;
            margin-top: 1em;
            margin-bottom: 1em;
            background-color: #121212;
        }
        li {
            margin: 1em;
            padding: 0.5em;
            background-color: #121212;
            border: 1px solid #242424;
            border-radius: 5px;
            overflow-wrap: break-word;
        }
        a {
            color: blue;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        a:visited {
            color: darkviolet;
        }

    }

    @media (prefers-color-scheme: light) {

        .avatar {
            border-radius: 50%;
            width: 20px;
            height: 20px;
        }

        .author-name {
            font-size: 0.85em;
        }

        .tag-pill {
            display: inline-block;
            background-color: orangered;
            color: #fff;
            border-radius: 2px;
            padding: 0px 6px;
            margin-right: 4px;
            font-size: 0.8em;
            vertical-align: middle;
            letter-spacing: 0.02em;
        }
        .source-domain {
            font-size: 0.85em;
            color: #888;
            margin-left: 0.5em;
        }
        div#footer-info {
            display: flex;
            flex-direction: row;
            column-gap: 5px;
            align-items: center;
            height: 60px;
            height: fit-content;
            padding-top: 12px;
        }
        .published-at {
            color: #a9a9a9;
            font-size: 0.85em;
        }
        em {
            color: #555;
            font-size: 0.93em;
        }
        ul {
            list-style-type: none;
            padding: 0;
        }
        div.event-list {
            max-width: 1000px;
            margin: 0 auto;
            margin-top: 1em;
            margin-bottom: 1em;
        }
        li {
            margin: 1em;
            padding: 0.5em;
            border: 1px solid #e9e8e8;
            border-radius: 5px;
            overflow-wrap: break-word;
        }
        a {
            color: blue;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        a:visited {
            color: purple;
        }
    }

</style> -->
