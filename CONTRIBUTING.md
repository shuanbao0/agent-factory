# Contributing to Agent Factory

# 参与贡献 Agent Factory

---

Thank you for your interest in contributing! Agent Factory is a one-person-company platform, but we welcome community contributions to make it better for everyone.

感谢你对贡献的兴趣！Agent Factory 是一个一人公司平台，但我们欢迎社区贡献，让它对每个人都更好。

## Table of Contents / 目录

- [Code of Conduct / 行为准则](#code-of-conduct--行为准则)
- [How to Contribute / 如何贡献](#how-to-contribute--如何贡献)
- [Development Setup / 开发环境搭建](#development-setup--开发环境搭建)
- [Pull Request Process / PR 流程](#pull-request-process--pr-流程)
- [Coding Standards / 编码规范](#coding-standards--编码规范)
- [Reporting Bugs / 报告 Bug](#reporting-bugs--报告-bug)
- [Suggesting Features / 功能建议](#suggesting-features--功能建议)

## Code of Conduct / 行为准则

This project follows the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold this code.

本项目遵循 [Contributor Covenant 行为准则](./CODE_OF_CONDUCT.md)。参与即表示你同意遵守该准则。

## How to Contribute / 如何贡献

### Reporting Bugs / 报告 Bug

- Search existing issues first to avoid duplicates / 先搜索已有 issue 避免重复
- Use the bug report template / 使用 bug 报告模板
- Include: steps to reproduce, expected behavior, actual behavior, environment info / 包含：复现步骤、期望行为、实际行为、环境信息

### Suggesting Features / 功能建议

- Open an issue with the `feature-request` label / 创建带 `feature-request` 标签的 issue
- Describe the use case and expected behavior / 描述使用场景和期望行为
- Explain why this would benefit one-person-company users / 说明为什么这对一人公司用户有价值

### Contributing Code / 贡献代码

1. Fork the repository / Fork 仓库
2. Create a feature branch / 创建功能分支：`git checkout -b feature/your-feature`
3. Make your changes / 进行修改
4. Test your changes / 测试你的修改
5. Submit a Pull Request / 提交 PR

## Development Setup / 开发环境搭建

### Prerequisites / 前置条件

- Node.js >= 22.0.0
- npm
- At least one LLM API key / 至少一个 LLM API Key

### Setup / 搭建

```bash
git clone https://github.com/shuanbao0/agent-factory.git
cd agent-factory
npm install
cp .env.example .env
# Edit .env with your API key / 编辑 .env 填入你的 API Key
```

### Running / 运行

```bash
npm start            # Start gateway / 启动网关
npm run ui           # Start dashboard / 启动控制台 (separate terminal / 另开终端)
```

### Project Structure / 项目结构

- `templates/builtin/` — Built-in agent templates (add new roles here) / 内置 Agent 模板（在此添加新角色）
- `skills/` — Shared skill modules / 共享技能模块
- `ui/` — Next.js dashboard / 控制台
- `scripts/` — Startup and utility scripts / 启动与工具脚本
- `config/` — Configuration files / 配置文件

## Pull Request Process / PR 流程

1. **Branch naming / 分支命名**: `feature/xxx`, `fix/xxx`, `docs/xxx`
2. **Commit messages / 提交信息**: Clear, concise, in English / 清晰、简洁，使用英文
3. **Description / 描述**: Explain what changed and why / 说明改了什么以及为什么
4. **Testing / 测试**: Verify your changes work / 验证修改可用
5. **Review / 审查**: Maintainers will review and may request changes / 维护者审查后可能要求修改

### What We Look For / 我们关注的

- Code consistency with existing patterns / 代码与现有模式一致
- No unnecessary dependencies / 不引入不必要的依赖
- Clear documentation for new features / 新功能有清晰的文档
- Backward compatibility / 向后兼容性

## Coding Standards / 编码规范

### General / 通用

- Use English for code, comments, and commit messages / 代码、注释和提交信息使用英文
- Documentation can be bilingual (English + Chinese) / 文档可以中英双语
- Keep changes focused and minimal / 修改聚焦且最小化

### JavaScript/TypeScript

- ESM modules (`import/export`) / 使用 ESM 模块
- Use `const` by default, `let` when needed / 默认用 `const`，需要时用 `let`
- Async/await over callbacks / 优先 async/await
- Meaningful variable and function names / 有意义的变量和函数命名

### Agent Templates / Agent 模板

When adding new templates to `templates/builtin/`:

添加新模板到 `templates/builtin/` 时：

- Each template needs: `template.json`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, `SOUL.md`
- 每个模板需要：`template.json`、`AGENTS.md`、`TOOLS.md`、`IDENTITY.md`、`SOUL.md`
- `template.json` must include: `id`, `name`, `description`, `emoji`, `category`, `group`, `defaults`
- Follow existing templates as reference / 参考已有模板的格式

## Reporting Security Issues / 报告安全问题

**Do NOT open public issues for security vulnerabilities.**

**不要为安全漏洞创建公开 issue。**

See [SECURITY.md](./SECURITY.md) for responsible disclosure instructions.

详见 [SECURITY.md](./SECURITY.md) 了解负责任的披露流程。

---

Thank you for helping make Agent Factory better!

感谢你帮助 Agent Factory 变得更好！
