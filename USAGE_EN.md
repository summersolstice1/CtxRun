# CtxRun - Detailed Usage Guide

This document provides detailed usage instructions, configuration guides, and keyboard shortcut references for all core features of CtxRun.

## Table of Contents

1.  [Context Forge (File Assembly)](#1-context-forge-file-assembly)
2.  [Spotlight (Global AI Terminal)](#2-spotlight-global-ai-terminal)
3.  [Prompt Verse (Prompt Library)](#3-prompt-verse-prompt-library)
4.  [Patch Weaver (AI Completer)](#4-patch-weaver-ai-completer)
5.  [Model Miner (Web Content Mining)](#5-model-miner-web-content-mining)
6.  [Automator (Workflow Automation)](#6-automator-workflow-automation)
7.  [Refinery (Clipboard History)](#7-refinery-clipboard-history)
8.  [System Monitor (System Monitoring)](#8-system-monitor-system-monitoring)
9.  [Transfer (LAN Transfer)](#9-transfer-lan-transfer)
10. [Peek (Standalone Preview)](#10-peek-standalone-preview)
11. [Guard (Idle Guard)](#11-guard-idle-guard)
12. [Setup Guide](#12-setup-guide)
13. [Common Keyboard Shortcuts Reference](#13-common-keyboard-shortcuts-reference)

---

### 1. Context Forge (File Assembly)

**Solves the pain point:** Quickly package project files into LLM-readable formats (ChatGPT/Claude/DeepSeek).

#### Core Features

*   **File Selection**:
    *   Check the code files or folders you want the AI to understand in the left file tree
    *   Supports virtual scrolling, easily handles large project directories
    *   Double-click to quickly preview selected files (supports images, videos, code, and other formats)

*   **Filter System**:
    *   Global filter rules: Configure files, folders, and extensions to ignore in settings
    *   Instant filtering: The filter input box at the bottom can quickly filter the current view

*   **Smart Statistics**:
    *   Bottom dashboard displays real-time total size of selected files
    *   **Estimated Token Count**: Accurately calculated based on actual encoding
    *   Language distribution: Automatically detects and displays file proportions by programming language

*   **Token Optimization**:
    *   Enable **"Remove Comments"** toggle to automatically strip code comments and save significant tokens
    *   Automatically detects and filters binary files (such as images, PDFs, videos, etc.)

*   **Security Scan**:
    *   Built-in sensitive information detection engine, automatically scans before copying
    *   Detects API keys, passwords, and other sensitive information
    *   Supports whitelist management, custom ignore rules

*   **Export Options**:
    *   **Copy to Clipboard**: One-click copy of structured XML text to clipboard
    *   **Export to File**: Export as TXT file, recommended for sending to AI
    *   Automatically generates project structure tree and complete file contents

---

### 2. Spotlight (Global AI Terminal)

**Default shortcut:** `Alt + S` (Windows) or `Option + S` (macOS). On Linux, the shortcut may be occupied by the system. Shortcuts can be customized in settings.

Spotlight is an always-on-top floating window with multiple modes. Press **`Tab`** to switch between search mode and AI chat mode, press **`ESC`** to exit.

#### Search Mode

Quickly search and use your command library, applications, and system functions.

**Basic Search:**
*   Enter keywords to find local or downloaded Prompts/Commands
*   For command instructions, press `Enter` to execute directly through terminal
*   For regular prompts, press `Enter` to copy content directly to clipboard
*   Automatically detects and handles URLs, press Enter to open directly in browser

**Scope Search Prefixes:**
*   `/app` - Search installed applications only
*   `/cmd` - Search command library only
*   `/pmt` - Search prompt library only
*   No prefix searches all content (applications, commands, prompts)

**Calculator Mode:**
*   Enter prefix `=` to enter calculator mode
*   Example: `=1+1` → Result 2
*   Example: `=sin(pi/2)` → Result 1
*   Supports common math functions: sin, cos, tan, log, sqrt, abs, pow, etc.
*   Supports constants: pi, e

**Shell Command Mode:**
*   Enter prefix `>` or `》` to enter Shell command mode
*   Linux/Mac example: `>ls -la`
*   Windows example: `>dir`
*   Results are displayed directly in the Spotlight window
*   Click "Run in terminal" button to execute in full terminal
*   Supports command history matching, use arrow keys to browse

**Web Search Mode:**
*   Enter prefix `?` or `？` to enter Web search mode
*   Example: `?react hooks`
*   Supports multiple search engines: Google, Bing, Baidu
*   Configure default search engine and custom search URL in settings
*   Search engine icons displayed with brand colors for quick identification
*   Search results show official brand icons for each search engine

**Application Launcher:**
*   Enter application name or keywords to quickly find
*   After selecting target application, press `Enter` or click "Open" to launch
*   Supports displaying application icons
*   Requires rebuilding application index in settings

#### AI Chat Mode

Chat with AI directly without switching browsers.

**How to Enter:**
*   Press `Tab` in search mode to switch to AI mode with purple interface
*   Or type `/` to open command menu for quick access

**Chat Features:**
*   Streaming replies, displays AI responses in real-time
*   Full Markdown rendering support
*   Code syntax highlighting
*   Supports copying message content (plain text or Markdown format)

**Reasoning Model Support:**
*   Supports DeepSeek-R1 and other reasoning models
*   Collapsible view of AI's "Thinking Process"
*   Automatically recognizes and processes reasoning content

**Template System:**
*   Check "Use as chat template" in prompt management
*   That prompt will be used as the system prompt for AI chat
*   Implements custom AI behavior and role settings

**Session Management:**
*   Press `Ctrl + K` (Windows) or `Cmd + K` (macOS) to clear current temporary session
*   Chat history is only saved in memory
*   Automatically clears after restart, keeping it lightweight

**AI Tool Calling:**
*   AI can automatically invoke tools during conversations to accomplish complex tasks
*   Tool calls are displayed as **inline tool call blocks** within the chat flow
*   Supported tool types:
    *   **File System Operations**: List directory (`fs.list_directory`), search files (`fs.search_files`), read file (`fs.read_file`)
    *   **Web Operations**: Web search (`web.search`), web page content extraction (`web.extract_page`)
*   Each tool call block displays:
    *   Tool name and status (running/completed/failed)
    *   Arguments preview and result preview
    *   Execution duration
*   **Execution Approval Panel**: High-risk operations (such as executing commands) trigger an approval panel
    *   One-click **approve** or **reject** execution
    *   Supports auto-allow by command prefix rules
    *   Rejection can include an optional reason note

---

### 3. Prompt Verse (Prompt Library)

Manage your common commands and AI prompts to build a personal knowledge base.

#### Core Features

**Create and Edit:**
*   Supports creating custom groups to categorize and manage prompts
*   Write universal templates containing variables (`{{variable}}`)
*   System automatically prompts for input when using variables
*   Virtualized grid display, easily manage large numbers of prompts

**Prompt Types:**

*   **Regular Prompts**: Text content, copied to clipboard for use

*   **Executable Commands**:
    *   Create terminal command scripts
    *   Click to execute directly through terminal
    *   Commands execute sequentially from top to bottom
    *   Supports multi-line commands and complex scripts

*   **Chat Templates**:
    *   Check "Use as chat template"
    *   Used as system prompt for Spotlight AI chat
    *   Implements custom AI behavior

**Import and Export:**
*   Supports exporting to CSV format
*   Supports importing prompts from CSV
*   Convenient for backing up and sharing personal prompt libraries

**Official Store:**
*   Go to **Library** tab in settings
*   Download offline command packs (such as Linux command collection, programming assistant Prompts)
*   Automatically updates official prompt library

**Override Mechanism:**
*   If you favorite and modify official commands
*   Local modifications will override official versions, no conflicts
*   Official updates won't affect your custom versions

**Favorite System:**
*   Star frequently used prompts
*   Quick access to important content

---

### 4. Patch Weaver (AI Completer)

Bridges the gap between "AI-generated code" and "actual file modifications", applying AI output directly to code.

#### Scenario 1: AI Patch Applicator

An innovative feature designed for AI-assisted coding.

**Workflow:**

1.  **Load Project**: Click "Select Project" to select the root directory of a local project
2.  **Get Instructions**: Sidebar provides **"AI Instruction"** system prompt
3.  **Send to AI**: Copy the prompt and attach modification requirements, then send to the large language model
4.  **Paste AI Response**: AI returns text containing `<<<<<<< SEARCH ... >>>>>>> REPLACE` blocks
5.  **Auto Parse and Preview**:
    *   Instantly parses all modification operations for one or multiple files
    *   Simulates applying patches in memory
    *   Displays modification comparison in Monaco Editor-powered Diff view
6.  **Apply or Cancel**: After preview is correct, click "Apply Patches" to apply all modifications

**Supported Formats:**
*   YAML format patch blocks
*   SEARCH/REPLACE markers
*   Multi-file batch modifications

**Export Function:**
*   Export patches to multiple formats: Markdown, JSON, XML, TXT
*   Multiple layout options: Split, Unified, Git Patch

#### Scenario 2: Git Version Comparator (Git Diff Visualizer)

A powerful Git visualization tool.

**Workflow:**

1.  **Browse Git Repository**: Select a local project containing `.git` directory
2.  **Load Commit Records**: Application reads recent 50 commit records
3.  **Select Versions**: Select any two commits in dropdown to compare
4.  **Generate Diff**: Click "Generate Diff" to view differences
5.  **Review and Export**:
    *   Left list shows all changed files
    *   File status indicators: **Added (A)**, **Modified (M)**, **Deleted (D)**, **Renamed (R)**
    *   Automatically marks binary files and oversized files
    *   Click file to review in detail in right Diff view

**Special Modes:**
*   **Working Directory Mode**: Compare current working directory with last commit
*   **Base Version**: Select base version
*   **Compare Version**: Select version to compare

**Export Options:**
*   Formats: Markdown, JSON, XML, TXT
*   Layouts: Split, Unified, Git Patch

---
### 5. Model Miner (Web Content Mining)

**Solves the pain point:** Intelligently crawl website content and convert to Markdown format, with depth control and concurrent processing.

#### Core Features

**Smart Content Extraction:**
*   Uses **Readability.js** to extract core page content
*   Automatically converts to Markdown format (turndown.js)
*   Filters ads and irrelevant elements, keeps valuable content

**Concurrent Crawling Engine:**
*   Browser automation based on **headless_chrome**
*   Supports 1-10 concurrent threads (default 5)
*   Uses crossbeam-channel for task queue
*   Each thread independently manages browser tabs

**Depth and Scope Control:**
*   **URL Prefix Matching**: Strictly limits crawling scope, prevents runaway
*   **Max Depth**: Controls link recursion level (0 means current page only)
*   **Max Pages**: Prevents crawling too many pages

**Hierarchical File Storage:**
*   Automatically generates directory tree based on URL structure
*   Example: `example.com/docs/api/guide.md`
*   Automatically adds metadata: title, source URL, crawl time

#### Usage Workflow

**Configuration Parameters:**

| Parameter | Description | Example |
|-----------|-------------|---------|
| URL | Starting URL | `https://docs.rs/ort` |
| Match Prefix | URL prefix restriction | `https://docs.rs/ort/2.0.0-rc.11/ort/` |
| Max Depth | Maximum crawl depth | `2` (0=current page only) |
| Max Pages | Maximum page count | `100` |
| Concurrency | Concurrent thread count | `5` (1-10) |
| Output Dir | Output directory | `E:\Docs\output` |

**Execution Steps:**

1. Fill in configuration parameters, set crawling scope and limits
2. Click "Start Crawling" to launch the task
3. Monitor progress in real-time:
    *   Current page count processed
    *   Total URLs discovered
    *   Currently processing URL
    *   Processing status (Fetching/Processing/Saved)
4. Automatically stops after crawling completes
5. View results in output directory

**Output Format:**

Each Markdown file contains Front Matter metadata:

```markdown
---
title: "Page Title"
source_url: "https://example.com/page"
crawled_at: "2025-02-27T10:30:00+00:00"
---

Page content...
```

#### Notes

*   **Browser Requirement**: Chrome/Edge browser must be installed
*   **Network Limits**: High concurrency may be restricted by target website, recommend reducing concurrency
*   **URL Matching**: Match Prefix must be set accurately to prevent crawling irrelevant pages
*   **Output Directory**: Creates `ctxrun_docs` subfolder in specified directory

---

### 6. Automator (Workflow Automation)

**Solves the pain point:** Visual workflow orchestration with browser automation, UI element targeting, and physical input simulation.

#### Workflow Modes

**1. Sequential Workflow (Workflow)**

Execute a series of actions in sequence, with configurable repeat count.

**2. Node Graph Workflow (WorkflowGraph)**

Visual node-based orchestration with conditional branching and loop control.

#### Supported Actions

**Mouse Operations:**
*   **MoveTo**: Move mouse to target position
*   **Click**: Single-click (left/right/middle button)
*   **DoubleClick**: Double-click

**Keyboard Operations:**
*   **Type**: Input text
*   **KeyPress**: Key/key combination (e.g., `Ctrl+A`, `Alt+F4`)

**Other Operations:**
*   **Scroll**: Scroll mouse wheel
*   **Wait**: Wait specified milliseconds
*   **CheckColor**: Check pixel color at coordinates (conditional branch)
*   **Iterate**: Loop counter (conditional branch)
*   **LaunchBrowser**: Launch debug mode browser

#### Target Targeting Methods

**1. Coordinate Targeting (Coordinate)**
*   Directly specify screen coordinates (X, Y)
*   Most precise but lacks flexibility

**2. Semantic Targeting (Semantic)**
*   Target UI elements via Windows UIAutomation API
*   Supports name, role, window title, process name matching
*   Automatically finds element's clickable point
*   Supports fallback coordinates as backup

**3. Web Selector (WebSelector)**
*   Target web elements via CSS selectors
*   Browser tries first, falls back to physical click on failure
*   Supports URL filtering (multi-tab scenarios)

#### Browser Automation

**Debug Mode Launch:**
*   Automatically launches Chrome/Edge remote debug mode
*   Supports temporary user profile isolation
*   Auto-connects to debug port

**Web Element Operations:**
*   **Click**: Click element via CSS selector
*   **Type**: Input text in input field
*   **Key**: Send shortcut keys (e.g., `Ctrl+A`, `Enter`)

**Physical Input Fallback:**
*   Automatically falls back when browser operations fail
*   Uses enigo to simulate physical mouse/keyboard input
*   Ensures operation reliability

#### Conditional Branching

**CheckColor (Color Check):**
*   Checks pixel color at specified coordinates
*   Supports tolerance setting (RGB component difference)
*   Jumps to true_id or false_id branch based on result

**Iterate (Loop Counter):**
*   Node-level loop counter
*   Jumps to false_id after reaching target count
*   Jumps to true_id when not reached

#### UI Element Picking

**Picking Features:**
*   Real-time UI element info under mouse cursor
*   Shows element name, role, class name
*   Records complete path from root to current element
*   Gets element's clickable coordinates

#### Usage Examples

**Simple Click Flow:**
```
LaunchBrowser → Wait → Click (selector) → Type text → Press Enter
```

**Conditional Branch Flow:**
```
Click button → CheckColor (success=green, failure=red) → [True] Continue next step
                                                        → [False] Retry
```

#### Keyboard Shortcuts

*   **Alt + F1**: Stop workflow execution (customizable, test if it can close first to prevent being unable to close during loop execution. Note: laptops may require Alt + Fn + F1)

#### Notes

*   **Windows Only**: UIAutomation is only available on Windows
*   **Browser Requirement**: Chrome/Edge browser required
*   **Timeout Setting**: Semantic targeting falls back to fallback coordinates after 15 second timeout
*   **Max Execution Count**: Node graph executes max 10000 steps to prevent infinite loops

---

### 7. Refinery (Clipboard History)

**Core Features:**
*   Full clipboard history manager supporting text and images
*   Auto-records every copy for easy retrieval
*   Search, filter (text/image types)
*   Pin important entries, add notes
*   Calendar view for date filtering
*   Auto-cleanup rules to save storage space
*   Spotlight integration for quick paste

**Access Methods:**
*   Click "Clipboard" icon in sidebar to open
*   Or press ALT+3 in Spotlight for quick access

**Usage Guide:**
*   **Browse History**: Main interface shows all clipboard history records
*   **Search & Filter**: Use search box or filter buttons
*   **Pin Items**: Click star icon to pin important entries
*   **Add Notes**: Select item and add note in sidebar
*   **Calendar View**: Switch to calendar tab to filter by date
*   **Quick Paste**: Type keywords in Spotlight for quick paste
*   **Auto Cleanup**: Configure cleanup rules in settings

---

### 8. System Monitor (System Monitoring)

Real-time monitoring of system status and development environment.

#### Dashboard

*   **CPU Usage**: Real-time display of CPU usage percentage
*   **Memory Usage**: Shows memory usage and available memory
*   **System Uptime**: Displays time since system started
*   **Performance Metrics**: Visual display of key performance data

**Battery Information:**
*   Battery percentage and charging state (charging/discharging/full/empty)
*   Battery health, power (W), voltage (V)
*   Battery temperature (Celsius)
*   Estimated time to full/to empty
*   Battery technology type and vendor info

**Disk Details:**
*   Disk type identification: **SSD** / **HDD** auto-detection
*   Usage percentage visualization
*   Total space, used space, available space
*   File system type
*   Whether the disk is removable or read-only

**Network Traffic:**
*   Real-time send/receive rate per network interface (bytes/sec)
*   Cumulative total sent/received
*   Interface type identification (virtual/physical adapter)
*   MAC address, IP address, MTU, default gateway info

#### Ports Monitoring

*   View all active network ports
*   Shows listening process for each port
*   Displays process ID and name
*   Supports killing processes occupying ports
*   **Windows Enhancement**: Uses RestartManager API to find processes locking files, precisely identifying port occupation sources

#### Environment Detection

*   **Detected IDEs**: VS Code, JetBrains series, etc.
*   **Browsers**: Chrome, Firefox, Edge, etc.
*   **SDKs and Tools**: Python, Node.js, Git, etc.
*   **Development Environment Analysis**: Complete development environment fingerprint

#### Network Diagnostics

*   Network connection status test
*   Latency detection
*   Connection quality assessment

**Network Speed Test:**
*   Integrated **M-Lab NDT7** open-source speed testing tool
*   One-click download/upload speed test
*   Displays test server information (name, location)
*   Real-time speed curve chart
*   Speed test results cached locally for historical comparison
*   First-time use requires accepting the M-Lab data policy

---

### 9. Transfer (LAN Transfer)

LAN file transfer and instant messaging tool for quickly sharing files and messages between devices on the same network.

#### Core Features

**Service Startup:**
1.  Click the "Start Service" button to launch the local HTTP/WebSocket server
2.  Automatically detects physical network interface IP addresses, filters virtual adapters
3.  Generates local access URL (e.g., `http://192.168.1.100:5173`)
4.  Displays a **QR code** for mobile or other devices to scan and connect
5.  Supports one-click copy URL to clipboard

**Device Management:**
*   Connected devices automatically appear in the left **device list**
*   Displays device name, IP address, and device type icon (phone/computer)
*   Click a device to enter the chat interface

**Instant Chat:**
*   Select a device to enter a one-on-one chat interface
*   Supports plain text messaging
*   Messages are ordered chronologically with timestamps

**File Transfer:**
*   Click the **attachment button** (paperclip icon) to select a local file to send
*   The file recipient receives a file request notification and can **approve** or **reject** it
*   During transfer, **progress info** is displayed (transfer speed, completion percentage)
*   Completed files can be opened in the file manager with one click
*   Image files support **inline preview**

#### Network Configuration

*   Automatically detects and uses physical network interfaces, filters virtual network adapters
*   Service port is auto-assigned

#### Notes

*   All devices must be on the **same local network**
*   File transfers require recipient confirmation before starting
*   Stopping the service disconnects all connected devices

---

### 10. Peek (Standalone Preview)

A standalone file preview popup window, upgraded from the HyperView embedded preview for a better preview experience.

#### Core Features

*   File previews open in an **independent popup window**, not blocking the main interface
*   Supports **multi-tab** preview, quick switching between multiple files
*   Provides previous/next navigation buttons to browse other files in the same directory
*   Window auto-closes on focus loss (prevents interference), paused during drag operations

#### Supported File Types

*   **Code files**: Syntax highlighting, supports multiple programming languages
*   **Markdown / HTML**: Rendered preview
*   **Images**: PNG, JPG, GIF, WebP, BMP, SVG, AVIF
*   **Video / Audio**: Embedded player
*   **DOCX Documents**: Word document preview (new)
*   **PDF Documents**: PDF file preview (new)
*   **Archives**: Archive file browsing

#### Preview Mode Switching

For files supporting multiple preview modes, a **mode switch bar** is provided at the top:

*   **Default**: Automatically selects the best preview method
*   **Source**: Displays raw text content
*   **Rendered**: Rendered effect (e.g., Markdown)
*   **Formatted**: Formatted code view
*   **Table**: Displays structured data in table format

---

### 11. Guard (Idle Guard)

Automatic screen lock on idle timeout to protect your computer.

#### Core Features

When the computer is idle beyond the configured timeout, the screen is automatically locked and requires manual unlock to resume.

#### Configuration

Configure in **Settings > Security > Guard**:

*   **Enable/Disable**: Turn idle guard on or off
*   **Idle Timeout**: Set the idle duration before screen lock triggers
    *   Range: 1 minute to 30 minutes (minimum 15 seconds, default 180 seconds)
    *   Adjustable via slider
*   **Prevent System Sleep**: Blocks OS from entering sleep state when guard is active
*   **Keep Display On**: Keeps the monitor from turning off when guard is active (requires "Prevent System Sleep" to be enabled first)

#### Unlock Method

*   The lock screen displays a **circular progress button**
*   **Press and hold the button for 1.5 seconds** to unlock
*   While holding, the circular progress ring gradually fills up; when full, unlock succeeds
*   Releasing midway resets the progress

#### Notes

*   **Windows only** (depends on Windows platform APIs)
*   When active, the guard covers the entire screen, preventing interaction with other windows
*   Configuration changes take effect immediately, no restart required

---

### 12. Setup Guide

The settings page has been refactored from a popup dialog into a **standalone page**, accessible via the settings icon at the bottom of the sidebar. The settings page features a navigation panel on the left and configuration content on the right, supporting categorized browsing.

#### Settings Page Navigation

The settings page is organized into the following sections:

*   **General**: Theme, language, shortcuts, window settings
*   **Search/Workspace**: Search engine, global filter rules
*   **AI (AI Configuration)**: Model providers, API configuration
*   **Library**: Prompt import/export, official pack downloads
*   **Data Maintenance**: Data management, clipboard cleanup
*   **Security**: Sensitive information scanning, Guard idle protection
*   **About**: Version information

#### Radial View Switcher (ViewSwitcher)

The main interface provides a **radial menu** on the left side for quickly switching between feature views:
*   Hover or click the center button to open the radial menu
*   Feature icons are arranged on the radial menu (prompts, file assembly, patch, clipboard, automation, miner, transfer)
*   Click an icon to quickly navigate to the target feature page

#### AI Configuration

To use Spotlight's AI chat feature, you need to configure model providers.

1.  Go to **Settings > AI** page
2.  Fill in API information:
    *   **Provider**: Select provider (only for icon distinction, does not limit usage)
        *   DeepSeek: Recommended, cost-effective
        *   OpenAI: GPT series models
        *   Anthropic: Claude series models
        *   Others: Enter custom name
    *   **API Key**: Enter your API key (data is stored locally only)
    *   **Base URL**: (Optional) If using relay services like SiliconFlow or OneAPI, enter corresponding address
        *   Example: `https://api.siliconflow.cn`
    *   **Model ID**: Enter model name
        *   DeepSeek example: `deepseek-chat`, `deepseek-reasoner`
        *   OpenAI example: `gpt-4o`, `gpt-4o-mini`
    *   **Temperature**: Set model output randomness (0-1, default 0.7)

**Recommended Configuration:**
*   **Free Option**: GLM models (has free quota)
*   **Cost-effective**: DeepSeek models
*   **High Quality**: GPT-4o or Claude 3.5 Sonnet

#### General Settings

*   **Theme**: Select light, dark, or black theme
*   **Language**: Select interface language (Chinese/English)
*   **Spotlight Shortcut**: Customize Spotlight global shortcut (default `Alt + S`)
*   **Automator Shortcut**: Customize Automator shortcut (default `Alt + F1`)
*   **Window Destroy Delay**: Window destruction delay time

#### Search/Workspace Settings

*   **Default Engine**: Select default search engine
    *   Google: Global search engine
    *   Bing: Microsoft search engine
    *   Baidu: Chinese search engine
    *   Custom: Custom search engine
*   **Custom URL**: Configure custom search address
    *   Use `%s` as search keyword placeholder
    *   Example: `https://www.google.com/search?q=%s`
*   **Global Filters**: Global filter rules
    *   Ignore Files: Filename patterns (like `*.log`)
    *   Ignore Folders: Folder names (like `node_modules`)
    *   Ignore Extensions: File extensions (like `.png`)

#### Security

*   **Secret Scanning**: Sensitive information scanning toggle
*   **Whitelist**: Manage ignored sensitive information rules
*   **Gitleaks Rules**: Detection rules based on Gitleaks
*   **Guard**: Idle guard configuration (see [Guard section](#11-guard-idle-guard))

#### Data Maintenance

*   **Export Configuration**: Export application configuration (including prompts, settings, etc.)
*   **Import Configuration**: Import configuration file
*   **Download Official Packs**: Download official prompt packs
*   **Export Prompts**: Export prompts to CSV
*   **Import Prompts**: Import prompts from CSV
*   **Clipboard Cleanup**: Configure auto-cleanup rules and buffer threshold

#### Library

*   Download and manage official prompt packs
*   Automatically updates official prompt library

---

### 13. Common Keyboard Shortcuts Reference

#### Global Shortcuts

| Shortcut | Function |
| :--- | :--- |
| `Alt + S` | Show/hide Spotlight (can be changed in settings) |
| `Alt + F1` | Start/Stop Auto-Clicker |

#### Spotlight Shortcuts

| Shortcut | Search Mode Function | AI Chat Mode Function |
| :--- | :--- | :--- |
| `Tab/Alt+1、2、3` | Switch to AI chat mode | Switch to search mode |
| `F8` | Enter/save window resize mode | Enter/save window resize mode |
| `Enter` | Execute command/copy content/open app | Send message |
| `Arrow Up/Down` | Navigate in search results | Navigate in chat history |
| `Ctrl/Cmd + K` | - | Clear current chat history |
| `Escape` | Clear input or close Spotlight | Clear input or close Spotlight |
| `/` | Open command menu | Open command menu |
| `=` | Switch to calculator mode | - |
| `>` or `》` | Switch to Shell command mode | - |
| `?` or `？` | Switch to Web search mode | - |

---

**CtxRun** - Run with context, AI at your fingertips.

For questions or suggestions, please visit [GitHub Issues](https://github.com/WinriseF/CtxRun/issues) to provide feedback.
