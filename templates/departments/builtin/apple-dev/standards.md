# Apple 应用开发部执行标准

## 标准开发循环（每个功能阶段必须遵循）

```
1. 详细分析已有代码的调用流程
2. 设计 plan（保证代码简洁、符合逻辑、使用对应设计模式）
   - 参照 docs/03-开发阶段/00-开发执行计划(PLAN).md
   - 参照 docs/02-设计阶段/01-系统架构设计(SAD).md
3. 实现 plan
4. 保证测试通过
5. 更新 CLAUDE.md 和 PLAN.md
6. commit
```

**每个功能先设计 Plan 再实现**，绝不跳过分析和设计直接编码。

## 七条开发原则（贯穿全程）

1. **每个功能先设计 Plan 再实现** — 分析已有代码 → 设计方案 → 实现 → 测试 → 更新文档
2. **严格遵循架构分层** — Domain（纯 Swift）→ Infrastructure（框架实现）→ Presentation（UI）
3. **测试驱动** — 每个阶段附带单元测试，保持测试全部通过
4. **设计模式驱动** — Repository、Facade、Strategy、Chain of Responsibility、MVVM 等
5. **文档同步更新** — 每次 commit 前更新 CLAUDE.md 和 PLAN.md
6. **零第三方依赖** — 全部使用 Apple 原生框架
7. **持续集成** — 每个功能完成即 commit，保持代码可编译可运行

## 开发流程（执行树模式）

每个版本按**执行树**组织，从顶层功能模块逐级分解到具体任务：

```
版本 vX.Y
├─ 模块 1 [故事点SP]
│  ├─ 子模块 1.1
│  │  ├─ ✅/⬜ 任务 1.1.1 具体描述
│  │  └─ ✅/⬜ 任务 1.1.2 具体描述
│  └─ 验证（退出标准）
│     ├─ ✅/⬜ 编译零 warning
│     ├─ ✅/⬜ N/N 测试通过
│     └─ ✅/⬜ SwiftLint 零违规
├─ 模块 2 [故事点SP]
│  └─ ...
```

**规则：**
- 每个模块有明确的**故事点(SP)**估算
- 每个模块完成后有**退出标准**（编译、测试数、SwiftLint）
- 任务用 ✅/⬜ 标记状态，完成时注明日期和 commit
- 版本间有依赖关系（v1.1 依赖 v1.0 上架）
- 执行树记录在 `docs/03-开发阶段/00-开发执行计划(PLAN).md`

## Sprint 与版本迭代

- **Sprint 周期**：2-3 周，每月一个小版本
- **版本模式**：v1.0 MVP → v1.1/1.2/1.3 增量功能 → 持续迭代
- **每个 Sprint 有退出标准**：编译通过、测试全部通过、SwiftLint 零违规、功能可演示
- **里程碑文档**：记录在 `docs/03-开发阶段/03-项目计划与风险管理.md`

## CLAUDE.md 项目指南

每个项目**必须维护 CLAUDE.md** 作为开发指南单一真相源，包含：

```
CLAUDE.md 必须包含：
├── 项目概览（语言/框架/最低部署/并发模式/构建工具）
├── 常用命令（xcodegen/xcodebuild build/test/swiftlint）
├── 架构图（目录树 + 四层分离说明）
├── 设计模式表（Repository/Facade/Strategy/DI/MVVM/Adapter 等）
├── 依赖注入（AppDependencies 持有的全部 Service 和 Repo 列表）
├── 数据模型（@Model 列表 + 关系 + CloudKit 约束）
├── 关键约束（@MainActor/@Observable/@Bindable 使用规则）
├── 国际化方案（String Catalog + Domain 层 String(localized:)）
├── 新功能文件放置规则（每层放什么）
├── 代码风格（MARK 分段、import 排序、force_unwrapping 禁令）
├── 测试模式（框架选择、隔离方式、Mock 模式、辅助函数）
├── Git 规范（commit message 格式 + scope 枚举）
├── 开发进度（版本列表 + 各阶段状态）
└── 文档索引（docs/ 目录结构）
```

**CLAUDE.md 在以下时机更新：**
- 新增模块/Service/Repository 时
- 架构决策变更时
- 版本阶段完成时（更新进度状态）
- 新增约束或规则时

## 文档体系

项目文档按三阶段组织：

```
docs/
├── 01-需求阶段/
│   ├── 立项文件与可行性报告
│   ├── 需求规格说明书(PRD)
│   └── 用例与用户故事
├── 02-设计阶段/
│   ├── 系统架构设计(SAD)
│   ├── 数据库设计
│   └── 详细设计与接口规范(LLD)
└── 03-开发阶段/
    ├── 开发执行计划(PLAN) — 执行树
    ├── 编码规范
    ├── 变更记录(CHANGELOG)
    ├── 项目计划与风险管理
    └── 上架流程指南
```

**每个阶段有明确的退出标准**，前一阶段文档评审通过后才进入下一阶段。

## 架构规范

- 严格分层：Presentation → Domain → Infrastructure，禁止跨层引用
- Domain 层纯 Swift，禁止导入 SwiftUI/SwiftData/UIKit
- 所有持久化操作通过 Repository 协议抽象，Infrastructure 层实现
- 依赖注入通过 AppDependencies 容器（@Observable @MainActor），禁止直接实例化服务
- ViewModel 仅注入 Service，不直接注入 Repository
- 新增功能必须有对应的 Protocol 定义，便于 Mock 测试

## Swift 编码规范

### 装饰器规则
- `@Observable`：仅用于 ViewModel + AppDependencies + SubscriptionService
- `@Observable` 禁用：RecordingService / StatisticsService / BudgetService / AIService / 所有 Repository
- `@MainActor`：用于 AppDependencies、所有 Service、所有 ViewModel、测试中的 Mock Repo
- `@Bindable`：在 View 中获取 @Observable 对象的 Binding 时必须使用

### 并发
- 全面使用 `async/await`，禁止回调风格和 DispatchGroup
- `SWIFT_STRICT_CONCURRENCY=complete`，所有并发警告视为错误
- View 中用 `.task` modifier 发起异步操作，不在 body 中直接 Task

### 代码组织
- SwiftLint 强制：文件 ≤300 行，函数体 ≤40 行(warn)/≤60 行(error)，行宽 ≤120
- MARK 分段顺序：State → Computed Properties → Dependencies → Init → Actions → Views/Subviews → Private Helpers
- import 按字母排序（sorted_imports 规则）
- 禁止 force unwrap（force_unwrapping opt-in 规则）
- 中文注释，解释"为什么"而非"做什么"
- 颜色存储为 hex 字符串，使用 Color(hex:) 转换

### 命名约定
| 类别 | 模式 | 示例 |
|------|------|------|
| ViewModel | 页面名+ViewModel | `RecordsViewModel` |
| Service | 领域名+Service | `RecordingService` |
| Repo 协议 | 实体名+Repository | `TransactionRepository` |
| Repo 实现 | SwiftData+实体名+Repo | `SwiftDataTransactionRepo` |
| View | 功能名+View/Sheet | `QuickRecordSheet` |
| 错误类型 | 模块名+Error | `AppError` |

### 新功能文件放置
```
纯业务逻辑（Service/Parser）  → Domain/Services/
值类型（模型/枚举）           → Domain/Models/
协议定义                      → Domain/Protocols/
框架封装（Speech/Vision/IAP） → Infrastructure/Apple/
网络通信                      → Infrastructure/Network/
SwiftData 实现               → Infrastructure/Persistence/Repositories/
ViewModel                     → 与对应 View 同目录
View                          → Presentation/对应模块/
共享 UI 组件                  → Presentation/Shared/
```

## 测试标准

- 框架：Swift Testing（@Suite/@Test/#expect），不使用 XCTest
- Repository 测试：`ModelConfiguration(isStoredInMemoryOnly: true)` 内存容器
- Service 测试：Mock Repository 注入，不依赖真实持久化
- ViewModel 测试：Mock Service 注入
- Mock 模式：实现协议，用数组追踪调用（如 `insertedTransactions`）
- 辅助函数：`makeContext()` / `makeSampleData()` 减少样板代码
- 测试命名：`test_<方法名>_<场景>_<预期结果>`
- 覆盖率目标：Service ≥80%、Repository ≥70%、ViewModel ≥60%
- 每个模块退出标准必须注明测试通过数

## 数据模型约束

- 所有 SwiftData @Model 的 relationship 必须 Optional（CloudKit 要求）
- `@Relationship(deleteRule: .nullify)` 用于所有关联
- Widget/Watch 通过 App Group 共享数据，不共享数据库实例
- Category 类型歧义：测试中需要 `private typealias Category = ProjectName.Category`

## Apple 生态集成

- Siri Shortcuts 通过 AppIntent 协议实现
- 所有用户可见文案使用 String Catalog（.xcstrings）实现国际化
- Domain 层国际化使用 `String(localized: "...")` (Foundation API)
- 图标优先使用 SF Symbols，自定义图标使用矢量格式
- 深色模式全面支持，所有 UI 组件都必须在深色/浅色下可用

## 上架流程

- 使用 XcodeGen 管理项目配置，project.yml 为单一真相源
- Archive 前必须通过：完整测试 + SwiftLint 检查 + 无占位符文本
- 版本号在 project.yml 中统一管理（MARKETING_VERSION + CURRENT_PROJECT_VERSION）
- 隐私政策和使用条款 URL 必须有效且可访问
- App Store 截图覆盖所有支持的设备尺寸和语言
- 提交前自查清单：签名配置、Entitlements、隐私描述、年龄分级

## Git 规范

```
feat(module): 描述      # 新功能
fix(module): 描述       # Bug 修复
refactor(module): 描述  # 重构
test(module): 描述      # 测试
docs(module): 描述      # 文档
chore(module): 描述     # 构建/工具
perf(module): 描述      # 性能优化
style: 描述             # 代码格式

scope 枚举: record, stats, budget, ai, book, account, widget, store, sync, ui, model
```
