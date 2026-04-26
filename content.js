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
// Supports simple tag names ('button') AND CSS selectors ('input[type="radio"], [role="radio"]')
function getDeepElements(selector = '*') {
  const elements = [];
  const queue = [document.body];
  const isSimpleTag = /^[a-zA-Z][a-zA-Z0-9-]*$/.test(selector); // e.g. 'input', 'button', 'mcq-view'
  
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;

    // Only match actual Elements (not ShadowRoot/DocumentFragment)
    if (node.tagName) {
      let matched = false;
      if (selector === '*') {
        matched = true;
      } else if (isSimpleTag) {
        matched = node.tagName.toLowerCase() === selector.toLowerCase();
      } else {
        // Use matches() for complex CSS selectors
        try { matched = node.matches(selector); } catch(e) { /* ignore invalid selectors */ }
      }
      if (matched) elements.push(node);
    }

    // Dive into shadow DOM
    if (node.shadowRoot) {
      queue.push(node.shadowRoot);
    }

    // Dive into same-origin iframes
    if (node.tagName && node.tagName.toLowerCase() === 'iframe') {
      try {
        if (node.contentDocument && node.contentDocument.body) {
          queue.push(node.contentDocument.body);
        }
      } catch (e) {
        // Ignore cross-origin framework restrictions
      }
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
let lastNavigatedAt = 0;

// Exposed so scraper.js can trigger a retry after API errors
window.netAcadBotResetScrapeUrl = () => {
  botLastScrapeUrl = '';
  if (window.netAcadBotState) {
    window.netAcadBotState.submitFired = false;
    window.netAcadBotState.lastQuizProcessedAt = 0;
  }
  console.log("NetAcad Bot: 🔁 Scrape URL reset — will retry current question.");
};

// ============================================================
// 🎯 QUIZ ONLY MODE LOOP — no scrolling, just answer & submit
// ============================================================
function runQuizOnlyLoop(isBetaMode = false) {
  // If AI is still thinking, pause and wait
  if (window.netAcadBotState && window.netAcadBotState.isProcessingQuiz) {
    updateDevOverlay('🎯 Quiz Mode', '⏸ Waiting for Gemini AI...');
    return;
  }

  // Detect quiz inputs on page (radio, checkbox, or ARIA equivalents)
  const quizInputs = getDeepElements('input, [role="radio"], [role="checkbox"]').filter(i => {
    if (i.tagName.toLowerCase() === 'input') return i.type === 'radio' || i.type === 'checkbox';
    return true;
  });

  const allButtons = getDeepElements('button');
  // ANY submit button (enabled OR disabled) — used to detect we're on a quiz page
  const anySubmitBtn = allButtons.find(btn => {
    const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    return (t === 'submit' || t.includes('submit')) && t !== 'reset';
  });
  // Only ENABLED submit button — used when actually clicking
  const enabledSubmitBtn = allButtons.find(btn => {
    const t = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' || btn.classList.contains('disabled');
    return (t === 'submit' || t.includes('submit')) && t !== 'reset' && !isDisabled;
  });

  const hasMcq = quizInputs.length > 0 && anySubmitBtn; // quiz present

  // -------------------------------------------------------------
  // Handle the "Submit My Assessment" (Review) Page
  // -------------------------------------------------------------
  const isReviewPage = document.body.innerText.includes('Submit My Assessment') || document.body.innerText.includes('confirm my submission');
  
  if (isReviewPage) {
    // Check if there are unanswered questions 
    const unansweredButtons = getDeepElements('button, a').filter(btn => {
      const t = (btn.innerText || btn.textContent || '').trim();
      return /^Q\d{1,2}$/i.test(t) || /^\d{1,2}$/.test(t);
    });

    if (unansweredButtons.length > 0) {
      updateDevOverlay('🎯 Quiz Mode', `Navigating to ${unansweredButtons[0].innerText.trim()}...`);
      console.log("NetAcad Bot: ↪️ Clicking", unansweredButtons[0].innerText.trim(), "from review page.");
      unansweredButtons[0].click();
      return;
    }

    // No unanswered questions found, or ready to confirm final submission
    const confirmCheckbox = getDeepElements('input[type="checkbox"]').find(cb => {
      const parentText = (cb.parentElement ? cb.parentElement.innerText || cb.parentElement.textContent || '' : '').toLowerCase();
      return parentText.includes('confirm') || parentText.includes('yes');
    });

    if (confirmCheckbox && !confirmCheckbox.checked) {
      updateDevOverlay('✅ Completing', 'Checking confirmation box...');
      confirmCheckbox.click();
      return; 
    }

    if (enabledSubmitBtn && confirmCheckbox && confirmCheckbox.checked) {
      updateDevOverlay('🏁 Finishing', 'Clicking Final Submit!');
      enabledSubmitBtn.click();
      // Reset beta state for next modules
      if (window.netAcadBotState) window.netAcadBotState.betaScrapeFired = false;
      return;
    }
    
    updateDevOverlay(isBetaMode ? '⚡ Beta Mode' : '🎯 Quiz Mode', 'Waiting on Review Page...');
    return;
  }

  // Detect final review/score page — stop loop
  const pageText = document.body.innerText.toLowerCase();
  const isFinalPage = pageText.includes('your score') || pageText.includes('quiz complete') || 
                      pageText.includes('results') || pageText.includes('passed') ||
                      pageText.includes('failed') || pageText.includes('grade');
  if (isFinalPage && !hasMcq) {
    updateDevOverlay('🏁 Quiz Done', 'Final results page detected!');
    return;
  }

  if (!hasMcq) {
    updateDevOverlay('🎯 Quiz Mode', '🔍 Looking for quiz...');

    return;
  }

  // Build a unique signature for this specific question
  const qHeading = getDeepElements('h1, h2, h3, h4').find(el => {
    const t = (el.innerText || '').trim();
    return t.length > 0 && t.length < 80;
  });
  const firstOptionText = quizInputs.length > 0
    ? ((quizInputs[0].closest('label') || quizInputs[0].parentElement || {}).innerText || '').substring(0, 30).trim()
    : '';
  const headingText = qHeading ? (qHeading.innerText || '').trim() : '';
  const currentSignature = window.location.href + '|' + headingText + '|' + firstOptionText;

  // Already processing or submitted this question — wait for page to advance
  if (currentSignature === botLastScrapeUrl) {
    // Check if submit was already fired — just wait for DOM change
    if (window.netAcadBotState && window.netAcadBotState.submitFired) {
      updateDevOverlay('🎯 Quiz Mode', '⏳ Waiting for next question...');
      return;
    }

    // Gemini answered — now check if an answer is selected and submit
    const checkedInputs = getDeepElements('input, [role="radio"], [role="checkbox"]').filter(i => {
      if (i.tagName.toLowerCase() === 'input') return (i.type === 'radio' || i.type === 'checkbox') && i.checked;
      return i.getAttribute('aria-checked') === 'true';
    });
    const wasProcessed = window.netAcadBotState && window.netAcadBotState.lastQuizProcessedAt > 0;

    if (checkedInputs.length > 0 && wasProcessed && enabledSubmitBtn) {
      updateDevOverlay('🎯 Quiz Mode', '📤 Submitting answer...');
      window.netAcadBotState.submitFired = true;
      setTimeout(() => {
        enabledSubmitBtn.click();
        console.log("NetAcad Bot [Quiz Only]: 📤 Submit clicked.");
        // 2s after submit, clear so next question is picked up
        setTimeout(() => {
          botLastScrapeUrl = '';
          if (window.netAcadBotState) {
            window.netAcadBotState.submitFired = false;
            window.netAcadBotState.lastQuizProcessedAt = 0;
          }
          console.log("NetAcad Bot [Quiz Only]: 🔄 Ready for next question.");
        }, 2000);
      }, 200);
    } else if (!wasProcessed) {
      updateDevOverlay('🎯 Quiz Mode', '⏸ Waiting for AI answer...');
    } else {
      updateDevOverlay('🎯 Quiz Mode', '⏸ Waiting for answer selection...');
    }
    return;
  }

  // NEW question detected — trigger AI
  console.log("NetAcad Bot [Quiz Only]: 🎯 New question! Signature:", currentSignature);
  updateDevOverlay('🎯 Quiz Mode', '🤖 Asking Gemini AI...');
  botLastScrapeUrl = currentSignature;
  if (window.netAcadBotState) {
    window.netAcadBotState.submitFired = false;
    window.netAcadBotState.lastQuizProcessedAt = 0;
  }
  if (typeof window.scrapeData === "function") {
    window.scrapeData();
  }
}

function runAutonomousBotLoop() {
  // FRAME GUARD: Only run the bot in the frame that has app-root
  if (!document.querySelector("app-root")) return;

  chrome.storage.sync.get(["autonomousBot", "quizOnlyMode", "betaMode"], (result) => {
    const isQuizOnly = result.quizOnlyMode === true;
    const isFullBot  = result.autonomousBot === true;
    const isBetaMode = result.betaMode === true;
    
    if (!isQuizOnly && !isFullBot && !isBetaMode) {
      updateDevOverlay('Disabled', 'Bot is OFF');
      return;
    }

    // ============================================================
    // 🎯 QUIZ ONLY MODE
    // ============================================================
    if (isQuizOnly && !isBetaMode && !isFullBot) {
      runQuizOnlyLoop(false);
      return;
    }
    
    // If Beta Mode or Full Bot is active, we just allow the standard loop to run.
    // Beta mode modifies scrolling/speed inside the standard loop.
    if (isBetaMode && !isFullBot && !isQuizOnly) {
       // Since the user might just check beta mode, we still need to run the loop.
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

    // NAVIGATION COOLDOWN: After clicking '>', wait 5s for the new page to load
    const navCooldown = 5000;
    if (lastNavigatedAt > 0) {
      const navElapsed = Date.now() - lastNavigatedAt;
      if (navElapsed < navCooldown) {
        console.log(`NetAcad Bot: ⏳ Page loading (${Math.round((navCooldown - navElapsed) / 1000)}s)...`);
        updateDevOverlay('⏳ Loading', `Waiting for page to load (${Math.round((navCooldown - navElapsed) / 1000)}s)`);
        return;
      }
      lastNavigatedAt = 0; // Reset after cooldown is done
    }

    // CHECK FOR LOADING STATE: If loading spinner is visible, wait
    try {
      const loadingIndicators = getDeepElements('*').filter(el => {
        const cls = (el.className || '').toLowerCase();
        const tag = (el.tagName || '').toLowerCase();
        return cls.includes('spinner') || cls.includes('loading') || cls.includes('loader') || 
               tag.includes('loader') || tag.includes('spinner');
      });
      const hasVisibleLoader = loadingIndicators.some(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (hasVisibleLoader) {
        console.log("NetAcad Bot: ⏳ Page is loading (spinner detected)...");
        updateDevOverlay('⏳ Loading', 'Waiting for content to load...');
        return;
      }
    } catch (e) { /* ignore getComputedStyle errors */ }

    // ============================================================
    // PRIORITY 1: Check if there is a quiz on this page that needs answering
    // ============================================================
    let hasMcq = false;
    try {
      // Method 1: Deep search for mcq-view anywhere in shadow DOM
      const mcqElements = getDeepElements('mcq-view');
      if (mcqElements.length > 0) {
        hasMcq = true;
      }

      // Method 2: Check for quiz-like inputs (radio/checkbox) near a submit button
      if (!hasMcq) {
        const allInputs = getDeepElements('input, [role="radio"], [role="checkbox"]');
        const quizInputs = allInputs.filter(i => {
           if (i.tagName.toLowerCase() === 'input') return i.type === 'radio' || i.type === 'checkbox';
           return true; // it has role=radio or checkbox
        });
        const allButtons = getDeepElements('button');
        const hasSubmitBtn = allButtons.some(btn => {
          const t = (btn.innerText || '').trim().toLowerCase();
          return t === 'submit' || t.includes('submit');
        });
        // If we see quiz inputs AND a submit button, this is a quiz page
        if (quizInputs.length > 0 && hasSubmitBtn) {
          hasMcq = true;
        }
      }

      // If quiz found and not yet scraped, trigger scraping
      // Use question heading text (e.g. "Question 2") as the unique SPA page signature
      const qHeading = getDeepElements('h1, h2, h3, h4, [class*="question"]').find(el => {
        const t = (el.innerText || '').trim();
        return t.length > 0 && t.length < 80; // short headings only
      });
      const firstOption = getDeepElements('[role="radio"],[role="checkbox"],input').find(el => {
        const label = el.closest('label') || el.parentElement;
        return label && (label.innerText || '').trim().length > 3;
      });
      const firstOptionText = firstOption ? ((firstOption.closest('label') || firstOption.parentElement || {}).innerText || '').substring(0, 30).trim() : '';
      const headingText = qHeading ? (qHeading.innerText || '').trim() : '';
      const currentSignature = window.location.href + '|' + headingText + '|' + firstOptionText;
      
      if (hasMcq && currentSignature !== botLastScrapeUrl) {
        console.log("NetAcad Bot: 🎯 New Quiz detected! Signature:", currentSignature);
        updateDevOverlay('🎯 Quiz Found', 'Sending to Gemini AI...');
        botLastScrapeUrl = currentSignature;
        if (window.netAcadBotState) {
           window.netAcadBotState.submitFired = false;
        }
        if (typeof window.scrapeData === "function") {
          window.scrapeData();
        }
        return;
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
    let disabledSubmitBtn = null;

    for (const btn of allClickables) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      const isDisabled = btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true';

      // Skip "Reset" button on results page — we never want to reset!
      if (text === 'reset') continue;

      // Detect Submit — any button with 'submit' in its text
      if (text.includes('submit') && text !== 'reset') {
        if (isDisabled) {
          disabledSubmitBtn = btn;
        } else {
          submitBtn = btn;
        }
      }

      // Detect Start
      if (text === 'start' || text === 'take assessment' || text === 'begin quiz' || text === 'start quiz' || text === 'take quiz') {
        if (!isDisabled) startBtn = btn;
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
    // ONLY if we have actually answered the question (at least one radio/checkbox is checked)
    if (submitBtn) {
      const checkedInputs = getDeepElements('input, [role="radio"], [role="checkbox"]').filter(i => {
        if (i.tagName.toLowerCase() === 'input') return (i.type === 'radio' || i.type === 'checkbox') && i.checked;
        return i.getAttribute('aria-checked') === 'true';
      });
      const hasAnswered = checkedInputs.length > 0;
      const wasProcessed = window.netAcadBotState && window.netAcadBotState.lastQuizProcessedAt > 0;
      
      if (hasAnswered && wasProcessed) {
        if (!window.netAcadBotState.submitFired) {
          console.log("NetAcad Bot: 📤 Waiting 0.1s then clicking Submit button.");
          updateDevOverlay('📤 Submitting', 'Clicking Submit');
          window.netAcadBotState.submitFired = true;
          
          setTimeout(() => {
            submitBtn.click();
            console.log("NetAcad Bot: 📤 Submit clicked.");
            // After 2s, reset the tracker so the NEXT question is always detected
            setTimeout(() => {
              botLastScrapeUrl = '';
              if (window.netAcadBotState) window.netAcadBotState.submitFired = false;
              console.log("NetAcad Bot: 🔄 Ready for next question.");
            }, 2000);
          }, 100);
          
          return;
        } else {
          updateDevOverlay('⚠️ Waiting', 'Submit was clicked. Waiting for next question...');
        }
      } else {
        console.log("NetAcad Bot: ⏸ Submit found but answers not selected yet. Waiting...");
        updateDevOverlay('⏸ Waiting', 'Submit found but answers not ready');
      }
    }

    // ============================================================
    // PRIORITY 3: If on a test start page → click Start
    // ============================================================
    if (startBtn && !hasMcq) {
      console.log("NetAcad Bot: 🚀 Clicking Start to begin the test.");
      updateDevOverlay('🚀 Starting', 'Clicking Start button');
      startBtn.click();
      botLastScrapeUrl = ''; // Reset so we scrape the new quiz
      return;
    }

    // ============================================================
    // PRIORITY 4: Fast-forward videos
    // ============================================================
    let videoSkipped = false;

    // 1. Video.js Players (Blob & MSE - used heavily by NetAcad)
    const vjsPlayers = getDeepElements('.vjs-tech');
    vjsPlayers.forEach(video => {
      if (!video.dataset.botSkipped) {
        console.log("NetAcad Bot: ⏩ Fast forwarding Video.js player.");
        updateDevOverlay('⏩ Video', 'Skipping Video.js player');
        
        const script = document.createElement('script');
        script.textContent = `
          try {
            if (window.videojs && window.videojs.players) {
              Object.values(window.videojs.players).forEach(p => {
                if (p && typeof p.duration === 'function' && typeof p.currentTime === 'function') {
                   var d = Number(p.duration());
                   if (d > 0 && Math.abs(Number(p.currentTime()) - d) > 1) {
                     p.currentTime(Math.max(0, d - 0.5));
                     if (typeof p.playbackRate === 'function') p.playbackRate(16);
                     p.play();
                     setTimeout(function() { try { p.trigger('timeupdate'); p.trigger('ended'); } catch(e){} }, 500);
                   }
                }
              });
            }
          } catch(e) {}
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        video.dataset.botSkipped = "true";
        videoSkipped = true;
      }
    });

    // 2. HTML5 Native Videos (Non-Video.js)
    const nativeVideos = getDeepElements('video:not(.vjs-tech)');
    nativeVideos.forEach(video => {
      // ONLY mark skipped if we actually executed the skip (needs metadata loaded)
      if (!video.dataset.botSkipped && video.readyState >= 1 && video.duration > 0) {
        if (Math.abs(video.currentTime - video.duration) > 1) {
          console.log("NetAcad Bot: ⏩ Fast forwarding HTML5 video to end.");
          updateDevOverlay('⏩ Video', 'Skipping native video');
          
          video.muted = true;
          if (video.src && video.src.startsWith('blob:')) {
            video.currentTime = Math.max(0, video.duration - 0.5);
            video.playbackRate = 16.0; 
          } else {
            video.currentTime = video.duration;
          }
          
          video.dispatchEvent(new Event('timeupdate', { bubbles: true }));
          video.dispatchEvent(new Event('ended', { bubbles: true }));
          if (typeof video.play === 'function') video.play().catch(e => console.warn(e));
          
          video.dataset.botSkipped = "true";
          videoSkipped = true;
        } else {
          // It's already at the end naturally
          video.dataset.botSkipped = "true";
        }
      }
    });

    // 3. YouTube & Vimeo Iframes
    const iframes = getDeepElements('iframe');
    iframes.forEach(iframe => {
      const src = iframe.src || '';
      if (!iframe.dataset.botSkipped) {
        if (src.includes('youtube.com') || src.includes('youtu.be')) {
          console.log("NetAcad Bot: ⏩ Fast forwarding YouTube video.");
          updateDevOverlay('⏩ Video', 'Skipping YouTube video');
          try {
            // Send JS API commands to seek to end and play
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [9999, true] }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*');
            iframe.dataset.botSkipped = "true";
            videoSkipped = true;
          } catch(e) { }
        } else if (src.includes('vimeo.com')) {
          console.log("NetAcad Bot: ⏩ Fast forwarding Vimeo video.");
          updateDevOverlay('⏩ Video', 'Skipping Vimeo video');
          try {
            iframe.contentWindow.postMessage(JSON.stringify({ method: 'setCurrentTime', value: 9999 }), '*');
            iframe.contentWindow.postMessage(JSON.stringify({ method: 'play' }), '*');
            iframe.dataset.botSkipped = "true";
            videoSkipped = true;
          } catch(e) { }
        }
      }
    });

    if (videoSkipped) return;

    // ============================================================
    // PRIORITY 5: Scroll down through reading content
    // ============================================================
    
    // Find the actual scrollable content container (NetAcad uses nested containers)
    let scrollTarget = null;
    let scrollableContainers = [];

    // Check for scrollable elements inside shadow DOM
    const allElements = getDeepElements('*');
    for (const el of allElements) {
      if (el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100) {
        try {
          const style = window.getComputedStyle(el);
          const overflow = style.overflow + style.overflowY;
          if (overflow.includes('auto') || overflow.includes('scroll')) {
            scrollableContainers.push(el);
          }
        } catch(e) { /* ignore */ }
      }
    }

    // Also check the window itself
    const windowScrollable = document.documentElement.scrollHeight > window.innerHeight + 50;

    // Pick the best scroll target (prefer content containers over window)
    if (scrollableContainers.length > 0) {
      // Use the largest scrollable container (most likely the main content area)
      scrollTarget = scrollableContainers.reduce((best, el) => 
        el.scrollHeight > best.scrollHeight ? el : best
      );
    }

    // Check if scroll target is at bottom
    let canScroll = false;
    if (scrollTarget) {
      const atBottom = scrollTarget.scrollTop >= (scrollTarget.scrollHeight - scrollTarget.clientHeight - 20);
      if (!atBottom) {
        canScroll = true;
        if (isBetaMode) {
          updateDevOverlay('⚡ Beta Mode', 'Jumping to bottom instantly...');
          scrollTarget.scrollTop = scrollTarget.scrollHeight;
          scrollTarget.dispatchEvent(new Event('scroll', { bubbles: true }));
        } else {
          updateDevOverlay('📜 Scrolling', 'Reading content (container)...');
          scrollTarget.scrollBy({ top: scrollTarget.clientHeight / 2, behavior: 'smooth' });
        }
        scrollStuckCount = 0;
        return;
      }
    }
    
    // Fallback: try scrolling the window itself
    if (windowScrollable) {
      const currentScrollY = window.scrollY;
      const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
      const isAtBottom = (currentScrollY >= maxScrollY - 20);
      
      if (!isAtBottom) {
        canScroll = true;
        if (isBetaMode) {
          updateDevOverlay('⚡ Beta Mode', 'Jumping window to bottom...');
          window.scrollTo({ top: maxScrollY });
          window.dispatchEvent(new Event('scroll', { bubbles: true }));
        } else {
          updateDevOverlay('📜 Scrolling', 'Reading content (window)...');
          window.scrollBy({ top: window.innerHeight / 2, left: 0, behavior: 'smooth' });
          lastScrollY = currentScrollY;
        }
        scrollStuckCount = 0;
        return;
      }
    }

    // ============================================================
    // DONE: Reached bottom of page — just wait
    // ============================================================
    const currentPos = scrollTarget ? scrollTarget.scrollTop : window.scrollY;
    if (currentPos === lastScrollY) {
      scrollStuckCount++;
    } else {
      scrollStuckCount = 0;
    }
    lastScrollY = currentPos;

    if (scrollStuckCount > 2) {
      updateDevOverlay('✅ Done', 'Scrolled to bottom. Waiting...');
    }
  });
}

// Check every 3 seconds
setInterval(runAutonomousBotLoop, 3000);
