function createAiAssistantUI(uiContainerId, index) {
  const uiContainer = document.createElement("div");
  uiContainer.id = uiContainerId;
  uiContainer.className = "netacad-ai-assistant-ui";
  uiContainer.style.marginTop = "15px";
  uiContainer.style.padding = "10px";
  uiContainer.style.border = "1px solid #007bff";
  uiContainer.style.borderRadius = "5px";
  uiContainer.style.backgroundColor = "#e7f3ff";
  uiContainer.style.color = "#333";

  const titleElement = document.createElement("h5");
  titleElement.textContent = "AI Assistant";
  titleElement.style.marginTop = "0px";
  titleElement.style.marginBottom = "5px";
  titleElement.style.color = "#0056b3";
  uiContainer.appendChild(titleElement);

  const aiAnswerDisplay = document.createElement("p");
  aiAnswerDisplay.className = "ai-answer-display";
  aiAnswerDisplay.style.margin = "5px 0";
  aiAnswerDisplay.style.fontStyle = "italic";
  aiAnswerDisplay.textContent = "Initializing...";
  uiContainer.appendChild(aiAnswerDisplay);

  const refreshButton = document.createElement("button");
  refreshButton.className = "ai-refresh-button";
  refreshButton.textContent = "Refresh AI Answer";
  refreshButton.style.padding = "6px 12px";
  refreshButton.style.border = "none";
  refreshButton.style.borderRadius = "4px";
  refreshButton.style.backgroundColor = "#007bff";
  refreshButton.style.color = "white";
  refreshButton.style.cursor = "pointer";
  refreshButton.onmouseover = () =>
    (refreshButton.style.backgroundColor = "#0056b3");
  refreshButton.onmouseout = () =>
    (refreshButton.style.backgroundColor = "#007bff");
  uiContainer.appendChild(refreshButton);

  // In autonomous mode, hide the UI entirely so it looks like a native user
  chrome.storage.sync.get(["autonomousBot"], (result) => {
    if (result.autonomousBot) {
      uiContainer.style.display = "none";
    }
  });

  return { uiContainer, aiAnswerDisplay, refreshButton };
}

function extractQuestionAndAnswers(mcqViewElement, index) {
  let questionText = "Question text not found";
  let answerElements = [];
  let questionTextElement = null;

  try {
    // Determine if this is a standard mcq-view
    const isMcqView = mcqViewElement && mcqViewElement.tagName && mcqViewElement.tagName.toLowerCase() === 'mcq-view';

    if (isMcqView && mcqViewElement.shadowRoot) {
      const baseView = mcqViewElement.shadowRoot.querySelector(
        'base-view[type="component"]'
      );
      if (baseView && baseView.shadowRoot) {
        questionTextElement = baseView.shadowRoot.querySelector(
          "div.component__body-inner.mcq__body-inner"
        );
        if (!questionTextElement) {
          questionTextElement =
            baseView.shadowRoot.querySelector(".mcq__prompt");
        }
        if (!questionTextElement) {
          questionTextElement = baseView.shadowRoot.querySelector(".prompt");
        }

        if (questionTextElement) {
          questionText = questionTextElement.innerText.trim();
        } else {
          const potentialElements = Array.from(
            baseView.shadowRoot.querySelectorAll("div, p, span")
          );
          for (const el of potentialElements) {
            const text = el.innerText.trim();
            if (text.length > 20) {
              questionText = text;
              questionTextElement = el;
              break;
            }
          }
        }
// Helper to extract text across nested Shadow DOMs
function getDeepText(node) {
  if (!node) return "";
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  
  let text = "";
  if (node.shadowRoot) {
    text += getDeepText(node.shadowRoot) + " ";
  }
  
  for (const child of node.childNodes) {
    text += getDeepText(child);
    if (child.nodeType === Node.ELEMENT_NODE) {
      if (['DIV', 'P', 'BR', 'PRE', 'CODE'].includes(child.tagName.toUpperCase())) {
         text += "\n";
      }
    }
  }
  // Cleanup multiple spaces and newlines
  return text.replace(/ +/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

// ... existing code context ...
      } else {
        let directQuestionEl = mcqViewElement.shadowRoot.querySelector(
          "div.component__body-inner.mcq__body-inner, .mcq__prompt, .prompt"
        );

        if (directQuestionEl) {
          questionTextElement = directQuestionEl;
          questionText = getDeepText(directQuestionEl);
        } else {
          const potentialElements = Array.from(
            mcqViewElement.shadowRoot.querySelectorAll("div, p, span")
          );
          let combinedText = [];
          for (const el of potentialElements) {
            const text = getDeepText(el);
            if (text.length > 2) {
              combinedText.push(text);
              if (!questionTextElement) questionTextElement = el;
            }
          }
          if (combinedText.length > 0) {
            questionText = combinedText.join('\n');
          }
        }
      }
      answerElements = mcqViewElement.shadowRoot.querySelectorAll(
        ".mcq__item-label.js-item-label"
      );
    } else if (!isMcqView && window.getDeepElements) {
      // GENERIC FALLBACK FOR MODULE TESTS (No mcq-view)
      console.debug("NetAcad UI: Using broad generic extraction fallback for Question", index + 1);
      
      const inputs = window.getDeepElements('input, [role="radio"], [role="checkbox"]').filter(i => {
           if (i.tagName.toLowerCase() === 'input') return i.type === 'radio' || i.type === 'checkbox';
           return true; 
      });
      
      if (inputs.length > 0) {
        // Collect answer elements from labels or parents
        inputs.forEach(input => {
          let label = input.closest('label');
          if (!label && input.parentElement) {
            label = input.parentElement;
          }
          if (label && !answerElements.includes(label)) {
             answerElements.push(label);
          }
        });
        
        // Find the question text: look upwards from the first input
        let questionContainer = inputs[0].closest('.question-container, .mcq, .question, fieldset, form');
        if (!questionContainer && inputs[0].parentElement) {
            questionContainer = inputs[0].parentElement.parentElement;
        }
        
        if (questionContainer) {
          // get all text bearing elements that are direct children or block elements
          const potentialTexts = Array.from(questionContainer.querySelectorAll("h1, h2, h3, h4, p, code, pre, .prompt, .question-text"))
            .filter(el => {
              return !answerElements.some(ans => ans.contains(el));
            });
            
          let combinedText = [];
          for (const el of potentialTexts) {
            const text = el.innerText.trim();
            if (text.length > 2 && !text.toLowerCase().includes('question') && !text.toLowerCase().match(/^(1[0-9]|20|[1-9]) of \d+/)) {
              combinedText.push(text);
              if (!questionTextElement) questionTextElement = el;
            }
          }
          
          if (combinedText.length > 0) {
            questionText = combinedText.join('\n');
          } else {
            // If no specific paragraphs found, just grab the wrapper text and filter out the answer text
            let wrapperText = questionContainer.innerText.trim();
            answerElements.forEach(ans => {
                wrapperText = wrapperText.replace(ans.innerText.trim(), '');
            });
            questionText = wrapperText.trim();
            questionTextElement = questionContainer;
          }
          
          if (!questionText || questionText === "Question text not found") {
             questionText = "Please answer based on the choices above. Question could not be parsed but answers are visible.";
             questionTextElement = questionContainer;
          }
        }
      }
    } else {
      console.warn(
        `NetAcad UI: MCQ View element or its shadowRoot is missing for question ${
          index + 1
        }`
      );
      questionText = "Error: MCQ View element not accessible.";
    }
  } catch (e) {
    console.error(
      `NetAcad UI: Error extracting Q&A for question ${index + 1}:`,
      e,
      mcqViewElement
    );
    questionText = `Error extracting data. Check console.`;
  }
  return { questionText, answerElements, questionTextElement };
}

function processAnswerElements(answerElements, index) {
  let answerTexts = [];
  if (answerElements.length > 0) {
    console.debug("NetAcad UI: Possible Answers:");
    answerElements.forEach((answer, answerIndex) => {
      const ansText = answer.innerText.trim();
      answerTexts.push(ansText);
      console.debug(`NetAcad UI:   ${answerIndex + 1}: ${ansText}`);
    });
  } else {
    console.debug(`NetAcad UI: No answer elements found for question ${index + 1}.`);
  }
  return answerTexts;
}

function updateUiAndLogsPostExtraction(aiAnswerDisplay, questionText, answerTexts, index) {
  console.debug(`NetAcad UI: --- Question ${index + 1} --- Details --- `);
  console.debug("NetAcad UI: Question:", questionText);
  console.debug("NetAcad UI: Answers Extracted:", answerTexts);

  if (answerTexts.length === 0) {
    if (
      questionText !== "Question text not found" &&
      !questionText.startsWith("Error:")
    ) {
      aiAnswerDisplay.textContent =
        "AI Assistant: Question found, but no answer options detected.";
    } else {
      aiAnswerDisplay.textContent = questionText; // Show the extraction error
    }
  }

  if (
    questionText.startsWith("Error:") ||
    questionText === "Question text not found"
  ) {
    aiAnswerDisplay.textContent = questionText;
  }
}

function injectUi(uiContainer, questionTextElement, mcqViewElement, uiContainerId, index) {
  let uiInjected = false;
  if (questionTextElement && questionTextElement.parentNode) {
    try {
      const oldUiInPlace = questionTextElement.parentNode.querySelector(
        `#${uiContainerId}`
      );
      if (oldUiInPlace) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): Removing existing UI (id: ${uiContainerId}) from questionTextElement's parent.`
        );
        oldUiInPlace.remove();
      }

      console.debug(
        `NetAcad UI: Injection (Q ${index + 1}): Preparing to inject. uiContainer.id: ${
          uiContainer.id
        }, uiContainer.outerHTML (brief): ${uiContainer.outerHTML.substring(
          0,
          100
        )}...`
      );
      console.debug(
        `NetAcad UI: Injection (Q ${index + 1}): questionTextElement is <${
          questionTextElement.tagName
        }>. Parent is <${questionTextElement.parentNode.tagName}>.`
      );

      questionTextElement.parentNode.insertBefore(
        uiContainer,
        questionTextElement.nextSibling
      );

      const injectedElementCheck = questionTextElement.parentNode.querySelector(
        `#${uiContainerId}`
      );
      if (injectedElementCheck) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): SUCCESS - Injected after questionTextElement. Element #${uiContainerId} FOUND in parent. Parent: <${
            questionTextElement.parentNode.tagName
          }>, questionTextElement: <${
            questionTextElement.tagName
          }>. Injected el: <${injectedElementCheck.tagName}>`
        );
        uiInjected = true;

        // Deferred check
        setTimeout(() => {
          const stillThereCheck = document.getElementById(uiContainerId); // Check globally as it might have been moved
          if (stillThereCheck) {
            console.debug(
              `NetAcad UI: Injection (Q ${
                index + 1
              }) DEFERRED CHECK: Element #${uiContainerId} IS STILL in the DOM (document.getElementById). Visible: ${!!stillThereCheck.offsetParent}`
            );
            const parentNode = stillThereCheck.parentNode;
            const rootNode = parentNode ? parentNode.getRootNode() : null;
            let hostInfo =
              "Parent context unclear (element may have been moved).";
            if (rootNode && rootNode instanceof ShadowRoot) {
              hostInfo = `Parent is in a ShadowRoot. Host: <${
                rootNode.host.tagName
              } id="${rootNode.host.id}" class="${rootNode.host.className}">. Host visible: ${!!rootNode.host.offsetParent}.`;
            } else if (rootNode) {
              hostInfo = `Parent's rootNode is <${rootNode.nodeName}>.`;
            }
            console.debug(
              `NetAcad UI: Injection (Q ${
                index + 1
              }) DEFERRED CHECK - Parent Context: ${hostInfo}. Parent Tag: ${
                parentNode ? `<${parentNode.tagName}>` : "N/A"
              }. Parent visible: ${!!(parentNode && parentNode.offsetParent)}`
            );
          } else {
            // If not found by document.getElementById, check the original parent
            const originalParent = questionTextElement
              ? questionTextElement.parentNode
              : null;
            if (!originalParent) {
              console.error(
                `NetAcad UI: Injection (Q ${
                  index + 1
                }) DEFERRED CHECK: Original parent (questionTextElement.parentNode) is null. Cannot check further.`
              );
              return;
            }

            const stillInOriginalParentCheck = originalParent.querySelector(
              `#${uiContainerId}`
            );
            if (stillInOriginalParentCheck) {
              const rootNode = originalParent.getRootNode();
              let hostInfo =
                "Original parent is not in a Shadow DOM or getRootNode is document.";
              if (rootNode instanceof ShadowRoot) {
                hostInfo = `Original parent is in a ShadowRoot. Host: <${
                  rootNode.host.tagName
                } id="${rootNode.host.id}" class="${
                  rootNode.host.className
                }">. Host visible: ${!!rootNode.host.offsetParent}.`;
              } else if (rootNode === document) {
                hostInfo = "Original parent's rootNode is the main document.";
              } else {
                hostInfo = `Original parent's rootNode is of type ${
                  rootNode.nodeName || "unknown"
                }`;
              }
              console.debug(
                `NetAcad UI: Injection (Q ${
                  index + 1
                }) DEFERRED CHECK - Original Parent Context: ${hostInfo}. Original Parent Tag: <${
                  originalParent.tagName
                }>. Original Parent Visible (offsetParent): ${!!originalParent.offsetParent}`
              );
            } else {
              console.error(
                `NetAcad UI: Injection (Q ${
                  index + 1
                }) DEFERRED CHECK: Element #${uiContainerId} NO LONGER in original parent NOR by document.getElementById. Likely removed or parent changed.`
              );
            }
          }
        }, 500);
      } else {
        console.error(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): CRITICAL FAILURE - insertBefore called, but element #${uiContainerId} NOT FOUND in parent immediately after. Parent: <${
            questionTextElement.parentNode.tagName
          }>, questionTextElement: <${questionTextElement.tagName}>.`
        );
        uiInjected = false; // Explicitly set to false
      }
    } catch (e) {
      console.warn(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): FAILED to inject after questionTextElement. Parent: ${
          questionTextElement.parentNode
            ? `<${questionTextElement.parentNode.tagName}>`
            : "null"
        }, questionTextElement: <${questionTextElement.tagName}>. Error:`,
        e
      );
    }
  } else {
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): SKIPPED - questionTextElement (found: ${!!questionTextElement}) or its parentNode (parent exists: ${!!(
        questionTextElement && questionTextElement.parentNode
      )}) is missing.`
    );
  }

  if (!uiInjected && mcqViewElement && mcqViewElement.shadowRoot) {
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): Attempting fallback to mcqViewElement.shadowRoot.`
    );
    mcqViewElement.shadowRoot.appendChild(uiContainer);
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): SUCCESS - Injected into mcqViewElement.shadowRoot.`
    );
    uiInjected = true;
  } else if (!uiInjected) {
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): SKIPPED - mcqViewElement (found: ${!!mcqViewElement}) or its shadowRoot (shadowRoot exists: ${!!(
        mcqViewElement && mcqViewElement.shadowRoot
      )}) is missing for direct shadowRoot append.`
    );
  }

  if (!uiInjected) {
    const hostElement = mcqViewElement
      ? mcqViewElement.getRootNode().host
      : null;
    console.debug(
      `NetAcad UI: Injection (Q ${
        index + 1
      }): Attempting fallback via hostElement. mcqViewElement present: ${!!mcqViewElement}, hostElement: ${
        hostElement ? `<${hostElement.tagName}>` : "null"
      }`
    );
    if (hostElement && hostElement.parentElement) {
      console.debug(
        `NetAcad UI: Injection (Q ${index + 1}): hostElement.parentElement: ${
          hostElement.parentElement
            ? `<${hostElement.parentElement.tagName}>`
            : "null"
        }`
      );
      // Try to remove existing UI if it was placed here by ID
      const existingUiByHost = hostElement.parentElement.querySelector(
        `#${uiContainerId}`
      );
      if (
        existingUiByHost &&
        existingUiByHost.parentElement === hostElement.parentElement
      ) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): Removing existing UI (id: ${uiContainerId}) from hostElement.parentElement.`
        );
        existingUiByHost.remove();
      }

      if (hostElement.nextSibling) {
        hostElement.parentElement.insertBefore(
          uiContainer,
          hostElement.nextSibling
        );
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): SUCCESS - Injected via hostElement.parentElement, before hostElement.nextSibling.`
        );
      } else {
        hostElement.parentElement.appendChild(uiContainer);
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): SUCCESS - Appended via hostElement.parentElement.`
        );
      }
      uiInjected = true;
    } else if (!uiInjected) {
      console.debug(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): SKIPPED - hostElement (found: ${!!hostElement}) or hostElement.parentElement (found: ${!!(
          hostElement && hostElement.parentElement
        )}) is missing.`
      );
      // Try to remove existing UI if it was placed here by ID
      const existingUiInBody = document.body.querySelector(`#${uiContainerId}`);
      if (
        existingUiInBody &&
        existingUiInBody.parentElement === document.body
      ) {
        console.debug(
          `NetAcad UI: Injection (Q ${
            index + 1
          }): Removing existing UI (id: ${uiContainerId}) from document.body.`
        );
        existingUiInBody.remove();
      }

      console.warn(
        `NetAcad UI: Injection (Q ${
          index + 1
        }): CRITICAL FALLBACK - Appending to document.body.`
      );
      document.body.appendChild(uiContainer);
      uiInjected = true;
    }
  }
  return uiInjected;
}

function getFriendlyGeminiErrorMessage(errorString) {
  // Handles known Gemini API error patterns
  if (!errorString) return null;
  if (errorString.includes('503') && errorString.toLowerCase().includes('overload')) {
    return 'AI Suggestion: Gemini API is overloaded. Please try again later.';
  }
  if (errorString.includes('503') && errorString.toLowerCase().includes('unavailable')) {
    return 'AI Suggestion: Gemini API is currently unavailable (503). Please try again later.';
  }
  if (errorString.includes('quota')) {
    return 'AI Suggestion: Gemini API quota exceeded. Please check your API usage or try again later.';
  }
  if (errorString.includes('invalid') && errorString.toLowerCase().includes('key')) {
    return 'AI Suggestion: Invalid Gemini API Key. Please check your key in the extension popup.';
  }
  // Add more patterns as needed
  return null;
}

async function handleRefreshAction(questionText, answerTexts, apiKey, aiAnswerDisplay, index) {
  if (!aiAnswerDisplay) return;

  if (!apiKey) {
    aiAnswerDisplay.textContent =
      "API Key not set. Please set it in the extension popup.";
    console.warn(`NetAcad UI: refreshAction for Q${index + 1}: API Key not available.`);
    return;
  }

  if (
    questionText === "Question text not found" ||
    questionText.startsWith("Error:")
  ) {
    aiAnswerDisplay.textContent = questionText; // Reshow extraction error
    console.warn(
      `NetAcad UI: refreshAction for Q${
        index + 1
      }: Aborted due to question extraction issue: ${questionText}`
    );
    return;
  }
  if (answerTexts.length === 0) {
    aiAnswerDisplay.textContent =
      "AI Assistant: No answer options available to send to AI.";
    console.warn(
      `NetAcad UI: refreshAction for Q${index + 1}: Aborted, no answer texts.`
    );
    return;
  }

  aiAnswerDisplay.textContent = "Asking Gemini AI (single refresh)...";
  console.debug(
    `NetAcad UI: refreshAction for Q${
      index + 1
    }: Asking Gemini AI for question: "${questionText.substring(0, 50)}..."`
  );
  const rawAiResponse = await getAiAnswer(questionText, answerTexts, apiKey);

  console.debug(
    `NetAcad UI: AI Answer (single refresh) received for Q${index + 1}: '${rawAiResponse}' (Full text)`
  );

  if (rawAiResponse && rawAiResponse.trim() !== "" && !rawAiResponse.toLowerCase().startsWith("error:")) {
    const individualAnswers = rawAiResponse.split('\n').map(ans => ans.trim()).filter(ans => ans.length > 0);
    if (individualAnswers.length > 1) {
      aiAnswerDisplay.innerHTML = "AI Suggestions:<br />- " + individualAnswers.join("<br />- ");
      console.debug(`NetAcad UI: Q${index + 1} (single refresh) multiple answers:`, individualAnswers);
    } else if (individualAnswers.length === 1) {
      aiAnswerDisplay.textContent = `AI Suggestion: ${individualAnswers[0]}`;
      console.debug(`NetAcad UI: Q${index + 1} (single refresh) single answer: ${individualAnswers[0]}`);
    } else {
      aiAnswerDisplay.textContent = "AI Suggestion: No valid answer content received (single refresh).";
      console.warn(`NetAcad UI: Q${index + 1} (single refresh) AI response was empty or only whitespace after processing: '${rawAiResponse}'`);
    }

    // Call autoselect if the bot is active
    chrome.storage.sync.get(["autonomousBot"], (result) => {
      if (result.autonomousBot) {
        autoSelectMatchingAnswers(extractQuestionAndAnswers(aiAnswerDisplay.closest('mcq-view'), index).answerElements, individualAnswers);
      }
    });

  } else if (rawAiResponse && rawAiResponse.toLowerCase().startsWith("error:")) {
    // Improved error handling
    const friendlyMsg = getFriendlyGeminiErrorMessage(rawAiResponse);
    if (friendlyMsg) {
      aiAnswerDisplay.textContent = friendlyMsg;
    } else {
      aiAnswerDisplay.textContent = rawAiResponse;
    }
    console.error(`NetAcad UI: Error displayed for Q${index + 1} (single refresh): ${rawAiResponse}`);

    // Show in dev overlay
    const errMsg = rawAiResponse || "Unknown error";
    let shortErr;
    if (errMsg.toLowerCase().includes('quota') || errMsg.includes('429')) shortErr = '⛔ API Quota Exceeded!';
    else if (errMsg.includes('401') || errMsg.toLowerCase().includes('api key')) shortErr = '🔑 Invalid API Key!';
    else if (errMsg.includes('503') || errMsg.toLowerCase().includes('overload')) shortErr = '😵 API Overloaded — Retrying...';
    else if (errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('connect')) shortErr = '📡 No Internet / API Unreachable';
    else shortErr = '⚠️ ' + errMsg.substring(0, 70);
    if (typeof updateDevOverlay === 'function') updateDevOverlay('❌ API Error', shortErr);

    // Unlock bot state & auto-retry in 15s
    if (window.netAcadBotState) { window.netAcadBotState.isProcessingQuiz = false; window.netAcadBotState.lastQuizProcessedAt = 0; }
    setTimeout(() => { window.netAcadBotResetScrapeUrl && window.netAcadBotResetScrapeUrl(); }, 15000);

  } else {
    aiAnswerDisplay.textContent =
      "AI Suggestion: No answer received or answer was empty (single refresh).";
    console.warn(
      `NetAcad UI: AI returned empty or whitespace-only answer for Q${
        index + 1
      } (single refresh). Original response: '${rawAiResponse}'`
    );
  }
}

async function processSingleQuestion(mcqViewElement, index, apiKey, preFetchedAiAnswer = null) {
  const uiContainerId = `netacad-ai-q-${index}`;

  // Always attempt to remove old UI from mcqViewElement's shadowRoot first
  if (mcqViewElement && mcqViewElement.shadowRoot) {
    const existingUiInMcqSR = mcqViewElement.shadowRoot.querySelector(
      `#${uiContainerId}`
    );
    if (existingUiInMcqSR) {
      console.debug(
        `NetAcad UI: Removing existing UI (id: ${uiContainerId}) from mcqView SR for Q ${
          index + 1
        }`
      );
      existingUiInMcqSR.remove();
    }
  }
  // Note: Removal from questionTextElement.parentNode is handled during injection phase

  const { uiContainer, aiAnswerDisplay, refreshButton } = createAiAssistantUI(uiContainerId, index);

  // --- 2. Extract Question and Answers ---
  let { questionText, answerElements, questionTextElement } = extractQuestionAndAnswers(mcqViewElement, index);
  
  // --- 3. Process Answer Elements & Update UI based on extraction ---
  let answerTexts = processAnswerElements(answerElements, index);
  updateUiAndLogsPostExtraction(aiAnswerDisplay, questionText, answerTexts, index);

  // --- 4. UI Injection Logic ---
  injectUi(uiContainer, questionTextElement, mcqViewElement, uiContainerId, index);

  // --- 5. Refresh Action and Initial Fetch/Status ---
  refreshButton.addEventListener("click", () => 
    handleRefreshAction(questionText, answerTexts, apiKey, aiAnswerDisplay, index)
  );

  // Handle AI answer display (pre-fetched or initial call)
  if (preFetchedAiAnswer === "BATCH_PROCESSING_STARTED") {
    aiAnswerDisplay.textContent = "Batch processing... Please wait.";
    console.debug(`NetAcad UI: Q${index + 1} waiting for batched AI answer.`);
  } else if (preFetchedAiAnswer) { // An actual answer or error string is provided
    if (preFetchedAiAnswer.toLowerCase().startsWith("error:")) {
      // Improved error handling
      const friendlyMsg = getFriendlyGeminiErrorMessage(preFetchedAiAnswer);
      if (friendlyMsg) {
        aiAnswerDisplay.textContent = friendlyMsg;
      } else {
        aiAnswerDisplay.textContent = preFetchedAiAnswer;
      }
      console.error(`NetAcad UI: Error displayed for Q${index + 1} from pre-fetched data: ${preFetchedAiAnswer}`);
    } else {
      const multiAnswerSeparator = " /// ";
      if (preFetchedAiAnswer.includes(multiAnswerSeparator)) {
        const individualAnswers = preFetchedAiAnswer.split(multiAnswerSeparator).map(ans => ans.trim()).filter(ans => ans.length > 0);
        if (individualAnswers.length > 0) {
          aiAnswerDisplay.innerHTML = "AI Suggestions:<br />- " + individualAnswers.join("<br />- ");
        } else {
           aiAnswerDisplay.textContent = "AI Suggestion: Received multiple answer format but no valid content.";
        }
        
        chrome.storage.sync.get(["autonomousBot"], (result) => {
          if (result.autonomousBot) {
             autoSelectMatchingAnswers(answerElements, individualAnswers);
          }
        });

      } else {
        aiAnswerDisplay.textContent = `AI Suggestion: ${preFetchedAiAnswer}`;
        chrome.storage.sync.get(["autonomousBot"], (result) => {
          if (result.autonomousBot) {
             autoSelectMatchingAnswers(answerElements, [preFetchedAiAnswer]);
          }
        });
      }
    }
  } else { // No pre-fetched answer, proceed with individual fetch if Q/A is valid
    if (
      questionText !== "Question text not found" &&
      !questionText.startsWith("Error:") &&
      answerTexts.length > 0 &&
      apiKey // Only try if API key is present
    ) {
      console.debug(`NetAcad UI: Q${index + 1} making individual call to AI (no pre-fetched answer).`);
      await handleRefreshAction(questionText, answerTexts, apiKey, aiAnswerDisplay, index);
    } else if (!apiKey && questionText !== "Question text not found" && !questionText.startsWith("Error:") && answerTexts.length > 0) {
      aiAnswerDisplay.textContent = "Error: Gemini API Key not set in popup.";
      console.warn(`NetAcad UI: Q${index + 1} cannot fetch AI answer - API key missing.`);
    } else {
      console.debug(`NetAcad UI: Q${index + 1} - Initial AI call skipped due to extraction issues or missing API key. Message: ${aiAnswerDisplay.textContent}`);
    }
  }
}

// -----------------------------------------
// AUTONOMOUS BOT EXTENSION
// -----------------------------------------
function autoSelectMatchingAnswers(answerElements, individualAnswers) {
  if (!answerElements || answerElements.length === 0 || !individualAnswers || individualAnswers.length === 0) return;

  const normalizedIndividualAnswers = individualAnswers.map(ans => ans.toLowerCase().trim().replace(/[\s\W]+/g, ''));
  let checkedCount = 0;

  answerElements.forEach(answerEl => {
    const text = answerEl.innerText.trim();
    if (!text) return;

    const normalizedText = text.toLowerCase().trim().replace(/[\s\W]+/g, '');

    const isMatch = normalizedIndividualAnswers.some(aiAns => 
      aiAns === normalizedText || 
      aiAns.includes(normalizedText) || 
      normalizedText.includes(aiAns)
    );

    if (isMatch) {
      console.debug(`NetAcad UI: Bot Auto-Selecting matching choice: "${text}"`);
      // Find the input element to specifically target it
      const parentContainer = answerEl.closest('.mcq__item') || answerEl.parentNode;
      let inputChild = parentContainer ? parentContainer.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]') : null;
      
      if (!inputChild) {
        inputChild = answerEl.querySelector('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
      }
      
      // If the answerEl itself is the input
      if (!inputChild && (answerEl.tagName === 'INPUT' || answerEl.getAttribute('role') === 'radio' || answerEl.getAttribute('role') === 'checkbox')) {
         inputChild = answerEl;
      }
      
      if (inputChild) {
        const isChecked = inputChild.tagName.toLowerCase() === 'input' ? inputChild.checked : inputChild.getAttribute('aria-checked') === 'true';
        if (!isChecked) {
          inputChild.click();
          checkedCount++;
        }
      } else {
        answerEl.click();
        checkedCount++;
      }
    }
  });

  return checkedCount;
}

// -----------------------------------------
// MATCHING / ORDERING QUESTION SUPPORT
// -----------------------------------------

/**
 * Extracts data from a matching/ordering question (object-matching-dropdown-view).
 * Returns { questionText, categories: string[], options: string[], categoryElements: Element[] }
 */
function extractMatchingQuestionData(matchingViewElement, index) {
  let questionText = "";
  let categories = [];
  let options = [];
  let categoryContainers = [];

  try {
    // The matching view may be a custom element with shadow DOM
    const root = matchingViewElement.shadowRoot || matchingViewElement;

    // 1. Extract the question text — look in ancestor elements or sibling elements
    // The question text is typically ABOVE the matching component in the page
    // Try to find it by looking at parent containers
    let questionEl = null;

    // Method 1: Look for prompt/body elements inside the component's shadow
    if (matchingViewElement.shadowRoot) {
      questionEl = matchingViewElement.shadowRoot.querySelector('.component__body-inner, .prompt, .matching__prompt, .question-text');
    }

    // Method 2: Look upwards from the matching element itself
    if (!questionEl) {
      let parent = matchingViewElement.parentElement;
      for (let depth = 0; depth < 10 && parent; depth++) {
        const candidates = parent.querySelectorAll('h1, h2, h3, h4, p, .prompt, .question-text, .component__body-inner');
        for (const el of candidates) {
          const text = (el.innerText || '').trim();
          if (text.length > 15 && !el.contains(matchingViewElement)) {
            questionEl = el;
            break;
          }
        }
        if (questionEl) break;
        // Also check shadow roots of parents
        if (parent.shadowRoot) {
          const shadowCandidates = parent.shadowRoot.querySelectorAll('h1, h2, h3, h4, p, .prompt, .question-text, .component__body-inner');
          for (const el of shadowCandidates) {
            const text = (el.innerText || '').trim();
            if (text.length > 15) {
              questionEl = el;
              break;
            }
          }
          if (questionEl) break;
        }
        parent = parent.parentElement;
      }
    }

    // Method 3: Use getDeepElements to search for base-view inside a parent tree
    if (!questionEl && window.getDeepElements) {
      // Try finding the base-view that contains this matching element
      const baseViews = window.getDeepElements('base-view');
      for (const bv of baseViews) {
        if (bv.shadowRoot) {
          const bodyInner = bv.shadowRoot.querySelector('.component__body-inner');
          if (bodyInner) {
            const text = (bodyInner.innerText || '').trim();
            if (text.length > 15) {
              questionEl = bodyInner;
              break;
            }
          }
        }
      }
    }

    if (questionEl) {
      questionText = (questionEl.innerText || '').trim();
    } else {
      questionText = `Matching/ordering question ${index + 1} (question text not extracted)`;
    }

    // 2. Extract categories (left side) and options (right side)
    // Look for category containers inside shadow DOM or direct DOM
    const searchRoots = [root];
    if (matchingViewElement.shadowRoot) {
      // Also search deeper shadow DOMs
      const innerCustomEls = Array.from(matchingViewElement.shadowRoot.querySelectorAll('*'));
      for (const el of innerCustomEls) {
        if (el.shadowRoot) searchRoots.push(el.shadowRoot);
      }
    }

    for (const searchRoot of searchRoots) {
      // Find category titles (left side labels like "step 1", "step 2", etc.)
      const titleEls = searchRoot.querySelectorAll('.matching__item-title, .matching__item-title_inner, [class*="matching__item-title"]');
      if (titleEls.length > 0) {
        titleEls.forEach(el => {
          const titleInner = el.querySelector('.matching__item-title_inner') || el;
          const text = (titleInner.innerText || titleInner.textContent || '').trim();
          if (text && !categories.includes(text)) {
            categories.push(text);
          }
        });
      }

      // Find category item containers (for auto-selecting later)
      const containers = searchRoot.querySelectorAll('[class*="objectMatching-category-item-container"], .objectMatching-category-item-container');
      if (containers.length > 0) {
        categoryContainers = Array.from(containers);
      }

      // Find option items (right side labels like "client sends FIN.", "client sends ACK.", etc.)
      const optionEls = searchRoot.querySelectorAll('.matching__select-container, [class*="matching__select"], [class*="options-wrapper"]');
      if (optionEls.length > 0) {
        // The options are typically in a shared pool, find unique option texts
        // Look for all available option elements that can be selected
        const optionItems = searchRoot.querySelectorAll('[class*="category-item-number"], [class*="options-wrapper"] [class*="item"], [class*="option-label"], [class*="options-header"]');
        optionItems.forEach(el => {
          const text = (el.innerText || el.textContent || '').trim();
          if (text && !options.includes(text) && text.length > 1) {
            options.push(text);
          }
        });

        // Fallback: If no options found via specific classes, extract from select/dropdown elements
        if (options.length === 0) {
          // Look for <select> elements and their <option> children
          const selectEls = searchRoot.querySelectorAll('select, [class*="select"]');
          selectEls.forEach(sel => {
            const optChildren = sel.querySelectorAll('option, [class*="item"], [class*="option"]');
            optChildren.forEach(opt => {
              const text = (opt.innerText || opt.textContent || '').trim();
              if (text && !options.includes(text) && text.length > 1 && text !== '--' && text !== '-') {
                options.push(text);
              }
            });
          });
        }

        // Fallback 2: Extract unique non-category text from within the select containers themselves
        if (options.length === 0) {
          optionEls.forEach(container => {
            const allText = container.querySelectorAll('div, span, p, li');
            allText.forEach(el => {
              const text = (el.innerText || el.textContent || '').trim();
              if (text && !options.includes(text) && !categories.includes(text) && 
                  text.length > 2 && !/^[A-Z]$/.test(text) && text !== '--') {
                options.push(text);
              }
            });
          });
        }
      }
    }

    // Fallback: use getDeepElements to find matching elements in deeply nested shadow DOMs
    if ((categories.length === 0 || options.length === 0) && window.getDeepElements) {
      // Search specifically within the matching view's subtree
      const allEls = [];
      const queue = [matchingViewElement];
      while (queue.length > 0) {
        const node = queue.shift();
        if (!node) continue;
        if (node.shadowRoot) queue.push(node.shadowRoot);
        const children = node.children || node.childNodes;
        if (children) {
          for (let i = 0; i < children.length; i++) {
            if (children[i].nodeType === 1) {
              allEls.push(children[i]);
              queue.push(children[i]);
            }
          }
        }
      }

      if (categories.length === 0) {
        // Look for matching item title elements
        allEls.forEach(el => {
          const cls = (el.className || '').toString();
          if (cls.includes('matching__item-title') || cls.includes('matching_item-title')) {
            const inner = el.querySelector('[class*="title_inner"]') || el;
            const text = (inner.innerText || inner.textContent || '').trim();
            if (text && !categories.includes(text)) {
              categories.push(text);
            }
          }
        });
      }

      if (options.length === 0) {
        // Look for option text elements — they are typically sibling radio-like items next to each category
        // In the matching UI, each row has a category label + circular radio buttons for each option
        // The options are usually displayed as column headers
        allEls.forEach(el => {
          const cls = (el.className || '').toString();
          // Options column header text
          if (cls.includes('category-item-number') || cls.includes('option-label') || cls.includes('options-header')) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text && !options.includes(text) && text.length > 1) {
              options.push(text);
            }
          }
        });

        // If still no options, look for the option text items that appear alongside categories
        if (options.length === 0) {
          // Find all text nodes near radio/select elements
          allEls.forEach(el => {
            const cls = (el.className || '').toString();
            if (cls.includes('container-options-wrapper') || cls.includes('item-container')) {
              // Get all unique text spans that look like answer options
              const textEls = el.querySelectorAll('div, span, p');
              textEls.forEach(te => {
                const text = (te.innerText || te.textContent || '').trim();
                // Filter out category numbers (A, B, C, D) and empty strings
                if (text && text.length > 2 && !options.includes(text) && !/^[A-Z]$/.test(text)) {
                  options.push(text);
                }
              });
            }
          });
        }
      }

      // Collect category containers if not found yet
      if (categoryContainers.length === 0) {
        categoryContainers = allEls.filter(el => {
          const cls = (el.className || '').toString();
          return cls.includes('objectMatching-category-item-container') || cls.includes('category-item-container');
        });
      }
    }

    console.debug(`NetAcad UI: Matching Q${index + 1} extraction: ${categories.length} categories, ${options.length} options.`);
    console.debug(`  Categories:`, categories);
    console.debug(`  Options:`, options);

  } catch (e) {
    console.error(`NetAcad UI: Error extracting matching question ${index + 1}:`, e);
  }

  return { questionText, categories, options, categoryContainers };
}

/**
 * Auto-selects the correct matching/ordering answers by clicking on the dropdown items
 * or radio buttons in a matching grid.
 * ASYNC — processes each item sequentially to avoid UI conflicts.
 * @param {Element} matchingViewElement - The object-matching-dropdown-view element
 * @param {Object} mappings - AI response: { "category text": "option text", ... }
 * @param {string[]} [optionsList] - Ordered list of option texts (used for radio-grid matching)
 */
async function autoSelectMatchingDropdowns(matchingViewElement, mappings, optionsList) {
  if (!mappings || typeof mappings !== 'object') {
    console.warn("NetAcad UI: autoSelectMatchingDropdowns called with invalid mappings:", mappings);
    return;
  }

  console.debug("NetAcad UI: Auto-selecting matching answers with mappings:", mappings);
  if (optionsList) {
    console.debug("NetAcad UI: Options list provided (radio-grid mode):", optionsList);
  }

  // Traverse the entire subtree including shadow DOMs to find all elements
  const allEls = [];
  const queue = [matchingViewElement];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.shadowRoot) queue.push(node.shadowRoot);
    const children = node.children || node.childNodes;
    if (children) {
      for (let i = 0; i < children.length; i++) {
        if (children[i].nodeType === 1) {
          allEls.push(children[i]);
          queue.push(children[i]);
        }
      }
    }
  }

  // Find all category rows — each row contains a title and a select/dropdown area or radio buttons
  const categoryRows = allEls.filter(el => {
    const cls = (el.className || '').toString();
    return cls.includes('objectMatching-category-item-container') || 
           cls.includes('category-item-container') ||
           cls.includes('matching__item');
  });

  // ============================================================
  // STRATEGY A: Structured rows with dropdowns or radio buttons
  // ============================================================
  if (categoryRows.length > 0) {
    console.debug(`NetAcad UI: Found ${categoryRows.length} structured category rows.`);

    for (const row of categoryRows) {
      let categoryText = '';
      const rowEls = [];
      const rowQueue = [row];
      while (rowQueue.length > 0) {
        const node = rowQueue.shift();
        if (!node) continue;
        if (node.shadowRoot) rowQueue.push(node.shadowRoot);
        const children = node.children || node.childNodes;
        if (children) {
          for (let i = 0; i < children.length; i++) {
            if (children[i].nodeType === 1) {
              rowEls.push(children[i]);
              rowQueue.push(children[i]);
            }
          }
        }
      }

      const titleEl = rowEls.find(el => {
        const cls = (el.className || '').toString();
        return cls.includes('matching__item-title_inner') || cls.includes('title_inner');
      }) || rowEls.find(el => {
        const cls = (el.className || '').toString();
        return cls.includes('matching__item-title');
      });

      if (titleEl) {
        categoryText = (titleEl.innerText || titleEl.textContent || '').trim();
      }

      if (!categoryText) continue;

      const targetOption = findMatchingOption(categoryText, mappings);
      if (!targetOption) {
        console.debug(`NetAcad UI: No mapping found for category "${categoryText}"`);
        continue;
      }

      // Try dropdown containers first
      const selectContainer = rowEls.find(el => {
        const cls = (el.className || '').toString();
        return cls.includes('matching__select-container') || cls.includes('select-container');
      });

      if (selectContainer) {
        await clickMatchingOption(selectContainer, targetOption, matchingViewElement);
        await new Promise(r => setTimeout(r, 300));
      } else {
        // RADIO-GRID: Find radio buttons in this row and use option index
        const radios = rowEls.filter(el => {
          return (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) ||
                 el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox';
        });

        if (radios.length > 0 && optionsList && optionsList.length > 0) {
          // Use the ordered options list to find the correct radio index
          const optIdx = findOptionIndexByText(targetOption, optionsList);
          if (optIdx >= 0 && optIdx < radios.length) {
            radios[optIdx].click();
            console.debug(`NetAcad UI: ✅ Clicked radio[${optIdx}] for "${categoryText}" -> "${targetOption}"`);
            await new Promise(r => setTimeout(r, 200));
          } else {
            console.warn(`NetAcad UI: ⚠️ Option index ${optIdx} out of range (${radios.length} radios) for "${categoryText}" -> "${targetOption}"`);
          }
        } else if (radios.length > 0) {
          // Fallback: try class-based option index
          const optionIndex = findOptionIndex(targetOption, allEls);
          if (optionIndex >= 0 && optionIndex < radios.length) {
            radios[optionIndex].click();
            console.debug(`NetAcad UI: ✅ Clicked radio[${optionIndex}] (class-based) for "${categoryText}" -> "${targetOption}"`);
            await new Promise(r => setTimeout(r, 200));
          }
        }
      }
    }
    return;
  }

  // ============================================================
  // STRATEGY B: Title + Select container pairs (dropdown style)
  // ============================================================
  const titleEls = allEls.filter(el => {
    const cls = (el.className || '').toString();
    return cls.includes('matching__item-title');
  });

  const selectContainers = allEls.filter(el => {
    const cls = (el.className || '').toString();
    return cls.includes('matching__select-container');
  });

  if (titleEls.length > 0 && selectContainers.length > 0) {
    console.debug(`NetAcad UI: Strategy B — ${titleEls.length} titles, ${selectContainers.length} select containers.`);

    for (let i = 0; i < titleEls.length && i < selectContainers.length; i++) {
      const titleEl = titleEls[i];
      const selectContainer = selectContainers[i];
      const titleInner = titleEl.querySelector('[class*="title_inner"]') || titleEl;
      const categoryText = (titleInner.innerText || titleInner.textContent || '').trim();
      
      const targetOption = findMatchingOption(categoryText, mappings);
      if (targetOption) {
        await clickMatchingOption(selectContainer, targetOption, matchingViewElement);
        await new Promise(r => setTimeout(r, 300));
      }
    }
    return;
  }

  // ============================================================
  // STRATEGY C: Radio-grid fallback (categories + radios + options)
  // Used when no structured rows or dropdown containers are found
  // but radio buttons exist alongside category/option text
  // ============================================================
  const allRadios = allEls.filter(el => {
    return (el.tagName === 'INPUT' && (el.type === 'radio' || el.type === 'checkbox')) ||
           el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox';
  });

  if (allRadios.length > 0 && optionsList && optionsList.length > 0) {
    console.debug(`NetAcad UI: Strategy C (radio-grid) — ${allRadios.length} radios, ${optionsList.length} options.`);

    // In a radio grid, radios are arranged as: [row0_radio0, row0_radio1, ..., row1_radio0, row1_radio1, ...]
    // Each row has optionsList.length radio buttons
    const numOptions = optionsList.length;
    const numCategories = Math.floor(allRadios.length / numOptions);
    const mappingEntries = Object.entries(mappings);

    for (let catIdx = 0; catIdx < numCategories && catIdx < mappingEntries.length; catIdx++) {
      const [categoryText, targetOption] = mappingEntries[catIdx];
      const optIdx = findOptionIndexByText(targetOption, optionsList);

      if (optIdx >= 0) {
        const radioIdx = (catIdx * numOptions) + optIdx;
        if (radioIdx < allRadios.length) {
          allRadios[radioIdx].click();
          console.debug(`NetAcad UI: ✅ Radio-grid: clicked radio[${radioIdx}] for "${categoryText}" -> "${targetOption}" (row=${catIdx}, col=${optIdx})`);
          await new Promise(r => setTimeout(r, 200));
        }
      } else {
        console.warn(`NetAcad UI: ⚠️ Could not find option index for "${targetOption}" in options list.`);
      }
    }
    return;
  }

  console.warn("NetAcad UI: ⚠️ No matching strategy worked. Could not auto-select answers.");
}

/**
 * Find the matching option text for a given category from the AI mappings.
 */
function findMatchingOption(categoryText, mappings) {
  const normalizedCategory = categoryText.toLowerCase().trim();
  
  // Direct match
  for (const [key, value] of Object.entries(mappings)) {
    if (key.toLowerCase().trim() === normalizedCategory) {
      return value;
    }
  }
  
  // Partial/fuzzy match
  for (const [key, value] of Object.entries(mappings)) {
    const normalizedKey = key.toLowerCase().trim();
    if (normalizedKey.includes(normalizedCategory) || normalizedCategory.includes(normalizedKey)) {
      return value;
    }
  }
  
  return null;
}

/**
 * Find the index of an option in an ordered options list by fuzzy text matching.
 * Used for radio-grid matching where the column index corresponds to the option position.
 * @param {string} targetOption - The option text to find
 * @param {string[]} optionsList - Ordered list of option texts
 * @returns {number} The index of the matching option, or -1 if not found
 */
function findOptionIndexByText(targetOption, optionsList) {
  const normalizedTarget = targetOption.toLowerCase().trim().replace(/[\s\W]+/g, '');
  
  // Pass 1: Exact match (after normalization)
  for (let i = 0; i < optionsList.length; i++) {
    const normalizedOpt = optionsList[i].toLowerCase().trim().replace(/[\s\W]+/g, '');
    if (normalizedOpt === normalizedTarget) {
      return i;
    }
  }
  
  // Pass 2: Contains match (one contains the other)
  for (let i = 0; i < optionsList.length; i++) {
    const normalizedOpt = optionsList[i].toLowerCase().trim().replace(/[\s\W]+/g, '');
    if (normalizedOpt.includes(normalizedTarget) || normalizedTarget.includes(normalizedOpt)) {
      return i;
    }
  }

  // Pass 3: Significant word overlap (for cases where AI slightly rephrases)
  const targetWords = targetOption.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  if (targetWords.length > 0) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let i = 0; i < optionsList.length; i++) {
      const optWords = optionsList[i].toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const matches = targetWords.filter(tw => optWords.some(ow => ow.includes(tw) || tw.includes(ow)));
      const score = matches.length / Math.max(targetWords.length, optWords.length);
      if (score > bestScore && score >= 0.5) { // At least 50% word overlap
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) return bestIdx;
  }
  
  return -1;
}

/**
 * Find the index of an option in the available options list.
 */
function findOptionIndex(targetOption, allEls) {
  const normalizedTarget = targetOption.toLowerCase().trim().replace(/[\s\W]+/g, '');
  
  const optionEls = allEls.filter(el => {
    const cls = (el.className || '').toString();
    return cls.includes('category-item-number') || cls.includes('option-label');
  });

  for (let i = 0; i < optionEls.length; i++) {
    const text = (optionEls[i].innerText || optionEls[i].textContent || '').trim();
    const normalizedText = text.toLowerCase().trim().replace(/[\s\W]+/g, '');
    if (normalizedText === normalizedTarget || normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText)) {
      return i;
    }
  }

  return -1;
}

/**
 * Click the correct option in a matching dropdown/select container.
 * Returns a Promise that resolves after the option is clicked.
 * @param {Element} selectContainer - The select/dropdown container to click
 * @param {string} targetOption - The option text to select
 * @param {Element} scopeRoot - The matching view element to scope the search within
 */
function clickMatchingOption(selectContainer, targetOption, scopeRoot) {
  const normalizedTarget = targetOption.toLowerCase().trim().replace(/[\s\W]+/g, '');

  // Step 1: Click the select container to open the dropdown
  selectContainer.click();
  console.debug(`NetAcad UI: Clicked select container to open dropdown for target: "${targetOption}"`);

  // Step 2: Return a Promise that resolves after finding and clicking the correct option
  return new Promise((resolve) => {
    setTimeout(() => {
      // Search for dropdown options — scope to the matching view element and its shadow DOM
      // instead of the entire document body to avoid cross-contamination
      const dropdownItems = [];
      const searchRoots = [scopeRoot || document.body];

      // Traverse the scoped root's shadow DOM tree to find dropdown items
      const freshQueue = [...searchRoots];
      while (freshQueue.length > 0) {
        const node = freshQueue.shift();
        if (!node) continue;
        if (node.shadowRoot) freshQueue.push(node.shadowRoot);
        const children = node.children || node.childNodes;
        if (children) {
          for (let i = 0; i < children.length; i++) {
            if (children[i].nodeType === 1) {
              const cls = (children[i].className || '').toString();
              // Look for dropdown option items
              if (cls.includes('dropdown') || cls.includes('option') || cls.includes('select') || cls.includes('menu-item') || cls.includes('list-item')) {
                dropdownItems.push(children[i]);
              }
              freshQueue.push(children[i]);
            }
          }
        }
      }

      // Also search within the select container itself (dropdown might render inside it)
      const containerDescendants = selectContainer.querySelectorAll('*');
      containerDescendants.forEach(el => dropdownItems.push(el));

      // Also check if a dropdown overlay was rendered at document level (some UIs do this)
      // — but only grab elements that appeared AFTER the click
      const bodyDropdowns = document.querySelectorAll('[class*="dropdown"], [class*="menu-item"], [class*="list-item"], [class*="overlay"]');
      bodyDropdowns.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          dropdownItems.push(el);
          // Also include children of these overlays
          el.querySelectorAll('*').forEach(child => dropdownItems.push(child));
        }
      });

      // Find the option with matching text
      let clicked = false;
      for (const item of dropdownItems) {
        const text = (item.innerText || item.textContent || '').trim();
        if (!text || text.length === 0) continue;
        const normalizedText = text.toLowerCase().trim().replace(/[\s\W]+/g, '');
        
        if (normalizedText === normalizedTarget || normalizedText.includes(normalizedTarget) || normalizedTarget.includes(normalizedText)) {
          item.click();
          console.debug(`NetAcad UI: ✅ Selected matching option: "${text}" for target: "${targetOption}"`);
          clicked = true;
          break;
        }
      }

      if (!clicked) {
        console.warn(`NetAcad UI: ⚠️ Could not find dropdown option for: "${targetOption}". Closing dropdown.`);
        // Try clicking the select container again to close it
        selectContainer.click();
      }

      resolve(clicked);
    }, 600); // 600ms to let the dropdown fully render
  });
}