// Claude (Anthropic) only for chat - OpenAI used only for RAG embeddings
// Anthropic has no embeddings API, so RAG document indexing requires OpenAI

let anthropic = null;
let openai = null;

const rawAnthropic = process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY);
const anthropicKey = rawAnthropic
  ? rawAnthropic.replace(/\r\n|\r|\n/g, '').replace(/^["']|["']$/g, '').trim()
  : '';
if (anthropicKey) {
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    anthropic = new Anthropic({ apiKey: anthropicKey });
    console.log('Claude (Anthropic) integration enabled - chat uses Claude only');
  } catch (err) {
    console.error('Failed to init Anthropic:', err.message);
  }
} else {
  console.warn('ANTHROPIC_API_KEY not set or empty - chat will not work. Add it to .env for Claude.');
}
if (process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = require('openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('OpenAI enabled (RAG embeddings + college name match & More info descriptions)');
  } catch (err) {
    console.error('Failed to init OpenAI:', err.message);
  }
}

const hasLLM = !!anthropic;
const hasOpenAIChat = !!openai;

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

/**
 * Single-turn chat via OpenAI (ChatGPT) - used for cheaper tasks e.g. college name matching, descriptions
 */
async function openaiChatComplete(system, userContent, options = {}) {
  const { maxTokens = 1024, temperature = 0.5 } = options;
  if (!openai) {
    throw new Error('OpenAI is not configured. Set OPENAI_API_KEY in .env');
  }
  const capped = capMaxTokens(maxTokens);
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system || 'You are a helpful assistant.' },
      { role: 'user', content: String(userContent || '') }
    ],
    max_tokens: capped,
    temperature
  });
  const text = completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content;
  return typeof text === 'string' ? text : '';
}

/**
 * OpenAI chat with streaming - yields text chunks (for college description etc.)
 */
async function* openaiChatCompleteStream(system, userContent, options = {}) {
  const { maxTokens = 1024, temperature = 0.5 } = options;
  if (!openai) throw new Error('OpenAI is not configured. Set OPENAI_API_KEY in .env');
  const capped = capMaxTokens(maxTokens);
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system || 'You are a helpful assistant.' },
      { role: 'user', content: String(userContent || '') }
    ],
    max_tokens: capped,
    temperature,
    stream: true
  });
  for await (const chunk of stream) {
    const content = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content;
    if (typeof content === 'string' && content) yield content;
  }
}

/**
 * Claude chat with streaming - yields text chunks (for college description etc.)
 */
async function* chatCompleteStream(system, userContent, options = {}) {
  const { maxTokens = 1024 } = options;
  const capped = capMaxTokens(maxTokens);
  if (!anthropic) throw new Error('Claude is not configured. Set ANTHROPIC_API_KEY in .env');
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: capped,
    system: system || 'You are a helpful assistant.',
    messages: [{ role: 'user', content: String(userContent || '') }]
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && typeof event.delta.text === 'string' && event.delta.text) {
      yield event.delta.text;
    }
  }
}

module.exports = {
  hasLLM,
  hasOpenAIChat,
  chatComplete,
  chatCompleteWithMessages,
  openaiChatComplete,
  openaiChatCompleteStream,
  chatCompleteStream,
  openai,
  anthropic
};
