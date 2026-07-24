export interface ServerConfig {
    host: string;
    port: number;
    username: string;
}
export declare function parseConfig(): ServerConfig;
