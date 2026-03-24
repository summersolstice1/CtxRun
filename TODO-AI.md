# AI Web Adapter 最终方案

## 目标

为 CtxRun 增加一个可持续维护的 AI 网页接入层，使系统能够在 **用户自行完成登录** 的前提下，统一接入多个 AI 聊天网页，并稳定完成以下最小交互：

- 识别输入框
- 上传文件或图片
- 开启或关闭思考/深度思考/推理模式
- 发送消息
- 识别回复区域
- 判断回复是否结束

本方案不负责：

- 登录流程
- 验证码处理
- 绕过风控
- 逆向官方私有接口
- 维护整页 DOM 结构

## 最终结论

最终方案采用：

- **继续使用现有 `chromiumoxide`，不引入新的浏览器主库**
- **新增共享浏览器运行时模块**
- **新增 AI Provider Adapter 体系**
- **官方维护一套核心 AI 站点 JSON 适配器**
- **允许本地覆盖和自定义适配器**
- **只维护最小交互契约，不维护完整页面结构**

这是当前项目最稳妥、改动面最小、后续扩展性最强的方案。

原因：

- 项目中 `automator` 和 `miner` 已经基于 `chromiumoxide 0.9.1`
- 当前版本已具备 `Page::event_listener`、`Page::execute`、`evaluate_on_new_document`
- 底层已包含 `Fetch.requestPaused`、`Network.getResponseBody`、`GetRequestPostData`
- CDP 生成代码中已经有 `DOM.setFileInputFiles`
- 已具备 SSE / WebSocket 事件类型，可支撑后续流式响应检测

因此，现阶段的关键不是换库，而是把现有浏览器能力抽象为共享运行时，并在上面叠一层可维护的 Provider Adapter。

## 核心设计原则

### 1. 不解析整页，只解析最小交互面

每个 AI 页面只维护以下能力定义：

- composer：输入框
- upload：上传入口或隐藏 file input
- send：发送按钮
- reasoning：思考模式开关
- assistant_output：回答区域
- completion：回答完成判定方式

不要试图维护完整 DOM 树、整页组件结构或站点全部按钮，这样会导致脆弱且维护成本失控。

### 2. 适配器优先声明式，复杂场景允许少量代码 Hook

大多数站点应该通过 JSON 适配器描述。

只有以下情况允许进入 Rust Hook：

- 思考开关是多级菜单路径
- 上传动作需要先点菜单再触发隐藏 input
- 页面包含 iframe / shadow root / 动态 portal
- 回复完成判定无法由通用规则表达

原则是：

- 默认 JSON
- 少量 Hook
- Hook 只处理复杂流程，不重新实现整站逻辑

### 3. 登录交给用户，会话隔离由系统负责

用户自己完成登录，但系统必须负责浏览器 profile 和会话隔离。

必须保证：

- 不同 provider 的会话隔离
- 同一 provider 不同账号可隔离
- 临时会话和持久会话分离

## 现状问题

当前代码已经有能力基础，但结构不适合直接扩展成通用 AI 网页接入层。

### 已有基础

- `src-tauri/crates/automator/src/browser.rs`
  - 已有标签页连接、切换、选择器操作、导航、按键、页面激活能力
- `src-tauri/crates/miner/src/core/driver.rs`
  - 已有浏览器启动、`Browser + handler` 生命周期管理、并发 page 派生能力
- `src-tauri/crates/browser-utils/src/lib.rs`
  - 已有浏览器定位、调试端口探测、用户数据目录能力

### 当前主要问题

- `automator` 和 `miner` 各自维护一套浏览器生命周期
- 两边都把调试端口写死为 `9222`
- `browser-utils` 只要端口可用就直接复用，无法区分是谁的浏览器
- profile 目录只有 `persistent` / `temp` 两个固定槽位，不支持多 provider 多账号隔离
- `automator` 是“每个动作临时连一次浏览器”
- `miner` 是“持有 Browser，派生多个 Page”
- 没有统一的 AI Provider Adapter 抽象

结论：

- 不能直接在现有 `automator` 或 `miner` 上继续堆逻辑
- 必须先抽出共享浏览器运行时

## 最终架构

建议新增以下模块：

### 1. `ctxrun-browser-runtime`

职责：

- 管理浏览器启动、连接、关闭
- 分配动态调试端口
- 管理 handler task 生命周期
- 管理 `BrowserSession`、`PageSession`
- 统一页面操作 API
- 统一网络事件监听 API
- 管理 profile 路径和会话隔离
- 提供元素拾取和选择器验证能力

这是浏览器能力底座，所有上层功能都只能通过它访问页面。

### 2. `ctxrun-ai-adapters`

职责：

- 管理 Provider Adapter 清单
- 加载官方内置 adapter
- 加载本地 override adapter
- 做 schema 校验
- 做 adapter 匹配和版本管理
- 提供 adapter 调试与验证能力

### 3. `ctxrun-ai-runtime`

职责：

- 基于当前 tab 或指定 tab 识别 provider
- 加载对应 adapter
- 执行“输入/上传/思考开关/发送/等待完成/提取输出”的统一流程
- 暴露给上层工具或 UI 调用

### 4. `ctxrun-ai-storage`

职责：

- 保存 adapter override
- 保存 provider profile 映射
- 保存执行记录和调试日志
- 可选保存会话元数据

## Adapter 体系设计

### 设计目标

适配器只描述“如何在一个已登录页面完成一次交互”。

适配器不是：

- 爬虫规则库
- 全页面组件树
- 私有 API 逆向配置

### Provider Adapter 结构

每个 provider 一个 JSON 文件，例如：

- `providers/chatgpt.json`
- `providers/claude.json`
- `providers/gemini.json`
- `providers/perplexity.json`

建议字段如下：

```json
{
  "id": "chatgpt",
  "version": 1,
  "display_name": "ChatGPT",
  "match": {
    "hosts": ["chatgpt.com", "chat.openai.com"],
    "title_contains": ["ChatGPT"],
    "url_contains": ["/", "/c/"]
  },
  "capabilities": {
    "text_input": true,
    "file_upload": true,
    "reasoning_toggle": true,
    "stream_output": true
  },
  "selectors": {
    "composer": [
      "textarea",
      "[contenteditable='true']"
    ],
    "upload_input": [
      "input[type='file']"
    ],
    "upload_button": [
      "button[aria-label*='upload']"
    ],
    "send_button": [
      "button[aria-label*='send']"
    ],
    "assistant_message": [
      "[data-message-author-role='assistant']"
    ],
    "stop_button": [
      "button[aria-label*='Stop']"
    ]
  },
  "reasoning": {
    "mode": "toggle",
    "state_selector": [
      "button[aria-pressed]"
    ],
    "enable_steps": [
      { "action": "click", "selector_ref": "reasoning_button" }
    ],
    "disable_steps": [
      { "action": "click", "selector_ref": "reasoning_button" }
    ],
    "extra_selectors": {
      "reasoning_button": [
        "button[aria-label*='Reason']",
        "button[aria-label*='Think']"
      ]
    }
  },
  "completion": {
    "mode": "stop_button_disappears",
    "timeout_ms": 180000
  },
  "extract": {
    "mode": "last_assistant_message_text"
  }
}
```

### Adapter 字段解释

#### `match`

用于识别当前页面属于哪个 provider。

建议组合：

- host
- title contains
- url contains
- 可选 body marker

不要只靠单一 selector 判定 provider。

#### `capabilities`

明确 provider 是否支持：

- 文本输入
- 文件上传
- 思考开关
- 流式输出

避免上层运行时在不支持的站点上盲目执行动作。

#### `selectors`

保存最小交互节点的候选选择器列表。

规则：

- 允许多个候选
- 按顺序尝试
- 命中后缓存可用 selector
- 不保存易碎的深层路径
- 优先 `aria-*`、`data-*`、语义属性

#### `reasoning`

思考模式必须设计成动作序列，而不是单个布尔选择器。

因为不同站点可能是：

- 单按钮 toggle
- 菜单后再勾选
- 下拉项切换
- 弹层开关

所以需要 `enable_steps` / `disable_steps`。

#### `completion`

回答完成判定建议支持多种模式：

- `stop_button_disappears`
- `assistant_message_stable`
- `network_idle`
- `custom_hook`

第一阶段优先实现：

- `stop_button_disappears`
- `assistant_message_stable`

#### `extract`

第一阶段统一只支持：

- 读取最后一条 assistant message 文本

第二阶段可扩展：

- HTML
- Markdown
- 引用列表
- 推理内容单独提取

## Adapter 的维护策略

### 官方维护范围

建议官方维护以下核心 providers：

- ChatGPT
- Claude
- Gemini
- Perplexity
- Grok
- DeepSeek
- Kimi
- Qwen

原因：

- 用户量大
- 维护价值高
- 页面结构变更频率可接受

### 本地覆盖机制

必须支持本地 override。

优先级：

- local override
- built-in official

这样当某个 provider 页面发生小改动时：

- 用户可先本地修复
- 官方后续再合并为内置 adapter

### 维护流程建议

1. 新增 provider 时，先人工建立 adapter JSON
2. 用选择器验证工具跑一遍
3. 用“发送文本 / 上传文件 / 开关思考 / 等待完成 / 提取回复”做回归
4. 通过后合入官方内置 adapter

## 选择器拾取与修复机制

不要纯手写维护所有选择器，必须复用现有元素拾取能力。

建议复用当前 `automator` 中的 picker 逻辑，为 AI adapter 增加以下维护工具：

- Pick Composer
- Pick Upload Button
- Pick Upload Input
- Pick Send Button
- Pick Reasoning Button
- Pick Assistant Message

拾取结果直接生成或更新本地 adapter JSON。

这样当页面变化时，不需要修改核心代码，只需要重新拾取关键节点。

## 浏览器与会话设计

### Session 模型

建议新增：

- `BrowserSession`
- `PageSession`
- `SessionProfileKey`

示意：

- `BrowserSession`
  - 管理浏览器进程或调试浏览器连接
- `PageSession`
  - 管理单 tab 页面操作和事件监听
- `SessionProfileKey`
  - 标识 `provider + account + mode`

### Profile 路径设计

当前 `persistent` / `temp` 两个目录过于粗糙，建议改为：

- `profiles/persistent/{provider}/{account_key}/`
- `profiles/temp/{session_id}/`

其中 `account_key` 可以是：

- 用户手工命名
- provider 页面内识别出的展示邮箱哈希
- 未识别时使用 `default`

### 调试端口设计

必须去掉硬编码 `9222`。

建议：

- 默认动态分配端口
- 由 runtime 统一注册和跟踪
- `browser-utils` 不再使用“端口可用就直接复用”的简单逻辑
- 必须通过 session registry 判断端口归属

## 统一运行时流程

标准执行流程如下：

1. 用户自己登录并打开目标 AI 页面
2. 系统 attach 当前活动 tab 或指定 tab
3. 根据 URL/title/marker 匹配 provider adapter
4. 校验 adapter 的关键 selector 是否至少命中一项
5. 根据请求参数执行：
   - 可选开/关思考
   - 可选上传文件
   - 输入 prompt
   - 点击发送
6. 等待完成条件成立
7. 提取最后一条 assistant 输出
8. 返回结构化结果

返回结果建议统一为：

```json
{
  "provider": "chatgpt",
  "success": true,
  "used_adapter_version": 1,
  "used_selectors": {
    "composer": "textarea",
    "send_button": "button[data-testid='send-button']"
  },
  "response_text": "final answer ...",
  "artifacts": {
    "uploaded_files": ["demo.png"]
  },
  "timing": {
    "started_at": "2026-03-22T10:00:00Z",
    "completed_at": "2026-03-22T10:00:08Z"
  },
  "warnings": []
}
```

## 数据保存设计

需要保存的不是“AI 页面结构”，而是以下几类数据。

### 1. Adapter 定义

保存位置建议：

- 内置：`src-tauri/crates/ai-adapters/providers/*.json`
- 本地覆盖：应用数据目录 `ai_adapters/overrides/*.json`

### 2. Profile 与会话映射

保存内容：

- provider
- account_key
- profile_path
- last_verified_at
- last_adapter_id

### 3. 执行记录

建议保存：

- provider
- 请求参数摘要
- 使用的 adapter 版本
- 最终命中的 selector
- 输出文本
- 失败原因

### 4. 调试材料

建议可选保存：

- 页面截图
- DOM 抽样
- 关键事件日志
- adapter 验证失败原因

默认不要保存完整页面 HTML，以免产生不必要的噪音和隐私风险。

## 对现有项目的具体改动建议

### 一、重构 `browser-utils`

需要改动：

- 去掉固定 `persistent` / `temp` 二分模型
- 增加 profile path builder
- 增加动态调试端口分配
- 增加 session metadata registry
- 增加“按 session 连接”而不是“按端口盲连”的能力

### 二、新建 `src-tauri/crates/browser-runtime`

建议包含：

- `launcher.rs`
- `session.rs`
- `page_ops.rs`
- `tab_resolver.rs`
- `upload.rs`
- `network.rs`
- `profile.rs`
- `registry.rs`
- `error.rs`

职责：

- 把 `automator` 和 `miner` 重复的浏览器逻辑沉到这里

### 三、新建 `src-tauri/crates/ai-adapters`

建议包含：

- `model.rs`
- `loader.rs`
- `matcher.rs`
- `validator.rs`
- `providers/*.json`
- `schema/adapter.schema.json`

职责：

- 管理 provider adapter
- 实现官方 + 本地 override 的加载逻辑

### 四、新建 `src-tauri/crates/ai-runtime`

建议包含：

- `executor.rs`
- `provider.rs`
- `completion.rs`
- `extract.rs`
- `reasoning.rs`
- `upload_flow.rs`
- `commands.rs`

职责：

- 负责真正的 AI 网页交互执行

### 五、迁移 `automator`

当前 `automator/src/browser.rs` 应逐步被拆解：

- tab 查找和连接迁移到 `browser-runtime`
- picker 能力保留，并抽成可复用组件
- 页面交互 API 改为调用 `browser-runtime`

目标：

- `automator` 不再自己管理浏览器连接生命周期

### 六、迁移 `miner`

当前 `miner/src/core/driver.rs` 应迁移：

- `Browser + handler` 生命周期下沉到 `browser-runtime`
- `miner` 只保留抓取业务逻辑
- 搜索场景和单页提取场景都通过共享 `BrowserSession` 获取页面

目标：

- `miner` 不再自己维护浏览器工厂

## 为什么不建议直接做“全 JSON 无代码”

因为以下场景最终会失败：

- 思考开关在弹层菜单中
- 上传按钮与隐藏 input 分离
- 页面含 shadow DOM
- 有的 provider 需要先聚焦 composer 再显示 send button
- 有的 provider 回复完成只能靠按钮状态或内容稳定度判断

因此最终设计必须是：

- 简单能力走 JSON
- 复杂流程允许 ActionStep
- 极少数复杂 provider 允许 Rust Hook

## 为什么不建议直接维护“全站点页面结构”

因为这种方式会产生以下问题：

- 规则数量爆炸
- 页面轻微改版就全部失效
- 很难抽象共性
- 测试成本过高
- 维护工作集中在脆弱的 DOM 细节，而不是实际交互流程

最优做法仍然是：

- 维护最小交互契约
- 把站点变化收敛为少量关键节点更新

## 阶段计划

### Phase 1：底座重构

目标：

- 建立 `browser-runtime`
- 去除固定 `9222`
- 建立 profile 隔离
- 统一 `BrowserSession` / `PageSession`

交付：

- `automator` 和 `miner` 都可通过共享 runtime 获取 page

### Phase 2：Adapter 体系

目标：

- 建立 `ai-adapters`
- 支持官方 adapter + 本地 override
- 建立 schema 校验
- 建立 selector 验证工具

交付：

- 至少 2 到 3 个 provider 内置 adapter

### Phase 3：AI Runtime MVP

目标：

- 实现统一执行流程
- 支持文本输入
- 支持文件上传
- 支持思考开关
- 支持回复完成判定
- 支持结果提取

交付：

- 从已登录页面完成一次端到端调用

### Phase 4：拾取和修复工具

目标：

- 复用现有 picker
- 一键更新本地 adapter
- 生成调试报告

交付：

- 页面结构变化后无需改核心代码即可修复

## MVP 范围建议

第一版建议只支持以下能力：

- attach 当前已登录 tab
- 输入文本
- 上传单文件
- 开关思考
- 点击发送
- 等待回答完成
- 读取最后一条回答文本

先不要做：

- 多文件队列上传
- 多模型切换
- 多轮上下文管理
- 引用卡片提取
- Markdown 富格式结构恢复
- 网络抓包驱动的 provider 逆向

## 推荐的首批官方支持 provider

建议首批只做：

- ChatGPT
- Claude
- Gemini

原因：

- 用户认知高
- 页面结构相对明确
- 能较快验证 adapter 体系设计是否正确

等底层稳定后再扩展：

- Perplexity
- Grok
- DeepSeek
- Kimi
- Qwen

## 实施 TODO

### P0

- [ ] 新建 `src-tauri/crates/browser-runtime`
- [ ] 将 `Browser + handler` 生命周期统一收口
- [ ] 去掉固定调试端口 `9222`
- [ ] 为 browser session 增加 registry
- [ ] 重构 profile 路径为 `provider + account + mode`

### P1

- [ ] 新建 `src-tauri/crates/ai-adapters`
- [ ] 定义 `adapter.schema.json`
- [ ] 实现官方 adapter 加载
- [ ] 实现本地 override 加载
- [ ] 实现 adapter 匹配器
- [ ] 实现 selector 校验器

### P2

- [ ] 新建 `src-tauri/crates/ai-runtime`
- [ ] 实现 composer 定位与输入
- [ ] 实现上传流程
- [ ] 实现 reasoning enable/disable steps
- [ ] 实现 send flow
- [ ] 实现 completion 判断
- [ ] 实现最后一条 assistant message 提取

### P3

- [ ] 迁移 `automator` 到 `browser-runtime`
- [ ] 迁移 `miner` 到 `browser-runtime`
- [ ] 抽出 picker 能力供 adapter 修复工具复用

### P4

- [ ] 内置 `ChatGPT` adapter
- [ ] 内置 `Claude` adapter
- [ ] 内置 `Gemini` adapter
- [ ] 增加 adapter 回归测试
- [ ] 增加页面变化后的本地修复流程

## 最终判断

这件事适合做，而且应该做成：

- **共享浏览器运行时**
- **官方维护的 Provider Adapter JSON**
- **本地 override 修复机制**
- **只关注最小交互契约**

不应该做成：

- 每个站点一套硬编码 Rust 逻辑
- 维护完整页面结构
- 继续把浏览器能力分散在 `automator` 和 `miner`
- 直接引入另一套主浏览器库重来

最终方向应当是：

- 底层统一
- 适配器可维护
- 页面变化可修复
- 业务层不直接依赖具体站点 DOM 细节
