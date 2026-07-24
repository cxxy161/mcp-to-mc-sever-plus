#!/bin/bash
MCP_DIR="/home/cxxy168/code/mcp/minecraft-mcp-server"
NODE="/home/cxxy168/.n/bin/node"

if pgrep -f "minecraft-mcp-server/dist/main.js" > /dev/null; then
    echo "MCP server is already running"
    exit 1
fi

cd "$MCP_DIR"
export PATH="/home/cxxy168/.n/bin:$PATH"
nohup "$NODE" dist/main.js \
    --host localhost \
    --port 25565 \
    --username ClaudeBot \
    > /tmp/mcp-server.log 2>&1 &
echo "MCP server started (PID: $!)"
