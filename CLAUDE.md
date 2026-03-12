# Agent Factory 开发指南

## 项目概述

Agent Factory 是一个自包含的多 Agent 协作平台，内置 OpenClaw 引擎，提供 Dashboard UI 进行管理。

- 版本: 0.4.41
- 仓库: https://github.com/shuanbao0/agent-factory
- 运行时: Node.js >= 22
- 许可: GPL-3.0

## 项目结构

```
agent-factory/
├── agents/                # Agent 核心定义（AGENTS.md, SOUL.md, memory/, skills/）
├── workspaces/            # Agent 产出空间（文档、代码等工作产出）
├── projects/              # 项目级共享空间（按 department 分目录）
├── bin/
│   └── agent-factory.mjs  # CLI 入口（agent-factory 命令）
├── config/
│   ├── openclaw.json      # Gateway 配置（端口、模型、插件、Agent 列表）
│   ├── models.json        # 模型别名定义（Anthropic/MiniMax）
│   ├── base-rules.md      # 全局强制注入规则（注入到所有 Agent 的 AGENTS.md/SOUL.md）
│   └── autopilot-state.json # Autopilot 运行状态
├── docs/                  # 项目文档（BLUEPRINT、PLAN、设计稿等）
├── libs/                  # 本地库（openclaw 源码，不提交）
├── scripts/
│   ├── start.mjs          # 统一启动脚本（Dashboard + Gateway）
│   ├── autopilot.cjs      # Autopilot 循环脚本
│   ├── inject-base-rules.mjs # 重新注入 base-rules 到所有 Agent
│   ├── migrate-sync-builtin.mjs # 统一同步内置模板到已有 Agent（peers/skills/AGENTS.md/SOUL.md/IDENTITY.md）
│   ├── migrate-sync-config.mjs # 智能同步 config/ 下的部门配置和预算文件（AF_UPDATE_DIR 支持）
│   ├── migrate-sync-gateway.mjs # 智能同步 openclaw.json 和 models.json（AF_UPDATE_DIR 支持）
│   ├── migrate-workspaces.mjs # 工作空间迁移（产出从 agents/ 移到 workspaces/）
│   ├── migrate-to-templates.mjs
│   └── patch-openclaw.mjs     # postinstall 自动补丁（修复 OpenClaw enforceFinalTag/MiniMax 问题）
├── skills/                # 共享技能（project-init、wechat-mp-cn）
├── templates/
│   ├── builtin/           # 内置 Agent 模板（14 个）
│   └── custom/            # 用户自定义模板（不提交）
├── ui/                    # Next.js Dashboard（详见下方）
├── .env                   # API Key 等敏感配置（不提交）
├── .env.example           # 环境变量模板
├── package.json           # 根依赖（openclaw 引擎）+ bin 定义
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
│   │   ├── platform/      # 平台更新（check/update Agent Factory）
│   │   └── ...            # health, logs, usage, env, templates, auth-profiles, messages, sessions
│   ├── agents/            # Agent 管理页
│   ├── projects/          # 项目页
│   ├── skills/            # 技能商店页
│   ├── messages/          # 消息中心
│   ├── logs/              # 日志监控页
│   ├── settings/          # 设置页（Provider、Gateway、模型、平台更新）
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

## CLI 命令（`agent-factory`）

安装后可全局使用 `agent-factory` 命令（通过 `package.json` bin 字段 + `install.sh` 注册）：

```bash
agent-factory start            # 启动 Dashboard + Gateway（前台）
agent-factory stop             # 停止所有服务
agent-factory restart          # 重启
agent-factory status           # 查看运行状态（端口、PID、版本）
agent-factory logs             # 实时查看日志（tail -f）
agent-factory update           # 自动升级到最新版本
agent-factory version          # 显示版本号
agent-factory doctor           # 检查环境（Node、依赖、配置）
```

`agent-factory update` 流程（下载与合并完全分离）：
1. 查询最新 release → 停止服务
2. 下载 tarball → rsync 覆盖代码（跳过用户数据目录/文件）
3. npm install
4. 运行 migrate-\*.mjs 迁移脚本（通过 `AF_UPDATE_DIR` 环境变量传入 tmpDir 路径，脚本从中读取新版 config 做智能合并）
5. 清理 tmpDir → 重新注入 base-rules → 提示重启

也可通过 Dashboard Settings 页面的「Agent Factory 更新」卡片触发（`/api/platform/update`）。

## 构建与运行命令

```bash
# 安装依赖
npm install                    # 根目录（安装 openclaw 引擎）
cd ui && npm install           # UI 依赖

# 启动（推荐）
agent-factory start            # 或 npm start
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
| `AF_UPDATE_DIR` | 否 | update 时自动设置，指向新版 tmpDir，migrate 脚本用来读取 incoming config |

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

### 双目录架构（agents/ vs workspaces/）

Agent 的核心定义与工作产出严格分离：

| 目录 | 用途 | 内容 |
|------|------|------|
| `agents/{id}/` | 核心定义 | AGENTS.md, SOUL.md, IDENTITY.md, MEMORY.md, memory/, skills/, agent.json |
| `workspaces/{id}/` | 产出空间 | 文档、代码、分析报告等一切工作产出 |

- `config/openclaw.json` 的 workspace 字段指向 `agents/{id}/`（Gateway 从这里读取 Agent 定义）
- `config/base-rules.md` 中的规则强制 Agent 把产出写到 `workspaces/{id}/`
- `projects/{department}/` 是按部门划分的共享空间，所有同部门 Agent 可读写

### Base-Rules 注入机制

`config/base-rules.md` 包含三段（`## AGENTS_RULES` / `## SOUL_RULES` / `## REMINDER`），通过 `ui/src/lib/base-rules.ts` 的 marker 机制幂等注入到每个 Agent 的 AGENTS.md 和 SOUL.md 中。

- Agent 创建/更新时自动注入（`injectBaseRulesForAgent()`）
- 手动批量重新注入：`node scripts/inject-base-rules.mjs`
- 单个 Agent 注入：`node scripts/inject-base-rules.mjs novel-chief`
- `agent-factory update` 会自动重新注入

修改 `config/base-rules.md` 后必须执行 `node scripts/inject-base-rules.mjs` 使规则生效。

### Agent 创建流程

1. 用户选择模板（builtin/custom）
2. `POST /api/agents` → 创建 `agents/{id}/agent.json` + `AGENTS.md` + `TOOLS.md` + 记忆基础设施
3. 注入 base-rules 到 AGENTS.md 和 SOUL.md
4. 创建 `workspaces/{id}/`（空产出目录）
5. 更新 `config/openclaw.json` 注册 Agent（workspace 指向 `agents/{id}/`）
6. 如果 Agent 有 department，自动创建/更新 `projects/{department}/`
7. 重启 Gateway 加载新 Agent

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
- MiniMax：M2.5、M2.1（通过 minimax）

### Agent 模板（`templates/builtin/{id}/template.json`）

```json
{
  "id": "pm",
  "name": "Project Manager",
  "description": "...",
  "emoji": "📋",
  "category": "builtin",
  "defaults": {
    "model": "minimax/MiniMax-M2.5",
    "skills": ["tmux", "github", "session-logs"],
    "peers": ["ceo", "researcher", "..."]
  }
}
```

## Git 约定

### 不提交的内容

- `.env` — API Key 等敏感信息
- `agents/` — Agent 核心定义（运行时创建，仅保留 `.gitkeep`）
- `workspaces/` — Agent 产出空间（运行时写入）
- `projects/` — 项目共享空间（按 department 自动创建）
- `templates/custom/` — 用户自定义模板（仅保留 `.gitkeep`）
- `.openclaw-state/` — Gateway 运行时状态
- `libs/` — 本地库源码
- `node_modules/`

### 提交规范

- 遵循 Conventional Commits：`feat:`, `fix:`, `refactor:`, `docs:` 等
- 提交消息简洁，面向操作（如 `feat: template-based agent creation system`）
- 相关改动分组提交，不捆绑无关重构
- Co-Authored-By 使用用户信息：`Co-Authored-By: shuanbao <shuanbao0@gmail.com>`，不使用 Claude 的

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

# 发布新版本（CI 自动打包，无需手动操作）
# ⚠️ 打 tag 前必须先更新版本号！
# 1. bump package.json version 字段
# 2. bump CLAUDE.md 顶部的 "版本: X.Y.Z"
# 3. git commit + push 版本号变更
# 4. git tag vX.Y.Z && git push origin vX.Y.Z
# 5. GitHub Actions (.github/workflows/release.yml) 自动创建 Release + tarball
# 其他机器即可通过 agent-factory update 更新
```

**注意事项：**
- 执行过 `npm run build` 后，`.next` 目录包含生产构建产物，与 dev server 的增量编译不兼容，必须清除
- 如果只是热更新（未执行过 build），通常不需要清缓存，Fast Refresh 会自动生效
- 如果遇到 CSS 404（如 `/_next/static/css/app/layout.css` 返回 404），基本都是缓存问题，清除 `.next` 即可
- 可用一行命令完成全部操作：`rm -rf ui/.next && lsof -ti:3100 | xargs kill -9 2>/dev/null; cd ui && npm run dev`

## 常用运维脚本

```bash
# 重新注入 base-rules 到所有 Agent（修改 config/base-rules.md 后必须执行）
node scripts/inject-base-rules.mjs

# 工作空间迁移（将 agents/ 中的产出移到 workspaces/，修正 openclaw.json 路径）
node scripts/migrate-workspaces.mjs --dry-run   # 预览
node scripts/migrate-workspaces.mjs             # 执行

# 同步部门配置（update 后自动执行，也可手动运行）
node scripts/migrate-sync-config.mjs --dry-run   # 预览
node scripts/migrate-sync-config.mjs             # 同步所有部门
node scripts/migrate-sync-config.mjs novel        # 同步单个部门

# 同步 Gateway 配置（openclaw.json + models.json，update 后自动执行）
node scripts/migrate-sync-gateway.mjs --dry-run   # 预览
node scripts/migrate-sync-gateway.mjs             # 同步

# OpenClaw postinstall 补丁（npm install 自动触发，通常无需手动运行）
node scripts/patch-openclaw.mjs

# 升级（用户端）
agent-factory update
```

### OpenClaw Hotfix 补丁机制

`scripts/patch-openclaw.mjs` 通过 `postinstall` hook 在每次 `npm install` 后自动运行：

1. 定位 `node_modules` 中的 `openclaw`，读取版本号
2. 若版本 >= `2026.4.0`（上游修复版本），跳过
3. 扫描 `dist/**/*.js`，找到 `isReasoningTagProvider` 函数中的 `minimax` 判断行并移除
4. 幂等：已补丁的文件不会重复修改

当上游发布修复版本后，只需更新 `package.json` 中的 openclaw 版本约束，补丁脚本自动跳过。后续版本可移除脚本和 postinstall hook。

## 故障排除

- **Gateway 无法启动**：检查 `.env` 是否配置了至少一个 API Key，或在 Dashboard Settings 页面添加 Provider
- **端口被占用**：`agent-factory stop` 或 `lsof -ti:3100 | xargs kill -9`
- **Next.js webpack 错误（__webpack_modules__）**：清除缓存 `rm -rf ui/.next && cd ui && npm run dev`
- **ws 模块类型错误**：已知问题，`gateway-chat.ts` 中的 `ws` import 在 `next build` 类型检查时会报错，不影响运行时（聊天通过独立子进程执行）
- **Agent 不可用**：确认 Gateway 正在运行，检查 `config/openclaw.json` 中 agents 列表是否包含该 Agent
- **Agent 产出写错位置**：如果 Agent 把产出写到了 `agents/{id}/` 而非 `workspaces/{id}/`，运行 `node scripts/migrate-workspaces.mjs` 迁移，并确认 base-rules 已注入（`node scripts/inject-base-rules.mjs`）
- **MiniMax 模型 chat 无响应（`(no response)`）**：OpenClaw 2026.3.7 的 `enforceFinalTag` 机制会丢弃 MiniMax 输出（MiniMax 不使用 `<final>` 标签）。已通过 `postinstall` 自动补丁修复（`scripts/patch-openclaw.mjs`），`npm install` 时自动应用。上游 PR：https://github.com/openclaw/openclaw/pull/41115 ，待合并发版后补丁脚本会自动跳过

## 修改 OpenClaw 源码并提交 PR 流程

当需要修复 OpenClaw Gateway 的 bug 时，遵循以下流程：

### 1. 修改与本地测试

```bash
# OpenClaw 源码位于 /Users/yuanwu/workspace/openclaw
cd /Users/yuanwu/workspace/openclaw

# 创建 fix 分支
git checkout -b fix/描述性分支名

# 修改代码后，跑相关测试
pnpm install                    # 首次需要安装依赖
pnpm vitest run path/to/test.ts # 跑单个测试文件
```

### 2. 提交 PR 到 OpenClaw

```bash
# 提交（OpenClaw 使用 oxfmt 格式化，注意行宽限制）
git add <files>
git commit -m "fix: 描述"

# 没有直接 push 权限，需要 fork
gh repo fork openclaw/openclaw --remote=false
git remote add fork https://github.com/shuanbao0/openclaw.git
git push fork fix/分支名

# 创建 PR（按 .github/PULL_REQUEST_TEMPLATE.md 模板填写）
gh pr create --repo openclaw/openclaw --head shuanbao0:fix/分支名 --title "..." --body "..."
```

**CI 注意事项：**
- `check` job 包含 `oxfmt` 格式检查，行太长会失败，需要展开为多行格式
- `secrets` job（pnpm-audit-prod）是仓库已有的依赖漏洞问题，所有 PR 都会失败，维护者会忽略
- 修改 `isReasoningTagProvider` 等函数时，记得同步更新 `src/utils/utils-misc.test.ts` 中的断言

### 3. 本地测试修改过的 OpenClaw

在 PR 合并发版前，可以在 Agent Factory 中使用本地修改的 OpenClaw 构建产物测试：

```bash
# 1. 构建 OpenClaw
cd /Users/yuanwu/workspace/openclaw
pnpm build

# 2. 手动 symlink 到 Agent Factory 的 node_modules
#    ⚠️ 不要用 npm link，会破坏其他依赖（如 ws）
rm -rf /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
ln -s /Users/yuanwu/workspace/openclaw /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw

# 3. 重启 Gateway 并测试
lsof -ti:19100 | xargs kill -9 2>/dev/null
npm run gateway

# 4. 用 gateway-chat.js 发测试消息（stderr 输出 [chat-debug] 诊断日志）
CHAT_INPUT='{"sessionKey":"agent:ceo:test","message":"测试消息"}' node ui/scripts/gateway-chat.js

# 5. 测试完毕后恢复 npm registry 版本
rm /Users/yuanwu/workspace/agent-factory-workspace/node_modules/openclaw
npm install
```

**关键注意：**
- 使用 `ln -s` 手动 symlink，不要用 `npm link`（会导致 `ws` 等依赖丢失）
- `npm install` 会覆盖 symlink，恢复为 npm registry 版本
- 验证 symlink 是否生效：`node -e "console.log(require.resolve('openclaw'))"`，应指向本地源码路径
