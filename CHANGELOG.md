# Changelog / 更新日志

All notable changes to this project will be documented in this file.

本文件记录本项目的所有重要变更。

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

格式基于 [Keep a Changelog](https://keepachangelog.com/)，本项目遵循[语义化版本](https://semver.org/)。

## [0.2.4] - 2026-03-04

### Fixed / 修复

- Fix release tarball excluding `ui/src/app/agents/` and `ui/src/app/projects/` due to overly broad `--exclude` patterns / 修复发布包误排除 UI 路由文件导致智能体等页面 404 的问题

## [0.2.3] - 2026-03-04

### Changed / 变更

- Remove interactive API key prompts from install script; configure via Dashboard Settings instead / 移除安装脚本中的 API 密钥交互提示，改为通过 Dashboard 设置页面配置
- Auto-start services in background after installation / 安装完成后后台自动启动服务，不阻塞终端

### Fixed / 修复

- Fix install script silently exiting at Step 4/6 due to `((var++))` returning exit code 1 under `set -e` / 修复安装脚本在 Step 4/6 静默退出的问题（`set -e` 下 `((var++))` 初始值为 0 时返回非零退出码）

## [0.2.0] - 2026-03-02

### Added / 新增

- 52 built-in agent templates covering development, business, content, and creative teams / 52 个内置 Agent 模板，覆盖开发、商务、内容和创意团队
- DAG-based orchestration engine for multi-agent task execution / 基于 DAG 的编排引擎用于多 Agent 任务执行
- Dashboard UI with pixel-art office visualization / 像素风办公室可视化控制台
- Agent communication matrix with N×N permission control / N×N 权限控制的 Agent 通信矩阵
- Autopilot mode with CEO-driven autonomous loop / CEO 驱动的 Autopilot 自动运营模式
- Multi-provider LLM support (Anthropic, OpenAI, DeepSeek, MiniMax, 15+) / 多供应商 LLM 支持
- Skill system with extensible modules / 可扩展的技能系统
- Built-in OpenClaw engine — fully self-contained runtime / 内置 OpenClaw 引擎 —— 完全自包含运行时
- Vector-based semantic memory for long-running projects / 基于向量的语义记忆用于长期项目
- Bilingual documentation (English + Chinese) / 中英双语文档
- One-person-company workflow support / 一人公司工作流支持

### Agent Templates / Agent 模板

**Development / 开发**: Orchestrator, PM, Researcher, Product, Designer, Frontend, Backend, Tester, Main

**Business / 商务**: CEO, CFO, COO, Marketing, Sales Director, Legal Director, BD, Presales, CSM, PR Specialist, Contract Specialist, Compliance Officer, Service Manager, Growth Ops, Innovation Analyst, Cost Analyst, Brand Director

**Content / 内容**: Content Creator, Content Ops, Writer, Style Editor

**Novel / 网文**: Novel Chief, Novel Researcher, Novel Writer, Plot Architect, Worldbuilder, Reader Analyst, Pacing Designer

**Animation / 动画**: Anime Director, Anime Character Designer, Art Director, Animation Supervisor, Storyboard Artist, Script Adapter, Sound Director, Post Producer, Continuity Manager, Character Designer

**Research / 研究**: Chief Scientist, AI Researcher, Analyst
