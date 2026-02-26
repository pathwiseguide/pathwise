// Post-payment tutorial: counselor icon moves around and introduces features
(function() {
  const STORAGE_PENDING = 'pathwiseTutorialPending';
  const STORAGE_COMPLETED = 'pathwiseTutorialCompleted';

  function shouldShowTutorial() {
    try {
      if (!/\/modules($|\?)/.test(window.location.pathname)) return false;
      const forceTutorial = new URLSearchParams(window.location.search).get('tutorial') === '1';
      if (forceTutorial && localStorage.getItem(STORAGE_COMPLETED) !== '1') return true;
      if (localStorage.getItem(STORAGE_PENDING) !== '1') return false;
      if (localStorage.getItem(STORAGE_COMPLETED) === '1') return false;
      return true;
    } catch (_) { return false; }
  }

  function markCompleted() {
    try {
      localStorage.removeItem(STORAGE_PENDING);
      localStorage.setItem(STORAGE_COMPLETED, '1');
    } catch (_) {}
  }

  const STEPS = [
    {
      text: "This is where you find all the tools you'll need to complete your College Application.",
      position: 'tools',
      highlight: 'modulesDropdownWrap',
      circularSpotlight: true
    },
    {
      text: "This is the Initial Diagnostic page. You may have already filled it out, but feel free to change your answers anytime!",
      position: 'initial-diagnostic',
      highlightSelector: '[data-module-id="module-0"]',
      circularSpotlight: false
    },
    {
      text: "Go here next. This is where you'll find colleges that match with you.",
      position: 'college-match',
      highlightSelector: '[data-module-id="module-1"]',
      circularSpotlight: false
    },
    {
      text: "This is the Dashboard. Here, you'll find your college matches and a calendar to keep track of submission dates.",
      position: 'dashboard',
      highlight: 'dashboardLink',
      circularSpotlight: false
    },
    {
      text: "And I'm always here in the corner when you need help. Click me anytime to chat!",
      position: 'bottom-right',
      highlight: null
    }
  ];

  function getPosition(positionId, highlightEl) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 20;
    const size = 52;

    if (positionId === 'bottom-right') {
      return { left: vw - size - margin, top: vh - size - margin };
    }
    if (positionId === 'tools' && highlightEl) {
      const rect = highlightEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          left: rect.left - size - 8,
          top: rect.bottom + 12
        };
      }
      const nav = document.querySelector('.nav-header');
      if (nav) {
        const nr = nav.getBoundingClientRect();
        return { left: nr.right - size - 80, top: nr.bottom + 12 };
      }
    }
    if (positionId === 'initial-diagnostic' && highlightEl) {
      const rect = highlightEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          left: rect.right + 8,
          top: rect.top
        };
      }
    }
    if (positionId === 'college-match' && highlightEl) {
      const rect = highlightEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          left: rect.right + 8,
          top: rect.top
        };
      }
    }
    if (positionId === 'dashboard' && highlightEl) {
      const rect = highlightEl.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          left: rect.left,
          top: rect.bottom + 12
        };
      }
    }
    return { left: vw - size - margin, top: vh - size - margin };
  }

  function formatText(s) {
    return String(s || '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
  }

  function runTutorial() {
    if (!shouldShowTutorial()) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = 52;
    const startLeft = vw - size - 20;
    const startTop = vh - size - 20;

    const chatWidget = document.getElementById('chat-widget-root');
    if (chatWidget) chatWidget.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.innerHTML = `
      <div class="tutorial-backdrop"></div>
      <div class="tutorial-highlight" id="tutorial-highlight" style="display:none;"></div>
      <div class="tutorial-avatar" id="tutorial-avatar" style="left:${startLeft}px;top:${startTop}px">💬</div>
      <div class="tutorial-bubble-wrap" id="tutorial-bubble-wrap">
        <div class="tutorial-bubble">
          <div class="tutorial-bubble-text" id="tutorial-bubble-text"></div>
          <div class="tutorial-bubble-actions">
            <button type="button" class="tutorial-btn tutorial-btn-skip" id="tutorial-skip">Skip tutorial</button>
            <button type="button" class="tutorial-btn tutorial-btn-next" id="tutorial-next">Next</button>
          </div>
        </div>
      </div>
    `;

    let style = document.getElementById('tutorial-overlay-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'tutorial-overlay-style';
      style.textContent = `
      #tutorial-overlay { position: fixed; inset: 0; z-index: 10000; pointer-events: none; }
      #tutorial-overlay * { pointer-events: auto; box-sizing: border-box; }
      .tutorial-backdrop { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
      .tutorial-highlight { position: absolute; border: 3px solid #333; border-radius: 8px; box-shadow: 0 0 0 9999px rgba(0,0,0,0.65); transition: all 0.4s ease; }
      .tutorial-highlight-circle { border-color: rgba(255,255,255,0.4); box-shadow: 0 0 0 9999px rgba(0,0,0,0.7); }
      .tutorial-avatar { position: fixed; width: 52px; height: 52px; border-radius: 50%; background: #333; color: white; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 4px 16px rgba(0,0,0,0.2); transition: left 0.5s ease, top 0.5s ease; z-index: 10002; }
      .tutorial-bubble-wrap { position: fixed; z-index: 10001; transition: left 0.5s ease, top 0.5s ease; max-width: 320px; }
      .tutorial-bubble { background: #fff; padding: 18px 20px; border-radius: 16px; border-bottom-left-radius: 6px; box-shadow: 0 4px 24px rgba(0,0,0,0.15); border: 1px solid #e5e5e5; }
      .tutorial-bubble-text { font-size: 0.95rem; line-height: 1.5; color: #333; margin-bottom: 14px; }
      .tutorial-bubble-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
      .tutorial-btn { padding: 10px 18px; border: none; border-radius: 10px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
      .tutorial-btn-skip { background: #f0f0f0; color: #666; }
      .tutorial-btn-skip:hover { background: #e5e5e5; color: #333; }
      .tutorial-btn-next { background: #333; color: white; }
      .tutorial-btn-next:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    `;
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);

    const avatar = document.getElementById('tutorial-avatar');
    const bubbleWrap = document.getElementById('tutorial-bubble-wrap');
    const bubbleText = document.getElementById('tutorial-bubble-text');
    const highlightEl = document.getElementById('tutorial-highlight');
    const backdropEl = overlay.querySelector('.tutorial-backdrop');
    const nextBtn = document.getElementById('tutorial-next');
    const skipBtn = document.getElementById('tutorial-skip');

    let stepIndex = 0;

    function getStepTarget(step) {
      if (step.highlight) return document.getElementById(step.highlight);
      if (step.highlightSelector) return document.querySelector(step.highlightSelector);
      return null;
    }

    function updateHighlight() {
      const step = STEPS[stepIndex];
      const target = getStepTarget(step);
      if (target) {
        const rect = target.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          highlightEl.style.display = 'block';
          if (backdropEl) backdropEl.style.display = 'none';
          const padding = 16;
          if (step.circularSpotlight) {
            const diameter = Math.max(rect.width, rect.height) + padding * 2;
            highlightEl.style.width = diameter + 'px';
            highlightEl.style.height = diameter + 'px';
            highlightEl.style.left = (rect.left + rect.width / 2 - diameter / 2) + 'px';
            highlightEl.style.top = (rect.top + rect.height / 2 - diameter / 2) + 'px';
            highlightEl.style.borderRadius = '50%';
            highlightEl.classList.add('tutorial-highlight-circle');
          } else {
            highlightEl.style.left = (rect.left - 6) + 'px';
            highlightEl.style.top = (rect.top - 6) + 'px';
            highlightEl.style.width = (rect.width + 12) + 'px';
            highlightEl.style.height = (rect.height + 12) + 'px';
            highlightEl.style.borderRadius = '8px';
            highlightEl.classList.remove('tutorial-highlight-circle');
          }
          return;
        }
      }
      highlightEl.style.display = 'none';
      if (backdropEl) backdropEl.style.display = 'block';
    }

    function positionElements() {
      const step = STEPS[stepIndex];
      const target = getStepTarget(step);
      const pos = getPosition(step.position, target || null);

      avatar.style.left = pos.left + 'px';
      avatar.style.top = pos.top + 'px';

      const bubbleOffset = step.position === 'bottom-right' ? { x: -340, y: -120 }
        : (step.position === 'initial-diagnostic' || step.position === 'college-match') ? { x: 0, y: 60 }
        : step.position === 'dashboard' ? { x: 90, y: 0 }
        : { x: -320, y: 20 };
      bubbleWrap.style.left = (pos.left + bubbleOffset.x) + 'px';
      bubbleWrap.style.top = (pos.top + bubbleOffset.y) + 'px';
    }

    function showStep() {
      const step = STEPS[stepIndex];
      const target = getStepTarget(step);
      if (step.highlightSelector && !target) {
        stepIndex++;
        if (stepIndex >= STEPS.length) {
          endTutorial();
          return;
        }
        showStep();
        return;
      }
      bubbleText.innerHTML = formatText(step.text);
      nextBtn.textContent = stepIndex < STEPS.length - 1 ? 'Next' : 'Got it!';
      updateHighlight();
      positionElements();
    }

    function next() {
      stepIndex++;
      if (stepIndex >= STEPS.length) {
        endTutorial();
        return;
      }
      showStep();
    }

    function endTutorial() {
      markCompleted();
      const cw = document.getElementById('chat-widget-root');
      if (cw) cw.style.display = '';
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s ease';
      setTimeout(() => overlay.remove(), 300);
    }

    nextBtn.addEventListener('click', next);
    skipBtn.addEventListener('click', endTutorial);

    showStep();

    window.addEventListener('resize', () => {
      if (stepIndex < STEPS.length) {
        updateHighlight();
        positionElements();
      }
    });
  }

  function init() {
    const run = () => {
      let attempts = 0;
      const tryRun = () => {
        const el = document.getElementById('modulesDropdownWrap');
        if (el && el.offsetParent !== null && el.getBoundingClientRect().width > 0) {
          runTutorial();
          return;
        }
        attempts++;
        if (attempts < 10) setTimeout(tryRun, 300);
      };
      setTimeout(tryRun, 800);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }
  init();
})();
