# 我用 AI 搭了一家 64 人公司：从零到自动化协作的开源实践

> 一个人 + Agent Factory = 一家完整的 AI 公司。64 个 AI Agent 自主协作，从需求分解到交付产出，全程自动化。

## 为什么我们需要多 Agent 协作？

过去一年，AI Agent 的概念从 "聊天机器人" 进化到了 "能干活的数字员工"。但大多数项目还停留在单 Agent 阶段 —— 一个 Agent 包打天下，既写代码又做设计还要写文案。

现实中的公司不是这样运作的。一个产品从概念到交付，需要产品经理定义需求、工程师写代码、设计师做 UI、测试保证质量、市场负责推广。**每个角色有自己的专业领域和思维方式**，这才是高效协作的基础。

多 Agent 协作的核心价值在于：**专业分工 + 自主协调 + 并行执行**。让每个 Agent 专注于自己擅长的事，通过结构化的通信机制协调工作，多条线并行推进 —— 这比让一个 "全能 Agent" 串行处理所有事情要高效得多。

但现有的多 Agent 框架往往面临几个问题：

1. **依赖外部编排服务**：需要部署额外的协调层，增加复杂度和延迟
2. **角色定义过于简单**：大多只有 "assistant" 和 "user" 两种角色
3. **缺乏可视化管理**：无法直观地看到 Agent 的工作状态和协作流程
4. **无法本地运行**：依赖云服务，数据安全和隐私无法保障

这就是我构建 Agent Factory 的初衷。

## Agent Factory 是什么？

**Agent Factory** 是一个完全开源、自包含的多 Agent 协作平台。它内置了 64 个角色模板，覆盖一家公司的完整组织架构，从 CEO 到量化交易员。

一条命令即可启动：

```bash
npx agent-factory start
# 浏览器打开 http://localhost:3100
```

不需要云服务，不需要外部编排，所有组件都在本地运行。

## 核心功能详解

### Autopilot 模式：一句话驱动整个公司

这是 Agent Factory 最核心的能力。你只需要给 CEO Agent 一句话目标，比如 "为产品 X 构建一个落地页"，系统会自动完成：

1. CEO 将目标分解为具体任务（需求文档、UI 设计、前端开发、内容撰写）
2. 根据任务类型自动分配给对应角色的 Agent
3. 多个 Agent 并行执行各自的任务
4. 产出真实的工作交付物 —— PRD 文档、设计稿、代码文件、测试报告

整个过程你可以在 Dashboard 上实时观察，也可以随时介入调整方向。

![Autopilot 模式](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/autopilot-mission.png)

### 64 个预置角色模板

不是随便起个名字就叫 "Agent"。每个角色模板都有详细的能力定义、记忆系统、技能配置和工作规范：

| 部门 | 角色示例 |
|------|---------|
| **开发部** | 前端工程师、后端工程师、DevOps、DBA、安全工程师、测试工程师 |
| **商务部** | 销售、市场、法务、财务、商务拓展 |
| **内容部** | 文案、SEO、社交媒体运营 |
| **创意部** | 小说写手、动漫导演、创意总监 |
| **量化部** | 研究员、策略师、风控、交易执行 |

每个 Agent 拥有独立的工作空间（`workspaces/{id}/`），核心定义与产出严格分离，互不干扰。

### 像素办公室：直观的组织可视化

![像素办公室](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/pixel-office.png)

这是我个人最喜欢的功能。每个 Agent 在像素办公室里都有自己的工位，你可以直观地看到：谁在工作、谁在空闲、哪个部门在忙碌。它不仅是好看 —— 它提供了一种**空间化的组织心智模型**。

### Agent 通信矩阵

![通信矩阵](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/agent-comm-matrix.png)

Agent 之间通过 N x N 的权限控制通信矩阵进行消息传递。你可以精确控制哪些 Agent 可以互相通信，实现部门间的信息隔离或协作。

### Dashboard 实时监控

![Dashboard](https://raw.githubusercontent.com/shuanbao0/agent-factory/main/docs/img/dashboard.png)

Dashboard 提供全局视野：活跃 Agent 数量、运行中的任务、系统健康状态、资源使用率、日志监控，一目了然。

## 架构设计

Agent Factory 采用自包含架构，核心数据流如下：

```
Dashboard UI (Next.js)
    |
    v
API Routes (/api/*)
    |
    v
OpenClaw Gateway Engine (本地 WebSocket, port 19100)
    |
    v
LLM Providers (Anthropic / OpenAI / DeepSeek / MiniMax / ...)
```

关键设计决策：

- **双目录架构**：Agent 核心定义（`agents/`）与工作产出（`workspaces/`）严格分离
- **Base-Rules 注入**：全局规则通过 marker 机制幂等注入到每个 Agent，确保行为一致性
- **Gateway 子进程管理**：Dashboard 通过 spawn/kill 管理 Gateway 生命周期
- **WebSocket 聊天协议**：独立 Node 子进程处理 WebSocket 通信，避免 Next.js webpack 打包问题

技术栈：Next.js 14 + TypeScript (strict) + Tailwind CSS (暗色主题) + Zustand 状态管理 + OpenClaw 引擎。

## 安装与使用

### 环境要求

- Node.js >= 22
- macOS 或 Linux
- 至少一个 LLM Provider 的 API Key（Anthropic / OpenAI / DeepSeek 等）

### 快速开始

```bash
# 方式一：npx 直接运行
npx agent-factory start

# 方式二：克隆源码
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install && cd ui && npm install && cd ..

# 配置 API Key
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动
npm start
# 浏览器打开 http://localhost:3100
```

启动后，在 Dashboard 的 Settings 页面可以配置 LLM Provider，然后就可以创建 Agent 并开始使用了。

## 实际使用场景

### 场景一：独立开发者的虚拟团队

你是一个独立开发者，但有了 Agent Factory，你拥有一整个开发团队。给 CEO 一个需求 "开发一个待办事项 App"，PM 会写 PRD，前端工程师写 React 代码，后端工程师设计 API，测试工程师写测试用例，文案撰写用户指南。

### 场景二：内容创作工厂

小说连载、公众号运营、社交媒体矩阵 —— 内容部门的 Agent 可以批量产出高质量内容，SEO Agent 优化搜索排名，社交媒体 Agent 自动分发。

### 场景三：低成本创业验证

想验证一个商业想法？让市场研究员做竞品分析，PM 写商业计划，设计师做原型，工程师写 MVP 代码。几个小时完成过去需要几周的工作量。

### 场景四：量化投研全自动化

研究员收集市场数据，策略师构建交易模型，风控评估风险敞口，执行 Agent 管理订单 —— 完整的量化交易工作流。

## 项目状态与路线图

Agent Factory 目前版本 v0.4.31，处于活跃开发阶段。已实现的核心功能稳定可用，还有很多激动人心的特性在规划中。

欢迎参与贡献：

- 提 Issue 报告 bug 或提出功能建议
- 提交 PR 贡献代码
- 创建自定义 Agent 模板并分享
- 在 ClawHub 技能市场发布技能

## 写在最后

Agent Factory 的愿景很简单：**让每个人都能拥有一家 AI 公司**。不需要招聘、不需要管理、不需要办公室 —— 只需要一台电脑和一个想法。

这不是科幻，这是今天就能用的开源工具。

GitHub: https://github.com/shuanbao0/agent-factory

如果觉得有意思，给个 Star 支持一下！有任何问题或建议，欢迎在 GitHub 上开 Issue 或 Discussion 交流。
