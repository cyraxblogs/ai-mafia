// game/models.js — GROUND TRUTH: all slugs verified directly from Commonstack API
// Last synced: March 2026 from user-provided ALL_MODEL_SLUGS.txt
// RULE: Every slug here must exist EXACTLY as shown. Provider prefix is critical.

export const MODEL_META = {

  // ── OpenAI ────────────────────────────────────────────────────────────────
  'openai/gpt-5.4-2026-03-05':            { displayName: 'GPT-5.4',              color: '#10a37f', key: 'chatgpt'  },
  'openai/gpt-5.4-mini-2026-03-17':       { displayName: 'GPT-5.4 Mini',         color: '#0d9070', key: 'chatgpt'  },
  'openai/gpt-5.4-nano-2026-03-17':       { displayName: 'GPT-5.4 Nano',         color: '#096a50', key: 'chatgpt'  },

  // ── Anthropic ─────────────────────────────────────────────────────────────
  'anthropic/claude-opus-4-7':            { displayName: 'Claude Opus 4.7',      color: '#7a2410', key: 'claude'   },
  'anthropic/claude-opus-4-6':            { displayName: 'Claude Opus 4.6',      color: '#a33a1c', key: 'claude'   },
  'anthropic/claude-sonnet-4-6':          { displayName: 'Claude Sonnet 4.6',    color: '#c45a30', key: 'claude'   },
  'anthropic/claude-sonnet-4-5':          { displayName: 'Claude Sonnet 4.5',    color: '#cc6035', key: 'claude'   },
  'anthropic/claude-haiku-4-5':           { displayName: 'Claude Haiku 4.5',     color: '#D97757', key: 'claude'   },

  // ── Google ────────────────────────────────────────────────────────────────
  'google/gemini-3.1-pro-preview':        { displayName: 'Gemini 3.1 Pro',       color: '#2a75f3', key: 'gemini'   },
  'google/gemini-3-flash-preview':        { displayName: 'Gemini 3 Flash',       color: '#2a8a42', key: 'gemini'   },
  'google/gemini-3.1-flash-lite-preview': { displayName: 'Gemini 3.1 Lite',      color: '#1e7a35', key: 'gemini'   },

  // ── xAI — prefix MUST be x-ai/ (confirmed from Commonstack docs) ─────────
  'x-ai/grok-4.1-fast-reasoning':        { displayName: 'Grok 4.1 Reasoning',   color: '#111111', key: 'grok'     },
  'x-ai/grok-4-1-fast-non-reasoning':    { displayName: 'Grok 4.1 Fast',        color: '#2a2a2a', key: 'grok'     },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  'deepseek/deepseek-v3.2':              { displayName: 'DeepSeek V3.2',        color: '#4D6BFE', key: 'deepseek' },
  'deepseek/deepseek-v3.1':              { displayName: 'DeepSeek V3.1',        color: '#3d5bee', key: 'deepseek' },
  'deepseek/deepseek-r1-0528':           { displayName: 'DeepSeek R1',          color: '#2244cc', key: 'deepseek' },

  // ── Moonshot / Kimi ───────────────────────────────────────────────────────
  'moonshotai/kimi-k2-thinking':         { displayName: 'Kimi K2 Thinking',     color: '#0d0d2b', key: 'kimi'     },
  'moonshotai/kimi-k2.5':                { displayName: 'Kimi K2.5',            color: '#1a1a3e', key: 'kimi'     },
  'moonshotai/kimi-k2-0905':             { displayName: 'Kimi K2',              color: '#252550', key: 'kimi'     },

  // ── Qwen ──────────────────────────────────────────────────────────────────
  'qwen/qwen3.5-397b-a17b':              { displayName: 'Qwen3.5 397B',         color: '#5a28c8', key: 'qwen'     },
  'qwen/qwen3-vl-235b-a22b-instruct':    { displayName: 'Qwen3-VL 235B',        color: '#612b96', key: 'qwen'     },
  'qwen/qwen3-coder-480b-a35b-instruct': { displayName: 'Qwen3 Coder 480B',     color: '#502080', key: 'qwen'     },

  // ── MiniMax ───────────────────────────────────────────────────────────────
  'minimax/minimax-m2.7':                { displayName: 'MiniMax M2.7',         color: '#5a0d96', key: 'minimax'  },
  'minimax/minimax-m2':                  { displayName: 'MiniMax M2',           color: '#4a1080', key: 'minimax'  },
  'minimax/minimax-m2.5':                { displayName: 'MiniMax M2.5',         color: '#3d0d6e', key: 'minimax'  },

  // ── GLM / Zhipu — prefix MUST be zai-org/ (confirmed from Commonstack docs)
  'zai-org/glm-5.1':                    { displayName: 'GLM-5.1',              color: '#2e6ef0', key: 'glm'      },
  'zai-org/glm-5':                       { displayName: 'GLM-5',                color: '#3b5bf5', key: 'glm'      },
  'zai-org/glm-5-turbo':                 { displayName: 'GLM-5 Turbo',          color: '#2a4ae0', key: 'glm'      },
  'zai-org/glm-4.7':                     { displayName: 'GLM-4.7',              color: '#1e3acc', key: 'glm'      },
};

export function buildModelEntry(modelId) {
  const meta = MODEL_META[modelId];
  if (meta) return { modelId, displayName: meta.displayName, color: meta.color, key: meta.key };
  const slug = modelId.split('/').pop();
  const name = slug.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase()).trim();
  return { modelId, displayName: name, color: '#888888', key: 'chatgpt' };
}

// STATIC_MODELS — exact slugs, tiered by cost/capability.
// Used as the pool when live /v1/models fetch fails, and to filter the live list.
export const STATIC_MODELS = {
  budget: [
    'openai/gpt-5.4-nano-2026-03-17',
    'anthropic/claude-haiku-4-5',
    'google/gemini-3-flash-preview',
    'google/gemini-3.1-flash-lite-preview',
    'x-ai/grok-4-1-fast-non-reasoning',
    'deepseek/deepseek-v3.1',
    'deepseek/deepseek-r1-0528',
    'moonshotai/kimi-k2-0905',
    'minimax/minimax-m2.5',
    'zai-org/glm-5-turbo',
  ],
  mid: [
    'openai/gpt-5.4-mini-2026-03-17',
    'anthropic/claude-sonnet-4-5',
    'anthropic/claude-sonnet-4-6',
    'google/gemini-3.1-pro-preview',
    'x-ai/grok-4.1-fast-reasoning',
    'deepseek/deepseek-v3.2',
    'moonshotai/kimi-k2.5',
    'minimax/minimax-m2',
    'zai-org/glm-5',
    'zai-org/glm-4.7',
    'qwen/qwen3.5-397b-a17b',
  ],
  premium: [
    'openai/gpt-5.4-2026-03-05',
    'anthropic/claude-opus-4-7',
    'anthropic/claude-opus-4-6',
    'google/gemini-3.1-pro-preview',
    'moonshotai/kimi-k2-thinking',
    'minimax/minimax-m2.7',
    'qwen/qwen3-vl-235b-a22b-instruct',
    'qwen/qwen3-coder-480b-a35b-instruct',
    'zai-org/glm-5.1',
  ],
};

export const MODELS = {
  budget:  STATIC_MODELS.budget.map(buildModelEntry),
  mid:     STATIC_MODELS.mid.map(buildModelEntry),
  premium: STATIC_MODELS.premium.map(buildModelEntry),
};
