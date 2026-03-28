# Hot Topics — Sprint 3 执行计划

> **版本**: v1.0
> **日期**: 2026-03-29
> **状态**: 🔧 进行中
> **项目**: apple-dev/hot-topics

---

## 摘要

Sprint 3 是 hot-topics v1.0 的最终冲刺阶段，聚焦性能优化、用户体验完善和 RC 提交准备。

| Sprint | 主题 | 状态 |
|--------|------|------|
| Sprint 1 | 基础架构 + 核心功能 | ✅ 已完成 |
| Sprint 2 | Widget + 搜索增强 + Bug修复 | ✅ 已完成 |
| **Sprint 3** | **性能优化 + RC 提交** | **🔧 进行中** |

---

## Sprint 2 完成总结 ✅

**Commit**: `06f214e`
**测试**: 105 @Test PASS
**SwiftLint**: 0 violations
**BUILD SUCCEEDED**: ✅

### 完成产出
- P0 Bug 修复（sheet 呈现问题）
- Widget Extension（双 Widget + App Group 共享）
- 搜索功能（SearchHistory + SearchView）
- Category 完善（平台分组 + 拖拽排序）
- 5 Tab 布局（热榜/分类/搜索/收藏/设置）

---

## Sprint 3 任务列表

### 模块1: 性能优化 [3 SP]

| 任务 | 描述 | SP | 状态 |
|------|------|-----|------|
| 3.1.1 | 列表滚动 FPS 优化 | LazyVStack 懒加载，避免不必要重绘 | ⬜ |
| 3.1.2 | 内存占用优化 | 图片缓存策略，减少峰值内存 | ⬜ |
| 3.1.3 | 冷启动时间优化 | @MainActor 初始化优化 | ⬜ |

**性能目标**:
- 滚动 FPS ≥ 55
- 冷启动时间 < 2s
- 内存峰值 < 150MB

### 模块2: 用户体验完善 [2.5 SP]

| 任务 | 描述 | SP | 状态 |
|------|------|-----|------|
| 3.2.1 | 骨架屏加载动画 | SkeletonRowView 完善 | ⬜ |
| 3.2.2 | 下拉刷新交互 | Pull-to-refresh 动效优化 | ⬜ |
| 3.2.3 | 空状态引导页 | EmptyStateView 引导完善 | ⬜ |

### 模块3: App Store 素材完善 [3 SP]

| 任务 | 描述 | SP | 状态 | 负责方 |
|------|------|-----|------|--------|
| 3.3.1 | App Icon 导入 | 导入 designer 素材到 Assets | ⬜ | apple-designer |
| 3.3.2 | 5张截图准备 | 规范：首页/分类/搜索/收藏/设置 | ⬜ | apple-tester |
| 3.3.3 | 本地化 | `Localizable.xcstrings` 简中/英文 | ⬜ | — |

### 模块4: RC 提交准备 [2.5 SP]

| 任务 | 描述 | SP | 状态 | 负责方 |
|------|------|-----|------|--------|
| 3.4.1 | Privacy Manifest | NSPrivacyAccessedAPITypes | ⬜ | apple-release |
| 3.4.2 | 版本配置 | v1.0.0 / Build 1 | ⬜ | apple-release |
| 3.4.3 | Archive 构建 | xcodebuild archive + 签名 | ⬜ | apple-release |
| 3.4.4 | Transporter 上传 | App Store Connect 提交 | ⬜ | CEO |

---

## App Store 上架阻塞项

| 项 | 状态 | 负责方 |
|----|------|--------|
| 隐私政策 URL | ⏳ 待 CEO 提供 | CEO |
| 支持 URL | ⏳ 待 CEO 提供 | CEO |
| App Icon 素材 | ⏳ 待 designer | apple-designer |
| 5张截图 | ⏳ 待准备 | apple-tester |

---

## 退出标准

| 检查项 | 目标 | 状态 |
|--------|------|------|
| BUILD SUCCEEDED | ✅ | ⬜ |
| ARCHIVE SUCCEEDED | ✅ | ⬜ |
| SwiftLint | 0 violations | ⬜ |
| 测试通过 | ≥105 @Test | ⬜ |
| 性能达标 | FPS≥55, 冷启动<2s | ⬜ |
| App Store 提交 | Transporter 上传完成 | ⬜ |

---

## 风险与依赖

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| CEO 资源未到位 | 高 | 高 | 提前催告，尽早确认 |
| App Icon 设计延迟 | 中 | 中 | 使用占位符，后续替换 |
| 审核被拒 | 低 | 高 | 确保数据来源合规 |

---

**签署**: apple-release
**日期**: 2026-03-29
