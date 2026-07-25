import { z } from "zod";
import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;

let currentVillager = null;
let currentVillagerPos = null;

const PROFESSION_NAMES = {
    'minecraft:none': 'none',
    'minecraft:nitwit': 'nitwit',
    'minecraft:armorer': 'armorer',
    'minecraft:butcher': 'butcher',
    'minecraft:cartographer': 'cartographer',
    'minecraft:cleric': 'cleric',
    'minecraft:farmer': 'farmer',
    'minecraft:fisherman': 'fisherman',
    'minecraft:fletcher': 'fletcher',
    'minecraft:leatherworker': 'leatherworker',
    'minecraft:librarian': 'librarian',
    'minecraft:mason': 'mason',
    'minecraft:shepherd': 'shepherd',
    'minecraft:toolsmith': 'toolsmith',
    'minecraft:weaponsmith': 'weaponsmith'
};

function cleanProfession(raw) {
    if (!raw || raw === 'unknown') return 'unknown';
    const key = raw.includes(':') ? raw : `minecraft:${raw}`;
    return PROFESSION_NAMES[key] || raw.replace('minecraft:', '');
}

function getVillagerData(entity) {
    try {
        const meta = entity.metadata;
        if (!meta) return { profession: 'unknown', level: 0 };
        const data = meta[17];
        if (!data) return { profession: 'unknown', level: 0 };
        if (typeof data === 'object' && data !== null) {
            let prof = data.profession || data.villagerData?.profession || 'unknown';
            let level = data.level ?? data.villagerData?.level ?? 0;
            if (prof === 'unknown' && data.villagerData) {
                prof = typeof data.villagerData === 'object' ? (data.villagerData.profession || 'unknown') : 'unknown';
                level = typeof data.villagerData === 'object' ? (data.villagerData.level ?? 0) : 0;
            }
            return { profession: cleanProfession(prof), level };
        }
        if (typeof data === 'string' || typeof data === 'number') {
            return { profession: cleanProfession(String(data)), level: 0 };
        }
    }
    catch (_) { }
    return { profession: 'unknown', level: 0 };
}

function isVillagerEntity(entity) {
    return entity.name === 'villager' ||
        entity.name === 'entity.minecraft.villager' ||
        (entity.displayName && entity.displayName === 'Villager');
}

function formatTrade(trade, index) {
    const i1 = `${trade.inputItem1.count}× ${trade.inputItem1.name}`;
    const i2 = trade.inputItem2 ? ` + ${trade.inputItem2.count}× ${trade.inputItem2.name}` : '';
    const out = `${trade.outputItem.count}× ${trade.outputItem.name}`;
    const used = trade.nbTradeUses ?? 0;
    const maxTrades = trade.maximumNbTradeUses;
    const remaining = maxTrades != null ? maxTrades - used : '∞';
    const locked = trade.tradeDisabled ? ' [LOCKED]' : '';
    const display = maxTrades != null ? `${remaining}/${maxTrades}` : `∞`;
    return `  ${index}. [${i1}${i2} → ${out}] remaining: ${display}${locked}`;
}

function formatTrades(trades) {
    if (!trades || trades.length === 0) return '  No trades available';
    return trades.map((t, i) => formatTrade(t, i)).join('\n');
}

function formatInventory(bot) {
    const items = bot.inventory.items();
    let text = `Bot inventory (${items.length}):\n`;
    if (items.length === 0) text += "  empty\n";
    else items.forEach(i => { text += `  - ${i.name} (x${i.count}) slot ${i.slot}\n`; });
    return text;
}

function formatVillagerInfo(bot, entity) {
    const data = getVillagerData(entity);
    const pos = entity.position.floored();
    const dist = bot?.entity?.position ? Math.floor(bot.entity.position.distanceTo(entity.position)) : '?';
    return `  ${data.profession} (Lv. ${data.level}) at (${pos.x}, ${pos.y}, ${pos.z}) - ${dist}m away`;
}

export function registerVillagerTools(factory, getBot) {
    factory.registerTool("find-villager", "Find nearby villagers with profession info", {
        profession: z.string().optional().describe("Optional profession filter (e.g. 'librarian', 'farmer', 'weaponsmith')")
    }, async ({ profession }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const villagers = [];
        for (const entity of Object.values(bot.entities)) {
            if (isVillagerEntity(entity)) {
                const data = getVillagerData(entity);
                const pos = entity.position.floored();
                const dist = Math.floor(bot.entity.position.distanceTo(entity.position));
                villagers.push({ profession: data.profession, level: data.level, pos, distance: dist });
            }
        }
        let filtered = villagers;
        if (profession) {
            const q = profession.toLowerCase();
            filtered = villagers.filter(v => v.profession.toLowerCase().includes(q));
        }
        if (filtered.length === 0) {
            const msg = profession ? `No villagers with profession '${profession}' found nearby` : 'No villagers found nearby';
            return factory.createResponse(msg);
        }
        filtered.sort((a, b) => a.distance - b.distance);
        let text = `Found ${filtered.length} villager(s):\n\n`;
        filtered.forEach((v, i) => {
            text += `${i + 1}. ${v.profession} (Lv. ${v.level}) at (${v.pos.x}, ${v.pos.y}, ${v.pos.z}) - ${v.distance}m away\n`;
        });
        return factory.createResponse(text);
    });

    factory.registerTool("open-villager-trade", "Walk to and open a villager's trade window, showing all available trades", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
    }, async ({ x, y, z }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const pos = new Vec3(x, y, z).floored();
        let villagerEntity = null;
        for (const entity of Object.values(bot.entities)) {
            if (isVillagerEntity(entity)) {
                const ePos = entity.position.floored();
                if (Math.abs(ePos.x - pos.x) <= 2 && Math.abs(ePos.y - pos.y) <= 2 && Math.abs(ePos.z - pos.z) <= 2) {
                    villagerEntity = entity;
                    break;
                }
            }
        }
        if (!villagerEntity) {
            return factory.createResponse(`No villager found near (${x}, ${y}, ${z})`);
        }
        if (currentVillager) {
            try { currentVillager.close(); } catch (_) { }
            currentVillager = null;
        }
        try {
            const goal = new goals.GoalNear(pos.x, pos.y, pos.z, 3);
            await bot.pathfinder.goto(goal);
        }
        catch (_) { }
        try {
            currentVillager = await bot.openVillager(villagerEntity);
            currentVillagerPos = pos;
            const data = getVillagerData(villagerEntity);
            let text = `Opened ${data.profession} villager at (${x}, ${y}, ${z})`;
            if (data.level > 0) text += ` - Lv. ${data.level}`;
            const trades = currentVillager.trades || [];
            if (trades.length > 0) {
                text += `\n\nAvailable trades (${trades.length}):\n`;
                text += formatTrades(trades);
            }
            else {
                text += '\n\nThis villager has no trades available';
            }
            text += '\n\n' + formatInventory(bot);
            return factory.createResponse(text);
        }
        catch (err) {
            currentVillager = null;
            return factory.createResponse(`Failed to open villager trade: ${err.message}`);
        }
    });

    factory.registerTool("villager-trades", "List available trades from the currently open villager", {}, async () => {
        if (!currentVillager) return factory.createResponse("No villager trade window is open. Use open-villager-trade first.");
        const trades = currentVillager.trades || [];
        let text = `Available trades (${trades.length}):\n`;
        if (trades.length === 0) {
            text += "  (none)\n";
        }
        else {
            text += '\n' + formatTrades(trades);
        }
        const bot = getBot();
        if (bot) text += '\n\n' + formatInventory(bot);
        return factory.createResponse(text);
    });

    factory.registerTool("trade-with-villager", "Execute a trade with the currently open villager", {
        tradeIndex: z.coerce.number().int().min(0).describe("Index of the trade to execute (0-based)"),
        count: z.coerce.number().int().positive().optional().describe("Number of times to execute the trade (default: 1)")
    }, async ({ tradeIndex, count = 1 }) => {
        if (!currentVillager) return factory.createResponse("No villager trade window is open. Use open-villager-trade first.");
        const trades = currentVillager.trades || [];
        if (tradeIndex >= trades.length) {
            return factory.createResponse(`Trade index ${tradeIndex} out of range. There are ${trades.length} trades available (0-${trades.length - 1}).`);
        }
        const trade = trades[tradeIndex];
        if (trade.tradeDisabled) {
            return factory.createResponse(`Trade ${tradeIndex} is currently locked/disabled.`);
        }
        const used = trade.nbTradeUses ?? 0;
        const maxTrades = trade.maximumNbTradeUses ?? Infinity;
        const maxAffordable = maxTrades - used;
        const toExecute = Math.min(count, maxAffordable);
        if (toExecute <= 0 || !isFinite(toExecute)) {
            const maxDisplay = trade.maximumNbTradeUses != null ? trade.maximumNbTradeUses : '∞';
            return factory.createResponse(`Trade ${tradeIndex} has no remaining uses (max ${maxDisplay}).`);
        }
        const tradeDesc = `${trade.inputItem1.count}× ${trade.inputItem1.name}${trade.inputItem2 ? ` + ${trade.inputItem2.count}× ${trade.inputItem2.name}` : ''} → ${trade.outputItem.count}× ${trade.outputItem.name}`;
        let executed = 0;
        let lastError = '';
        for (let i = 0; i < toExecute; i++) {
            try {
                await currentVillager.trade(tradeIndex, 1);
                executed++;
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                break;
            }
        }
        if (executed === 0) {
            return factory.createResponse(`Failed to execute trade ${tradeIndex} (${tradeDesc}): ${lastError || 'Unknown error'}`);
        }
        let msg = `Executed trade ${tradeIndex} ${executed} time(s): ${tradeDesc}`;
        if (executed < toExecute) {
            msg += `\nNote: only ${executed} of ${toExecute} completed successfully. ${lastError || ''}`;
        }
        else if (executed < count) {
            const maxDisplay = trade.maximumNbTradeUses != null ? trade.maximumNbTradeUses : '∞';
            msg += `\nTrade exhausted after ${executed} use(s) (max ${maxDisplay}).`;
        }
        const bot = getBot();
        if (bot) msg += '\n\n' + formatInventory(bot);
        return factory.createResponse(msg);
    });

    factory.registerTool("close-villager", "Close the currently open villager trade window", {}, async () => {
        if (!currentVillager) return factory.createResponse("No villager trade window is open.");
        try {
            currentVillager.close();
            currentVillager = null;
            currentVillagerPos = null;
            return factory.createResponse("Villager trade window closed");
        }
        catch (err) {
            currentVillager = null;
            currentVillagerPos = null;
            return factory.createResponse(`Villager trade window closed (with cleanup): ${err.message}`);
        }
    });
}
