export type EventLink = {
    id: string;
    relay: string;
    author: string;
    description: string;
    linkUrl: string;
    title: string;
    tags: string[];
    publishedAt: Date;
};

export type AuthorMetadata = {
    pubkey: string;
    name?: string;
    display_name?: string;
    picture?: string;
};