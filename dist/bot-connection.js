import mineflayer from 'mineflayer';
import pathfinderPkg from 'mineflayer-pathfinder';
const { pathfinder, Movements } = pathfinderPkg;
import minecraftData from 'minecraft-data';
const SUPPORTED_MINECRAFT_VERSION = '1.21.11';
export class BotConnection {
    bot = null;
    state = 'disconnected';
    config;
    callbacks;
    isReconnecting = false;
    reconnectTimer = null;
    reconnectDelayMs;
    constructor(config, callbacks, reconnectDelayMs = 2000) {
        this.config = config;
        this.callbacks = callbacks;
        this.reconnectDelayMs = reconnectDelayMs;
    }
    getBot() {
        return this.bot;
    }
    getState() {
        return this.state;
    }
    getConfig() {
        return this.config;
    }
    isConnected() {
        return this.state === 'connected';
    }
    connect() {
        const botOptions = {
            host: this.config.host,
            port: this.config.port,
            username: this.config.username,
            brand: 'fabric',
            plugins: { pathfinder },
        };
        this.bot = mineflayer.createBot(botOptions);
        this.state = 'connecting';
        this.isReconnecting = false;
        this.registerEventHandlers(this.bot);
    }
    registerEventHandlers(bot) {
        bot.once('spawn', async () => {
            this.state = 'connected';
            this.callbacks.onLog('info', 'Bot spawned in world');
            const mcData = minecraftData(bot.version);
            const defaultMove = new Movements(bot, mcData);
            bot.pathfinder.setMovements(defaultMove);
            if (bot.currentWindow) {
                try { bot.closeWindow(bot.currentWindow); } catch (_) { }
            }
            if (bot._client) {
                try { bot._client.write('close_window', { windowId: 0 }); } catch (_) { }
            }
            this.callbacks.onLog('info', `Bot connected successfully. Username: ${this.config.username}, Server: ${this.config.host}:${this.config.port}`);
        });
        bot.on('chat', (username, message) => {
            if (username === bot.username)
                return;
            this.callbacks.onChatMessage(username, message);
        });
        bot.on('kicked', (reason) => {
            this.callbacks.onLog('error', `Bot was kicked from server: ${this.formatError(reason)}`);
            this.state = 'disconnected';
            bot.quit();
        });
        bot.on('error', (err) => {
            const errorCode = err.code || 'Unknown error';
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.callbacks.onLog('error', `Bot error [${errorCode}]: ${errorMsg}`);
            if (errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
                this.state = 'disconnected';
            }
        });
        bot.on('login', () => {
            this.callbacks.onLog('info', 'Bot logged in successfully');
        });
        bot.on('end', (reason) => {
            this.callbacks.onLog('info', `Bot disconnected: ${this.formatError(reason)}`);
            if (this.state === 'connected') {
                this.state = 'disconnected';
            }
            if (this.bot === bot) {
                try {
                    bot.removeAllListeners();
                    this.bot = null;
                    this.callbacks.onLog('info', 'Bot instance cleaned up after disconnect');
                }
                catch (err) {
                    this.callbacks.onLog('warn', `Error cleaning up bot on end event: ${this.formatError(err)}`);
                }
            }
        });
    }
    attemptReconnect() {
        if (this.isReconnecting || this.state === 'connecting') {
            return;
        }
        this.isReconnecting = true;
        this.state = 'connecting';
        this.callbacks.onLog('info', `Attempting to reconnect to Minecraft server in ${this.reconnectDelayMs}ms...`);
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        this.reconnectTimer = setTimeout(() => {
            if (this.bot) {
                try {
                    this.bot.removeAllListeners();
                    this.bot.quit('Reconnecting...');
                    this.callbacks.onLog('info', 'Old bot instance cleaned up');
                }
                catch (err) {
                    this.callbacks.onLog('warn', `Error while cleaning up old bot: ${this.formatError(err)}`);
                }
            }
            this.callbacks.onLog('info', 'Creating new bot instance...');
            this.connect();
        }, this.reconnectDelayMs);
    }
    connectTo(host, port, username) {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.isReconnecting = false;
        if (this.bot) {
            try {
                this.bot.removeAllListeners();
                this.bot.quit('Switching server...');
            }
            catch (_) { }
            this.bot = null;
        }
        this.config.host = host;
        this.config.port = port;
        this.config.username = username;
        this.state = 'disconnected';
        this.connect();
    }

    async checkConnectionAndReconnect() {
        const currentState = this.state;
        if (currentState === 'disconnected') {
            return { connected: false, message: 'Bot is not connected. Use join-server tool first.' };
        }
        if (currentState === 'connecting') {
            return { connected: false, message: 'Bot is connecting to the Minecraft server. Please wait a moment and try again.' };
        }
        return { connected: true };
    }
    cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        if (this.bot) {
            try {
                this.bot.quit('Server shutting down');
            }
            catch (err) {
                this.callbacks.onLog('warn', `Error during cleanup: ${this.formatError(err)}`);
            }
        }
    }
    formatError(error) {
        if (error instanceof Error) {
            return error.message;
        }
        try {
            return JSON.stringify(error);
        }
        catch {
            return String(error);
        }
    }
}
