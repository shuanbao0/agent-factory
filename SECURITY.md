# Security Policy

# 安全策略

## Supported Versions / 支持版本

| Version | Supported |
|---------|-----------|
| 0.2.x   | Yes       |
| < 0.2   | No        |

## Reporting a Vulnerability / 报告漏洞

**Please do NOT report security vulnerabilities through public GitHub issues.**

**请不要通过公开的 GitHub issue 报告安全漏洞。**

### How to Report / 如何报告

If you discover a security vulnerability, please report it responsibly:

如果你发现安全漏洞，请负责任地报告：

1. **GitHub Private Vulnerability Reporting**: Use [GitHub's security advisory feature](https://github.com/shuanbao0/agent-factory/security/advisories/new) to privately report the vulnerability.

   **GitHub 私密漏洞报告**：使用 [GitHub 安全公告功能](https://github.com/shuanbao0/agent-factory/security/advisories/new) 私密报告漏洞。

2. **Email**: Send details to the maintainer via GitHub profile contact.

   **邮件**：通过 GitHub 个人资料中的联系方式发送详情给维护者。

### What to Include / 报告内容

Please include:

请包含以下信息：

- Description of the vulnerability / 漏洞描述
- Steps to reproduce / 复现步骤
- Potential impact / 潜在影响
- Suggested fix (if any) / 建议的修复方案（如有）

### Response Timeline / 响应时间

- **Acknowledgment / 确认收到**: Within 48 hours / 48 小时内
- **Initial assessment / 初步评估**: Within 7 days / 7 天内
- **Fix or mitigation / 修复或缓解**: Depends on severity / 取决于严重程度

### Security Considerations / 安全注意事项

When using Agent Factory, keep in mind:

使用 Agent Factory 时，请注意：

- **API Keys**: Never commit `.env` files or API keys to version control. / 永远不要将 `.env` 文件或 API Key 提交到版本控制。
- **Agent Permissions**: Review agent communication matrix permissions before deployment. / 部署前检查 Agent 通信矩阵权限。
- **Tool Execution**: Agents can execute shell commands and access the filesystem. Run in sandboxed environments for untrusted inputs. / Agent 可以执行 shell 命令和访问文件系统。对不受信任的输入请在沙箱环境中运行。
- **Network Access**: Agents may access external APIs and web resources. Configure network policies accordingly. / Agent 可能访问外部 API 和网络资源。请相应配置网络策略。

## Disclosure Policy / 披露策略

We follow a coordinated disclosure process:

我们遵循协调披露流程：

1. Reporter submits vulnerability privately / 报告者私密提交漏洞
2. Maintainers confirm and assess / 维护者确认并评估
3. Fix is developed and tested / 开发并测试修复方案
4. Fix is released with advisory / 发布修复并附带安全公告
5. Public disclosure after fix is available / 修复可用后公开披露

Thank you for helping keep Agent Factory and its users safe.

感谢你帮助保障 Agent Factory 及其用户的安全。
