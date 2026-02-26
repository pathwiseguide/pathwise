// Module-based questionnaire - works for anonymous (Module 0) and logged-in users
const API_BASE = '/api';

let course = { modules: [] };
let questions = [];
let moduleAnswers = {};

async function hasPaymentAccess() {
  try {
    const res = await fetch(`${API_BASE}/payment/status`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return data.hasPayment === true;
    }
  } catch (e) { console.error(e); }
  return false;
}

async function isAuthenticated() {
  try {
    const res = await fetch(`${API_BASE}/auth/check`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      return data.authenticated === true;
    }
  } catch (e) { console.error(e); }
  return false;
}

function renderQuestionInput(question, answers) {
  const wrap = document.createElement('div');
  wrap.className = 'module-question-item';
  const label = document.createElement('label');
  label.textContent = question.text + (question.required ? ' *' : '');
  label.htmlFor = `q-${question.id}`;
  wrap.appendChild(label);

  const val = answers[question.id];
  switch (question.type) {
    case 'text':
    case 'email':
    case 'number':
      const inp = document.createElement('input');
      inp.type = question.type;
      inp.id = `q-${question.id}`;
      inp.name = question.id;
      inp.required = !!question.required;
      if (val != null) inp.value = val;
      wrap.appendChild(inp);
      break;
    case 'textarea':
      const ta = document.createElement('textarea');
      ta.id = `q-${question.id}`;
      ta.name = question.id;
      ta.required = !!question.required;
      ta.className = 'module-textarea-auto-grow';
      if (val != null) ta.value = val;
      wrap.appendChild(ta);
      requestAnimationFrame(() => autoGrowTextarea(ta));
      ta.addEventListener('input', () => autoGrowTextarea(ta));
      break;
    case 'radio':
      const rg = document.createElement('div');
      rg.className = 'radio-group';
      (question.options || []).forEach(opt => {
        const d = document.createElement('div');
        d.className = 'radio-option';
        const l = document.createElement('label');
        l.htmlFor = `q-${question.id}-${opt}`;
        l.className = 'radio-option-label';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = question.id;
        r.value = opt;
        r.id = `q-${question.id}-${opt}`;
        if (val === opt) r.checked = true;
        const span = document.createElement('span');
        span.textContent = opt;
        l.appendChild(r);
        l.appendChild(span);
        d.appendChild(l);
        rg.appendChild(d);
      });
      wrap.appendChild(rg);
      break;
    case 'checkbox':
      const cg = document.createElement('div');
      cg.className = 'checkbox-group';
      (question.options || []).forEach(opt => {
        const d = document.createElement('div');
        d.className = 'checkbox-option';
        const l = document.createElement('label');
        l.htmlFor = `q-${question.id}-${opt}`;
        l.className = 'checkbox-option-label';
        const c = document.createElement('input');
        c.type = 'checkbox';
        c.name = question.id;
        c.value = opt;
        c.id = `q-${question.id}-${opt}`;
        if (Array.isArray(val) && val.includes(opt)) c.checked = true;
        const span = document.createElement('span');
        span.textContent = opt;
        l.appendChild(c);
        l.appendChild(span);
        d.appendChild(l);
        cg.appendChild(d);
      });
      wrap.appendChild(cg);
      break;
    default:
      const def = document.createElement('input');
      def.type = 'text';
      def.id = `q-${question.id}`;
      def.name = question.id;
      def.required = !!question.required;
      if (val != null) def.value = val;
      wrap.appendChild(def);
  }
  return wrap;
}

function collectModuleAnswers(moduleId) {
  const form = document.getElementById(`module-form-${moduleId}`);
  if (!form) return {};
  const answers = {};
  const qIds = (course.modules.find(m => m.id === moduleId) || {}).questionIds || [];
  qIds.forEach(qId => {
    const group = form.querySelectorAll(`[name="${qId}"]`);
    if (!group.length) return;
    const first = group[0];
    if (first.type === 'checkbox') {
      answers[qId] = Array.from(group).filter(c => c.checked).map(c => c.value);
    } else if (first.type === 'radio') {
      const checked = form.querySelector(`input[name="${qId}"]:checked`);
      answers[qId] = checked ? checked.value : '';
    } else {
      answers[qId] = first.value || '';
    }
  });
  return answers;
}

function applyModule0Answers(answers) {
  const form = document.getElementById('module-form-module-0');
  if (!form || !answers || typeof answers !== 'object') return;
  Object.keys(answers).forEach(qId => {
    const group = form.querySelectorAll(`[name="${qId}"]`);
    if (!group.length) return;
    const first = group[0];
    const val = answers[qId];
    if (first.type === 'checkbox') {
      const arr = Array.isArray(val) ? val : (val != null ? [String(val)] : []);
      group.forEach(c => { c.checked = arr.indexOf(c.value) !== -1; });
    } else if (first.type === 'radio') {
      group.forEach(c => { c.checked = c.value === val; });
    } else {
      first.value = val != null ? String(val) : '';
      if (first.tagName === 'TEXTAREA') requestAnimationFrame(() => autoGrowTextarea(first));
    }
  });
}

async function loadCourseAndQuestions() {
  const [courseRes, questionsRes] = await Promise.all([
    fetch(`${API_BASE}/course`, { credentials: 'include' }),
    fetch(`${API_BASE}/questions`, { credentials: 'include' })
  ]);
  if (!courseRes.ok) throw new Error('Failed to load course');
  if (!questionsRes.ok) throw new Error('Failed to load questions');
  course = await courseRes.json();
  const qData = await questionsRes.json();
  questions = Array.isArray(qData) ? qData : (qData.questions || []);
  course.modules = (course.modules || []).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function getQuestionById(id) {
  return questions.find(q => String(q.id) === String(id));
}

function autoGrowTextarea(el) {
  if (!el || el.tagName !== 'TEXTAREA') return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight, 120) + 'px';
}

let hasPayment = false;
let isAuth = false;
let hasModule0Submitted = false;
let lastModule0UploadedFileName = '';

function getModuleFromUrl() {
  const match = location.pathname.match(/^\/module\/([^/]+)$/);
  if (match) return decodeURIComponent(match[1]);
  const params = new URLSearchParams(location.search);
  const m = params.get('module');
  return m || 'module-0';
}

// Section groupings for Module 0 (Initial Diagnostic)
const MODULE0_SECTIONS = [
  { title: 'About You', ids: ['1', '2', '3', '1765772170950', '4', '1765772367077', '1765772344326', '1765772762906', '16'] },
  { title: 'Academics', ids: ['1765772397699', '1765772638610', '1765772688681', '1765772450417', '1765772501152', '1765772542631', '1765772550210'] },
  { title: 'Activities & Interests', ids: ['1765772412151', '1765772737014', '1765772440701', '1765772561776', '1765772590257', '1765772750883'] },
  { title: 'Background', ids: ['1765772211033', '1765772243220', '1765772607883'] },
  { title: 'Future Plans', ids: ['1765772624492', '1765772701161'] }
];

function renderModuleForm(modId) {
  const container = document.getElementById('moduleFormContainer');
  if (!container) return;
  const mod = course.modules.find(m => m.id === modId);
  const wrapper = document.querySelector('.modules-wrapper');
  if (wrapper) {
    if (mod && mod.id === 'module-0') wrapper.classList.add('module-initial-diagnostic');
    else wrapper.classList.remove('module-initial-diagnostic');
  }
  if (!mod) {
    container.innerHTML = '<p>Not found. <a href="/module/module-0">Go to Initial Diagnostic</a></p>';
    return;
  }
  // Module 0: always accessible. Other modules: require Module 0 completed AND payment.
  const canAccessModule0 = mod.id === 'module-0';
  const canAccessOtherModules = mod.id !== 'module-0' && hasModule0Submitted && hasPayment;
  const canAccess = canAccessModule0 || canAccessOtherModules;
  if (!canAccess) {
    if (!hasModule0Submitted && mod.id !== 'module-0') {
      container.innerHTML = '<div class="module-locked-msg"><p>This tool is locked. Please complete the <strong>Initial Diagnostic</strong> first—it helps us personalize your experience. Once you\'ve submitted it, you can unlock the rest of the tools with a subscription.</p><a href="/module/module-0" class="btn-primary module-submit" style="display:inline-block;text-decoration:none;">Go to Initial Diagnostic</a></div>';
    } else if (!hasPayment) {
      container.innerHTML = '<div class="module-locked-msg"><p>You\'ve completed the Initial Diagnostic. To access this module, choose a plan that works for you. Your subscription unlocks the rest of the modules.</p><a href="/payment" class="btn-primary module-submit" style="display:inline-block;text-decoration:none;">View Plans</a></div>';
    } else {
      container.innerHTML = '<div class="module-locked-msg"><p>Please complete the <strong>Initial Diagnostic</strong> first to continue.</p><a href="/module/module-0" class="btn-primary module-submit" style="display:inline-block;text-decoration:none;">Go to Initial Diagnostic</a></div>';
    }
    return;
  }
  container.innerHTML = '';
  const qMap = {};
  questions.forEach(q => { qMap[String(q.id)] = q; });
  const answers = moduleAnswers[mod.id] || {};

  // Back to Modules link (goes to /modules)
  const backLink = document.createElement('a');
  backLink.href = '/modules';
  backLink.className = 'back-to-modules-link';
  backLink.textContent = '← Back to Modules';
  backLink.style.cssText = 'display:inline-block;margin-bottom:16px;color:#666;text-decoration:none;font-size:0.95rem;';
  backLink.addEventListener('mouseenter', () => { backLink.style.color = '#000'; });
  backLink.addEventListener('mouseleave', () => { backLink.style.color = '#666'; });
  container.appendChild(backLink);

  // Hero header: title then short description
  const hero = document.createElement('div');
  hero.className = 'module-hero';
  hero.innerHTML = `<h1>${mod.title}</h1><p>${mod.description || ''}</p>`;
  container.appendChild(hero);

  // Module 0: upload resume/transcript to auto-fill (drag-and-drop, PDF/DOCX/TXT)
  if (mod.id === 'module-0') {
    const acceptTypes = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
    const uploadCard = document.createElement('div');
    uploadCard.className = 'module-form-card module-0-upload-card';
    uploadCard.innerHTML = `
      <div class="module-section">
        <div class="module-section-title">Quick fill from document</div>
        <p class="module-0-upload-desc">Drop your resume or transcript here, or click to browse. We'll fill in as much as we can; you can edit and complete the rest.</p>
        <div class="module-0-dropzone" id="module0Dropzone">
          <input type="file" id="module0DocumentInput" accept="${acceptTypes}" class="module-0-file-input">
          <div class="module-0-dropzone-inner">
            <span class="module-0-dropzone-icon" aria-hidden="true">📄</span>
            <span class="module-0-dropzone-text">Drag and drop a file here, or <strong>browse</strong></span>
            <span class="module-0-dropzone-formats">PDF, DOCX, or TXT — max 10 MB</span>
          </div>
        </div>
        <p id="module0FileChosen" class="module-0-file-chosen" style="display:none;"></p>
        <button type="button" id="module0UploadBtn" class="btn-primary module-submit module-0-upload-btn" disabled>Upload and fill</button>
        <p id="module0UploadStatus" class="module-0-upload-status"></p>
      </div>
    `;
    container.appendChild(uploadCard);
    const dropzone = uploadCard.querySelector('#module0Dropzone');
    const fileInput = uploadCard.querySelector('#module0DocumentInput');
    const fileChosenEl = uploadCard.querySelector('#module0FileChosen');
    const uploadBtn = uploadCard.querySelector('#module0UploadBtn');
    const statusEl = uploadCard.querySelector('#module0UploadStatus');
    let uploadInProgress = false;
    if (lastModule0UploadedFileName && statusEl) {
      statusEl.textContent = 'Uploaded: ' + lastModule0UploadedFileName + '. Fields updated below.';
      statusEl.style.color = '#0a0';
      lastModule0UploadedFileName = '';
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function isValidFile(file) {
      if (!file || !file.name) return false;
      const n = file.name.toLowerCase();
      const t = (file.type || '').toLowerCase();
      return /\.(pdf|docx|txt)$/.test(n) || t.includes('pdf') || t.includes('wordprocessingml') || t === 'text/plain';
    }

    function setFile(file) {
      if (!file || !isValidFile(file)) {
        if (fileChosenEl) { fileChosenEl.style.display = 'none'; fileChosenEl.textContent = ''; }
        if (statusEl) { statusEl.textContent = 'Please choose a PDF, DOCX, or TXT file.'; statusEl.style.color = '#c00'; }
        uploadBtn.disabled = true;
        return;
      }
      fileInput.files = null;
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      if (fileChosenEl) {
        fileChosenEl.textContent = 'Selected: ' + file.name + (file.size != null ? ' (' + formatSize(file.size) + ')' : '');
        fileChosenEl.style.display = 'block';
      }
      if (statusEl) statusEl.textContent = '';
      uploadBtn.disabled = false;
    }

    async function doUpload(file) {
      if (!file || !isValidFile(file)) return;
      if (uploadInProgress) return;
      uploadInProgress = true;
      uploadBtn.disabled = true;
      if (statusEl) { statusEl.textContent = 'Parsing document...'; statusEl.style.color = '#666'; }
      try {
        const formData = new FormData();
        formData.append('document', file);
        const res = await fetch(`${API_BASE}/module-0/parse-document`, { method: 'POST', credentials: 'include', body: formData });
        const contentType = res.headers.get('content-type') || '';
        let data = {};
        if (contentType.includes('application/json')) {
          try { data = await res.json(); } catch (_) {}
        }
        if (res.ok && data.success && data.answers) {
          moduleAnswers['module-0'] = { ...(moduleAnswers['module-0'] || {}), ...data.answers };
          applyModule0Answers(moduleAnswers['module-0']);
          const uploadedName = file.name || 'document';
          if (fileChosenEl) { fileChosenEl.style.display = 'none'; fileChosenEl.textContent = ''; }
          if (statusEl) { statusEl.textContent = 'Uploaded: ' + uploadedName + '. Fields updated below.'; statusEl.style.color = '#0a0'; }
          fileInput.value = '';
          uploadBtn.disabled = false;
          uploadInProgress = false;
          return;
        }
        if (statusEl) { statusEl.textContent = (data && data.message) || (res.status === 404 ? 'Upload service not available. Restart the server and try again.' : 'Upload failed.'); statusEl.style.color = '#c00'; }
      } catch (e) {
        console.error(e);
        if (statusEl) { statusEl.textContent = 'Something went wrong. Please try again.'; statusEl.style.color = '#c00'; }
      }
      uploadBtn.disabled = false;
      uploadInProgress = false;
    }

    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('module-0-dropzone-active'); });
    dropzone.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('module-0-dropzone-active'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('module-0-dropzone-active');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) setFile(file);
    });
    dropzone.addEventListener('click', (e) => {
      if (e.target === fileInput) return;
      e.preventDefault();
      fileInput.click();
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      setFile(file);
    });
    uploadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (uploadInProgress) return;
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (file) doUpload(file);
    });
  }

  // Module 1 = College Match as slides: intro → safeties → targets → reaches (prompts from course, editable in admin)
  if (mod.id === 'module-1' && mod.pages && mod.pages.length >= 4) {
    const pages = mod.pages;
    const wrap = document.createElement('div');
    wrap.className = 'college-match-wrap';
    wrap.innerHTML = `
      <div class="course-pages-wrap" id="module1SlideWrap"></div>
      <section id="collegeListSection" class="college-list-section" style="margin-top:32px;padding-top:24px;border-top:1px solid #e0e0e0;">
        <h2 class="college-list-title">My college list</h2>
        <div id="collegeListItems" class="college-list-items"></div>
      </section>
      <div id="collegeDetailModal" class="college-detail-modal" style="display:none;" role="dialog" aria-modal="true">
        <div class="college-detail-backdrop"></div>
        <div class="college-detail-panel">
          <button type="button" class="college-detail-close" aria-label="Close">&times;</button>
          <h3 id="collegeDetailName" class="college-detail-name"></h3>
          <div id="collegeDetailBody" class="college-detail-body"></div>
          <div id="collegeDetailLoading" class="college-detail-loading" style="display:none;">Loading...</div>
        </div>
      </div>
    `;
    container.appendChild(wrap);

    const slideWrap = wrap.querySelector('#module1SlideWrap');
    const listSection = wrap.querySelector('#collegeListSection');
    const listItems = wrap.querySelector('#collegeListItems');
    const modal = wrap.querySelector('#collegeDetailModal');
    const detailName = wrap.querySelector('#collegeDetailName');
    const detailBody = wrap.querySelector('#collegeDetailBody');
    const detailLoading = wrap.querySelector('#collegeDetailLoading');
    const detailClose = wrap.querySelector('.college-detail-close');
    const backdrop = wrap.querySelector('.college-detail-backdrop');

    let myList = [];
    const pageStorageKey = 'pathwise-module-' + mod.id + '-page';
    let currentPageIndex = Math.min(Math.max(0, parseInt(localStorage.getItem(pageStorageKey), 10) || 0), pages.length - 1);
    let previousPageIndex = -1;
    function saveModulePage() {
      try { localStorage.setItem(pageStorageKey, String(currentPageIndex)); } catch (_) {}
    }
    let strategyData = { safeties: null, targets: null, reaches: null };
    let currentStrategyController = null;

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : text;
      return div.innerHTML;
    }
    function collegeDisplayName(name) {
      return (name || '').replace(/\*+/g, '').trim() || (name || '');
    }

    function sanitizeHtml(html) {
      if (!html || !html.trim()) return '';
      const allowedTags = { p: true, br: true, strong: true, b: true, em: true, i: true, span: true, ul: true, ol: true, li: true };
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      function sanitizeNode(node) {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        if (!allowedTags[tag]) return Array.from(node.childNodes).map(sanitizeNode).join('');
        let attrs = tag === 'span' && node.getAttribute('style') ? ' style="' + (node.getAttribute('style').match(/color\s*:[^;]+/) ? node.getAttribute('style') : '') + '"' : '';
        const inner = Array.from(node.childNodes).map(sanitizeNode).join('');
        return tag === 'br' ? '<br>' : '<' + tag + attrs + '>' + inner + '</' + tag + '>';
      }
      return Array.from(tmp.childNodes).map(sanitizeNode).join('');
    }

    function renderMyList() {
      listItems.innerHTML = '';
      if (myList.length === 0) {
        listItems.innerHTML = '<p class="college-list-empty">No colleges in your list yet. Add some from the slides above.</p>';
        return;
      }
      myList.forEach(c => {
        const card = document.createElement('div');
        card.className = 'college-list-card';
        card.innerHTML = `
          <div class="college-list-card-main">
            <span class="college-list-card-name">${escapeHtml(collegeDisplayName(c.name))}</span>
            ${c.blurb ? `<span class="college-list-card-blurb">${escapeHtml(c.blurb)}</span>` : ''}
          </div>
          <div class="college-list-card-actions">
            <button type="button" class="college-list-card-info">More info</button>
            <button type="button" class="college-list-card-remove">Remove</button>
          </div>
        `;
        card.querySelector('.college-list-card-info').addEventListener('click', () => openDetail(c.name));
        card.querySelector('.college-list-card-remove').addEventListener('click', () => removeFromList(c.name));
        listItems.appendChild(card);
      });
    }

    async function loadMyList() {
      try {
        const res = await fetch(`${API_BASE}/college-list`, { credentials: 'include' });
        const contentType = res.headers.get('content-type') || '';
        let data = {};
        if (res.ok && contentType.includes('application/json')) {
          try { data = await res.json(); } catch (_) { data = {}; }
        }
        if (data.success && Array.isArray(data.list)) {
          myList = data.list;
          renderMyList();
        }
      } catch (e) { console.error(e); }
    }

    async function addToList(college) {
      try {
        const res = await fetch(`${API_BASE}/college-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ add: { name: college.name, blurb: college.blurb || '' } })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.list)) {
          myList = data.list;
          renderMyList();
          const addedName = (college && college.name) ? String(college.name).trim() : '';
          if (addedName) refreshDatesForOneCollegeInBackground(addedName);
        }
      } catch (e) { console.error(e); }
    }

    async function removeFromList(name) {
      try {
        const res = await fetch(`${API_BASE}/college-list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ remove: name })
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.list)) {
          myList = data.list;
          renderMyList();
        }
      } catch (e) { console.error(e); }
    }

    function refreshDatesForOneCollegeInBackground(collegeName) {
      const name = (collegeName || '').trim();
      if (!name) return;
      fetch(`${API_BASE}/college-details?name=${encodeURIComponent(name)}`, { credentials: 'include' })
        .then(() => {})
        .catch(() => {});
    }

    function refreshCollegeListDatesInBackground() {
      fetch(`${API_BASE}/college-list/refresh-dates`, { method: 'POST', credentials: 'include' }).catch(() => {});
    }

    // Build stats line in one consistent order (same as box): GPA | SAT | ACT | cost | acceptance rate
    function buildStatsLine(obj) {
      const str = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : '';
      const parts = [];
      if (str(obj.gpa)) parts.push('Average GPA: ' + escapeHtml(str(obj.gpa)));
      if (str(obj.sat)) parts.push('Average SAT: ' + escapeHtml(str(obj.sat)));
      if (str(obj.act)) parts.push('Average ACT: ' + escapeHtml(str(obj.act)));
      if (str(obj.costAfterAid)) parts.push('Average cost after aid: ' + escapeHtml(str(obj.costAfterAid)));
      let acceptanceRateVal = str(obj.acceptanceRate) || str(obj.acceptance_rate);
      if (!acceptanceRateVal && obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (/acceptance/i.test(key) && (key === 'acceptance' || key.includes('rate') || key.includes('Rate'))) {
            const v = str(obj[key]);
            if (v) { acceptanceRateVal = v; break; }
          }
        }
      }
      parts.push('Acceptance rate: ' + (acceptanceRateVal ? escapeHtml(acceptanceRateVal) : '---'));
      return parts.length ? '<p class="college-detail-stats">' + parts.join(' | ') + '</p>' : '';
    }

    function openDetail(name, boxCollege) {
      detailName.textContent = collegeDisplayName(name);
      detailBody.innerHTML = '';
      detailBody.style.display = 'none';
      detailLoading.style.display = 'block';
      modal.style.display = 'flex';
      fetch(`${API_BASE}/college-details?name=${encodeURIComponent(name)}`, { credentials: 'include' })
        .then(r => r.json())
        .then(data => {
          detailLoading.style.display = 'none';
          detailBody.style.display = 'block';
          const parts = [];
          if (boxCollege) {
            const statsHtml = buildStatsLine(boxCollege);
            if (statsHtml) parts.push(statsHtml);
          } else if (data.success) {
            const statsHtml = buildStatsLine(data);
            if (statsHtml) parts.push(statsHtml);
          }
          if (data.success) {
            if (data.location && String(data.location).trim()) {
              parts.push('<p class="college-detail-meta"><strong>Location:</strong> ' + escapeHtml(String(data.location).trim()) + '</p>');
            }
            const str = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : '';
            const dash = '\u2014';
            const rea = str(data.rea) || dash;
            const ea = str(data.ea) || dash;
            const ed = str(data.ed) || dash;
            const rd = str(data.rd) || dash;
            parts.push('<p class="college-detail-stats">REA: ' + escapeHtml(rea) + ' | EA: ' + escapeHtml(ea) + ' | ED: ' + escapeHtml(ed) + ' | RD: ' + escapeHtml(rd) + '</p>');
            const desc = data.details && String(data.details).trim();
            if (desc) {
              const raw = desc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              const paragraphs = raw.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
              const descHtml = paragraphs.length
                ? paragraphs.map(para => '<p class="college-detail-desc">' + sanitizeHtml(para.replace(/\n/g, '<br>')) + '</p>').join('')
                : '<p class="college-detail-desc">' + sanitizeHtml(desc.replace(/\n/g, '<br>')) + '</p>';
              parts.push('<div class="college-detail-description">' + descHtml + '</div>');
            }
          }
          if (parts.length === 0) detailBody.textContent = 'Could not load details.';
          else detailBody.innerHTML = parts.join('');
        })
        .catch(() => {
          detailLoading.style.display = 'none';
          detailBody.style.display = 'block';
          if (boxCollege) {
            const statsHtml = buildStatsLine(boxCollege);
            detailBody.innerHTML = statsHtml || 'Could not load details.';
          } else {
            detailBody.textContent = 'Could not load details.';
          }
        });
    }

    function closeDetail() { modal.style.display = 'none'; }
    if (detailClose) detailClose.addEventListener('click', closeDetail);
    if (backdrop) backdrop.addEventListener('click', closeDetail);

    function renderCollegeBoxesInto(container, colleges, opts) {
      const isUserList = opts && opts.isUserList;
      if (!container) return;
      container.innerHTML = '';
      (colleges || []).forEach(c => {
        const inList = myList.some(m => m.name === c.name);
        const box = document.createElement('div');
        box.className = 'college-box';
        box.setAttribute('tabindex', '0');
        const statsParts = [];
        const str = (v) => (v != null && String(v).trim() !== '') ? String(v).trim() : '';
        if (str(c.gpa)) statsParts.push('Average GPA: ' + escapeHtml(str(c.gpa)));
        if (str(c.sat)) statsParts.push('Average SAT: ' + escapeHtml(str(c.sat)));
        if (str(c.act)) statsParts.push('Average ACT: ' + escapeHtml(str(c.act)));
        if (str(c.costAfterAid)) statsParts.push('Average cost after aid: ' + escapeHtml(str(c.costAfterAid)));
        let acceptanceRateVal = str(c.acceptanceRate) || str(c.acceptance_rate);
        if (!acceptanceRateVal && c && typeof c === 'object') {
          for (const key of Object.keys(c)) {
            if (/acceptance/i.test(key) && (key === 'acceptance' || key.includes('rate') || key.includes('Rate'))) {
              const v = str(c[key]);
              if (v) { acceptanceRateVal = v; break; }
            }
          }
        }
        statsParts.push('Acceptance rate: ' + (acceptanceRateVal ? escapeHtml(acceptanceRateVal) : '---'));
        const statsHtml = statsParts.length ? `<div class="college-box-stats">${statsParts.join(' | ')}</div>` : '';
        if (isUserList) {
          box.innerHTML = `
            <div class="college-box-content">
              <div class="college-box-header">${escapeHtml(collegeDisplayName(c.name))}</div>
              ${statsHtml}
              ${c.blurb ? `<div class="college-box-blurb">${escapeHtml(c.blurb)}</div>` : ''}
            </div>
            <div class="college-box-actions">
              <button type="button" class="college-box-info">More info</button>
              <button type="button" class="college-box-remove">Remove</button>
            </div>
          `;
          box.querySelector('.college-box-info').addEventListener('click', (e) => { e.stopPropagation(); openDetail(c.name); });
          box.querySelector('.college-box-remove').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromList(c.name).then(() => loadMyList().then(() => renderModule1Page()));
          });
        } else {
          box.innerHTML = `
            <div class="college-box-content">
              <div class="college-box-header">${escapeHtml(collegeDisplayName(c.name))}</div>
              ${statsHtml}
              ${c.blurb ? `<div class="college-box-blurb">${escapeHtml(c.blurb)}</div>` : ''}
            </div>
            <div class="college-box-actions">
              <button type="button" class="college-box-info">More info</button>
              <button type="button" class="college-box-add" ${inList ? 'disabled' : ''}>${inList ? 'In list' : 'Add to list'}</button>
            </div>
          `;
          box.querySelector('.college-box-info').addEventListener('click', (e) => { e.stopPropagation(); openDetail(c.name, c); });
          const addBtn = box.querySelector('.college-box-add');
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!inList) addToList(c).then(() => { addBtn.textContent = 'In list'; addBtn.disabled = true; renderMyList(); });
          });
        }
        box.addEventListener('click', (e) => { if (!e.target.closest('button')) openDetail(c.name, c); });
        box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(c.name, c); } });
        container.appendChild(box);
      });
    }

    function renderModule1Page() {
      if (currentStrategyController) { try { currentStrategyController.abort(); } catch (_) {} currentStrategyController = null; }
      const page = pages[currentPageIndex];
      if (!page) return;
      const isFirst = currentPageIndex === 0;
      const isLast = currentPageIndex === pages.length - 1;
      const pageId = page.id || '';

      if (pageId === 'intro') {
        const rawContent = (page.content || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let contentHtml = '';
        if (rawContent) {
          const paragraphs = rawContent.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          contentHtml = paragraphs.map(para => {
            const hasHtml = para.indexOf('<') >= 0;
            const inner = hasHtml ? sanitizeHtml(para) : escapeHtml(para);
            return '<p>' + inner.replace(/\n/g, '<br>') + '</p>';
          }).join('');
        }
        slideWrap.innerHTML = `
          <div class="course-page-card">
            <div class="course-progress">Slide ${currentPageIndex + 1} of ${pages.length}</div>
            <h2 class="course-page-title">${escapeHtml(page.title)}</h2>
            <div class="course-page-content">${contentHtml}</div>
            <div class="course-nav">
              <button type="button" class="course-btn course-btn-back" ${isFirst ? 'disabled' : ''}>← Back</button>
              <button type="button" class="course-btn course-btn-next">Next →</button>
            </div>
          </div>
        `;
      } else if (pageId === 'search-college') {
        const rawContent = (page.content || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let contentHtml = '';
        if (rawContent) {
          const paragraphs = rawContent.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          contentHtml = paragraphs.map(para => {
            const hasHtml = para.indexOf('<') >= 0;
            const inner = hasHtml ? sanitizeHtml(para) : escapeHtml(para);
            return '<p>' + inner.replace(/\n/g, '<br>') + '</p>';
          }).join('');
        }
        slideWrap.innerHTML = `
          <div class="course-page-card">
            <div class="course-progress">Slide ${currentPageIndex + 1} of ${pages.length}</div>
            <h2 class="course-page-title">${escapeHtml(page.title)}</h2>
            <div class="course-page-content">${contentHtml}</div>
            <div class="college-search-wrap" style="margin-top:20px;">
              <label for="module1CollegeSearch" style="display:block;font-weight:600;margin-bottom:8px;">College name</label>
              <div style="position:relative;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-start;">
                <div style="position:relative;flex:1;min-width:200px;">
                  <input type="text" id="module1CollegeSearch" placeholder="Type to search, then select from dropdown" autocomplete="off" style="width:100%;padding:10px 14px;border:2px solid #e0e0e0;border-radius:8px;font-size:1rem;">
                  <div id="module1CollegeSuggest" class="college-suggest-dropdown" style="display:none;position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:2px solid #e0e0e0;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);max-height:240px;overflow-y:auto;z-index:100;"></div>
                </div>
                <button type="button" id="module1CollegeSearchAdd" class="course-btn" style="padding:10px 20px;">Add to list</button>
              </div>
              <p id="module1CollegeSearchMsg" style="margin-top:10px;font-size:0.9rem;color:#666;min-height:1.4em;"></p>
            </div>
            <div class="course-nav" style="margin-top:24px;">
              <button type="button" class="course-btn course-btn-back" ${isFirst ? 'disabled' : ''}>← Back</button>
              <button type="button" class="course-btn course-btn-next">${isLast ? 'Finish' : 'Next →'}</button>
            </div>
          </div>
        `;
        const searchInput = slideWrap.querySelector('#module1CollegeSearch');
        const addBtn = slideWrap.querySelector('#module1CollegeSearchAdd');
        const msgEl = slideWrap.querySelector('#module1CollegeSearchMsg');
        const suggestEl = slideWrap.querySelector('#module1CollegeSuggest');
        let suggestDebounce = null;

        async function resolveCollegeName(input) {
          const q = (input || '').trim();
          if (!q || q.length < 2) return q;
          try {
            const res = await fetch(`${API_BASE}/college-suggest?q=${encodeURIComponent(q)}`, { credentials: 'include' });
            const data = await res.json();
            const list = (data.suggestions && Array.isArray(data.suggestions)) ? data.suggestions : [];
            if (list.length === 0) return q;
            const exact = list.find(s => String(s).trim().toLowerCase() === q.toLowerCase());
            if (exact) return String(exact).trim();
            return String(list[0]).trim();
          } catch (_) {
            return q;
          }
        }

        async function doAddCollege(name) {
          let n = (name || '').trim();
          if (!n) {
            if (msgEl) { msgEl.textContent = 'Enter or select a college name.'; msgEl.style.color = '#c00'; }
            return;
          }
          n = await resolveCollegeName(n);
          if (msgEl) msgEl.textContent = '';
          if (myList.some(c => (c.name || '').trim().toLowerCase() === n.trim().toLowerCase())) {
            if (msgEl) { msgEl.textContent = 'College already added.'; msgEl.style.color = '#c00'; }
            searchInput.value = '';
            if (suggestEl) suggestEl.style.display = 'none';
            return;
          }
          addBtn.disabled = true;
          if (suggestEl) suggestEl.style.display = 'none';
          try {
            let blurb = '';
            try {
              const res = await fetch(`${API_BASE}/college-details?name=${encodeURIComponent(n)}&blurbOnly=1`, { credentials: 'include' });
              const data = await res.json();
              if (res.ok && data.success && data.details) blurb = (data.details || '').trim();
            } catch (_) {}
            const postRes = await fetch(`${API_BASE}/college-list`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ add: { name: n, blurb }, resolveName: true })
            });
            const postData = await postRes.json();
            if (postRes.ok && postData.success) {
              searchInput.value = '';
              const addedName = (postData.list && postData.list.length > 0) ? postData.list[postData.list.length - 1].name : n;
              if (postData.list && Array.isArray(postData.list)) {
                myList = postData.list;
                renderMyList();
              } else {
                await loadMyList();
              }
              if (addedName) refreshDatesForOneCollegeInBackground(addedName);
              if (postData.alreadyAdded) {
                if (msgEl) { msgEl.textContent = 'College already added.'; msgEl.style.color = '#c00'; }
              } else {
                if (msgEl) { msgEl.textContent = `"${escapeHtml(addedName)}" added to your list.`; msgEl.style.color = '#0a0'; }
              }
            } else {
              if (msgEl) { msgEl.textContent = postData.message || 'Could not add. Try again.'; msgEl.style.color = '#c00'; }
            }
          } catch (e) {
            console.error(e);
            if (msgEl) { msgEl.textContent = 'Something went wrong. Please try again.'; msgEl.style.color = '#c00'; }
          }
          addBtn.disabled = false;
        }

        addBtn.addEventListener('click', () => doAddCollege(searchInput.value));

        searchInput.addEventListener('input', () => {
          if (suggestDebounce) clearTimeout(suggestDebounce);
          const q = (searchInput.value || '').trim();
          if (q.length < 2) {
            if (suggestEl) { suggestEl.innerHTML = ''; suggestEl.style.display = 'none'; }
            return;
          }
          suggestDebounce = setTimeout(async () => {
            try {
              const res = await fetch(`${API_BASE}/college-suggest?q=${encodeURIComponent(q)}`, { credentials: 'include' });
              const data = await res.json();
              const list = (data.suggestions && Array.isArray(data.suggestions)) ? data.suggestions : [];
              if (!suggestEl) return;
              suggestEl.innerHTML = '';
              if (list.length === 0) {
                suggestEl.innerHTML = '<div style="padding:12px;color:#666;font-size:0.9rem;">No suggestions. Type the full name and click Add to list.</div>';
              } else {
                list.forEach((name) => {
                  const opt = document.createElement('div');
                  opt.className = 'college-suggest-option';
                  opt.textContent = name;
                  opt.style.cssText = 'padding:10px 14px;cursor:pointer;font-size:0.95rem;border-bottom:1px solid #eee;';
                  opt.addEventListener('mouseenter', () => { opt.style.background = '#f0f4ff'; });
                  opt.addEventListener('mouseleave', () => { opt.style.background = ''; });
                  opt.addEventListener('click', () => { doAddCollege(name); });
                  suggestEl.appendChild(opt);
                });
              }
              suggestEl.style.display = 'block';
            } catch (_) {
              if (suggestEl) suggestEl.style.display = 'none';
            }
          }, 300);
        });

        searchInput.addEventListener('focus', () => {
          if (suggestEl && suggestEl.innerHTML.trim()) suggestEl.style.display = 'block';
        });
        searchInput.addEventListener('blur', () => {
          setTimeout(() => { if (suggestEl) suggestEl.style.display = 'none'; }, 200);
        });
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
          }
        });
      } else if (pageId === 'safeties' || pageId === 'targets' || pageId === 'reaches') {
        if (currentStrategyController) { try { currentStrategyController.abort(); } catch (_) {} currentStrategyController = null; }
        const catKey = pageId === 'safeties' ? 'safeties' : pageId === 'targets' ? 'targets' : 'reaches';
        const isEnteringSlide = currentPageIndex !== previousPageIndex;
        if (isEnteringSlide) {
          strategyData[catKey] = null;
          previousPageIndex = currentPageIndex;
        }
        const list = strategyData[catKey] !== null && strategyData[catKey] !== undefined ? strategyData[catKey] : [];
        const isLoading = strategyData[catKey] === null;
        const loadingOrError = isLoading
          ? `<div id="module1StrategyLoading" class="college-strategy-loading">
               <p class="college-strategy-loading-text">Generating your ${page.title.toLowerCase()} recommendations…</p>
               <div class="college-strategy-loading-bar-wrap"><div class="college-strategy-loading-bar"></div></div>
             </div>
             <div id="module1StrategyError" class="college-strategy-error" style="display:none;"></div>`
          : '';
        const noDataMessage = !isLoading && list.length === 0
          ? `<p class="college-strategy-desc" style="color:#666;">No new colleges in this category. You may have already added similar schools.</p>
             <button type="button" id="module1StrategyTryAgain" class="course-btn" style="margin-top:12px;">Try again</button>`
          : '';
        const boxesHtml = list.length
          ? `<div id="module1CollegeBoxes" class="college-match-grid" style="margin-top:20px;"></div>`
          : '';
        slideWrap.innerHTML = `
          <div class="course-page-card">
            <div class="course-progress">Slide ${currentPageIndex + 1} of ${pages.length}</div>
            <h2 class="course-page-title">${escapeHtml(page.title)}</h2>
            ${loadingOrError}
            ${noDataMessage}
            ${boxesHtml}
            <div class="course-nav" style="margin-top:24px;">
              <button type="button" class="course-btn course-btn-back" ${isFirst ? 'disabled' : ''}>← Back</button>
              <button type="button" class="course-btn course-btn-next">${isLast ? 'Finish' : 'Next →'}</button>
            </div>
          </div>
        `;
        if (list.length) {
          const boxesEl = slideWrap.querySelector('#module1CollegeBoxes');
          if (boxesEl) renderCollegeBoxesInto(boxesEl, list);
        }
        if (isLoading) {
          (async () => {
            const loadingEl = slideWrap.querySelector('#module1StrategyLoading');
            const errorEl = slideWrap.querySelector('#module1StrategyError');
            const controller = new AbortController();
            currentStrategyController = controller;
            const timeoutId = setTimeout(() => controller.abort(), 120000);
            try {
              let m0Answers = moduleAnswers['module-0'] || {};
              if (Object.keys(m0Answers).length === 0) {
                const rRes = await fetch(`${API_BASE}/my-responses`, { credentials: 'include', signal: controller.signal });
                if (rRes.ok) {
                  const rList = await rRes.json();
                  const toTime = (r) => (r.timestamp || r.submittedAt) ? new Date(r.timestamp || r.submittedAt).getTime() : 0;
                  const m0Candidates = (rList || []).filter(r => {
                    const mid = (r.moduleId || r.module || '').trim().toLowerCase();
                    return mid === 'module-0' || mid === '';
                  });
                  const m0 = m0Candidates.sort((a, b) => toTime(b) - toTime(a))[0];
                  if (m0 && m0.answers && Object.keys(m0.answers).length > 0) {
                    m0Answers = m0.answers;
                    moduleAnswers['module-0'] = m0Answers;
                  }
                }
              }
              const res = await fetch(`${API_BASE}/college-strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  category: catKey,
                  allAnswers: m0Answers
                }),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              if (loadingEl) loadingEl.style.display = 'none';
              const contentType = res.headers.get('content-type') || '';
              let data = {};
              if (contentType.includes('application/json')) try { data = await res.json(); } catch (_) {}
              if (!res.ok || !data.success) {
                if (errorEl) { errorEl.textContent = (data && data.message) || 'AI is not available. Add ANTHROPIC_API_KEY to .env and restart the server.'; errorEl.style.display = 'block'; }
                strategyData[catKey] = [];
                return;
              }
              strategyData[catKey] = data.colleges ?? data[catKey] ?? [];
              await loadMyList();
              renderModule1Page();
            } catch (e) {
              clearTimeout(timeoutId);
              if (loadingEl) loadingEl.style.display = 'none';
              if (errorEl) {
                errorEl.textContent = e.name === 'AbortError' ? 'Request timed out or cancelled (tab switched). Try again.' : (e.message || 'Something went wrong. Please try again.');
                errorEl.style.display = 'block';
              }
              strategyData[catKey] = [];
              console.error(e);
            } finally {
              if (currentStrategyController === controller) currentStrategyController = null;
            }
          })();
        }
        slideWrap.querySelector('#module1StrategyTryAgain')?.addEventListener('click', () => {
          strategyData[catKey] = null;
          renderModule1Page();
        });
      } else {
        // Content-only slide (e.g. "The Framework", or any custom page added in admin)
        const rawContent = (page.content || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        let contentHtml = '';
        if (rawContent) {
          const paragraphs = rawContent.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
          contentHtml = paragraphs.map(para => {
            const hasHtml = para.indexOf('<') >= 0;
            const inner = hasHtml ? sanitizeHtml(para) : escapeHtml(para);
            return '<p>' + inner.replace(/\n/g, '<br>') + '</p>';
          }).join('');
        }
        const activityHtml = page.activity
          ? `<div class="course-activity" style="margin-top:20px;"><div class="course-activity-label">Activity</div><div class="course-activity-prompt">${sanitizeHtml((page.activity || '').replace(/\n/g, '<br>'))}</div><textarea class="course-activity-input" rows="4" placeholder="Your response..."></textarea></div>`
          : '';
        slideWrap.innerHTML = `
          <div class="course-page-card">
            <div class="course-progress">Slide ${currentPageIndex + 1} of ${pages.length}</div>
            <h2 class="course-page-title">${escapeHtml(page.title)}</h2>
            <div class="course-page-content">${contentHtml}</div>
            ${activityHtml}
            <div class="course-nav" style="margin-top:24px;">
              <button type="button" class="course-btn course-btn-back" ${isFirst ? 'disabled' : ''}>← Back</button>
              <button type="button" class="course-btn course-btn-next">${isLast ? 'Finish' : 'Next →'}</button>
            </div>
          </div>
        `;
      }

    }

    // One-time delegated Back/Next (capture phase so we run first and always abort)
    function onNavClick(e) {
      const back = e.target.closest('.course-btn-back');
      const next = e.target.closest('.course-btn-next');
      if (back && !back.disabled) {
        if (currentStrategyController) { try { currentStrategyController.abort(); } catch (_) {} currentStrategyController = null; }
        if (currentPageIndex > 0) { currentPageIndex--; saveModulePage(); renderModule1Page(); }
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (next && !next.disabled) {
        if (currentStrategyController) { try { currentStrategyController.abort(); } catch (_) {} currentStrategyController = null; }
        const last = currentPageIndex === pages.length - 1;
        if (last) {
          saveModulePage();
          const idx = course.modules.findIndex(m => m.id === mod.id);
          const nextMod = course.modules[idx + 1];
          if (nextMod) {
            window.location.href = `/module/${encodeURIComponent(nextMod.id)}`;
          } else {
            window.location.href = '/modules';
          }
        } else {
          currentPageIndex++;
          saveModulePage();
          renderModule1Page();
        }
        e.preventDefault();
        e.stopPropagation();
      }
    }
    slideWrap.addEventListener('click', onNavClick, true);
    backLink.addEventListener('click', () => { saveModulePage(); });

    (async function init() {
      await loadMyList();
      renderModule1Page();
    })();
    return;
  }

  // Any module with pages (except module-1): course-style pages (next/back, content + activities per page)
  if (mod.id !== 'module-1' && mod.pages && mod.pages.length > 0) {
    const pages = mod.pages;
    const pageStorageKey = 'pathwise-module-' + mod.id + '-page';
    let currentPageIndex = Math.min(Math.max(0, parseInt(localStorage.getItem(pageStorageKey), 10) || 0), pages.length - 1);
    function saveModulePage() {
      try { localStorage.setItem(pageStorageKey, String(currentPageIndex)); } catch (_) {}
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function sanitizeHtml(html) {
      if (!html || !html.trim()) return '';
      const allowedTags = { p: true, br: true, strong: true, b: true, em: true, i: true, span: true, ul: true, ol: true, li: true };
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      function sanitizeNode(node) {
        if (node.nodeType === 3) return node.textContent;
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        if (!allowedTags[tag]) return Array.from(node.childNodes).map(sanitizeNode).join('');
        let attrs = '';
        if (tag === 'span') {
          const style = node.getAttribute('style');
          const colorPart = style && style.match(/color\s*:\s*[#\w\s,.]+/i);
          if (colorPart) attrs = ' style="' + colorPart[0].trim() + '"';
          else if (style) return Array.from(node.childNodes).map(sanitizeNode).join('');
        }
        const inner = Array.from(node.childNodes).map(sanitizeNode).join('');
        if (tag === 'br') return '<br>';
        return '<' + tag + attrs + '>' + inner + '</' + tag + '>';
      }
      return Array.from(tmp.childNodes).map(sanitizeNode).join('');
    }

    function renderModule2Page() {
      const page = pages[currentPageIndex];
      if (!page) return;
      const isFirst = currentPageIndex === 0;
      const isLast = currentPageIndex === pages.length - 1;
      const rawContent = (page.content || '').trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      let contentHtml = '';
      if (rawContent) {
        const paragraphs = rawContent.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
        contentHtml = paragraphs.map(para => {
          const hasHtml = para.indexOf('<') >= 0;
          const inner = hasHtml ? sanitizeHtml(para) : escapeHtml(para);
          return '<p>' + inner.replace(/\n/g, '<br>') + '</p>';
        }).join('');
      }
      const activityHtml = page.activity
        ? `<div class="course-activity"><div class="course-activity-label">Activity</div><div class="course-activity-prompt">${sanitizeHtml((page.activity || '').replace(/\n/g, '<br>'))}</div><textarea class="course-activity-input" rows="4" placeholder="Your response..."></textarea></div>`
        : '';
      const cardClass = page.fullWidth ? 'course-page-card course-page-card-fullwidth' : 'course-page-card';
      const rightTextAreaHtml = page.rightTextArea
        ? `<div class="course-page-right-column"><label class="course-right-label">Your ideas</label><textarea class="course-right-textarea" placeholder="Brainstorm topics, jot down moments that shaped you, or draft rough ideas..."></textarea></div>`
        : '';
      const bodyLayout = page.rightTextArea
        ? `<div class="course-page-two-col"><div class="course-page-left-column"><div class="course-page-content">${contentHtml}</div>${activityHtml}</div>${rightTextAreaHtml}</div>`
        : `<div class="course-page-content">${contentHtml}</div>${activityHtml}`;
      coursePageWrap.innerHTML = `
        <div class="${cardClass}">
          <div class="course-progress">Page ${currentPageIndex + 1} of ${pages.length}</div>
          <h2 class="course-page-title">${escapeHtml(page.title)}</h2>
          ${bodyLayout}
          <div class="course-nav">
            <button type="button" class="course-btn course-btn-back" ${isFirst ? 'disabled' : ''}>← Back</button>
            <button type="button" class="course-btn course-btn-next">${isLast ? 'Finish' : 'Next →'}</button>
          </div>
        </div>
      `;
      const backBtn = coursePageWrap.querySelector('.course-btn-back');
      const nextBtn = coursePageWrap.querySelector('.course-btn-next');
      if (backBtn && !isFirst) {
        backBtn.addEventListener('click', () => {
          currentPageIndex--;
          saveModulePage();
          renderModule2Page();
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (isLast) {
            saveModulePage();
            const idx = course.modules.findIndex(m => m.id === mod.id);
            const nextMod = course.modules[idx + 1];
            if (nextMod) {
              window.location.href = `/module/${encodeURIComponent(nextMod.id)}`;
            } else {
              window.location.href = '/modules';
            }
            return;
          }
          currentPageIndex++;
          saveModulePage();
          renderModule2Page();
        });
      }
      const activityInput = coursePageWrap.querySelector('.course-activity-input');
      if (activityInput) {
        requestAnimationFrame(() => autoGrowTextarea(activityInput));
        activityInput.addEventListener('input', () => autoGrowTextarea(activityInput));
      }
      const rightTextarea = coursePageWrap.querySelector('.course-right-textarea');
      if (rightTextarea) {
        const storageKey = 'pathwise-module-' + mod.id + '-page-' + (page.id || currentPageIndex) + '-ideas';
        try {
          const saved = localStorage.getItem(storageKey);
          if (saved) rightTextarea.value = saved;
        } catch (_) {}
        rightTextarea.addEventListener('input', () => {
          try { localStorage.setItem(storageKey, rightTextarea.value); } catch (_) {}
        });
        requestAnimationFrame(() => autoGrowTextarea(rightTextarea));
        rightTextarea.addEventListener('input', () => autoGrowTextarea(rightTextarea));
      }
    }

    const coursePageWrap = document.createElement('div');
    coursePageWrap.className = 'course-pages-wrap';
    container.appendChild(coursePageWrap);
    backLink.addEventListener('click', () => { saveModulePage(); });
    window.addEventListener('beforeunload', () => { saveModulePage(); });
    renderModule2Page();
    return;
  }

  const form = document.createElement('form');
  form.id = `module-form-${mod.id}`;

  const useSections = mod.id === 'module-0' && MODULE0_SECTIONS.length > 0;
  const qIds = mod.questionIds || [];

  if (useSections) {
    const allSectionIds = new Set(MODULE0_SECTIONS.flatMap(s => s.ids));
    MODULE0_SECTIONS.forEach(section => {
      const card = document.createElement('div');
      card.className = 'module-form-card';
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'module-section';
      sectionDiv.innerHTML = `<div class="module-section-title">${section.title}</div>`;
      section.ids.forEach(qId => {
        const q = getQuestionById(qId) || qMap[qId];
        if (q) sectionDiv.appendChild(renderQuestionInput(q, answers));
      });
      card.appendChild(sectionDiv);
      form.appendChild(card);
    });
    // Any questions not in sections
    qIds.forEach(qId => {
      if (!allSectionIds.has(qId)) {
        const q = getQuestionById(qId) || qMap[qId];
        if (q) {
          const card = document.createElement('div');
          card.className = 'module-form-card';
          const sectionDiv = document.createElement('div');
          sectionDiv.className = 'module-section';
          sectionDiv.appendChild(renderQuestionInput(q, answers));
          card.appendChild(sectionDiv);
          form.appendChild(card);
        }
      }
    });
  } else {
    const card = document.createElement('div');
    card.className = 'module-form-card';
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'module-section';
    qIds.forEach(qId => {
      const q = getQuestionById(qId) || qMap[qId];
      if (q) sectionDiv.appendChild(renderQuestionInput(q, answers));
    });
    card.appendChild(sectionDiv);
    form.appendChild(card);
  }

  const submitWrap = document.createElement('div');
  submitWrap.className = 'module-submit-wrap';
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn-primary module-submit';
  submitBtn.textContent = mod.id === 'module-0' ? 'Submit & Continue' : 'Save Module';
  submitWrap.appendChild(submitBtn);
  form.appendChild(submitWrap);
  form.addEventListener('submit', (e) => { e.preventDefault(); submitModule(mod.id); });
  container.appendChild(form);
}

async function submitModule(moduleId) {
  const answers = collectModuleAnswers(moduleId);
  moduleAnswers[moduleId] = answers;

  const isAuth = await isAuthenticated();
  const mod = course.modules.find(m => m.id === moduleId);

  if (mod && mod.free && !isAuth) {
    // Anonymous Module 0 submit -> store answers and go to sign-up page
    const payload = {
      answers,
      questions: (mod.questionIds || []).map(id => getQuestionById(id)).filter(Boolean),
      moduleId
    };
    sessionStorage.setItem('pathwisePendingModule0', JSON.stringify(payload));
    window.location.href = '/login.html?show=register&return=payment';
    return;
  }

  if (!isAuth) {
    window.location.href = '/login.html?return=' + encodeURIComponent('/modules');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        answers,
        questions: (mod.questionIds || []).map(id => getQuestionById(id)).filter(Boolean),
        moduleId
      })
    });
    const data = await res.json();
    if (data.success) {
      alert('Saved successfully.');
      if (moduleId === 'module-0') {
        const paid = await hasPaymentAccess();
        if (paid) {
          window.location.href = '/module/module-1';
        } else {
          window.location.href = '/payment';
        }
      }
    } else {
      alert(data.message || 'Failed to save.');
    }
  } catch (e) {
    console.error(e);
    alert('Failed to save. Please try again.');
  }
}

async function init() {
  const loading = document.getElementById('loading');
  const questionnaireContainer = document.getElementById('questionnaireContainer');
  const modId = getModuleFromUrl();

  isAuth = await isAuthenticated();
  // Anonymous users can only access Module 0
  if (!isAuth && modId !== 'module-0') {
    window.location.href = '/login.html?return=' + encodeURIComponent(location.pathname + location.search);
    return;
  }

  try {
    await loadCourseAndQuestions();
  } catch (e) {
    console.error('Module load failed:', e);
    if (loading) {
      loading.innerHTML = '<p>Failed to load this module. Check your connection and try again.</p>' +
        '<p><a href="/modules" style="color:#4285F4;font-weight:600;">← Back to Tools</a> &nbsp; <a href="/" style="color:#4285F4;">Go home</a></p>';
    }
    return;
  }

  hasPayment = isAuth ? await hasPaymentAccess() : false;
  hasModule0Submitted = false;
  if (isAuth) {
    const responsesRes = await fetch(`${API_BASE}/my-responses`, { credentials: 'include' });
    const responses = responsesRes.ok ? await responsesRes.json() : [];
    // Consider Module 0 submitted if we have a response for module-0, or (legacy) any response missing moduleId
    const hasExplicitModule0 = Array.isArray(responses) && responses.some(r => (r.moduleId || r.module || '') === 'module-0');
    const hasLegacyResponse = Array.isArray(responses) && responses.some(r => (r.moduleId ?? r.module ?? '') === '');
    hasModule0Submitted = hasExplicitModule0 || hasLegacyResponse;
    // Load saved answers for each module (most recent per module)
    const byModule = {};
    (responses || []).forEach(r => {
      const rawMid = (r.moduleId || r.module || '').trim();
      const mid = rawMid ? String(rawMid).toLowerCase() : 'module-0'; // legacy responses = module-0
      if (mid && r.answers) {
        const existing = byModule[mid];
        const rTime = r.timestamp || r.submittedAt || '';
        if (!existing || rTime > (existing.timestamp || existing.submittedAt || '')) {
          byModule[mid] = r;
        }
      }
    });
    Object.keys(byModule).forEach(mid => {
      moduleAnswers[mid] = byModule[mid].answers || {};
    });
  }

  if (questionnaireContainer) questionnaireContainer.style.display = 'block';
  if (loading) loading.style.display = 'none';

  renderModuleForm(modId);
}

document.addEventListener('DOMContentLoaded', init);
