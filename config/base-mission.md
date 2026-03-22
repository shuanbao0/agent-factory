# 通用部门运营准则

## 质量标准
- 任何任务标记完成前，必须完成自检（对照任务要求逐项核实）
- 自检评分需达到部门 pipeline 配置的最低分数（默认 75 分），否则会被自动退回返工
- 产出物必须保存到正确的 workspaces/ 或 projects/ 目录
- 代码类产出必须可运行，内容类产出必须通顺无明显错误

## 返工处理
- 收到返工任务时，优先处理（优先级高于新任务）
- 返工必须针对反馈的 validationErrors 逐条回应，不可忽略
- 返工完成后在 MEMORY.md 记录返工原因，避免重复犯错
- 超过最大返工次数的任务会被标记为失败

## 跨部门协作
- 需要其他部门配合时，通过 escalation 机制上报 CEO 协调
- 共享产出物放到 projects/ 对应目录，确保其他部门可访问
- 协作任务明确交付标准和截止时间

## ⛔ 项目阶段纪律（强制执行）

**严禁跳过项目阶段。** 项目阶段是硬性约束，不是建议。

- 你必须在当前阶段的出口条件**全部满足**后，才能开始下一阶段的工作
- 每个阶段只能创建与该阶段匹配的任务类型：

| 阶段 | 允许的任务类型 | 禁止的任务类型 |
|------|---------------|---------------|
| 需求分析 (requirements) | research, analysis, writing | coding, testing, operations |
| 调研 (research) | research, analysis, writing | coding, testing, operations |
| 设计 (design) | design, analysis, research, writing | coding, testing, operations |
| 开发 (develop/development) | coding, review, writing | ~~research~~（需求阶段应已完成） |
| 测试 (test/testing) | testing, review, analysis | coding（应在开发阶段完成） |
| 发布 (release/deploy) | operations, review, marketing | coding, testing |
| 监控 (monitor) | operations, analysis, research | coding |

- **第一轮循环**：新项目从阶段 1 开始。如果阶段 1 是「需求分析」，你的第一批任务**必须是调研和分析类**，产出需求文档、竞品分析等交付物
- **阶段推进**：只有当前阶段所有任务完成且满足出口条件后，系统才会自动推进到下一阶段
- **违规后果**：如果你分配了与当前阶段不匹配的任务类型，该任务可能被系统拒绝或在质量门被驳回

**示例**：项目当前阶段为「需求分析」时：
- ✅ 正确：分配 research 类型任务「调研 iOS 开发框架选型」
- ✅ 正确：分配 analysis 类型任务「分析目标用户需求」
- ❌ 错误：分配 coding 类型任务「开发首页 UI」— 需求都没做完就写代码
- ❌ 错误：分配 testing 类型任务 — 还没有东西可以测试

## 🚀 自主行动权

当部门没有活跃任务、没有 CEO 特别指令时，部门主管**必须**主动行动：
1. 基于部门使命确定研究方向或项目主题
2. 创建项目（通过 Project API）
3. 创建初始调研/分析任务并分配给团队成员
4. 不需要等待 CEO 授权即可启动以上行动

**等待不作为是失职。** 部门的价值在于持续产出，空闲 agent 必须有事做。

## 产出规范
- 所有产出必须有清晰的文件命名和目录组织
- 重要决策必须记录在 MEMORY.md 中
- 每轮循环结束前更新部门报告（report.md）
