// Claude (Anthropic) only for chat - OpenAI used only for RAG embeddings
// Anthropic has no embeddings API, so RAG document indexing requires OpenAI

let anthropic = null;
let openai = null;

if (process.env.ANTHROPIC_API_KEY) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('Claude (Anthropic) integration enabled - chat uses Claude only');
  } catch (err) {
    console.error('Failed to init Anthropic:', err.message);
  }
} else {
  console.warn('ANTHROPIC_API_KEY not set - chat will not work. Add it to .env for Claude.');
}
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI enabled for RAG document embeddings only (not used for chat)');
  } catch (err) {
    console.error('Failed to init OpenAI:', err.message);
  }
}

const hasLLM = !!anthropic;

// Optional cap on max tokens per message (set MAX_TOKENS_PER_MESSAGE in env to limit cost)
const MAX_TOKENS_PER_MESSAGE = process.env.MAX_TOKENS_PER_MESSAGE
  ? Math.max(1, parseInt(process.env.MAX_TOKENS_PER_MESSAGE, 10) || 4096)
  : null;

function capMaxTokens(requested) {
  if (MAX_TOKENS_PER_MESSAGE == null) return requested;
  return Math.min(requested, MAX_TOKENS_PER_MESSAGE);
}

if (MAX_TOKENS_PER_MESSAGE != null) {
  console.log(`Max tokens per message capped at: ${MAX_TOKENS_PER_MESSAGE}`);
}

/**
 * Single-turn chat - Claude only
 */
async function chatComplete(system, userContent, options = {}) {
  const { maxTokens = 4096 } = options;
  const capped = capMaxTokens(maxTokens);
  if (!anthropic) {
    throw new Error('Claude is not configured. Set ANTHROPIC_API_KEY in .env');
  }
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: capped,
    system: system || 'You are a helpful assistant.',
    messages: [{ role: 'user', content: String(userContent || '') }]
  });
  const block = message.content && message.content[0];
  if (block && block.type === 'text') return block.text;
  if (block && typeof block.text === 'string') return block.text;
  return '';
}

/**
 * Multi-turn chat - Claude only
 */
async function chatCompleteWithMessages(system, messages, options = {}) {
  const { maxTokens = 4096 } = options;
  const capped = capMaxTokens(maxTokens);
  if (!anthropic) {
    throw new Error('Claude is not configured. Set ANTHROPIC_API_KEY in .env');
  }
  const turns = (messages || []).filter(
    m => m && m.role && m.content && ['user', 'assistant'].includes(m.role)
  );
  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    throw new Error('Messages must end with a user message');
  }
  const apiMessages = turns.map(m => ({ role: m.role, content: String(m.content) }));
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: capped,
    system: system || 'You are a helpful assistant.',
    messages: apiMessages
  });
  const block = message.content && message.content[0];
  if (block && block.type === 'text') return block.text;
  if (block && typeof block.text === 'string') return block.text;
  return '';
}

module.exports = {
  hasLLM,
  chatComplete,
  chatCompleteWithMessages,
  openai,
  anthropic
};
