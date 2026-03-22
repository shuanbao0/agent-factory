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

## 技术栈

- **语言**: Swift 5.10+（Strict Concurrency 模式）
- **UI**: SwiftUI（声明式 UI）
- **数据持久化**: SwiftData + CloudKit
- **架构**: Clean Architecture + MVVM
- **测试**: Swift Testing（@Suite/@Test）
- **构建**: XcodeGen + SwiftLint
- **平台**: iOS 17+ / watchOS 10+ / visionOS 1+
