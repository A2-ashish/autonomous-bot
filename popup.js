document.addEventListener("DOMContentLoaded", () => {
  const apiKeysInput = document.getElementById("apiKeys");
  const keyStatusDiv = document.getElementById("keyStatus");
  const saveKeyButton = document.getElementById("saveKey");
  const processPageButton = document.getElementById("processPage");
  const statusDiv = document.getElementById("status");
  const showAnswersToggle = document.getElementById("showAnswersToggle");
  const processOnSwitchToggle = document.getElementById("processOnSwitchToggle");
  const autonomousBotToggle = document.getElementById("autonomousBotToggle");
  const devModeToggle = document.getElementById("devModeToggle");
  const quizOnlyModeToggle = document.getElementById("quizOnlyModeToggle");
  const betaModeToggle = document.getElementById("betaModeToggle");
  const modelSelect = document.getElementById("modelSelect");

  chrome.storage.sync.get(
    ["geminiApiKeys", "geminiApiKey", "currentKeyIndex", "showAnswers", "processOnSwitch", "autonomousBot", "devMode", "quizOnlyMode", "betaMode", "aiModel"],
    (result) => {
      // Load keys — migrate legacy single key to array if needed
      let keys = result.geminiApiKeys || [];
      if (keys.length === 0 && result.geminiApiKey) {
        keys = [result.geminiApiKey]; // backward compat
      }
      apiKeysInput.value = keys.join("\n");

      // Show active key status
      const idx = result.currentKeyIndex || 0;
      if (keys.length > 1) {
        keyStatusDiv.textContent = `🔑 Active key: #${idx + 1} of ${keys.length}`;
        keyStatusDiv.style.color = '#2e7d32';
      } else if (keys.length === 1) {
        keyStatusDiv.textContent = `🔑 1 key configured`;
        keyStatusDiv.style.color = '#555';
      } else {
        keyStatusDiv.textContent = `⚠️ No API key set`;
        keyStatusDiv.style.color = '#c62828';
      }

      if (typeof result.showAnswers === "boolean") {
        showAnswersToggle.checked = result.showAnswers;
      } else {
        showAnswersToggle.checked = true;
      }
      if (typeof result.processOnSwitch === "boolean") {
        processOnSwitchToggle.checked = result.processOnSwitch;
      } else {
        processOnSwitchToggle.checked = true;
      }
      if (typeof result.autonomousBot === "boolean") {
        autonomousBotToggle.checked = result.autonomousBot;
      } else {
        autonomousBotToggle.checked = false;
      }
      if (typeof result.devMode === "boolean") {
        devModeToggle.checked = result.devMode;
      } else {
        devModeToggle.checked = false;
      }
      if (typeof result.quizOnlyMode === "boolean") {
        quizOnlyModeToggle.checked = result.quizOnlyMode;
      } else {
        quizOnlyModeToggle.checked = false;
      }
      if (typeof result.betaMode === "boolean") {
        betaModeToggle.checked = result.betaMode;
      } else {
        betaModeToggle.checked = false;
      }
      
      if (result.aiModel) {
        modelSelect.value = result.aiModel;
      } else {
        modelSelect.value = "gemini-2.5-flash"; // Default
      }
    },
  );

  showAnswersToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ showAnswers: showAnswersToggle.checked });
  });

  processOnSwitchToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ processOnSwitch: processOnSwitchToggle.checked });
  });

  autonomousBotToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ autonomousBot: autonomousBotToggle.checked });
  });

  devModeToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ devMode: devModeToggle.checked });
  });

  quizOnlyModeToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ quizOnlyMode: quizOnlyModeToggle.checked });
  });

  betaModeToggle.addEventListener("change", () => {
    chrome.storage.sync.set({ betaMode: betaModeToggle.checked });
  });
  
  modelSelect.addEventListener("change", () => {
    chrome.storage.sync.set({ aiModel: modelSelect.value });
  });

  saveKeyButton.addEventListener("click", () => {
    // Parse textarea — filter blank lines, trim whitespace
    const rawKeys = apiKeysInput.value.split("\n").map(k => k.trim()).filter(k => k.length > 0);
    if (rawKeys.length === 0) {
      statusDiv.textContent = "Please enter at least one API key.";
      return;
    }
    chrome.storage.sync.set({ geminiApiKeys: rawKeys, currentKeyIndex: 0 }, () => {
      statusDiv.textContent = `✅ ${rawKeys.length} key${rawKeys.length > 1 ? 's' : ''} saved!`;
      if (rawKeys.length > 1) {
        keyStatusDiv.textContent = `🔑 Active key: #1 of ${rawKeys.length} (reset to first)`;
        keyStatusDiv.style.color = '#2e7d32';
      } else {
        keyStatusDiv.textContent = `🔑 1 key configured`;
        keyStatusDiv.style.color = '#555';
      }
      setTimeout(() => (statusDiv.textContent = ""), 2500);
    });
  });

  processPageButton.addEventListener("click", () => {
    statusDiv.textContent = "Sending command to page...";
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        const tabId = tabs[0].id;
        chrome.tabs.sendMessage(
          tabId,
          { action: "processPage", showAnswers: showAnswersToggle.checked },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Popup Error: Error sending message to content script: ",
                chrome.runtime.lastError.message,
              );
              statusDiv.textContent = `Error: Could not communicate with page. Details: ${chrome.runtime.lastError.message}`;
            } else if (response) {
              if (response.success) {
                if (response.result === true) {
                  statusDiv.textContent = "Processing started on page.";
                  console.debug(
                    "Popup: Processing started successfully on page.",
                  );
                } else if (response.result === false) {
                  statusDiv.textContent =
                    "Processed: No questions found on page or Show Answers is disabled.";
                  console.debug(
                    "Popup: Page processed, but no questions were found.",
                  );
                } else {
                  statusDiv.textContent =
                    "Page responded, but with an unexpected result from scrapeData.";
                  console.warn(
                    "Popup: Received unexpected (but successful) response.result from content script:",
                    response.result,
                  );
                }
              } else {
                statusDiv.textContent = `Error on page: ${response.error || "Unknown error"}`;
                console.error(
                  "Popup: Received error response from content script:",
                  response,
                );
              }
            } else {
              statusDiv.textContent =
                "No response from page. Is it a NetAcad quiz page with questions?";
              console.warn(
                "Popup: No affirmative response from any content script in the tab. Check if app-root exists in any frame.",
              );
            }
            setTimeout(() => {
              if (statusDiv.textContent !== "") statusDiv.textContent = "";
            }, 4000);
          },
        );
      } else {
        statusDiv.textContent = "Error: Could not find active tab.";
        console.error("Popup Error: No active tab found to send message to.");
      }
    });
  });
});
