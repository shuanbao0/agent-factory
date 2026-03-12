<p align="center">
  <img src="docs/img/pixel-office.png" alt="Agent Factory - 像素办公室" width="800" />
</p>

<h1 align="center">Agent Factory</h1>

<p align="center">
  <strong>一个人 + Agent Factory = 一家完整的 AI 公司</strong>
</p>

<p align="center">
  自包含的多 Agent 协作平台，内置 OpenClaw 引擎，开箱即用。<br/>
  让一个人拥有一整个团队的战斗力。
</p>

<p align="center">
  <a href="https://github.com/shuanbao0/agent-factory/releases"><img src="https://img.shields.io/github/v/release/shuanbao0/agent-factory?style=flat-square&color=blue" alt="Release" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/shuanbao0/agent-factory?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen?style=flat-square" alt="Node" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform" />
</p>

<p align="center">
  <a href="./README.md">English</a> | 中文
</p>

<p align="center">
  <img src="docs/img/demo.gif" alt="Demo" width="800" />
</p>

---

## 为什么选择 Agent Factory？

你不需要招一个团队，你需要 Agent Factory。

Agent Factory 让**一个人**拥有一整家公司的能力 —— PM、研究员、设计师、前后端工程师、测试、市场、销售、法务、财务 —— 全部以自主 AI Agent 运行，彼此协作、沟通，产出真实交付物。

- 给一句需求，整个团队自动运转
- Agent 自动分解任务、分配角色、并行执行
- 产出真实制品：PRD、设计稿、代码、测试报告、营销文案
- CEO 驱动的 Autopilot —— 无需人工协调
- **64 个预置角色模板**，覆盖开发、商务、内容、创意、量化团队

## 界面展示

<table>
  <tr>
    <td align="center"><b>仪表盘</b></td>
    <td align="center"><b>智能体列表</b></td>
  </tr>
  <tr>
    <td><img src="docs/img/dashboard.png" alt="仪表盘" width="400" /></td>
    <td><img src="docs/img/agents-list.png" alt="智能体列表" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>像素办公室</b></td>
    <td align="center"><b>任务面板</b></td>
  </tr>
  <tr>
    <td><img src="docs/img/pixel-office.png" alt="像素办公室" width="400" /></td>
    <td><img src="docs/img/task-board.png" alt="任务面板" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>项目进度</b></td>
    <td align="center"><b>消息中心</b></td>
  </tr>
  <tr>
    <td><img src="docs/img/project-progress.png" alt="项目进度" width="400" /></td>
    <td><img src="docs/img/message-center.png" alt="消息中心" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>工作区</b></td>
    <td align="center"><b>技能商店</b></td>
  </tr>
  <tr>
    <td><img src="docs/img/workspaces.png" alt="工作区" width="400" /></td>
    <td><img src="docs/img/skill-store.png" alt="技能商店" width="400" /></td>
  </tr>
  <tr>
    <td align="center"><b>自动驾驶 - 使命</b></td>
    <td align="center"><b>日志与监控</b></td>
  </tr>
  <tr>
    <td><img src="docs/img/autopilot-mission.png" alt="自动驾驶 - 使命" width="400" /></td>
    <td><img src="docs/img/logs-monitor.png" alt="日志与监控" width="400" /></td>
  </tr>
</table>

## 特性

- **64 个内置 Agent 模板** —— CEO、PM、设计师、前端、后端、测试、市场、法务、CFO、小说策划、动画导演、量化研究员等
- **Autopilot 模式** —— CEO 驱动的自动任务分解与并行执行
- **内置 OpenClaw 引擎** —— 无需外部运行时，完全自包含
- **Dashboard 控制台** —— 实时监控，像素风办公室可视化
- **多供应商 LLM 支持** —— Anthropic、OpenAI、DeepSeek、MiniMax 等 15+ 供应商
- **技能商店** —— 通过 ClawHub 市场扩展能力
- **Agent 通信矩阵** —— N×N 权限控制的 Agent 间消息传递
- **项目管理** —— 多项目进度跟踪与流水线视图
- **任务面板** —— 看板式任务管理，支持优先级与状态
- **记忆与上下文** —— 持久化记忆，支持长期项目

## 快速开始

### 一键安装（推荐）

```bash
curl -fsSL https://raw.githubusercontent.com/shuanbao0/agent-factory/main/scripts/install.sh | bash
```

安装脚本会自动完成：
- 检测并安装 Node.js（通过 nvm）
- 从 GitHub Releases 下载最新版本
- 安装所有依赖
- 引导你配置 API Key

> **CI/CD 环境？** 使用非交互模式：`curl -fsSL ... | bash -s -- --no-prompt --api-key sk-ant-xxx`

### 手动安装

```bash
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install          # 安装内置 OpenClaw 引擎 + 依赖
cp .env.example .env # 配置 API Key
# 编辑 .env: ANTHROPIC_API_KEY=sk-ant-...

npm start            # 启动 Agent Factory（Dashboard + Gateway）
```

打开 `http://localhost:3100` 访问 Dashboard。

### 环境要求

- Node.js >= 22.0.0
- 至少一个 LLM 供应商 API Key（推荐 Anthropic）

## Agent 角色

### 开发团队
| Agent | 职责 |
|-------|------|
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

### 量化团队
| Agent | 职责 |
|-------|------|
| Quant Chief | 量化研究统筹 |
| Quant Researcher | 策略研究与回测 |
| Quant Developer | 交易系统开发 |
| Risk Manager | 风险分析与控制 |

> 查看全部 64 个模板：`templates/builtin/` 目录

## 架构

```
┌─────────────────────────────────────────────┐
│      Dashboard UI (Next.js, 端口 3100)       │
│   暗色主题 │ 中英双语 │ 像素办公室             │
├─────────────────────────────────────────────┤
│              Agent Factory                  │
│  ├── 64 个 Agent 角色模板                    │
│  ├── CEO 驱动的 Autopilot                    │
│  ├── 技能系统（ClawHub）                      │
│  ├── 通信矩阵                                │
│  ├── 任务与项目管理                           │
│  └── 共享项目工作区                           │
├─────────────────────────────────────────────┤
│     内置 OpenClaw 引擎（端口 19100）          │
│  ├── LLM 路由（多供应商）                     │
│  ├── 工具系统（exec/browser/search）          │
│  └── 会话与记忆管理                           │
└─────────────────────────────────────────────┘
```

## 使用场景

### 独立开发者 / Indie Hacker
给 Agent Factory 一个产品创意 —— 它自动调研市场、撰写 PRD、设计 UI、编写代码、执行测试。你负责审核和发布。

### 内容创作者
搭建网文写作团队或动画制作流水线。Agent 处理剧情、世界观、角色设计、章节起草，你负责把控方向。

### 一人企业
运行市场分析、生成商业计划、创作营销文案、管理合规事务 —— 全部通过拥有专业知识的 AI Agent 完成。

### 量化交易
构建量化研究工作流，专属 Agent 负责市场分析、策略开发、回测验证和风险管理。

## 配置

编辑 `.env`：

```bash
# 必填：至少一个供应商 API Key
ANTHROPIC_API_KEY=sk-ant-...

# 可选：额外供应商
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...
```

## CLI 命令

```bash
agent-factory start     # 启动 Dashboard + Gateway
agent-factory stop      # 停止所有服务
agent-factory status    # 查看运行状态
agent-factory update    # 升级到最新版本
agent-factory logs      # 查看实时日志
agent-factory doctor    # 检查环境健康状况
```

## Star History

<a href="https://star-history.com/#shuanbao0/agent-factory&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=shuanbao0/agent-factory&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=shuanbao0/agent-factory&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=shuanbao0/agent-factory&type=Date" />
 </picture>
</a>

## 参与贡献

查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解贡献指南。

## 许可证

[GPL-3.0](./LICENSE) | 第三方依赖：[THIRD-PARTY-LICENSES](./THIRD-PARTY-LICENSES)
