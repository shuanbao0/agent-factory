# Smart Health Tracker — TestFlight Release Notes

> **版本**: v1.6 Sprint 1
> **日期**: 2026-03-29
> **Commits**: 76358a3, 0a61be3, 6c11398, 81045dc

---

## 中文版

### 新增功能

#### CoreML 健康预测引擎
- **离线健康预测**：基于 CoreML 的本地预测引擎，无需网络即可预测健康趋势
- **心率异常预测**：智能检测心率异常模式，提前预警
- **睡眠质量预测**：分析睡眠数据，预测睡眠质量趋势
- **特征向量标准化**：统一的 `HealthFeatureVector` 格式，支持多指标融合

#### GameKit 社交挑战
- **挑战中心 (ChallengeHub)**：一站式浏览所有健康挑战
- **排行榜 (Leaderboard)**：与好友比拼步数、睡眠质量、运动时长
- **成就系统 (Achievement)**：解锁健康成就，记录每一个里程碑
- **GameKit 集成**：支持 Game Center 好友邀请和挑战分享

#### AI 教练 Pro
- **AICoachProView**：全新三态加载界面（加载中/内容/错误），体验更流畅
- **置信度评分**：每条推荐附带置信度评分，帮你判断建议可靠程度

#### Swift 6 兼容性
- **actor 并发模型**：`GameKitManager` 重构为 actor，解决 Sendable 约束
- **HIG 修复**：全屏加载状态使用标准 `ProgressView`

---

## English Version

### What's New

#### CoreML Health Prediction Engine
- **Offline Health Prediction**: CoreML-based local prediction engine for health trends without network
- **Heart Rate Anomaly Detection**: Intelligent detection of abnormal heart rate patterns with early warnings
- **Sleep Quality Prediction**: Analyze sleep data and predict sleep quality trends
- **Standardized Feature Vectors**: Unified `HealthFeatureVector` format for multi-metric fusion

#### GameKit Social Challenges
- **Challenge Hub**: One-stop browsing for all health challenges
- **Leaderboard**: Compete with friends on steps, sleep quality, and workout duration
- **Achievement System**: Unlock health achievements and track every milestone
- **GameKit Integration**: Game Center friend invites and challenge sharing

#### AI Coach Pro
- **AICoachProView**: New three-state loading interface (loading/content/error) for smoother UX
- **Confidence Scoring**: Each recommendation comes with a confidence score

#### Swift 6 Compatibility
- **Actor Concurrency**: `GameKitManager` refactored to actor for Sendable conformance
- **HIG Fix**: Full-screen loading state uses standard `ProgressView`

---

## Technical Notes

- **Minimum**: iOS 17.0 / macOS 14.0 / watchOS 10.0 / visionOS 1.0
- **Swift**: 6.0 (SWIFT_STRICT_CONCURRENCY=complete)
- **BUILD SUCCEEDED** ✅
- **SwiftLint**: 0 serious violations ✅
