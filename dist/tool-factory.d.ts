import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BotConnection } from './bot-connection.js';
type McpResponse = {
    content: {
        type: "text";
        text: string;
    }[];
    isError?: boolean;
    [key: string]: unknown;
};
export declare class ToolFactory {
    private server;
    private connection;
    constructor(server: McpServer, connection: BotConnection);
    registerTool(name: string, description: string, schema: Record<string, unknown>, executor: (args: any) => Promise<McpResponse>): void;
    createResponse(text: string): McpResponse;
    createErrorResponse(error: Error | string): McpResponse;
    private shouldValidateSchema;
    private parseArgs;
    private formatZodError;
}
export {};
