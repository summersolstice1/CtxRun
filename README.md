<div align="center">
  <a href="https://github.com/WinriseF/CtxRun">
    <img src="images/banner.png" alt="CtxRun Logo" width="1536" height="574">
  </a>

  <p align="center">
    <a href="https://github.com/WinriseF/CtxRun/actions">
      <img src="https://img.shields.io/github/actions/workflow/status/WinriseF/CtxRun/update-prompts.yml?style=flat-square&logo=github&label=build" alt="Build Status">
    </a>
    <a href="https://tauri.app">
      <img src="https://img.shields.io/badge/built%20with-Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Built with Tauri">
    </a>
    <a href="https://react.dev">
      <img src="https://img.shields.io/badge/frontend-React-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React">
    </a>
    <a href="https://www.rust-lang.org">
      <img src="https://img.shields.io/badge/backend-Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/WinriseF/CtxRun?style=flat-square&color=blue" alt="License">
    </a>
  </p>
</div>

<br />

**CtxRun** is an AI-powered productivity tool designed for developers. It integrates code context assembly, code diff, prompt management, and a always-ready global AI terminal, seamlessly connecting your IDE with Large Language Models (LLMs).

![alt text](images/ScreenShot_2025-11-28_185818_533.png)
![alt text](images/ScreenShot_2025-11-28_185842_701.png)
![alt text](images/ScreenShot_2025-11-28_185855_631.png)
![alt text](images/ScreenShot_2025-11-28_185940_974.png)
![alt text](images/ScreenShot_2025-11-28_185955_998.png)

## ✨ Core Features

*   **🚀 Context Forge (File Assembly)**: Intelligently package your project files into LLM-friendly formats with automatic comment removal, binary file filtering, and real-time token estimation. Supports configuration persistence and project memory.
*   **💡 Spotlight (Global AI Terminal)**: Summon anytime with global hotkey (`Alt+S`). Quickly search and execute commands, or have streaming AI conversations from any application.
    *   **Calculator**: Type `=1+1`, `=sin(pi)` for quick math
    *   **Shell Commands**: Type `>ls`, `>dir` to execute terminal commands
    *   **Scope Search**: `/app` for apps, `/cmd` for commands, `/pmt` for prompts
    *   **Template AI**: Configure prompts as chat templates for auto-application
    *   **App Launcher**: Search and launch installed applications quickly
*   **📚 Prompt Verse (Prompt Library)**: Efficiently manage your common commands and AI prompts. Supports variable templates, group management, and downloading offline prompt packs from the official library. Supports executable commands and chat template configuration.
*   **🔄 Patch Weaver (AI Completer & Git Diff)**: Apply AI-generated code patches with smart fuzzy matching for precise modification location. Also a powerful Git Diff visualizer with Working Directory comparison, version comparison, and diverse export formats.
*   **🛡️ Privacy Security Scan**: Built-in sensitive information detection engine with whitelist management to prevent API key and other secrets leakage.
*   **📋 Refinery (Clipboard History)**: Comprehensive clipboard history manager supporting text and images. Features search/filtering, pinning important entries, note-taking, auto-cleanup, calendar view, and Spotlight quick paste integration.
*   **🖱️ Automator (Auto-Clicker)**: Powerful auto-click automation tool supporting left/right/middle click, configurable interval and count, fixed position or follow mouse cursor.

> ### 🚀 Want to learn how to use it?
>
> 👉 **[Check out the Detailed Usage Guide](./USAGE_EN.md)**

## 🛠️ Tech Stack

Built with a modern **high-performance desktop application architecture**, balancing minimal resource usage with smooth user experience (~10MB install size, ~30MB memory footprint):

*   **Core**: [Tauri 2](https://tauri.app/) (Rust + WebView2) - Native-level performance with minimal install size, multi-window support.
*   **Frontend**: React 18 + TypeScript + Vite 6 - Modern frontend development experience.
*   **State Management**: Zustand - Lightweight yet powerful state management.
*   **Styling**: Tailwind CSS + tailwindcss-animate - Beautiful UIs built fast.
*   **Icons**: Lucide React.
*   **Database**: SQLite (rusqlite) + Refinery - Local data persistence and migration management.
*   **Editor**: Monaco Editor - VSCode-level code editing experience.

---

## 📥 Download & Installation

Download installers for your OS from the [Releases](../../releases) page, or download the portable version (**CtxRun.exe**) - no installation required, click to run (data stored in `%localappdata%\com.ctxrun`):

*   **Windows**: `.msi` or `.exe`

---

## ⚠️ About Virus Alerts

When launching the app, you may see a **"Windows has protected your computer" (Microsoft Defender SmartScreen)** blue warning window.

**This is normal.** Since CtxRun is an open-source project maintained by an individual without an EV Code Signing Certificate, it will be flagged as "unknown publisher".

**How to run:**
1. In the blue warning window, click **<u>More info</u>**.
2. Click the **Run anyway** button that appears below.

> 🔒 **Security Commitment**: This project is fully open-source, built automatically by GitHub Actions, and contains no malicious code. If you have concerns, feel free to review the source and build it yourself.
![alt text](images/ScreenShot_2025-11-28_205723_002.png)

## Credits & Open Source Notice

Special thanks to the following projects for data support and inspiration:

*   **[tldr-pages](https://github.com/tldr-pages/tldr)**: Command pack data partially sourced from this project.
*   **[Awesome ChatGPT Prompts](https://github.com/f/awesome-chatgpt-prompts)**: Prompt pack data partially sourced from this project.
*   **[gitleaks](https://github.com/gitleaks/gitleaks)**: Sensitive information detection logic and rules partially inspired by this project.

---

*CtxRun - Run with context, AI at your fingertips.*
