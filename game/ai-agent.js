/**
 * Centralized Commonstack API caller with credit error detection
 * Used by the game engine for all AI interactions
 */

const CREDIT_ERRORS = [
  'insufficient_credits',
  'insufficient credits',
  'quota',
  'billing',
  'rate_limit_exceeded',
];

function isCreditError(statusCode, responseText) {
  if (statusCode === 402 || statusCode === 429) return true;
  if (responseText) {
    const lower = responseText.toLowerCase();
    return CREDIT_ERRORS.some(e => lower.includes(e));
  }
  return false;
}

/**
 * Stream an AI speech response via SSE
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.systemPrompt
 * @param {string} opts.userMessage
 * @param {function} opts.onToken  - called with each token string
 * @param {function} opts.onDone   - called when response complete, receives full text
 * @param {function} opts.onError  - called with error type string
 * @param {number}   opts.timeout  - ms before timeout (default 30000)
 * @returns {function} cancel - call to abort
 */
export function streamAISpeech({ apiKey, model, systemPrompt, userMessage, onToken, onDone, onError, timeout }) {
  let fullText = '';
  let done = false;
  let es = null;
  
  // Extended timeout for large MoE models like Qwen 3.5 397B
  const isLargeMoE = model && (
    model.includes('qwen3.5-397b') || 
    model.includes('qwen3-coder-480b')
  );
  const isThinkingModel = model && (
    model.includes('kimi-k2') ||
    model.includes('deepseek-r1') ||
    model.includes('deepseek-r2') ||
    model.includes('qwq') ||
    model.includes('qvq') ||
    model.includes('o1') ||
    model.includes('o3') ||
    model.includes('minimax')
  );
  const timeoutMs = timeout || (isLargeMoE ? 90000 : isThinkingModel ? 60000 : 35000);
  
  console.log(`[streamAISpeech] Using timeout ${timeoutMs}ms for model: ${model}`);

  const url = `/api/ai-speak?apiKey=${enc(apiKey)}&model=${enc(model)}&systemPrompt=${enc(systemPrompt)}&userMessage=${enc(userMessage)}`;

  const timeoutHandle = setTimeout(() => {
    if (!done) {
      done = true;
      if (es) es.close();
      if (fullText) {
        console.log(`[streamAISpeech] Timeout reached but delivering partial response (${fullText.length} chars)`);
        onDone(fullText);
      } else {
        console.log(`[streamAISpeech] Timeout reached with no response`);
        onError('TIMEOUT');
      }
    }
  }, timeoutMs);

  try {
    es = new EventSource(url);

    es.onmessage = (e) => {
      if (done) return;
      let data;
      try { data = JSON.parse(e.data); } catch { return; }

      if (data.error) {
        done = true;
        es.close();
        clearTimeout(timeoutHandle);
        if (data.error === 'INSUFFICIENT_CREDITS') {
          onError('INSUFFICIENT_CREDITS');
        } else {
          // Still deliver partial text if we have any
          if (fullText) onDone(fullText);
          else onError(data.error);
        }
        return;
      }

      if (data.done) {
        done = true;
        es.close();
        clearTimeout(timeoutHandle);
        onDone(fullText);
        return;
      }

      if (data.token) {
        fullText += data.token;
        onToken(data.token, fullText);
      }
    };

    es.onerror = () => {
      if (!done) {
        done = true;
        es.close();
        clearTimeout(timeoutHandle);
        if (fullText) onDone(fullText);
        else onError('SSE_ERROR');
      }
    };
  } catch (e) {
    done = true;
    clearTimeout(timeoutHandle);
    onError('NETWORK_ERROR');
  }

  // Return cancel function
  return () => {
    if (!done) {
      done = true;
      clearTimeout(timeoutHandle);
      if (es) es.close();
    }
  };
}

/**
 * Make a one-shot AI decision (vote, night action)
 * @param {Object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {string} opts.systemPrompt
 * @param {string} opts.userMessage
 * @returns {Promise<{content: string, error: string|null}>}
 */
export async function aiDecide({ apiKey, model, systemPrompt, userMessage }) {
  try {
    // Extended timeout for large MoE models like Qwen 3.5 397B
    const isLargeMoE = model && (
      model.includes('qwen3.5-397b') || 
      model.includes('qwen3-coder-480b')
    );
    const isThinkingModel = model && (
      model.includes('kimi-k2') ||
      model.includes('deepseek-r1') ||
      model.includes('deepseek-r2') ||
      model.includes('qwq') ||
      model.includes('qvq') ||
      model.includes('o1') ||
      model.includes('o3') ||
      model.includes('minimax')
    );
    const timeoutMs = isLargeMoE ? 90000 : isThinkingModel ? 60000 : 35000;
    
    console.log(`[aiDecide] Using timeout ${timeoutMs}ms for model: ${model}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch('/api/ai-decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model, systemPrompt, userMessage }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (data.error === 'INSUFFICIENT_CREDITS') {
      return { content: '', error: 'INSUFFICIENT_CREDITS' };
    }
    if (data.error) {
      return { content: '', error: data.error };
    }
    return { content: data.content || '', error: null };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { content: '', error: 'TIMEOUT' };
    }
    return { content: '', error: e.message };
  }
}

/**
 * Validate an API key
 * @param {string} apiKey
 * @returns {Promise<{valid: boolean, error: string|null}>}
 */
export async function validateApiKey(apiKey) {
  if (!apiKey || apiKey.trim().length < 8) {
    return { valid: false, error: 'Please enter your Commonstack API key.' };
  }
  try {
    const res = await fetch('/api/validate-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    const data = await res.json();
    return data;
  } catch (e) {
    return { valid: false, error: 'Network error. Is the server running?' };
  }
}

function enc(str) {
  return encodeURIComponent(str || '');
}
