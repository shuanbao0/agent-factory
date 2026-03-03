<p align="center">
  <h1 align="center">Agent Factory</h1>
  <p align="center">
    <strong>一个人 + Agent Factory = 一家完整的 AI 公司</strong>
  </p>
  <p align="center">
    自包含的多 Agent 协作平台，内置 OpenClaw 引擎，开箱即用。
    <br />
    让一个人拥有一整个团队的战斗力。
  </p>
  <p align="center">
    <a href="./README.md">English</a> | 中文
  </p>
</p>

---

## 为什么选择 Agent Factory？

你不需要招一个团队，你需要 Agent Factory。

Agent Factory 让**一个人**拥有一整家公司的能力 —— PM、研究员、设计师、前后端工程师、测试、市场、销售、法务、财务 —— 全部以自主 AI Agent 运行，彼此协作、沟通，产出真实交付物。

**一人公司愿景：**
- 给一句需求，整个团队自动运转
- Agent 自动分解任务、分配角色、并行执行
- 产出真实制品：PRD、设计稿、代码、测试报告、营销文案
- 内置编排引擎 —— 无需人工协调
- 52 个预置角色模板，覆盖开发、商务、内容、创意团队

## 特性

- **52 个内置 Agent 模板** —— CEO、PM、设计师、前端、后端、测试、市场、法务、CFO、小说策划、动画导演等
- **DAG 编排引擎** —— 智能任务分解与并行执行
- **内置 OpenClaw 引擎** —— 无需外部运行时，完全自包含
- **Dashboard 控制台** —— 实时监控，像素风办公室可视化
- **多供应商 LLM 支持** —— Anthropic、OpenAI、DeepSeek、MiniMax 等 15+ 供应商
- **技能系统** —— 可扩展能力（摘要、会话日志、项目初始化等）
- **Agent 通信矩阵** —— N×N 权限控制的 Agent 间消息传递
- **Autopilot 模式** —— CEO 驱动的自动运营循环
- **记忆与上下文** —— 基于向量的语义记忆，支持长期项目

## 架构

```
┌─────────────────────────────────────────────┐
│      Dashboard UI (Next.js, 端口 3100)       │
│   暗色主题 │ 中英双语 │ 像素办公室             │
├─────────────────────────────────────────────┤
│              Agent Factory                  │
│  ├── 52 个 Agent 角色模板                    │
│  ├── 编排引擎（基于 DAG）                     │
│  ├── 技能系统                                │
│  ├── 通信矩阵                                │
│  └── 共享项目工作区                           │
├─────────────────────────────────────────────┤
│     内置 OpenClaw 引擎（端口 19100）          │
│  ├── LLM 路由（多供应商）                     │
│  ├── 工具系统（exec/browser/search）          │
│  └── 会话与记忆管理                           │
└─────────────────────────────────────────────┘
```

## 快速开始

### 一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/FrankLiBao/agent-factory/main/scripts/install.sh | bash
```

安装脚本会自动完成：
- 检测并安装 Node.js（通过 nvm）
- 从 GitHub Releases 下载最新版本
- 安装所有依赖
- 引导你配置 API Key

> **CI/CD 环境？** 使用非交互模式：`curl -fsSL ... | bash -s -- --no-prompt --api-key sk-ant-xxx`

### 手动安装

```bash
git clone https://github.com/FrankLiBao/agent-factory.git
cd agent-factory
npm install          # 安装内置 OpenClaw 引擎 + 依赖
cp .env.example .env # 配置 API Key
# 编辑 .env: ANTHROPIC_API_KEY=sk-ant-...

npm start            # 启动 Agent Factory（内置 Gateway，端口 19100）
npm run ui           # 启动 Dashboard（端口 3100）
```

无需单独安装 OpenClaw —— 项目自带完整运行时。

### 环境要求

- Node.js >= 22.0.0
- 至少一个 LLM 供应商 API Key（推荐 Anthropic）

## Agent 角色

### 开发团队

| Agent | 职责 |
|-------|------|
| Orchestrator | 全局编排、任务分解、进度协调 |
| PM | 需求拆解、任务分配、进度跟踪 |
| Researcher | 市场调研、竞品分析 |
| Product | PRD 编写、功能定义 |
| Designer | UI/UX 设计、设计规范 |
| Frontend | 前端开发（React/TypeScript）|
| Backend | 后端开发（Node/TypeScript）|
| Tester | 测试用例、自动化测试 |

### 商务团队

| Agent | 职责 |
|-------|------|
| CEO | 战略决策、资源分配 |
| CFO | 财务分析、预算管理 |
| COO | 运营管理 |
| Marketing | GTM 策略、内容营销 |
| Sales Director | 销售策略、管线管理 |
| Legal Director | 合规审查、合同管理 |

### 创意团队

| Agent | 职责 |
|-------|------|
| Novel Chief | 网文项目策划与统筹 |
| Plot Architect | 故事结构与剧情设计 |
| Worldbuilder | 世界观设定与体系构建 |
| Anime Director | 动画项目导演 |
| Character Designer | 角色设计与视觉形象 |

> 查看全部 52 个模板：`templates/builtin/` 目录

## 协作流程

```
需求 → PM 拆解 → Researcher 调研 + Product 写 PRD
     → Designer 出设计 → Frontend + Backend 并行开发
     → Tester 测试 → 交付
```

## 目录结构

```
agent-factory/
├── templates/            # Agent 角色模板
│   ├── builtin/          # 52 个内置模板
│   └── custom/           # 自定义模板
├── agents/               # 运行时 Agent 实例
├── orchestrator/         # 编排引擎
├── skills/               # 共享技能模块
├── config/               # 配置文件
│   ├── mission.md        # 公司使命与运营模式
│   ├── departments.json  # 部门结构
│   └── base-rules.md     # 基础 Agent 规则
├── scripts/              # 启动与工具脚本
├── ui/                   # Dashboard（Next.js）
├── docs/                 # 设计文档
├── projects/             # 项目产出物
└── workspaces/           # Agent 工作目录
```

## 配置

编辑 `.env`：

```bash
# 必填：至少一个供应商 API Key
ANTHROPIC_API_KEY=sk-ant-...

# 可选：额外供应商
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...

# 可选：运行模式
# AGENT_FACTORY_MODE=auto|attached|standalone
```

## 使用场景

### 独立开发者 / Indie Hacker
给 Agent Factory 一个产品创意 —— 它自动调研市场、撰写 PRD、设计 UI、编写代码、执行测试。你负责审核和发布。

### 内容创作者
搭建网文写作团队或动画制作流水线。Agent 处理剧情、世界观、角色设计、章节起草，你负责把控方向。

### 一人企业
运行市场分析、生成商业计划、创作营销文案、管理合规事务 —— 全部通过拥有专业知识的 AI Agent 完成。

## 参与贡献

查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解贡献指南。

## 许可证

本项目基于 [GPL-3.0 许可证](./LICENSE) 开源。

第三方依赖列表见 [THIRD-PARTY-LICENSES](./THIRD-PARTY-LICENSES)。
