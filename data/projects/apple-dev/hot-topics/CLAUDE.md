# Hot Topics — 项目开发指南 (CLAUDE.md)

> 面向 AI 编码助手的上下文文件。阅读本文件后即可理解项目结构和开发规范。

---

## 项目简介

**Hot Topics** — 聚合全网热榜的 iOS 原生 App，数据来源 tophubdata.com API，参考 tophub.today 产品形态。覆盖知乎、微博、B站、抖音、GitHub、36氪、少数派、虎扑、掘金、V2EX 等 12 个主流平台。

- **Bundle ID**: `com.hotapp.hottopics`
- **App Group**: `group.com.hotapp.hottopics`（主 App + Widget 共享 SwiftData）
- **最低部署**: iOS 17.0
- **Swift**: 6.0（SWIFT_STRICT_CONCURRENCY=complete）

---

## 技术栈

| 层 | 技术 |
|----|------|
| UI | SwiftUI（@Observable，非 Combine）|
| 持久化 | SwiftData（TTL 缓存 + 收藏）|
| 网络 | URLSession + async/await |
| Widget | WidgetKit（Small/Medium/LockScreen）|
| 构建 | XcodeGen（project.yml）+ SwiftLint |
| 测试 | Swift Testing（@Suite + @Test + #expect）|

**零第三方依赖原则**：不引入 Alamofire、Kingfisher 等第三方库。

---

## 架构（Clean Architecture 四层）

```
Presentation ──▶ Domain ◀── Infrastructure
     ↑              ↑
     └──── App ─────┘
```

| 层 | 职责 | 禁止导入 |
|----|------|---------|
| **Domain** | 业务模型（纯 Swift 值类型）+ Protocol + UseCase | SwiftUI, SwiftData |
| **Infrastructure** | TophubAPIClient + SwiftData @Model + Repository 实现 | SwiftUI |
| **Presentation** | SwiftUI View + @Observable ViewModel（只注入 UseCase）| SwiftData |
| **App** | HotTopicsApp 入口 + AppDependencies DI 容器 | — |

### Domain 模型
- `HotItem` — 热榜条目（rank/title/url/hotValue/extra/platformId/cachedAt/expiresAt）
- `Platform` — 平台（id/name/hashId/category），含静态列表 `Platform.all`
- `HotCategory` — 7 个分类枚举（general/tech/entertainment/community/finance/dev/ai）
- `FavoriteItem` — 收藏条目（独立存储，不依赖缓存）

### Repository Protocols
- `HotListRepository` — fetchFromNetwork / getValidCached / getAllCached / save / purgeExpired
- `FavoritesRepository` — add / remove / markAsRead / getAll / contains

### UseCases
- `FetchHotListUseCase` — 缓存优先，TTL 过期走网络
- `GetCachedHotListUseCase` — 仅读缓存（Widget 用），返回 (items, isStale)
- `ManageFavoritesUseCase` — 收藏 CRUD

---

## 目录结构

```
hot-topics/
├── CLAUDE.md               ← 本文件
├── project.yml             ← XcodeGen 配置
├── .swiftlint.yml          ← SwiftLint 规则
├── src/
│   ├── App/
│   │   ├── HotTopicsApp.swift
│   │   └── AppDependencies.swift
│   ├── Domain/
│   │   ├── Models/         ← HotItem, Platform, HotCategory, FavoriteItem, HotTopicsError
│   │   ├── Protocols/      ← HotListRepository, FavoritesRepository
│   │   └── UseCases/       ← FetchHotListUseCase, GetCachedHotListUseCase, ManageFavoritesUseCase
│   ├── Infrastructure/
│   │   ├── API/            ← TophubAPIClient, TophubEndpoint
│   │   └── Persistence/    ← @Model entities, Repositories, PlatformSeeds
│   ├── Presentation/
│   │   ├── Home/           ← HomeView, HotListView, HotListViewModel, HotItemRowView
│   │   ├── Category/       ← CategoryView, PlatformDetailView
│   │   ├── Favorites/      ← FavoritesView, FavoritesViewModel
│   │   ├── Settings/       ← SettingsView
│   │   └── Shared/         ← PlatformBadge, HeatValueLabel, EmptyStateView
│   └── WidgetExtension/    ← HotTopicsWidget, Entry, Provider
├── tests/
│   ├── Domain/             ← UseCase 单元测试
│   └── Infrastructure/     ← Repository + APIClient 测试
├── assets/                 ← App Icon, preview assets
├── design/                 ← 设计稿
├── docs/
│   ├── 01-需求阶段/        ← SAD, LLD, 数据库设计, PLAN
│   └── ...
└── scripts/
```

---

## tophubdata.com API

**Base URL**: `https://api.tophubdata.com`

**认证**: `Authorization: Bearer <api_key>`（在 SettingsView 中设置，存 Keychain）

| 端点 | 路径 | 说明 |
|------|------|------|
| 获取所有来源 | `GET /nodes` | 返回所有热榜来源（含 hashid）|
| 获取实时热榜 | `GET /nodes/{hashid}` | 返回指定来源当前 Top N |
| 获取历史热榜 | `GET /nodes/{hashid}/historys/{date}` | 日期格式 `2023-01-01` |

**响应格式**:
```json
{
  "error": false,
  "status": 200,
  "data": {
    "hashid": "mproPpoq6O",
    "name": "知乎",
    "display": "热榜",
    "items": [
      { "title": "...", "url": "...", "description": "...", "thumbnail": "...", "extra": "455 万热度" }
    ]
  }
}
```

**已知 hashid**（注册后通过 `/nodes` 补全其余）:
- 知乎: `mproPpoq6O`
- 微博: `KqndgxeLl9`
- B站: `yx4wpANe5b`

---

## 构建命令

```bash
# 生成 Xcode 项目
xcodegen generate

# 构建（不需要签名）
xcodebuild \
  -scheme HotTopics \
  -destination "platform=iOS Simulator,name=iPhone 16" \
  build \
  CODE_SIGNING_ALLOWED=NO \
  2>&1 | grep -E "error:|warning:|BUILD"

# 运行测试
xcodebuild \
  -scheme HotTopics \
  -destination "platform=iOS Simulator,name=iPhone 16" \
  test \
  CODE_SIGNING_ALLOWED=NO \
  2>&1 | tail -30

# SwiftLint
swiftlint lint --config .swiftlint.yml src/
```

---

## 编码规范

### 文件组织

```swift
// MARK: - TypeName

@Observable @MainActor
final class HotListViewModel {

    // MARK: - State
    var hotItems: [HotItem] = []

    // MARK: - Computed Properties
    var hasData: Bool { !hotItems.isEmpty }

    // MARK: - Dependencies
    private let fetchUseCase: FetchHotListUseCase

    // MARK: - Init
    init(fetchUseCase: FetchHotListUseCase) { ... }

    // MARK: - Actions
    func onAppear() async { ... }

    // MARK: - Private
    private func reset() { ... }
}
```

### 关键约束

| 约束 | 规则 |
|------|------|
| 文件长度 | ≤300 行（SwiftLint 强制）|
| 函数长度 | ≤60 行 |
| 行宽 | ≤120 字符 |
| Domain 层 | 禁止 `import SwiftUI`、`import SwiftData` |
| ViewModel | 只注入 UseCase，不直接注入 Repository |
| SwiftData 关系 | `@Relationship` 必须 Optional |
| 并发 | ViewModel `@MainActor`，API `actor`，UseCase `Sendable struct` |
| 测试框架 | Swift Testing（`@Suite` / `@Test` / `#expect`，禁用 XCTest）|
| 第三方库 | 禁止引入 |

### SwiftData 注意事项

```swift
// ✅ Correct — @Relationship 必须 Optional
@Relationship(deleteRule: .nullify) var platform: PlatformEntity?

// ❌ Wrong — 非 Optional 会导致 CloudKit 同步失败
@Relationship var platform: PlatformEntity  // 错误！

// ✅ #Predicate 查询有效缓存
let predicate = #Predicate<HotItemEntity> { item in
    item.platformId == platformId && item.expiresAt > Date()
}
```

### Widget 数据共享

```swift
// App Group Container（主 App 写入，Widget 读取）
let groupURL = FileManager.default
    .containerURL(forSecurityApplicationGroupIdentifier: "group.com.hotapp.hottopics")!
    .appending(path: "hottopics.sqlite")
let config = ModelConfiguration(schema: schema, url: groupURL)
```

---

## 测试规范

```swift
// 使用 Swift Testing
@Suite("FetchHotListUseCase Tests")
@MainActor
struct FetchHotListUseCaseTests {
    let mockRepo = MockHotListRepository()
    var sut: FetchHotListUseCase { FetchHotListUseCase(repository: mockRepo) }

    @Test("缓存有效时不触发网络请求")
    func test_execute_validCache_returnsCache() async throws {
        // Arrange
        mockRepo.validCachedItems = [HotItem.stub()]

        // Act
        let result = try await sut.execute(platform: .zhihu)

        // Assert
        #expect(result.count == 1)
        #expect(mockRepo.fetchFromNetworkCallCount == 0)
    }
}
```

---

## 常见问题

**Q: Widget 取不到数据？**
检查：1) `group.com.hotapp.hottopics` App Group 在两个 target 的 Entitlements 中都已启用；2) ModelContainer 使用了 App Group URL 路径。

**Q: SwiftData #Predicate 编译报错？**
`#Predicate` 只支持简单类型比较，复杂逻辑拆成多个 predicate 或在内存中过滤。

**Q: Swift 6 Sendable 报错？**
- ViewModel：加 `@MainActor` + `@Observable`
- UseCase：无状态 `struct` + `Sendable`
- API Client：`actor` 隔离
- Mock 类：测试用 `@unchecked Sendable`（安全，单线程测试环境）

**Q: 如何添加新平台？**
1. 注册 tophubdata.com，通过 `/nodes` 获取 hashid
2. 在 `Platform.all` 中补充 hashId 字段
3. 在 `PlatformSeeds.swift` 中更新 seed 数据
4. 无需改其他代码（数据驱动）

---

## 开发进度

### 已完成

| 阶段 | 状态 | 提交 | 日期 |
|------|------|------|------|
| 项目初始化 | ✅ | commit 350d586 | 2026-03-29 |
| Domain 层 | ✅ | 完成（HotCategory/Platform/HotItem/FavoriteItem/Protocols/UseCases） | — |
| Infrastructure 层 | ✅ | 完成（TophubAPIClient/SwiftDataRepositories） | — |
| Presentation 层骨架 | ✅ | 完成（Home/Category/Favorites/PlatformDetail） | — |
| Sprint 1 | ✅ | 78@Test PASS, 89/100 | 2026-03-29 |
| Sprint 2 | ✅ | 105@Test PASS, 06f214e | 2026-03-29 |
| Sprint 3 | ✅ | 127@Test PASS, 0e2d5d5 | 2026-03-29 |

### 当前状态
**v1.0 正式版** — Sprint 3 已完成，待 App Store 提交

| Sprint | 测试 | Commit |
|--------|------|--------|
| Sprint 1 | 78 @Test ✅ | 350d586 |
| Sprint 2 | 105 @Test ✅ | 06f214e |
| Sprint 3 | 127 @Test ✅ | 0e2d5d5 |

### 测试基线
- **v1.0 总量**: 127 @Test

---

## 文档索引

| 文档 | 路径 | 说明 |
|------|------|------|
| 开发执行计划 | docs/03-开发阶段/00-开发执行计划(PLAN).md | Sprint 分解、SP 估算、退出条件 |
| 需求分析 | docs/01-需求阶段/ | SAD、用户故事 |
| 系统设计 | docs/02-设计阶段/ | LLD、数据库设计 |
| 测试报告 | docs/04-测试阶段/ | 测试用例、缺陷记录 |
| 发布文档 | docs/05-发布阶段/ | App Store 上架、版本说明 |
