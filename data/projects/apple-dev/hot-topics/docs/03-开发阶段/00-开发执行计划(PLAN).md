# PLAN.md — Hot Topics v1.0 执行树

> 版本: v1.6（更新：Sprint 3 ✅，v1.0 正式版完成）
> 日期: 2026-03-29
> 项目: apple-dev/hot-topics
> 总 SP: ~40 SP / 3 Sprint

---

## Sprint 1: 基础架构 + 核心功能 (20 SP)

**目标**: 可运行的 App，能展示热榜数据（含本地缓存）

### 1. 项目初始化 [SP: 2] [状态: ✅ completed — 2026-03-29]
- [x] 创建目录结构（src/ tests/ docs/ assets/）
- [x] 编写 project.yml（主 App + Widget + Tests targets，App Group entitlement）
- [x] xcodegen generate + git init + 初始 commit
- [x] 编写 CLAUDE.md / SAD.md / 数据库设计.md / LLD.md / PLAN.md

### 2. Domain 层 [SP: 4] [状态: ✅ completed — 2026-03-29]
- [x] `HotCategory` enum（7分类 + sfSymbol）[SP: 0.5]
- [x] `Platform` struct（含 `Platform.all` 静态列表 12 个平台）[SP: 1]
- [x] `HotItem` struct（含 `isExpired` / `formattedHotValue`）[SP: 1]
- [x] `FavoriteItem` struct（含 `init(from:platformName:)`）[SP: 0.5]
- [x] `HotTopicsError` enum [SP: 0.5]
- [x] `HotListRepository` + `FavoritesRepository` protocols [SP: 0.5]
- [x] `FetchHotListUseCase`（缓存优先 + forceRefresh）[SP: 0.5]
- [x] `GetCachedHotListUseCase`（含离线降级，返回 isStale）[SP: 0.5]
- [x] `ManageFavoritesUseCase`（add/remove/markAsRead/isFavorited）[SP: 0.5]
- [x] Domain 层单元测试（UseCase 逻辑 Mock 注入）[SP: 1]

### 3. Infrastructure 层 [SP: 6] [状态: ✅ completed — 2026-03-29]
- [x] `HotItemEntity` @Model（id/title/url/description/thumbnail/hotValue/extra/rank/platformId/cachedAt/expiresAt）[SP: 1]
- [x] `PlatformEntity` @Model（id/name/displayName/iconName/category/hashId/lastFetchAt）[SP: 0.5]
- [x] `FavoriteItemEntity` @Model（独立存储，不关联缓存）[SP: 0.5]
- [x] `PlatformSeeds.swift`（12 个平台初始数据，通过 seedPlatformsIfNeeded）[SP: 0.5]
- [x] `TophubEndpoint` enum（nodes/nodeDetail/nodeHistory/search）[SP: 0.5]
- [x] `TophubAPIClient` actor（Bearer Token 认证 + DTOs + 错误映射）[SP: 2]
- [x] `SwiftDataHotListRepository`（fetchFromNetwork/getValidCached/getAllCached/save/purgeExpired/seed）[SP: 1.5]
- [x] `SwiftDataFavoritesRepository`（add/remove/markAsRead/getAll/contains）[SP: 0.5]
- [x] Infrastructure 单元测试（MockAPIClient + 内存 ModelContext）[SP: 1.5]

### 4. Presentation 层 MVP [SP: 5] [状态: ✅ completed — 2026-03-29]
- [x] `HotItemRowView`（排名 + 标题 + extra + Safari跳转）[SP: 1]
- [x] `PlatformBadge` / `HeatValueLabel` / `EmptyStateView` / `ErrorBanner` / `SafariView` 共享组件 [SP: 1]
- [x] `HotListViewModel`（@Observable + 加载/刷新 + stale 状态）[SP: 1.5]
- [x] `HotListView`（List + pull-to-refresh + inline ErrorBanner + NavigationLink）[SP: 1.5]
- [x] ViewModel 单元测试 [SP: 1]

### 5. App 层 + 集成 [SP: 3] [状态: ✅ completed — 2026-03-29]
- [x] `AppDependencies`（DI 容器，所有 Service/Repository 注入）[SP: 1]
- [x] `HotTopicsApp` 入口（modelContainer + scenePhase 清理缓存）[SP: 0.5]
- [x] `HomeView`（TabView 4 个 Tab：热榜/分类/收藏/设置）[SP: 0.5]
- [x] 集成测试（FetchHotListUseCase 端到端验证）[SP: 1]

### Sprint 1 退出条件
- [x] `xcodebuild` BUILD SUCCEEDED ✅ 2026-03-29
- [x] SwiftLint 0 violations ✅ 2026-03-29
- [x] 全量测试通过 ✅ 78 @Test PASSED 2026-03-29
- [x] 测试评分 89/100 ✅ 2026-03-29

---

## Sprint 2: 完善功能 + Widget + App Store (20 SP)

**目标**: 完整产品体验 + WidgetKit + App Store 准备
**Commit**: `06f214e`
**状态**: ✅ Sprint 2 已完成

### Sprint 2 执行树

#### 模块1: P0 Bug修复 [2 SP] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 2.1.1 | HomeView sheet 修复（sheet(isPresented:) → sheet(item:)） | 1 | ✅ | 06f214e |
| 2.1.2 | EmptyStateView 完善（新增 onRefresh 回调） | 1 | ✅ | 06f214e |

#### 模块2: Widget Extension [4 SP] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 2.2.1 | `HotTopicsWidgetEntry` + `HotTopicsWidgetProvider`（Timeline 15min） | 1 | ✅ | 06f214e |
| 2.2.2 | 双 Widget（单条速览 + Top5列表） | 1 | ✅ | 06f214e |
| 2.2.3 | App Group JSON 缓存共享 | 1 | ✅ | 06f214e |
| 2.2.4 | `AccessoryRectangularView`（锁屏 Widget） | 1 | ⬜ | — |

#### 模块3: 搜索增强 [3 SP] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 2.3.1 | SearchHistoryRepository + UserDefaults 实现 | 1.5 | ✅ | 06f214e |
| 2.3.2 | SearchView + SearchViewModel（本地过滤 + 历史管理） | 1.5 | ✅ | 06f214e |

#### 模块4: 测试完善 [2 SP] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 2.4.1 | 新增测试用例（+27 @Test） | 1 | ✅ | 06f214e |
| 2.4.2 | 测试覆盖达标验证（105 @Test PASS） | 1 | ✅ | 06f214e |

#### 模块5: App Store 准备 [9 SP]（延续）
| 任务 ID | 任务描述 | SP | 状态 |
|---------|----------|-----|------|
| 2.5.1 | App 图标（1024×1024 + 各尺寸） | 1 | ⬜ |
| 2.5.2 | `Localizable.xcstrings`（简中/英文） | 1 | ⬜ |
| 2.5.3 | Privacy Manifest（NSPrivacyAccessedAPITypes） | 0.5 | ⬜ |
| 2.5.4 | 版本 1.0.0 / Build 1 设置 | 0.5 | ⬜ |
| 2.5.5 | `CategoryView`（平台分组 + PlatformFilter 筛选器） | 1.5 | ✅ |
| 2.5.6 | `PlatformDetailView`（单平台完整热榜 + SafariView 跳转） | 1 | ✅ |
| 2.5.7 | `FavoritesView`（列表 + 全部/未读/已读筛选 + 滑动删除） | 1 | ✅ |
| 2.5.8 | `FavoritesViewModel` | 0.5 | ✅ |
| 2.5.9 | `SettingsView`（API Key 设置 + 缓存清理 + 关于） | 1 | ✅ |

### Sprint 2 退出条件
- [x] BUILD SUCCEEDED ✅ (06f214e)
- [x] SwiftLint 0 violations ✅ (06f214e)
- [x] 全量测试通过 ✅ (105 @Test PASS, 06f214e)
- [ ] Widget 在主屏幕正常展示热榜（待真机验证）
- [ ] App Store Connect 元数据填写完成

---

## 平台优先级

| 优先级 | 平台 | Sprint |
|--------|------|--------|
| P0 | 知乎、微博 | Sprint 1 ✅ |
| P1 | B站、GitHub、36氪、少数派、掘金 | Sprint 1 ✅ |
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

---

## Sprint 3: 性能优化 + RC 提交 (SP 待定)

**目标**: 性能优化、用户体验完善、RC 提交准备
**Commit**: `0e2d5d5`
**状态**: ✅ Sprint 3 已完成

### Sprint 3 执行树

#### 模块1: 性能优化 [SP 待定] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 3.1.1 | 列表滚动 FPS 优化 | 1 | ✅ | 0e2d5d5 |
| 3.1.2 | 内存占用优化（CachedAsyncImage NSCache） | 1 | ✅ | 0e2d5d5 |
| 3.1.3 | 冷启动时间优化 | 1 | ✅ | 0e2d5d5 |

#### 模块2: 用户体验完善 [SP 待定] ✅
| 任务 ID | 任务描述 | SP | 状态 | Commit |
|---------|----------|-----|------|--------|
| 3.2.1 | HotListViewModel 500ms防抖 | 1 | ✅ | 0e2d5d5 |
| 3.2.2 | Widget Timeline 30min刷新优化 | 1 | ✅ | 0e2d5d5 |
| 3.2.3 | BGAppRefreshTask后台刷新 | 1 | ✅ | 0e2d5d5 |

#### 模块3: App Store 素材完善 [SP 待定]（延续）
| 任务 ID | 任务描述 | SP | 状态 |
|---------|----------|-----|------|
| 3.3.1 | App Icon 导入 Assets.xcassets | 1 | ⬜ |
| 3.3.2 | 5张截图准备 | 1 | ⬜ |
| 3.3.3 | `Localizable.xcstrings`（简中/英文） | 1 | ⬜ |

#### 模块4: RC 提交准备 [SP 待定]（延续）
| 任务 ID | 任务描述 | SP | 状态 |
|---------|----------|-----|------|
| 3.4.1 | Privacy Manifest 完善 | 0.5 | ⬜ |
| 3.4.2 | 版本 1.0.0 / Build 1 设置 | 0.5 | ⬜ |
| 3.4.3 | Archive 构建验证 | 1 | ⬜ |
| 3.4.4 | Transporter 上传 | 0.5 | ⬜ |

### Sprint 3 退出条件
- [x] BUILD SUCCEEDED ✅ (0e2d5d5)
- [x] SwiftLint 0 violations ✅ (0e2d5d5)
- [x] 全量测试通过 ✅ (127 @Test PASS, 0e2d5d5)
- [ ] 性能指标达标（FPS ≥ 55，冷启动 < 2s）
- [ ] App Store Connect 提交完成

---

## 平台优先级（更新）

| 优先级 | 平台 | Sprint |
|--------|------|--------|
| P0 | 知乎、微博 | Sprint 1 ✅ |
| P1 | B站、GitHub、36氪、少数派、掘金 | Sprint 1 ✅ |
| P2 | 抖音、虎扑、V2EX、百度、澎湃 | Sprint 3 |
