# CtxRun - 详细使用指南

本文档提供了 CtxRun 各项核心功能的详细使用方法、配置指南和快捷键参考。

## 目录

1.  [Context Forge (文件整合)](#1-context-forge-文件整合)
2.  [Spotlight (全局 AI 终端)](#2-spotlight-全局-ai-终端)
3.  [Prompt Verse (提示词库)](#3-prompt-verse-提示词库)
4.  [Patch Weaver (AI 补全器)](#4-patch-weaver-ai-补全器)
5.  [Model Miner (网页内容挖掘)](#5-model-miner-网页内容挖掘)
6.  [Automator (工作流自动化)](#6-automator-工作流自动化)
7.  [Refinery (剪贴板历史)](#7-refinery-剪贴板历史)
8.  [System Monitor (系统监控)](#8-system-monitor-系统监控)
9.  [配置指南 (Setup Guide)](#9-配置指南-setup-guide)
10. [常用快捷键一览](#10-常用快捷键一览)

---

### 1. Context Forge (文件整合)

**解决痛点：** 快速将项目文件打包成 LLM (ChatGPT/Claude/DeepSeek) 易读的格式。

#### 核心功能

*   **文件选择**：
    *   在左侧文件树中勾选你需要让 AI 理解的代码文件或文件夹
    *   支持虚拟化滚动，轻松处理大型项目目录
    *   双击可快速预览选中文件（支持图片、视频、代码等多种格式）

*   **过滤系统**：
    *   全局过滤规则：在设置中配置要忽略的文件、文件夹和扩展名
    *   即时过滤：底部的过滤输入框可快速筛选当前视图

*   **智能统计**：
    *   底部仪表盘实时显示选中文件的总大小
    *   **预估 Token 数量**：基于实际编码精确计算
    *   语言分布：自动检测并显示各编程语言的文件占比

*   **Token 优化**：
    *   开启 **"Remove Comments"** 开关，自动剥离代码注释，节省大量 Token
    *   自动识别并过滤二进制文件（如图片、PDF、视频等）

*   **安全扫描**：
    *   内置敏感信息检测引擎，在复制前自动扫描
    *   检测 API 密钥、密码等敏感信息
    *   支持白名单管理，自定义忽略规则

*   **导出选项**：
    *   **Copy to Clipboard**：一键复制结构化的 XML 文本到剪贴板
    *   **Export to File**：导出为 TXT 文件，推荐用于发送给 AI
    *   自动生成项目结构树和完整文件内容

---

### 2. Spotlight (全局 AI 终端)

**默认快捷键：** `Alt + S` (Windows) 或 `Option + S` (macOS)，在 Linux 上快捷键可能被系统占用。快捷键可在设置中自定义。

Spotlight 是一个始终置顶的悬浮窗，拥有多种模式。按 **`Tab`** 键在搜索模式和 AI 对话模式之间切换，按 **`ESC`** 退出。

#### 搜索模式 (Search Mode)

快速检索并使用你的指令库、应用程序和系统功能。

**基础搜索：**
*   输入关键词查找本地或已下载的 Prompt/Command
*   对于命令指令，按 `Enter` 可以直接通过终端执行
*   对于普通提示词，按 `Enter` 直接将内容复制到剪贴板
*   自动检测并处理 URL，直接回车可在浏览器中打开

**范围搜索前缀：**
*   `/app` - 仅搜索已安装的应用程序
*   `/cmd` - 仅搜索命令库
*   `/pmt` - 仅搜索提示词库
*   无前缀时搜索所有内容（应用、命令、提示词）

**计算器模式：**
*   输入前缀 `=` 进入计算器模式
*   示例：`=1+1` → 结果 2
*   示例：`=sin(pi/2)` → 结果 1
*   支持常用数学函数：sin, cos, tan, log, sqrt, abs, pow 等
*   支持常数：pi, e

**Shell 命令模式：**
*   输入前缀 `>` 或 `》` 进入 Shell 命令模式
*   Linux/Mac 示例：`>ls -la`
*   Windows 示例：`>dir`
*   结果会直接显示在 Spotlight 窗口中
*   点击 "Run in terminal" 按钮可在完整终端中执行
*   支持命令历史记录匹配，上下箭头键可浏览

**Web 搜索模式：**
*   输入前缀 `?` 或 `？` 进入 Web 搜索模式
*   示例：`?react hooks`
*   支持多搜索引擎：Google、Bing、百度
*   可在设置中配置默认搜索引擎和自定义搜索 URL
*   搜索引擎图标品牌化显示，快速识别当前引擎
*   搜索结果列表中显示各搜索引擎的官方品牌图标

**应用启动器：**
*   输入应用名称或关键词快速查找
*   选择目标应用后按 `Enter` 或点击 "Open" 启动
*   支持显示应用程序图标
*   需在设置中重建应用索引

#### AI 对话模式 (AI Chat Mode)

无需切换浏览器，直接与 AI 对话。

**进入方式：**
*   在搜索模式下按 `Tab` 键切换到紫色界面的 AI 模式
*   或输入 `/` 打开命令菜单快速访问

**对话功能：**
*   流式回复，实时显示 AI 响应
*   完整的 Markdown 渲染支持
*   代码语法高亮显示
*   支持复制消息内容（纯文本或 Markdown 格式）

**推理模型支持：**
*   支持 DeepSeek-R1 等推理模型
*   可折叠查看 AI 的 "Thinking Process" 思考过程
*   自动识别并处理推理内容

**模板系统：**
*   在提示词管理中勾选 "Use as chat template"
*   该提示词将作为 AI 对话的系统提示词使用
*   实现自定义 AI 行为和角色设定

**会话管理：**
*   按 `Ctrl + K` (Windows) 或 `Cmd + K` (macOS) 清空当前临时会话
*   对话历史仅保存在内存中
*   重启软件后自动清除，保持轻量级

---

### 3. Prompt Verse (提示词库)

管理你的常用指令和 AI 提示词，打造个人知识库。

#### 核心功能

**创建与编辑：**
*   支持创建自定义分组，分类管理提示词
*   编写包含变量（`{{variable}}`）的通用模板
*   使用变量时系统会自动提示输入
*   虚拟化网格显示，轻松管理大量提示词

**提示词类型：**

*   **普通提示词**：文本内容，复制到剪贴板使用

*   **可执行命令**：
    *   创建终端命令脚本
    *   点击直接通过终端执行
    *   命令从上到下依次执行
    *   支持多行命令和复杂脚本

*   **聊天模板**：
    *   勾选 "Use as chat template"
    *   作为 Spotlight AI 对话的系统提示词
    *   实现自定义 AI 行为

**导入导出：**
*   支持导出为 CSV 格式
*   支持从 CSV 导入提示词
*   方便备份和分享个人提示词库

**官方商店：**
*   在设置中进入 **Library** 标签页
*   下载离线的指令包（如 Linux 命令大全、编程辅助 Prompts）
*   自动更新官方提示词库

**遮蔽机制：**
*   如果你收藏并修改了官方指令
*   本地修改将覆盖官方版本，互不冲突
*   官方更新不会影响你的自定义版本

**收藏系统：**
*   星标常用提示词
*   快速访问重要内容

---

### 4. Patch Weaver (AI 补全器)

填补 "AI 生成代码" 与 "实际修改文件" 之间的鸿沟，让 AI 的输出直接应用到代码中。

#### 场景一：AI 补丁应用器 (AI Patch Applicator)

专为 AI 辅助编码设计的创新功能。

**工作流程：**

1.  **加载项目**：点击 "Select Project" 选择本地项目的根目录
2.  **获取指令**：侧边栏提供 **"AI Instruction"** 系统提示词
3.  **发送给 AI**：复制提示词并附加修改需求发送给大语言模型
4.  **粘贴 AI 响应**：AI 返回包含 `<<<<<<< SEARCH ... >>>>>>> REPLACE` 块的文本
5.  **自动解析与预览**：
    *   瞬间解析针对一个或多个文件的所有修改操作
    *   在内存中模拟应用补丁
    *   在 Monaco Editor 驱动的 Diff 视图中展示修改对比
6.  **应用或取消**：预览无误后点击 "Apply Patches" 应用所有修改

**支持的格式：**
*   YAML 格式的补丁块
*   SEARCH/REPLACE 标记
*   多文件批量修改

**导出功能：**
*   导出补丁为多种格式：Markdown、JSON、XML、TXT
*   多种布局选项：Split、Unified、Git Patch

#### 场景二：Git 版本对比器 (Git Diff Visualizer)

强大的 Git 可视化工具。

**工作流程：**

1.  **浏览 Git 仓库**：选择包含 `.git` 目录的本地项目
2.  **加载提交记录**：应用读取最近的 50 条 commit 记录
3.  **选择版本**：在下拉框中选择任意两个 commit 进行对比
4.  **生成对比**：点击 "Generate Diff" 查看差异
5.  **审查与导出**：
    *   左侧列表展示所有变更文件
    *   文件状态标识：**新增 (A)**、**修改 (M)**、**删除 (D)**、**重命名 (R)**
    *   自动标记二进制文件和超大文件
    *   点击文件在右侧 Diff 视图中详细审查

**特殊模式：**
*   **Working Directory 模式**：对比当前工作区与最后一次提交
*   **Base Version**：选择基准版本
*   **Compare Version**：选择要对比的版本

**导出选项：**
*   格式：Markdown、JSON、XML、TXT
*   布局：Split（分栏）、Unified（统一）、Git Patch

---
### 5. Model Miner (网页内容挖掘)

**解决痛点：** 智能爬取网站内容并转换为 Markdown 格式，支持深度控制和并发处理。

#### 核心功能

**智能内容提取：**
*   使用 **Readability.js** 提取页面核心内容
*   自动转换为 Markdown 格式（turndown.js）
*   过滤广告和无关元素，保留有价值内容

**并发爬取引擎：**
*   基于 **headless_chrome** 的浏览器自动化
*   支持 1-10 个并发线程（默认 5）
*   使用 crossbeam-channel 实现任务队列
*   每个线程独立管理浏览器标签页

**深度和范围控制：**
*   **URL 前缀匹配**：严格限制爬取范围，防止失控
*   **最大深度**：控制链接递归层级（0 表示仅当前页）
*   **最大页面数**：防止爬取过多页面

**层次化文件存储：**
*   按 URL 结构自动生成目录树
*   例如：`example.com/docs/api/guide.md`
*   自动添加元数据：标题、来源 URL、抓取时间

#### 使用流程

**配置参数：**

| 参数 | 说明 | 示例 |
|------|------|------|
| URL | 起始网址 | `https://docs.rs/ort` |
| Match Prefix | URL 前缀限制 | `https://docs.rs/ort/2.0.0-rc.11/ort/` |
| Max Depth | 最大爬取深度 | `2` (0=仅当前页) |
| Max Pages | 最大页面数量 | `100` |
| Concurrency | 并发线程数 | `5` (1-10) |
| Output Dir | 输出目录 | `E:\Docs\output` |

**执行步骤：**

1. 填写配置参数，设置爬取范围和限制
2. 点击"开始爬取"启动任务
3. 实时监控进度：
   *   当前处理页面数
   *   已发现 URL 总数
   *   当前正在处理的 URL
   *   处理状态（Fetching/Processing/Saved）
4. 爬取完成后自动停止
5. 在输出目录查看结果

**输出格式：**

每个 Markdown 文件包含 Front Matter 元数据：

```markdown
---
title: "页面标题"
source_url: "https://example.com/page"
crawled_at: "2025-02-27T10:30:00+00:00"
---

页面内容...
```

#### 注意事项

*   **浏览器要求**：需要安装 Chrome/Edge 浏览器
*   **网络限制**：大量并发可能被目标网站限制，建议降低并发数
*   **URL 匹配**：Match Prefix 必须准确设置，防止爬取到无关页面
*   **输出目录**：会在指定目录下创建 `ctxrun_docs` 子文件夹

---

### 6. Automator (工作流自动化)

**解决痛点：** 可视化工作流编排，支持浏览器自动化、UI 元素定位和物理输入模拟。

#### 工作流模式

**1. 顺序工作流 (Workflow)**

按顺序执行一系列动作，可设置重复次数。

**2. 节点图工作流 (WorkflowGraph)**

基于节点图的可视化编排，支持条件分支和循环控制。

#### 支持的动作

**鼠标操作：**
*   **MoveTo**：移动鼠标到目标位置
*   **Click**：单击（左键/右键/中键）
*   **DoubleClick**：双击

**键盘操作：**
*   **Type**：输入文本
*   **KeyPress**：按键/组合键（如 `Ctrl+A`、`Alt+F4`）

**其他操作：**
*   **Scroll**：滚动鼠标滚轮
*   **Wait**：等待指定毫秒数
*   **CheckColor**：检查指定坐标颜色（条件分支）
*   **Iterate**：循环计数器（条件分支）
*   **LaunchBrowser**：启动调试模式浏览器

#### 目标定位方式

**1. 坐标定位 (Coordinate)**
*   直接指定屏幕坐标 (X, Y)
*   最精确但缺乏弹性

**2. 语义化定位 (Semantic)**
*   通过 Windows UIAutomation API 定位 UI 元素
*   支持名称、角色、窗口标题、进程名匹配
*   自动查找元素的可点击点
*   支持降级坐标作为兜底

**3. Web 选择器 (WebSelector)**
*   通过 CSS 选择器定位网页元素
*   浏览器优先尝试，失败后降级物理点击
*   支持 URL 过滤（多标签场景）

#### 浏览器自动化

**调试模式启动：**
*   自动启动 Chrome/Edge 的远程调试模式
*   支持临时用户 Profile 隔离
*   自动连接到调试端口

**Web 元素操作：**
*   **点击**：通过 CSS 选择器点击元素
*   **输入**：在输入框中输入文本
*   **按键**：发送快捷键（如 `Ctrl+A`、`Enter`）

**物理输入降级：**
*   浏览器操作失败时自动降级
*   使用 enigo 模拟物理鼠标键盘输入
*   确保操作可靠性

#### 条件分支

**CheckColor（颜色检查）：**
*   检查指定坐标的像素颜色
*   支持容差设置（RGB 各分量差值）
*   根据结果跳转到 true_id 或 false_id 分支

**Iterate（循环计数）：**
*   节点级循环计数器
*   达到目标次数后跳转到 false_id
*   未达到时跳转到 true_id

#### UI 元素拾取

**拾取功能：**
*   实时获取鼠标下的 UI 元素信息
*   显示元素名称、角色、类名
*   记录从根到当前元素的完整路径
*   获取元素的可点击坐标

#### 使用示例

**简单点击流程：**
```
LaunchBrowser → Wait → Click (选择器) → Type文本 → Press Enter
```

**条件分支流程：**
```
Click按钮 → CheckColor (成功=绿色, 失败=红色) → [True] 继续下一步
                                                    → [False] 重试
```

#### 快捷键

*   **Alt + F1**：停止工作流执行（可自行设置，注意先进行尝试是否能够关闭，防止执行中循环无法关闭，注意笔记本可能需要Alt + Fn + F1）

#### 注意事项

*   **Windows 专用**：UIAutomation 仅在 Windows 上可用
*   **浏览器要求**：需要 Chrome/Edge 浏览器
*   **超时设置**：语义定位超时 15 秒后使用降级坐标
*   **最大执行数**：节点图最多执行 10000 步防止死循环

---

### 7. Refinery (剪贴板历史)

**核心功能：**
*   全面的剪贴板历史管理器，支持文本和图片
*   自动记录每次复制的内容，便于随时找回
*   支持搜索、筛选（文本/图片类型）
*   可收藏重要条目，添加笔记注释
*   日历视图按日期筛选历史记录
*   可配置自动清理规则，节省存储空间
*   与 Spotlight 集成，支持快捷粘贴

**访问方式：**
*   点击侧边栏 "剪贴板" 图标打开
*   或在 Spotlight 中ALT+3快速访问

**使用指南：**
*   **浏览历史**：主界面显示所有剪贴板历史记录
*   **搜索筛选**：使用顶部的搜索框或筛选按钮过滤
*   **收藏管理**：点击星标收藏重要条目
*   **添加笔记**：选中条目后可在侧边栏添加笔记
*   **日历视图**：切换到日历标签按日期查看
*   **快速粘贴**：在 Spotlight 中输入关键词快速粘贴
*   **自动清理**：在设置中配置自动清理规则

---

### 8. System Monitor (系统监控)

实时监控系统状态和开发环境。

#### Dashboard 仪表盘

*   **CPU 使用率**：实时显示 CPU 占用百分比
*   **内存使用**：显示内存占用情况和可用内存
*   **系统运行时间**：显示系统启动后运行的时间
*   **性能指标**：关键性能数据的可视化展示

#### Ports 端口监控

*   查看所有活跃的网络端口
*   显示每个端口的监听进程
*   显示进程 ID 和名称
*   支持终止占用端口的进程

#### Environment 环境检测

*   **已检测的 IDE**：VS Code、JetBrains 系列等
*   **浏览器**：Chrome、Firefox、Edge 等
*   **SDK 和工具**：Python、Node.js、Git 等
*   **开发环境分析**：完整的开发环境指纹

#### Network 网络诊断

*   网络连接状态测试
*   延迟检测
*   连接质量评估

---

### 9. 配置指南 (Setup Guide)

#### AI Configuration (AI 配置)

为了使用 Spotlight 的 AI 对话功能，你需要配置模型提供商。

1.  点击左侧侧边栏底部的 **设置** 图标
2.  进入 **AI Configuration** 选项卡
3.  填写 API 信息：
    *   **Provider**：选择提供商（仅作图标区分，不限制使用）
        *   DeepSeek：推荐使用，性价比高
        *   OpenAI：GPT 系列模型
        *   Anthropic：Claude 系列模型
        *   其他：填写自定义名称
    *   **API Key**：填入你的 API 密钥（数据仅存储在本地）
    *   **Base URL**：（可选）如果使用硅基流动、OneAPI 等中转服务，填写对应的地址
        *   示例：`https://api.siliconflow.cn`
    *   **Model ID**：填入模型名称
        *   DeepSeek 示例：`deepseek-chat`、`deepseek-reasoner`
        *   OpenAI 示例：`gpt-4o`、`gpt-4o-mini`
    *   **Temperature**：设置模型输出随机性（0-1，默认 0.7）

**推荐配置：**
*   **免费选择**：GLM 模型（有免费额度）
*   **高性价比**：DeepSeek 模型
*   **高质量**：GPT-4o 或 Claude 3.5 Sonnet

#### Spotlight Settings (Spotlight 设置)

*   **Global Shortcut**：自定义全局快捷键
    *   默认：`Alt + S`
    *   可修改为任意组合键
*   **Window Size**：调整 Spotlight 窗口大小
*   **Rest Reminder**：休息提醒功能
    *   启用/禁用提醒
    *   设置提醒间隔时间

#### Search Settings (搜索设置)

*   **Default Engine**：选择默认搜索引擎
    *   Google：全球最大搜索引擎
    *   Bing：微软搜索引擎
    *   百度：中文搜索引擎
    *   Custom：自定义搜索引擎
*   **Custom URL**：配置自定义搜索地址
    *   使用 `%s` 作为搜索关键词占位符
    *   示例：`https://www.google.com/search?q=%s`

#### Appearance (外观设置)

*   **Theme**：选择明亮或暗色主题
*   **Language**：选择界面语言（中文/English）
*   **Sidebar**：侧边栏展开/收起设置
*   **Context Panel Width**：调整面板宽度

#### Global Filters (全局过滤)

配置在所有功能中忽略的文件和文件夹：

*   **Ignore Files**：文件名模式（如 `*.log`）
*   **Ignore Folders**：文件夹名称（如 `node_modules`）
*   **Ignore Extensions**：文件扩展名（如 `.png`）

#### Security (安全设置)

*   **Secret Scanning**：敏感信息扫描开关
*   **Whitelist**：管理忽略的敏感信息规则
*   **Gitleaks Rules**：基于 Gitleaks 的检测规则

#### Library (库管理)

*   **Export Configuration**：导出应用配置（包括提示词、设置等）
*   **Import Configuration**：导入配置文件
*   **Download Official Packs**：下载官方提示词包
*   **Export Prompts**：导出提示词为 CSV
*   **Import Prompts**：从 CSV 导入提示词

---

### 10. 常用快捷键一览

#### 全局快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `Alt + S` | 唤起/隐藏 Spotlight（可在设置中修改） |
| `Alt + F1` | 启动/停止 自动点击 |

#### Spotlight 快捷键

| 快捷键 | 搜索模式功能 | AI 对话模式功能 |
| :--- | :--- | :--- |
| `Tab/Alt+1、2、3` | 切换到 AI 对话模式 | 切换到搜索模式 |
| `F8` | 进入/保存窗口尺寸调整模式 | 进入/保存窗口尺寸调整模式 |
| `Enter` | 执行命令/复制内容/打开应用 | 发送消息 |
| `Arrow Up/Down` | 在搜索结果中导航 | 在聊天历史中导航 |
| `Ctrl/Cmd + K` | - | 清空当前对话历史 |
| `Escape` | 清空输入框或关闭 Spotlight | 清空输入框或关闭 Spotlight |
| `/` | 打开命令菜单 | 打开命令菜单 |
| `=` | 切换到计算器模式 | - |
| `>或》` | 切换到 Shell 命令模式 | - |
| `?或？` | 切换到 Web 搜索模式 | - |

---

**CtxRun** - Run with context, AI at your fingertips.

如有问题或建议，欢迎访问 [GitHub Issues](https://github.com/WinriseF/CtxRun/issues) 反馈。
