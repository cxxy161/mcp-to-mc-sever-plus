import { z } from "zod";
import { Vec3 } from 'vec3';
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { coerceCoordinates } from './coordinate-utils.js';
import { log } from '../logger.js';

function isPlayer(entity) {
    return entity.type === 'player';
}

function isMob(entity) {
    return entity.type === 'mob';
}

function matchesEntityType(entity, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    if (q === 'player') return isPlayer(entity);
    if (q === 'mob') return isMob(entity);
    const name = entity.name || entity.type || '';
    return name.toLowerCase().includes(q);
}

function findEntityAt(bot, pos, maxDist = 2) {
    for (const entity of Object.values(bot.entities)) {
        if (entity === bot.entity) continue;
        const ePos = entity.position.floored();
        if (Math.abs(ePos.x - pos.x) <= maxDist &&
            Math.abs(ePos.y - pos.y) <= maxDist &&
            Math.abs(ePos.z - pos.z) <= maxDist) {
            return entity;
        }
    }
    return null;
}

function findEntityByType(bot, type, maxDistance) {
    const entities = Object.values(bot.entities).filter(e => e !== bot.entity && matchesEntityType(e, type));
    let nearest = null;
    let nearestDist = Infinity;
    for (const entity of entities) {
        const dist = bot.entity.position.distanceTo(entity.position);
        if (dist <= maxDistance && dist < nearestDist) {
            nearest = entity;
            nearestDist = dist;
        }
    }
    return nearest;
}

function resolveEntity(bot, type, x, y, z, maxDistance) {
    if (x !== undefined && y !== undefined && z !== undefined) {
        const pos = new Vec3(x, y, z).floored();
        const entity = findEntityAt(bot, pos);
        if (entity && (!type || matchesEntityType(entity, type))) {
            return entity;
        }
        if (type) {
            const byType = findEntityByType(bot, type, maxDistance);
            if (byType) return byType;
        }
        return null;
    }
    if (type) return findEntityByType(bot, type, maxDistance);
    return null;
}

async function goNear(bot, pos, range = 3) {
    try {
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
        await bot.pathfinder.goto(goal);
    }
    catch (_) { }
}

function entityDisplayName(entity) {
    return entity.name || entity.username || entity.type || 'entity';
}

export function registerInteractionTools(factory, getBot) {
    factory.registerTool("activate-block", "Right-click a block using the currently held item (till soil, plant seeds, apply bone meal, press buttons, etc.)", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
    }, async ({ x, y, z }) => {
        ({ x, y, z } = coerceCoordinates(x, y, z));
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const pos = new Vec3(x, y, z).floored();
        const block = bot.blockAt(pos);
        if (!block || block.name === 'air') {
            return factory.createResponse(`No block found at (${x}, ${y}, ${z})`);
        }
        await goNear(bot, pos);
        try {
            await bot.activateBlock(block);
            log('info', `Activated block ${block.name} at (${x}, ${y}, ${z})`);
            return factory.createResponse(`Activated ${block.name} at (${x}, ${y}, ${z})`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return factory.createResponse(`Failed to activate block at (${x}, ${y}, ${z}): ${msg}`);
        }
    });

    factory.registerTool("activate-entity", "Right-click an entity using the currently held item (breed animals, shear sheep, milk cows, etc.)", {
        type: z.string().optional().describe("Entity type name (e.g. 'cow', 'sheep'). Required if x/y/z not specified."),
        x: z.coerce.number().optional().describe("X coordinate of the entity"),
        y: z.coerce.number().optional().describe("Y coordinate of the entity"),
        z: z.coerce.number().optional().describe("Z coordinate of the entity"),
        maxDistance: z.coerce.number().finite().optional().describe("Max search distance when using type (default: 16)")
    }, async ({ type, x, y, z, maxDistance = 16 }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        if (!type && (x === undefined || y === undefined || z === undefined)) {
            return factory.createResponse("Provide either a 'type' to find nearby, or 'x/y/z' coordinates of the entity.");
        }
        if (x !== undefined) x = Number(x);
        if (y !== undefined) y = Number(y);
        if (z !== undefined) z = Number(z);
        const entity = resolveEntity(bot, type, x, y, z, maxDistance);
        if (!entity) {
            const loc = type ? `'${type}'` : `at (${x}, ${y}, ${z})`;
            return factory.createResponse(`No entity ${loc} found`);
        }
        const ePos = entity.position.floored();
        await goNear(bot, ePos);
        try {
            await bot.activateEntity(entity);
            const name = entityDisplayName(entity);
            log('info', `Activated entity ${name} at (${ePos.x}, ${ePos.y}, ${ePos.z})`);
            return factory.createResponse(`Activated ${name} at (${ePos.x}, ${ePos.y}, ${ePos.z})`);
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const name = entityDisplayName(entity);
            return factory.createResponse(`Failed to activate ${name}: ${msg}`);
        }
    });

    factory.registerTool("attack-entity", "Attack an entity (kill animals for food, defend yourself, etc.)", {
        type: z.string().optional().describe("Entity type name (e.g. 'cow', 'zombie'). Required if x/y/z not specified."),
        x: z.coerce.number().optional().describe("X coordinate of the entity"),
        y: z.coerce.number().optional().describe("Y coordinate of the entity"),
        z: z.coerce.number().optional().describe("Z coordinate of the entity"),
        maxDistance: z.coerce.number().finite().optional().describe("Max search distance when using type (default: 16)"),
        times: z.coerce.number().int().positive().optional().describe("Number of attacks to perform (default: 1)")
    }, async ({ type, x, y, z, maxDistance = 16, times = 1 }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        if (!type && (x === undefined || y === undefined || z === undefined)) {
            return factory.createResponse("Provide either a 'type' to find nearby, or 'x/y/z' coordinates of the entity.");
        }
        if (x !== undefined) x = Number(x);
        if (y !== undefined) y = Number(y);
        if (z !== undefined) z = Number(z);
        const entity = resolveEntity(bot, type, x, y, z, maxDistance);
        if (!entity) {
            const loc = type ? `'${type}'` : `at (${x}, ${y}, ${z})`;
            return factory.createResponse(`No entity ${loc} found`);
        }
        const ePos = entity.position.floored();
        await goNear(bot, ePos, 4);
        let attacks = 0;
        let lastError = '';
        for (let i = 0; i < times; i++) {
            try {
                await bot.attack(entity);
                attacks++;
                await new Promise(r => setTimeout(r, 200));
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                break;
            }
        }
        const name = entityDisplayName(entity);
        if (attacks === 0) {
            return factory.createResponse(`Failed to attack ${name}: ${lastError || 'Unknown error'}`);
        }
        let msg = `Attacked ${name} ${attacks} time(s) at (${ePos.x}, ${ePos.y}, ${ePos.z})`;
        if (attacks < times) msg += `\nNote: only ${attacks}/${times} completed. ${lastError || ''}`;
        return factory.createResponse(msg);
    });

    factory.registerTool("use-item", "Use the currently held item (eat food, drink potions, throw projectiles, etc.)", {
        times: z.coerce.number().int().positive().optional().describe("Number of times to use (default: 1)")
    }, async ({ times = 1 }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const hand = bot.heldItem || bot.inventory.slots[bot.quickBarSlot];
        if (!hand) return factory.createResponse("No item in hand to use");
        let used = 0;
        let lastError = '';
        for (let i = 0; i < times; i++) {
            try {
                await bot.activateItem();
                used++;
                if (i < times - 1) await new Promise(r => setTimeout(r, 500));
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                break;
            }
        }
        if (used === 0) {
            return factory.createResponse(`Failed to use ${hand.name}: ${lastError || 'Unknown error'}`);
        }
        let msg = `Used ${hand.name} ${used} time(s)`;
        if (used < times) msg += `\nNote: only ${used}/${times} completed. ${lastError || ''}`;
        return factory.createResponse(msg);
    });

    factory.registerTool("player-status", "Get the bot's current health, hunger, saturation, experience, and gamemode", {}, async () => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const health = typeof bot.health === 'number' ? bot.health.toFixed(1) : '?';
        const food = typeof bot.food === 'number' ? bot.food : '?';
        const sat = typeof bot.saturation === 'number' ? bot.saturation.toFixed(1) : '?';
        const oxygen = typeof bot.oxygenLevel === 'number' ? bot.oxygenLevel : '?';
        const level = typeof bot.experience?.level === 'number' ? bot.experience.level : '?';
        const progress = typeof bot.experience?.progress === 'number' ? (bot.experience.progress * 100).toFixed(0) : '?';
        const gm = bot.game?.gameMode || '?';
        const pos = bot.entity.position.floored();
        let text = `Player status:\n\n`;
        text += `Health:     ${health} ❤\n`;
        text += `Hunger:    ${food} / 20\n`;
        text += `Saturation: ${sat}\n`;
        text += `Oxygen:    ${oxygen}\n`;
        text += `XP Level:  ${level} (${progress}% to next)\n`;
        text += `Game Mode: ${gm}\n`;
        text += `Position:  (${pos.x}, ${pos.y}, ${pos.z})\n`;
        return factory.createResponse(text);
    });
}
