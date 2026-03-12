# Agent Factory - Promotional Copy

## 1. Hacker News (Show HN)

**Title:** `Show HN: Agent Factory – Run a 64-agent AI company from your terminal`

**Post:**

I built Agent Factory, an open-source platform that lets one person run an entire AI-powered company. It comes with 64 pre-built agent templates — CEO, PM, engineers, designers, testers, marketing, legal, finance, even a quant trading team — that autonomously collaborate to deliver real artifacts.

The key difference from other multi-agent frameworks: it's fully self-contained. No external orchestration service, no cloud dependency. You run `npx agent-factory start` and get a local Dashboard UI with a pixel-art office, task board, message center, and autopilot mode. The CEO agent decomposes high-level goals into tasks, assigns them to the right agents, and drives execution — you just watch (or intervene when needed).

Under the hood it uses OpenClaw as the gateway engine, supports 15+ LLM providers (Anthropic, OpenAI, DeepSeek, MiniMax, etc.), and has an N×N agent communication matrix with permission controls. Agents have persistent memory, skills, and isolated workspaces.

Tech stack: Next.js 14 + TypeScript + Tailwind (dark theme). Runs on macOS/Linux with Node.js 22+.

GitHub: https://github.com/shuanbao0/agent-factory

Would love feedback on the architecture and use cases you'd find interesting.

---

## 2. Twitter/X Thread

**Tweet 1 (Hook):**
I built an AI company with 64 employees. Zero humans.

Agent Factory is an open-source platform that turns one person into a fully staffed organization — PM, engineers, designers, testers, marketing, legal, finance, and more.

All running locally from your terminal. 🧵👇

**Tweet 2 (Dashboard):**
The Dashboard gives you a real-time overview of your AI company — active agents, running tasks, system health, and resource usage.

One glance to see everything happening across your organization.

[Screenshot: dashboard.png]

**Tweet 3 (Pixel Office):**
Every agent has a seat in the Pixel Office — a retro-style visualization showing who's working, who's idle, and what department they belong to.

It's not just eye candy — it's a spatial mental model of your AI org.

[Screenshot: pixel-office.png]

**Tweet 4 (Autopilot):**
Autopilot Mode: Give the CEO a mission → it auto-decomposes into tasks → assigns to the right agents → they execute in parallel → deliver real artifacts (PRDs, code, designs, reports).

No manual coordination needed.

[Screenshot: autopilot-mission.png]

**Tweet 5 (Task Board + Messages):**
Agents communicate through an N×N permission-controlled message system. Tasks flow through a Kanban board with priority management.

You can watch the entire workflow unfold, or jump in and redirect.

[Screenshot: task-board.png]

**Tweet 6 (64 Templates):**
64 pre-built role templates across 5 departments:
• Dev: Frontend, Backend, DevOps, DBA, Security...
• Business: Sales, Marketing, Legal, Finance...
• Content: Copywriter, SEO, Social Media...
• Creative: Novel Writer, Anime Director...
• Quant: Researcher, Strategy, Risk, Execution...

**Tweet 7 (Tech + Install):**
Fully self-contained. No cloud. No external orchestration.

```
npx agent-factory start
```

Supports 15+ LLM providers. Built with Next.js + TypeScript + Tailwind.

GitHub: https://github.com/shuanbao0/agent-factory

Star ⭐ if you think AI companies are the future.

**Tweet 8 (CTA):**
This is day 7 of being open-source.

What I'd love to hear from you:
- What agents would you add?
- What use cases would you try first?
- What's missing?

Drop a reply or open a Discussion on GitHub. Let's build together.

---

## 3. 中文社区（V2EX / 掘金 / 知乎）

**标题:** 我用 AI 搭了一家公司：64 个 AI 员工自动协作，开源 7 天复盘

**正文:**

### 这是什么？

Agent Factory 是一个开源的多 Agent 协作平台。简单说：**一个人 + Agent Factory = 一家完整的 AI 公司**。

它内置了 64 个角色模板 —— CEO、产品经理、前后端工程师、设计师、测试、市场、销售、法务、财务，甚至还有量化交易团队 —— 这些 AI Agent 可以自主协作、分解任务、并行执行，产出真实的工作成果。

### 核心功能

- **Autopilot 模式**：给 CEO 一句话目标，自动分解任务→分配角色→并行执行→产出交付物（PRD、代码、设计稿、分析报告）
- **64 个预置角色模板**：覆盖开发、商务、内容、创意、量化五大部门
- **像素办公室 UI**：复古像素风可视化，直观看到每个 Agent 的工作状态
- **Dashboard 面板**：实时监控任务、消息、日志、资源使用
- **自包含架构**：内置 OpenClaw 引擎，无需外部服务，`npx agent-factory start` 一键启动
- **多模型支持**：Anthropic、OpenAI、DeepSeek、MiniMax 等 15+ 供应商
- **Agent 通信矩阵**：N×N 权限控制的跨 Agent 消息系统
- **技能商店**：通过 ClawHub 市场扩展 Agent 能力

### 安装

```bash
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install && cd ui && npm install && cd ..
npm start
# 浏览器打开 http://localhost:3100
```

也可以直接用 npx：
```bash
npx agent-factory start
```

### 截图

[此处插入 dashboard、pixel-office、task-board、autopilot-mission、message-center 截图]

### 使用场景

1. **独立开发者**：一个人拥有一整个开发团队，从需求分析到代码交付
2. **内容创作者**：小说连载、公众号运营、社媒矩阵自动化
3. **创业团队**：低成本验证商业想法，快速产出 MVP
4. **量化投研**：研究员 + 策略师 + 风控 + 执行，全自动化

### 技术栈

Next.js 14 + TypeScript + Tailwind（暗色主题）+ Zustand + OpenClaw 引擎

### 项目状态

开源 7 天，刚完成 README 重写和截图更新。欢迎试用、提 Issue、贡献代码。

GitHub: https://github.com/shuanbao0/agent-factory

如果觉得有意思，点个 Star ⭐ 支持一下！

---

## 4. Reddit

### r/LocalLLaMA & r/artificial

**Title:** `Agent Factory: Open-source platform to run a 64-agent AI company locally — self-contained, no cloud needed`

**Post:**

I've been working on Agent Factory, an open-source multi-agent collaboration platform. The idea: give one person the operational capacity of an entire company through autonomous AI agents.

**What makes it different:**

- **Self-contained**: Built-in OpenClaw engine. No external orchestration service. Run everything locally with `npx agent-factory start`.
- **64 agent templates**: Not just "assistant" roles — full organizational structure with CEO, PM, engineers (frontend, backend, DevOps, DBA), designers, testers, marketing, sales, legal, finance, content writers, and even a quant trading team.
- **Real collaboration**: Agents have an N×N communication matrix with permission controls. The CEO decomposes goals, assigns tasks, and agents execute in parallel — producing real artifacts (PRDs, code, designs, reports).
- **Dashboard UI**: Real-time monitoring with a pixel-art office visualization, task board, message center, and log viewer.
- **Multi-provider**: Works with Anthropic, OpenAI, DeepSeek, MiniMax, and 15+ other LLM providers.

**Tech stack:** Next.js 14, TypeScript, Tailwind (dark theme), Zustand, OpenClaw gateway engine. Runs on macOS/Linux with Node.js 22+.

**Install:**
```
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory && npm install && cd ui && npm install && cd .. && npm start
```

GitHub: https://github.com/shuanbao0/agent-factory

Open to feedback on the architecture. What agent roles or features would you want to see?

### r/SideProject

**Title:** `I built an AI company simulator with 64 autonomous agents — open source`

**Post:**

Side project that got a bit out of hand: Agent Factory lets you run a simulated company where 64 AI agents (CEO, engineers, designers, marketers, etc.) autonomously collaborate on tasks.

Give the CEO a goal like "build a landing page for product X" and watch it decompose the task, brief the designer, assign frontend/backend work, have QA review, and marketing write the copy — all automatically.

Built with Next.js + TypeScript. Self-contained (no cloud dependencies). Supports 15+ LLM providers.

The pixel-art office UI is my favorite part — each agent has a desk and you can see who's working in real-time.

7 days since open-sourcing. Would love early feedback.

GitHub: https://github.com/shuanbao0/agent-factory

---

## 5. Awesome Lists to Submit To

- `awesome-ai-agents` — https://github.com/e2b-dev/awesome-ai-agents
- `awesome-llm` — https://github.com/Hannibal046/Awesome-LLM
- `awesome-multi-agent` — search for relevant repos
- `awesome-nextjs` — https://github.com/unicodeveloper/awesome-nextjs

**PR Description Template:**
```
Add Agent Factory — self-contained multi-agent collaboration platform with 64 built-in role templates, Dashboard UI, and autopilot mode.
```

---

## Posting Schedule

| Platform | Best Time | Notes |
|----------|-----------|-------|
| Hacker News | Tue-Thu 8-10am PST | Show HN format |
| Twitter/X | Weekday morning PST | Thread, 1 tweet/hour |
| V2EX | Weekday afternoon CST | 分享创造 节点 |
| 掘金 | Weekday morning CST | 开源 tag |
| 知乎 | Anytime | 文章 format |
| Reddit | Tue-Thu morning PST | Check subreddit rules first |
