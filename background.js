// Refocus the original tab after an activity button opens a new tab
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "refocusTab" && sender.tab && sender.tab.id) {
    // Short delay to let the new tab finish opening
    setTimeout(() => {
      chrome.tabs.update(sender.tab.id, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.warn("Background: Could not refocus tab:", chrome.runtime.lastError.message);
        } else {
          console.log("Background: Refocused back to bot tab", sender.tab.id);
        }
      });
    }, 500);
    sendResponse({ success: true });
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "process-page-command") {
    console.log("Command received: process-page-command");
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0 && tabs[0].id) {
        const tabId = tabs[0].id;
        chrome.storage.sync.get(["showAnswers"], (result) => {
          let showAnswers = true;
          if (typeof result.showAnswers === "boolean") {
            showAnswers = result.showAnswers;
          }

          chrome.tabs.sendMessage(
            tabId,
            { action: "processPage", showAnswers: showAnswers },
            (response) => {
              if (chrome.runtime.lastError) {
                console.error(
                  "Background Error: Could not send message to tab.",
                  chrome.runtime.lastError.message,
                );
              } else {
                console.log(
                  "Background: Message sent to tab, response:",
                  response,
                );
              }
            },
          );
        });
      } else {
        console.warn("Background: No active tab found.");
      }
    });
  }
});
