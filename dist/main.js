#!/usr/bin/env node
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setupStdioFiltering } from './stdio-filter.js';
import { log } from './logger.js';
import { parseConfig } from './config.js';
import { BotConnection } from './bot-connection.js';
import { ToolFactory } from './tool-factory.js';
import { MessageStore } from './message-store.js';
import { registerPositionTools } from './tools/position-tools.js';
import { registerInventoryTools } from './tools/inventory-tools.js';
import { registerBlockTools } from './tools/block-tools.js';
import { registerEntityTools } from './tools/entity-tools.js';
import { registerChatTools } from './tools/chat-tools.js';
import { registerFlightTools } from './tools/flight-tools.js';
import { registerGameStateTools } from './tools/gamestate-tools.js';
import { registerCraftingTools } from './tools/crafting-tools.js';
import { registerFurnaceTools } from './tools/furnace-tools.js';
import { registerVillagerTools } from './tools/villager-tools.js';
setupStdioFiltering();
process.on('unhandledRejection', (reason) => {
    log('error', `Unhandled rejection: ${reason}`);
});
process.on('uncaughtException', (error) => {
    log('error', `Uncaught exception: ${error}`);
});
async function main() {
    const config = parseConfig();
    const messageStore = new MessageStore();
    const connection = new BotConnection(config, {
        onLog: log,
        onChatMessage: (username, message) => messageStore.addMessage(username, message)
    });
    const server = new McpServer({
        name: "minecraft-mcp-server",
        version: "2.0.4"
    });
    const factory = new ToolFactory(server, connection);
    const getBot = () => connection.getBot();
    registerPositionTools(factory, getBot);
    registerInventoryTools(factory, getBot);
    registerBlockTools(factory, getBot);
    registerEntityTools(factory, getBot);
    registerChatTools(factory, getBot, messageStore);
    registerFlightTools(factory, getBot);
    registerGameStateTools(factory, getBot);
    registerCraftingTools(factory, getBot);
    registerFurnaceTools(factory, getBot);
    registerVillagerTools(factory, getBot);

    server.tool("join-server", "Connect the bot to a Minecraft server", {
        host: z.string().describe("Server hostname or IP"),
        port: z.coerce.number().int().positive().describe("Server port"),
        username: z.string().optional().describe("Bot username (default: current)")
    }, async (args) => {
        try {
            const parsed = z.object({
                host: z.string(),
                port: z.coerce.number().int().positive(),
                username: z.string().optional()
            }).parse(args);
            const currentConfig = connection.getConfig();
            const botUsername = parsed.username || currentConfig.username;
            connection.connectTo(parsed.host, parsed.port, botUsername);
            await connection.waitForConnection(10000);
            return { content: [{ type: "text", text: `Connected to ${parsed.host}:${parsed.port} as ${botUsername}` }] };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text", text: `Failed: ${msg}` }], isError: true };
        }
    });

    process.stdin.on('end', () => {
        connection.cleanup();
        log('info', 'MCP Client has disconnected. Shutting down...');
        process.exit(0);
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((error) => {
    log('error', `Fatal error in main(): ${error}`);
    process.exit(1);
});
