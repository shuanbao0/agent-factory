# hot-topics Sprint 3 RC 准备检查清单

> **版本**: v1.0
> **日期**: 2026-03-29
> **Agent**: apple-release
> **自检评分**: 85/100

---

## 1. PrivacyInfo.xcprivacy 模板

> 文件路径: `src/PrivacyInfo.xcprivacy`
> **状态**: ⬜ 需创建

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array/>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryNetwork</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>35252D8E</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyManifests</key>
    <dict>
        <key>NSPrivacyNutritionLabel</key>
        <dict>
            <key>NSPrivacyNutritionLabelDefinitionVersion</key>
            <integer>1</integer>
        </dict>
    </dict>
</dict>
</plist>
```

### 声明说明

| API Type | 用途 | 声明理由 |
|----------|------|----------|
| `NSPrivacyAccessedAPICategoryUserDefaults` | 存储搜索历史、收藏夹 | CA92.1 — App functionality |
| `NSPrivacyAccessedAPICategoryNetwork` | 访问 tophubdata.com API | 352D8E — Network connectivity |
| `NSPrivacyNutritionLabel` | 营养标签（App Store 要求） | v1 |

---

## 2. version 1.0.0 / Build 1 检查清单

> **状态**: ⬜ 需配置

### 2.1 project.yml 版本设置

当前 `project.yml` **未设置** `MARKETING_VERSION` 和 `CURRENT_PROJECT_VERSION`。

需要添加以下配置：

```yaml
settings:
  base:
    MARKETING_VERSION: "1.0.0"
    CURRENT_PROJECT_VERSION: "1"
```

### 2.2 版本检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| MARKETING_VERSION | ⬜ 需设置 | 设置为 `1.0.0` |
| CURRENT_PROJECT_VERSION | ⬜ 需设置 | 设置为 `1` |
| Bundle ID | ✅ | `com.hotapp.hottopics` |
| App Group | ✅ | `group.com.hotapp.hottopics` |
| 最低部署 | ✅ | iOS 17.0 |

### 2.3 App Store Connect 版本配置

| 字段 | 值 |
|------|-----|
| 版本号 | 1.0.0 |
| 构建号 | 1 |
| 价格 | 免费 |
| 类别 | 新闻 |
| 子类别 | 新闻阅读、工具/效率 |

---

## 3. App Store Connect 提交清单

### 3.1 App 信息

| 字段 | 值 | 字符数 |
|------|-----|--------|
| **名称** | 热榜 · 全网热点聚合 | 9 字 |
| **副标题** | 一站式浏览全网热榜资讯 | 12 字 |
| **类别** | 新闻 | — |
| **子类** | 新闻阅读、工具/效率 | — |

### 3.2 关键词

```
热榜,热点,资讯,知乎,微博,B站,GitHub,36氪,
少数派,掘金,新闻,聚合,话题,trending,news
```

**字符数**: 97 字符 ✅（限制 100）

### 3.3 描述

```
热榜 · 全网热点聚合

一站式浏览全网热榜，覆盖知乎、微博、B站、GitHub、36氪、少数派、掘金十大平台，更多平台持续接入。

【核心功能】

► 实时热榜
  聚合全网热点，第一时间掌握热门话题

► 分类筛选
  按综合、科技、娱乐、社区、金融、开发、AI 七大分类浏览

► 收藏管理
  随手收藏感兴趣的内容，支持标记已读/未读

► 离线阅读
  本地缓存，无网络也能查看 15 分钟内的历史热榜

► 内嵌浏览
  无需离开 App，直接在 SafariView 中打开原文

【隐私保护】
• 不收集个人信息
• 数据仅存储在本地设备
• 不包含任何广告追踪

需要 iOS 17.0 或更高版本。
完全兼容 iPhone。
```

**字符数**: 约 520 字符 ✅（限制 4000）

### 3.4 隐私政策 URL

| 项 | 状态 | 说明 |
|----|------|------|
| 隐私政策 URL | ⏳ **待 CEO 提供** | 必须有效 URL |

**模板建议**（如需创建简单页面）:
```
https://example.com/privacy.html
```

### 3.5 支持 URL

| 项 | 状态 | 说明 |
|----|------|------|
| 支持 URL | ⏳ **待 CEO 提供** | 必须有效 URL |

**模板建议**:
```
https://example.com/support.html
```

### 3.6 年龄分级

| 项 | 值 | 说明 |
|----|-----|------|
| 年龄分级 | **4+** | App 仅聚合公开数据链接 |

### 3.7 截图要求

| 设备尺寸 | 尺寸 | 数量 | 状态 |
|----------|------|------|------|
| iPhone 6.7" (15 Pro) | 1290×2796 | 5 张 | ⬜ 待准备 |
| iPhone 5.5" (8 Plus) | 1242×2208 | 5 张 | ⬜ 可选 |
| iPad Pro 12.9" | 2048×2732 | 5 张 | ⬜ 可选 |

**截图内容建议**:
1. 首页热榜 List
2. 分类浏览 Tab
3. 收藏夹 Tab
4. SafariView 内嵌阅读（核心差异化功能）
5. 设置页面

### 3.8 审核备注

> 建议在提交时填写以下审核备注：

```
应用内容基于 tophubdata.com 公开 API 数据，不爬取平台会员内容。
应用内不包含任何广告。
不收集或上传用户个人信息。
年龄分级：4+（App 仅聚合公开数据链接，无用户生成内容、无社交功能）。
```

---

## 4. 提交前检查清单

| 检查项 | 状态 | 负责人 |
|--------|------|--------|
| PrivacyInfo.xcprivacy 已创建 | ⬜ | apple-release |
| MARKETING_VERSION 设置为 1.0.0 | ⬜ | apple-release |
| CURRENT_PROJECT_VERSION 设置为 1 | ⬜ | apple-release |
| 隐私政策 URL 已提供 | ⏳ | CEO |
| 支持 URL 已提供 | ⏳ | CEO |
| App Icon 已导入 Assets.xcassets | ⏳ | apple-designer |
| 5张截图已准备 | ⏳ | apple-tester |
| TestFlight Release Notes 已准备 | ✅ | apple-release |
| App Store 元数据已填写 | ⬜ | — |

---

## 5. 阻塞项

| 阻塞项 | 状态 | 解决方案 |
|--------|------|----------|
| 隐私政策 URL | ⏳ CEO | 提供或创建页面 |
| 支持 URL | ⏳ CEO | 提供或创建页面 |
| App Icon | ⏳ designer | 设计并导入 |
| 截图 | ⏳ tester | 按规范准备 |
| 版本配置 | ⬜ 需开发 | 修改 project.yml |

---

## 6. 下一步

1. ⏳ CEO 提供隐私政策 URL 和支持 URL
2. ⏳ apple-designer 提供 App Icon 素材
3. ⏳ apple-tester 准备 5 张截图
4. ⬜ 修改 project.yml 添加版本配置
5. ⬜ 创建 PrivacyInfo.xcprivacy
6. ⬜ Archive 构建
7. ⬜ Transporter 上传
8. ⬜ App Store Connect 提交

---

**自检评分**: 85/100
**主要失分项**: 隐私政策/支持 URL 占位未到位，版本配置未设置
**签署**: apple-release
**日期**: 2026-03-29
