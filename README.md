<p align="center">
  <img src="images/logo.png" alt="NetAcad Autonomous Bot Logo" width="200"/>
</p>

<h1 align="center">NetAcad Autonomous Bot</h1>

<p align="center">
  <strong>A fully autonomous AI-powered Chrome extension that completes Cisco NetAcad courses — quizzes, videos, reading material — without human intervention.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3"/>
  <img src="https://img.shields.io/badge/AI-Google%20Gemini-orange?style=flat-square" alt="Google Gemini"/>
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square" alt="Active"/>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **Full Autonomous Mode** | Navigates entire NetAcad modules — reads pages, skips videos, answers quizzes, and submits assessments automatically |
| 🎯 **Quiz-Only Mode** | Focuses exclusively on detecting and answering quiz questions without navigating other content |
| ⚡ **Beta Mode** | Instant scroll skip — bypasses reading material pages at maximum speed |
| 🧠 **AI-Powered Answers** | Uses Google Gemini AI to analyze MCQ questions and select correct answers |
| ✅ **Auto Answer Selection** | Automatically clicks radio buttons and checkboxes based on AI responses |
| 📦 **Batch Processing** | Sends all questions on a page in a single API call to reduce latency and costs |
| 🔑 **Multi-Key Rotation** | Supports multiple API keys — automatically rotates on quota exhaustion (429/403) |
| 🎛️ **Model Selection** | Choose from Gemini 2.5 Flash, Flash-Lite, Pro Preview, 2.0 Flash, 1.5 Flash/Pro, or Gemma 2 |
| 📤 **Auto Submit** | Clicks Submit once answers are selected, handles confirmation checkboxes on final assessments |
| 🎬 **Video Fast-Forward** | Detects `<video>` elements and jumps to the last timestamp to mark as completed |
| 📜 **Auto Scroll & Navigate** | Scrolls through reading pages and clicks "Next" / ">" arrows to advance modules |
| ⏭️ **Matching Question Skip** | Automatically skips unreliable matching/ordering questions to save API credits |
| 🕵️ **Stealth Mode** | Hides all AI overlay UI when autonomous mode is active — looks like a native user |
| 🔍 **Shadow DOM Traversal** | Pierces through NetAcad's deeply nested Shadow DOM to find questions, buttons, and videos |
| 👁️ **Developer Overlay** | Optional real-time status HUD showing bot state, current action, and quiz lock status |
| 🔄 **MutationObserver** | Watches for dynamic page changes (AJAX/iframe loads) and re-scrapes automatically |
| 🛡️ **State Machine Sync** | Prevents race conditions — won't submit while AI is still processing |

---

## 🚀 Quick Start

### 1. Download

```bash
git clone https://github.com/A2-ashish/autonomous-bot.git
```

Or download the ZIP from the repository page.

### 2. Get a Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click **"Create API Key"**
3. Copy the key

> The free tier provides enough quota for normal usage. No billing required.

### 3. Load in Chrome

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select the project folder
4. Pin the extension for easy access

### 4. Configure & Run

1. Click the extension icon
2. Paste your API key(s) — one per line for multi-key rotation
3. Click **Save API Key**
4. Enable your preferred mode:
   - 🤖 **Full Autonomous Bot** — handles everything
   - 🎯 **Quiz Only Mode** — just answers quizzes
   - ⚡ **Beta Mode** — instant scroll skip
5. Navigate to NetAcad — the bot starts automatically

---

## 🎛️ Configuration

| Option | Default | Description |
|--------|---------|-------------|
| **Gemini API Keys** | _(empty)_ | One or more API keys (one per line). Rotates automatically on quota errors |
| **Show AI Answers** | ✅ On | Display AI answer suggestion overlays below each question |
| **Process on Page Switch** | ✅ On | Auto re-scrape when navigating between questions |
| **🤖 Full Autonomous Bot** | ❌ Off | Complete course autopilot — videos, reading, quizzes, navigation |
| **🎯 Quiz Only Mode** | ❌ Off | Only detect and answer quiz questions |
| **⚡ Beta Mode** | ❌ Off | Instant scroll skip for reading material |
| **AI Model** | Gemini 2.5 Flash | Select from 7 available Gemini models |
| **Developer Overlay** | ❌ Off | Show real-time bot status HUD on page |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Chrome Extension                       │
│                                                           │
│  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌──────────┐  │
│  │ popup.js │  │ content.js│  │ ui.js  │  │scraper.js│  │
│  │ (Config) │  │ (Bot Loop)│  │(Select)│  │ (Extract)│  │
│  └────┬─────┘  └─────┬─────┘  └───┬────┘  └────┬─────┘  │
│       │              │             │             │        │
│       │    ┌─────────▼──────────┐  │             │        │
│       └───►│ chrome.storage.sync│◄─┘             │        │
│            │  (Keys, Flags)     │                │        │
│            └────────────────────┘                │        │
│                      │                           │        │
│            ┌─────────▼───────────────────────────▼───┐   │
│            │        api.js (Gemini API Client)        │   │
│            │   Multi-key rotation • Model selection   │   │
│            └──────────────────┬───────────────────────┘   │
└───────────────────────────────┼───────────────────────────┘
                                │
                     ┌──────────▼──────────┐
                     │  Google Gemini API   │
                     │  (configurable)      │
                     └─────────────────────┘
```

---

## 🔒 Safety Mechanisms

| Mechanism | Purpose |
|-----------|---------|
| **State Lock** | Prevents submitting blank tests while AI is processing |
| **Cooldown Timer** | 2-second buffer after answer selection for DOM updates |
| **Navigation Cooldown** | 5-second wait after page transitions for content to load |
| **Confirmation Guard** | Only checks confirmation checkboxes — never touches quiz answers |
| **Disabled Button Guard** | Won't click disabled Submit buttons |
| **Debounced Scraping** | 3-second debounce on MutationObserver to prevent rapid re-scraping |
| **Loading Spinner Detection** | Pauses when page loading indicators are visible |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+Q` | Process questions on the current page (manual mode) |

---

## 📁 File Structure

```
netacad-autoanswer/
├── manifest.json       # Chrome Extension config (Manifest V3)
├── background.js       # Service worker for keyboard shortcuts
├── content.js          # Bot loop, state machine, MutationObserver
├── scraper.js          # Shadow DOM traversal, question extraction
├── api.js              # Gemini API client with multi-key rotation
├── ui.js               # Answer display, auto-selection, UI injection
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic and chrome.storage sync
├── features.md         # Detailed features & usage guide
├── README.md           # This file
├── CONTRIBUTING.md     # Contribution guidelines
└── images/
    ├── icon-48x48.png  # Extension icon
    └── logo.png        # Project logo
```

---

## 🔐 Privacy

- API keys are stored **locally** in `chrome.storage.sync`
- Keys are **never shared** with anyone except Google's Gemini API endpoint
- No data is sent to any third-party server
- All processing happens in your browser

---

## 🤝 Contributing

Pull requests and suggestions are welcome! Please open an issue or PR for bug fixes, improvements, or new features. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
