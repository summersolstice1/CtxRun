# AI Web Flow 最终方案

## 目标

为 CtxRun 设计一套最终可落地的 AI 网页接入方案，使系统在 **用户自行完成登录** 的前提下，能够稳定完成：

- 定位输入框
- 上传文件或图片
- 开启或关闭思考模式
- 点击发送
- 直接从网页请求返回的流中读取结果
- 解析出思考内容、正式回复、完成状态
- 在流读取失败时退回 DOM 作为兜底

本方案是对 `TODO-AI.md` 的进一步收敛，重点明确：

- 请求如何发出
- 结果如何读取
- provider 如何维护
- parser 应该如何设计

---

## 最终结论

最终方案采用：

- **UI 负责提交**
- **Network Stream 负责读取结果**
- **DOM 只作为 fallback**

完整执行模型为：

1. 附着到用户已登录的网页 tab
2. 用页面组件完成输入、上传、思考开关、发送
3. 发送前开启目标请求的网络捕获
4. 点击发送后直接监听并解析返回流
5. 从流中组装 `thinking / answer / done`
6. 如果流捕获失败，再退回 DOM 提取最后一条回答

这不是“纯 DOM 自动化”，也不是“纯协议伪造请求”，而是最适合当前项目的 **Hybrid 模式**。

---

## 为什么这是最终方案

### 1. 输入和上传仍然必须走 UI

原因：

- 登录态、站点状态、当前会话都在真实页面里
- 上传文件和图片通常依赖真实页面的组件树和隐藏 input
- 思考开关往往也是 UI 按钮或菜单动作
- 直接伪造请求会碰到 token、上下文、签名、版本漂移问题

所以前半段必须按“像用户一样操作网页”来做。

### 2. 输出结果不应继续以 DOM 为主

原因：

- DOM 渲染通常滞后于真实返回流
- DOM 容易混入额外组件、折叠区域、引用块、按钮、隐藏文本
- 不同 provider 的渲染结构变化快
- 流里往往已经带有更干净的结构化信息

所以后半段应该优先从网络流直接读取结果。

### 3. 你抓到的样本已经证明流是可解析的

从 `TODO-AIR.md` 的样本看：

- ChatGPT 是 SSE + patch
- DeepSeek 是 SSE + fragments / patch
- z.ai 是 SSE + `phase`

它们不是杂乱无章的字节流，而是有稳定结构的增量事件流。

因此，最终设计应该把“流解析”上升为主路径。

---

## 基于样本的判断

### ChatGPT

在 `TODO-AIR.md` 中可以看到：

- 请求路径固定在 `/backend-api/f/conversation`
- 响应是 SSE 风格
- 存在 `event: delta` 和多段 `data: ...`
- 可见回答通过 patch 追加到 `/message/content/parts/0`
- 最终由 `message_stream_complete` 或 `[DONE]` 收尾

这说明：

- ChatGPT 适合定义为 `SSE + PatchParser`
- 不应该直接拼所有 `data:`
- 必须只提取“用户可见 assistant message”的 patch

同时需要注意：

- 流里混有 system / developer / hidden message
- 样本中还有用户 profile、内部 metadata、trace 信息

所以 ChatGPT parser 必须有明确过滤规则。

### DeepSeek

在 `TODO-AIR.md` 中可以看到：

- 请求路径是 `/api/v0/chat/completion`
- 返回同样是 SSE 风格
- 数据模型里有 `response.fragments`
- fragment 明确区分 `THINK` 和 `RESPONSE`
- 状态通过 `WIP -> FINISHED` 完成

这说明：

- DeepSeek 适合定义为 `SSE + FragmentParser`
- 思考与正式回答可以天然分开
- 这类 provider 非常适合优先走流解析而不是 DOM 提取

### z.ai

在 `TODO-AIR.md` 中可以看到：

- 请求路径是 `/api/v2/chat/completions`
- 每条数据都带 `phase`
- `phase` 可能是：
  - `thinking`
  - `answer`
  - `done`

这说明：

- z.ai 适合定义为 `SSE + PhaseParser`
- 是最容易标准化的一类 provider

---

## 最终架构

建议将最终实现拆成三层：

### 1. UI Adapter

负责：

- 找输入框
- 输入文本
- 上传文件
- 开关思考
- 点击发送

它只关心“如何发请求”，不关心如何读结果。

### 2. Capture Adapter

负责：

- 匹配目标网络请求
- 指定流协议类型
- 声明捕获优先级
- 指定 fallback 策略

它只关心“抓哪条流”，不关心具体如何解析业务字段。

### 3. Stream Parser

负责：

- 按 provider 语义解析流事件
- 组装思考内容
- 组装最终回答
- 判定是否完成
- 忽略噪音事件和隐藏消息

它只关心“如何把流变成结构化结果”。

---

## 三层职责边界

### UI Adapter 应负责的内容

- `composer`
- `upload_button`
- `upload_input`
- `reasoning_toggle`
- `send_button`

### Capture Adapter 应负责的内容

- `method`
- `url_contains`
- `resource_type`
- `transport`
- `preferred_capture_mode`

### Stream Parser 应负责的内容

- `parse_event_line`
- `accumulate_thinking`
- `accumulate_answer`
- `detect_done`
- `filter_hidden_payload`

不能把 parser 逻辑塞进 JSON。

原因：

- ChatGPT 是 patch 语义
- DeepSeek 是 fragments + patch
- z.ai 是 phase 模型

这三种结构差异太大，必须保留 Rust parser。

---

## 最终执行链

### 标准执行流程

1. attach 到当前已登录 tab
2. 识别当前 provider
3. 加载 provider 的 UI adapter
4. 加载 provider 的 capture adapter
5. 初始化 provider stream parser
6. 启动网络监听
7. 用 UI adapter：
   - 设置思考开关
   - 上传文件
   - 输入 prompt
   - 点击发送
8. 等待 capture adapter 命中目标请求
9. stream parser 持续消费事件
10. 一旦解析出 `done`：
    - 返回 `thinking`
    - 返回 `answer`
    - 返回 `status`
11. 若超时或解析失败：
    - 退回 DOM fallback
    - 读取最后一条 assistant message

### 最终职责划分

- 发请求：靠 UI
- 拿结果：靠 Stream
- 保底：靠 DOM

---

## 不采用的两种路线

### 不采用纯 DOM 路线

原因：

- 结果提取不稳定
- 无法可靠区分 thinking 和 answer
- 完成状态判定容易误判
- 页面结构变化成本高

### 不采用纯协议伪造路线

原因：

- 请求中往往带复杂 token、requestId、上下文、设备特征
- 容易随着 provider 更新立即失效
- 会与“用户自己登录网页”的产品模型冲突

最终路线只能是：

- **真实页面发请求**
- **真实请求流拿结果**

---

## Capture 模型设计

### CaptureMode

建议设计三个模式：

- `dom_only`
- `network_completed_body`
- `network_live_stream`

最终默认首选：

- `network_live_stream`

fallback 顺序建议：

- `network_live_stream`
- `network_completed_body`
- `dom_only`

### Transport 类型

建议支持：

- `sse`
- `fetch_stream`
- `websocket`
- `unknown`

第一阶段优先支持：

- `sse`
- `fetch_stream_like_sse`

因为你当前抓到的三个样本都可以按 SSE 语义处理。

### CaptureAdapter JSON 建议

```json
{
  "id": "chatgpt",
  "capture": {
    "preferred_mode": "network_live_stream",
    "fallback_mode": "dom_only",
    "transport": "sse",
    "match": {
      "method": "POST",
      "url_contains": [
        "/backend-api/",
        "/conversation"
      ]
    },
    "parser": "chatgpt_sse_patch_v1",
    "done_markers": [
      "[DONE]",
      "message_stream_complete"
    ]
  }
}
```

说明：

- JSON 只描述怎么匹配和选 parser
- 真正 parser 逻辑在 Rust 内部实现

---

## Parser 模型设计

建议新增统一 parser trait：

```rust
pub trait ProviderStreamParser {
    fn on_chunk(&mut self, chunk: &str) -> ParseStatus;
    fn result(&self) -> ParsedStreamResult;
}
```

建议输出结构：

```rust
pub struct ParsedStreamResult {
    pub thinking: Option<String>,
    pub answer: Option<String>,
    pub done: bool,
    pub warnings: Vec<String>,
}
```

### ChatGPT Parser

建议命名：

- `chatgpt_sse_patch_v1`

职责：

- 忽略 hidden system/developer/input_message
- 只跟踪目标 assistant message
- 只拼接 `/message/content/parts/0`
- 从 patch 中提取最终 answer
- 以 `message_stream_complete` 或 `[DONE]` 为结束

### DeepSeek Parser

建议命名：

- `deepseek_sse_fragments_v1`

职责：

- 识别 `THINK` fragment
- 识别 `RESPONSE` fragment
- 处理 `APPEND` 和 `SET`
- 以 `status=FINISHED` 或 `event: close` 为结束

### z.ai Parser

建议命名：

- `zai_sse_phase_v1`

职责：

- `phase=thinking` 追加到 thinking
- `phase=answer` 追加到 answer
- `phase=done` 标记完成

---

## Adapter 最终设计

最终 adapter 不再只是一份“页面节点定义”，而是要包含两部分：

- `ui`
- `capture`

### ProviderAdapter JSON 结构建议

```json
{
  "id": "zai",
  "version": 1,
  "display_name": "Z.ai",
  "match": {
    "hosts": ["chat.z.ai"]
  },
  "capabilities": {
    "text_input": true,
    "file_upload": true,
    "reasoning_toggle": true,
    "stream_output": true
  },
  "ui": {
    "selectors": {
      "composer": ["textarea", "[contenteditable='true']"],
      "upload_input": ["input[type='file']"],
      "send_button": ["button[type='submit']"],
      "assistant_message": [".assistant-message"]
    },
    "reasoning": {
      "mode": "toggle",
      "enable_steps": [],
      "disable_steps": []
    }
  },
  "capture": {
    "preferred_mode": "network_live_stream",
    "fallback_mode": "dom_only",
    "transport": "sse",
    "match": {
      "method": "POST",
      "url_contains": ["/api/v2/chat/completions"]
    },
    "parser": "zai_sse_phase_v1"
  }
}
```

---

## 对现有项目的设计调整

相比 `TODO-AI.md`，最终需要补上以下设计调整。

### 1. `browser-runtime` 不只是 page 操作层

还必须负责：

- 网络监听
- 请求匹配
- 事件分发
- provider parser 生命周期

建议新增模块：

- `capture.rs`
- `stream.rs`
- `parsers/mod.rs`

### 2. `ai-runtime` 必须支持“发送前开启监听”

不能先点发送再去抓。

标准顺序必须是：

- prepare capture
- arm parser
- click send
- consume stream

### 3. `ai-adapters` 必须新增 `capture` 段

当前只定义 UI 节点不够。

必须新增：

- `preferred_mode`
- `transport`
- `request match`
- `parser id`
- `done markers`

### 4. `DOM fallback` 必须保留

不能因为流是主路径就删掉 DOM 提取。

需要 fallback 的场景包括：

- provider 更新了流格式
- 请求被代理或中间层改写
- 某些页面结果并未走你当前可见的那条流
- parser 尚未适配新版本

---

## MVP 范围

第一版建议只做：

- attach 当前 tab
- 输入文本
- 上传单文件
- 设置思考开关
- 点击发送
- 按 provider 监听目标流
- 解析 `thinking / answer / done`
- 失败时退回 DOM 提取 answer

第一版不要做：

- 纯协议复放
- 复杂多文件批量上传
- 富文本结构恢复
- 统一跨 provider 的思考树可视化
- 自动逆向未知 provider

---

## 官方维护策略

仍然建议官方维护一套核心 provider adapter。

但现在每个 provider 维护的内容变成：

- UI Adapter
- Capture Adapter
- Parser ID

而不是只维护 selector。

### 官方优先维护的 provider

- ChatGPT
- Claude
- Gemini
- DeepSeek
- z.ai

原因：

- 这些 provider 有明显的产品价值
- 当前至少已有部分流样本
- 适合优先验证 Hybrid 架构

### 本地 override 仍然保留

优先级：

- local override
- built-in official

但 override 只能覆盖：

- UI selector
- capture match
- parser version id

不要允许用户随意把 Rust parser 逻辑写进 JSON。

---

## 测试策略

必须新增三类测试。

### 1. Adapter 匹配测试

验证：

- host/url/title 是否正确命中 provider

### 2. Stream Parser 单元测试

使用脱敏后的样本流做测试。

验证：

- thinking 是否正确聚合
- answer 是否正确聚合
- done 是否正确判定
- 隐藏事件是否被过滤

### 3. 端到端回归测试

验证：

- UI 发送成功
- capture 能命中目标请求
- parser 返回正确结果
- fallback 能工作

---

## 风险与注意事项

### 1. “Unicode 解码”不是核心难点

像 ChatGPT 样本中的 `\u8f6f\u4ef6...` 只是 JSON 转义。

这部分交给 `serde_json` 即可，不值得单独作为方案核心。

真正难点是：

- 如何识别哪一段是用户可见回复
- 如何过滤隐藏消息
- 如何判定完成

### 2. 完整 URL 不能当协议本体

不能把某个完整 URL 写死为唯一规则。

应维护：

- host
- path pattern
- method
- transport
- parser id

### 3. 样本必须脱敏

当前 `TODO-AIR.md` 中包含：

- token
- requestId
- user_id
- profile 信息
- 内部 metadata

这些样本后续如果用于测试，必须先脱敏。

### 4. parser 必须可版本化

建议命名：

- `chatgpt_sse_patch_v1`
- `chatgpt_sse_patch_v2`
- `deepseek_sse_fragments_v1`
- `zai_sse_phase_v1`

避免未来 provider 升级时只能覆盖旧逻辑。

---

## 实施步骤

### Phase 1

- [ ] 为 `TODO-AI` 方案补充 `capture/parser` 设计
- [ ] 在 `browser-runtime` 中增加 network event capture
- [ ] 设计统一 `ProviderStreamParser` trait

### Phase 2

- [ ] 为 adapter schema 增加 `capture` 节
- [ ] 实现 `network_live_stream` 模式
- [ ] 实现 `dom_only` fallback

### Phase 3

- [ ] 实现 `chatgpt_sse_patch_v1`
- [ ] 实现 `deepseek_sse_fragments_v1`
- [ ] 实现 `zai_sse_phase_v1`

### Phase 4

- [ ] 打通 UI submit + stream capture 的端到端链路
- [ ] 增加脱敏流样本测试
- [ ] 增加 provider 回归测试

---

## 最终判断

最终方案不是：

- 纯 DOM 提取
- 纯抓包伪造请求
- 全部逻辑写死在 JSON

最终方案应该是：

- **UI 负责输入、上传、思考开关、发送**
- **Stream 负责思考、回答、完成状态提取**
- **DOM 负责 fallback**
- **JSON 负责 provider 配置**
- **Rust 负责 provider parser**

用一句话总结就是：

- **像用户一样在页面里发请求，像协议解析器一样从流里拿结果。**



设计的最佳的json格式：
{
  "schema_version": 1,
  "provider": {
    "id": "chatgpt",
    "display_name": "ChatGPT",
    "official": true,
    "adapter_version": 1,
    "status": "active"
  },
  "match": {
    "hosts": ["chatgpt.com", "chat.openai.com"],
    "title_contains": ["ChatGPT"],
    "dom_markers": ["textarea", "[contenteditable='true']"]
  },
  "capabilities": {
    "text_input": true,
    "file_upload": true,
    "image_upload": true,
    "reasoning_toggle": true,
    "stream_output": true,
    "thinking_output": false
  },
  "ui": {
    "selectors": {
      "composer": ["textarea", "[contenteditable='true']"],
      "send_button": ["button[data-testid='send-button']", "button[aria-label*='send']"],
      "upload_input": ["input[type='file']"],
      "upload_button": ["button[aria-label*='upload']"],
      "reasoning_toggle": ["button[aria-pressed]"],
      "assistant_message": ["[data-message-author-role='assistant']"]
    },
    "flows": {
      "submit": [
        { "type": "focus", "target": "composer" },
        { "type": "set_text", "target": "composer" },
        { "type": "click", "target": "send_button" }
      ],
      "enable_reasoning": [
        { "type": "click", "target": "reasoning_toggle" }
      ],
      "disable_reasoning": [
        { "type": "click", "target": "reasoning_toggle" }
      ],
      "upload_files": [
        { "type": "set_files", "target": "upload_input" }
      ]
    }
  },
  "captures": [
    {
      "id": "main",
      "priority": 100,
      "transport": "http_stream",
      "framing": "sse",
      "request_match": {
        "method": "POST",
        "host_in": ["chatgpt.com", "chat.openai.com"],
        "url_contains": ["/backend-api/", "/conversation"],
        "response_content_type_contains": ["text/event-stream"]
      },
      "parser": {
        "family": "sse_json_patch",
        "id": "chatgpt_sse_patch_v1",
        "options": {
          "answer_path": "/message/content/parts/0",
          "visible_role": "assistant",
          "visible_channel": "final",
          "ignore_hidden": true,
          "done_markers": [
            { "kind": "json_type", "eq": "message_stream_complete" },
            { "kind": "raw", "eq": "[DONE]" }
          ]
        }
      }
    }
  ],
  "fallback": {
    "mode": "dom_last_assistant_message",
    "timeout_ms": 5000
  },
  "tests": {
    "fixture_ids": ["chatgpt_hello_001"],
    "expected": {
      "has_answer": true,
      "has_thinking": false
    }
  },
  "extensions": {}
}
