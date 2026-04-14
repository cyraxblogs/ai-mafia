import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'dist')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const BASE_URL        = 'https://api.commonstack.ai/v1/chat/completions';
const MODELS_URL      = 'https://api.commonstack.ai/v1/models';
const VALIDATION_MODEL = 'anthropic/claude-haiku-4-5';

// ── NO FALLBACK SYSTEM — models either work or they surface an error ──────────
// Every model is called directly. If it errors, the game gets the error event
// and logs it. No silent substitution. No gpt-4o-mini replacing broken models.
// This makes failures visible so they can actually be fixed.

function sseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
}

// ── Validate API key ──────────────────────────────────────────────────────────
app.post('/api/validate-key', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey.trim().length < 8)
    return res.json({ valid: false, error: 'Please enter your Commonstack API key.' });
  try {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VALIDATION_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 401)
      return res.json({ valid: false, error: 'Invalid API key. Check it at commonstack.ai' });
    // 429 is not always "out of credits" — providers also use it for rate limits / temporary throttling.
    if (response.status === 429) {
      const txt = await response.text().catch(() => '');
      const lower = txt.toLowerCase();
      const looksLikeCredits =
        lower.includes('account limit exceeded') ||
        lower.includes('insufficient balance') ||
        lower.includes('insufficient credits') ||
        lower.includes('out of credits');
      return looksLikeCredits
        ? res.json({ valid: false, error: 'INSUFFICIENT_CREDITS' })
        : res.json({ valid: true });
    }
    // 404 = model not found on this account (key is still valid)
    if (response.status === 404) return res.json({ valid: true });
    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      console.warn(`[validate-key] status ${response.status}: ${txt.slice(0,120)}`);
      return res.json({ valid: true }); // assume key valid, error is model-side
    }
    return res.json({ valid: true });
  } catch (e) {
    console.error('[validate-key] Exception:', e.message);
    // Fail open on transient network/DNS hiccups so the game can still try to start.
    // Real auth/model errors will still surface on the actual game calls.
    return res.json({ valid: true, warning: 'VALIDATION_SKIPPED_NETWORK' });
  }
});

// ── Fetch live model list ─────────────────────────────────────────────────────
const _modelCache = new Map();
const MODEL_CACHE_TTL = 5 * 60 * 1000;

app.post('/api/models', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) return res.json({ error: 'Missing apiKey', models: [] });

  const cached = _modelCache.get(apiKey);
  if (cached && Date.now() - cached.ts < MODEL_CACHE_TTL)
    return res.json({ models: cached.models });

  try {
    const response = await fetch(MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      console.warn(`[models] status ${response.status}`);
      return res.json({ models: [] });
    }
    const data = await response.json();
    const models = (data.data || []).map(m => m.id).filter(Boolean);
    _modelCache.set(apiKey, { ts: Date.now(), models });
    return res.json({ models });
  } catch (e) {
    console.error('[models] Exception:', e.message);
    return res.json({ models: [] });
  }
});

// ── Message normalisation ─────────────────────────────────────────────────────
// Commonstack says "Standard parameters, no surprises. Your existing prompts
// and configurations work as-is." — all modern models support the system role.
// However a few edge cases need special handling:
//   1. Empty string system prompts → some providers return 400. Strip them.
//   2. GLM / MiniMax occasionally misfire with a standalone empty system message.
//   3. Qwen3-coder: fine as-is, treated like standard Qwen3.
function normaliseMessages(model, msgs) {
  // Strip any message that has empty/whitespace-only content to avoid provider 400s
  const cleaned = msgs.filter(m => m.content && m.content.trim().length > 0);
  // If we stripped the system message and have only a user message, that's fine.
  // If we somehow ended up with nothing, fall back to original.
  return cleaned.length > 0 ? cleaned : msgs;
}

// ── o-series parameter stripping ─────────────────────────────────────────────
// OpenAI o1/o3/o4 reject the `temperature` param (they control sampling internally).
// Through Commonstack proxy, sending temperature to o-series causes a 400 error.
// ALL gpt-5.4 variants (base, mini, nano) also reject temperature.
// NOTE: x-ai/grok-4.1-fast-reasoning is NOT o-series — it accepts temperature.
const O_SERIES_PREFIXES = [
  'openai/o1', 'openai/o3', 'openai/o4',
  'openai/gpt-5.4',   // covers gpt-5.4-2026-03-05, gpt-5.4-mini-2026-03-17, gpt-5.4-nano-2026-03-17
];
const TEMPERATURELESS_PREFIXES = [
  ...O_SERIES_PREFIXES,
  'minimax/',
];

// ── max_completion_tokens models ──────────────────────────────────────────────
// Newer OpenAI models (ALL gpt-5.4 variants and o-series) reject `max_tokens` with:
//   "this model is not supported MaxTokens, please use MaxCompletionTokens"
// We rename the param for these slugs before sending to the API.
// FIX: was only 'openai/gpt-5.4-2026-03-05' (base slug) — mini and nano variants
//      have different date suffixes (-03-17) so they never matched, still sending
//      max_tokens and getting 400s. Broadened to 'openai/gpt-5.4' prefix instead.
const MAX_COMPLETION_TOKENS_PREFIXES = [
  'openai/gpt-5.4',   // covers base, mini, and nano
  'openai/o1', 'openai/o3', 'openai/o4',
];

function usesMaxCompletionTokens(model) {
  const slug = model.toLowerCase();
  return MAX_COMPLETION_TOKENS_PREFIXES.some(p => slug.startsWith(p));
}

function isMaxTokensCompatibilityError(text = '') {
  const lower = String(text).toLowerCase();
  return (
    lower.includes('this model is not supported maxtokens') ||
    lower.includes('please use maxcompletiontokens') ||
    (lower.includes('maxtokens') && lower.includes('maxcompletiontokens'))
  );
}

function stripParamsForModel(model, params) {
  const slug = model.toLowerCase();
  let result = { ...params };

  // Strip temperature for o-series / temperatureless models
  if (TEMPERATURELESS_PREFIXES.some(p => slug.startsWith(p))) {
    const { temperature, ...rest } = result;
    result = rest;
  }

  // Rename max_tokens → max_completion_tokens for newer OpenAI models
  if (MAX_COMPLETION_TOKENS_PREFIXES.some(p => slug.startsWith(p)) && 'max_tokens' in result) {
    const { max_tokens, ...rest } = result;
    result = { ...rest, max_completion_tokens: max_tokens };
  }

  return result;
}

// ── Token budget ──────────────────────────────────────────────────────────────
// Thinking/reasoning models emit <think> CoT BEFORE the actual answer.
// If max_tokens is too low, the model burns all tokens on CoT and returns nothing.
// Fix: large budgets for thinking models so there's room for the actual answer.
const THINKING_MODEL_SLUGS = [
  'kimi-k2',          // moonshotai/kimi-k2-thinking, kimi-k2.5, kimi-k2-0905
  'deepseek-r1',      // deepseek/deepseek-r1-0528
  'deepseek-r2',      // deepseek/deepseek-r2 (if re-added)
  'qwq',              // Qwen QwQ series
  'qvq',              // Qwen QVQ series
  'fast-reasoning',   // x-ai/grok-4.1-fast-reasoning — reasoning model, needs token room
  'qwen3',            // qwen3.5-397b, qwen3-vl-235b, qwen3-coder-480b all emit <think>
  'glm-5',            // zai-org/glm-5 and glm-5-turbo wrap answer in <think>…</think>
  'glm-4',            // zai-org/glm-4.7 same behaviour
  'gemini-3.1-pro',   // gemini-3.1-pro-preview is a reasoning model — burns budget on CoT
                      // without 2048 token budget it exhausts tokens before answering
  'minimax',          // MiniMax models need larger token budget for safety-framed prompts
                      // Their content filtering can cause re-generation, burning tokens
];

// Large MoE / very big models — need extended timeouts (90s per commonstack reference)
// Also includes kimi-k2-thinking which generates long CoT before answering
const LARGE_MODEL_SLUGS = [
  '235b',           // qwen/qwen3-vl-235b-a22b-instruct
  '397b',           // qwen/qwen3.5-397b-a17b
  '480b',           // qwen/qwen3-coder-480b-a35b-instruct
  'kimi-k2-thinking', // moonshotai/kimi-k2-thinking — very long CoT, needs 90s
];

function isThinkingModel(model) {
  const slug = model.toLowerCase();
  return THINKING_MODEL_SLUGS.some(s => slug.includes(s));
}
function isLargeModel(model) {
  const slug = model.toLowerCase();
  return LARGE_MODEL_SLUGS.some(s => slug.includes(s));
}

function getMaxTokens(model, baseTokens = 150) {
  if (isThinkingModel(model)) return 2048; // room for CoT + answer
  if (isLargeModel(model))    return 1024; // large MoE needs breathing room
  return baseTokens;
}

function getModelTimeout(model, baseTimeout = 35000) {
  if (isLargeModel(model)) {
    console.log(`[timeout] 90s for large model: ${model}`);
    return 90000;
  }
  if (isThinkingModel(model)) return 60000; // thinking needs time to reason
  return baseTimeout;
}

// ── Error detection using Commonstack's actual format ─────────────────────────
// Commonstack error format (from their docs):
//   { "code": 429, "message": "...", "data": {} }
// NOT the OpenAI format { error: { message, type, code } }
// 429 = "Account limit exceeded (insufficient balance)"
// 404 = "Model not found or inactive"
// 401 = "Unauthorized (invalid or missing access key)"
// 500 = "Internal server error or provider error"
function parseCommonStackError(status, bodyText) {
  let parsed = null;
  try { parsed = JSON.parse(bodyText); } catch {}
  const msg = typeof parsed?.message === 'string' ? parsed.message.toLowerCase() : '';

  const isCredits =
    (status === 429 || parsed?.code === 429) && (
      msg.includes('account limit exceeded') ||
      msg.includes('insufficient balance') ||
      msg.includes('insufficient credits') ||
      msg.includes('out of credits')
    );

  const isNotFound = status === 404 || parsed?.code === 404;
  const isAuth     = status === 401 || parsed?.code === 401;

  return {
    isCredits,
    isNotFound,
    isAuth,
    message: parsed?.message || bodyText.slice(0, 200) || `HTTP ${status}`,
    code: parsed?.code || status,
  };
}

// ── Direct fetch — no fallback ────────────────────────────────────────────────
// Calls the model directly. If it fails, returns the response so the caller
// can surface a real error to the game instead of silently swapping models.
async function fetchDirect(apiKey, model, messages, extraParams = {}, timeoutMs = 30000) {
  const normMessages = normaliseMessages(model, messages);
  const cleanParams  = stripParamsForModel(model, extraParams);
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  const doFetch = (params) => fetch(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages: normMessages, ...params }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  console.log(`[api] ${model} | timeout:${timeoutMs}ms | tokens:${cleanParams.max_tokens ?? cleanParams.max_completion_tokens} | stream:${cleanParams.stream}`);

  let response = await doFetch(cleanParams);
  if (!response.ok && usesMaxCompletionTokens(model)) {
    const firstErrorText = await response.text().catch(() => '');
    if (isMaxTokensCompatibilityError(firstErrorText)) {
      const retryTokens = cleanParams.max_completion_tokens ?? cleanParams.max_tokens ?? extraParams.max_tokens;
      if (retryTokens != null) {
        const compatParams = {
          ...cleanParams,
          maxCompletionTokens: retryTokens,
        };
        delete compatParams.max_tokens;
        delete compatParams.max_completion_tokens;
        console.warn(`[api] ${model} rejected token param — retrying with maxCompletionTokens compatibility key`);
        response = await doFetch(compatParams);
        if (!response.ok) {
          const retryErrorText = await response.text().catch(() => '');
          return new Response(retryErrorText, {
            status: response.status,
            statusText: response.statusText,
            headers: new Headers(response.headers),
          });
        }
        return response;
      }
    }

    return new Response(firstErrorText, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });
  }

  return response;
}

// ── Strip <think>…</think> and <thinking>…</thinking> from complete text ───────
// DeepSeek R1 / Qwen3 use <think>. Some GLM / other models use <thinking>.
// Strip both so no CoT ever leaks through ai-decide (non-streaming) responses.
function stripThinkingFromContent(text) {
  if (!text) return '';
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  out = out.replace(/<think>[\s\S]*/i, '');
  out = out.replace(/<thinking>[\s\S]*/i, '');
  return out.trim();
}

// ── SSE stripper — strips CoT tags across streaming chunks ───────────────────
// Handles both <think>…</think> (DeepSeek R1, Qwen3) and
// <thinking>…</thinking> (some GLM / other model variants).
// Works across chunk boundaries by buffering partial tag matches.
function makeThinkStripper() {
  let insideThink = false;
  let tagBuf = '';

  // All tag variants we suppress
  const OPEN_TAGS  = ['<think>', '<thinking>'];
  const CLOSE_TAGS = ['</think>', '</thinking>'];

  function findFirstTag(text, pos, tags) {
    let earliest = -1, matchedTag = null;
    for (const tag of tags) {
      const idx = text.toLowerCase().indexOf(tag, pos);
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx; matchedTag = tag;
      }
    }
    return { idx: earliest, tag: matchedTag };
  }

  function hasPartialSuffix(text, tags) {
    // Check if the text ends with a prefix of any of the given tags
    for (const tag of tags) {
      for (let pLen = Math.min(text.length, tag.length - 1); pLen >= 1; pLen--) {
        if (text.toLowerCase().endsWith(tag.slice(0, pLen))) return pLen;
      }
    }
    return 0;
  }

  return function strip(token) {
    if (token === '' && tagBuf) {
      const flushed = tagBuf; tagBuf = '';
      return insideThink ? '' : flushed;
    }
    let out = '';
    let i = 0;
    const text = tagBuf + token;
    tagBuf = '';

    while (i < text.length) {
      if (insideThink) {
        const { idx: closeIdx, tag: closeTag } = findFirstTag(text, i, CLOSE_TAGS);
        if (closeIdx !== -1) {
          insideThink = false;
          i = closeIdx + closeTag.length;
        } else {
          const tail = text.slice(i);
          const pLen = hasPartialSuffix(tail, CLOSE_TAGS);
          if (pLen) tagBuf = tail.slice(tail.length - pLen);
          break;
        }
      } else {
        const { idx: openIdx, tag: openTag } = findFirstTag(text, i, OPEN_TAGS);
        if (openIdx === -1) {
          const tail = text.slice(i);
          const pLen = hasPartialSuffix(tail, OPEN_TAGS);
          if (pLen) {
            out += tail.slice(0, tail.length - pLen);
            tagBuf = tail.slice(tail.length - pLen);
          } else {
            out += tail;
          }
          break;
        } else {
          out += text.slice(i, openIdx);
          insideThink = true;
          i = openIdx + openTag.length;
        }
      }
    }
    return out;
  };
}

// ── SSE separator — emits thinking/answer as distinct event types (spectator) ─
function makeThinkSeparator() {
  let insideThink = false;
  let tagBuf = '';

  return function separate(token) {
    const events = [];
    let i = 0;
    const text = tagBuf + token;
    tagBuf = '';

    while (i < text.length) {
      if (insideThink) {
        const closeIdx = text.toLowerCase().indexOf('</think>', i);
        if (closeIdx !== -1) {
          const chunk = text.slice(i, closeIdx);
          if (chunk) events.push({ type: 'thinking', text: chunk });
          insideThink = false;
          i = closeIdx + '</think>'.length;
        } else {
          const tail = text.slice(i);
          const partialClose = '</think>'.slice(0, -1);
          let foundPartial = false;
          for (let pLen = Math.min(tail.length, partialClose.length); pLen >= 1; pLen--) {
            if (tail.toLowerCase().endsWith(partialClose.slice(0, pLen))) {
              const chunk = tail.slice(0, tail.length - pLen);
              if (chunk) events.push({ type: 'thinking', text: chunk });
              tagBuf = tail.slice(tail.length - pLen);
              foundPartial = true;
              break;
            }
          }
          if (!foundPartial && tail) events.push({ type: 'thinking', text: tail });
          break;
        }
      } else {
        const openIdx = text.toLowerCase().indexOf('<think>', i);
        if (openIdx === -1) {
          const tail = text.slice(i);
          const partialOpen = '<think>';
          let foundPartial = false;
          for (let pLen = Math.min(tail.length, partialOpen.length - 1); pLen >= 1; pLen--) {
            if (tail.toLowerCase().endsWith(partialOpen.slice(0, pLen))) {
              const chunk = tail.slice(0, tail.length - pLen);
              if (chunk) events.push({ type: 'answer', text: chunk });
              tagBuf = tail.slice(tail.length - pLen);
              foundPartial = true;
              break;
            }
          }
          if (!foundPartial && tail) events.push({ type: 'answer', text: tail });
          break;
        } else {
          const chunk = text.slice(i, openIdx);
          if (chunk) events.push({ type: 'answer', text: chunk });
          insideThink = true;
          i = openIdx + '<think>'.length;
        }
      }
    }
    return events;
  };
}

// ── AI Chat — SSE streamed ────────────────────────────────────────────────────
app.post('/api/ai-speak', async (req, res) => {
  sseHeaders(res);
  const { apiKey, model, systemPrompt, userMessage, showThinking } = req.body;
  if (!apiKey || !model) {
    res.write(`data: ${JSON.stringify({ error: 'Missing parameters' })}\n\n`);
    return res.end();
  }
  try {
    const messages = [
      { role: 'system', content: systemPrompt || '' },
      { role: 'user',   content: userMessage  || '' },
    ];
    const timeoutMs = getModelTimeout(model, 60000);
    const params = { max_tokens: getMaxTokens(model, 150), temperature: 0.85, stream: true };

    console.log(`[ai-speak] ${model} | timeout:${timeoutMs}ms | showThinking:${!!showThinking}`);

    const response = await fetchDirect(apiKey, model, messages, params, timeoutMs);

    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      const err = parseCommonStackError(response.status, txt);
      console.error(`[ai-speak] Error ${err.code} from ${model}: ${err.message}`);
      const errCode = err.isCredits ? 'INSUFFICIENT_CREDITS'
                    : err.isNotFound ? `MODEL_NOT_FOUND:${model}`
                    : err.isAuth    ? 'INVALID_API_KEY'
                    : `API_ERROR_${err.code}`;
      res.write(`data: ${JSON.stringify({ error: errCode })}\n\n`);
      return res.end();
    }

    // ── Stream the response ───────────────────────────────────────────────────
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    const sepFn   = showThinking ? makeThinkSeparator() : null;
    const stripFn = showThinking ? null : makeThinkStripper();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush any remaining buffered line that lacked a trailing newline
        if (buffer.startsWith('data: ')) {
          const data = buffer.slice(6).trim();
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              // delta.content = actual answer. delta.reasoning_content = raw CoT (no tags)
              // — must NEVER reach the chat as speech tokens; the stripper can't catch it.
              const raw          = parsed.choices?.[0]?.delta?.content
                                ?? parsed.choices?.[0]?.message?.content ?? null;
              const reasoningRaw = parsed.choices?.[0]?.delta?.reasoning_content ?? null;
              if (showThinking) {
                if (reasoningRaw) res.write(`data: ${JSON.stringify({ thinking: reasoningRaw })}\n\n`);
                if (raw != null && raw !== '') {
                  const events = sepFn(raw);
                  for (const ev of events) {
                    if (ev.type === 'thinking' && ev.text)
                      res.write(`data: ${JSON.stringify({ thinking: ev.text })}\n\n`);
                    else if (ev.type === 'answer' && ev.text)
                      res.write(`data: ${JSON.stringify({ token: ev.text })}\n\n`);
                  }
                }
              } else {
                // Normal mode: only stream delta.content. reasoning_content is silently
                // dropped — it is CoT, not speech. Strip any <think>/<thinking> tags too.
                if (raw != null && raw !== '') {
                  const tail = stripFn('') + stripFn(raw);
                  if (tail) res.write(`data: ${JSON.stringify({ token: tail })}\n\n`);
                }
              }
            } catch {}
          }
        } else if (!showThinking) {
          // Flush any chars held in tagBuf at end of stream
          const tail = stripFn('');
          if (tail) res.write(`data: ${JSON.stringify({ token: tail })}\n\n`);
        }
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        } else {
          try {
            const parsed = JSON.parse(data);
            // Handle Commonstack error inside SSE stream
            if (parsed.code && parsed.message && !parsed.choices) {
              const err = parseCommonStackError(parsed.code, JSON.stringify(parsed));
              const errCode = err.isCredits ? 'INSUFFICIENT_CREDITS' : `API_ERROR_${parsed.code}`;
              res.write(`data: ${JSON.stringify({ error: errCode })}\n\n`);
              return res.end();
            }
            // delta.content = answer tokens. delta.reasoning_content = raw CoT — no tags,
            // invisible to the stripper. Drop it in normal mode; route to thinking in spectator.
            const raw          = parsed.choices?.[0]?.delta?.content
                              ?? parsed.choices?.[0]?.message?.content ?? null;
            const reasoningRaw = parsed.choices?.[0]?.delta?.reasoning_content ?? null;
            if (showThinking) {
              if (reasoningRaw) res.write(`data: ${JSON.stringify({ thinking: reasoningRaw })}\n\n`);
              if (raw != null && raw !== '') {
                const events = sepFn(raw);
                for (const ev of events) {
                  if (ev.type === 'thinking' && ev.text)
                    res.write(`data: ${JSON.stringify({ thinking: ev.text })}\n\n`);
                  else if (ev.type === 'answer' && ev.text)
                    res.write(`data: ${JSON.stringify({ token: ev.text })}\n\n`);
                }
              }
            } else {
              // Normal mode: only stream delta.content — reasoning_content is silently
              // dropped. It is CoT text without tags; the stripper cannot catch it.
              if (raw != null && raw !== '') {
                const clean = stripFn(raw);
                if (clean) res.write(`data: ${JSON.stringify({ token: clean })}\n\n`);
              }
            }
          } catch {}
        }
      }
    }
  } catch (e) {
    console.error('[speak] Exception:', e.message);
    const errCode = e.name === 'TimeoutError' ? `TIMEOUT:${model}` : e.message;
    res.write(`data: ${JSON.stringify({ error: errCode })}\n\n`);
  }
  res.end();
});

// ── AI Decision — non-streaming ───────────────────────────────────────────────
app.post('/api/ai-decide', async (req, res) => {
  const { apiKey, model, systemPrompt, userMessage } = req.body;
  if (!apiKey || !model)
    return res.json({ error: 'Missing parameters', content: '' });
  try {
    const messages = [
      { role: 'system', content: systemPrompt || '' },
      { role: 'user',   content: userMessage  || '' },
    ];
    const timeoutMs = getModelTimeout(model, 30000);
    const params = { max_tokens: getMaxTokens(model, 150), temperature: 0.7 };

    const response = await fetchDirect(apiKey, model, messages, params, timeoutMs);
    const txt = await response.text().catch(() => '');

    if (!response.ok) {
      const err = parseCommonStackError(response.status, txt);
      console.error(`[ai-decide] Error ${err.code} from ${model}: ${err.message}`);
      const errCode = err.isCredits ? 'INSUFFICIENT_CREDITS'
                    : err.isNotFound ? `MODEL_NOT_FOUND:${model}`
                    : `API_ERROR_${err.code}`;
      return res.json({ error: errCode, content: '' });
    }

    let data;
    try { data = JSON.parse(txt); } catch {
      return res.json({ error: 'JSON_PARSE_ERROR', content: '' });
    }

    const msg = data.choices?.[0]?.message || {};
    const raw = (msg.content || '').trim();
    const content = stripThinkingFromContent(raw);
    if (content) return res.json({ content });

    // If content was empty (some models return tool_calls shape)
    const fallback = msg.tool_calls?.[0]?.function?.arguments ||
                     msg.function_call?.arguments || '';
    return res.json({ content: stripThinkingFromContent(fallback) });
  } catch (e) {
    console.error('[decide] Exception:', e.message);
    const errCode = e.name === 'TimeoutError' ? `TIMEOUT:${model}` : e.message;
    return res.json({ error: errCode, content: '' });
  }
});

const server = createServer(app);
server.listen(PORT, () => console.log(`AI Mafia server → http://localhost:${PORT}`));
