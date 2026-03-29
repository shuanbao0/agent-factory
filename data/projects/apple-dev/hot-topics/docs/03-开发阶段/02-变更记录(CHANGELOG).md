# Hot Topics — CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.0] — 2026-03-29

### Added

#### Sprint 3 (性能优化 + 后台刷新 + RC准备) — ✅ 已完成

**Commit**: `0e2d5d5`

- **性能优化**
  - CachedAsyncImage NSCache 内存缓存
  - HotListViewModel 500ms 防抖优化
  - Widget Timeline 30min 刷新优化

- **后台刷新**
  - BGAppRefreshTask 后台刷新支持

- **测试覆盖**: 105 → **127 @Test** (+22), BUILD SUCCEEDED, SwiftLint 0

---

#### Sprint 2 (Widget + 搜索增强 + Bug修复 + Category完善) — ✅ 已完成

**Commit**: `06f214e`

- **P0 Bug修复** [2 SP]
  - HomeView sheet 修复（`sheet(isPresented:)` → `sheet(item:)`）
  - EmptyStateView 完善（新增 `onRefresh` 回调，支持重新加载按钮）

- **Widget Extension** [4 SP]
  - `HotTopicsWidgetEntry` + `HotTopicsWidgetProvider`（Timeline 15min）
  - 双 Widget（单条速览 + Top5 列表）
  - App Group JSON 缓存共享

- **搜索增强** [3 SP]
  - `SearchHistoryRepository` + UserDefaults 实现
  - `SearchView` + `SearchViewModel`（本地过滤 + 历史管理）
  - HomeView 新增搜索 Tab（5 Tab 布局）

- **Category 完善** [部分]
  - `CategoryViewModel` + 平台数徽章 + 分类拖拽排序
  - `PlatformDetailView` 单平台热榜 + SafariView 跳转
  - `FavoritesView` 列表 + 全部/未读/已读筛选 + 滑动删除
  - `SettingsView` API Key 设置 + 缓存清理

- **测试覆盖**: 78 → **105 @Test** (+27), BUILD SUCCEEDED, SwiftLint 0

---

## [v1.0] — 2026-03-29

### Added

#### Sprint 1 (基础架构 + 核心功能) — ✅ 已完成

- **项目初始化**
  - XcodeGen project.yml 配置（主 App + Widget + Tests targets）
  - App Group entitlement 配置
  - Clean Architecture 四层架构
  - Swift 6.0 + SwiftData + SwiftUI

- **Domain 层**
  - `HotCategory` enum（7分类 + sfSymbol）
  - `Platform` struct（12 平台静态列表）
  - `HotItem` struct（isExpired / formattedHotValue）
  - `FavoriteItem` struct
  - `HotTopicsError` enum
  - `HotListRepository` / `FavoritesRepository` protocols
  - `FetchHotListUseCase` / `GetCachedHotListUseCase` / `ManageFavoritesUseCase`

- **Infrastructure 层**
  - `TophubAPIClient` actor（Bearer Token 认证）
  - `SwiftDataHotListRepository` / `SwiftDataFavoritesRepository`
  - `HotItemEntity` / `PlatformEntity` / `FavoriteItemEntity` @Model
  - `PlatformSeeds.swift`（12 平台初始数据）

- **Presentation 层**
  - `HomeView`（TabView 4 个 Tab）
  - `HotListView` / `HotListViewModel`
  - `HotItemRowView` / `PlatformBadge` / `HeatValueLabel`
  - `EmptyStateView` / `ErrorBanner` / `SafariView`

- **测试覆盖**: 78 @Test, 测试评分 89/100

---

**最后更新**: 2026-03-29
**签署**: apple-release
