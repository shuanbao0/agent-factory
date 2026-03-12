# Twitter MCP Fix Guide

## Current Issue
Both `post_tweet` and `search_tweets` return "Twitter API error: An unexpected error occurred".

## Root Cause Analysis

The Twitter MCP (`@enescinar/twitter-mcp`) is configured with OAuth 1.0a credentials in `~/.claude.json`. The issue is likely one of:

### 1. X Developer Portal — User Authentication Settings (Most Likely)
The app's **User Authentication Settings** may not be properly saved:

1. Go to https://developer.x.com/en/portal/projects-and-apps
2. Click on your App → **Settings** tab
3. Scroll to **User authentication settings** → Click **Set up**
4. Set:
   - **App permissions**: **Read and Write** (NOT Read only)
   - **Type of App**: Web App, Automated App or Bot
   - **Callback URL**: `http://localhost:3000/callback` (any valid URL)
   - **Website URL**: `https://github.com/shuanbao0/agent-factory`
5. Click **Save**
6. **IMPORTANT**: After saving, you may need to **regenerate** your Access Token and Secret (the old ones may not have write permissions)

### 2. Regenerate Access Token with Write Permissions
After setting up User Authentication:
1. Go to **Keys and tokens** tab
2. Regenerate **Access Token and Secret**
3. Make sure it shows **"Created with Read and Write permissions"**
4. Update `~/.claude.json` with the new tokens:
```json
{
  "mcpServers": {
    "twitter-mcp": {
      "command": "npx",
      "args": ["-y", "@enescinar/twitter-mcp"],
      "env": {
        "API_KEY": "your-new-api-key",
        "API_SECRET_KEY": "your-new-api-secret",
        "ACCESS_TOKEN": "your-new-access-token",
        "ACCESS_TOKEN_SECRET": "your-new-access-token-secret"
      }
    }
  }
}
```

### 3. Free Tier Limitations
X API Free tier supports:
- ✅ POST /2/tweets (post tweet) — up to 1,500/month
- ✅ DELETE /2/tweets/:id (delete tweet)
- ✅ GET /2/users/me (get user info)
- ❌ Search tweets (requires Basic tier $200/mo)
- ❌ Read tweets / timeline
- ❌ Media upload (needs separate endpoint)

So `search_tweets` will ALWAYS fail on Free tier. Only `post_tweet` should work.

## Verification Steps

After fixing credentials:
1. Restart Claude Code (to reload MCP servers)
2. Try posting a test tweet
3. If it works, delete the test tweet from the X web interface

## Alternative: Use a Different Twitter MCP
If `@enescinar/twitter-mcp` continues to have issues, consider:
- `@modelcontextprotocol/server-twitter` (official MCP community)
- Direct API call via curl (for one-off tweets)

## Prepared First Tweet
Once fixed, post this:

```
🚀 Agent Factory v0.4.31 — Run a 64-agent AI company from your terminal.

Self-contained, open-source, no cloud needed.
64 pre-built role templates. Dashboard UI. Autopilot mode.

⭐ https://github.com/shuanbao0/agent-factory

#OpenSource #AI #Agents #TypeScript
```

## Follow-up Thread (post as replies)
See `docs/promotional-copy.md` — Twitter Thread section (Tweets 2-8).
