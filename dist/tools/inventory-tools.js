import { z } from "zod";
import { Vec3 } from 'vec3';

let currentWindow = null;

function formatItems(items) {
    if (!items || items.length === 0) return "empty";
    return items.map(i => `${i.name} (x${i.count}) slot ${i.slot}`).join(', ');
}

export function registerInventoryTools(factory, getBot) {
    factory.registerTool("list-inventory", "List all items in the bot's inventory", {}, async () => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const items = bot.inventory.items();
        if (items.length === 0) return factory.createResponse("Inventory is empty");
        let text = `Found ${items.length} items in inventory:\n\n`;
        items.forEach(item => { text += `- ${item.name} (x${item.count}) in slot ${item.slot}\n`; });
        return factory.createResponse(text);
    });

    factory.registerTool("find-item", "Find a specific item in the bot's inventory", {
        nameOrType: z.string().describe("Name or type of item to find")
    }, async ({ nameOrType }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const items = bot.inventory.items();
        const item = items.find((item) => item.name.includes(nameOrType.toLowerCase()));
        if (item) return factory.createResponse(`Found ${item.count} ${item.name} in inventory (slot ${item.slot})`);
        return factory.createResponse(`Couldn't find any item matching '${nameOrType}' in inventory`);
    });

    factory.registerTool("equip-item", "Equip a specific item", {
        itemName: z.string().describe("Name of the item to equip"),
        destination: z.string().optional().describe("Where to equip the item (default: 'hand')")
    }, async ({ itemName, destination = 'hand' }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const items = bot.inventory.items();
        const item = items.find((item) => item.name.includes(itemName.toLowerCase()));
        if (!item) return factory.createResponse(`Couldn't find any item matching '${itemName}' in inventory`);
        await bot.equip(item, destination);
        return factory.createResponse(`Equipped ${item.name} to ${destination}`);
    });

    factory.registerTool("open-chest", "Open a chest at the specified position and show its contents", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
    }, async ({ x, y, z }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const pos = new Vec3(x, y, z).floored();
        const block = bot.blockAt(pos);
        if (!block || !block.name.includes('chest')) return factory.createResponse(`No chest found at (${x}, ${y}, ${z})`);
        try {
            const chest = await bot.openChest(block);
            currentWindow = chest;
            const container = chest.containerItems();
            const botItems = chest.items();
            let text = `Opened ${block.name} at (${x}, ${y}, ${z})\n\n`;
            text += `Container items (${container.length}):\n`;
            if (container.length === 0) text += "  empty\n";
            else container.forEach(i => { text += `  - ${i.name} (x${i.count}) slot ${i.slot}\n`; });
            text += `\nBot inventory (${botItems.length}):\n`;
            if (botItems.length === 0) text += "  empty\n";
            else botItems.forEach(i => { text += `  - ${i.name} (x${i.count}) slot ${i.slot}\n`; });
            return factory.createResponse(text);
        } catch (err) {
            return factory.createResponse(`Failed to open chest: ${err.message}`);
        }
    });

    factory.registerTool("chest-contents", "List items in the currently open chest", {}, async () => {
        if (!currentWindow) return factory.createResponse("No chest is currently open. Use open-chest first.");
        const container = currentWindow.containerItems();
        const botItems = currentWindow.items();
        let text = `Container items (${container.length}):\n`;
        if (container.length === 0) text += "  empty\n";
        else container.forEach(i => { text += `  - ${i.name} (x${i.count}) slot ${i.slot}\n`; });
        text += `\nBot inventory (${botItems.length}):\n`;
        if (botItems.length === 0) text += "  empty\n";
        else botItems.forEach(i => { text += `  - ${i.name} (x${i.count}) slot ${i.slot}\n`; });
        return factory.createResponse(text);
    });

    factory.registerTool("withdraw-from-chest", "Withdraw items from the open chest into bot inventory", {
        itemName: z.string().describe("Name of the item to withdraw"),
        count: z.coerce.number().int().positive().describe("Number of items to withdraw"),
    }, async ({ itemName, count }) => {
        if (!currentWindow) return factory.createResponse("No chest is currently open. Use open-chest first.");
        const container = currentWindow.containerItems();
        const item = container.find(i => i.name.includes(itemName.toLowerCase()));
        if (!item) return factory.createResponse(`No '${itemName}' found in chest`);
        const toTake = Math.min(count, item.count);
        try {
            await currentWindow.withdraw(item.type, null, toTake);
            return factory.createResponse(`Withdrew ${toTake} ${item.name} from chest`);
        } catch (err) {
            return factory.createResponse(`Failed to withdraw: ${err.message}`);
        }
    });

    factory.registerTool("deposit-to-chest", "Deposit items from bot inventory into the open chest", {
        itemName: z.string().describe("Name of the item to deposit"),
        count: z.coerce.number().int().positive().describe("Number of items to deposit"),
    }, async ({ itemName, count }) => {
        if (!currentWindow) return factory.createResponse("No chest is currently open. Use open-chest first.");
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const items = bot.inventory.items();
        const item = items.find(i => i.name.includes(itemName.toLowerCase()));
        if (!item) return factory.createResponse(`No '${itemName}' found in bot inventory`);
        const toDeposit = Math.min(count, item.count);
        try {
            await currentWindow.deposit(item.type, null, toDeposit);
            return factory.createResponse(`Deposited ${toDeposit} ${item.name} into chest`);
        } catch (err) {
            return factory.createResponse(`Failed to deposit: ${err.message}`);
        }
    });

    factory.registerTool("close-chest", "Close the currently open chest", {}, async () => {
        if (!currentWindow) return factory.createResponse("No chest is currently open");
        try {
            currentWindow.close();
            currentWindow = null;
            return factory.createResponse("Chest closed");
        } catch (err) {
            currentWindow = null;
            return factory.createResponse(`Closed chest (with cleanup): ${err.message}`);
        }
    });
}
