# AGENTS.md — minecraft-mcp-server (local fork)

## Runtime source of truth is `dist/`, NOT `src/`

Custom tools live in `dist/tools/*.js` (ESM, hand-edited JS). The TS source in `src/tools/*.ts` is the original upstream — do NOT edit it. Running `npm run build` (`tsc -p tsconfig.build.json`) would **overwrite** `dist/` with compiled TS, erasing custom additions. Only build when syncing upstream changes.

## Commands

| Command | What |
|---|---|
| `npm run lint` | ESLint on `src/` and `tests/` |
| `npx tsc --noEmit` | TypeScript check (uses root tsconfig, checks `src/` only) |
| `npm run build` | `tsc -p tsconfig.build.json` → compiles `src/` → `dist/` |
| `npm test` | `ava` — runs all tests in `tests/` |
| `npm run dev` | `tsx src/main.ts` — runs TS directly (for upstream dev, not fork) |

Standard check order: `npm run lint && npx tsc --noEmit && npm run build && npm test`

## MCP server is managed by opencode

Config in `~/.config/opencode/opencode.jsonc`. Server runs via stdio through opencode, not standalone.

Bot does NOT auto-connect on startup. Use `join-server` tool (host/port/username) to connect. Default CLI args provide defaults for that tool but are not used at boot.

## Node.js

Uses `~/.n/bin/node` (v22), not system node. Configured in opencode.jsonc's command path.

## Bot connection

- Minecraft server is **Fabric 1.21.11** with Fabric API — kicks non-Fabric clients.
- Bypass via `bypass-fabric-check-1.0.7.jar` on server.
- Bot connects via mineflayer; `dist/bot-connection.js` has `brand: 'fabric'` to match.
- Server hosted at `localhost:25565`.

## Architecture

```
src/main.ts          → entrypoint, registers all tool modules
src/tool-factory.ts  → wraps MCP server, handles validation & reconnection
src/bot-connection.ts→ mineflayer bot lifecycle & reconnect logic
src/config.ts        → CLI args (host/port/username)

src/tools/*.ts       → tool definitions (upstream originals)
dist/tools/*.js      → ACTUAL runtime tools (fork additions live here)
```

## Custom tools added to `dist/tools/inventory-tools.js`

These DO NOT exist in `src/tools/inventory-tools.ts` — only in the dist copy:

- `open-chest` (overridden) — opens chest, shows container + bot inventory + nearby signs
- `goto-chest` — pathfind to chest + open in one step
- `chest-contents` — list open chest contents
- `withdraw-from-chest`, `deposit-to-chest` — single item transfer
- `withdraw-items`, `deposit-items` — batch multi-item transfer
- `close-chest`
- `label-chest`, `open-labeled-chest`, `list-chests` — chest naming registry (in-memory, lost on restart)
- `smartMatch()` helper — exact match first, `includes()` fallback (avoids `oxidized_copper_bulb` matching `waxed_*`)
- `readNearbySigns()` helper — reads sign text adjacent to chest on open

## Git workflow

- Never merge upstream — local fork only
- Commit each logical change independently, commit messages match upstream style (`type: description`)
- Working tree must stay clean after each commit
- `.gitignore` excludes `node_modules/` and `.n/` only

## Testing quirks

- Tests use `ava` framework, need a real Minecraft server to pass (integration tests)
- Tests likely fail without a running server — skip test step when not connected
- `tests/inventory-tools.test.ts` exists but covers the ORIGINAL tools (no chest tools) — don't expect it to pass with our custom dist
