<script lang="ts">
    import { fly } from "svelte/transition";
    import type { EventLink, AuthorMetadata } from "$lib/types";

    interface Props {
        event: EventLink;
        authorMetadata?: AuthorMetadata;
    }

    let { event, authorMetadata = undefined }: Props = $props();

    function extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace("www.", "");
        } catch (e) {
            return url; // Return the original URL if parsing fails
        }
    }

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
</script>

<article transition:fly={{ y: 50, duration: 500 }}>
    <div class="author-info">
        {#if authorMetadata}
            {#if authorMetadata.picture}
                <!-- svelte-ignore a11y_missing_attribute -->
                <img class="avatar" src={authorMetadata.picture} />
            {:else}
                <!-- svelte-ignore a11y_missing_attribute -->
                <img class="avatar" src="https://robohash.org/{event.author}" />
            {/if}
            <span class="author-name">{authorMetadata.display_name || authorMetadata.name || event.author} </span>
        {:else}
            <!-- svelte-ignore a11y_missing_attribute -->
            <img class="avatar" src="https://robohash.org/{event.author}" />
            <span class="author-name">{event.author.slice(0, 8)}</span>
        {/if}
        <small class="published-at">Published {timeAgo(event.publishedAt)}</small>
    </div>
    <h2>
        <a href={event.linkUrl} target="_blank" rel="noopener noreferrer">{event.title}</a>
        <small><em class="domain"> ↗ ({extractDomain(event.linkUrl)})</em></small>
    </h2>

    {#if event.description && event.description.trim() !== ""}
        <p class="muted">{event.description}</p>
    {/if}
    {#if event.tags.length > 0}
        {#each event.tags as tag}
            <button class="pill">{tag}</button>
        {/each}
    {/if}
</article>

<style>
    .author-info {
        background-color: var(--pico-card-sectioning-background-color); 
        display: grid;
        align-items: center;
        grid-template-columns: auto 1fr auto;
        margin-bottom: 1em;
    }
    .author-name {
        font-weight: 500;
        font-size: 1em;
    }
    .domain {
        font-weight: 500;
        font-size: 0.83em;
        opacity: 0.5;
    }
    .avatar {
        background-color: white;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        margin-right: 6px;
    }
    .pill {
        margin-right: 0.5em;
        /* margin-right: 6px;
        margin-bottom: 6px;
        border-radius: 4px;
        padding: 1px 4px; */
    }
    .published-at {
        float: right;
        opacity: 0.6;
        padding-top: 3px; /* Align with avatar */
    }
</style>
