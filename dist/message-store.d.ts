interface StoredMessage {
    timestamp: number;
    username: string;
    content: string;
}
export declare class MessageStore {
    private messages;
    private maxMessages;
    addMessage(username: string, content: string): void;
    getRecentMessages(count?: number): StoredMessage[];
    getMaxMessages(): number;
}
export {};
