---
title: "I Built an AI Company with 64 Autonomous Agents — Here's How"
published: false
description: "Agent Factory is an open-source platform that turns one person into a fully staffed AI organization with 64 pre-built agent templates."
tags: opensource, ai, agents, typescript
cover_image: https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/pixel-office.png
---

## One Person. Sixty-Four Agents. Zero Employees.

What if you could run an entire company — engineers, designers, marketers, legal, finance, even a quant trading desk — without hiring a single person?

That question consumed me for months. Not as a thought experiment, but as an engineering challenge. The result is **Agent Factory**: an open-source platform that gives one person the operational capacity of a fully staffed organization through autonomous AI agents.

I want to walk you through how it works, why I built it, and how you can spin up your own AI company in under five minutes.

**GitHub:** [github.com/shuanbao0/agent-factory](https://github.com/shuanbao0/agent-factory)

---

## The Problem: Multi-Agent Coordination Is a Mess

The AI agent space is exploding. Everyone is building single-purpose agents — a coding assistant here, a writing tool there. But running multiple agents together? That's where things fall apart.

Here's what I kept running into:

- **No organizational structure.** Most frameworks treat agents as flat peers. Real work has hierarchy — a CEO sets direction, a PM breaks it down, engineers execute, QA validates.
- **No communication protocol.** Agents can't talk to each other in a controlled way. You end up manually copy-pasting outputs between them.
- **Cloud lock-in.** Almost every multi-agent platform requires an external orchestration service, API gateway, or cloud deployment.
- **No persistent context.** Agents forget everything between sessions. No memory, no skill accumulation, no workspace continuity.

I wanted something fundamentally different: a **self-contained system** that runs locally, models a real organization, and lets agents collaborate autonomously.

---

## The Solution: Agent Factory

Agent Factory is a local-first, self-contained multi-agent collaboration platform. You run one command and get an entire AI company with a Dashboard UI, task management, inter-agent messaging, and autopilot mode.

```bash
npx agent-factory start
# Open http://localhost:3100
```

That's it. No cloud account. No Docker. No external services. Just Node.js and an API key.

### Architecture at a Glance

```
┌─────────────────────────────────────────────┐
│              Dashboard UI (:3100)            │
│   ┌─────────┬──────────┬──────────────────┐  │
│   │ Agents  │  Tasks   │  Pixel Office    │  │
│   │  Panel  │  Board   │  Visualization   │  │
│   ├─────────┴──────────┴──────────────────┤  │
│   │  Messages  │  Logs  │  Settings       │  │
│   └───────────────────────────────────────┘  │
├──────────────────┬──────────────────────────┤
│   Next.js API    │    Zustand Store         │
│   Routes (/api)  │    (Real-time State)     │
├──────────────────┴──────────────────────────┤
│          OpenClaw Gateway (:19100)           │
│   ┌────────┬────────┬────────┬────────┐     │
│   │ Agent  │ Agent  │ Agent  │  ...   │     │
│   │  CEO   │  PM    │  Eng   │  (64)  │     │
│   └────────┴────────┴────────┴────────┘     │
│   WebSocket │ Skills │ Memory │ Tools       │
├─────────────────────────────────────────────┤
│         LLM Providers (15+ supported)       │
│   Anthropic │ OpenAI │ DeepSeek │ MiniMax   │
└─────────────────────────────────────────────┘
```

The UI layer (Next.js 14) communicates with the OpenClaw gateway engine through API routes. The gateway manages all agent processes, handles WebSocket-based chat, and routes inter-agent messages. Each agent has its own identity, memory, skills, and isolated workspace.

---

## Key Features

### Real-Time Dashboard

![Dashboard](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/dashboard.png)

The dashboard gives you a bird's-eye view of your AI company: active agents, running tasks, system health, and resource usage. Everything updates in real time through a polling-based data provider.

### Pixel Art Office

![Pixel Office](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/pixel-office.png)

Every agent has a desk in the Pixel Office — a retro-style spatial visualization showing who's working, who's idle, and what department they belong to. It's not just aesthetics; it's a mental model for your AI organization.

### Autopilot Mode

![Autopilot](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/autopilot-mission.png)

This is where things get interesting. Give the CEO agent a high-level mission — say, "build a landing page for product X" — and watch the system decompose it into tasks, assign them to the right agents, and execute in parallel. The PM writes the PRD, the designer creates mockups, frontend and backend engineers write code, QA reviews, and marketing drafts the copy. All automatically.

### N x N Agent Communication

Agents don't just execute in isolation. They have a permission-controlled communication matrix — any agent can message any other agent (within permission boundaries). The CEO briefs the PM, the PM coordinates with engineers, engineers flag blockers to QA. It mirrors how real teams work.

### Task Board

![Task Board](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/task-board.png)

A Kanban-style task board with priority management. Tasks flow through statuses as agents pick them up and complete them. You can watch the workflow unfold, or jump in and redirect at any point.

---

## The 64 Agent Templates

Agent Factory ships with 64 pre-built role templates organized across five departments:

**Development** — CEO, CTO, Product Manager, Frontend Engineer, Backend Engineer, Full-Stack Engineer, DevOps, DBA, Security Engineer, QA/Tester, Technical Writer, and more.

**Business** — Sales, Marketing, Legal Counsel, Finance, HR, Business Analyst, Customer Success.

**Content** — Copywriter, SEO Specialist, Social Media Manager, Newsletter Editor, Podcast Producer.

**Creative** — Novel Writer, Anime Director, Game Designer, Music Composer, Video Producer.

**Quant** — Quant Researcher, Strategy Developer, Risk Manager, Execution Engineer, Data Analyst.

Each template defines the agent's model, skills, peer connections, and behavioral identity. You can use them as-is or customize them. You can also create entirely new agents from scratch.

Some of my favorites:

- The **Novel Writer** agent that maintains plot continuity across chapters using persistent memory
- The **Quant Researcher** that produces structured investment memos
- The **DevOps** agent that can actually manage tmux sessions and run deployment scripts
- The **CEO** agent that decomposes vague goals ("grow revenue 20%") into concrete, assignable tasks

---

## Demo: The Autopilot Flow

Here's what a typical autopilot session looks like:

1. **You set a mission:** "Create a technical blog post about our new API, with code examples and SEO optimization."

2. **CEO decomposes:** The CEO agent breaks this into subtasks — research the API, draft the post, write code examples, optimize for SEO, create social media snippets.

3. **Assignment:** Tasks get assigned based on role fit. The Technical Writer gets the draft, the Backend Engineer writes code examples, the SEO Specialist handles optimization, the Social Media Manager creates promotional snippets.

4. **Parallel execution:** Agents work simultaneously. They communicate when needed — the writer asks the engineer for API details, the SEO specialist suggests title changes.

5. **Artifacts delivered:** Each agent writes its output to its isolated workspace (`workspaces/{agent-id}/`). You get a complete blog post, tested code snippets, an SEO checklist, and three tweet drafts.

All of this happens without manual intervention. You can watch it unfold in real time through the Dashboard, or check the results after the fact.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | Next.js 14 (App Router) + React 18 |
| State Management | Zustand 4.5 |
| Styling | Tailwind CSS 3.4 (dark theme) |
| Language | TypeScript 5.3 (strict mode) |
| Icons | lucide-react |
| Charts | Recharts |
| Gateway Engine | OpenClaw (built-in) |
| Runtime | Node.js >= 22 |

The architecture is deliberately simple. No microservices, no Kubernetes, no message queues. The Next.js app handles the UI and API routes. The OpenClaw gateway manages agent processes and inter-agent communication via WebSocket. State lives in Zustand on the client and JSON files on disk.

This simplicity is intentional — Agent Factory should be something you can clone, understand, and modify in an afternoon.

---

## Getting Started

### Quick Start (npx)

```bash
npx agent-factory start
```

### Full Install

```bash
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install && cd ui && npm install && cd ..
npm start
# Open http://localhost:3100
```

### Configuration

Add your API key to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
# Or any of 15+ supported providers:
# OPENAI_API_KEY, DEEPSEEK_API_KEY, etc.
```

The Dashboard Settings page also lets you configure providers through the UI — no file editing required.

### CLI Commands

```bash
agent-factory start     # Launch Dashboard + Gateway
agent-factory stop      # Stop all services
agent-factory status    # Check running state
agent-factory update    # Auto-upgrade to latest version
agent-factory doctor    # Diagnose environment issues
```

---

## What's Next

The roadmap includes several areas I'm actively working on:

- **Agent-to-agent file sharing** — Let agents pass artifacts directly to each other, not just through the shared workspace.
- **Workflow templates** — Pre-built multi-step workflows (e.g., "Ship a feature" = PM spec + design + code + test + deploy).
- **Cost tracking dashboard** — Real-time token usage and cost breakdown per agent and per task.
- **Plugin ecosystem** — Community-contributed agent skills via ClawHub marketplace.
- **Team collaboration** — Multi-user access to the same Agent Factory instance.
- **Mobile companion app** — Monitor your AI company from your phone.

---

## Try It Out

Agent Factory is fully open-source under GPL-3.0. Whether you're a solo developer who wants a full engineering team, a content creator building a media operation, or just curious about multi-agent systems — give it a spin.

**GitHub:** [github.com/shuanbao0/agent-factory](https://github.com/shuanbao0/agent-factory)

Here's how you can get involved:

- **Star the repo** if you find the concept interesting
- **Try it out** and open issues for bugs or feature requests
- **Contribute** — the codebase is TypeScript top to bottom, and the architecture is designed to be approachable
- **Share your use cases** — I'd love to hear what you build with 64 agents at your disposal

The future of work isn't about replacing humans with AI. It's about giving individuals the leverage to operate at the scale of an organization. Agent Factory is my attempt at building that lever.

Let's build together.
