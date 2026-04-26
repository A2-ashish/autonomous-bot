// Constants for retry mechanism
const MAX_SCRAPE_ATTEMPTS = 10;
const SCRAPE_RETRY_DELAY_MS = 1500;

async function scrapeData(currentAttempt = 1) {
  // STRICT Concurrency lock: Prevent multiple overlapping API calls which cause instant 429 Burst Limits
  if (currentAttempt === 1 && window.netAcadBotState) {
    if (window.netAcadBotState.isProcessingQuiz) {
      console.debug("NetAcad Scraper: Already processing quiz. Ignoring overlapping scrapeData call.");
      return false;
    }
    // Lock IMMEDIATELY before any async await yields the execution thread
    window.netAcadBotState.isProcessingQuiz = true;
  }

  console.debug(
    `NetAcad Scraper (scraper.js): scrapeData attempt #${currentAttempt} of ${MAX_SCRAPE_ATTEMPTS}`
  );

  // Use rotating key system — falls back to single key for backward compatibility
  const keyInfo = await getActiveApiKey();
  const apiKey = keyInfo ? keyInfo.key : null;
  if (keyInfo && keyInfo.total > 1) {
    console.debug(`NetAcad Scraper: Using API key #${keyInfo.index + 1} of ${keyInfo.total}`);
  }

  let mcqViewElements = [];
  let earlyExitReason = "";

  try {
    // 1. Broad search for mcq-view anywhere
    if (window.getDeepElements) {
      mcqViewElements = window.getDeepElements("mcq-view");
    }

    // 2. Generic Quiz Fallback: If no mcq-view, look for any radio/checkbox inputs or roles
    if (mcqViewElements.length === 0 && window.getDeepElements) {
      const inputs = window.getDeepElements('input, [role="radio"], [role="checkbox"]').filter(i => {
        if (i.tagName.toLowerCase() === 'input') return i.type === 'radio' || i.type === 'checkbox';
        return true;
      });
      if (inputs.length > 0) {
        // Use the document body as a pseudo-mcqView to trigger the generic extraction in ui.js
        mcqViewElements = [document.body];
        console.log("NetAcad Scraper: Falling back to generic input extraction.");
      }
    }

    if (mcqViewElements.length === 0) {
      earlyExitReason = "No mcq-view or generic quiz inputs found.";
    }
  } catch (e) {
    earlyExitReason = "Exception during quiz extraction.";
    console.error(`NetAcad Scraper (scraper.js): ${earlyExitReason}`, e);
  }

  if (currentAttempt === 1) {
    document.querySelectorAll(".netacad-ai-assistant-ui[id^='netacad-ai-q-']").forEach((el) => el.remove());
    mcqViewElements.forEach((mcqView) => {
      if (mcqView && mcqView.shadowRoot) {
        mcqView.shadowRoot.querySelectorAll(".netacad-ai-assistant-ui[id^='netacad-ai-q-']").forEach((el) => el.remove());
      }
    });
  }

  if (mcqViewElements.length === 0) {
    let logMessage = `NetAcad Scraper (scraper.js): Attempt #${currentAttempt}: No mcq-view elements found.`;
    if (earlyExitReason) logMessage += ` Reason: ${earlyExitReason}`;
    else if (currentAttempt === 1) logMessage += ` Shadow DOM traversal completed, but no mcq-view tags were identified.`;
    console.debug(logMessage);

    if (currentAttempt < MAX_SCRAPE_ATTEMPTS) {
      console.debug(`NetAcad Scraper (scraper.js): Will retry in ${SCRAPE_RETRY_DELAY_MS / 1000}s...`);
      setTimeout(() => { window.scrapeData && window.scrapeData(currentAttempt + 1); }, SCRAPE_RETRY_DELAY_MS);
      return false;
    }
    console.warn(`NetAcad Scraper (scraper.js): Max retry attempts reached. Failed to find mcq-view elements.`);
    if (window.netAcadBotState) window.netAcadBotState.isProcessingQuiz = false; // Unlock on failure
    return false;
  }

  console.debug(
    `NetAcad Scraper (scraper.js): Found ${mcqViewElements.length} mcq-view element(s). Attempting to process...`
  );

  if (!apiKey) {
    console.warn("NetAcad Scraper (scraper.js): Gemini API Key not found. Displaying message in UI.");
    for (const [index, mcqViewElement] of mcqViewElements.entries()) {
      // The third argument to processSingleQuestion is apiKey, the fourth is preFetchedAiAnswer
      await processSingleQuestion(mcqViewElement, index, null, "Error: Gemini API Key not set in popup.");
    }
    return true; // Processed (by showing error)
  }

  const allQuestionsData = [];
  for (const [index, mcqViewElement] of mcqViewElements.entries()) {
    // extractQuestionAndAnswers is in ui.js and should be globally available.
    // It returns { questionText, answerElements, questionTextElement }
    if (typeof extractQuestionAndAnswers !== 'function') {
      console.error("NetAcad Scraper (scraper.js): extractQuestionAndAnswers function is not available!");
      // Fallback: process each question individually with an error message, or just skip UI update
      await processSingleQuestion(mcqViewElement, index, apiKey, "Error: Core UI function (extract) missing.");
      continue;
    }
    const extractionResult = extractQuestionAndAnswers(mcqViewElement, index);
    const answerTexts = processAnswerElements(extractionResult.answerElements, index);

    if (extractionResult.questionText && !extractionResult.questionText.startsWith("Error") && answerTexts.length > 0) {
      allQuestionsData.push({
        question: extractionResult.questionText,
        answers: answerTexts,
        mcqViewElement: mcqViewElement,
        originalIndex: index,
        questionTextElement: extractionResult.questionTextElement // Needed for UI injection by processSingleQuestion
      });
    } else {
      // If extraction fails for a question, still call processSingleQuestion to render its UI with the error.
      // The error from extractionResult.questionText or lack of answers will be handled by processSingleQuestion.
      console.warn(`NetAcad Scraper (scraper.js): Failed to extract valid Q&A for question ${index + 1}. Will let processSingleQuestion handle UI error.`);
      await processSingleQuestion(mcqViewElement, index, apiKey, extractionResult.questionText); // Pass the extraction error
    }
  }

  if (allQuestionsData.length > 0) {
    console.debug(`NetAcad Scraper (scraper.js): Extracted ${allQuestionsData.length} valid questions for batch API call.`);
    const questionsForBatchApi = allQuestionsData.map(q => ({ question: q.question, answers: q.answers }));

    // Call processSingleQuestion for each item to set up initial UI (e.g., "Processing batch...")
    // BEFORE making the batch API call.
    for (const questionData of allQuestionsData) {
      // Pass a specific message to indicate batch processing is starting
      // processSingleQuestion will need to handle this initial state message.
      await processSingleQuestion(questionData.mcqViewElement, questionData.originalIndex, apiKey, "BATCH_PROCESSING_STARTED");
    }

    const batchApiResponse = await getAiAnswersForBatch(questionsForBatchApi, apiKey);
    let batchedAnswers = [];
    let batchError = null;

    if (batchApiResponse.error) {
      console.error("NetAcad Scraper (scraper.js): Error from batch API call:", batchApiResponse.error);
      batchError = batchApiResponse.error;

      // Show API error prominently in the dev overlay
      const errMsg = batchApiResponse.error || "Unknown API error";
      let shortErr = errMsg;
      if (errMsg.toLowerCase().includes('quota') || errMsg.includes('429')) shortErr = '⛔ API Quota Exceeded!';
      else if (errMsg.includes('401') || errMsg.toLowerCase().includes('api key')) shortErr = '🔑 Invalid API Key!';
      else if (errMsg.includes('503') || errMsg.toLowerCase().includes('overload')) shortErr = '😵 API Overloaded — Retrying...';
      else if (errMsg.toLowerCase().includes('network') || errMsg.toLowerCase().includes('connect')) shortErr = '📡 No Internet / API Unreachable';
      else shortErr = '⚠️ API Error: ' + errMsg.substring(0, 60);

      if (typeof updateDevOverlay === 'function') updateDevOverlay('❌ API Error', shortErr);

      // Unlock bot state so it doesn't freeze
      if (window.netAcadBotState) {
        window.netAcadBotState.isProcessingQuiz = false;
        window.netAcadBotState.lastQuizProcessedAt = 0;
      }
      // Reset scrape URL after 15s so it retries the same question
      setTimeout(() => {
        if (typeof botLastScrapeUrl !== 'undefined') window.netAcadBotResetScrapeUrl && window.netAcadBotResetScrapeUrl();
        console.log("NetAcad Scraper: 🔁 Retrying question after API error...");
      }, 15000);
    } else if (batchApiResponse.answers && batchApiResponse.answers.length === allQuestionsData.length) {
      batchedAnswers = batchApiResponse.answers;
      console.debug("NetAcad Scraper (scraper.js): Successfully received batched answers.");
    } else {
      console.error("NetAcad Scraper (scraper.js): Mismatch in batched answers length or no answers received.");
      batchError = "Error: AI response for batch was incomplete or malformed.";
      if (batchApiResponse.answers) batchedAnswers = batchApiResponse.answers; // Use partial if available
    }

    // Now, update each UI with its specific answer or the batch error
    for (let i = 0; i < allQuestionsData.length; i++) {
      const questionData = allQuestionsData[i];
      let finalAnswerToShow = batchError ? batchError : (batchedAnswers[i] || "Error: No specific answer in batch response.");
      // Re-call processSingleQuestion or a dedicated update function. 
      // For simplicity, re-calling processSingleQuestion with the fetched answer.
      // It will re-extract, but then display the provided answer.
      // A more optimized way would be to have a separate UI update function.
      await processSingleQuestion(questionData.mcqViewElement, questionData.originalIndex, apiKey, finalAnswerToShow);
    }
  } else {
    console.debug("NetAcad Scraper (scraper.js): No valid questions extracted to send for batch processing.");
    // If there were mcqViewElements but none yielded valid Q&A, their UIs would have been handled
    // in the extraction loop above, displaying individual extraction errors via processSingleQuestion.
  }

  // UNLOCK the bot loop — quiz has been fully processed and answers selected
  if (window.netAcadBotState) {
    window.netAcadBotState.isProcessingQuiz = false;
    window.netAcadBotState.lastQuizProcessedAt = Date.now();
    console.debug("NetAcad Scraper: 🔓 Bot state UNLOCKED (isProcessingQuiz = false). Answers have been selected.");
  }

  return true;
} 