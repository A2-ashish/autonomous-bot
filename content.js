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
function getDeepElements(tagName = '*') {
  const elements = [];
  const activeElements = [document.body];
  
  while (activeElements.length > 0) {
    const el = activeElements.shift();
    if (el) {
       if (tagName === '*' || el.tagName.toLowerCase() === tagName) elements.push(el);
       if (el.shadowRoot) activeElements.push(el.shadowRoot);
       if (el.children) {
         for (let i = 0; i < el.children.length; i++) {
           activeElements.push(el.children[i]);
         }
       }
    }
  }
  return elements;
}

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
        console.log(`NetAcad Bot: ⏳ Cooldown (${Math.round((cooldown - elapsed) / 1000)}s remaining after quiz answer selection)...`);
        return;
      }
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
    const buttons = getDeepElements('button');
    let submitClicked = false;

    for (const btn of buttons) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      const title = (btn.getAttribute('title') || '').toLowerCase();
      
      const isStart = text === 'start' || text.includes('begin');
      const isNext = text === 'next' || text.includes('continue') || ariaLabel.includes('next') || title.includes('next');
      const isSubmit = text === 'submit' || text.includes('submit exam') || text.includes('submit test');
      
      if (isStart || isNext || isSubmit) {
        
        // If the button is disabled, it might be waiting for the "Yes, confirm my submission" checkbox
        const isDisabled = btn.disabled || btn.classList.contains('disabled');
        
        if (isDisabled && isSubmit) {
           const checkboxes = getDeepElements('input').filter(i => i.type === 'checkbox' && !i.checked);
           checkboxes.forEach(cb => {
              // Ensure we only click confirmation checkboxes, not test answers!
              const parentText = (cb.parentElement.innerText || cb.parentElement.textContent || '').toLowerCase();
              if (parentText.includes('confirm') || parentText.includes('yes')) {
                  console.log("NetAcad Bot: Clicking confirmation checkbox.");
                  cb.click();
                  submitClicked = true; // Prevent scrolling
              }
           });
           
           if (submitClicked) break; // Checkbox clicked, wait for next loop to click the now-enabled submit button

        } else if (!isDisabled) {
           console.log(`NetAcad Bot: Found enabled interactive button (Start/Next/Submit), clicking it!`);
           btn.click();
           submitClicked = true;
           break;
        }
      }
    }

    // 3. Auto Scroll (if nothing else happened and no pending test)
    if (!submitClicked) {
      // scroll down slowly to trigger any lazy loads or just move through content
      window.scrollBy({ top: window.innerHeight / 2, left: 0, behavior: 'smooth' });
    }
  });
}

// Check every 3 seconds
setInterval(runAutonomousBotLoop, 3000);
