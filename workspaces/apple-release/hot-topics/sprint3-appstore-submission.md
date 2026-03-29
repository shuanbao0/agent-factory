# hot-topics v1.0 — App Store 提交清单

> **版本**: v1.0
> **日期**: 2026-03-29
> **Agent**: apple-release

---

## 1. 提交通用信息

| 字段 | 值 |
|------|-----|
| **版本号** | 1.0.0 |
| **Build 号** | 1 |
| **Bundle ID** | `com.hotapp.hottopics` |
| **价格** | 免费 |
| **类别** | 新闻 |
| **子类** | 新闻阅读、工具/效率 |
| **年龄分级** | 4+ |
| **版权** | © 2026 HotApp Inc. |

---

## 2. App Store 元数据

### 2.1 基本信息

| 字段 | 内容 | 字符数 |
|------|------|--------|
| **名称** | 热榜 · 全网热点聚合 | 9 字 |
| **副标题** | 一站式浏览全网热榜资讯 | 12 字 |

### 2.2 关键词

```
热榜,热点,资讯,知乎,微博,B站,GitHub,36氪,
少数派,掘金,新闻,聚合,话题,trending,news
```

**字符数**: 97 字符 ✅（限制 100）

### 2.3 描述

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
```

### 2.4 宣传文本

```
全网热榜，一站掌握
```

### 2.5 隐私政策 URL

| 项 | 状态 | 值 |
|----|------|-----|
| 隐私政策 URL | ⏳ **待 CEO 提供** | — |

### 2.6 支持 URL

| 项 | 状态 | 值 |
|----|------|-----|
| 支持 URL | ⏳ **待 CEO 提供** | — |

---

## 3. 截图要求

| 设备 | 尺寸 | 数量 | 状态 |
|------|------|------|------|
| iPhone 6.7" (15 Pro) | 1290×2796 | 5 张 | ⬜ 待准备 |
| iPhone 5.5" (8 Plus) | 1242×2208 | 5 张 | ⬜ 可选 |
| iPad Pro 12.9" | 2048×2732 | 5 张 | ⬜ 可选 |

**截图内容建议**:
1. 首页热榜 List
2. 分类浏览 Tab
3. 收藏夹 Tab
4. SafariView 内嵌阅读
5. 设置页面

---

## 4. 审核备注

```
应用内容基于 tophubdata.com 公开 API 数据，不爬取平台会员内容。
应用内不包含任何广告。
不收集或上传用户个人信息。
年龄分级：4+（App 仅聚合公开数据链接，无用户生成内容、无社交功能）。
```

---

## 5. 提交前检查清单

| 检查项 | 状态 | 负责人 |
|--------|------|--------|
| 版本配置（MARKETING_VERSION=1.0.0） | ⬜ | apple-release |
| Build 配置（CURRENT_PROJECT_VERSION=1） | ⬜ | apple-release |
| PrivacyInfo.xcprivacy 已创建 | ⬜ | apple-release |
| 隐私政策 URL 已提供 | ⏳ | CEO |
| 支持 URL 已提供 | ⏳ | CEO |
| App Icon 已导入 | ⏳ | apple-designer |
| 5张截图已准备 | ⏳ | apple-tester |
| TestFlight Release Notes 已准备 | ✅ | apple-release |
| SwiftLint 0 violations | ✅ | — |
| BUILD SUCCEEDED | ✅ | — |
| Archive 构建成功 | ⬜ | apple-release |

---

## 6. 提交步骤

### 步骤1: 版本配置
修改 `project.yml`:
```yaml
settings:
  base:
    MARKETING_VERSION: "1.0.0"
    CURRENT_PROJECT_VERSION: "1"
```

### 步骤2: 创建 PrivacyInfo.xcprivacy
文件路径: `src/PrivacyInfo.xcprivacy`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
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
    </array>
</dict>
</plist>
```

### 步骤3: Archive 构建
```bash
xcodegen generate
xcodebuild archive \
  -scheme HotTopics \
  -configuration Release \
  -archivePath build/HotTopics.xcarchive
```

### 步骤4: Transporter 上传
```bash
xcrun altool --upload-app \
  -type ios \
  -file build/HotTopics.ipa \
  -username "[Apple ID]" \
  -password "[App-Specific Password]"
```

---

## 7. 阻塞项

| 阻塞项 | 状态 | 负责人 |
|--------|------|--------|
| 隐私政策 URL | ⏳ CEO | CEO |
| 支持 URL | ⏳ CEO | CEO |
| App Icon | ⏳ designer | apple-designer |
| 5张截图 | ⏳ tester | apple-tester |
| 版本配置 | ⬜ 需修改 project.yml | apple-release |
| PrivacyInfo.xcprivacy | ⬜ 需创建 | apple-release |

---

**签署**: apple-release
**日期**: 2026-03-29
