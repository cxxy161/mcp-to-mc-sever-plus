import { z } from "zod";
import pathfinderPkg from 'mineflayer-pathfinder';
const { goals } = pathfinderPkg;
import { Vec3 } from 'vec3';
import minecraftData from 'minecraft-data';
import { log } from '../logger.js';
import { coerceCoordinates } from './coordinate-utils.js';
const MAX_FIND_BLOCKS_COUNT = 256;

const CROP_MAX_GROWTH = {
    wheat: 7, carrots: 7, potatoes: 7, beetroots: 3,
    nether_wart: 3, pumpkin_stem: 7, melon_stem: 7,
    torchflower_crop: 7, pitcher_crop: 7
};

function getCropMaxGrowth(blockName) {
    for (const [name, max] of Object.entries(CROP_MAX_GROWTH)) {
        if (blockName.includes(name)) return max;
    }
    return null;
}

async function goNear(bot, pos, range = 2) {
    try {
        const goal = new goals.GoalNear(pos.x, pos.y, pos.z, range);
        await bot.pathfinder.goto(goal);
    }
    catch (_) { }
}

async function collectNearbyItems(bot, radius = 4) {
    const items = [];
    for (const entity of Object.values(bot.entities)) {
        if (entity === bot.entity) continue;
        if (entity.name === 'item' || entity.name === 'Item' || entity.type === 'object') {
            const dist = bot.entity.position.distanceTo(entity.position);
            if (dist <= radius) items.push(entity);
        }
    }
    if (items.length === 0) return 0;
    items.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
    let collected = 0;
    for (const item of items) {
        const pos = item.position.floored();
        const dist = bot.entity.position.distanceTo(item.position);
        if (dist < 1) continue;
        await goNear(bot, pos, 1);
        collected++;
        await new Promise(r => setTimeout(r, 150));
    }
    return collected;
}

export function registerBlockTools(factory, getBot) {
    factory.registerTool("place-block", "Place a block at the specified position", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
        faceDirection: z.enum(['up', 'down', 'north', 'south', 'east', 'west']).optional().describe("Direction to place against (default: 'down')")
    }, async ({ x, y, z, faceDirection = 'down' }) => {
        ({ x, y, z } = coerceCoordinates(x, y, z));
        const bot = getBot();
        const placePos = new Vec3(x, y, z).floored();
        ({ x, y, z } = placePos);
        const botPos = bot.entity.position.floored();
        if (placePos.equals(botPos) || placePos.equals(botPos.offset(0, 1, 0))) {
            return factory.createResponse(`You can't place a block where you're standing or one block above`);
        }
        const blockAtPos = bot.blockAt(placePos);
        if (blockAtPos && blockAtPos.name !== 'air') {
            return factory.createResponse(`There's already a block (${blockAtPos.name}) at (${x}, ${y}, ${z})`);
        }
        const possibleFaces = [
            { direction: 'down', vector: new Vec3(0, -1, 0) },
            { direction: 'north', vector: new Vec3(0, 0, -1) },
            { direction: 'south', vector: new Vec3(0, 0, 1) },
            { direction: 'east', vector: new Vec3(1, 0, 0) },
            { direction: 'west', vector: new Vec3(-1, 0, 0) },
            { direction: 'up', vector: new Vec3(0, 1, 0) }
        ];
        if (faceDirection !== 'down') {
            const specificFace = possibleFaces.find(face => face.direction === faceDirection);
            if (specificFace) {
                possibleFaces.unshift(possibleFaces.splice(possibleFaces.indexOf(specificFace), 1)[0]);
            }
        }
        for (const face of possibleFaces) {
            const referencePos = placePos.plus(face.vector);
            const referenceBlock = bot.blockAt(referencePos);
            if (referenceBlock && referenceBlock.name !== 'air') {
                if (!bot.canSeeBlock(referenceBlock)) {
                    const goal = new goals.GoalNear(referencePos.x, referencePos.y, referencePos.z, 2);
                    await bot.pathfinder.goto(goal);
                }
                await bot.lookAt(placePos, true);
                try {
                    await bot.placeBlock(referenceBlock, face.vector.scaled(-1));
                    return factory.createResponse(`Placed block at (${x}, ${y}, ${z}) using ${face.direction} face`);
                }
                catch (placeError) {
                    log('warn', `Failed to place using ${face.direction} face: ${placeError}`);
                    continue;
                }
            }
        }
        return factory.createResponse(`Failed to place block at (${x}, ${y}, ${z}): No suitable reference block found`);
    });
    factory.registerTool("dig-block", "Dig a block at the specified position", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
    }, async ({ x, y, z }) => {
        ({ x, y, z } = coerceCoordinates(x, y, z));
        const bot = getBot();
        const blockPos = new Vec3(x, y, z);
        const block = bot.blockAt(blockPos);
        if (!block || block.name === 'air') {
            return factory.createResponse(`No block found at position (${x}, ${y}, ${z})`);
        }
        if (!bot.canDigBlock(block) || !bot.canSeeBlock(block)) {
            const goal = new goals.GoalNear(x, y, z, 2);
            await bot.pathfinder.goto(goal);
        }
        await bot.dig(block);
        return factory.createResponse(`Dug ${block.name} at (${x}, ${y}, ${z})`);
    });
    factory.registerTool("get-block-info", "Get information about a block at the specified position", {
        x: z.coerce.number().describe("X coordinate"),
        y: z.coerce.number().describe("Y coordinate"),
        z: z.coerce.number().describe("Z coordinate"),
    }, async ({ x, y, z }) => {
        ({ x, y, z } = coerceCoordinates(x, y, z));
        const bot = getBot();
        const blockPos = new Vec3(x, y, z);
        const block = bot.blockAt(blockPos);
        if (!block) {
            return factory.createResponse(`No block information found at position (${x}, ${y}, ${z})`);
        }
        return factory.createResponse(`Found ${block.name} (type: ${block.type}) at position (${block.position.x}, ${block.position.y}, ${block.position.z})`);
    });
    factory.registerTool("dig-blocks", "Batch dig/harvest blocks of a specific type and collect dropped items", {
        blockType: z.string().describe("Type of block to dig"),
        radius: z.coerce.number().finite().optional().describe("Search radius (default: 16)"),
        maxCount: z.coerce.number().int().positive().optional().describe("Max blocks to dig (default: 64)"),
        onlyMature: z.coerce.boolean().optional().describe("Only harvest mature crops (default: true)")
    }, async ({ blockType, radius = 16, maxCount = 64, onlyMature = true }) => {
        const bot = getBot();
        if (!bot) return factory.createResponse("Bot not connected");
        const mcData = minecraftData(bot.version);
        const blockData = mcData.blocksByName[blockType];
        if (!blockData) return factory.createResponse(`Unknown block type: ${blockType}`);
        const positions = bot.findBlocks({
            point: bot.entity.position,
            matching: blockData.id,
            maxDistance: radius,
            count: Math.min(maxCount, MAX_FIND_BLOCKS_COUNT)
        });
        if (positions.length === 0) {
            return factory.createResponse(`No ${blockType} found within ${radius} blocks`);
        }
        const invBefore = bot.inventory.items().reduce((acc, i) => { acc[i.name] = (acc[i.name] || 0) + i.count; return acc; }, {});
        let dug = 0, skipped = 0, failed = 0;
        for (const pos of positions) {
            const block = bot.blockAt(pos);
            if (!block || block.name === 'air') { skipped++; continue; }
            if (onlyMature) {
                const maxGrowth = getCropMaxGrowth(block.name);
                if (maxGrowth !== null && block.metadata < maxGrowth) { skipped++; continue; }
            }
            await goNear(bot, pos, 2);
            if (!bot.canDigBlock(block)) { failed++; continue; }
            try {
                await bot.dig(block);
                dug++;
            }
            catch (err) {
                log('warn', `Failed to dig ${blockType} at (${pos.x}, ${pos.y}, ${pos.z}): ${err.message}`);
                failed++;
            }
        }
        const collected = await collectNearbyItems(bot, radius + 4);
        const invAfter = bot.inventory.items().reduce((acc, i) => { acc[i.name] = (acc[i.name] || 0) + i.count; return acc; }, {});
        const changes = [];
        for (const name of new Set([...Object.keys(invBefore), ...Object.keys(invAfter)])) {
            const diff = (invAfter[name] || 0) - (invBefore[name] || 0);
            if (diff > 0) changes.push(`+${diff} ${name}`);
        }
        let msg = `Dug ${dug} ${blockType}`;
        if (skipped > 0) msg += `, skipped ${skipped}`;
        if (failed > 0) msg += `, ${failed} failed`;
        msg += `\nFound ${positions.length} total, processed ${dug + skipped + failed}`;
        if (changes.length > 0) msg += `\nItems gained: ${changes.join(', ')}`;
        if (collected > 0) msg += `\nWalked near ${collected} dropped item(s) for pickup`;
        return factory.createResponse(msg);
    });

    factory.registerTool("find-blocks", "Find one or more nearby blocks of a specific type", {
        blockType: z.string().describe("Type of block to find"),
        maxDistance: z.coerce.number().finite().optional().describe("Maximum search distance (default: 16)"),
        count: z.coerce.number().int().positive().optional().describe("Maximum number of blocks to return (default: 1; values above 256 are clamped)")
    }, async ({ blockType, maxDistance = 16, count = 1 }) => {
        const bot = getBot();
        const mcData = minecraftData(bot.version);
        const blocksByName = mcData.blocksByName;
        const normalizedCount = Math.min(count, MAX_FIND_BLOCKS_COUNT);
        if (!blocksByName[blockType]) {
            return factory.createResponse(`Unknown block type: ${blockType}`);
        }
        const blockId = blocksByName[blockType].id;
        if (normalizedCount === 1) {
            const block = bot.findBlock({
                matching: blockId,
                maxDistance: maxDistance
            });
            if (!block) {
                return factory.createResponse(`No ${blockType} found within ${maxDistance} blocks`);
            }
            return factory.createResponse(`Found ${blockType} at position (${block.position.x}, ${block.position.y}, ${block.position.z})`);
        }
        const blocks = bot.findBlocks({
            point: bot.entity.position,
            matching: blockId,
            maxDistance: maxDistance,
            count: normalizedCount
        });
        if (blocks.length === 0) {
            return factory.createResponse(`No ${blockType} found within ${maxDistance} blocks`);
        }
        const blocksList = blocks
            .map((block, i) => `${i + 1}. (${block.x}, ${block.y}, ${block.z})`)
            .join('\n');
        return factory.createResponse(`Found ${blocks.length} ${blockType} block(s) within ${maxDistance} blocks:\n${blocksList}`);
    });
}
