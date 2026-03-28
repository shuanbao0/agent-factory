# PLAN.md — Hot Topics v1.0 执行树

> 版本: v1.1（更新：项目初始化已完成，修正 API 规范）
> 日期: 2026-03-29
> 项目: apple-dev/hot-topics
> 总 SP: ~40 SP / 2 Sprint

---

## Sprint 1: 基础架构 + 核心功能 (20 SP)

**目标**: 可运行的 App，能展示热榜数据（含本地缓存）

### 1. 项目初始化 [SP: 2] [状态: ✅ completed — 2026-03-29]
- [x] 创建目录结构（src/ tests/ docs/ assets/）
- [x] 编写 project.yml（主 App + Widget + Tests targets，App Group entitlement）
- [x] xcodegen generate + git init + 初始 commit
- [x] 编写 CLAUDE.md / SAD.md / 数据库设计.md / LLD.md / PLAN.md

### 2. Domain 层 [SP: 4] [状态: pending]
- [ ] `HotCategory` enum（7分类 + sfSymbol）[SP: 0.5]
- [ ] `Platform` struct（含 `Platform.all` 静态列表 12 个平台）[SP: 1]
- [ ] `HotItem` struct（含 `isExpired` / `formattedHotValue`）[SP: 1]
- [ ] `FavoriteItem` struct（含 `init(from:platformName:)`）[SP: 0.5]
- [ ] `HotTopicsError` enum [SP: 0.5]
- [ ] `HotListRepository` + `FavoritesRepository` protocols [SP: 0.5]
- [ ] `FetchHotListUseCase`（缓存优先 + forceRefresh）[SP: 0.5]
- [ ] `GetCachedHotListUseCase`（含离线降级，返回 isStale）[SP: 0.5]
- [ ] `ManageFavoritesUseCase`（add/remove/markAsRead/isFavorited）[SP: 0.5]
- [ ] Domain 层单元测试（UseCase 逻辑 Mock 注入）[SP: 1]

### 3. Infrastructure 层 [SP: 6] [状态: pending]
- [ ] `HotItemEntity` @Model（id/title/url/description/thumbnail/hotValue/extra/rank/platformId/cachedAt/expiresAt）[SP: 1]
- [ ] `PlatformEntity` @Model（id/name/displayName/iconName/category/hashId/lastFetchAt）[SP: 0.5]
- [ ] `FavoriteItemEntity` @Model（独立存储，不关联缓存）[SP: 0.5]
- [ ] `PlatformSeeds.swift`（12 个平台初始数据）[SP: 0.5]
- [ ] `TophubEndpoint` enum（nodes/nodeDetail/nodeHistory/search）[SP: 0.5]
- [ ] `TophubAPIClient` actor（Bearer Token 认证 + DTOs + 错误映射）[SP: 2]
- [ ] `SwiftDataHotListRepository`（fetchFromNetwork/getValidCached/getAllCached/save/purgeExpired/seed）[SP: 1.5]
- [ ] `SwiftDataFavoritesRepository`（add/remove/markAsRead/getAll/contains）[SP: 0.5]
- [ ] Infrastructure 单元测试（MockAPIClient + 内存 ModelContext）[SP: 1.5]

### 4. Presentation 层 MVP [SP: 5] [状态: pending]
- [ ] `HotItemRowView`（排名 + 标题 + extra + 平台标签 + 时间）[SP: 1]
- [ ] `PlatformBadge` / `HeatValueLabel` / `EmptyStateView` 共享组件 [SP: 1]
- [ ] `HotListViewModel`（@Observable + 加载/刷新 + stale 状态 + 收藏）[SP: 1.5]
- [ ] `HotListView`（List + pull-to-refresh + 错误 banner + NavigationLink）[SP: 1.5]
- [ ] ViewModel 单元测试 [SP: 1]

### 5. App 层 + 集成 [SP: 3] [状态: pending]
- [ ] `AppDependencies`（DI 容器 + ModelContainer App Group 配置）[SP: 1]
- [ ] `HotTopicsApp` 入口（modelContainer + scenePhase 清理缓存）[SP: 0.5]
- [ ] `HomeView`（TabView 4 个 Tab）[SP: 0.5]
- [ ] 集成测试（端到端 FetchUseCase 验证）[SP: 1]

### Sprint 1 退出条件
- [ ] `xcodebuild` BUILD SUCCEEDED（iPhone 17 模拟器）
- [ ] SwiftLint 0 violations
- [ ] 全量测试通过（≥30 个 @Test）
- [ ] 首页可展示知乎/微博热榜（真机或模拟器 + 有效 API Key）
- [ ] 缓存有效：重启后 15 分钟内无网络请求

---

## Sprint 2: 完善功能 + Widget + App Store (20 SP)

**目标**: 完整产品体验 + WidgetKit + App Store 准备

### 6. 分类 + 收藏页 [SP: 4] [状态: pending]
- [ ] `CategoryView`（平台分组 + PlatformFilter 筛选器）[SP: 1.5]
- [ ] `PlatformDetailView`（单平台完整热榜 + SafariView 跳转）[SP: 1]
- [ ] `FavoritesView`（列表 + 全部/未读/已读筛选 + 滑动删除）[SP: 1]
- [ ] `FavoritesViewModel` [SP: 0.5]

### 7. 交互完善 [SP: 4] [状态: pending]
- [ ] 骨架屏加载 `SkeletonRowView` [SP: 1]
- [ ] 缓存时间戳展示（"X 分钟前更新" Banner）[SP: 0.5]
- [ ] 错误 Banner + 重试按钮 [SP: 0.5]
- [ ] `SFSafariViewController` 跳转原文 [SP: 0.5]
- [ ] `ShareLink` 分享条目 [SP: 0.5]
- [ ] 收藏动画（spring scale）[SP: 0.5]
- [ ] `SettingsView`（API Key 设置 + 缓存清理 + 关于）[SP: 0.5]

### 8. Widget [SP: 5] [状态: pending]
- [ ] `HotTopicsWidgetEntry` + `HotTopicsWidgetProvider`（Timeline 15min）[SP: 1.5]
- [ ] `SmallWidgetView`（Top 3 条目）[SP: 1]
- [ ] `MediumWidgetView`（Top 5 条目）[SP: 1]
- [ ] `AccessoryRectangularView`（锁屏 Widget）[SP: 1]
- [ ] App Group 数据共享验证 [SP: 0.5]

### 9. 测试完善 [SP: 4] [状态: pending]
- [ ] `TophubAPIClient` 集成测试（URLProtocol Mock）[SP: 1.5]
- [ ] TTL 边界条件测试（刚好到期 / 已过期 / 离线降级）[SP: 1]
- [ ] Widget Timeline 测试 [SP: 1]
- [ ] FavoritesUseCase 完整测试 [SP: 0.5]

### 10. App Store 准备 [SP: 3] [状态: pending]
- [ ] App 图标（1024×1024 + 各尺寸）[SP: 1]
- [ ] `Localizable.xcstrings`（简中/英文）[SP: 0.5]
- [ ] Privacy Manifest（NSPrivacyAccessedAPITypes）[SP: 0.5]
- [ ] 版本 1.0.0 / Build 1 设置 [SP: 0.5]
- [ ] TestFlight 上传 + 内测 [SP: 0.5]

### Sprint 2 退出条件
- [ ] BUILD SUCCEEDED + **ARCHIVE SUCCEEDED**
- [ ] SwiftLint 0 violations
- [ ] 全量测试通过（≥80 个 @Test）
- [ ] Widget 在主屏幕正常展示热榜
- [ ] App Store Connect 元数据填写完成

---

## 平台优先级

| 优先级 | 平台 | Sprint |
|--------|------|--------|
| P0 | 知乎、微博 | Sprint 1 |
| P1 | B站、GitHub、36氪、少数派、掘金 | Sprint 1 |
| P2 | 抖音、虎扑、V2EX、百度、澎湃 | Sprint 2 |

> ⚠️ P0/P1 平台的 hashId 已有部分（知乎/微博/B站），其余需注册 tophubdata.com 后补全。

---

## 技术风险

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| tophubdata.com hashId 未知 | 高 | 中 | 注册后调用 `/nodes` 接口获取完整映射 |
| API 响应格式与预期不符 | 中 | 高 | TophubAPIClient 加宽松 Decodable，容忍额外字段 |
| SwiftData iOS 17 已知 bug | 低 | 中 | 保持 ModelContext 主线程，避免跨线程传递 |
| Widget App Group 数据同步问题 | 低 | 中 | 配置 entitlement，先验证 read 再 write |
| App Store 审核因数据来源被拒 | 低 | 高 | 确保遵守各平台 ToS，不爬取会员内容 |
