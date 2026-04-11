console.log("NetAcad Scraper content script loaded and ready.");

// Global bot state machine — shared across content.js and scraper.js
window.netAcadBotState = window.netAcadBotState || {
  isProcessingQuiz: false,
  lastQuizProcessedAt: 0,
  currentAction: 'Idle',
};

// -----------------------------------------
// DEVELOPER OVERLAY
// -----------------------------------------
let devOverlay = null;

function createDevOverlay() {
  if (devOverlay) return devOverlay;

  devOverlay = document.createElement('div');
  devOverlay.id = 'netacad-bot-dev-overlay';
  devOverlay.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    z-index: 999999;
    background: rgba(15, 15, 25, 0.92);
    color: #00ff88;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    padding: 12px 16px;
    border-radius: 10px;
    border: 1px solid rgba(0, 255, 136, 0.3);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    max-width: 340px;
    line-height: 1.6;
    backdrop-filter: blur(8px);
    pointer-events: none;
    transition: opacity 0.3s ease;
  `;
  devOverlay.innerHTML = `
    <div style="color: #00ff88; font-weight: bold; font-size: 13px; margin-bottom: 6px;">
      🤖 NetAcad Bot <span style="color: #666; font-weight: normal; font-size: 11px;">v1.0</span>
    </div>
    <div id="dev-state" style="color: #aaa;">State: Initializing...</div>
    <div id="dev-action" style="color: #fff;">Action: —</div>
    <div id="dev-quiz" style="color: #aaa;">Quiz Lock: —</div>
    <div id="dev-time" style="color: #555; font-size: 10px; margin-top: 4px;">—</div>
  `;
  document.body.appendChild(devOverlay);
  return devOverlay;
}

function updateDevOverlay(state, action, extra = {}) {
  chrome.storage.sync.get(["devMode"], (result) => {
    if (!result.devMode) {
      // Hide overlay if it exists
      if (devOverlay) devOverlay.style.display = 'none';
      return;
    }

    if (!devOverlay) createDevOverlay();
    devOverlay.style.display = 'block';

    const stateEl = devOverlay.querySelector('#dev-state');
    const actionEl = devOverlay.querySelector('#dev-action');
    const quizEl = devOverlay.querySelector('#dev-quiz');
    const timeEl = devOverlay.querySelector('#dev-time');

    if (stateEl) stateEl.innerHTML = `State: <span style="color: #00ff88;">${state}</span>`;
    if (actionEl) actionEl.innerHTML = `Action: <span style="color: #fff;">${action}</span>`;

    const isLocked = window.netAcadBotState?.isProcessingQuiz;
    const lockColor = isLocked ? '#ff4444' : '#00ff88';
    const lockText = isLocked ? '🔒 LOCKED (Gemini working)' : '🔓 Unlocked';
    if (quizEl) quizEl.innerHTML = `Quiz Lock: <span style="color: ${lockColor};">${lockText}</span>`;

    if (timeEl) timeEl.textContent = new Date().toLocaleTimeString();

    // Update global state tracking
    if (window.netAcadBotState) window.netAcadBotState.currentAction = action;
  });
}


let debounceTimeout;
function debouncedScrape() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    chrome.storage.sync.get(["processOnSwitch"], (result) => {
      if (result.processOnSwitch === false) {
        console.debug(
          "NetAcad Scraper: Page switch detected but 'Process on Page Switch' is disabled.",
        );
        return;
      }

      if (typeof window.scrapeData === "function") {
        console.debug(
          "NetAcad Scraper: Mutation detected, re-initiating scrape...",
        );
        window.scrapeData();
      } else {
        console.error(
          "NetAcad Scraper: window.scrapeData not found for debounced call.",
        );
      }
    });
  }, 1200);
}

function initMutationObserver() {
  console.debug("NetAcad Scraper: Attempting to initialize MutationObserver.");
  const appRoot = document.querySelector("app-root");
  if (appRoot && appRoot.shadowRoot) {
    const pageView = appRoot.shadowRoot.querySelector("page-view");
    if (pageView && pageView.shadowRoot) {
      const targetNode = pageView.shadowRoot;
      const observerConfig = { childList: true, subtree: true };

      const observer = new MutationObserver((mutationsList, observer) => {
        console.debug(
          "NetAcad Scraper: MutationObserver detected DOM change in page-view's shadowRoot.",
        );
        debouncedScrape();
      });

      observer.observe(targetNode, observerConfig);
      console.debug(
        "NetAcad Scraper: MutationObserver initialized and observing page-view's shadowRoot.",
      );
    } else {
      console.warn(
        "NetAcad Scraper: MutationObserver setup failed - page-view or its shadowRoot not found. Observer will not be active.",
      );
    }
  } else {
    console.warn(
      "NetAcad Scraper: MutationObserver setup failed - app-root or its shadowRoot not found. Observer will not be active.",
    );
  }
}

if (typeof window.scrapeData !== "function") {
  if (typeof scrapeData === "function") {
    window.scrapeData = scrapeData;
  } else {
    console.error(
      "scrapeData function not found in global scope. scraper.js might not have loaded correctly or before this script.",
    );
  }
}

const autoRunScraper = async () => {
  if (!document.querySelector("app-root")) {
    const frameContext = window.top === window ? "main page" : "an iframe";
    console.debug(
      `NetAcad Scraper: autoRunScraper - app-root not found in this frame context (${frameContext}). Auto-run aborted.`,
    );
    return;
  }

  if (document.readyState !== "complete") {
    await new Promise((resolve) =>
      window.addEventListener("load", resolve, { once: true }),
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  const storedData = await chrome.storage.sync.get([
    "geminiApiKey",
    "showAnswers",
  ]);
  if (
    storedData.geminiApiKey &&
    (typeof storedData.showAnswers === "undefined" ||
      storedData.showAnswers === true)
  ) {
    console.debug(
      "NetAcad Scraper: API key found and showAnswers enabled. Attempting initial scrape and setting up observer.",
    );
    if (typeof window.scrapeData === "function") {
      await window.scrapeData(); // Perform initial scrape
      initMutationObserver(); // Setup observer after initial scrape attempt
    } else {
      console.error(
        "NetAcad Scraper: Critical - window.scrapeData not defined for auto-run and observer setup.",
      );
    }
  } else if (storedData.geminiApiKey && storedData.showAnswers === false) {
    console.debug(
      "NetAcad Scraper: showAnswers is disabled. Skipping initial scrape and observer.",
    );
  } else {
    console.debug(
      "NetAcad Scraper: Page loaded. No API key. Observer not set. Use popup to set key and process.",
    );
  }
};

autoRunScraper();

// Listener for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processPage") {
    console.debug(
      "NetAcad Scraper (content.js): Received processPage message from popup.",
    );
    // Check if this frame contains the app-root element
    if (document.querySelector("app-root")) {
      if (
        request.hasOwnProperty("showAnswers") &&
        request.showAnswers === false
      ) {
        console.debug(
          "NetAcad Scraper (content.js): showAnswers is false, not scraping.",
        );
        sendResponse({
          success: true,
          result: false,
          message: "AI answers are hidden by user setting.",
        });
        return false;
      }
      console.debug(
        "NetAcad Scraper (content.js): app-root found in this frame. Calling window.scrapeData().",
      );
      if (typeof window.scrapeData === "function") {
        window
          .scrapeData()
          .then((result) => {
            console.debug(
              `NetAcad Scraper (content.js): scrapeData completed in this frame with result: ${result}`,
            );
            sendResponse({ success: true, result: result });
          })
          .catch((error) => {
            console.error(
              "NetAcad Scraper (content.js): Error calling scrapeData from message listener:",
              error,
            );
            sendResponse({ success: false, error: error.toString() });
          });
        return true; // Indicates that sendResponse will be called asynchronously
      } else {
        console.error(
          "NetAcad Scraper (content.js): window.scrapeData not found in this frame for processPage message.",
        );
        sendResponse({
          success: false,
          error: "scrapeData_not_found_in_frame",
        });
      }
    } else {
      console.debug(
        "NetAcad Scraper (content.js): app-root NOT found in this frame. Ignoring processPage message.",
      );
      return false;
    }
  }
  return false;
});

// Periodic check to see if the content script is still active. Can be removed.
setInterval(() => {
  console.debug(
    "NetAcad Scraper content script is active - periodic check @ " +
      new Date().toLocaleTimeString(),
  );
}, 30000);

// -----------------------------------------
// AUTONOMOUS BOT EXTENSION
// -----------------------------------------

// Deep element search that properly traverses Shadow DOM
function getDeepElements(tagName = '*') {
  const elements = [];
  const queue = [document.body];
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;

    // Only match actual Elements (not ShadowRoot/DocumentFragment)
    if (node.tagName) {
      if (tagName === '*' || node.tagName.toLowerCase() === tagName) {
        elements.push(node);
      }
    }

    // Dive into shadow DOM
    if (node.shadowRoot) {
      queue.push(node.shadowRoot);
    }

    // Process children (works for both Element and ShadowRoot)
    const children = node.children || node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === 1 || children[i].shadowRoot) { // ELEMENT_NODE
          queue.push(children[i]);
        }
      }
    }
  }
  return elements;
}

// Track whether we already triggered scrape for the current page
let botLastScrapeUrl = '';
let lastScrollY = -1;
let scrollStuckCount = 0;

function runAutonomousBotLoop() {
  chrome.storage.sync.get(["autonomousBot"], (result) => {
    if (!result.autonomousBot) {
      updateDevOverlay('Disabled', 'Bot is OFF');
      return;
    }

    // STATE MACHINE GUARD: Do NOT click anything while Gemini is processing a quiz
    if (window.netAcadBotState && window.netAcadBotState.isProcessingQuiz) {
      console.log("NetAcad Bot: ⏸ Paused — waiting for Gemini AI to finish answering the quiz...");
      updateDevOverlay('⏸ Paused', 'Waiting for Gemini AI...');
      return;
    }

    // COOLDOWN: After quiz is done, wait 2s before clicking submit to let DOM update
    const cooldown = 2000;
    if (window.netAcadBotState && window.netAcadBotState.lastQuizProcessedAt > 0) {
      const elapsed = Date.now() - window.netAcadBotState.lastQuizProcessedAt;
      if (elapsed < cooldown) {
        console.log(`NetAcad Bot: ⏳ Cooldown (${Math.round((cooldown - elapsed) / 1000)}s remaining)...`);
        updateDevOverlay('⏳ Cooldown', `${Math.round((cooldown - elapsed) / 1000)}s after answer selection`);
        return;
      }
    }

    // ============================================================
    // PRIORITY 1: Check if there is a quiz on this page that needs answering
    // ============================================================
    let hasMcq = false;
    try {
      const appRoot = document.querySelector("app-root");
      if (appRoot && appRoot.shadowRoot) {
        const pageView = appRoot.shadowRoot.querySelector("page-view");
        if (pageView && pageView.shadowRoot) {
          const articleViews = pageView.shadowRoot.querySelectorAll("article-view");
          articleViews.forEach(av => {
            if (av.shadowRoot) {
              av.shadowRoot.querySelectorAll("block-view").forEach(bv => {
                if (bv.shadowRoot && bv.shadowRoot.querySelector("mcq-view")) {
                  hasMcq = true;
                }
              });
            }
          });

          // If quiz found and not yet scraped for this URL, trigger scraping
          const currentUrl = window.location.href;
          if (hasMcq && currentUrl !== botLastScrapeUrl) {
            console.log("NetAcad Bot: 🎯 Quiz detected! Triggering AI answer engine...");
            updateDevOverlay('🎯 Quiz Found', 'Sending to Gemini AI...');
            botLastScrapeUrl = currentUrl;
            if (typeof window.scrapeData === "function") {
              window.scrapeData();
            }
            return; // Wait for Gemini to answer
          }
        }
      }
    } catch (e) {
      console.warn("NetAcad Bot: Error during quiz detection:", e);
    }

    // ============================================================
    // PRIORITY 2: If quiz was answered → look for Submit button
    // ============================================================
    const allClickables = [
      ...getDeepElements('button'),
      ...getDeepElements('a'),
    ];
    // Also include elements with role="button"
    getDeepElements('*').forEach(el => {
      if (el.getAttribute && el.getAttribute('role') === 'button') {
        allClickables.push(el);
      }
    });

    // Categorize all buttons on the page
    let submitBtn = null;
    let startBtn = null;
    let nextArrow = null;
    let disabledSubmitBtn = null;

    for (const btn of allClickables) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const className = (btn.className || '').toLowerCase();
      const isDisabled = btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true';

      // Skip "Reset" button on results page — we never want to reset!
      if (text === 'reset') continue;

      // Detect Submit
      if (text === 'submit' || text.includes('submit exam') || text.includes('submit test') || text.includes('submit quiz')) {
        if (isDisabled) {
          disabledSubmitBtn = btn;
        } else {
          submitBtn = btn;
        }
      }

      // Detect Start
      if (text === 'start' || text.includes('begin')) {
        if (!isDisabled) startBtn = btn;
      }

      // Detect green ">" next arrow (navigation between modules)
      // These are usually <a> tags or buttons with "next" in aria-label/title, or ">" text
      if (!isDisabled) {
        const isNextArrow = (
          text === '>' || text === '›' || text === 'next' ||
          ariaLabel.includes('next') || title.includes('next') ||
          text.includes('continue') ||
          className.includes('next') || className.includes('arrow-right') || className.includes('nav-right')
        );
        if (isNextArrow && !nextArrow) {
          nextArrow = btn;
        }
      }
    }

    // PRIORITY 2a: If there's a disabled Submit → check for confirmation checkbox first
    if (disabledSubmitBtn && !submitBtn) {
      const checkboxes = getDeepElements('input').filter(i => i.type === 'checkbox' && !i.checked);
      for (const cb of checkboxes) {
        const parentText = (cb.parentElement ? cb.parentElement.innerText || cb.parentElement.textContent || '' : '').toLowerCase();
        if (parentText.includes('confirm') || parentText.includes('yes')) {
          console.log("NetAcad Bot: ✅ Clicking confirmation checkbox before submit.");
          updateDevOverlay('✅ Confirming', 'Clicking confirmation checkbox');
          cb.click();
          return; // Next cycle will find Submit enabled
        }
      }
    }

    // PRIORITY 2b: If Submit button is enabled → click it
    // (Works for both quiz submit AND confirmation page submit)
    if (submitBtn) {
      console.log("NetAcad Bot: 📤 Clicking Submit button.");
      updateDevOverlay('📤 Submitting', 'Clicking Submit');
      submitBtn.click();
      // CRITICAL: Reset scrape tracker so the NEXT question in this quiz gets scraped
      botLastScrapeUrl = '';
      return;
    }

    // ============================================================
    // PRIORITY 3: If on a test start page → click Start
    // ============================================================
    if (startBtn) {
      console.log("NetAcad Bot: 🚀 Clicking Start to begin the test.");
      updateDevOverlay('🚀 Starting', 'Clicking Start button');
      startBtn.click();
      botLastScrapeUrl = ''; // Reset so we scrape the new quiz
      return;
    }

    // ============================================================
    // PRIORITY 4: Fast-forward videos
    // ============================================================
    const videos = getDeepElements('video');
    let videoSkipped = false;
    videos.forEach(video => {
      if (video.duration > 0 && Math.abs(video.currentTime - video.duration) > 1) {
        console.log("NetAcad Bot: ⏩ Fast forwarding video to end.");
        updateDevOverlay('⏩ Video', 'Skipping to end');
        video.currentTime = video.duration - 0.5;
        video.play().catch(e => console.warn(e));
        videoSkipped = true;
      }
    });
    if (videoSkipped) return;

    // ============================================================
    // PRIORITY 5: Scroll down through reading content
    // ============================================================
    const currentScrollY = window.scrollY;
    const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
    const isAtBottom = (currentScrollY >= maxScrollY - 10);

    if (!isAtBottom) {
      // Still have content to scroll through
      updateDevOverlay('📜 Scrolling', 'Reading content...');
      window.scrollBy({ top: window.innerHeight / 2, left: 0, behavior: 'smooth' });
      scrollStuckCount = 0;
      lastScrollY = currentScrollY;
      return;
    }

    // ============================================================
    // PRIORITY 6: At bottom of page → click green ">" arrow to go to next module
    // ============================================================
    // Track if we're stuck at the bottom (same scroll position for multiple cycles)
    if (currentScrollY === lastScrollY) {
      scrollStuckCount++;
    } else {
      scrollStuckCount = 0;
    }
    lastScrollY = currentScrollY;

    // If we are at the bottom OR stuck scrolling → click the next arrow
    if (nextArrow) {
      console.log("NetAcad Bot: ➡️ At end of page. Clicking '>' to go to next module.");
      updateDevOverlay('➡️ Navigating', 'Clicking > to next module');
      nextArrow.click();
      botLastScrapeUrl = ''; // Reset scrape tracker for the new page
      scrollStuckCount = 0;
      return;
    }

    // If Submit is available (no quiz context, maybe confirmation page), click it
    if (submitBtn) {
      console.log("NetAcad Bot: 📤 Clicking Submit button (non-quiz context).");
      submitBtn.click();
      return;
    }

    // If truly nothing to do, try scrolling once more
    if (scrollStuckCount > 2) {
      console.log("NetAcad Bot: 🤔 Stuck. No actionable elements found. Waiting...");
      updateDevOverlay('🤔 Stuck', 'No actionable elements found');
    }
  });
}

// Check every 3 seconds
setInterval(runAutonomousBotLoop, 3000);
