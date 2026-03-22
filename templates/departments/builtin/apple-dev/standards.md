# Apple 应用开发部执行标准

## 架构规范
- 严格分层：Presentation → Domain → Infrastructure，禁止跨层引用
- Domain 层纯 Swift，禁止导入 SwiftUI/SwiftData/UIKit
- 所有持久化操作通过 Repository 协议抽象，Infrastructure 层实现
- 依赖注入通过 AppDependencies 容器，禁止直接实例化服务
- 新增功能必须有对应的 Protocol 定义，便于 Mock 测试

## Swift 规范
- `@Observable` 用于 ViewModel 和需要状态发布的 Service
- `@MainActor` 用于 ViewModel 和所有 UI 状态修改的 Service
- 全面使用 `async/await`，禁止回调风格和 DispatchGroup
- `SWIFT_STRICT_CONCURRENCY=complete`，所有并发警告视为错误
- 禁止 force unwrap（除非有 swiftlint disable 注释说明原因）

## 代码质量
- SwiftLint 检查必须通过：文件 ≤300 行，函数 ≤60 行，行宽 ≤120
- MARK 注释分段：State / Dependencies / Init / Actions / Views / Private Helpers
- 命名自解释：ViewModel 后缀 `ViewModel`，Service 后缀 `Service`，Repo 后缀 `Repo`
- 所有 SwiftData @Model 的 relationship 必须 Optional（CloudKit 约束）

## 测试标准
- 使用 Swift Testing 框架（@Suite/@Test），不使用 XCTest
- Repository 测试使用 `ModelConfiguration(isStoredInMemoryOnly: true)`
- Service 测试通过 Mock Repository 注入，不依赖真实持久化
- ViewModel 测试通过 Mock Service 注入
- 新功能必须有对应的单元测试，核心流程必须有集成测试

## Apple 生态集成
- Widget/Watch 通过 App Group 共享数据，不共享数据库实例
- Siri Shortcuts 通过 AppIntent 协议实现
- 所有用户可见文案使用 String Catalog（.xcstrings）实现国际化
- 图标优先使用 SF Symbols，自定义图标使用矢量格式
- 深色模式全面支持，所有 UI 组件都必须在深色/浅色下可用

## 上架流程
- 使用 XcodeGen 管理项目配置，project.yml 为单一真相源
- Archive 前必须通过完整测试 + SwiftLint 检查
- 版本号在 project.yml 中统一管理
- 隐私政策和使用条款 URL 必须有效且可访问
- App Store 截图覆盖所有支持的设备尺寸和语言
