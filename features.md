<p align="center">
  <img src="images/logo.png" alt="NetAcad Autonomous Bot Logo" width="200"/>
</p>

# NetAcad Autonomous Bot — Features & Usage Guide

> A fully autonomous AI-powered browser extension that navigates Cisco NetAcad courses, answers quizzes, skips videos, and submits assessments — all without human intervention.

---

## Table of Contents

- [New System Setup (Complete Guide)](#new-system-setup-complete-guide)
- [Features Overview](#features-overview)
- [Architecture](#architecture)
- [Configuration Options](#configuration-options)
- [Usage Modes](#usage-modes)
- [Feature Details](#feature-details)
- [Safety Mechanisms](#safety-mechanisms)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Troubleshooting](#troubleshooting)
- [File Structure](#file-structure)

---

## New System Setup (Complete Guide)

Follow these steps **exactly** to get the bot running on any new computer. No coding knowledge required.

### System Requirements

| Requirement | Details |
|---|---|
| **Browser** | Google Chrome (version 88 or later) or any Chromium-based browser (Edge, Brave, Opera) |
| **Operating System** | Windows, macOS, or Linux — any OS that runs Chrome |
| **Internet Connection** | Required for Gemini API calls and accessing NetAcad |
| **Google Account** | Needed to generate a Gemini API key |
| **No additional software** | No Node.js, Python, npm, or any other tools needed |
| **No build step** | The extension runs directly from source — no compilation required |

### Step 1: Download the Extension

**Option A — Clone with Git:**
```bash
git clone https://github.com/A2-ashish/autonomous-bot.git
```

**Option B — Download ZIP:**
1. Go to the GitHub repository page
2. Click the green **"Code"** button → **"Download ZIP"**
3. Extract the ZIP to any folder on your computer (e.g., `Desktop/netacad-autoanswer`)

### Step 2: Get a Google Gemini API Key (Free)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Select any Google Cloud project (or create a new one)
5. **Copy the generated API key** — you'll need it in Step 4

> **Note:** The free tier of Gemini API provides enough quota for normal usage. No billing setup is required.

### Step 3: Load the Extension in Chrome

1. Open Google Chrome
2. Type `chrome://extensions/` in the address bar and press Enter
3. In the top-right corner, enable **"Developer mode"** (toggle switch)
4. Click **"Load unpacked"** button (appears in the top-left after enabling Developer mode)
5. Navigate to and select the `netacad-autoanswer` folder you downloaded
6. The extension **"NetAcad Scraper"** should now appear in your extensions list

**Pin the extension for easy access:**
1. Click the puzzle piece icon (🧩) in the Chrome toolbar
2. Find **"NetAcad Scraper"** in the list
3. Click the pin icon (📌) to pin it to your toolbar

### Step 4: Configure the Extension

1. Click the **NetAcad Scraper** icon in the Chrome toolbar
2. Paste your **Gemini API key** into the text field
3. Click **"Save API Key"**
4. You should see the message **"API Key saved!"**

### Step 5: Enable the Autonomous Bot

1. Click the extension icon again
2. Check the red checkbox: **"Enable Full Autonomous Bot"** ✅
3. Navigate to your NetAcad course page
4. **The bot will start working automatically!**

### Step 6: Verify It's Working

1. Open the browser Developer Console: Press `F12` → click the **"Console"** tab
2. You should see logs starting with:
   - `NetAcad Scraper content script loaded and ready.`
   - `NetAcad Bot: Fast forwarding video to end.`
   - `NetAcad Bot: Found enabled interactive button (Start/Next/Submit), clicking it!`
3. If you see these logs, the bot is working correctly

### Quick Summary

```
Download repo → chrome://extensions → Developer mode ON → Load unpacked
→ Click extension icon → Paste API key → Save → Enable Autonomous Bot → Done!
```

### Browser Permissions Explained

The extension **does NOT require any special browser flags or settings changes**. Everything works out of the box with the default Chrome configuration.

| Permission in manifest.json | What it does | Why it's needed |
|---|---|---|
| `activeTab` | Access the currently active tab | To read quiz questions from NetAcad pages |
| `scripting` | Inject and run JavaScript on pages | To click buttons, select answers, and scroll |
| `storage` | Save settings locally in Chrome | To persist API key and toggle states |
| `all_frames: true` | Run in iframes too | NetAcad loads quiz content inside iframes |

**No additional permissions are needed for:**
- Clicking radio buttons / checkboxes (`.click()` is a standard DOM API)
- Scrolling the page (`window.scrollBy()` is standard JavaScript)
- Fast-forwarding videos (`video.currentTime` is a standard HTML5 API)
- Reading Shadow DOM content (uses open Shadow DOM which is accessible)

---

## Features Overview

| # | Feature | Description |
|---|---------|-------------|
| 1 | **AI-Powered Quiz Answering** | Scrapes MCQ questions from NetAcad and sends them to Google Gemini AI for accurate answer suggestions |
| 2 | **Auto Answer Selection** | Automatically clicks the correct radio buttons and checkboxes based on AI responses |
| 3 | **Multi-Answer Support** | Handles "Choose two" / "Select all that apply" questions by selecting multiple checkboxes |
| 4 | **Batch Processing** | Sends all questions on a page in a single API call to reduce latency and API costs |
| 5 | **Auto Submit** | Clicks the "Submit" button once answers are selected and the button becomes enabled |
| 6 | **Test Confirmation Handling** | Detects "Yes, confirm my submission" checkbox on the final assessment page, checks it, then submits |
| 7 | **Auto Start Tests** | Detects the "Start" button on quiz instruction pages and clicks it to begin the test |
| 8 | **Video Fast-Forward** | Finds `<video>` elements on the page and skips to the last timestamp to mark the video as completed |
| 9 | **Auto Scroll** | Continuously scrolls through reading material pages to progress through the course content |
| 10 | **Auto Navigation** | Clicks "Next" / "Continue" buttons and navigation arrows to advance to the next module |
| 11 | **State Machine Sync** | Prevents the bot from clicking Submit before Gemini AI has finished answering the quiz |
| 12 | **Cooldown Timer** | Adds a 2-second buffer after answer selection to let the page DOM update before interacting |
| 13 | **Stealth Mode** | Hides the AI Assistant UI overlay when autonomous mode is enabled — looks like a native user |
| 14 | **Shadow DOM Traversal** | Pierces through NetAcad's deeply nested Shadow DOM to find questions, buttons, and videos |
| 15 | **MutationObserver** | Watches for dynamic page changes (AJAX loads, iframe updates) and re-scrapes automatically |
| 16 | **Per-Question Refresh** | Allows manual re-query of Gemini AI for any individual question |
| 17 | **Configurable Toggles** | Fine-grained control over each behavior via the extension popup |

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Extension                      │
│                                                          │
│  ┌──────────┐  ┌───────────┐  ┌────────┐  ┌──────────┐ │
│  │ popup.js │  │ content.js│  │ ui.js  │  │scraper.js│ │
│  │ (Config) │  │ (Bot Loop)│  │(Select)│  │ (Extract)│ │
│  └────┬─────┘  └─────┬─────┘  └───┬────┘  └────┬─────┘ │
│       │              │             │             │       │
│       │    ┌─────────▼──────────┐  │             │       │
│       └───►│ chrome.storage.sync│◄─┘             │       │
│            │  (API Key, Flags)  │                │       │
│            └────────────────────┘                │       │
│                      │                           │       │
│            ┌─────────▼───────────────────────────▼──┐   │
│            │        api.js (Gemini API Client)       │   │
│            └─────────────────┬───────────────────────┘   │
└──────────────────────────────┼───────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  Google Gemini API   │
                    │  (gemini-2.5-flash)  │
                    └─────────────────────┘
```

### Bot Loop State Machine

```
                    ┌──────────────────┐
         ┌────────►│  Bot Loop (3s)   │◄──────────┐
         │         └────────┬─────────┘           │
         │                  │                      │
         │          ┌───────▼────────┐             │
         │          │ isProcessing?  │             │
         │          └───┬────────┬───┘             │
         │          Yes │        │ No              │
         │       ┌──────▼──┐  ┌──▼───────────┐    │
         │       │  PAUSE  │  │  Evaluate DOM │    │
         │       └─────────┘  └──┬───────────┘    │
         │                       │                 │
         │            ┌──────────▼──────────┐      │
         │            │  Video? Start?      │      │
         │            │  Submit? Scroll?    │      │
         │            └──────────┬──────────┘      │
         │                       │                 │
         └───────────────────────┘                 │
                                                   │
     Quiz Found ──► 🔒 LOCK ──► Gemini API        │
                                    │              │
                              Auto-Select Answers  │
                                    │              │
                              🔓 UNLOCK ──► 2s ───┘
```

---

## Configuration Options

Click the extension icon to open the popup. You'll see these options:

| Option | Default | Description |
|--------|---------|-------------|
| **Gemini API Key** | _(empty)_ | Your Google Gemini API key. Required for AI features. |
| **Show AI Answers** | ✅ On | Display AI answer suggestion boxes below each question |
| **Process on Page Switch** | ✅ On | Automatically re-scrape when navigating between questions |
| **Enable Full Autonomous Bot** | ❌ Off | Activate the fully autonomous course runner |

---

## Usage Modes

### Mode 1: Manual Assistant (Default)

When **Autonomous Bot is OFF**, the extension works as a passive helper:

1. Navigate to a NetAcad quiz page
2. Click the extension icon → **"Process Questions on this Page"**
3. Or press `Alt+Shift+Q` (keyboard shortcut)
4. AI-suggested answers appear in blue boxes below each question
5. You manually select the answers and submit

### Mode 2: Full Autonomous Bot

When **Autonomous Bot is ON**, the extension takes full control:

1. **Open any NetAcad course module page**
2. The bot immediately begins its 3-second evaluation loop
3. It will automatically:

   **On reading pages:**
   - Scroll down through the content
   - Click the "Next" navigation arrow to advance

   **On video pages:**
   - Detect `<video>` elements
   - Jump the video to its last timestamp (end)
   - Trigger playback completion

   **On test/quiz pages:**
   - Click the **"Start"** button to begin the assessment
   - Wait for questions to load
   - Send all questions to Gemini AI in a single batch
   - Auto-click the correct radio buttons or checkboxes
   - Click **"Submit"** once answers are selected
   - On the final confirmation page: check **"Yes, confirm my submission"** → click **"Submit"**

4. The bot continues advancing through modules until you disable it

### Stopping the Bot

To stop the bot at any time:
- Click the extension icon
- Uncheck **"Enable Full Autonomous Bot"**
- The bot stops on the very next 3-second cycle

---

## Feature Details

### AI-Powered Quiz Answering

The extension uses **Google Gemini 2.5 Flash** to analyze quiz questions. Questions are sent in a structured JSON format with a carefully engineered prompt that instructs the AI to:
- Return only the answer text (no explanations)
- Handle multi-answer questions by separating answers with ` /// `
- Return a JSON array for batch requests

### Auto Answer Selection

The `autoSelectMatchingAnswers()` function performs fuzzy text matching:
- Strips whitespace, special characters, and converts to lowercase
- Checks if the AI's answer text is contained within any option element's text (or vice versa)
- Clicks the matching `<input type="radio">` or `<input type="checkbox">`

### Shadow DOM Deep Traversal

NetAcad uses heavy Shadow DOM encapsulation. The bot uses a custom `getDeepElements()` function that:
- Starts at `document.body`
- Recursively enters every `shadowRoot` it finds
- Collects elements across all shadow boundaries
- This allows finding buttons, videos, and inputs that are invisible to standard `querySelector`

### State Machine Synchronization

The bot uses a global state object to prevent race conditions:

```javascript
window.netAcadBotState = {
  isProcessingQuiz: false,    // True while Gemini is thinking
  lastQuizProcessedAt: 0,     // Timestamp of last answer selection
};
```

**Flow:**
1. Quiz detected → `isProcessingQuiz = true` (🔒 LOCK)
2. Bot loop sees lock → skips all actions
3. Gemini responds → answers auto-selected → `isProcessingQuiz = false` (🔓 UNLOCK)
4. 2-second cooldown → bot resumes and clicks Submit

### Stealth Mode

When autonomous mode is enabled, the blue "AI Assistant" UI boxes are hidden (`display: none`). The extension operates silently — it just clicks the correct options as if a human were doing it.

---

## Safety Mechanisms

| Mechanism | Purpose |
|-----------|---------|
| **State Lock** | Prevents submitting blank tests while AI is still processing |
| **Cooldown Timer** | 2-second buffer after answer selection to let the DOM update |
| **Confirmation-Only Checkbox** | Only checks boxes near "confirm"/"yes" text — won't touch quiz answer checkboxes |
| **Disabled Button Guard** | Won't click disabled Submit buttons |
| **Retry Mechanism** | Up to 10 retry attempts (1.5s apart) if quiz elements haven't loaded yet |
| **Debounced Scraping** | 1.2-second debounce on MutationObserver to prevent rapid re-scraping |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+Q` | Process questions on the current page (manual mode) |
| `Option+Shift+Q` | Same as above (macOS) |

---

## Troubleshooting

### Bot is not clicking answers
- Open DevTools (`F12`) → Console tab
- Look for `NetAcad Bot:` or `NetAcad Scraper:` log messages
- Common causes:
  - API key not set or invalid
  - NetAcad page structure changed (Shadow DOM selectors may need updating)
  - Gemini API quota exceeded

### Bot clicks Submit too early
- This should not happen due to the state machine lock
- If it does, check the console for `🔒 LOCK` and `🔓 UNLOCK` messages
- Increase the cooldown timer in `content.js` (search for `const cooldown = 2000`)

### Videos not being skipped
- Some videos may use non-standard players (not `<video>` tags)
- The bot only handles native HTML5 `<video>` elements

### Extension not loading on NetAcad
- Make sure the URL matches `*://*.netacad.com/*`
- Go to `chrome://extensions/` → click reload (⟳) on the extension card
- Refresh the NetAcad tab

### API errors
| Error Code | Meaning | Fix |
|---|---|---|
| `403` | Invalid API key | Re-enter key in the popup |
| `429` | Rate limited | Wait a few minutes |
| `503` | Gemini overloaded | Try again later |
| `quota` | Free tier exhausted | Wait 24 hours or use a new key |

### After updating the code
If you edit any `.js` or `.html` file:
1. Go to `chrome://extensions/`
2. Click the **reload ⟳** button on the NetAcad Scraper card
3. **Refresh** the NetAcad browser tab (Ctrl+R / Cmd+R)

---

## File Structure

```
netacad-autoanswer/
├── manifest.json       # Chrome Extension config (Manifest V3)
├── background.js       # Service worker for keyboard shortcuts
├── content.js          # Bot loop, state machine, MutationObserver
├── scraper.js          # Shadow DOM traversal, question extraction
├── api.js              # Gemini API client (single + batch requests)
├── ui.js               # Answer display, auto-selection, UI injection
├── popup.html          # Extension popup UI
├── popup.js            # Popup logic and chrome.storage sync
├── features.md         # This file — features & usage guide
├── README.md           # Project overview
├── CONTRIBUTING.md     # Contribution guidelines

└── images/
    └── icon-48x48.png  # Extension icon
```

---

## API & Privacy

- Your Gemini API key is stored **locally** in `chrome.storage.sync`
- It is **never shared** with anyone except Google's Gemini API endpoint
- No data is sent to any third-party server
- All processing happens in your browser
- You can remove your API key at any time via the extension popup

---

## Technologies Used

- **JavaScript (ES6+)** — All extension logic
- **Chrome Extensions API (Manifest V3)** — Extension framework
- **Shadow DOM & MutationObserver** — Page monitoring and scraping
- **Google Gemini 2.5 Flash API** — AI-powered answer generation
- **HTML5 Video API** — Video fast-forwarding

