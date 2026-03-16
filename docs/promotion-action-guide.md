# 推广执行指南（直接复制粘贴版）

所有文案已经准备好，按顺序操作即可。截图统一用 `docs/img/` 下的图片。

---

## 第一步：Hacker News（预计 3 分钟）

> HN 是英文开发者社区流量最大的入口，Show HN 帖子如果上首页可以带来 100-500 star。
> **最佳发帖时间：美西时间 周二-周四 上午 9-11 点 = 北京时间凌晨 1-3 点**

### 操作步骤

1. 打开 https://news.ycombinator.com/submit
2. 登录（没有账号就注册一个）
3. 填写：

**Title:**
```
Show HN: Agent Factory – Run a 64-agent AI company from your terminal
```

**URL:**
```
https://github.com/shuanbao0/agent-factory
```

**Text（留空！）:** HN 规则：填了 URL 就不要填 Text，否则 URL 会被忽略。

4. 点 Submit
5. 发完后在自己帖子下面回复一条补充说明（这样首页能看到你的 GitHub 链接 + 正文）：

```
Hi HN, I built Agent Factory — an open-source platform that lets one person run an entire AI-powered company.

It comes with 64 pre-built agent templates — CEO, PM, engineers, designers, testers, marketing, legal, finance, even a quant trading team — that autonomously collaborate to deliver real artifacts.

The key difference from other multi-agent frameworks: it's fully self-contained. No external orchestration service, no cloud dependency. You run `npx agent-factory start` and get a local Dashboard UI with a pixel-art office, task board, message center, and autopilot mode.

Under the hood it uses OpenClaw as the gateway engine, supports 15+ LLM providers (Anthropic, OpenAI, DeepSeek, MiniMax, etc.), and has an N×N agent communication matrix with permission controls.

Tech stack: Next.js 14 + TypeScript + Tailwind (dark theme). Runs on macOS/Linux with Node.js 22+.

Landing page: https://shuanbao0.github.io/agent-factory

Would love feedback on the architecture and use cases you'd find interesting.
```

---

## 第二步：Reddit（预计 5 分钟，发 3 个帖子）

> Reddit 的 r/selfhosted 和 r/LocalLLaMA 对本地运行的 AI 项目非常友好。

### 2a. r/selfhosted

1. 打开 https://www.reddit.com/r/selfhosted/submit
2. 选择 **Text** 类型
3. 填写：

**Title:**
```
Agent Factory: Open-source self-hosted platform to run 64 AI agents as a complete company
```

**Body:**
```
I built Agent Factory, a self-hosted multi-agent platform that lets one person run an entire AI company from their terminal.

**Why it's relevant to r/selfhosted:**
- Fully self-contained — built-in OpenClaw engine, no cloud dependencies
- Runs 100% locally with `npx agent-factory start`
- Dashboard UI on localhost:3100
- Your data never leaves your machine

**What it does:**
- 64 pre-built agent templates: CEO, PM, engineers, designers, testers, marketing, sales, legal, finance, quant trading team
- CEO-driven autopilot: give a mission → auto-decomposes into tasks → agents execute in parallel
- Real-time dashboard with pixel-art office visualization, task board, message center
- Supports 15+ LLM providers (Anthropic, OpenAI, DeepSeek, MiniMax, etc.)
- N×N agent communication matrix with permission controls

**Tech:** Next.js 14, TypeScript, Tailwind, Node.js 22+. macOS/Linux.

**Install:**
```
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory && npm install && cd ui && npm install && cd .. && npm start
```

GitHub: https://github.com/shuanbao0/agent-factory
Landing page: https://shuanbao0.github.io/agent-factory

Open to feedback — what features would you want for self-hosted use?
```

**Flair:** 选 `Self-Hosted Alternatives` 或 `AI/ML`（如果有的话）

### 2b. r/LocalLLaMA

1. 打开 https://www.reddit.com/r/LocalLLaMA/submit
2. 填写：

**Title:**
```
Agent Factory: Open-source platform to run a 64-agent AI company locally — supports 15+ LLM providers
```

**Body:**
```
I've been working on Agent Factory, an open-source multi-agent collaboration platform that runs entirely locally.

**Key points for this community:**
- Works with any LLM provider — Anthropic, OpenAI, DeepSeek, MiniMax, Groq, Mistral, and more
- You can mix and match models per agent (e.g., Claude for coding agents, cheaper models for content)
- Everything runs on your machine, no cloud orchestration needed
- Built-in OpenClaw gateway engine handles routing and session management

**What it does:**
- 64 pre-built agent role templates organized into 5 departments (Dev, Business, Content, Creative, Quant)
- CEO-driven autopilot mode — give a high-level goal, agents auto-decompose and execute
- Real-time dashboard with pixel-art office, task board, message center
- N×N agent communication with permission controls
- Persistent memory, skills, and isolated workspaces per agent

**Tech:** Next.js 14 + TypeScript + Tailwind. Node.js 22+, macOS/Linux.

**Quick start:**
```
npx agent-factory start
# Open http://localhost:3100
```

GitHub: https://github.com/shuanbao0/agent-factory

Has anyone tried running multi-agent setups with local models? Would love to hear what model combinations work best for different agent roles.
```

### 2c. r/SideProject

1. 打开 https://www.reddit.com/r/SideProject/submit
2. 填写：

**Title:**
```
I built an AI company simulator with 64 autonomous agents — open source
```

**Body:**
```
Side project that got a bit out of hand: Agent Factory lets you run a simulated company where 64 AI agents (CEO, engineers, designers, marketers, etc.) autonomously collaborate on tasks.

Give the CEO a goal like "build a landing page for product X" and watch it decompose the task, brief the designer, assign frontend/backend work, have QA review, and marketing write the copy — all automatically.

Built with Next.js + TypeScript. Self-contained (no cloud dependencies). Supports 15+ LLM providers.

The pixel-art office UI is my favorite part — each agent has a desk and you can see who's working in real-time.

9 days since open-sourcing. Would love early feedback.

GitHub: https://github.com/shuanbao0/agent-factory
Live demo page: https://shuanbao0.github.io/agent-factory
```

---

## 第三步：V2EX（预计 3 分钟）

> V2EX 的「分享创造」节点是国内开发者发布开源项目的首选。

1. 打开 https://www.v2ex.com/new/create
2. **节点**选择 `分享创造`
3. 填写：

**标题:**
```
我用 AI 搭了一家 64 人公司：Agent Factory 开源多 Agent 协作平台
```

**正文（Markdown 格式）:**
```markdown
## 这是什么？

Agent Factory 是一个开源的多 Agent 协作平台。**一个人 + Agent Factory = 一家完整的 AI 公司**。

内置 64 个角色模板 —— CEO、产品经理、前后端工程师、设计师、测试、市场、销售、法务、财务，甚至还有量化交易团队 —— 这些 AI Agent 可以自主协作、分解任务、并行执行，产出真实的工作成果。

## 核心特点

- **Autopilot 模式**：给 CEO 一句话目标 → 自动分解任务 → 分配角色 → 并行执行 → 产出交付物
- **64 个预置角色模板**：覆盖开发、商务、内容、创意、量化五大部门
- **像素办公室 UI**：复古像素风可视化，直观看到每个 Agent 的工作状态
- **自包含架构**：内置 OpenClaw 引擎，`npx agent-factory start` 一键启动
- **多模型支持**：Anthropic、OpenAI、DeepSeek、MiniMax 等 15+ 供应商
- **完全本地运行**：数据不出本机

## 安装

```bash
npx agent-factory start
# 浏览器打开 http://localhost:3100
```

## 技术栈

Next.js 14 + TypeScript + Tailwind（暗色主题）+ Zustand + OpenClaw

## 链接

- GitHub: https://github.com/shuanbao0/agent-factory
- Landing Page: https://shuanbao0.github.io/agent-factory

开源 9 天，欢迎试用、提 Issue、Star ⭐

有什么想法或建议欢迎交流！
```

---

## 第四步：掘金（预计 3 分钟）

> 掘金的开源标签下发文章，SEO 好，长尾流量持续。

1. 打开 https://juejin.cn/editor/drafts/new
2. 直接复制 `docs/chinese-tech-article.md` 的**全部内容**粘贴
3. 手动上传截图（从 `docs/img/` 目录拖入）：
   - `dashboard.png` → 替换文中 [Dashboard 截图] 占位符
   - `pixel-office.png` → 替换 [像素办公室截图]
   - `autopilot-mission.png` → 替换 [Autopilot 截图]
   - `task-board.png` → 替换 [任务看板截图]
   - `agents-list.png` → 替换 [Agent 列表截图]
4. 设置：
   - **分类**: 前端 或 人工智能
   - **标签**: `开源`, `AI`, `Agent`, `TypeScript`, `Next.js`
   - **封面图**: 用 `docs/img/dashboard.png`
5. 发布

---

## 第五步：知乎（预计 5 分钟）

> 知乎的策略是 **回答问题 + 发文章** 双管齐下。

### 5a. 发文章

1. 打开 https://zhuanlan.zhihu.com/write
2. 同样复制 `docs/chinese-tech-article.md` 的内容粘贴
3. 上传截图（同掘金）
4. 添加话题标签：`人工智能`, `AI Agent`, `开源项目`, `多智能体`
5. 发布

### 5b. 回答相关问题

搜索以下问题，找到后写回答（简短版，200-300 字 + 项目链接）：

搜索关键词：
- `AI Agent 框架推荐`
- `多智能体协作`
- `有哪些好用的 AI 开发工具`
- `CrewAI AutoGen 对比`

**回答模板：**
```
推荐一个最近开源的项目：Agent Factory

和 CrewAI / AutoGen / MetaGPT 不同的是，它是完全自包含的，不需要外部编排服务。内置 64 个角色模板（CEO、工程师、设计师、市场、法务……），有一个像素风 Dashboard 可以实时看到所有 Agent 的工作状态。

核心亮点：
- `npx agent-factory start` 一键启动
- CEO Autopilot 模式：给一个目标就自动分解执行
- 支持 15+ 模型供应商，可以给不同 Agent 配不同模型
- 完全本地运行，数据不出机器

GitHub: https://github.com/shuanbao0/agent-factory

（利益相关：我是作者）
```

---

## 第六步：Social Preview 上传（预计 1 分钟）

1. 打开 https://github.com/shuanbao0/agent-factory/settings
2. 滚动到最底部 **Social preview** 部分
3. 点 **Edit** → **Upload an image**
4. 上传 `docs/img/dashboard.png`（或用其他 1280×640 的图）
5. 点 Save

---

## 第七步（可选）：Twitter（需先修复认证）

1. 按 `docs/twitter-fix-guide.md` 中的步骤修复 MCP Twitter 认证
2. 修复后告诉我，我会自动发推文线程（7 条推文串联）
3. 记得每条推文附带对应截图（手动上传到 Twitter）

---

## 第八步（可选）：Dev.to（需要 API Key）

1. 登录 https://dev.to
2. Settings → Extensions → 底部 **DEV Community API Keys** → 生成一个
3. 把 API Key 给我
4. 我会自动发布两篇文章为 **Draft**：
   - "I Built an AI Company with 64 Autonomous Agents"
   - "Agent Factory vs CrewAI vs AutoGen vs MetaGPT"
5. 你在 dev.to Dashboard 审阅后点 Publish

---

## 第九步（可选）：阮一峰科技爱好者周刊投稿

> 阮一峰的周刊覆盖 10w+ 中文开发者，免费投稿。

1. 打开 https://github.com/ruanyf/weekly/issues
2. 创建 Issue，标题和内容：

**标题:**
```
[投稿] Agent Factory — 开源多 Agent 协作平台，64 个 AI 角色自动协作
```

**内容:**
```
## Agent Factory

开源的多 Agent 协作平台，内置 64 个角色模板（CEO、工程师、设计师、市场、量化交易员等），一键启动即可运行一家 AI 公司。

核心特点：
- 自包含架构，无需外部服务
- CEO Autopilot 模式，自动分解任务并行执行
- 像素风 Dashboard UI，实时监控
- 支持 15+ LLM 供应商

技术栈：Next.js 14 + TypeScript + Tailwind + OpenClaw

GitHub: https://github.com/shuanbao0/agent-factory
主页: https://shuanbao0.github.io/agent-factory
```

---

## 执行顺序建议

| 顺序 | 渠道 | 耗时 | 说明 |
|------|------|------|------|
| 1 | V2EX | 3 min | 先发中文，马上能看到反馈 |
| 2 | Reddit ×3 | 5 min | 三个 sub 一起发 |
| 3 | 掘金 | 3 min | 复制粘贴+传图 |
| 4 | Social Preview | 1 min | 提升分享卡片效果 |
| 5 | 知乎文章+回答 | 5 min | 长尾 SEO 流量 |
| 6 | Hacker News | 3 min | 等美西上午发效果最好 |
| 7 | 阮一峰周刊 | 2 min | 长线，可能要等 1-2 周刊出 |
| 8 | Twitter | — | 修复认证后告诉我 |
| 9 | Dev.to | — | 给我 API Key |
