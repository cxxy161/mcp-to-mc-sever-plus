import mineflayer from 'mineflayer';
type ConnectionState = 'connected' | 'connecting' | 'disconnected';
interface BotConfig {
    host: string;
    port: number;
    username: string;
}
interface ConnectionCallbacks {
    onLog: (level: string, message: string) => void;
    onChatMessage: (username: string, message: string) => void;
}
export declare class BotConnection {
    private bot;
    private state;
    private config;
    private callbacks;
    private isReconnecting;
    private reconnectTimer;
    private readonly reconnectDelayMs;
    constructor(config: BotConfig, callbacks: ConnectionCallbacks, reconnectDelayMs?: number);
    getBot(): mineflayer.Bot | null;
    getState(): ConnectionState;
    getConfig(): BotConfig;
    isConnected(): boolean;
    connect(): void;
    private registerEventHandlers;
    attemptReconnect(): void;
    checkConnectionAndReconnect(): Promise<{
        connected: boolean;
        message?: string;
    }>;
    cleanup(): void;
    private formatError;
}
export {};
