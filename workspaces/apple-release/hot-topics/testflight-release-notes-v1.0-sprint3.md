# Hot Topics — TestFlight Release Notes

> **版本**: v1.0 Sprint 3
> **日期**: 2026-03-29
> **Commit**: 0e2d5d5

---

## 中文版

### 新增功能

#### 性能优化
- **图片缓存优化**：采用 NSCache 内存缓存，图片加载更快速，内存占用更低
- **搜索防抖优化**：HotListViewModel 500ms 防抖，减少不必要请求

#### 后台刷新
- **Widget Timeline 优化**：刷新间隔从 15min 延长至 30min，降低电量消耗
- **BGAppRefreshTask**：支持系统后台刷新，数据随时保持最新

---

## English Version

### What's New

#### Performance Optimization
- **Image Cache Optimization**: NSCache memory caching for faster image loading and lower memory usage
- **Search Debounce**: HotListViewModel 500ms debounce to reduce unnecessary requests

#### Background Refresh
- **Widget Timeline Optimization**: Refresh interval extended from 15min to 30min for better battery life
- **BGAppRefreshTask**: System background refresh support to keep data up to date

---

## Technical Notes

- **Minimum**: iOS 17.0
- **Swift**: 6.0 (SWIFT_STRICT_CONCURRENCY=complete)
- **Total Tests**: 127 @Test
- **BUILD SUCCEEDED** ✅
- **SwiftLint**: 0 serious violations ✅
