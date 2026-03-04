<p align="center">
  <h1 align="center">Agent Factory</h1>
  <p align="center">
    <strong>One Person + Agent Factory = A Complete AI Company</strong>
  </p>
  <p align="center">
    Self-contained multi-agent collaboration platform with built-in OpenClaw engine.
    <br />
    Turn a solo creator into a fully staffed AI-powered organization.
  </p>
  <p align="center">
    English | <a href="./README.zh-CN.md">中文</a>
  </p>
</p>

---

## Why Agent Factory?

You don't need to hire a team. You need Agent Factory.

Agent Factory gives **one person** the power of an entire company — PM, researcher, designer, frontend & backend engineers, testers, marketing, sales, legal, finance — all running as autonomous AI agents that collaborate, communicate, and deliver real output.

**The One-Person Company vision:**
- Give a single requirement, get a full team working on it
- Agents auto-decompose tasks, assign roles, and execute in parallel
- Produce real artifacts: PRDs, designs, code, tests, marketing copy
- Built-in orchestration — no manual coordination needed
- 52 pre-built role templates covering dev, business, content, and creative teams

## Features

- **52 Built-in Agent Templates** — CEO, PM, Designer, Frontend, Backend, Tester, Marketing, Legal, CFO, Novel Writer, Anime Director, and more
- **DAG Orchestration** — Intelligent task decomposition and parallel execution
- **Built-in OpenClaw Engine** — No external runtime needed, fully self-contained
- **Dashboard UI** — Real-time monitoring with pixel-art office visualization
- **Multi-Provider LLM Support** — Anthropic, OpenAI, DeepSeek, MiniMax, and 15+ providers
- **Skill System** — Extensible capabilities (summarize, session-logs, project-init, etc.)
- **Agent Communication Matrix** — N×N permission-controlled inter-agent messaging
- **Autopilot Mode** — CEO-driven autonomous operation loop
- **Memory & Context** — Vector-based semantic memory for long-running projects

## Architecture

```
┌─────────────────────────────────────────────┐
│       Dashboard UI (Next.js, port 3100)     │
│   Dark theme │ Bilingual │ Pixel Office     │
├─────────────────────────────────────────────┤
│              Agent Factory                  │
│  ├── 52 Agent Role Templates                │
│  ├── Orchestrator (DAG-based)               │
│  ├── Skill System                           │
│  ├── Communication Matrix                   │
│  └── Shared Project Workspace               │
├─────────────────────────────────────────────┤
│    Built-in OpenClaw Engine (port 19100)    │
│  ├── LLM Router (multi-provider)            │
│  ├── Tool System (exec/browser/search)      │
│  └── Session & Memory Management            │
└─────────────────────────────────────────────┘
```

## Quick Start

### One-Line Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/shuanbao0/agent-factory/main/scripts/install.sh | bash
```

The install script will automatically:
- Install Node.js (via nvm) if not present
- Download the latest release from GitHub
- Install all dependencies
- Guide you through API key configuration

> **CI/CD?** Use non-interactive mode: `curl -fsSL ... | bash -s -- --no-prompt --api-key sk-ant-xxx`

### Manual Install

```bash
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install          # Install built-in OpenClaw engine + dependencies
cp .env.example .env # Configure your API key
# Edit .env: ANTHROPIC_API_KEY=sk-ant-...

npm start            # Start Agent Factory (built-in Gateway on port 19100)
npm run ui           # Start Dashboard (port 3100)
```

No need to install OpenClaw separately — everything is included.

### Requirements

- Node.js >= 22.0.0
- At least one LLM provider API key (Anthropic recommended)

## Agent Roles

### Development Team

| Agent | Role |
|-------|------|
| Orchestrator | Global orchestration, task decomposition, progress coordination |
| PM | Requirements breakdown, task assignment, progress tracking |
| Researcher | Market research, competitive analysis |
| Product | PRD writing, feature definition |
| Designer | UI/UX design, design systems |
| Frontend | Frontend development (React/TypeScript) |
| Backend | Backend development (Node/TypeScript) |
| Tester | Test cases, automated testing |

### Business Team

| Agent | Role |
|-------|------|
| CEO | Strategic decisions, resource allocation |
| CFO | Financial analysis, budget management |
| COO | Operations management |
| Marketing | Go-to-market strategy, content marketing |
| Sales Director | Sales strategy, pipeline management |
| Legal Director | Compliance, contract review |

### Creative Team

| Agent | Role |
|-------|------|
| Novel Chief | Novel project planning and oversight |
| Plot Architect | Story structure and plot design |
| Worldbuilder | World setting and lore creation |
| Anime Director | Animation project direction |
| Character Designer | Character design and visual identity |

> See all 52 templates in the `templates/builtin/` directory.

## Workflow

```
Requirement → PM decomposes → Researcher investigates + Product writes PRD
            → Designer creates mockups → Frontend + Backend develop in parallel
            → Tester validates → Delivery
```

## Project Structure

```
agent-factory/
├── templates/            # Agent role templates
│   ├── builtin/          # 52 built-in templates
│   └── custom/           # Your custom templates
├── agents/               # Runtime agent instances
├── orchestrator/         # Orchestration engine
├── skills/               # Shared skill modules
├── config/               # Configuration files
│   ├── mission.md        # Company mission & operating model
│   ├── departments.json  # Department structure
│   └── base-rules.md     # Base agent rules
├── scripts/              # Startup & utility scripts
├── ui/                   # Dashboard (Next.js)
├── docs/                 # Design documents
├── projects/             # Project outputs
└── workspaces/           # Agent working directories
```

## Configuration

Edit `.env`:

```bash
# Required: At least one provider API key
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Additional providers
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=sk-...

# Optional: Operation mode
# AGENT_FACTORY_MODE=auto|attached|standalone
```

## Use Cases

### Solo Developer / Indie Hacker
Give Agent Factory a product idea — it researches the market, writes a PRD, designs the UI, builds the code, and tests it. You review and ship.

### Content Creator
Spin up a novel-writing team or anime production pipeline. Agents handle plot, worldbuilding, character design, and chapter drafting while you direct.

### Business of One
Run market analysis, generate business plans, create marketing copy, and manage compliance — all through AI agents with specialized expertise.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute.

## License

This project is licensed under the [GPL-3.0 License](./LICENSE).

Third-party dependencies are listed in [THIRD-PARTY-LICENSES](./THIRD-PARTY-LICENSES).
