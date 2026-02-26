// Floating AI Counselor Chat Widget - bottom right corner
(function() {
  const API_BASE = '/api';
  const STORAGE_DISMISSED = 'pathwiseChatWidgetDismissed';
  let conversationHistory = [];
  let userResponses = null;

  function isDismissed() {
    try { return localStorage.getItem(STORAGE_DISMISSED) === '1'; } catch (_) { return false; }
  }
  function setDismissed(val) {
    try { localStorage.setItem(STORAGE_DISMISSED, val ? '1' : ''); } catch (_) {}
  }

  function formatResponse(text) {
    if (!text) return '';
    return String(text)
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function addMessage(container, text, isUser) {
    const div = document.createElement('div');
    div.className = 'chat-widget-msg ' + (isUser ? 'chat-widget-msg-user' : 'chat-widget-msg-bot') + ' chat-widget-msg-enter';
    if (isUser) {
      div.textContent = text;
    } else {
      div.innerHTML = formatResponse(text);
    }
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(container) {
    const div = document.createElement('div');
    div.className = 'chat-widget-msg chat-widget-msg-bot chat-widget-typing';
    div.id = 'chat-widget-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function removeTyping() {
    document.getElementById('chat-widget-typing')?.remove();
  }

  async function fetchUserResponses() {
    try {
      const res = await fetch(`${API_BASE}/my-responses`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
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
          userResponses = Object.keys(merged.answers).length > 0 || Object.keys(merged.postCollegeAnswers).length > 0
            ? merged
            : (module0 || data[0]);
          return userResponses;
        }
      }
    } catch (e) { console.error(e); }
    return null;
  }

  async function sendMessage(msgEl, inputEl, messagesEl, text) {
    if (!text.trim()) return;
    addMessage(messagesEl, text, true);
    inputEl.value = '';
    showTyping(messagesEl);
    conversationHistory.push({ role: 'user', content: text });

    try {
      if (!userResponses) await fetchUserResponses();
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          conversationHistory: conversationHistory.slice(-10),
          userResponses
        })
      });
      removeTyping();
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        addMessage(messagesEl, data.message, false);
        conversationHistory.push({ role: 'assistant', content: data.message });
      } else if (res.status === 401) {
        addMessage(messagesEl, 'Please log in to chat with the counselor.', false);
      } else {
        addMessage(messagesEl, data.message || 'Sorry, something went wrong. Please try again.', false);
      }
    } catch (e) {
      console.error(e);
      removeTyping();
      addMessage(messagesEl, 'Network error. Please check your connection.', false);
    }
  }

  function initChatWidget() {
    if (document.getElementById('chat-widget-root')) return;

    if (isDismissed()) {
      const root = document.createElement('div');
      root.id = 'chat-widget-root';
      root.innerHTML = '<button type="button" class="chat-widget-reopen" id="chat-widget-reopen" aria-label="Open counselor">💬</button>';
      document.body.appendChild(root);
      root.querySelector('#chat-widget-reopen').addEventListener('click', () => {
        setDismissed(false);
        root.remove();
        initChatWidget();
      });
      return;
    }

    const isModule0 = /\/module\/module-0($|\?)/.test(window.location.pathname);
    const bubbleText = isModule0
      ? 'Welcome! Before we get started, fill in some information about yourself. You can also upload a resume to autofill your information.'
      : 'How may I help you today?';
    const welcomeMessage = isModule0
      ? 'Welcome! Before we get started, fill in some information about yourself. You can also upload a resume or transcript to autofill your information—just use the upload area above.'
      : 'How may I help you today?';

    const root = document.createElement('div');
    root.id = 'chat-widget-root';

    root.innerHTML = `
      <button type="button" class="chat-widget-tab" id="chat-widget-tab" style="display:none;" aria-label="Open counselor">💬</button>
      <div class="chat-widget-collapsed" id="chat-widget-collapsed">
        <div class="chat-widget-bubble-wrap" id="chat-widget-bubble">
          <div class="chat-widget-speech-bubble${isModule0 ? ' chat-widget-speech-bubble-welcome' : ''}">
            <span class="chat-widget-bubble-text">${bubbleText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
            <button type="button" class="chat-widget-close" id="chat-widget-close" aria-label="Close">×</button>
          </div>
          <div class="chat-widget-avatar" aria-hidden="true">💬</div>
        </div>
      </div>
      <div class="chat-widget-expanded" id="chat-widget-expanded" style="display:none;">
        <div class="chat-widget-header">
          <span>Counselor</span>
          <button type="button" class="chat-widget-close" id="chat-widget-close-expanded" aria-label="Close">×</button>
        </div>
        <div class="chat-widget-messages" id="chat-widget-messages"></div>
        <div class="chat-widget-input-wrap">
          <textarea id="chat-widget-input" placeholder="Ask me anything..." rows="1"></textarea>
          <button type="button" id="chat-widget-send">Send</button>
        </div>
      </div>
    `;

    document.body.appendChild(root);

    const collapsed = document.getElementById('chat-widget-collapsed');
    const expanded = document.getElementById('chat-widget-expanded');
    const bubble = document.getElementById('chat-widget-bubble');
    const closeBtn = document.getElementById('chat-widget-close');
    const closeExpanded = document.getElementById('chat-widget-close-expanded');
    const messagesEl = document.getElementById('chat-widget-messages');
    const inputEl = document.getElementById('chat-widget-input');
    const sendBtn = document.getElementById('chat-widget-send');

    bubble.addEventListener('click', (e) => {
      if (e.target === closeBtn || closeBtn.contains(e.target)) return;
      collapsed.classList.add('chat-widget-collapsed-hide');
      setTimeout(() => {
        collapsed.style.display = 'none';
        collapsed.classList.remove('chat-widget-collapsed-hide');
        expanded.style.display = 'flex';
        expanded.classList.add('chat-widget-expanded-show');
        if (messagesEl.children.length === 0) {
          addMessage(messagesEl, welcomeMessage, false);
        }
      }, 150);
    });

    const tab = document.getElementById('chat-widget-tab');

    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDismissed(true);
      root.remove();
      initChatWidget();
    });

    if (tab) {
      tab.addEventListener('click', () => {
        tab.classList.add('chat-widget-tab-hide');
        setTimeout(() => {
          tab.style.display = 'none';
          tab.classList.remove('chat-widget-tab-hide');
          collapsed.style.display = 'flex';
          collapsed.classList.add('chat-widget-collapsed-show');
          setTimeout(() => collapsed.classList.remove('chat-widget-collapsed-show'), 300);
        }, 150);
      });
    }

    closeExpanded.addEventListener('click', () => {
      setDismissed(true);
      root.remove();
      initChatWidget();
    });

    sendBtn.addEventListener('click', () => {
      sendMessage(messagesEl, inputEl, messagesEl, inputEl.value.trim());
    });

    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(messagesEl, inputEl, messagesEl, inputEl.value.trim());
      }
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    #chat-widget-root { position: fixed; bottom: 20px; right: 20px; z-index: 9999; font-family: inherit; }
    .chat-widget-reopen { width: 52px; height: 52px; border-radius: 50%; background: #333; color: white; border: 3px solid white; cursor: pointer; font-size: 1.3rem; box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; transition: transform 0.2s, box-shadow 0.2s; }
    .chat-widget-reopen:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .chat-widget-tab { position: absolute; bottom: 0; right: 0; width: 52px; height: 52px; border-radius: 50%; background: #333; color: white; border: 3px solid white; cursor: pointer; font-size: 1.3rem; box-shadow: 0 4px 16px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; transition: transform 0.2s, opacity 0.2s; }
    .chat-widget-tab:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .chat-widget-tab-hide { opacity: 0; transform: scale(0.8); }
    .chat-widget-tab-show { animation: chatWidgetPopIn 0.3s ease-out; }
    .chat-widget-collapsed { display: flex; align-items: flex-end; justify-content: flex-end; transition: opacity 0.2s, transform 0.2s; }
    .chat-widget-collapsed-hide { opacity: 0; transform: translateY(10px) scale(0.95); }
    .chat-widget-collapsed-show { animation: chatWidgetPopIn 0.3s ease-out; }
    @keyframes chatWidgetPopIn { 0% { opacity: 0; transform: scale(0.9); } 70% { transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
    .chat-widget-bubble-wrap { display: flex; align-items: flex-end; gap: 0; cursor: pointer; transition: transform 0.25s ease; }
    .chat-widget-bubble-wrap:hover { transform: scale(1.03); }
    .chat-widget-bubble-wrap:hover .chat-widget-avatar { box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
    .chat-widget-speech-bubble { background: #fff; color: #333; padding: 16px 22px; padding-right: 44px; border-radius: 22px; border-bottom-right-radius: 8px; box-shadow: 0 2px 12px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.06); max-width: 240px; position: relative; margin-right: -2px; border: 1px solid #e5e5e5; }
    .chat-widget-speech-bubble-welcome { max-width: 320px; }
    .chat-widget-speech-bubble::after { content: ''; position: absolute; right: 0; bottom: 16px; width: 0; height: 0; border: 10px solid transparent; border-left-color: #fff; border-right: 0; margin-right: -10px; }
    .chat-widget-speech-bubble::before { content: ''; position: absolute; right: 0; bottom: 15px; width: 0; height: 0; border: 11px solid transparent; border-left-color: #e5e5e5; border-right: 0; margin-right: -11px; z-index: -1; }
    .chat-widget-bubble-text { font-size: 0.95rem; font-weight: 500; color: #333; }
    .chat-widget-avatar { width: 52px; height: 52px; border-radius: 50%; background: #333; box-shadow: 0 4px 16px rgba(0,0,0,0.2); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white; border: 3px solid white; transition: box-shadow 0.25s; animation: chatWidgetAvatarFloat 3s ease-in-out infinite; }
    @keyframes chatWidgetAvatarFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    .chat-widget-speech-bubble .chat-widget-close { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: #f0f0f0; color: #666; width: 24px; height: 24px; font-size: 16px; border-radius: 50%; transition: background 0.2s; }
    .chat-widget-speech-bubble .chat-widget-close:hover { background: #e0e0e0; color: #333; }
    .chat-widget-close { background: #e0e0e0; border: none; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; font-size: 18px; line-height: 1; color: #333; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s; }
    .chat-widget-close:hover { background: #ccc; }
    .chat-widget-expanded { flex-direction: column; width: 480px; max-height: 600px; background: white; border-radius: 16px; box-shadow: 0 12px 40px rgba(0,0,0,0.18); overflow: hidden; opacity: 0; transform: translateY(20px) scale(0.96); }
    .chat-widget-expanded-show { animation: chatWidgetExpandIn 0.35s ease-out forwards; }
    .chat-widget-expanded-hide { animation: chatWidgetExpandOut 0.2s ease-in forwards; }
    @keyframes chatWidgetExpandIn { to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes chatWidgetExpandOut { to { opacity: 0; transform: translateY(12px) scale(0.98); } }
    .chat-widget-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #333; color: white; font-weight: 600; font-size: 1.05rem; }
    .chat-widget-header .chat-widget-close { background: rgba(255,255,255,0.2); color: white; transition: background 0.2s; }
    .chat-widget-header .chat-widget-close:hover { background: rgba(255,255,255,0.35); }
    .chat-widget-messages { padding: 20px; overflow-y: auto; max-height: 420px; min-height: 260px; display: flex; flex-direction: column; gap: 12px; }
    .chat-widget-msg { padding: 12px 16px; border-radius: 16px; max-width: 88%; font-size: 0.92rem; line-height: 1.5; opacity: 0; transform: translateY(8px); animation: chatWidgetMsgIn 0.35s ease-out forwards; }
    .chat-widget-msg-bot { background: #f5f5f5; color: #333; margin-right: auto; border-bottom-left-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e8e8e8; }
    .chat-widget-msg-user { background: #333; color: white; margin-left: auto; border-bottom-right-radius: 4px; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
    @keyframes chatWidgetMsgIn { to { opacity: 1; transform: translateY(0); } }
    .chat-widget-typing { display: flex; gap: 8px; padding: 14px 18px; align-items: center; }
    .chat-widget-typing span { width: 8px; height: 8px; background: #666; border-radius: 50%; animation: chatWidgetBounce 1.4s ease-in-out infinite; }
    .chat-widget-typing span:nth-child(2) { animation-delay: 0.2s; }
    .chat-widget-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes chatWidgetBounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-8px); } }
    .chat-widget-input-wrap { padding: 16px; border-top: 1px solid #e8e8e8; background: #fafafa; display: flex; gap: 12px; align-items: flex-end; }
    .chat-widget-input-wrap textarea { flex: 1; padding: 12px 16px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 0.92rem; font-family: inherit; resize: none; min-height: 44px; max-height: 100px; transition: border-color 0.2s, box-shadow 0.2s; }
    .chat-widget-input-wrap textarea:focus { outline: none; border-color: #333; box-shadow: 0 0 0 2px rgba(0,0,0,0.08); }
    .chat-widget-input-wrap button { padding: 12px 24px; background: #333; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer; font-size: 0.92rem; transition: transform 0.2s, box-shadow 0.2s; }
    .chat-widget-input-wrap button:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.2); }
    .chat-widget-input-wrap button:active { transform: translateY(0); }
  `;
  document.head.appendChild(style);

  document.addEventListener('DOMContentLoaded', initChatWidget);
})();
