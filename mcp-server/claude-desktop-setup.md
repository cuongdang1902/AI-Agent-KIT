# Connecting AI Agent Business Kit to Claude Desktop

Follow these 3 steps. Takes less than 5 minutes.

---

## What You Need

- Your license key (format: `AIKIT-XXXXX-XXXXX`) — sent to your email after purchase
- Claude Desktop installed on your computer ([download here](https://claude.ai/download))

---

## Step 1 — Open Claude Desktop Settings

1. Open Claude Desktop
2. Click the **Claude** menu in the top menu bar (Mac) or the gear icon (Windows)
3. Select **Settings**
4. Click the **Developer** tab
5. Click **Edit Config** — this opens a file called `claude_desktop_config.json` in a text editor

---

## Step 2 — Add the MCP Server

Inside `claude_desktop_config.json`, add the `mcpServers` section below.

If the file is empty or just has `{}`, replace everything with:

```json
{
  "mcpServers": {
    "aikit": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://aikit-mcp.YOUR-SUBDOMAIN.workers.dev/mcp"],
      "env": {
        "X-License-Key": "AIKIT-XXXXX-XXXXX"
      }
    }
  }
}
```

If the file already has other servers, add just the `"aikit"` block inside the existing `"mcpServers"` object.

**Replace these two values:**

| Placeholder | Replace with |
|-------------|--------------|
| `aikit-mcp.YOUR-SUBDOMAIN.workers.dev` | The MCP server URL (provided in your welcome email) |
| `AIKIT-XXXXX-XXXXX` | Your personal license key |

**Save the file** (Ctrl+S or Cmd+S).

---

## Step 3 — Restart Claude Desktop

1. Quit Claude Desktop completely (don't just close the window)
2. Re-open Claude Desktop
3. Start a new conversation
4. Type: **"What can you help me with using the AI Agent Business Kit?"**

You should see Claude list the 5 agents and 18 commands available to you.

---

## It's Working When...

Claude responds with information about the kit's agents and commands without you explaining anything. The kit is fully loaded and ready to use.

---

## Troubleshooting

**"I don't see any kit features"**
Make sure you saved the config file and fully restarted Claude Desktop (quit from the menu, not just close).

**"Unauthorized" or "License key not found"**
Double-check that you copied your license key exactly as received, including the `AIKIT-` prefix and both groups of 5 characters.

**"Cannot connect to server"**
Check that the server URL in your config matches the URL provided in your welcome email exactly.

**Still stuck?**
Contact support with your order ID and we'll sort it out within 24 hours.

---

## For Claude Code Users

If you use Claude Code (the terminal version), add this to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "aikit": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://aikit-mcp.YOUR-SUBDOMAIN.workers.dev/mcp"],
      "env": {
        "X-License-Key": "AIKIT-XXXXX-XXXXX"
      }
    }
  }
}
```

Then restart Claude Code and run `/mcp` to verify the connection.
