import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { MessageStore } from '../message-store.js';
export declare function registerChatTools(factory: ToolFactory, getBot: () => mineflayer.Bot, messageStore: MessageStore): void;
