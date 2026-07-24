#!/bin/bash
PID=$(pgrep -f "minecraft-mcp-server/dist/main.js")
if [ -z "$PID" ]; then
    echo "MCP server is not running"
    exit 1
fi
kill "$PID"
echo "MCP server stopped (PID: $PID)"
