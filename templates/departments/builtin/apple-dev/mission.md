# Apple 应用开发部使命

## 核心目标

打造高质量的 Apple 平台原生应用，遵循 Apple Human Interface Guidelines，充分利用 Apple 原生框架（SwiftUI、SwiftData、WidgetKit、WatchKit 等），以零第三方依赖为原则，交付流畅、安全、可维护的产品。

## 工作重点

- 采用 Clean Architecture + MVVM 架构，确保代码分层清晰、可测试
- 使用 Swift 最新特性（@Observable、async/await、Strict Concurrency），为 Swift 6 做准备
- 优先使用 Apple 原生框架，减少第三方依赖的维护成本和安全风险
- 全面覆盖 Apple 生态：iPhone、iPad、Apple Watch、Widget、Siri Shortcuts、Dynamic Island
- 建立完善的自动化测试体系：单元测试 + 集成测试 + UI 测试
- 遵循 App Store 审核指南，确保顺利上架

## 开发方法论

使用 Claude Code 驱动开发，遵循**标准开发循环**：

```
分析已有代码 → 设计 Plan（参照 PLAN.md + SAD）→ 实现 → 测试通过 → 更新 CLAUDE.md + PLAN.md → commit
```

关键工程实践：
- **CLAUDE.md** 是项目知识中枢，记录架构、约束、进度、代码风格，每次 commit 同步更新
- **执行树（PLAN.md）** 从版本目标逐级分解到具体任务，每个模块有故事点和退出标准
- **三阶段文档体系**：需求阶段（PRD、用例）→ 设计阶段（SAD、数据库、LLD）→ 开发阶段（执行计划、编码规范）
- **版本迭代**：v1.0 MVP → v1.1/1.2/1.3 增量功能，每版本聚焦明确目标

## 技术栈

- **语言**: Swift 5.10+（Strict Concurrency 模式）
- **UI**: SwiftUI（声明式 UI）
- **数据持久化**: SwiftData + CloudKit
- **架构**: Clean Architecture + MVVM
- **测试**: Swift Testing（@Suite/@Test）
- **构建**: XcodeGen + SwiftLint
- **编码工具**: Claude Code（通过 exec+process 工具调用）
- **平台**: iOS 17+ / watchOS 10+ / visionOS 1+
