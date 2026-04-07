# CtxRun 开发流程文档

> 本文档记录 CtxRun 项目的完整开发历程，基于 git 提交历史和代码变更分析编写。

## 项目概述

**CtxRun** 是一款专为开发者打造的 AI 辅助生产力工具，基于 Tauri 框架构建。

### 技术栈
- **核心框架**: Tauri 2 (Rust 1.91 + WebView2)
- **前端**: React 19 + TypeScript + Vite 7
- **状态管理**: Zustand 5
- **样式**: Tailwind CSS + tailwindcss-animate
- **编辑器**: Monaco Editor
- **国际化**: i18next + react-i18next (JSON locale)
- **测试**: Vitest + Testing Library

---

## 版本历史

### v2.3.0 (2026-04-04) 📡 Transfer + 🛡️ Guard + 🖥️ 多窗口架构

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `525264d` | **发布** | 版本发布 2.3.0 |
| `7acfa5d` | **优化翻译** | i18n 翻译质量优化 |
| `12206f8` | **新增传输** | Transfer 局域网传输模块 |
| `7dab26d` | **发布** | 版本发布 2.2.9 |
| `fb792a0` | **新增网络** | 网络接口发现和工具集成 |
| `739867d` | **优化电池** | 电池信息监控 |
| `5c18c51` | **新增模块** | process-utils 和 env-probe 增强 |

**v2.3.0 Transfer 文件传输模块文件变更**:
```
src-tauri/crates/transfer/Cargo.toml               | +28   新增 transfer crate
src-tauri/crates/transfer/src/lib.rs               | +34   插件入口
src-tauri/crates/transfer/src/commands.rs          | +332  Tauri 命令 (start/stop/send)
src-tauri/crates/transfer/src/models.rs            | +246  数据模型
src-tauri/crates/transfer/src/server.rs            | +408  Axum HTTP 服务器
src-tauri/crates/transfer/src/network.rs           | +403  网络接口发现
src-tauri/crates/transfer/src/ws.rs                | +321  WebSocket 实时通信
src-tauri/crates/transfer/src/device.rs            | +222  设备管理
src-tauri/crates/transfer/src/transfer.rs          | +138  文件传输逻辑
src-tauri/crates/transfer/src/qr.rs                | +30   二维码生成
src-tauri/crates/transfer/src/mobile.rs            | +11   移动端支持
src-tauri/crates/transfer/src/mobile_template.html | +706  移动端 HTML 模板
src/components/features/transfer/TransferView.tsx   | +120  主视图
src/components/features/transfer/ChatPanel.tsx      | +233  聊天面板
src/components/features/transfer/DeviceSidebar.tsx  | +59   设备侧边栏
src/components/features/transfer/ServiceControls.tsx| +69   服务控制
src/components/features/transfer/QrCodeSVG.tsx      | +30   二维码 SVG
src/store/useTransferStore.ts                      | +414  状态管理
src/types/transfer.ts                              | +89   类型定义
```

**v2.3.0 Guard 守护模块文件变更**:
```
src-tauri/src/guard.rs                              | +638  空闲锁屏守护核心
src/windows/guard/GuardWindowApp.tsx                | +203  锁屏窗口前端
src-tauri/capabilities/guard.json                   | +21   Guard 权限配置
src-tauri/src/tray_support.rs                       | +19   托盘支持
```

**v2.3.0 多窗口架构重构文件变更**:
```
src/App.tsx              → src/windows/main/MainWindowApp.tsx          重命名迁移
src/SpotlightApp.tsx     → src/windows/spotlight/SpotlightWindowApp.tsx 重构 (157行)
src/PeekApp.tsx          → src/windows/peek/PeekWindowApp.tsx           重构迁移
src/windows/spotlight/resizeMode.ts                  | +97  窗口尺寸调整模式
```

**v2.3.0 i18n 重构文件变更**:
```
src/lib/i18n.ts           | -1597  删除旧内联翻译
src/i18n/locales/zh.json  | +879   中文翻译 JSON
src/i18n/locales/en.json  | +879   英文翻译 JSON
```

**v2.3.0 监控增强文件变更**:
```
src-tauri/crates/env-probe/src/commands/monitoring.rs  | +1182  监控探测大幅增强
src-tauri/crates/env-probe/src/commands/system_info.rs | +61   系统信息
src/components/features/monitor/tabs/MonitorDashboard.tsx | +989  仪表盘重构
src/types/monitor.ts                                   | +61   监控类型
```

**主要更新**:
- 📡 **Transfer 局域网传输**: 全新局域网文件传输和即时聊天模块
  - 基于 **Axum** HTTP 服务器 + **WebSocket** 实时通信
  - 设备自动发现（网络接口扫描，虚拟网卡过滤）
  - **二维码** 分享连接 URL，手机扫码即用
  - 文件传输进度追踪、审批/拒绝
  - 内置移动端 HTML 聊天界面
- 🛡️ **Guard 空闲守护**: 空闲超时自动锁屏
  - Windows 低级键盘/鼠标钩子全局拦截
  - 后台线程每秒检测空闲时间
  - 全屏覆盖锁屏窗口，长按 1.5s 圆形进度条解锁
  - 支持防止系统休眠、保持屏幕常亮
- 🖥️ **多窗口架构**: 从单入口迁移到多窗口
  - `MainWindowApp` / `SpotlightWindowApp` / `PeekWindowApp` / `GuardWindowApp`
  - 跨窗口状态同步 (`useCrossWindowAppStoreSync`)
- 🌍 **i18n 迁移**: 从 `i18n.ts` 单文件迁移到 JSON locale (879 行/语言)
- 📊 **系统监控大幅增强**: 电池、磁盘详情、网络流量、端口进程、网络测速

---

### v2.2.9 (2026-04-01) 🔋 系统监控增强

**主要更新**:
- 🔋 **电池信息**: 电量、健康度、功率、温度、充放电时间
- 🌐 **网络接口详情**: MAC、MTU、网关、流量统计
- 📊 **进程列表**: CPU/内存使用率、系统进程标识
- 🛡️ **Guard 基础**: 空闲锁屏模块初步实现

---

### v2.2.8 (2026-03-28) 🔒 Exec Runtime + 👁️ Peek 窗口

**v2.2.8 Exec Runtime 文件变更**:
```
src-tauri/crates/exec-runtime/Cargo.toml            | +新  新增 crate
src-tauri/crates/exec-runtime/src/lib.rs            | +29  插件入口
src-tauri/crates/exec-runtime/src/commands.rs       | +XX  request/approve/write/resize/terminate
src-tauri/crates/exec-runtime/src/manager.rs        | +XX  进程管理器
src-tauri/crates/exec-runtime/src/models.rs         | +XX  数据模型
src-tauri/crates/exec-runtime/src/safety.rs         | +XX  安全策略 (沙箱)
src-tauri/crates/exec-runtime/src/powershell_parser.ps1 | +XX  PowerShell 解析器
src-tauri/crates/process-utils/Cargo.toml            | +新  进程工具 crate
```

**v2.2.8 Peek 预览窗口文件变更**:
```
src-tauri/src/peek.rs                               | +XX  Peek 窗口后端
src-tauri/capabilities/peek.json                    | +XX  Peek 权限
src/PeekApp.tsx                                     | +XX  前端入口
src/components/features/hyperview/renderers/DocxRenderer.tsx   | +132  DOCX 渲染器
src/components/features/hyperview/renderers/HtmlRenderer.tsx    | +XX  HTML 渲染器
src/components/features/hyperview/renderers/MarkupRenderer.tsx  | +XX  Markdown 渲染器
src/components/features/hyperview/renderers/PdfRenderer.tsx     | +XX  PDF 渲染器
src/components/features/hyperview/renderers/StructuredTextRenderer.tsx | +XX  结构化文本
```

**v2.2.8 Spotlight 执行增强文件变更**:
```
src/components/features/spotlight/exec/ExecApprovalSheet.tsx    | +XX  执行审批面板
src/components/features/spotlight/exec/ExecSessionCard.tsx      | +XX  执行会话卡片
src/components/features/spotlight/trace/AssistantTraceTimeline.tsx | +XX  AI Trace 时间线
src/components/features/spotlight/trace/ToolCallInlineBlock.tsx  | +XX  工具调用内联块
src/lib/exec/client.ts                              | +XX  执行客户端
src/store/useExecStore.ts                           | +XX  执行状态管理
src/types/exec.ts                                   | +XX  执行类型
```

**v2.2.8 网络测速文件变更**:
```
src/components/features/monitor/network/mlabSpeedTest.ts | +XX  M-Lab NDT7 测速
src/types/m-lab-ndt7.d.ts                                | +XX  类型声明
```

**主要更新**:
- 🔒 **Exec Runtime**: 命令执行运行时
  - 沙箱安全策略：命令白名单、路径限制
  - 执行审批机制 (`request_exec` → `approve_exec` / `terminate_exec`)
  - 终端尺寸调整和输入写入
- 👁️ **Peek 独立预览窗口**: 弹出式文件预览
  - 多格式渲染器：HTML、PDF、DOCX、Markdown、结构化文本
  - 独立 Tauri 窗口
- 🔧 **AI Trace 可视化**: 工具调用过程展示
  - 时间线视图 + 内联工具调用块
  - 运行中/成功/失败状态
- 📡 **网络测速**: M-Lab NDT7 集成
- 📄 **DOCX 预览**: Word 文档渲染

---

### v2.2.7 (2026-03-17) 🎡 轮盘导航

**v2.2.7 新增文件变更**:
```
src/components/layout/ViewSwitcher.tsx   | +XX  视图切换轮盘
src/components/ui/MarkdownContent.tsx    | +XX  统一 Markdown 渲染
```

**主要更新**:
- 🎡 **ViewSwitcher 轮盘导航**: 替代侧边栏的轮盘式视图切换 (`@spaceymonk/react-radial-menu`)
- 📝 **MarkdownContent**: 统一的 Markdown 内容渲染组件

---

### v2.2.6 (2026-03-12) 🏗️ 模块化重构 + ⚙️ 设置重构

**v2.2.6 Crate 模块化重构文件变更**:
```
src-tauri/crates/env-probe/Cargo.toml              | +13  环境探测 crate (从 src/ 迁移)
src-tauri/crates/env-probe/src/lib.rs              | +新  模块入口
src-tauri/crates/hyperview/Cargo.toml              | +12  文件预览 crate (从 src/ 迁移)
src-tauri/crates/hyperview/src/lib.rs              | +新  模块入口
src-tauri/crates/workspace-tests/Cargo.toml        | +新  集成测试 crate
src-tauri/crates/workspace-tests/tests/*.rs        | +XX  15+ 测试文件
```

**v2.2.6 设置页面重构文件变更**:
```
src/components/settings/sections/AISection.tsx               | +新  AI 配置页面
src/components/settings/sections/DataMaintenanceSection.tsx  | +新  数据维护页面
src/components/settings/sections/GeneralSection.tsx          | +新  通用设置页面
src/components/settings/sections/SearchWorkspaceSection.tsx  | +新  搜索/工作区页面
src/components/settings/sections/SecuritySection.tsx         | +新  安全设置页面
src/components/settings/SettingsView.tsx                     | +新  新设置视图
src/components/settings/SettingsNav.tsx                      | +新  导航栏
src/components/settings/SettingsUi.tsx                       | +新  UI 容器
src/components/layout/WorkspaceSwitcher.tsx                  | +新  工作区切换器
src/lib/theme.ts                                             | +新  主题工具
```

**主要更新**:
- 🏗️ **Crate 模块化**: env-probe / hyperview 从 `src/` 迁移为独立 crate
- ⚙️ **设置页面重构**: 从 `SettingsModal` 拆分为 5 个独立页面
- 🧪 **workspace-tests**: 新增 15+ 集成测试文件

---

### v2.2.5 (2026-03-05) 🤖 Agent Tool Runtime

**v2.2.5 Tool Runtime 文件变更**:
```
src-tauri/crates/tool-runtime/Cargo.toml            | +新  新增 crate
src-tauri/crates/tool-runtime/src/lib.rs            | +新  插件入口
src-tauri/crates/tool-runtime/src/runtime.rs        | +新  运行时核心
src-tauri/crates/tool-runtime/src/models.rs         | +新  ToolSpec/ToolCall 模型
src-tauri/crates/tool-runtime/src/sandbox.rs        | +新  沙箱策略引擎
src-tauri/crates/tool-runtime/src/fs_tools.rs       | +新  文件系统工具
src-tauri/crates/tool-runtime/src/miner_tools.rs    | +新  Miner 工具集成
src-tauri/crates/tool-runtime/src/agent_fs.rs       | +新  Agent 文件操作
src-tauri/crates/tool-runtime/src/patch_tools.rs    | +新  补丁应用工具
```

**v2.2.5 前端 Agent 系统文件变更**:
```
src/lib/agent/index.ts       | +新  Agent 入口
src/lib/agent/types.ts       | +新  Agent 类型 (ToolRiskLevel/AgentToolDefinition/AgentRuntimeCallbacks)
src/lib/agent/policy.ts      | +新  工具策略 (allowAll/allowList/denyList)
src/lib/agent/registry.ts    | +新  工具注册中心
src/lib/agent/runtime.ts     | +新  Agent 运行时
src/lib/agent/tools/fs.ts    | +新  文件系统工具
src/lib/agent/tools/web.ts   | +新  Web 工具
src/lib/chat_attachment.ts   | +新  聊天附件支持
```

**主要更新**:
- 🤖 **Agent Tool Runtime**: 全新 AI 工具运行时
  - `ToolSpec` 规范，`ToolCallRequest`/`ToolCallResponse` 模型
  - 三种策略模式 (`allowAll`/`allowList`/`denyList`)，风险分级
  - 沙箱安全引擎，审批拦截
  - 内置工具：文件系统、Web 搜索/提取、Miner、补丁
  - 架构灵感来自 OpenAI Codex CLI (codex-rs)
- 📎 **聊天附件**: Spotlight AI 对话支持文件附件
- ⛏️ **Miner 增强**: 单页提取、Web 搜索、后处理管线
- 🔄 **底层替换**: AI 模型调用底层库替换

---

### v2.2.4 (2026-02-25)
Bug 修复和性能优化

### v2.2.3 (2026-02-24)
性能优化和 Bug 修复

### v2.2.2 (2026-02-21) ⛏️ Model Miner
**智能网页内容挖掘模块**
- headless_chrome 复用本地浏览器
- Readability.js 提取内容 → turndown.js 转 Markdown
- 多线程并发爬取 (1-10)，深度/页数限制，URL 前缀过滤
- 层次化 `{domain}/path/index.md` 存储，YAML front matter

---

### v2.2.1 (2026-02-17)
颜色主题选项

### v2.2.0 (2026-02-16) 🌍 i18n + 🖱️ UI Auto Tree
- **i18n 重构**: 迁移至 i18next + react-i18next，语法 `$var` → `{var}`
- **UI 自动树**: Automator 支持 Windows UIAutomation API 语义化元素定位

---

### v2.1.1 (2026-02-14)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `89d36c0` | **发布** | 版本发布 2.1.1 |
| `f2b23b5` | **修复 BUG** | 修复多个问题 |
| `16efab0` | **修复 BUG** | 修复问题 |

**主要更新**:
- 🐛 **BUG 修复**: 修复已知问题

---

### v2.1.0 (2026-02-14)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `7159fbb` | **发布** | 版本发布 2.1.0 |
| `ac07a3f` | **合并分支** | 合并 RE1 分支 |
| `10fd343` | **更新模型** | 更新 models.json 添加新模型 |
| `2d1b163` | **数据更新** | 自动同步提示词库 |

**v2.1.0 模型更新文件变更**:
```
models/models.json | 更新 AI 模型列表
```

**主要更新**:
- 🤖 **AI 模型更新**: 支持最新的 GPT-5.2、GPT-5.1、Gemini 3 Pro、Gemini 2.5 Pro、Claude Opus 4.5、Grok 4.1
- 📊 **上下文窗口**: Grok 4.1 支持 200万 tokens 上下文

---

### v2.0.4 (2026-02-12)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `05c4246` | **发布** | 版本发布 rc5 |
| `d2de29b` | **发布** | 上传资源 |
| `706540c` | **修复** | 修复问题 |
| `5e1bad4` | **更新模型** | 更新 AI 模型配置 |
| `73adf54` | **修复 BUG** | 修复 bug |
| `84eaa67` | **修复** | 修复问题 |
| `4eddf36` | **发布** | 版本发布 2.0.0+ |

**主要更新**:
- 🔧 **优化**: 性能调优和 bug 修复

---

### v2.0.0 (2026-02-11)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `f4e778f` | **发布** | 版本发布 2.0.0 |

**v2.0.0 架构重构文件变更**:
```
src-tauri/crates/automator/    | +XXX  自动点击器模块
src-tauri/crates/context/      | 重构 上下文模块
src-tauri/crates/db/           | 重构 数据库模块
src-tauri/crates/git/          | 重构 Git 模块
src-tauri/crates/refinery/     | 重构 Refinery 模块
src/components/features/automator/ | +XXX  自动点击器 UI
src/store/useAutomatorStore.ts | +XXX  状态管理
src/types/automator.ts         | +XXX  类型定义
```

**主要更新**:
- 🏗️ **架构重构**: 单体 src-tauri/src 拆分为多 crates 架构
- 🖱️ **Automator 自动点击器**: 支持左键/右键/中键点击，可配置间隔和次数
- 🔧 **模块化**: 每个功能独立 crate，提升代码可维护性

---

### v1.5.5 (2026-02-07)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `71e09d9` | **发布** | 版本发布 1.5.5 |
| `70f2bda` | **修复 BUG** | 修复 bug |
| `b434755` | **优化** | 优化功能 |
| `0162c53` | **优化** | 优化体验 |
| `1a9e1b9` | **修复 BUG** | 修复问题 |

**主要更新**:
- 🐛 **BUG 修复**: 修复已知问题
- ⚡ **性能优化**: 整体性能提升

---

### v1.5.4 (2026-02-06)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `9dfd712` | **发布** | 版本发布 1.5.4 |

---

### v1.5.3 (2026-02-05)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `31c8706` | **发布** | 版本发布 1.5.3 |
| `af5cd47` | **优化** | 功能优化 |

---

### v1.5.2 (2026-02-04)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `8f9cddc` | **发布** | 版本发布 1.5.2 |
| `1fd5006` | **修复 BUG** | 修复 Bug |
| `0151d03` | **修复 BUG** | 解决问题 |
| `9ddf7d1` | **修复 BUG** | 修复自我复制问题 |

---

### v1.5.1 (2026-02-02)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `24753b4` | **发布** | 版本发布 1.5.1 |
| `6215b42` | **优化** | 优化功能 |
| `3064a42` | **修复 BUG** | 修复 bug |
| `6859a96` | **新增** | 添加功能 |
| `0c4a956` | **新增** | 添加功能 |
| `17edca5` | **新增** | 添加内容 |
| `c3751ce` | **更新** | 更新配置 |
| `aa04326` | **新增** | 添加图片 |
| `5398b63` | **优化** | 优化体验 |
| `105f853` | **优化** | 优化自动清理 |
| `5640a0f` | **优化** | 优化色调 |
| `da4d3e4` | **优化** | 优化配色 |

**主要更新**:
- 🎨 **样式优化**: 界面配色改进
- 🧹 **自动清理**: 优化清理逻辑

---

### v1.5.0 (2026-01-30)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `346782c` | **发布** | 版本发布 1.5.0 |
| `a07717a` | **修复 BUG** | 1.5.0-beta.1-fix |
| `a42628b` | **测试版本** | 1.5.0-beta.1 |
| `dabde8d` | **更新版本** | 版本号更新 |
| `a774027` | **清理** | 代码清理 |
| `b32fd4c` | **优化显示** | 优化显示，优化配色 |
| `8389414` | **优化 URL** | 优化 url 展示 |
| `6ba6da5` | **优化色彩** | 优化色彩方案 |
| `df3ba50` | **优化代码** | 代码优化 |
| `6db79fd` | **优化** | 功能优化 |
| `238412d` | **优化动画** | 动画效果优化 |
| `f964f67` | **优化渲染** | 渲染性能优化 |
| `d51c823` | **优化** | 综合优化 |
| `fb5e010` | **优化** | 功能优化 |
| `55d62ca` | **优化** | 体验优化 |
| `cbc9a5c` | **数据更新** | 自动同步提示词库 |
| `2f03879` | **修复 BUG** | 修复 BUG |
| `c58f490` | **优化忽略** | 优化自我复制忽略 |
| `f43cce6` | **优化** | 性能优化 |
| `db3b0f3` | **优化** | 功能优化 |
| `204e028` | **优化** | 代码优化 |
| `4e4d7d5` | **优化** | 优化配置 |
| `70eb9e3` | **优化** | 界面优化 |
| `7dfa7a2` | **新增功能** | 添加 notes 字段支持 |
| `d8a47ec` | **新增窗口信息** | 获取窗口信息功能 |
| `fd127b8` | **新增粘贴板** | Refinery 剪贴板历史 |
| `db7d3dd` | **更新年份** | update 2024 |
| `f8944e0` | **优化规则** | 优化 .gitignore 规则支持 |
| `2726ea4` | **优化** | 代码优化 |
| `342013e` | **优化** | 性能优化 |
| `14e6a13` | **优化** | 体验优化 |
| `c311757` | **更新文档** | update dev.md |
| `91eeb19` | **修复 BUG** | 修复 BUG |

**v1.5.0 Refinery 功能文件变更**:
```
src-tauri/migrations/V3__create_refinery_table.sql | +XXX  创建 refinery 表
src-tauri/migrations/V4__refinery_notes.sql   | +XX   添加 notes 字段
src-tauri/src/refinery/mod.rs                | +XXX  Refinery 模块
src-tauri/src/refinery/commands.rs           | +XXX  命令接口
src-tauri/src/refinery/model.rs              | +XX   数据模型
src-tauri/src/refinery/storage.rs             | +XXX  存储层
src-tauri/src/refinery/worker.rs             | +XXX  工作线程
src/components/features/refinery/RefineryView.tsx       | +XXX  主视图
src/components/features/refinery/RefineryDrawer.tsx     | +XXX  侧边栏
src/components/features/refinery/RefineryFeed.tsx       | +XXX  历史列表
src/components/features/refinery/RefinerySidebar.tsx    | +XXX  侧边栏
src/components/features/refinery/ContentWorkbench.tsx    | +XXX  内容工作台
src/components/features/refinery/HistoryItem.tsx        | +XXX  历史项
src/components/features/refinery/HistorySidebar.tsx     | +XXX  历史侧边栏
src/store/useRefineryStore.ts                          | +XXX  状态管理
src/types/refinery.ts                                  | +XX   类型定义
src/lib/refinery_utils.ts                             | +XX   工具函数
```

**v1.5.0 .gitignore 优化文件变更**:
```
.gitignore              | +X   添加自我复制忽略规则
src-tauri/src/main.rs  | +-X  添加 .gitignore 文件读取
```

**主要更新**:
- 📋 **Refinery 剪贴板历史**:
  - 支持文本和图片剪贴板历史记录
  - 可搜索、筛选 (文本/图片)
  - 支持收藏 (pin) 重要条目
  - 支持添加笔记注释
  - 自动清理配置
  - 日历视图按日期筛选
  - Spotlight 快捷粘贴集成
- 🔒 **.gitignore 规则**: 支持读取项目 .gitignore 过滤文件
- 🎨 **UI 优化**: 整体配色和动画优化
- ⚡ **性能优化**: 渲染和动画性能提升

---

### v1.4.1 (2026-01-29)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `f176194` | **优化提醒** | 休息提醒逻辑迁移至 Rust 后端 |
| `6ecf718` | **优化内存占用** | 窗口生命周期管理，自动销毁隐藏窗口 |
| `7108081` | **数据更新** | 自动同步提示词库 |

**v1.4.1 提醒系统优化文件变更**:
```
src-tauri/src/scheduler.rs               | +98  新增调度器模块
src-tauri/src/main.rs                    | +6   状态管理集成
src/App.tsx                              | -56 +3 前端逻辑简化
src/components/settings/AboutSection.tsx | +-2  版本号更新
```

**v1.4.1 内存优化文件变更**:
```
src-tauri/src/main.rs                     | +118 -48 窗口生命周期重构
src/App.tsx                               | -33    移除快捷键注册逻辑
src/SpotlightApp.tsx                      | +35    快捷键注册迁移
src/components/layout/TitleBar.tsx        | +-9    关闭按钮优化
src/components/settings/SettingsModal.tsx | +65    新增自动销毁设置
src/lib/i18n.ts                           | +8     新增国际化词条
src/store/useAppStore.ts                  | +7     新增状态字段
```

**主要更新**:
- ⏰ **后端调度器**: 新增 `scheduler.rs` 模块，休息提醒逻辑从前端迁移至 Rust 后端
- 🔔 **系统级通知**: 使用 `tauri-plugin-notification` 发送系统原生通知
- 💾 **内存优化**: 隐藏的窗口在延迟后自动销毁，释放内存资源
- ⚙️ **可配置延迟**: 支持在设置中配置窗口自动销毁延迟时间（30秒-30分钟）
- 🎯 **架构优化**: Spotlight 快捷键注册从 `App.tsx` 迁移至 `SpotlightApp.tsx`
- 🔒 **退出处理**: 改进应用退出流程，防止托盘残留

---

### v1.4.0 (2026-01-28)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `7cb60e5` | **搜索引擎图标优化** | 新增 SearchEngineIcon 组件，统一管理品牌图标 |
| `124cede` | **Backspace BUG 修复** | 修复搜索域切换时的退格删除逻辑 |
| `4193cc1` | **代码清理** | 移除不必要的注释和调试代码 |

**v1.4.0 详细文件变更**:
```
新建文件:
  src/components/ui/SearchEngineIcon.tsx                 | +46  新增搜索引擎图标组件

修改文件:
  src/components/features/spotlight/hooks/useSpotlightSearch.ts | -6 +2  移除图标组件导入，icon 字段改为字符串
  src/components/features/spotlight/core/SearchBar.tsx  | -7 +14  移除 buggy 重置逻辑，web 标签使用 SearchEngineIcon
  src/components/features/spotlight/modes/search/SearchMode.tsx | +9   web_search 使用 SearchEngineIcon，支持 colorize
  src/components/settings/SettingsModal.tsx              | ~8   搜索引擎卡片使用 SearchEngineIcon
  src/App.tsx                                           | -1   移除快捷键注册调试日志
  src/components/features/context/ContextView.tsx        | -2   移除 token 计数日志
```

**主要更新**:
- 🎨 **搜索引擎品牌图标**: 新增 `SearchEngineIcon` 组件，集成 Google、Bing、百度官方图标及品牌色
- 🔧 **架构优化**: Hook 层不再负责图标渲染，只传递引擎类型字符串，实现关注点分离
- 🎯 **交互优化**: 搜索结果列表中，选中项图标自动变白以适应深色背景
- 🐛 **BUG 修复**: 修复 Backspace 删除逻辑，只在内容为空时再次按退格才退出搜索域
- 🧹 **代码清理**: 移除不必要的调试日志和注释

### v1.3.9 (2026-01-28)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `5b053ac` | **新增 HyperView 预览** | 新增文件预览功能，支持多种格式 |
| `d134c7c` | **数据库结构优化** | 将 db.rs 拆分为模块化结构 |
| `4c5575d` | **样式优化** | Markdown 渲染器样式改进 |
| `abb77f6` | **代码清理** | 移除 ContextView 冗余代码 |
| `3190d8c` | **编辑器优化** | 提示词编辑器交互改进 |
| `5b71c4f` | **动画优化** | 编辑器对话框动画流畅度提升 |
| `d500168` | 发布 1.3.9 | 版本发布 |

**v1.3.9 HyperView 预览功能文件变更**:
```
src-tauri/src/hyperview/mod.rs                    | +12  模块入口
src-tauri/src/hyperview/protocol.rs               | +75  协议处理
src-tauri/src/hyperview/sniffer.rs                | +99  文件嗅探
src/components/features/hyperview/PreviewModal.tsx | +91  预览弹窗
src/components/features/hyperview/renderers/*.tsx | +196 多格式渲染器
src/components/features/context/ContextView.tsx   | +63  上下文视图集成
src/components/features/context/FileTreeNode.tsx  | +33  文件树节点
src/store/usePreviewStore.ts                      | +37  预览状态管理
src/types/hyperview.ts                            | +18  类型定义
```

**v1.3.9 数据库结构优化文件变更**:
```
src-tauri/src/db.rs              | -1338 拆分重构
src-tauri/src/db/mod.rs          | +17   模块导出
src-tauri/src/db/init.rs         | +139  初始化逻辑
src-tauri/src/db/models.rs       | +110  数据模型
src-tauri/src/db/apps.rs         | +98   应用相关
src-tauri/src/db/prompts.rs      | +555  提示词相关
src-tauri/src/db/project_config.rs | +132 项目配置
src-tauri/src/db/secrets.rs      | +78   密钥相关
src-tauri/src/db/shell_history.rs | +124  Shell历史
src-tauri/src/db/url_history.rs  | +155  URL历史
```

**主要更新**:
- 🖼️ **HyperView 文件预览**: 新增文件预览系统，支持 Markdown、代码、图片、二进制等多种格式
- 🔍 **智能文件嗅探**: 自动检测文件类型并选择合适的渲染器
- 📂 **上下文集成**: 文件树节点新增预览按钮，快速查看文件内容
- 🗄️ **数据库模块化**: 将单文件 db.rs 拆分为 9 个模块文件，提升代码可维护性
- 🎨 **样式优化**: Markdown 渲染器样式改进，支持更好的代码高亮和排版
- ⚡ **编辑器增强**: 提示词编辑器动画和交互体验优化

---

### v1.3.8 (2026-01-26)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `22036bb` | **Shell 命令历史** | 新增 Shell 历史数据库和自动补全 UI |
| `f3ed5a4` | **优化查询** | 完善模糊搜索和分页逻辑 |
| `e0fb4be` | **代码优化** | 简化搜索流程，移除冗余代码 |
| `727c8ea` | **体验优化** | 改进 Spotlight 搜索体验 |
| `00922e4` | **自动同步提示词** | 每日自动更新提示词库 (GitHub Actions) |
| `bdad9c1` | 发布 1.3.8 | 版本发布 |

**v1.3.8 Shell 历史功能文件变更**:
```
src-tauri/migrations/V2__shell_history.sql              | +12  新增迁移脚本
src-tauri/src/db.rs                                      | +234 数据库重构
src-tauri/src/main.rs                                    | +3   历史记录 API
src/components/features/spotlight/hooks/useSpotlightSearch.ts | +75 历史搜索逻辑
src/components/features/spotlight/modes/search/SearchMode.tsx | +74 UI 交互
src/types/spotlight.ts                                   | +6  类型定义
```

**主要更新**:
- 📜 **Shell 历史数据库**: 新增 `shell_history` 表，记录命令、时间戳、执行次数
- 🔍 **智能自动补全**: 模糊搜索 Shell 历史，实时建议命令
- ⚡ **快速执行**: Tab/Enter 自动补全，确认后立即执行
- 🎨 **视觉区分**: 橙色表示执行，靛青色表示历史记录
- 📊 **使用追踪**: 自动记录命令执行次数
- 🚀 **性能优化**: 查询防抖 100ms，并行搜索

---

### v1.3.7 (2026-01-25)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `4964586` | **优化镜像下载** | 调整镜像源优先级，使用 Promise.any 并行请求 |
| `560171d` | **自动同步提示词库** | 新增每日自动更新 prompts library 工作流 |
| `4964586` | **优化保存文件名** | 上下文保存时使用项目名_日期格式作为默认文件名 |
| `ef6267d` | 发布 1.3.7 | 版本发布 |

**v1.3.7 镜像下载优化文件变更**:
```
src/store/usePromptStore.ts | -15 +15 镜像源优先级调整，Promise.any 并行请求
```

**v1.3.7 保存文件名优化文件变更**:
```
src/components/features/context/ContextView.tsx | +25 默认文件名生成逻辑
```

**v1.3.7 提示词库自动同步文件变更**:
```
.github/workflows/update-prompts.yml | +105 每日自动同步工作流
build/dist/packs/                   | 重命名为 commands/
build/dist/packs/commands/*.json    | 重组提示词数据包结构
```

**主要更新**:
- 🚀 **Promise.any 并行请求**: 商店下载和 Manifest 获取改用并行请求，首个成功即返回
- 🌍 **镜像源优先级优化**: Gitee (国内) -> GitHub Raw -> jsDelivr CDN
- 📁 **智能默认文件名**: 上下文保存时自动使用 `{项目名}_{日期}.txt` 格式
- 🔄 **提示词库自动同步**: GitHub Actions 每日自动更新 awesome-chatgpt-prompts 和 tldr-pages
- 📦 **数据包结构重组**: `packs` 目录重命名为 `commands`，分类更清晰
- 📄 **许可证更新**: 新增 NOTICES.md 许可证声明文件

---

### v1.3.6 (2026-01-22)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `dd1871f` | **优化数据库迁移** | 引入 Refinery 迁移框架，支持遗留数据库补丁 |
| `a888718` | 发布 1.3.6 | 版本发布 |

**v1.3.6 数据库迁移优化文件变更**:
```
src-tauri/migrations/V1__baseline.sql | +114 基准迁移脚本
src-tauri/Cargo.toml                   | +3   引入 refinery
src-tauri/src/db.rs                    | +277 数据库重构
src/components/features/patch/PatchView.tsx | +2 适配调整
```

**主要更新**:
- 🗄️ **Refinery 迁移框架**: 引入专业数据库迁移管理工具
- 🔧 **遗留数据库补丁**: 自动检测并修补老版本数据库结构
- 📊 **基准迁移 V1**: 统一的数据库 Schema 定义
- 🛡️ **健壮性提升**: 列存在性检查、事务保护

---

### v1.3.5 (2026-01-21)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `a4ca88e` | **修复 BUG** | 修复 1.3.5 相关问题 |
| `dc0be15` | **新增模板 AI** | 提示词支持聊天模板功能 |
| `f71510b` | 发布 1.3.5 | 版本发布 |

**v1.3.5 模板 AI 功能文件变更**:
```
src-tauri/src/db.rs                                | +97  数据库字段扩展
src-tauri/src/main.rs                              | +2   命令注册
src/SpotlightApp.tsx                               | +5   点击处理
src/components/features/prompts/dialogs/PromptEditorDialog.tsx | +92  编辑器增强
src/components/features/spotlight/core/ChatCommandMenu.tsx    | +113 命令菜单
src/components/features/spotlight/core/SearchBar.tsx          | +257 搜索栏重构
src/components/features/spotlight/core/SpotlightContext.tsx   | +31  上下文
src/components/features/spotlight/hooks/useSpotlightChat.ts   | +54  聊天逻辑
src/lib/template.ts                                | +29  模板引擎
src/store/usePromptStore.ts                        | +15  状态管理
src/types/prompt.ts                                | +3   类型定义
```

**主要更新**:
- 🤖 **模板 AI**: 提示词支持配置为聊天模板，AI 对话时自动应用
- 💬 **命令菜单**: Spotlight 新增斜杠命令菜单 (/)
- 🔍 **搜索增强**: 搜索栏重构，支持更复杂的过滤和排序
- 🎨 **编辑器增强**: 提示词编辑器 UI 优化

---

### v1.3.4 (2026-01-18)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `834a1d0` | **修复 BUG** | 修复多个问题 |
| `8f28fa8` | 发布 1.3.4 | 版本发布 |

**主要更新**:
- 🐛 **BUG 修复**: 修复 Spotlight 聊天模式问题

---

### v1.3.3 (2026-01-18)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `d45ae11` | 发布 1.3.3 | 版本发布 |
| `34c32a0` | 发布 1.3.2 | 版本发布 |
| `0476720` | **Spotlight 增强** | 新增计算器、Shell 命令、范围搜索功能 |
| `828d088` | **国际化完善** | 统一所有硬编码文案为 getText 调用 |
| `967da22` | **性能优化** | 正则静态化、loading 短路优化 |

**v1.3.3 Spotlight 增强文件变更**:
```
src/types/spotlight.ts              | +12 新增 SearchScope 和 math/shell 类型
src/lib/calculator.ts               | +45 数学表达式计算工具
src/components/features/spotlight/core/SpotlightContext.tsx | +8 searchScope 状态
src/components/features/spotlight/core/SearchBar.tsx        | +120 前缀识别和 Tag UI
src/components/features/spotlight/hooks/useSpotlightSearch.ts | +85 搜索逻辑重构
src/components/features/spotlight/modes/search/SearchMode.tsx | +45 UI 适配
src/lib/i18n.ts                     | +24 新增国际化词条
src/SpotlightApp.tsx                | +12 点击处理逻辑
```

**v1.3.3 国际化优化文件变更**:
```
src/App.tsx                          | +2 getText 导入
src/components/settings/SettingsModal.tsx | +6 getText 调用
src/components/features/monitor/tabs/EnvFingerprint.tsx | +2 getText 调用
```

**v1.3.3 性能优化**:
```
src/lib/calculator.ts                | 正则静态化、超长浮点数限制
src/components/features/spotlight/hooks/useSpotlightSearch.ts | 计算/Shel 模式短路
```

**主要更新**:
- 🧮 **计算器模式**: 输入 `=1+1`、`=sin(pi)` 即可快速计算
- 💻 **Shell 命令**: 输入 `>ls`、`>dir` 直接执行命令
- 📂 **范围搜索**: `/app` 搜索应用、`/cmd` 搜索命令、`/pmt` 搜索提示词
- 🏷️ **Tag 交互**: 类似 VSCode 的搜索范围标签 UI
- 🌍 **国际化统一**: 全部硬编码文案迁移至 i18n 系统
- ⚡ **性能优化**: 正则复用、loading 状态短路避免闪烁

---

### v1.3.1 (2026-01-18)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `8353dfa` | 发布 1.3.1 | 版本发布 |
| `04fff71` | **优化 Git 对比** | 支持 Working Directory 对比，新增 Rayon 并行处理和 CRLF 优化 |
| `2546dab` | 优化性能 | 整体性能优化 |

**v1.3.1 Git 对比优化文件变更**:
```
src-tauri/src/git.rs                           | +118 引入 Rayon 并行处理
src/components/features/patch/PatchSidebar.tsx | +14  工作区选项
src/components/features/patch/PatchView.tsx    | +11  默认对比逻辑
```

**主要更新**:
- ⚡ **并行处理**: 引入 Rayon 并行读取多文件内容，显著提升大项目对比速度
- 🔄 **Working Directory 支持**: 新增 "__WORK_DIR__" 虚拟版本，可对比未保存的工作区变更
- 🪟 **CRLF 优化**: 修复 Windows 换行符问题，避免全文件误判为变更
- 🛡️ **内存优化**: 大文件预检查防止内存溢出，条件性 CRLF 替换

---

### v1.3.0 (2026-01-16)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `aae7ac5` | 发布 1.3.0 | 版本发布 |
| `547308a` | **新增配置记忆** | 上下文组装配置自动保存到数据库 |
| `1cff1eb` | **新增白名单** | 安全扫描支持忽略特定密钥 |
| `9e6a3e4` | 优化性能 | 性能调优 |
| `528cf9c` | 优化性能 | 性能优化 |

**v1.3.0 配置记忆功能文件变更**:
```
src-tauri/src/db.rs                       | +148 数据库表扩展
src-tauri/src/main.rs                     | +4
src/components/settings/SettingsModal.tsx | +88 设置界面增强
src/store/useContextStore.ts              | +39 状态持久化
src/lib/i18n.ts                           | +18 国际化
```

**v1.3.0 白名单管理文件变更**:
```
src-tauri/src/db.rs                                | +93
src-tauri/src/main.rs                              | +34
src/components/features/context/ScanResultDialog.tsx | +145
src/components/settings/IgnoredSecretsManager.tsx  | +124 白名单管理界面
src/components/settings/SettingsModal.tsx          | +14
src/lib/i18n.ts                                    | +28
```

**主要更新**:
- 💾 **配置持久化**: 上下文组装过滤器、设置选项自动保存
- 🔓 **白名单管理**: 安全扫描支持添加误报白名单
- 📝 **UI 优化**: 设置界面重构，白名单管理独立 Tab

---

### v1.2.5 (2026-01-14)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `a96a00b` | 发布 1.2.5 | 版本发布 |
| `ecafbf3` | **新增 Python 支持** | 命令执行器支持 Python 脚本 |
| `1a33162` | 优化 top 进程 | 进程监控优化 |

**v1.2.5 Python 支持文件变更**:
```
src-tauri/capabilities/migrated.json               | 4 +-
src/lib/command_executor.ts                        | +145 命令执行重构
src/types/prompt.ts                                | +2
```

**主要更新**:
- 🐍 **Python 集成**: 命令执行器支持 Python 脚本执行
- ⚙️ **命令执行重构**: 增强跨平台命令执行能力

---

### v1.2.4 (2026-01-12)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `794cab3` | 发布 1.2.4 | 版本发布 |
| `228472a` | 国际化 | 国际化完善 |
| `76e346d` | 优化体验 | 用户体验优化 |

**主要更新**:
- 🌍 **国际化完善**: 更多语言支持
- ✨ **体验优化**: 交互细节打磨

---

### v1.2.0 (2025-12-27)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `7087b4a` | 发布 1.2.0 | 版本发布 |
| `d9b47d9` | 优化 | 后端代码优化 |
| `dd8045b` | 优化 | 前端组件优化 |
| `6fbf449` | 优化 | 性能调优 |
| `486466f` | 优化 | UI 交互优化 |
| `02cbcf9` | 优化 | 状态管理优化 |
| `234e7da` | 优化 | Store 优化 |
| `fe2002e` | 优化 | 代码重构 |
| `9a50a93` | **SQL 引入** | 重构提示词存储系统，引入 SQLite 数据库 |
| `31fb4d5` | 优化 | SQL 查询优化 |
| `f8819bc` | 后端优化 | Rust 代码优化 |
| `90ef62c` | 后端优化 | 命令处理优化 |
| `7329624` | 优化占用 | 降低内存和 CPU 占用 |

**v1.2.0 文件变更统计**:
```
src-tauri/Cargo.toml                    |   +4
src-tauri/src/db.rs                     | +307 ++++++++++++
src-tauri/src/main.rs                   |  +36 +-
src/components/features/prompts/PromptView.tsx | -254 ++++++++---------
src/store/usePromptStore.ts             | -441 ++++++++++++-----------
5 files changed, 609 insertions(+), 433 deletions(-)
```

**主要更新**:
- 🔄 **数据库重构**: 提示词存储从 JSON 文件迁移至 SQLite，提升大数据量性能
- ⚡ **性能优化**: 整体资源占用降低约 20%

---

### v1.1.7 (2025-12-26)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `647db08` | 发布 1.1.7 | 版本发布 |
| `cbf6f31` | 新增 | 功能组件添加 |
| `d0c7e6a` | 优化 | 界面优化 |
| `b056212` | **优化选中逻辑** | 改进文件树和代码块的选中交互体验 |
| `8da8236` | 删除 | 移除冗余代码 |
| `8ad5868` | 优化 | 代码清理 |
| `4f4d1b8` | 优化 | 样式调整 |
| `a256e8b` | 新增 | 扫描结果导出功能 |
| `379ab53` | 新增 | 上下文预览功能增强 |
| `a4f0c5f` | 优化 | 性能优化 |
| `79b6556` | **新增 gitleaks 模块** | 集成代码安全扫描规则集 |
| `06c1376` | **新增隐私扫描** | 实现敏感信息检测引擎 |

**v1.1.7 隐私扫描功能文件变更**:
```
src-tauri/src/security/engine.rs      | +110 核心扫描引擎
src-tauri/src/security/entropy.rs     | +36  熵值计算
src-tauri/src/security/mod.rs         | +14  模块导出
src-tauri/src/security/rules.rs       | +70  扫描规则
src-tauri/src/security/stopwords.rs   | +105 白名单词库
src/components/features/context/ContextView.tsx        | +141
src/components/features/context/ScanResultDialog.tsx   | +122
src/components/features/context/TokenDashboard.tsx     | +33
12 files changed, 619 insertions(+), 44 deletions(-)
```

**v1.1.7 Gitleaks 安全扫描模块文件变更**:
```
src-tauri/src/gitleaks/allowlist.rs              | +55  白名单
src-tauri/src/gitleaks/mod.rs                    | +129 模块入口
src-tauri/src/gitleaks/rule.rs                   | +27  规则定义
src-tauri/src/gitleaks/rules_ai.rs               | +78  AI相关规则
src-tauri/src/gitleaks/rules_cloud.rs            | +160 云服务规则
src-tauri/src/gitleaks/rules_communication.rs    | +147 通信规则
src-tauri/src/gitleaks/rules_package.rs          | +179 包管理规则
src-tauri/src/gitleaks/rules_payment.rs          | +125 支付相关规则
src-tauri/src/gitleaks/rules_remaining.rs        | +203 其他规则
src-tauri/src/main.rs                            | +15
11 files changed, 1119 insertions(+), 4 deletions(-)
```

**主要更新**:
- 🔒 **隐私扫描**: 基于正则表达式和熵值计算的敏感信息检测
- 🛡️ **Gitleaks 集成**: 支持 8 大类安全规则检测:
  - AI 相关密钥 (OpenAI、Anthropic 等)
  - 云服务凭证 (AWS、Azure、GCP 等)
  - 支付网关 (Stripe、Square、PayPal 等)
  - 通信应用密钥 (Slack、Discord 等)
  - 包管理仓库密钥 (NPM、PyPI 等)

---

### v1.1.6 (2025-12-18)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `ea31473` | 修复构建 | 使用 vendored openssl，版本升至 1.1.6 |
| `8c6a6da` | 修复构建 | 修复 macOS universal build 支持 |

**主要更新**:
- 解决 OpenSSL 依赖问题
- 支持 Apple Silicon 通用二进制构建

---

### v1.1.5 (2025-12-18)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `f7b51ea` | 发布 1.1.5 | 版本发布 |
| `ce49a34` | 优化 | UI 优化 |
| `a63ae70` | 优化 | 交互优化 |
| `e4d66cb` | 优化 | 代码优化 |
| `37049a7` | log 优化 | 日志系统改进 |
| `cc2b8c5` | 优化 | 性能优化 |
| `8cc7763` | 优化 | 样式调整 |
| `93a8dff` | 优化 | 组件优化 |
| `47c33ef` | 优化 | 状态管理优化 |
| `431f085` | 新增 | 提交选择器组件 |
| `ce8336f` | 优化 | 代码清理 |
| `747e459` | 优化 | 重构优化 |
| `04dacca` | **新增 git diff** | 集成 Git Diff 可视化功能 |

**v1.1.5 Git Diff 功能文件变更**:
```
src-tauri/src/main.rs                  | +157 命令注册
src/components/features/patch/CommitSelector.tsx | +128 提交选择器
src/components/features/patch/DiffWorkspace.tsx  | +-28 工作区
src/components/features/patch/PatchSidebar.tsx   | +-284 侧边栏
src/components/features/patch/PatchView.tsx      | +-416 主视图
src/components/features/patch/patch_types.ts     | +-7  类型定义
6 files changed, 686 insertions(+), 334 deletions(-)
```

**主要更新**:
- 📊 **Git Diff 可视化**: 支持查看任意两个 commit 之间的代码差异
- 🔀 **Commit 选择器**: 下拉选择历史提交进行对比
- 📦 **多种导出格式**: 支持导出为 HTML、JSON、Markdown 等格式

---

### v1.1.4 (2025-12-16)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `bddd26e` | 发布 1.1.4 | 版本发布 |
| `8af3223` | 优化 | 代码优化 |
| `010c2d6` | 新增 | 新增过滤器管理功能 |
| `9aa51b9` | 优化 | 过滤逻辑优化 |
| `adb64fa` | 优化 | 上下文组装优化 |
| `1c38713` | 优化 | Token 计算优化 |
| `50acca4` | 优化 | 树形结构优化 |
| `25dd382` | 优化 | 文件树优化 |
| `e00dc4a` | 优化 | 交互优化 |
| `d231b05` | 优化 | 搜索优化 |
| `f1fe6a3` | 优化 | 快捷键优化 |
| `9dabaab` | 优化 | 快捷键处理优化 |
| `94621d4` | 优化 | 通知系统优化 |

**主要更新**:
- 🔍 **文件过滤器**: 支持按文件类型、大小、路径等条件过滤
- 📁 **上下文组装**: 支持选择特定文件/目录进行组合

---

### v1.1.3 (2025-12-14)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `696303e` | 发布 1.1.3 | 版本发布 |
| `e8303dc` | 新增 | 新增导出功能 |
| `7303fcd` | **Logo 更换** | 品牌视觉全面升级 |
| `49d79cc` | **优化通知** | 通知系统重构，支持更多通知类型 |
| `87a5ecd` | 优化 | 界面优化 |

**v1.1.3 Logo 更换文件变更** (54 个文件):
```
images/logo.png                     | 新 Logo 图片 (320KB)
src-tauri/icons/*                   | 多尺寸应用图标更新
src-tauri/icons/android/*           | Android 平台图标
src-tauri/icons/ios/*               | iOS 平台图标
```

**主要更新**:
- 🎨 **品牌升级**: 全新 Logo 设计，多平台图标适配
- 🔔 **通知系统**: 支持操作结果通知、错误提示、进度提示

---

### v1.1.2 (2025-12-04)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `ba2b14a` | 发布 1.1.2 | 版本发布 |
| `2c58cab` | 更新 | 版本号更新 |
| `561b20a` | 更新 | 配置更新 |
| `23b5bbb` | **优化自定义唤起按钮** | 支持自定义快捷键和唤醒方式配置 |

**主要更新**:
- ⌨️ **自定义快捷键**: 支持自定义全局唤醒快捷键
- 🎯 **唤起方式**: 支持点击托盘图标、快捷键等多种唤起方式

---

### v1.1.1 (2025-12-04)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `c92574f` | 发布 1.1.1 | 版本发布 |
| `f61a5ff` | 优化 | 基础功能优化 |
| `baf2876` | 优化 | 代码完善 |

---

### v1.1.0 早期版本 (2025-12 上旬)

| 提交哈希 | 变更内容 | 详细说明 |
|---------|---------|---------|
| `2df3e62` | **新增时钟功能** | 标题栏集成实时时钟显示 |

**v1.1.0 时钟功能文件变更**:
```
src/components/ui/ClockPopover.tsx | +301 时钟弹出组件
src/components/layout/TitleBar.tsx | +-24 标题栏集成
src/components/settings/SettingsModal.tsx | +-68 设置中添加时钟配置
src/lib/i18n.ts                   | +-44 国际化支持
14 files changed, 1177 insertions(+), 29 deletions(-)
```

---

## 核心功能演进

### 1. Context Forge (文件整合)
| 版本 | 功能 |
|-----|------|
| v1.2.4 | 国际化完善 |
| v1.2.5 | Python 脚本支持 |
| v1.3.0 | 配置自动保存 |
| v1.3.0 | 白名单管理 |
| v1.3.1 | Rayon 并行处理 |

### 2. Spotlight (全局 AI 终端)
| 版本 | 功能 |
|-----|------|
| 初始 | 全局快捷键唤起 (`Alt+S`) |
| v1.1.2 | 自定义快捷键配置 |
| v1.1.3 | 通知系统集成 |
| v1.3.3 | 计算器模式 (`=`) |
| v1.3.3 | Shell 命令执行 (`>`) |
| v1.3.3 | 范围搜索 (`/app`, `/cmd`, `/pmt`) |
| v1.3.3 | Tag 交互 UI |
| v1.5.0 | Refinery 快捷粘贴集成 |

### 3. Prompt Verse (提示词库)
| 版本 | 功能 |
|-----|------|
| 初始 | 基础提示词管理 |
| v1.2.0 | SQLite 数据库重构，性能大幅提升 |

### 4. Patch Weaver (AI 补全器 & Git 对比)
| 版本 | 功能 |
|-----|------|
| v1.1.5 | Git Diff 可视化 |
| v1.1.5 | Commit 选择器 |
| v1.1.5 | 多格式导出 |
| v1.3.1 | Working Directory 对比 |
| v1.3.1 | Rayon 并行处理 |
| v1.3.1 | CRLF 换行符优化 |

### 5. Refinery (剪贴板历史)
| 版本 | 功能 |
|-----|------|
| v1.5.0 | 文本/图片剪贴板历史 |
| v1.5.0 | 搜索、筛选、收藏功能 |
| v1.5.0 | 笔记注释支持 |
| v1.5.0 | 日历视图、自动清理 |

### 6. Automator (工作流自动化)
| 版本 | 功能 |
|-----|------|
| v2.0.0 | 左键/右键/中键点击 |
| v2.0.0 | 可配置间隔和次数 |
| v2.0.0 | 固定位置或跟随鼠标 |
| v2.2.0 | UI 自动树元素识别 |
| v2.2.0 | `get_element_under_cursor` 命令 |

### 7. Model Miner (内容挖掘)
| 版本 | 功能 |
|-----|------|
| v2.2.2 | 网页内容提取 (Readability.js) |
| v2.2.2 | HTML 转 Markdown |
| v2.2.2 | 队列化任务处理 |
| v2.2.2 | 挖掘范围管理 |
| v2.2.5 | 单页提取 (`single_page`) |
| v2.2.5 | Web 搜索集成 (`web_search`) |
| v2.2.5 | 后处理管线 (`postprocess`) |

### 8. Agent Tool Runtime (AI 工具运行时)
| 版本 | 功能 |
|-----|------|
| v2.2.5 | ToolSpec 规范 + ToolCallRequest/Response 模型 |
| v2.2.5 | 沙箱策略引擎 (sandbox.rs) |
| v2.2.5 | 文件系统工具 (list_directory/search_files/read_file) |
| v2.2.5 | Web 工具 (search/extract_page) |
| v2.2.5 | Miner 工具集成 |
| v2.2.5 | 补丁工具 (patch_tools) |
| v2.2.5 | 前端 Agent 运行时 (registry/policy/runtime) |

### 9. Exec Runtime (命令执行运行时)
| 版本 | 功能 |
|-----|------|
| v2.2.8 | 进程管理器 (manager.rs) |
| v2.2.8 | 沙箱安全策略 (safety.rs) |
| v2.2.8 | 执行审批机制 (request/approve/terminate) |
| v2.2.8 | PowerShell 参数解析器 |
| v2.2.8 | 前端 ExecApprovalSheet 审批 UI |

### 10. Transfer (局域网传输)
| 版本 | 功能 |
|-----|------|
| v2.3.0 | Axum HTTP 服务器 + WebSocket |
| v2.3.0 | 设备自动发现 (网络接口扫描) |
| v2.3.0 | 二维码分享 (QR 生成) |
| v2.3.0 | 文件传输 + 进度追踪 |
| v2.3.0 | 即时聊天 (文本消息) |
| v2.3.0 | 移动端 HTML 界面 |

### 11. Guard (空闲守护)
| 版本 | 功能 |
|-----|------|
| v2.2.9 | 空闲超时检测 (默认 180s) |
| v2.3.0 | Windows 低级键盘/鼠标钩子全局拦截 |
| v2.3.0 | 全屏覆盖锁屏 + 长按 1.5s 解锁 |
| v2.3.0 | 防止系统休眠 |
| v2.3.0 | 保持屏幕常亮 |

### 12. Peek (独立预览窗口)
| 版本 | 功能 |
|-----|------|
| v2.2.8 | 独立 Tauri 预览窗口 |
| v2.2.8 | DOCX 渲染器 (docx-preview) |
| v2.2.8 | PDF 渲染器 |
| v2.2.8 | HTML 渲染器 |
| v2.2.8 | Markdown 渲染器 (starry-night 语法高亮) |
| v2.2.8 | 结构化文本渲染器 |

### 13. System Monitor (系统监控)
| 版本 | 功能 |
|-----|------|
| v1.1.0 | 标题栏时钟 |
| v1.1.1 | 系统信息面板 |
| v2.2.6 | env-probe crate 模块化 |
| v2.2.8 | 网络测速 (M-Lab NDT7) |
| v2.2.9 | 电池信息 (starship-battery) |
| v2.3.0 | 监控探测大幅增强 (1182行 monitoring.rs) |
| v2.3.0 | 磁盘详情 (HDD/SSD 类型、可移除性) |
| v2.3.0 | 网络流量统计 (收发速率) |
| v2.3.0 | 端口占用进程 (Windows RestartManager) |
| v2.3.0 | 进程列表 (CPU/内存使用率) |
| v2.3.0 | 仪表盘 UI 全面重构 |

### 14. Spotlight AI 增强
| 版本 | 功能 |
|-----|------|
| v2.2.5 | 聊天附件支持 (chat_attachment) |
| v2.2.5 | Agent 工具调用 (fs/web/miner) |
| v2.2.8 | AI Trace 时间线可视化 |
| v2.2.8 | ToolCallInlineBlock 工具调用内联展示 |
| v2.2.8 | ExecApprovalSheet 执行审批面板 |

---

## 安全功能演进

### 隐私扫描引擎 (v1.1.7)

**核心组件**:
- `engine.rs`: 扫描引擎主程序
- `entropy.rs`: Shannon 熵值计算 (检测高随机性密钥)
- `rules.rs`: 正则表达式规则集
- `stopwords.rs`: 白名单词库 (过滤误报)
- `allowlist.rs`: 值白名单 (UUID、Git SHA、URL 等)

**检测流程**:
```
文件内容 → 正则匹配 → 熵值计算 → 白名单过滤 → 风险分级
```

### Gitleaks 安全规则 (v1.1.7)

**规则分类**:
| 分类 | 示例 |
|-----|------|
| AI 密钥 | OpenAI API Key, Anthropic Key |
| 云服务 | AWS Access Key, Azure SAS Token |
| 支付网关 | Stripe, Square, PayPal |
| 通信应用 | Slack, Discord, Twilio |
| 包管理 | NPM, PyPI, RubyGems |
| 数据库 | MongoDB, PostgreSQL 连接串 |
| 通用密钥 | Generic API Key, Bearer Token |

### 白名单管理 (v1.3.0)

**新增功能**:
- 界面化白名单管理 (`IgnoredSecretsManager.tsx`)
- 白名单持久化存储 (SQLite)
- 支持正则表达式白名单

---

## 自动化流程

### 提示词库自动同步
```yaml
# GitHub Actions
触发: 每日定时 或 上游更新
执行: 同步 awesome-chatgpt-prompts 和 tldr-pages
提交: github-actions[bot]
```

---

## 构建与发布

### 版本发布流程
```
1. 功能开发完成
2. 代码审查 (GitHub PR)
3. 版本号更新 (package.json, Cargo.toml)
4. GitHub Actions 自动构建
5. 生成安装包
```

### 当前构建状态
| 平台 | 安装包大小 | 运行内存 |
|-----|-----------|---------|
| Windows | ~10 MB | ~30-50 MB |

---

## 目录结构

```
ctxrun/
├── src/                          # React 前端源码
│   ├── windows/                # 多窗口入口 (v2.3.0+)
│   │   ├── main/              # 主窗口 (MainWindowApp)
│   │   ├── spotlight/         # Spotlight 窗口 (SpotlightWindowApp)
│   │   ├── peek/              # 预览窗口 (PeekWindowApp)
│   │   └── guard/             # 锁屏窗口 (GuardWindowApp)
│   ├── components/                # UI 组件
│   │   ├── features/            # 功能组件
│   │   │   ├── automator/       # 自动点击器
│   │   │   ├── context/         # 上下文组装
│   │   │   ├── miner/           # 内容挖掘 (v2.2.2+)
│   │   │   ├── monitor/         # 系统监控
│   │   │   ├── patch/           # 代码对比
│   │   │   ├── prompts/         # 提示词管理
│   │   │   ├── refinery/        # 剪贴板历史 (v1.5.0+)
│   │   │   ├── spotlight/       # Spotlight 全局终端
│   │   │   │   ├── exec/        # 执行管理 (v2.2.8+)
│   │   │   │   └── trace/       # AI Trace 可视化 (v2.2.8+)
│   │   │   └── transfer/        # 局域网传输 (v2.3.0+)
│   │   ├── hyperview/           # 文件预览渲染器 (v1.3.9+)
│   │   │   └── renderers/       # DOCX/PDF/HTML/Markdown/结构化文本
│   │   ├── layout/             # 布局组件
│   │   │   └── ViewSwitcher.tsx # 轮盘导航 (v2.2.7+)
│   │   ├── settings/           # 设置界面 (v2.2.6+ 重构为独立页面)
│   │   │   └── sections/       # AI/通用/安全/数据维护/搜索工作区
│   │   └── ui/                # 基础 UI
│   ├── i18n/                    # 国际化 (v2.3.0 迁移到 JSON)
│   │   ├── config.ts           # i18n 配置
│   │   └── locales/            # JSON 翻译文件
│   │       ├── zh.json         # 中文 (879 行)
│   │       └── en.json         # 英文 (879 行)
│   ├── lib/                     # 工具函数
│   │   ├── agent/              # Agent 工具系统 (v2.2.5+)
│   │   │   ├── runtime.ts      # Agent 运行时
│   │   │   ├── policy.ts       # 工具策略
│   │   │   ├── registry.ts     # 工具注册
│   │   │   └── tools/          # fs.ts / web.ts
│   │   ├── exec/               # 命令执行客户端 (v2.2.8+)
│   │   ├── markdown/           # Markdown 增强 (starry-night)
│   │   └── hooks/              # 跨窗口状态同步等
│   ├── store/                   # Zustand 状态管理
│   └── types/                   # TypeScript 类型
├── src-tauri/                    # Rust 后端
│   ├── crates/                   # 多 crates 架构 (v2.0.0+)
│   │   ├── automator/           # 自动点击器模块
│   │   ├── browser-utils/       # 浏览器工具 (v2.2.5+)
│   │   ├── context/             # 上下文处理模块
│   │   ├── db/                  # 数据库模块
│   │   ├── env-probe/           # 环境探测 (v2.2.6 从 src/ 迁移)
│   │   ├── exec-runtime/        # 命令执行运行时 (v2.2.8+)
│   │   ├── git/                 # Git 操作模块
│   │   ├── hyperview/           # 文件预览 (v2.2.6 从 src/ 迁移)
│   │   ├── miner/               # 内容挖掘模块 (v2.2.2+)
│   │   ├── process-utils/       # 进程工具 (v2.2.8+)
│   │   ├── refinery/            # Refinery 模块
│   │   ├── tool-runtime/        # AI 工具运行时 (v2.2.5+)
│   │   ├── transfer/            # 局域网传输 (v2.3.0+)
│   │   └── workspace-tests/     # 集成测试 (v2.2.6+)
│   ├── src/                     # 主入口
│   │   ├── guard.rs             # 空闲守护 (v2.3.0+)
│   │   ├── peek.rs              # 预览窗口后端 (v2.2.8+)
│   │   ├── fs_commands.rs       # 文件操作命令
│   │   ├── tray_support.rs      # 托盘支持 (v2.3.0+)
│   │   ├── app_config.rs        # 应用配置 (v2.2.8+)
│   │   └── main.rs             # 入口
│   └── Cargo.toml
├── build/dist/                   # 预构建资源
│   └── commands/                 # 提示词/命令数据包
└── models/                       # LLM 模型配置
```

---

*文档最后更新: 2026-04-07*
*基于 git 提交历史和代码 diff 分析编写*
