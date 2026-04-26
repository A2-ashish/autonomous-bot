// ─────────────────────────────────────────────
// KEY & MODEL ROTATION HELPERS
// ─────────────────────────────────────────────

async function getActiveModelUrl() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["aiModel"], (result) => {
      const model = result.aiModel || "gemini-3.1-flash";
      resolve(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
    });
  });
}

// Returns the currently active API key (string) or null if none configured
async function getActiveApiKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["geminiApiKeys", "currentKeyIndex", "geminiApiKey"], (result) => {
      const keys = result.geminiApiKeys || (result.geminiApiKey ? [result.geminiApiKey] : []);
      const idx = result.currentKeyIndex || 0;
      if (keys.length === 0) return resolve(null);
      resolve({ key: keys[idx] || keys[0], index: idx, total: keys.length });
    });
  });
}

// Rotates to the next key. Returns the new key info, or null if all exhausted.
async function rotateToNextKey() {
  return new Promise(resolve => {
    chrome.storage.sync.get(["geminiApiKeys", "currentKeyIndex", "geminiApiKey"], (result) => {
      const keys = result.geminiApiKeys || (result.geminiApiKey ? [result.geminiApiKey] : []);
      if (keys.length <= 1) return resolve(null); // Only one key, can't rotate

      const currentIdx = result.currentKeyIndex || 0;
      const nextIdx = (currentIdx + 1) % keys.length;

      chrome.storage.sync.set({ currentKeyIndex: nextIdx }, () => {
        console.log(`NetAcad API: 🔄 Rotated to API key #${nextIdx + 1} of ${keys.length}`);
        if (typeof updateDevOverlay === 'function') {
          updateDevOverlay('🔄 Key Rotated', `Switched to key #${nextIdx + 1} of ${keys.length}`);
        }
        resolve({ key: keys[nextIdx], index: nextIdx, total: keys.length });
      });
    });
  });
}

// ─────────────────────────────────────────────
// SINGLE QUESTION — with auto-rotation on 429
// ─────────────────────────────────────────────

async function getAiAnswer(question, answers, apiKey = null, attemptCount = 0) {
  // If no key passed, read from storage (supports rotation)
  let keyInfo = null;
  if (!apiKey) {
    keyInfo = await getActiveApiKey();
    if (!keyInfo) {
      console.error("Error: No Gemini API Keys configured.");
      return "Error: Gemini API Key not available. Please set it in the extension popup.";
    }
    apiKey = keyInfo.key;
  }

  let prompt = `Given the following multiple-choice question and its possible answers, please choose the best answer(s).
If the question implies multiple correct answers (e.g., 'select all that apply', 'choose N correct options'), return ALL chosen answer texts, each on a new line.
Otherwise, if it's a single-choice question, return only the text of the single best chosen answer option.
Do not add any extra explanation or leading text like "The best answer is: ".

Question:
${question}

Possible Answers:
`;
  answers.forEach((ans, i) => {
    prompt += `${i + 1}. ${ans}\n`;
  });

  try {
    const apiUrl = await getActiveModelUrl();
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    // Auto-rotate on quota/rate limit errors
    if (response.status === 429 || response.status === 403) {
      let apiReason = "";
      try {
        const errorData = await response.clone().json();
        apiReason = errorData.error && errorData.error.message ? errorData.error.message : JSON.stringify(errorData);
      } catch (e) {
        apiReason = await response.clone().text();
      }
      console.warn(`NetAcad API: ⚠️ Key quota hit (${response.status}). Reason: ${apiReason}. Rotating key...`);
      
      const freshKeyInfo = await getActiveApiKey();
      const totalKeys = freshKeyInfo ? freshKeyInfo.total : 1;
      
      if (attemptCount < totalKeys - 1) {
        const newKeyInfo = await rotateToNextKey();
        if (newKeyInfo) {
          return getAiAnswer(question, answers, null, attemptCount + 1); // Pass null for key so it fetches the new rotated key
        }
      }
      
      const errorContext = response.status === 403 ? "Access Forbidden / Key Invalid" : "Rate Limit / Quota Exceeded";
      return `Error: ${response.status} All API keys exhausted. ${errorContext} on all ${totalKeys} key(s). Last API message: ${apiReason}`;
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Error:", errorData);
      return `Error calling Gemini API: ${response.status} ${response.statusText}.`;
    }

    const data = await response.json();
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text.trim();
    } else {
      console.error("Unexpected response structure from Gemini API:", data);
      return "Error: Could not extract answer from Gemini response structure.";
    }
  } catch (error) {
    console.error("Error fetching from Gemini API:", error);
    return "Error connecting to Gemini API. Check console for details.";
  }
}

// ─────────────────────────────────────────────
// BATCH QUESTIONS — with auto-rotation on 429
// ─────────────────────────────────────────────

async function getAiAnswersForBatch(questionsDataArray, apiKey = null, attemptCount = 0) {
  // If no key passed, read from storage
  let keyInfo = null;
  if (!apiKey) {
    keyInfo = await getActiveApiKey();
    if (!keyInfo) {
      return { error: "Error: Gemini API Key not available. Please set it in the extension popup." };
    }
    apiKey = keyInfo.key;
  }

  if (!questionsDataArray || questionsDataArray.length === 0) {
    console.debug("getAiAnswersForBatch: No questions provided.");
    return { answers: [] };
  }

  let prompt =
    "You will be provided with a JSON array of multiple-choice questions. For each question, choose the best answer(s) from its 'Possible Answers'.\n";
  prompt +=
    "If a question implies multiple correct answers (e.g., 'select all that apply', 'choose N correct options'), include all correct answer texts for that question concatenated into a single string, separated by ' /// ' (space, three forward slashes, space). Example: 'Answer A /// Answer C'.\n";
  prompt +=
    "Otherwise, if it's a single-choice question, return just the single best answer text as the string for that question.\n";
  prompt +=
    "Return a single JSON array of strings, where each string is the processed answer for the corresponding question in the input array. Do not add any extra explanation or leading/trailing text.\n";
  prompt +=
    'For example, if the input is two questions (Q1 single-choice, Q2 multi-choice requiring two answers), your output should be a JSON array like: ["Text of answer for Q1", "Text of answer A for Q2 /// Text of answer B for Q2"].\n\n';
  prompt += "Here are the questions:\n```json\n";

  const questionsForPrompt = questionsDataArray.map((q, index) => ({
    id: `question_${index + 1}`,
    question_text: q.question,
    possible_answers: q.answers,
  }));

  prompt += JSON.stringify(questionsForPrompt, null, 2);
  prompt += "\n```";

  try {
    const apiUrl = await getActiveModelUrl();
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    });

    // Auto-rotate on quota/rate limit errors
    if (response.status === 429 || response.status === 403) {
      let apiReason = "";
      try {
        const errorData = await response.clone().json();
        apiReason = errorData.error && errorData.error.message ? errorData.error.message : JSON.stringify(errorData);
      } catch (e) {
        apiReason = await response.clone().text();
      }
      console.warn(`NetAcad API: ⚠️ Batch key quota hit (${response.status}). Reason: ${apiReason}. Rotating key...`);
      
      const freshKeyInfo = await getActiveApiKey();
      const totalKeys = freshKeyInfo ? freshKeyInfo.total : 1;
      
      if (attemptCount < totalKeys - 1) {
        const newKeyInfo = await rotateToNextKey();
        if (newKeyInfo) {
          // Add a small delay between rotations if it's 429 to avoid hammering the APIs simultaneously
          await new Promise(r => setTimeout(r, 1000));
          return getAiAnswersForBatch(questionsDataArray, null, attemptCount + 1); // Pass null to fetch rotated key
        }
      }
      
      const errorContext = response.status === 403 ? "Access Forbidden / Key Invalid" : "Rate Limit / Quota Exceeded";
      return { error: `Error: ${response.status} All API keys exhausted. ${errorContext} on all ${totalKeys} key(s). Last API message: ${apiReason}` };
    }

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Gemini API Batch Error:", errorData);
      return {
        error: `Error calling Gemini API: ${response.status} ${response.statusText}. Details: ${JSON.stringify(errorData)}`,
      };
    }

    const data = await response.json();

    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      const rawResponseText = data.candidates[0].content.parts[0].text;
      console.debug("Gemini API Batch Raw Response Text:", rawResponseText);
      try {
        const parsedAnswers = JSON.parse(rawResponseText);
        if (
          Array.isArray(parsedAnswers) &&
          parsedAnswers.every((ans) => typeof ans === "string")
        ) {
          if (parsedAnswers.length === questionsDataArray.length) {
            return { answers: parsedAnswers };
          } else {
            console.error("Gemini API Batch Error: Answer count mismatch.", parsedAnswers);
            return { error: "Error: Mismatch in number of answers from AI.", answers: parsedAnswers };
          }
        } else {
          console.error("Gemini API Batch Error: Response is not a JSON array of strings.", parsedAnswers);
          return { error: "Error: AI response was not a valid JSON array of answer strings." };
        }
      } catch (e) {
        console.error("Gemini API Batch Error: Failed to parse AI response as JSON.", rawResponseText, e);
        return { error: "Error: Could not parse AI response for batch. Raw: " + rawResponseText };
      }
    } else {
      console.error("Unexpected response structure from Gemini API for batch:", data);
      return { error: "Error: Could not extract answers from Gemini batch response structure." };
    }
  } catch (error) {
    console.error("Error fetching from Gemini API for batch:", error);
    return { error: "Error connecting to Gemini API for batch. Check console." };
  }
}
