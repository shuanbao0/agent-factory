# Product Hunt Submission Materials

---

## Tagline

`Run a 64-agent AI company from your terminal`

(56 characters)

---

## Short Description

Agent Factory is an open-source, self-contained platform that lets one person run an entire AI-powered company. 64 pre-built agent templates -- CEO, engineers, designers, testers, marketers, legal, finance, quant -- collaborate autonomously to deliver real artifacts. No cloud, no external orchestration. Just `npx agent-factory start`.

---

## Detailed Description

**Agent Factory** gives you the operational capacity of a full company through 64 specialized AI agents that autonomously collaborate.

### How it works

1. Start the platform locally with one command
2. Create agents from 64 pre-built templates across 5 departments
3. Give the CEO a high-level goal
4. Watch agents decompose tasks, assign work, and execute in parallel
5. Collect real deliverables: PRDs, code, designs, reports

### What makes it different

- **Self-contained**: Built-in OpenClaw engine. No cloud services, no external orchestration layer. Everything runs on your machine.
- **64 role templates**: Not generic "assistants" -- a complete organizational structure with CEO, PM, frontend/backend engineers, DevOps, DBA, security, QA, designers, copywriters, SEO specialists, social media managers, legal counsel, accountants, quant researchers, and more.
- **Autopilot mode**: The CEO agent decomposes high-level goals into concrete tasks, assigns them to the right specialists, and drives execution to completion.
- **Pixel-art office**: A retro-style visualization where every agent has a desk. See who's working, who's idle, which departments are active -- a spatial mental model of your AI org.
- **Multi-provider**: Works with 15+ LLM providers including Anthropic, OpenAI, DeepSeek, and MiniMax.
- **Agent communication matrix**: N x N permission-controlled messaging between agents. Fine-grained control over who can talk to whom.
- **Persistent memory & skills**: Each agent maintains its own memory and can be extended with skills from the ClawHub marketplace.

### Tech stack

Next.js 14, TypeScript (strict), Tailwind CSS (dark theme), Zustand, OpenClaw gateway engine. Requires Node.js 22+ on macOS or Linux.

---

## First Comment (Maker's Story)

Hi Product Hunt! I'm the maker of Agent Factory.

The idea started from a simple frustration: as a solo developer, I constantly wished I had a team -- someone to write the PRD while I code, someone to handle marketing while I fix bugs, someone to review my architecture decisions.

So I built one. An entire AI company that runs from my terminal.

Agent Factory started as a weekend experiment with 5 agents. It quickly grew to 14, then 30, and now 64 templates covering every role I could think of -- from CEO and engineers to legal counsel and quant traders.

The "aha moment" was when I added Autopilot mode. I gave the CEO agent a goal ("build a landing page for product X"), walked away to make coffee, and came back to find a PRD from the PM, a component structure from the frontend engineer, copy from the content writer, and a QA checklist from the tester. All coordinated automatically.

A few things I'm proud of:
- It's completely self-contained. No cloud dependencies, no external orchestration service. Your data stays on your machine.
- The pixel-art office UI. It's not just eye candy -- it gives you a spatial understanding of your AI organization.
- The N x N communication matrix. Agents don't just broadcast -- they have structured, permission-controlled conversations.

I'd love to hear:
- What agent roles would you add?
- What's the first thing you'd try with a 64-agent company?
- What features are missing?

GitHub: https://github.com/shuanbao0/agent-factory

---

## Topics / Categories

- Artificial Intelligence
- Open Source
- Developer Tools
- Productivity
- Tech

---

## Suggested Launch Timing

**Day**: Tuesday or Wednesday (highest traffic, avoids Monday/Friday dips)

**Time**: 12:01 AM PST (Product Hunt resets at midnight PST; launching at reset maximizes the full 24-hour window for upvotes)

**Avoid**: Weekends, holidays, days when major product launches are scheduled

---

## Screenshot List

All images are in `docs/img/`. Suggested order for the Product Hunt gallery:

| # | File | Caption |
|---|------|---------|
| 1 | `dashboard.png` | Dashboard: Real-time overview of your AI company |
| 2 | `pixel-office.png` | Pixel Office: See every agent at their desk |
| 3 | `autopilot-mission.png` | Autopilot: Give the CEO a mission, watch it execute |
| 4 | `autopilot-overview.png` | Autopilot: Department-level task orchestration |
| 5 | `task-board.png` | Task Board: Kanban-style task management |
| 6 | `message-center.png` | Message Center: Inter-agent communication |
| 7 | `agents-list.png` | Agents: 64 role templates across 5 departments |
| 8 | `agent-comm-matrix.png` | Communication Matrix: N x N permission controls |
| 9 | `skill-store.png` | Skill Store: Extend agent capabilities |
| 10 | `workspaces.png` | Workspaces: Real artifacts produced by agents |
| 11 | `logs-monitor.png` | Logs: Real-time monitoring and debugging |
| 12 | `project-progress.png` | Projects: Track progress across departments |

**Demo video**: `demo.mov` (67 seconds) -- use as the featured media / hero video.
**Animated preview**: `demo.gif` -- use as thumbnail or inline preview.
