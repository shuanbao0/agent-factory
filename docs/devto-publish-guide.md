# Dev.to Publishing Guide

## Step 1: Get Your Dev.to API Key

1. Go to https://dev.to/settings/extensions
2. Scroll to "DEV Community API Keys"
3. Enter a description (e.g., "Agent Factory blog") and click "Generate API Key"
4. Copy the key

## Step 2: Publish the Article

The blog post is ready at `docs/devto-blog.md`. To publish as a draft:

```bash
# Set your API key
export DEVTO_API_KEY="your-api-key-here"

# Read the markdown file and publish as draft
cd /Users/yuanwu/workspace/agent-factory-workspace/agent-factory

# Extract the body (everything after the second ---)
BODY=$(awk '/^---$/{n++} n>=2{if(n==2 && /^---$/){n++; next} print}' docs/devto-blog.md)

# Publish as draft
curl -X POST https://dev.to/api/articles \
  -H "Content-Type: application/json" \
  -H "api-key: $DEVTO_API_KEY" \
  -d "$(python3 -c "
import json, sys
body = open('docs/devto-blog.md').read()
# Split frontmatter
parts = body.split('---', 2)
# Everything after second ---
content = parts[2].strip() if len(parts) >= 3 else body
article = {
    'article': {
        'title': 'I Built an AI Company with 64 Autonomous Agents — Here\'s How',
        'body_markdown': content,
        'published': False,
        'tags': ['opensource', 'ai', 'agents', 'typescript'],
        'canonical_url': None,
        'series': None
    }
}
print(json.dumps(article))
")"
```

## Step 3: Review and Publish

1. Go to https://dev.to/dashboard
2. Find the draft article
3. Add the cover image (upload `docs/img/pixel-office.png`)
4. Review formatting, fix any rendering issues
5. Click "Publish"

## Step 4: Also Publish the Comparison Article

Repeat the same process for `docs/comparison-article.md` with:
- Title: "Agent Factory vs CrewAI vs AutoGen vs MetaGPT — Multi-Agent Frameworks Compared"
- Tags: opensource, ai, agents, comparison

## Notes

- Dev.to rate limits: don't submit too many articles at once
- Tags must be lowercase, no special characters, max 4 tags
- Images can use GitHub raw URLs (already set up in the articles)
- Dev.to supports standard markdown + some custom liquid tags
