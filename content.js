console.log("NetAcad Scraper content script loaded and ready.");

// Global bot state machine — shared across content.js and scraper.js
window.netAcadBotState = window.netAcadBotState || {
  isProcessingQuiz: false,
  lastQuizProcessedAt: 0,
};

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

function runAutonomousBotLoop() {
  chrome.storage.sync.get(["autonomousBot"], (result) => {
    if (!result.autonomousBot) return;

    // STATE MACHINE GUARD: Do NOT click anything while Gemini is processing a quiz
    if (window.netAcadBotState && window.netAcadBotState.isProcessingQuiz) {
      console.log("NetAcad Bot: ⏸ Paused — waiting for Gemini AI to finish answering the quiz...");
      return;
    }

    // COOLDOWN: After quiz is done, wait 2 seconds before clicking submit to let DOM update
    const cooldown = 2000;
    if (window.netAcadBotState && window.netAcadBotState.lastQuizProcessedAt > 0) {
      const elapsed = Date.now() - window.netAcadBotState.lastQuizProcessedAt;
      if (elapsed < cooldown) {
        console.log(`NetAcad Bot: ⏳ Cooldown (${Math.round((cooldown - elapsed) / 1000)}s remaining)...`);
        return;
      }
    }

    // 0. AUTO-SCRAPE: If quiz elements exist but we haven't scraped yet, trigger scraping
    try {
      const appRoot = document.querySelector("app-root");
      if (appRoot && appRoot.shadowRoot) {
        const pageView = appRoot.shadowRoot.querySelector("page-view");
        if (pageView && pageView.shadowRoot) {
          const articleViews = pageView.shadowRoot.querySelectorAll("article-view");
          let hasMcq = false;
          articleViews.forEach(av => {
            if (av.shadowRoot) {
              av.shadowRoot.querySelectorAll("block-view").forEach(bv => {
                if (bv.shadowRoot && bv.shadowRoot.querySelector("mcq-view")) {
                  hasMcq = true;
                }
              });
            }
          });

          const currentUrl = window.location.href;
          if (hasMcq && currentUrl !== botLastScrapeUrl) {
            console.log("NetAcad Bot: 🎯 Quiz detected! Auto-triggering scrapeData()...");
            botLastScrapeUrl = currentUrl;
            if (typeof window.scrapeData === "function") {
              window.scrapeData();
            }
            return; // Let the scraper do its job, bot will resume on next cycle
          }
        }
      }
    } catch (e) {
      console.warn("NetAcad Bot: Error during auto-scrape check:", e);
    }

    // 1. Check for Videos and fast-forward
    const videos = getDeepElements('video');
    videos.forEach(video => {
      if (video.duration > 0 && Math.abs(video.currentTime - video.duration) > 1) {
        console.log("NetAcad Bot: Fast forwarding video to end.");
        video.currentTime = video.duration - 0.5;
        video.play().catch(e => console.warn(e));
      }
    });

    // 2. Look for Submit, Start, or Next Buttons
    const allClickables = getDeepElements('button');
    // Also check for <a> tags and elements with role="button" that act as buttons
    getDeepElements('a').forEach(a => allClickables.push(a));
    getDeepElements('*').filter(el => el.getAttribute && el.getAttribute('role') === 'button').forEach(el => allClickables.push(el));

    let actionTaken = false;

    for (const btn of allClickables) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      
      const isStart = text === 'start' || text.includes('begin');
      const isNext = text === 'next' || text.includes('continue') || ariaLabel.includes('next') || title.includes('next');
      const isSubmit = text === 'submit' || text.includes('submit exam') || text.includes('submit test') || text.includes('submit quiz');
      
      if (isStart || isNext || isSubmit) {
        const isDisabled = btn.disabled || btn.classList.contains('disabled') || btn.getAttribute('aria-disabled') === 'true';
        
        if (isDisabled && isSubmit) {
           // Look for the confirmation checkbox ("Yes, confirm my submission")
           const checkboxes = getDeepElements('input').filter(i => i.type === 'checkbox' && !i.checked);
           checkboxes.forEach(cb => {
              const parentText = (cb.parentElement ? cb.parentElement.innerText || cb.parentElement.textContent || '' : '').toLowerCase();
              if (parentText.includes('confirm') || parentText.includes('yes')) {
                  console.log("NetAcad Bot: ✅ Clicking confirmation checkbox.");
                  cb.click();
                  actionTaken = true;
              }
           });
           
           if (actionTaken) break;

        } else if (!isDisabled) {
           console.log(`NetAcad Bot: 👆 Clicking '${text || ariaLabel || 'button'}' (${btn.tagName})`);
           btn.click();
           actionTaken = true;

           // If we clicked Start, reset scrape tracker so we scrape the new quiz
           if (isStart) {
             botLastScrapeUrl = '';
           }

           break;
        }
      }
    }

    // 3. Auto Scroll (if nothing else happened)
    if (!actionTaken) {
      window.scrollBy({ top: window.innerHeight / 2, left: 0, behavior: 'smooth' });
    }
  });
}

// Check every 3 seconds
setInterval(runAutonomousBotLoop, 3000);
