// Counselor chat - AI college counselor based on user's questionnaire responses
(function() {
const API_BASE = '/api';

let savedUserResponses = null;
let conversationHistory = [];
let postCollegeQuestions = [];
let postCollegeQuestionIndex = 0;
let waitingForInputBeforeNextQuestion = false;

function formatResponse(text) {
  if (!text) return '';
  let formatted = String(text)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[-•]\s+(.*)$/gim, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => '<ul>' + m + '</ul>')
    .replace(/\n\n+/g, '</p><p>')
    .replace(/\n/g, '<br>');
  return '<p>' + formatted + '</p>';
}

function addBotMessage(text) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'message message-bot';
  div.innerHTML = formatResponse(text);
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function addUserMessage(text) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'message message-user';
  div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function showTypingIndicator() {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const div = document.createElement('div');
  div.className = 'message-typing';
  div.id = 'typing-indicator';
  div.innerHTML = '<div class="typing-indicator"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

async function fetchUserResponses() {
  try {
    const res = await fetch(`${API_BASE}/my-responses`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Merge all module responses for full context (module-0 base, then overlay others)
        const byModule = {};
        data.forEach(r => {
          const mid = r.moduleId || 'legacy';
          if (!byModule[mid] || (r.timestamp || r.submittedAt || '') > (byModule[mid].timestamp || byModule[mid].submittedAt || '')) {
            byModule[mid] = r;
          }
        });
        const module0 = byModule['module-0'];
        const others = Object.values(byModule).filter(r => r !== module0);
        const merged = { answers: {}, postCollegeAnswers: {} };
        [module0, ...others].filter(Boolean).forEach(r => {
          const ans = r.answers || (r.moduleId ? {} : r);
          if (ans && typeof ans === 'object' && !Array.isArray(ans)) Object.assign(merged.answers, ans);
          if (r.postCollegeAnswers) Object.assign(merged.postCollegeAnswers, r.postCollegeAnswers);
        });
        const hasMerged = Object.keys(merged.answers).length > 0 || Object.keys(merged.postCollegeAnswers).length > 0;
        savedUserResponses = hasMerged
          ? { answers: merged.answers, postCollegeAnswers: merged.postCollegeAnswers }
          : (module0 || data.sort((a, b) => ((b.timestamp || b.submittedAt || '') > (a.timestamp || a.submittedAt || '') ? 1 : -1))[0]);
        return savedUserResponses;
      }
    }
  } catch (e) { console.error(e); }
  return null;
}

async function runPostCollegeQuestion(question) {
  showTypingIndicator();
  try {
    const res = await fetch(`${API_BASE}/chat/run-post-college`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ questionId: question.id, userResponses: savedUserResponses })
    });
    removeTypingIndicator();
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.message) {
      addBotMessage(data.message);
      conversationHistory.push({ role: 'assistant', content: data.message });
    } else {
      addBotMessage(data.message || 'Sorry, something went wrong. Please try again.');
    }
  } catch (e) {
    console.error(e);
    removeTypingIndicator();
    addBotMessage('Network error. Please try again.');
  }
}

async function sendMessage(message) {
  if (!message.trim()) return;

  // If we're waiting for user input before the next post-college question, use this message to advance
  if (waitingForInputBeforeNextQuestion && postCollegeQuestions.length > 0) {
    addUserMessage(message);
    document.getElementById('chatInput').value = '';
    conversationHistory.push({ role: 'user', content: message });
    waitingForInputBeforeNextQuestion = false;
    postCollegeQuestionIndex++;
    if (postCollegeQuestionIndex < postCollegeQuestions.length) {
      const q = postCollegeQuestions[postCollegeQuestionIndex];
      addBotMessage(q.text || '');
      await runPostCollegeQuestion(q);
      if (q.textBubbles && Array.isArray(q.textBubbles) && q.textBubbles.length > 0) {
        addBotMessage(q.textBubbles[0]);
      }
      if (postCollegeQuestionIndex + 1 < postCollegeQuestions.length) {
        waitingForInputBeforeNextQuestion = true;
        addBotMessage("Type something below to continue to the next question.");
      } else {
        const pcRes = await fetch(`${API_BASE}/post-college-messages`, { credentials: 'include' });
        const pcData = pcRes.ok ? await pcRes.json() : null;
        if (pcData && pcData.finalMessage) addBotMessage(pcData.finalMessage);
        addBotMessage("You can ask me anything else below!");
      }
    }
    return;
  }

  addUserMessage(message);
  document.getElementById('chatInput').value = '';
  showTypingIndicator();
  conversationHistory.push({ role: 'user', content: message });

  try {
    if (!savedUserResponses) await fetchUserResponses();
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        message,
        conversationHistory: conversationHistory.slice(-10),
        userResponses: savedUserResponses
      })
    });
    removeTypingIndicator();

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success) {
      addBotMessage(data.message);
      conversationHistory.push({ role: 'assistant', content: data.message });
    } else {
      addBotMessage(data.message || 'Sorry, something went wrong. Please try again.');
    }
  } catch (e) {
    console.error(e);
    removeTypingIndicator();
    addBotMessage('Network error. Please check your connection and try again.');
  }
}

async function initCounselorChat(options = {}) {
  const embedded = options.embedded === true;
  const messages = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  if (!messages || !input || !sendBtn) return;

  if (!embedded) {
    const authRes = await fetch(`${API_BASE}/auth/check`, { credentials: 'include' });
    const auth = (await authRes.json()).authenticated;
    if (!auth) {
      window.location.href = '/login.html?return=' + encodeURIComponent('/counselor');
      return;
    }
    const hasPayment = await fetch(`${API_BASE}/payment/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => d.hasPayment === true)
      .catch(() => false);
    if (!hasPayment) {
      window.location.href = '/payment';
      return;
    }
  }

  await fetchUserResponses();
  messages.innerHTML = '';
  addBotMessage("Hello! I'm your Pathwise counselor. I've reviewed your previous responses. Let me help you with college recommendations and scholarships.");

  // Fetch and run post-college questions in sequence; require user input before each subsequent question
  try {
    const pcRes = await fetch(`${API_BASE}/post-college-messages`, { credentials: 'include' });
    const pcData = pcRes.ok ? await pcRes.json() : null;
    const questions = (pcData && pcData.questions ? pcData.questions : []).filter(q => q && q.chatPrompt);
    postCollegeQuestions = questions;
    postCollegeQuestionIndex = 0;
    waitingForInputBeforeNextQuestion = false;

    if (questions.length > 0) {
      const q = questions[0];
      addBotMessage(q.text || '');
      await runPostCollegeQuestion(q);
      if (q.textBubbles && Array.isArray(q.textBubbles) && q.textBubbles.length > 0) {
        addBotMessage(q.textBubbles[0]);
      }
      if (questions.length > 1) {
        waitingForInputBeforeNextQuestion = true;
        addBotMessage("Type something below to continue to the next question.");
      } else {
        if (pcData && pcData.finalMessage) addBotMessage(pcData.finalMessage);
        addBotMessage("You can ask me anything else below!");
      }
    } else {
      addBotMessage("How can I help you today? Feel free to ask me any questions!");
    }
  } catch (e) {
    console.error(e);
    addBotMessage("How can I help you today? Feel free to ask me any questions!");
  }

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input.value.trim());
    }
  });
  sendBtn.addEventListener('click', () => sendMessage(input.value.trim()));
}

window.initCounselorChat = initCounselorChat;

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('chatMessages') && document.getElementById('chatInput')) {
    initCounselorChat({ embedded: false });
  }
});
})();
