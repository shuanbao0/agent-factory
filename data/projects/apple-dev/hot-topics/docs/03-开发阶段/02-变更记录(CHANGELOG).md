# Hot Topics — CHANGELOG

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [v1.0] — TBD

### Added

#### Sprint 2 (Widget + 搜索增强 + Bug修复 + App Store准备) — 🔧 进行中

- **P0 Bug修复** [2 SP]
  - HomeView sheet 修复
  - EmptyStateView 完善

- **Widget Extension** [4 SP]
  - `HotTopicsWidgetEntry` + `HotTopicsWidgetProvider`（Timeline 15min）
  - `SmallWidgetView`（Top 3 条目）
  - `MediumWidgetView`（Top 5 条目）
  - `AccessoryRectangularView`（锁屏 Widget）

- **搜索增强** [3 SP]
  - 实时过滤 `SearchBar` + `filterByQuery`
  - 搜索历史记录 `SearchHistoryStore`

- **测试覆盖**: 目标 ≥80 @Test

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
