# Agent Factory 开发指南

## 项目概述

Agent Factory 是一个自包含的多 Agent 协作平台，内置 OpenClaw 引擎，提供 Dashboard UI 进行管理。

- 版本: 0.2.0
- 仓库: https://github.com/shuanbao0/agent-factory
- 运行时: Node.js >= 22
- 许可: GPL-3.0

## 项目结构

```
agent-factory/
├── agents/                # Agent 实例（运行时创建，git 不跟踪）
├── config/                # 配置文件
│   ├── openclaw.json      # Gateway 配置（端口、模型、插件、Agent 列表）
│   ├── models.json        # 模型别名定义（Anthropic/MiniMax）
│   └── autopilot-state.json # Autopilot 运行状态
├── docs/                  # 项目文档（BLUEPRINT、PLAN、设计稿等）
├── libs/                  # 本地库（openclaw 源码，不提交）
├── orchestrator/          # 编排 Agent（DAG 流程控制）
├── scripts/
│   ├── start.mjs          # 统一启动脚本（Dashboard + Gateway）
│   ├── autopilot.cjs      # Autopilot 循环脚本
│   └── migrate-to-templates.mjs
├── skills/                # 共享技能（project-init、wechat-mp-cn）
├── templates/
│   ├── builtin/           # 内置 Agent 模板（14 个）
│   └── custom/            # 用户自定义模板（不提交）
├── ui/                    # Next.js Dashboard（详见下方）
├── .env                   # API Key 等敏感配置（不提交）
├── .env.example           # 环境变量模板
├── package.json           # 根依赖（openclaw 引擎）
└── BLUEPRINT.md           # 架构蓝图（34KB，详细设计）
```

### UI 目录结构（`ui/`）

```
ui/src/
├── app/                   # Next.js App Router
│   ├── api/               # API 路由（30+ 端点）
│   │   ├── agents/        # Agent CRUD、chat、sessions、skills
│   │   ├── gateway/       # start/stop/restart/status
│   │   ├── projects/      # 项目管理
│   │   ├── skills/        # 技能安装管理
│   │   ├── models/        # 模型配置
│   │   ├── autopilot/     # Autopilot 控制
│   │   └── ...            # health, logs, usage, env, templates, auth-profiles, messages, sessions
│   ├── agents/            # Agent 管理页
│   ├── projects/          # 项目页
│   ├── skills/            # 技能商店页
│   ├── messages/          # 消息中心
│   ├── logs/              # 日志监控页
│   ├── settings/          # 设置页（Provider、Gateway、模型）
│   ├── setup/             # 初始配置向导（可选入口）
│   ├── layout.tsx         # 根布局
│   └── page.tsx           # Dashboard 首页
├── components/            # React 组件（20+）
│   ├── ui/                # 基础 UI（Card、Badge）
│   ├── layout-shell.tsx   # 主布局壳（sidebar + content）
│   ├── sidebar.tsx        # 导航侧边栏
│   ├── data-provider.tsx  # 全局数据轮询启动器
│   ├── gateway-guard.tsx  # Gateway 访问守卫（当前为透传）
│   ├── agent-form.tsx     # Agent 创建/编辑表单
│   ├── template-picker.tsx # 模板选择器
│   ├── autopilot-card.tsx # Autopilot 控制卡片
│   └── ...
├── lib/                   # 核心库
│   ├── store.ts           # Zustand 全局状态（轮询、Agent、项目、日志等）
│   ├── gateway-manager.ts # Gateway 进程管理（spawn/kill/status）
│   ├── gateway-client.ts  # Gateway CLI 调用封装（gwCall）
│   ├── gateway-chat.ts    # WebSocket 聊天协议
│   ├── i18n.ts            # i18n（zh/en，localStorage 持久化）
│   ├── providers.ts       # AI Provider 定义（15+ 供应商）
│   ├── template-meta.ts   # 模板读取
│   ├── clawhub.ts         # ClawHub 技能市场 CLI 封装
│   ├── types.ts           # TypeScript 类型定义
│   └── utils.ts           # 工具函数
├── locales/               # 翻译文件
│   ├── en.json
│   └── zh.json
└── styles/globals.css     # Tailwind + 自定义样式（暗色主题）
```

## 技术栈

| 层 | 技术 |
|----|------|
| UI 框架 | Next.js 14 (App Router) + React 18 |
| 状态管理 | Zustand 4.5 |
| 样式 | Tailwind CSS 3.4（暗色主题）+ clsx + tailwind-merge + CVA |
| 图标 | lucide-react |
| 图表 | Recharts |
| 语言 | TypeScript 5.3（strict 模式） |
| 路径别名 | `@/*` → `./src/*` |
| Gateway 引擎 | OpenClaw（npm 依赖，本地运行） |
| 运行时 | Node.js >= 22 |

## 构建与运行命令

```bash
# 安装依赖
npm install                    # 根目录（安装 openclaw 引擎）
cd ui && npm install           # UI 依赖

# 启动（推荐）
npm start                      # 同时启动 Dashboard (3100) + Gateway (19100)

# 分别启动
npm run ui                     # 仅 Dashboard（cd ui && npm run dev）
npm run gateway                # 仅 Gateway

# UI 开发
cd ui
npm run dev                    # 开发服务器 http://localhost:3100
npm run build                  # 生产构建
npm run lint                   # ESLint 检查
```

## 端口

| 服务 | 端口 | 说明 |
|------|------|------|
| Dashboard | 3100 | Next.js 开发服务器 |
| Gateway | 19100 | OpenClaw WebSocket Gateway |

可通过环境变量 `OPENCLAW_GATEWAY_PORT` 覆盖 Gateway 端口。

## 环境变量

参见 `.env.example`：

| 变量 | 必填 | 说明 |
|------|------|------|
| `ANTHROPIC_API_KEY` | 至少一个 | Anthropic API Key |
| `OPENAI_API_KEY` | 可选 | OpenAI API Key |
| `DEEPSEEK_API_KEY` | 可选 | DeepSeek API Key |
| `OPENCLAW_GATEWAY_PORT` | 否 | 自定义 Gateway 端口（默认 19100） |
| `AGENT_FACTORY_DIR` | 否 | 项目根目录（自动检测） |
| `AGENT_FACTORY_TOKEN` | 否 | 内部通信 Token（默认 `agent-factory-internal-token-2026`） |

## 架构核心概念

### 数据流

```
UI 组件 → Zustand Store → fetch /api/* → gwCall() → OpenClaw Gateway (CLI/WebSocket)
                                                        ↓
Store 更新 ← JSON 响应 ←──────────────────────────────────┘
```

### 轮询机制（DataProvider）

| 数据 | 间隔 |
|------|------|
| Health | 15s |
| Agents | 10s |
| Logs | 5s |
| Usage | 30s |

### Gateway 状态

`getStatus()` 返回值：`'running'` | `'stopped'` | `'starting'` | `'no-key'` | `'error'`

### Agent 创建流程

1. 用户选择模板（builtin/custom）
2. `POST /api/agents` → 创建 `agents/{id}/agent.json` + `AGENTS.md` + `TOOLS.md`
3. 创建 `workspaces/{id}/`（IDENTITY.md、SOUL.md、skills 符号链接）
4. 更新 `config/openclaw.json` 注册 Agent
5. 重启 Gateway 加载新 Agent

### 聊天协议

WebSocket 连接 `ws://127.0.0.1:19100`，帧协议：
1. `connect` + token → `hello-ok`
2. `chat.send` + sessionKey + message → `chat` events (delta/final/error)

为避免 Next.js webpack 打包 `ws` 模块的问题，聊天使用独立 Node 子进程（`ui/scripts/gateway-chat.js`）。

## 编码规范

- 所有 UI 组件使用 `'use client'` 指令（客户端组件）
- 数据获取通过 `/api/*` 路由，不直接在客户端访问文件系统
- 使用 Tailwind 暗色主题，颜色变量定义在 `globals.css`
- 响应式布局：`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`
- 图标使用 lucide-react，不使用其他图标库
- i18n：所有用户可见文案必须经过 `t()` 翻译函数，同时更新 `en.json` 和 `zh.json`
- TypeScript strict 模式，避免 `any`
- 组件变体使用 CVA（class-variance-authority）

## i18n 系统

- 默认语言：`zh`（中文）
- 持久化：localStorage key `af-locale`
- Hook：`const { t, locale, setLocale } = useTranslation()`
- 翻译函数：`t('dashboard.title')` → 点分路径查找
- 新增文案时，`en.json` 和 `zh.json` 必须同步更新

## 关键配置文件

### `config/openclaw.json`

Gateway 核心配置，包含：模型定义、Agent 列表、端口、认证 Token、插件。Agent 创建/删除时会自动更新此文件。

### `config/models.json`

模型别名映射，定义各 Provider 下的模型 ID。当前配置：
- Anthropic：opus (claude-opus-4-6)、sonnet (claude-sonnet-4-6)、haiku
- MiniMax：M2.5、M2.1（通过 minimax-portal）

### Agent 模板（`templates/builtin/{id}/template.json`）

```json
{
  "id": "pm",
  "name": "Project Manager",
  "description": "...",
  "emoji": "📋",
  "category": "builtin",
  "defaults": {
    "model": "minimax-portal/MiniMax-M2.5",
    "skills": ["tmux", "github", "session-logs"],
    "peers": ["ceo", "researcher", "..."]
  }
}
```

## Git 约定

### 不提交的内容

- `.env` — API Key 等敏感信息
- `agents/` — 运行时创建的 Agent 实例（仅保留 `.gitkeep`）
- `templates/custom/` — 用户自定义模板（仅保留 `.gitkeep`）
- `workspaces/` — Agent 工作空间
- `projects/` — 项目产出物
- `.openclaw-state/` — Gateway 运行时状态
- `libs/` — 本地库源码
- `node_modules/`

### 提交规范

- 遵循 Conventional Commits：`feat:`, `fix:`, `refactor:`, `docs:` 等
- 提交消息简洁，面向操作（如 `feat: template-based agent creation system`）
- 相关改动分组提交，不捆绑无关重构

## 安全提示

- 切勿提交 `.env` 或任何包含 API Key 的文件
- Gateway 内部 Token（`agent-factory-internal-token-2026`）仅用于本地通信
- Auth profiles 存储在 `.openclaw-state/agents/main/agent/auth-profiles.json`（不提交）

## 修改代码后的操作流程

修改 UI 代码后，需按以下步骤确保变更生效：

```bash
# 1. 清除 Next.js 缓存（避免旧 build 产物与 dev server 冲突，导致 CSS/JS 404）
rm -rf ui/.next

# 2. 杀掉占用端口的旧进程
lsof -ti:3100 | xargs kill -9 2>/dev/null

# 3. 重启开发服务器
cd ui && npm run dev

# 打包 + 发布一条龙
tar -czf /tmp/agent-factory-vX.Y.Z.tar.gz --exclude='.git'
--exclude='node_modules' ...
gh release create vX.Y.Z /tmp/agent-factory-vX.Y.Z.tar.gz
scripts/install.sh
```

**注意事项：**
- 执行过 `npm run build` 后，`.next` 目录包含生产构建产物，与 dev server 的增量编译不兼容，必须清除
- 如果只是热更新（未执行过 build），通常不需要清缓存，Fast Refresh 会自动生效
- 如果遇到 CSS 404（如 `/_next/static/css/app/layout.css` 返回 404），基本都是缓存问题，清除 `.next` 即可
- 可用一行命令完成全部操作：`rm -rf ui/.next && lsof -ti:3100 | xargs kill -9 2>/dev/null; cd ui && npm run dev`

## 故障排除

- **Gateway 无法启动**：检查 `.env` 是否配置了至少一个 API Key，或在 Dashboard Settings 页面添加 Provider
- **端口被占用**：`lsof -ti:3100 | xargs kill -9`（Dashboard）或 `lsof -ti:19100 | xargs kill -9`（Gateway）
- **Next.js webpack 错误（__webpack_modules__）**：清除缓存 `rm -rf ui/.next && cd ui && npm run dev`
- **ws 模块类型错误**：已知问题，`gateway-chat.ts` 中的 `ws` import 在 `next build` 类型检查时会报错，不影响运行时（聊天通过独立子进程执行）
- **Agent 不可用**：确认 Gateway 正在运行，检查 `config/openclaw.json` 中 agents 列表是否包含该 Agent
