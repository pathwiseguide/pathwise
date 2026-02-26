// Load environment variables from .env file (from app directory so it works regardless of cwd)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

// Import MongoDB database functions
const db = require('./db');

// Stripe (optional – only if STRIPE_SECRET_KEY is set)
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy (required for cookies/sessions behind Fly.io, Render, etc.)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/documents/',
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    // Accept PDFs
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Multer for resume/transcript (Module 0 auto-fill): PDF, TXT, or DOCX
const uploadResume = multer({
  dest: 'uploads/resume/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const ok = file.mimetype === 'application/pdf' || file.mimetype === 'text/plain' || file.mimetype === docxMime ||
      (file.originalname && /\.(pdf|txt|docx)$/i.test(file.originalname));
    if (ok) cb(null, true);
    else cb(new Error('Only PDF, TXT, or DOCX files are allowed'), false);
  }
});

// Ensure uploads directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'documents');
const UPLOADS_RESUME_DIR = path.join(__dirname, 'uploads', 'resume');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_RESUME_DIR)) fs.mkdirSync(UPLOADS_RESUME_DIR, { recursive: true });

// Initialize LLM: Claude (Anthropic) or OpenAI - prefers Claude when ANTHROPIC_API_KEY set
const { hasLLM, hasOpenAIChat, chatComplete, chatCompleteWithMessages, openaiChatComplete, openai } = require('./llm');

// Initialize RAG System (requires OpenAI for embeddings; chat can use Claude)
const { VectorStore, DocumentProcessor, RAGQueryHandler } = require('./rag-system');
const VECTOR_STORE_PATH = path.join(__dirname, 'data', 'vector-store.json');
const vectorStore = new VectorStore(VECTOR_STORE_PATH);
let documentProcessor = null;
let ragQueryHandler = null;

if (openai) {
  documentProcessor = new DocumentProcessor(openai, vectorStore);
  ragQueryHandler = new RAGQueryHandler(documentProcessor, openai, chatComplete);
  console.log('RAG system initialized (embeddings: OpenAI, chat: Claude only)');
} else {
  console.log('RAG system disabled - OPENAI_API_KEY required for embeddings');
}

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'pathwise-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.FORCE_HTTPS !== 'false', // HTTPS only in production (unless disabled)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Better compatibility with Render
  }
}));

// Middleware
app.use(cors({
  origin: true,
  credentials: true // Allow cookies
}));
// Stripe webhook needs raw body for signature verification – register before bodyParser
app.post('/api/payment/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (typeof paymentWebhookHandler === 'function') paymentWebhookHandler(req, res);
  else res.status(500).send('Webhook handler not ready');
});
app.use(bodyParser.json());

// Module pages: use a dedicated router so /module/* is never confused with static or catch-all
const questionnairePath = path.join(__dirname, 'public', 'questionnaire.html');
const moduleRouter = express.Router();
moduleRouter.get('/:moduleId', (req, res) => {
  if (!fs.existsSync(questionnairePath)) {
    return res.status(500).send('questionnaire.html not found');
  }
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(questionnairePath);
});
app.use('/module', moduleRouter);

app.get('/questionnaire.html', (req, res) => {
  const moduleId = req.query.module || 'module-0';
  res.redirect(302, '/module/' + encodeURIComponent(moduleId));
});

// Dashboard and other HTML pages (before express.static)
const dashboardPath = path.join(__dirname, 'public', 'dashboard.html');
app.get('/dashboard', (req, res) => {
  if (!fs.existsSync(dashboardPath)) return res.status(404).send('Dashboard not found');
  res.sendFile(dashboardPath);
});
app.get('/favicon.ico', (req, res) => {
  res.redirect(302, '/favicon.svg');
});
app.get('/modules', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modules.html'));
});
app.get('/counselor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'counselor.html'));
});
app.get('/payment', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'payment.html');
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Payment page not found');
  }
  res.sendFile(filePath);
});

// API routes that must be registered before express.static (to avoid 404 from catch-all)
app.get('/api/course', (req, res) => {
  try {
    const COURSE_FILE = path.join(__dirname, 'data', 'course.json');
    if (!fs.existsSync(COURSE_FILE)) {
      return res.json({ title: 'Pathwise', modules: [] });
    }
    const data = fs.readFileSync(COURSE_FILE, 'utf8');
    const course = JSON.parse(data);
    res.json(course);
  } catch (error) {
    console.error('Error loading course:', error);
    res.status(500).json({ error: 'Failed to load course' });
  }
});

// College Match API (Module 1) - register before express.static so they are never 404'd
const requireLoginEarly = (req, res, next) => {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ success: false, message: 'Please log in to access this resource' });
};
app.get('/api/college-list', requireLoginEarly, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    const list = (user && user.collegeList && Array.isArray(user.collegeList)) ? user.collegeList : [];
    res.json({ success: true, list });
  } catch (e) {
    console.error('Get college list error:', e);
    res.status(500).json({ success: false, message: 'Failed to load college list.' });
  }
});
// More specific path must be registered before POST /api/college-list
app.post('/api/college-list/refresh-dates', requireLoginEarly, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    let list = (user && user.collegeList && Array.isArray(user.collegeList)) ? [...user.collegeList] : [];
    for (let i = 0; i < list.length; i++) {
      const name = (list[i].name || '').trim();
      if (!name) continue;
      const dates = await fetchCollegeDatesOnly(name, req.session.userId);
      list[i] = { ...list[i], rea: dates.rea, ea: dates.ea, ed: dates.ed, rd: dates.rd };
    }
    await db.updateUser(req.session.userId, { collegeList: list });
    res.json({ success: true, list });
  } catch (e) {
    console.error('Refresh college list dates error:', e);
    res.status(500).json({ success: false, message: 'Failed to refresh dates.' });
  }
});
app.post('/api/college-list', requireLoginEarly, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    let list = (user && user.collegeList && Array.isArray(user.collegeList)) ? [...user.collegeList] : [];
    const { add, remove, resolveName } = req.body || {};
    if (add && add.name && typeof add.name === 'string') {
      let name = add.name.trim();
      if (name) {
        if (resolveName === true && name.length >= 2) {
          const abbrevMap = {
            umich: 'University of Michigan',
            ucla: 'University of California, Los Angeles',
            ucb: 'University of California, Berkeley',
            usc: 'University of Southern California',
            unc: 'University of North Carolina at Chapel Hill',
            uva: 'University of Virginia',
            uf: 'University of Florida',
            ut: 'University of Texas at Austin',
            osu: 'Ohio State University',
            uga: 'University of Georgia',
            fsu: 'Florida State University',
            ucf: 'University of Central Florida',
            byu: 'Brigham Young University',
            mit: 'Massachusetts Institute of Technology',
            nyu: 'New York University',
            gtech: 'Georgia Institute of Technology',
            gt: 'Georgia Institute of Technology'
          };
          const lower = name.toLowerCase().trim();
          if (abbrevMap[lower]) {
            name = abbrevMap[lower];
          } else if (hasOpenAIChat || hasLLM) {
            try {
              const useOpenAI = hasOpenAIChat;
              const resolvePrompt = `Resolve to full official US college/university name. If "${name}" is an abbreviation or nickname (e.g. umich, UCLA, USC), return a JSON array with the full official name first, e.g. ["University of Michigan"]. Otherwise return colleges whose full name starts with or contains "${name}". Return ONLY a JSON array of strings. Put the single best match first. No markdown.`;
              const raw = useOpenAI
                ? (await openaiChatComplete('You are a college counselor. Reply with ONLY a valid JSON array of college/university full official names. No other text.', resolvePrompt, { maxTokens: 512, temperature: 0.3 }) || '')
                : (await chatComplete('You are a college counselor. Reply with ONLY a valid JSON array of college/university full official names. No other text.', resolvePrompt, { maxTokens: 512, temperature: 0.3 }) || '');
              const jsonStr = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
              let arr = [];
              try {
                const parsed = JSON.parse(jsonStr);
                if (Array.isArray(parsed)) {
                  arr = parsed
                    .map(s => typeof s === 'string' ? s.trim() : (s && typeof s.name === 'string' ? s.name.trim() : ''))
                    .filter(Boolean)
                    .slice(0, 15);
                }
              } catch (_) {
                const m = raw.match(/\[[\s\S]*\]/);
                if (m) try {
                  const fb = JSON.parse(m[0]);
                  if (Array.isArray(fb)) arr = fb.map(s => typeof s === 'string' ? s.trim() : (s && s.name ? s.name.trim() : '')).filter(Boolean).slice(0, 15);
                } catch (__) {}
              }
              if (arr.length > 0) {
                const exact = arr.find(s => s.toLowerCase() === name.toLowerCase());
                name = exact || arr[0];
              }
            } catch (_) {}
          }
        }
        if (list.some(c => (c.name || '').trim().toLowerCase() === name.toLowerCase())) {
          await db.updateUser(req.session.userId, { collegeList: list });
          return res.json({ success: true, list, alreadyAdded: true });
        }
        list.push({ name, blurb: typeof add.blurb === 'string' ? add.blurb.trim() : '' });
      }
    } else if (remove && typeof remove === 'string') {
      const name = remove.trim();
      list = list.filter(c => c.name !== name);
    }
    await db.updateUser(req.session.userId, { collegeList: list });
    res.json({ success: true, list });
  } catch (e) {
    console.error('Update college list error:', e);
    res.status(500).json({ success: false, message: 'Failed to update college list.' });
  }
});

// Calendar date notes (per-date notes on dashboard calendar)
app.get('/api/date-notes', requireLoginEarly, async (req, res) => {
  try {
    const user = await db.getUserById(req.session.userId);
    const notes = (user && user.dateNotes && typeof user.dateNotes === 'object') ? user.dateNotes : {};
    res.json({ notes });
  } catch (e) {
    console.error('Get date notes error:', e);
    res.status(500).json({ notes: {} });
  }
});

app.put('/api/date-notes', requireLoginEarly, async (req, res) => {
  try {
    const { date, note } = req.body || {};
    const dateKey = typeof date === 'string' ? date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return res.status(400).json({ success: false, message: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    const noteStr = typeof note === 'string' ? note : String(note ?? '');
    const update = { ['dateNotes.' + dateKey]: noteStr };
    await db.updateUser(req.session.userId, update);
    res.json({ success: true });
  } catch (e) {
    console.error('Save date note error:', e);
    res.status(500).json({ success: false, message: 'Failed to save note.' });
  }
});

// Fetch only rea/ea/ed/rd for a college (used by refresh-dates). Optional userId to use student's application cycle.
async function fetchCollegeDatesOnly(name, userId) {
  const settings = getAppSettings();
  const useOpenAI = (settings.collegeDetails || 'openai') === 'openai';
  if (useOpenAI && !hasOpenAIChat) return { rea: '', ea: '', ed: '', rd: '' };
  if (!useOpenAI && !hasLLM) return { rea: '', ea: '', ed: '', rd: '' };
  let cycleInstruction = '';
  if (userId) {
    const cycle = await getApplicationCycleForUser(userId);
    if (cycle) {
      cycleInstruction = ` Use the application cycle "${cycle}" for deadline years: ED/EA/REA typically fall of the first year (e.g. November), RD typically January of the second year. If official dates for this cycle are not yet published, predict them based on the college's usual pattern. `;
    }
  }
  const prompt = `For the college/university "${name}", return ONLY a JSON object with these keys: "rea", "ea", "ed", "rd". Each value: deadline with year (e.g. "November 1, 2027") or "Not offered".${cycleInstruction}No other text.`;
  const raw = useOpenAI && hasOpenAIChat
    ? (await openaiChatComplete('You are a college counselor. Reply with ONLY a valid JSON object. No other text, no markdown.', prompt, { maxTokens: 256, temperature: 0.3 }) || '')
    : (await chatComplete('You are a college counselor. Reply with ONLY a valid JSON object. No other text, no markdown.', prompt, { maxTokens: 256, temperature: 0.3 }) || '');
  const str = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let rea = '', ea = '', ed = '', rd = '';
  try {
    const parsed = JSON.parse(str);
    if (parsed && typeof parsed === 'object') {
      rea = (parsed.rea != null && String(parsed.rea).trim()) ? String(parsed.rea).trim() : '';
      ea = (parsed.ea != null && String(parsed.ea).trim()) ? String(parsed.ea).trim() : '';
      ed = (parsed.ed != null && String(parsed.ed).trim()) ? String(parsed.ed).trim() : '';
      rd = (parsed.rd != null && String(parsed.rd).trim()) ? String(parsed.rd).trim() : '';
    }
  } catch (_) {}
  return { rea, ea, ed, rd };
}

app.get('/api/college-details', requireLoginEarly, async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    const blurbOnly = req.query.blurbOnly === '1' || req.query.blurbOnly === 'true';
    if (!name) return res.status(400).json({ success: false, message: 'College name is required.' });
    const settings = getAppSettings();
    if (blurbOnly) {
      const useClaudeForBlurb = (settings.collegeBlurb || 'claude') === 'claude';
      if (useClaudeForBlurb && !hasLLM) return res.status(500).json({ success: false, message: 'AI is not available for blurb. Set ANTHROPIC_API_KEY or switch to ChatGPT in Admin.' });
      if (!useClaudeForBlurb && !hasOpenAIChat) return res.status(500).json({ success: false, message: 'AI is not available for blurb. Set OPENAI_API_KEY.' });
    } else {
      const useOpenAIForDetails = (settings.collegeDetails || 'openai') === 'openai';
      if (useOpenAIForDetails && !hasOpenAIChat) return res.status(500).json({ success: false, message: 'AI is not available for college details. Set OPENAI_API_KEY or switch to Claude in Admin.' });
      if (!useOpenAIForDetails && !hasLLM) return res.status(500).json({ success: false, message: 'AI is not available for college details. Set ANTHROPIC_API_KEY.' });
    }
    let details;
    if (blurbOnly) {
      const useClaudeForBlurb = (settings.collegeBlurb || 'claude') === 'claude';
      const context = await getModule0ContextForUser(req.session.userId);
      const studentContext = (context && context.allAnswersFormatted && context.allAnswersFormatted.trim())
        ? `\n\nStudent's profile:\n${context.allAnswersFormatted}`
        : '';
      const blurbPrompt = `Write exactly one short sentence explaining why "${name}" is a good fit for this student (e.g. "Strong match for your STEM focus and research interests" or "Fits your interest in liberal arts and campus culture").${studentContext}\n\nReply with only that one sentence, nothing else.`;
      if (useClaudeForBlurb && hasLLM) {
        details = await chatComplete('You are a college counselor. Reply with only one short sentence explaining why this college is a good fit for this student.', blurbPrompt, { maxTokens: 120, temperature: 0.5 });
      } else {
        details = await openaiChatComplete('You are a college counselor. Reply with only one short sentence explaining why this college is a good fit for this student.', blurbPrompt, { maxTokens: 120, temperature: 0.5 });
      }
    } else {
      const useOpenAIForDetails = (settings.collegeDetails || 'openai') === 'openai';
      const applicationCycle = await getApplicationCycleForUser(req.session.userId);
      const cycleInstruction = applicationCycle
        ? `\nApplication cycle: "${applicationCycle}". Use this cycle for rea/ea/ed/rd: ED/EA/REA typically in fall of the first year (e.g. November), RD in January of the second year. If official dates for this cycle are not yet published, predict them based on the college's typical deadline pattern. `
        : '';
      const structuredPrompt = `Provide detailed information about the college/university "${name}" for a prospective student.${cycleInstruction}

Return ONLY a valid JSON object with exactly these keys (use approximate figures when exact data is unknown):
- "location" (string): city and state, e.g. "Boston, Massachusetts"
- "gpa" (string): average admitted GPA, e.g. "3.7"
- "sat" (string): middle 50% SAT range, e.g. "1350-1520"
- "act" (string): middle 50% ACT range, e.g. "30-34"
- "acceptanceRate" (string): e.g. "7%" or "7"
- "costAfterAid" (string): average net price per year after aid, e.g. "$18,000/yr"
- "rea" (string): Restrictive Early Action deadline with year, e.g. "November 1, 2027" or "Not offered" (empty string if not applicable)
- "ea" (string): Early Action deadline with year, e.g. "November 1, 2027" or "Not offered"
- "ed" (string): Early Decision deadline with year, e.g. "November 15, 2027" or "Not offered"
- "rd" (string): Regular Decision deadline with year, e.g. "January 1, 2028" or "January 15, 2028"
- "description" (string): 1-2 paragraphs covering: what the college is known for and best at; strongest majors and programs; campus culture and strengths; notable opportunities (research, internships, study abroad); and why it might be a good fit for students. Be specific and concise. Use line breaks between paragraphs.

No markdown, no other text—only the JSON object.`;
      const raw = (useOpenAIForDetails && hasOpenAIChat)
        ? await openaiChatComplete('You are a college counselor. Reply with ONLY a valid JSON object. No other text, no markdown.', structuredPrompt, { maxTokens: 1200, temperature: 0.4 })
        : await chatComplete('You are a college counselor. Reply with ONLY a valid JSON object. No other text, no markdown.', structuredPrompt, { maxTokens: 1200, temperature: 0.4 });
      const str = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let location = '';
      let gpa = '';
      let sat = '';
      let act = '';
      let acceptanceRate = '';
      let costAfterAid = '';
      let rea = '';
      let ea = '';
      let ed = '';
      let rd = '';
      details = '';
      try {
        const parsed = JSON.parse(str);
        if (parsed && typeof parsed === 'object') {
          location = (parsed.location != null && String(parsed.location).trim()) ? String(parsed.location).trim() : '';
          gpa = (parsed.gpa != null && String(parsed.gpa).trim()) ? String(parsed.gpa).trim() : '';
          sat = (parsed.sat != null && String(parsed.sat).trim()) ? String(parsed.sat).trim() : '';
          act = (parsed.act != null && String(parsed.act).trim()) ? String(parsed.act).trim() : '';
          acceptanceRate = (parsed.acceptanceRate != null && String(parsed.acceptanceRate).trim()) ? String(parsed.acceptanceRate).trim() : '';
          if (acceptanceRate && !/%/.test(acceptanceRate) && /^\d+(\.\d+)?$/.test(acceptanceRate)) acceptanceRate = acceptanceRate + '%';
          costAfterAid = (parsed.costAfterAid != null && String(parsed.costAfterAid).trim()) ? String(parsed.costAfterAid).trim() : '';
          rea = (parsed.rea != null && String(parsed.rea).trim()) ? String(parsed.rea).trim() : '';
          ea = (parsed.ea != null && String(parsed.ea).trim()) ? String(parsed.ea).trim() : '';
          ed = (parsed.ed != null && String(parsed.ed).trim()) ? String(parsed.ed).trim() : '';
          rd = (parsed.rd != null && String(parsed.rd).trim()) ? String(parsed.rd).trim() : '';
          details = (parsed.description != null && String(parsed.description).trim()) ? String(parsed.description).trim() : '';
        }
      } catch (_) {}
      if (!details) {
        const fallbackPrompt = `Provide concise details about "${name}" for a student: location, notable programs, acceptance rate if known, campus culture, and why it might be a good fit. Use 2-4 sentences.`;
        details = (useOpenAIForDetails && hasOpenAIChat)
          ? await openaiChatComplete('You are a college counselor. Provide brief, factual details.', fallbackPrompt, { maxTokens: 400, temperature: 0.5 })
          : await chatComplete('You are a college counselor. Provide brief, factual details.', fallbackPrompt, { maxTokens: 400, temperature: 0.5 });
        details = (details || '').trim();
      }
      // Save dates to user's college list so dashboard can show them without refetching
      try {
        const u = await db.getUserById(req.session.userId);
        const collegeList = (u && u.collegeList && Array.isArray(u.collegeList)) ? [...u.collegeList] : [];
        const idx = collegeList.findIndex(c => (c.name || '').trim().toLowerCase() === name.toLowerCase());
        if (idx !== -1) {
          collegeList[idx] = { ...collegeList[idx], rea: rea || '', ea: ea || '', ed: ed || '', rd: rd || '' };
          await db.updateUser(req.session.userId, { collegeList });
        }
      } catch (err) { console.error('Save college list dates:', err); }
      return res.json({
        success: true,
        details,
        location: location || undefined,
        gpa: gpa || undefined,
        sat: sat || undefined,
        act: act || undefined,
        acceptanceRate: acceptanceRate || undefined,
        costAfterAid: costAfterAid || undefined,
        rea: rea || undefined,
        ea: ea || undefined,
        ed: ed || undefined,
        rd: rd || undefined
      });
    }
    res.json({ success: true, details: (details || '').trim() });
  } catch (e) {
    console.error('College details error:', e);
    res.status(500).json({ success: false, message: 'Failed to load college details.' });
  }
});

app.get('/api/college-suggest', requireLoginEarly, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q || q.length < 2) return res.json({ success: true, suggestions: [] });
    const useOpenAI = hasOpenAIChat;
    if (!useOpenAI && !hasLLM) return res.json({ success: true, suggestions: [] });
    const collegeMatchPrompt = `Resolve to full official US college/university names. If "${q}" is an abbreviation or nickname (e.g. umich, UCLA, USC, Gators), return the full official name first, e.g. ["University of Michigan"] or ["University of California Los Angeles"]. Otherwise return colleges whose full name starts with or contains "${q}". Return ONLY a JSON array of strings, full official names only. No markdown. Put the single best match first.`;
    const raw = useOpenAI
      ? (await openaiChatComplete('You are a college counselor. Reply with ONLY a valid JSON array of college/university full official names. No other text.', collegeMatchPrompt, { maxTokens: 512, temperature: 0.3 }) || '')
      : (await chatComplete('You are a college counselor. Reply with ONLY a valid JSON array of college/university full official names. No other text.', collegeMatchPrompt, { maxTokens: 512, temperature: 0.3 }) || '');
    let arr = [];
    const jsonStr = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        arr = parsed
          .map(s => typeof s === 'string' ? s.trim() : (s && typeof s.name === 'string' ? s.name.trim() : ''))
          .filter(Boolean)
          .slice(0, 15);
      }
    } catch (_) {
      const m = raw.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          const fallback = JSON.parse(m[0]);
          if (Array.isArray(fallback)) {
            arr = fallback
              .map(s => typeof s === 'string' ? s.trim() : (s && typeof s.name === 'string' ? s.name.trim() : ''))
              .filter(Boolean)
              .slice(0, 15);
          }
        } catch (__) {}
      }
    }
    res.json({ success: true, suggestions: arr });
  } catch (e) {
    console.error('College suggest error:', e);
    res.json({ success: true, suggestions: [] });
  }
});

// POST college-match and college-strategy: Claude only (never ChatGPT) for generating recommended colleges.
app.post('/api/college-match', requireLoginEarly, async (req, res) => {
  try {
    if (!hasLLM) {
      return res.status(500).json({ success: false, message: 'AI is not available. Configure ANTHROPIC_API_KEY.' });
    }
    let context = await getModule0ContextForUser(req.session.userId);
    const hasUsableContext = context && context.allAnswersFormatted && context.allAnswersFormatted.trim();
    if (!hasUsableContext && req.body && req.body.allAnswers && Object.keys(req.body.allAnswers).length > 0) {
      const formatted = await formatAnswersToContext(req.body.allAnswers);
      if (formatted && formatted.trim()) context = { allAnswersFormatted: formatted, allAnswers: req.body.allAnswers };
    }
    if (!context || !context.allAnswersFormatted || !context.allAnswersFormatted.trim()) {
      return res.status(400).json({ success: false, message: 'Complete Module 0 (Initial Diagnostic) first to get college matches.' });
    }
    const prompt = `Based on this student's questionnaire responses, recommend 6-8 colleges or universities that would be a good fit.

Student's responses:
${context.allAnswersFormatted}

Return ONLY a valid JSON array of objects. Each object must have exactly:
- "name": string (college/university name)
- "blurb": string (one short sentence why it's a good fit for this student)

Example format:
[{"name":"MIT","blurb":"Strong match for STEM and research interests."},{"name":"Stanford University","blurb":"Fits your focus on entrepreneurship and innovation."}]

No markdown, no code fence, no extra text—only the JSON array.`;
    const raw = await chatComplete(
      'You are a college counselor. Output only valid JSON: an array of objects with "name" and "blurb" keys.',
      prompt,
      { maxTokens: 2048, temperature: 0.6 }
    ) || '';
    let jsonStr = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (_) {
      const match = raw.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }
    const colleges = Array.isArray(parsed)
      ? parsed
          .filter(c => c && typeof c.name === 'string' && c.name.trim())
          .map(c => ({ name: String(c.name).trim(), blurb: typeof c.blurb === 'string' ? c.blurb.trim() : '' }))
          .slice(0, 12)
      : [];
    res.json({ success: true, colleges });
  } catch (e) {
    console.error('College match error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to generate college matches.' });
  }
});

// Format answers object into context string (shared helper)
async function formatAnswersToContext(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return '';
  const systemFields = ['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions', 'postCollegeAnswers'];
  let questions = await db.getQuestions();
  if (!questions || questions.length === 0) questions = readJSONFile(QUESTIONS_FILE);
  const questionsMap = {};
  (questions || []).forEach(q => { if (q && q.id != null) questionsMap[String(q.id)] = q; });
  const toStr = (v) => {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toStr).filter(Boolean).join(', ');
    if (typeof v === 'object') return (v.value != null ? v.value : v.text != null ? v.text : JSON.stringify(v));
    return String(v);
  };
  let formatted = Object.entries(answers)
    .filter(([key]) => !systemFields.includes(key))
    .map(([qId, ans]) => {
      const q = questionsMap[qId] || questionsMap[String(qId)];
      const qText = q ? q.text : qId;
      const formattedAns = toStr(ans).trim();
      if (!formattedAns) return null;
      if (q && q.chatPrompt && q.chatPrompt.includes('{answer}')) return q.chatPrompt.replace(/{answer}/g, formattedAns);
      return `${qText}: ${formattedAns}`;
    })
    .filter(Boolean)
    .join('\n');
  if (!formatted || !formatted.trim()) {
    formatted = Object.entries(answers)
      .filter(([key]) => !systemFields.includes(key))
      .map(([qId, ans]) => {
        const formattedAns = toStr(ans).trim();
        if (!formattedAns) return null;
        return `Question ${qId}: ${formattedAns}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  return formatted;
}

// College strategy (safeties/targets/reaches): Claude only, never OpenAI.
app.post('/api/college-strategy', requireLoginEarly, async (req, res) => {
  try {
    if (!hasLLM) {
      return res.status(500).json({ success: false, message: 'AI is not available. Configure ANTHROPIC_API_KEY.' });
    }
    let context = await getModule0ContextForUser(req.session.userId);
    // Fallback: use client-sent allAnswers when server has no usable formatted context
    const hasUsableContext = context && context.allAnswersFormatted && context.allAnswersFormatted.trim();
    if (!hasUsableContext && req.body && req.body.allAnswers && Object.keys(req.body.allAnswers).length > 0) {
      const formatted = await formatAnswersToContext(req.body.allAnswers);
      if (formatted && formatted.trim()) context = { allAnswersFormatted: formatted, allAnswers: req.body.allAnswers };
    }
    if (!context || !context.allAnswersFormatted || !context.allAnswersFormatted.trim()) {
      return res.status(400).json({ success: false, message: 'Complete Module 0 (Initial Diagnostic) first.' });
    }
    const user = await db.getUserById(req.session.userId);
    const existingList = (user && user.collegeList && Array.isArray(user.collegeList)) ? user.collegeList : [];
    const existingNames = existingList.map(c => (c && c.name) ? String(c.name).trim() : '').filter(Boolean);
    const excludeInstruction = existingNames.length > 0
      ? `\n\nDo not include the following colleges (the student has already added these to their list): ${existingNames.join(', ')}. Recommend only colleges that are not in that list.`
      : '';

    const coursePath = path.join(__dirname, 'data', 'course.json');
    let course = {};
    try {
      course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));
    } catch (_) {}
    const mod1 = (course.modules || []).find(m => m.id === 'module-1');
    const pages = (mod1 && mod1.pages && Array.isArray(mod1.pages)) ? mod1.pages : [];
    const collegeListFormatted = existingList.length > 0
      ? existingList.map(c => c.blurb ? `${c.name}: ${c.blurb}` : c.name).join('\n')
      : 'No colleges added yet.';
    const statsInstruction = ' For each college you MUST include: "gpa" (average admitted GPA, e.g. "3.6"), "sat" (middle 50% SAT range, e.g. "1200-1380"), "act" (middle 50% ACT range, e.g. "26-32"), "costAfterAid" (average net price per year after aid, e.g. "$15,000/yr"), "acceptanceRate" (e.g. "65%" or "65"). Use real or well-known approximate figures.';
    const getPrompt = (id) => {
      const p = pages.find(pa => pa.id === id);
      let base = (p && p.prompt && String(p.prompt).trim()) ? String(p.prompt).replace(/\{allAnswers\}/g, context.allAnswersFormatted) : null;
      if (base) base = replaceInsightPlaceholders(base.replace(/\{collegeList\}/g, collegeListFormatted));
      return base ? base + statsInstruction + excludeInstruction : null;
    };
    const defaultPrompt = (label) => `Recommend around 10 ${label} colleges for this student.

Student's responses:
${context.allAnswersFormatted}${excludeInstruction}

Return ONLY a JSON array. Each object must have exactly these 7 keys (use approximate figures if needed): name, blurb, gpa, sat, act, costAfterAid, acceptanceRate. Example gpa: "3.6", sat: "1200-1380", act: "26-32", costAfterAid: "$15,000/yr", acceptanceRate: "65%". No markdown.`;
    const toList = (raw) => {
      const str = (raw || '').trim();
      if (!str) return [];
      let jsonStr = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      let arr = [];
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) arr = parsed;
        else if (parsed && Array.isArray(parsed.colleges)) arr = parsed.colleges;
        else if (parsed && Array.isArray(parsed.recommendations)) arr = parsed.recommendations;
      } catch (_) {}
      if (arr.length === 0) {
        const m = str.match(/\[[\s\S]*\]/);
        if (m) {
          try { arr = JSON.parse(m[0]); } catch (__) {
            try { arr = JSON.parse(m[0].replace(/'/g, '"')); } catch (___) {}
          }
        }
      }
      const pick = (c, ...keys) => {
        for (const k of keys) {
          if (c[k] != null && String(c[k]).trim()) return String(c[k]).trim();
        }
        // Case-insensitive: match any key that equals or contains the target (e.g. "GPA", "average_gpa")
        const target = keys[0].toLowerCase();
        for (const objKey of Object.keys(c)) {
          const k = objKey.toLowerCase().replace(/[-_\s]/g, '');
          const match = k === target || k.includes(target) || (target === 'costafteraid' && (k.includes('cost') || k.includes('net') || k.includes('aid'))) || (target === 'acceptancerate' && (k.includes('acceptance') || k === 'acceptance'));
          if (match) {
            const v = c[objKey];
            if (v != null && String(v).trim()) return String(v).trim();
          }
        }
        return '';
      };
      const normalize = (c) => {
        if (!c || typeof c !== 'object') return null;
        const name = (c.name != null && String(c.name).trim()) ? String(c.name).trim()
          : (c.college != null && String(c.college).trim()) ? String(c.college).trim()
          : (c.school != null && String(c.school).trim()) ? String(c.school).trim()
          : null;
        if (!name) return null;
        const blurb = (typeof c.blurb === 'string' && c.blurb.trim()) ? c.blurb.trim()
          : (typeof c.description === 'string' && c.description.trim()) ? c.description.trim()
          : '';
        const gpa = pick(c, 'gpa', 'gpaAvg', 'averageGpa', 'GPA');
        const sat = pick(c, 'sat', 'satAvg', 'middle50Sat', 'satRange', 'SAT');
        const act = pick(c, 'act', 'actAvg', 'middle50Act', 'actRange', 'ACT');
        const costAfterAid = pick(c, 'costAfterAid', 'netPrice', 'netCost', 'cost', 'cost_after_aid', 'CostAfterAid');
        let acceptanceRate = pick(c, 'acceptanceRate', 'acceptance_rate', 'acceptance', 'acceptanceRatePct', 'Acceptance Rate');
        if (acceptanceRate && !/%/.test(acceptanceRate) && /^\d+(\.\d+)?$/.test(acceptanceRate.trim())) acceptanceRate = acceptanceRate.trim() + '%';
        return { name, blurb, gpa, sat, act, costAfterAid, acceptanceRate };
      };
      const out = (Array.isArray(arr) ? arr : [])
        .map(normalize)
        .filter(Boolean)
        .slice(0, 15);
      if (out.length === 0 && str.length > 50) {
        console.warn('College strategy: parsed 0 colleges. Raw (first 500 chars):', str.slice(0, 500));
      }
      return out;
    };
    const system = `You are a college counselor. Reply with ONLY a valid JSON array—no other text, no markdown, no explanation.

CRITICAL: Every object in the array MUST have exactly these 7 keys—do not omit any:
- "name" (string): college name
- "blurb" (string): one short sentence why it fits
- "gpa" (string): average admitted GPA, e.g. "3.6"
- "sat" (string): middle 50% SAT range, e.g. "1200-1380"
- "act" (string): middle 50% ACT range, e.g. "26-32"
- "costAfterAid" (string): average net price per year after aid, e.g. "$15,000/yr"
- "acceptanceRate" (string): acceptance rate, e.g. "65%" or "65"

Use approximate figures when exact data is unknown. Example:
[{"name":"Virginia Commonwealth University","blurb":"Strong public option with diverse programs.","gpa":"3.5","sat":"1050-1280","act":"21-28","costAfterAid":"$14,000/yr","acceptanceRate":"91%"}]`;

    const category = (req.body && req.body.category)
      ? String(req.body.category).toLowerCase()
      : (req.query && req.query.category) ? String(req.query.category).toLowerCase() : null;

    if (category === 'safeties' || category === 'targets' || category === 'reaches') {
      const id = category;
      let colleges = [];
      try {
        const raw = await chatComplete(
          system,
          getPrompt(id) || defaultPrompt(id === 'safeties' ? 'safety' : id === 'targets' ? 'target' : 'reach'),
          { maxTokens: 2048, temperature: 0.4 }
        );
        colleges = toList(raw);
      } catch (e) {
        console.error('College strategy chatComplete error:', e);
        return res.status(500).json({ success: false, message: e.message || 'AI failed to generate recommendations. Configure ANTHROPIC_API_KEY in .env.' });
      }
      // Static acceptance rates (approx) for well-known US colleges — used when AI doesn't return a rate
      const ACCEPTANCE_LOOKUP = {
        'university of virginia': '19%', 'uva': '19%', 'virginia': '19%',
        'virginia tech': '57%', 'virginia polytechnic': '57%',
        'virginia commonwealth university': '91%', 'vcu': '91%',
        'james madison university': '80%', 'jmu': '80%',
        'george mason university': '89%', 'gmu': '89%',
        'william & mary': '33%', 'william and mary': '33%',
        'university of michigan': '18%', 'umich': '18%', 'michigan': '18%',
        'michigan state university': '83%', 'msu': '83%',
        'ohio state university': '53%', 'ohio state': '53%', 'osu': '53%',
        'penn state': '55%', 'pennsylvania state university': '55%',
        'university of florida': '23%', 'uf': '23%', 'florida': '23%',
        'florida state university': '25%', 'fsu': '25%',
        'university of california los angeles': '9%', 'ucla': '9%',
        'university of california berkeley': '11%', 'uc berkeley': '11%', 'ucb': '11%',
        'university of southern california': '12%', 'usc': '12%',
        'stanford university': '4%', 'stanford': '4%',
        'mit': '4%', 'massachusetts institute of technology': '4%',
        'harvard': '3%', 'harvard university': '3%',
        'duke university': '6%', 'duke': '6%',
        'unc': '17%', 'university of north carolina': '17%', 'north carolina': '17%',
        'georgia tech': '17%', 'georgia institute of technology': '17%', 'gtech': '17%',
        'university of georgia': '40%', 'uga': '40%', 'georgia': '40%',
        'university of texas at austin': '31%', 'ut austin': '31%', 'utexas': '31%',
        'texas a&m': '64%', 'texas a and m': '64%',
        'new york university': '12%', 'nyu': '12%',
        'boston university': '19%', 'bu': '19%',
        'northeastern university': '7%', 'northeastern': '7%',
        'syracuse university': '52%', 'syracuse': '52%',
        'purdue university': '53%', 'purdue': '53%',
        'indiana university': '85%', 'iu': '85%',
        'university of illinois': '45%', 'uiuc': '45%', 'illinois': '45%',
        'university of wisconsin': '49%', 'wisconsin': '49%',
        'university of minnesota': '75%', 'minnesota': '75%',
        'university of washington': '48%', 'uw': '48%', 'udub': '48%',
        'university of colorado boulder': '79%', 'cu boulder': '79%',
        'arizona state university': '88%', 'asu': '88%',
        'university of arizona': '87%', 'arizona': '87%',
        'brigham young university': '67%', 'byu': '67%',
        'university of central florida': '41%', 'ucf': '41%',
        'university of south florida': '44%', 'usf': '44%',
        'clemson university': '43%', 'clemson': '43%',
        'university of miami': '19%', 'miami': '19%',
        'tulane university': '11%', 'tulane': '11%',
        'vanderbilt university': '7%', 'vanderbilt': '7%',
        'emory university': '11%', 'emory': '11%',
        'university of richmond': '24%', 'richmond': '24%',
        'georgetown university': '12%', 'georgetown': '12%',
        'american university': '41%', 'american': '41%',
        'howard university': '35%', 'howard': '35%',
        'north carolina state university': '47%', 'nc state': '47%', 'ncsu': '47%',
        'wake forest university': '21%', 'wake forest': '21%',
        'boston college': '19%', 'bc': '19%',
        'villanova university': '23%', 'villanova': '23%',
        'fordham university': '54%', 'fordham': '54%',
        'rutgers university': '66%', 'rutgers': '66%',
        'university of maryland': '44%', 'umd': '44%', 'maryland': '44%',
        'university of pittsburgh': '49%', 'pitt': '49%', 'pittsburgh': '49%',
        'temple university': '60%', 'temple': '60%',
        'drexel university': '80%', 'drexel': '80%',
        'case western reserve': '27%', 'case western': '27%',
        'miami university': '89%', 'miami university ohio': '89%',
        'depaul university': '70%', 'depaul': '70%',
        'loyola university chicago': '77%', 'loyola chicago': '77%',
        'university of iowa': '86%', 'iowa': '86%',
        'iowa state university': '90%', 'iowa state': '90%',
        'university of oregon': '83%', 'oregon': '83%',
        'oregon state university': '82%', 'oregon state': '82%',
        'university of utah': '95%', 'utah': '95%',
        'san diego state university': '38%', 'sdsu': '38%',
        'california state university': '64%', 'cal state': '64%',
        'texas tech university': '70%', 'texas tech': '70%',
        'baylor university': '46%', 'baylor': '46%',
        'southern methodist university': '52%', 'smu': '52%',
        'tcu': '56%', 'texas christian university': '56%',
        'university of oklahoma': '73%', 'oklahoma': '73%',
        'university of kansas': '88%', 'kansas': '88%',
        'university of kentucky': '95%', 'kentucky': '95%',
        'university of tennessee': '68%', 'tennessee': '68%',
        'university of alabama': '80%', 'alabama': '80%',
        'auburn university': '71%', 'auburn': '71%',
        'university of south carolina': '62%', 'south carolina': '62%',
        'louisiana state university': '73%', 'lsu': '73%',
        'university of arkansas': '79%', 'arkansas': '79%',
        'university of mississippi': '97%', 'ole miss': '97%',
        'university of nebraska': '81%', 'nebraska': '81%',
        'university of connecticut': '55%', 'uconn': '55%', 'connecticut': '55%',
        'university of massachusetts': '66%', 'umass': '66%', 'massachusetts': '66%',
        'stony brook university': '49%', 'stony brook': '49%',
        'binghamton university': '42%', 'binghamton': '42%',
        'university at buffalo': '68%', 'buffalo': '68%',
        'university of rochester': '39%', 'rochester': '39%',
        'cornell university': '7%', 'cornell': '7%',
        'columbia university': '4%', 'columbia': '4%',
        'princeton university': '4%', 'princeton': '4%',
        'yale university': '5%', 'yale': '5%',
        'brown university': '5%', 'brown': '5%',
        'dartmouth college': '6%', 'dartmouth': '6%',
        'university of pennsylvania': '6%', 'upenn': '6%', 'penn': '6%',
        'northwestern university': '7%', 'northwestern': '7%',
        'university of chicago': '5%', 'uchicago': '5%',
        'university of notre dame': '13%', 'notre dame': '13%',
        'washington university in st louis': '11%', 'washu': '11%', 'wustl': '11%',
        'rice university': '8%', 'rice': '8%',
        'university of california davis': '37%', 'uc davis': '37%', 'ucd': '37%',
        'university of california irvine': '21%', 'uc irvine': '21%', 'uci': '21%',
        'university of california san diego': '24%', 'uc san diego': '24%', 'ucsd': '24%',
        'university of california santa barbara': '29%', 'uc santa barbara': '29%', 'ucsb': '29%'
      };
      const normName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[&]/g, ' and ');
      function lookupAcceptance(name) {
        const n = normName(name);
        if (!n) return '';
        if (ACCEPTANCE_LOOKUP[n]) return ACCEPTANCE_LOOKUP[n];
        for (const key of Object.keys(ACCEPTANCE_LOOKUP)) {
          if (n.includes(key) || key.includes(n)) return ACCEPTANCE_LOOKUP[key];
        }
        return '';
      }

      if (colleges.length > 0 && (hasOpenAIChat || hasLLM)) {
        try {
          const namesList = colleges.map(c => c.name).filter(Boolean);
          const acceptancePrompt = `These US colleges are listed in order. For each one, give ONLY its approximate acceptance rate as a number 0-100 (same order).

Return ONLY a JSON array of numbers. One number per college, in the exact same order. No other text, no markdown. Example: [91, 65, 22]

Colleges:
${namesList.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
          const acceptanceRaw = hasOpenAIChat
            ? await openaiChatComplete(
                'You are a factual assistant. Reply with ONLY a JSON array of numbers. No other text.',
                acceptancePrompt,
                { maxTokens: 512, temperature: 0.1 }
              )
            : await chatComplete(
                'You are a factual assistant. Reply with ONLY a JSON array of numbers. No other text.',
                acceptancePrompt,
                { maxTokens: 512, temperature: 0.1 }
              );
          const accStr = (acceptanceRaw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          let rateNumbers = [];

          // 1) Try parse as array of numbers
          try {
            const parsed = JSON.parse(accStr);
            if (Array.isArray(parsed)) {
              rateNumbers = parsed.map(v => {
                if (typeof v === 'number' && v >= 0 && v <= 100) return String(Math.round(v)) + '%';
                if (typeof v === 'string') {
                  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*%?$/);
                  return m ? (m[1].includes('.') ? m[1] + '%' : m[1] + '%') : null;
                }
                return null;
              }).filter(Boolean);
            }
          } catch (_) {}
          // 2) Try extract array from raw string
          if (rateNumbers.length === 0) {
            const arrMatch = accStr.match(/\[[\s\d.,%]+\]/);
            if (arrMatch) {
              try {
                const arr = JSON.parse(arrMatch[0].replace(/%/g, ''));
                if (Array.isArray(arr)) rateNumbers = arr.map(v => (typeof v === 'number' && v >= 0 && v <= 100) ? String(Math.round(v)) + '%' : null).filter(Boolean);
              } catch (__) {}
            }
          }
          // 3) Extract percentages from text in order (e.g. "91%", "65", "22 percent")
          if (rateNumbers.length === 0) {
            const tokens = accStr.replace(/\n/g, ' ').split(/[\s,;]+/);
            for (const t of tokens) {
              const m = t.match(/^(\d+(?:\.\d+)?)\s*%?$/);
              if (m) {
                const num = parseFloat(m[1]);
                if (num >= 0 && num <= 100) rateNumbers.push(String(Math.round(num)) + '%');
              }
            }
          }
          for (let i = 0; i < rateNumbers.length && i < colleges.length; i++) {
            if (!colleges[i].acceptanceRate) colleges[i].acceptanceRate = rateNumbers[i];
          }
          // 4) If AI returned array of objects with name/rate, merge by name
          let accList = [];
          try {
            const parsed = JSON.parse(accStr);
            if (Array.isArray(parsed) && parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object') accList = parsed;
          } catch (_) {
            const m = accStr.match(/\[[\s\S]*\]/);
            if (m) try { const p = JSON.parse(m[0]); if (Array.isArray(p) && p[0] && typeof p[0] === 'object') accList = p; } catch (__) {}
          }
          function getRate(obj) {
            if (obj == null) return '';
            if (typeof obj === 'string') {
              const s = obj.trim();
              const m = s.match(/^(\d+(?:\.\d+)?)\s*%?$/);
              return m ? (s.includes('%') ? s : m[1] + '%') : '';
            }
            if (typeof obj !== 'object') return '';
            const v = obj.acceptanceRate ?? obj.acceptance_rate ?? obj['Acceptance Rate'];
            if (v != null && String(v).trim()) return String(v).trim();
            for (const k of Object.keys(obj)) {
              if (/acceptance/i.test(k) && (/rate/i.test(k) || k.toLowerCase() === 'acceptance') && obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
            }
            return '';
          }
          const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
          accList.forEach((acc) => {
            const name = (acc && acc.name != null) ? String(acc.name).trim() : '';
            let rate = getRate(acc);
            if (!rate) return;
            if (!/%/.test(rate) && /^\d+(\.\d+)?$/.test(rate)) rate = rate + '%';
            const college = colleges.find(c => !c.acceptanceRate && name && (norm(c.name) === norm(name) || norm(c.name).includes(norm(name)) || norm(name).includes(norm(c.name))));
            if (college) college.acceptanceRate = rate;
          });
        } catch (e) {
          console.warn('College strategy: acceptance rates failed:', e.message);
        }
      }

      // Fill any still missing with static lookup, then ensure key exists
      colleges.forEach(c => {
        if (c && (!c.acceptanceRate || c.acceptanceRate === '')) {
          const looked = lookupAcceptance(c.name);
          if (looked) c.acceptanceRate = looked;
        }
        if (c && (c.acceptanceRate === undefined || c.acceptanceRate === null)) c.acceptanceRate = '';
      });
      return res.json({ success: true, colleges });
    }

    if (!category) {
      console.warn('College strategy: no category in body or query. Body:', typeof req.body, req.body ? Object.keys(req.body) : 'none');
    }

    const [safetiesRaw, targetsRaw, reachesRaw] = await Promise.all([
      chatComplete(system, getPrompt('safeties') || defaultPrompt('safety'), { maxTokens: 1024, temperature: 0.6 }),
      chatComplete(system, getPrompt('targets') || defaultPrompt('target'), { maxTokens: 1024, temperature: 0.6 }),
      chatComplete(system, getPrompt('reaches') || defaultPrompt('reach'), { maxTokens: 1024, temperature: 0.6 })
    ]);
    const safeties = toList(safetiesRaw);
    const targets = toList(targetsRaw);
    const reaches = toList(reachesRaw);

    res.json({
      success: true,
      safeties,
      targets,
      reaches
    });
  } catch (e) {
    console.error('College strategy error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to generate strategy.' });
  }
});

// Parse resume or transcript and extract Module 0 answers (ChatGPT) — register before static
app.post('/api/module-0/parse-document', optionalLogin, uploadResume.single('document'), async (req, res) => {
  let filePath = null;
  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ success: false, message: 'No file uploaded. Upload a PDF, DOCX, or TXT resume or transcript.' });
    }
    filePath = req.file.path;
    if (!hasOpenAIChat) {
      return res.status(503).json({ success: false, message: 'Document parsing requires OpenAI. Set OPENAI_API_KEY in .env.' });
    }

    const mimetype = (req.file.mimetype || '').toLowerCase();
    const name = (req.file.originalname || '').toLowerCase();
    const isPdf = mimetype === 'application/pdf' || name.endsWith('.pdf');
    const isDocx = mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx');
    let documentText = '';
    if (isPdf) {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      documentText = (data && data.text) ? data.text : '';
    } else if (isDocx) {
      const buffer = fs.readFileSync(filePath);
      const result = await mammoth.extractRawText({ buffer });
      documentText = (result && result.value) ? result.value : '';
    } else {
      documentText = fs.readFileSync(filePath, 'utf8');
    }
    if (!documentText || documentText.trim().length < 50) {
      return res.status(400).json({ success: false, message: 'Document is empty or too short. Upload a resume or transcript with readable text.' });
    }

    const coursePath = path.join(__dirname, 'data', 'course.json');
    let course = { modules: [] };
    try {
      course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));
    } catch (_) {}
    const mod0 = (course.modules || []).find(m => m.id === 'module-0');
    const qIds = (mod0 && mod0.questionIds && Array.isArray(mod0.questionIds)) ? mod0.questionIds : [];
    if (qIds.length === 0) {
      return res.status(500).json({ success: false, message: 'Module 0 has no questions configured.' });
    }

    const questionsFilePath = path.join(__dirname, 'data', 'questions.json');
    let allQuestions = [];
    try {
      allQuestions = await db.getQuestions();
    } catch (_) {
      try { allQuestions = readJSONFile(questionsFilePath); } catch (__) {}
    }
    if (!Array.isArray(allQuestions)) allQuestions = [];
    const qMap = {};
    allQuestions.forEach(q => { if (q && q.id) qMap[String(q.id)] = q; });
    const module0Questions = qIds.map(id => qMap[String(id)]).filter(Boolean);

    const questionsForPrompt = module0Questions.map(q => ({
      id: q.id,
      text: q.text,
      type: q.type || 'text',
      options: q.options || []
    }));

    const systemPrompt = `You are a precise assistant. Extract information from a resume or academic transcript to pre-fill a college counseling questionnaire. Return ONLY valid JSON—no markdown, no explanation.`;
    const userPrompt = `Below is a document (resume or transcript). Then a list of questionnaire questions with ids and types.

Document:
---
${documentText.slice(0, 28000)}
---

Questions (extract only what is clearly stated or strongly implied; omit if unsure):
${JSON.stringify(questionsForPrompt)}

Return a single JSON object mapping each question id to the extracted value. Rules:
- For type "text", "textarea", "number", "email": use a string (e.g. "John Doe", "3.8", "123").
- For type "radio": use exactly one string from that question's options array.
- For type "checkbox": use a JSON array of strings, each from that question's options (e.g. ["11th", "SAT"]).
- Use the exact option strings from the question (e.g. "7th", "8th", "9th", "10th", "11th", "12th" for grade).
- Omit any question id where you cannot find a clear answer. Return only the object, no other text.`;

    const raw = await openaiChatComplete(systemPrompt, userPrompt, { maxTokens: 4096, temperature: 0.2 });
    const rawStr = (raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let answers = {};
    try {
      const parsed = JSON.parse(rawStr);
      if (parsed && typeof parsed === 'object') answers = parsed;
    } catch (_) {
      const m = rawStr.match(/\{[\s\S]*\}/);
      if (m) try { answers = JSON.parse(m[0]); } catch (__) {}
    }

    const normalized = {};
    for (const [qId, value] of Object.entries(answers)) {
      const q = qMap[String(qId)];
      if (!q) continue;
      if (q.type === 'checkbox') {
        const arr = Array.isArray(value) ? value : (value == null ? [] : [String(value)]);
        normalized[qId] = arr.map(v => String(v).trim()).filter(Boolean);
      } else if (q.type === 'radio') {
        const s = value != null ? String(value).trim() : '';
        normalized[qId] = s;
      } else {
        normalized[qId] = value != null ? String(value).trim() : '';
      }
    }

    res.json({ success: true, answers: normalized });
  } catch (e) {
    console.error('Module 0 parse-document error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to parse document.' });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (_) {}
    }
  }
});

app.use(express.static('public'));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'counselor-prompts.json');
const POST_COLLEGE_MESSAGES_FILE = path.join(DATA_DIR, 'post-college-messages.json');
const COURSE_FILE = path.join(DATA_DIR, 'course.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  collegeNameMatch: 'openai',
  collegeBlurb: 'claude',
  collegeDetails: 'openai',
  studentInsights: '',  // legacy single RAG result via {studentInsights}
  ragInsights: {},      // named variables: { "admittedPatterns": "...", ... } used as {insight:name}
  promoCodes: []        // [{ code, type: 'promo'|'feature', discountPercent?, discountAmount?, grantPlan? }]
};

let appSettingsCache = null;
function getAppSettings() {
  if (appSettingsCache) return appSettingsCache;
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      appSettingsCache = { ...DEFAULT_SETTINGS, ...parsed };
      return appSettingsCache;
    }
  } catch (e) { console.error('Error reading settings:', e.message); }
  appSettingsCache = { ...DEFAULT_SETTINGS };
  return appSettingsCache;
}
function setAppSettings(settings) {
  appSettingsCache = { ...DEFAULT_SETTINGS, ...settings };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(appSettingsCache, null, 2));
}

// Validate promo or feature code; returns { valid, type, discountPercent, discountAmount, grantPlan, planName } or { valid: false }
function validatePromoCode(inputCode) {
  const code = (typeof inputCode === 'string' && inputCode.trim()) ? inputCode.trim().toUpperCase() : '';
  if (!code) return { valid: false };
  const list = (getAppSettings().promoCodes || []).filter(c => c && typeof c.code === 'string');
  const planNames = { premium: 'Premium Plan', 'plus-one-meeting': 'Premium + 1 Meeting', 'weekly-meeting': 'Premium + Weekly Meetings', 'one-time-meeting': 'One-time: 1 Meeting' };
  for (const c of list) {
    if (c.code.trim().toUpperCase() === code) {
      if (c.type === 'feature' && c.grantPlan) {
        return { valid: true, type: 'feature', grantPlan: c.grantPlan, planName: planNames[c.grantPlan] || c.grantPlan };
      }
      if (c.type === 'promo') {
        const discountPercent = typeof c.discountPercent === 'number' ? c.discountPercent : 0;
        const discountAmount = typeof c.discountAmount === 'number' ? c.discountAmount : 0;
        return { valid: true, type: 'promo', discountPercent, discountAmount };
      }
      return { valid: true, type: c.type || 'promo', discountPercent: 0, discountAmount: 0 };
    }
  }
  return { valid: false };
}

// Apply promo discount to amount in cents; returns cents after discount
function applyPromoToAmount(amountCents, codeResult) {
  if (!codeResult || !codeResult.valid || codeResult.type !== 'promo') return amountCents;
  let final = amountCents;
  if (codeResult.discountPercent > 0) {
    final = Math.round(amountCents * (1 - codeResult.discountPercent / 100));
  }
  if (codeResult.discountAmount > 0) {
    final = Math.max(0, final - codeResult.discountAmount);
  }
  return final;
}

// Replace {studentInsights} and {insight:variableName} in prompt text
function replaceInsightPlaceholders(str) {
  if (str == null || typeof str !== 'string') return str;
  const settings = getAppSettings();
  let s = str.replace(/\{studentInsights\}/g, settings.studentInsights || '');
  const ragInsights = settings.ragInsights || {};
  s = s.replace(/\{insight:([^}]+)\}/g, (_, name) => ragInsights[name.trim()] ?? '');
  return s;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize questions file if it doesn't exist
if (!fs.existsSync(QUESTIONS_FILE)) {
  fs.writeFileSync(QUESTIONS_FILE, JSON.stringify([], null, 2));
}

// Initialize responses file if it doesn't exist
if (!fs.existsSync(RESPONSES_FILE)) {
  fs.writeFileSync(RESPONSES_FILE, JSON.stringify([], null, 2));
}

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

// Initialize prompts file if it doesn't exist
if (!fs.existsSync(PROMPTS_FILE)) {
  const defaultPrompts = {
    "welcome": "Hello! I'm your Pathwise counselor. I've reviewed your previous responses. How can I help you today? Feel free to ask me any questions!",
    "default": "Thank you for your question. I'm here to help guide you on your path forward.",
    "systemPrompt": "You are a helpful counselor assistant for Pathwise. You provide guidance and support based on user questionnaire responses. Be empathetic, clear, and concise. When appropriate, reference the user's previous responses to provide personalized advice.",
    "useClaude": true,
    "claudeWeight": 0.7,
    "presetWeight": 0.3,
    "responses": [
      {
        "keywords": ["help", "what", "how", "can you"],
        "response": "I'm here to provide guidance and support based on your questionnaire responses. What specific area would you like to explore?"
      }
    ]
  };
  fs.writeFileSync(PROMPTS_FILE, JSON.stringify(defaultPrompts, null, 2));
}

// Helper function to read JSON file
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Backward compatibility: ensure users have payment fields
    if (filePath === USERS_FILE && Array.isArray(parsed)) {
      parsed.forEach(user => {
        if (user.hasPayment === undefined) {
          user.hasPayment = false;
          user.paymentPlan = null;
          user.paymentDate = null;
        }
      });
    }
    
    return parsed;
  } catch (error) {
    return [];
  }
}

// Helper function to write JSON file
function writeJSONFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Record payment for a user (used by Stripe webhook and verify-session)
async function recordPaymentForUser(userId, plan) {
  const paymentDate = new Date().toISOString();
  const updateData = { hasPayment: true, paymentPlan: plan, paymentDate };
  let user = await db.getUserById(userId);
  if (user !== null) {
    const ok = await db.updateUser(userId, updateData);
    if (ok) {
      console.log(`Payment recorded for user ${userId}, plan: ${plan} (MongoDB)`);
      return true;
    }
    return false;
  }
  const users = readJSONFile(USERS_FILE);
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) return false;
  users[idx].hasPayment = true;
  users[idx].paymentPlan = plan;
  users[idx].paymentDate = paymentDate;
  writeJSONFile(USERS_FILE, users);
  console.log(`Payment recorded for user ${userId}, plan: ${plan} (JSON)`);
  return true;
}

// Password hashing
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// User authentication middleware
function requireLogin(req, res, next) {
  console.log('requireLogin check:', {
    hasSession: !!req.session,
    userId: req.session?.userId,
    username: req.session?.username,
    sessionId: req.sessionID
  });
  
  if (req.session && req.session.userId) {
    next();
  } else {
    console.log('Access denied - no session or userId');
    res.status(401).json({ 
      success: false,
      message: 'Please log in to access this resource' 
    });
  }
}

// Optional login - proceeds whether or not user is logged in
function optionalLogin(req, res, next) {
  next();
}

// Check if user is logged in (for frontend)
function checkAuth(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    // Redirect to login for browser requests, return JSON for API requests
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      res.status(401).json({ authenticated: false });
    } else {
      res.redirect('/login.html');
    }
  }
}

// Authentication middleware for admin endpoints
function requireAuth(req, res, next) {
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123'; // Default password, change via environment variable
  const providedPassword = req.query.password || req.headers['x-admin-password'];
  
  if (!providedPassword) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Password required. Add ?password=YOUR_PASSWORD to the URL or set X-Admin-Password header.' 
    });
  }
  
  if (providedPassword !== adminPassword) {
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Invalid password.' 
    });
  }
  
  next();
}

// API Routes

// Authentication Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('Registration attempt:', { username: req.body.username, hasPassword: !!req.body.password, hasEmail: !!req.body.email });
    const { username, password, email } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }
    
    if (username.length < 3) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username must be at least 3 characters' 
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters' 
      });
    }
    
    // Try MongoDB first, fallback to JSON files
    let existingUser = null;
    const mongoUsers = await db.getUsers();
    
    if (mongoUsers !== null) {
      // Using MongoDB
      existingUser = await db.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username already exists' 
        });
      }
    } else {
      // Fallback to JSON files
      const users = readJSONFile(USERS_FILE);
      if (users.find(u => u.username === username)) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username already exists' 
        });
      }
    }
    
    // Create new user
    const newUser = {
      id: Date.now().toString(),
      username: username,
      passwordHash: hashPassword(password),
      email: email || '',
      hasPayment: false,
      paymentPlan: null,
      paymentDate: null,
      createdAt: new Date().toISOString()
    };
    
    // Save to MongoDB or JSON file
    if (mongoUsers !== null) {
      // Save to MongoDB
      await db.createUser(newUser);
      console.log(`✅ New user registered in MongoDB: ${username}`);
    } else {
      // Fallback to JSON files
      const users = readJSONFile(USERS_FILE);
      users.push(newUser);
      writeJSONFile(USERS_FILE, users);
      console.log(`✅ New user registered in JSON file: ${username}`);
    }
    
    // Auto-login after registration
    req.session.userId = newUser.id;
    req.session.username = newUser.username;
    
    console.log('Session after registration:', {
      userId: req.session.userId,
      username: req.session.username,
      sessionId: req.sessionID
    });
    
    // Save session before sending response
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Registration failed - session error' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Account created successfully',
        user: { id: newUser.id, username: newUser.username }
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: `Registration failed: ${error.message}` 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }
    
    // Try MongoDB first, fallback to JSON files
    let user = null;
    const mongoUsers = await db.getUsers();
    
    if (mongoUsers !== null) {
      // Using MongoDB
      user = await db.getUserByUsername(username);
    } else {
      // Fallback to JSON files
      const users = readJSONFile(USERS_FILE);
      user = users.find(u => u.username === username);
    }
    
    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }
    
    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    
    console.log(`User logged in: ${username}`);
    console.log('Session after login:', {
      userId: req.session.userId,
      username: req.session.username,
      sessionId: req.sessionID
    });
    
    // Save session before sending response
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Login failed - session error' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Login successful',
        user: { id: user.id, username: user.username }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Login failed' 
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

app.get('/api/auth/check', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ 
      authenticated: true, 
      user: { 
        id: req.session.userId, 
        username: req.session.username 
      } 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Canonical order for Initial Diagnostic (Module 0) questions - same as reorder-questions-mongodb.js
const QUESTIONS_CANONICAL_ORDER = [
  '1', '2', '3', '1765772170950', '4', '1765772367077', '1765772344326', '1765772762906',
  '16', // Which application cycle are you in?
  '1765772397699', '1765772638610', '1765772688681', '1765772450417', '1765772501152', '1765772542631', '1765772550210',
  '1765772412151', '1765772737014', '1765772440701', '1765772561776', '1765772590257', '1765772750883',
  '1765772211033', '1765772243220', '1765772607883',
  '1765772624492', '1765772701161'
];

function sortQuestionsByCanonicalOrder(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return questions;
  const orderMap = new Map(QUESTIONS_CANONICAL_ORDER.map((id, i) => [id, i]));
  return [...questions].sort((a, b) => {
    const aId = String(a.id || (a._id && a._id.toString()) || '');
    const bId = String(b.id || (b._id && b._id.toString()) || '');
    const aIdx = orderMap.has(aId) ? orderMap.get(aId) : QUESTIONS_CANONICAL_ORDER.length;
    const bIdx = orderMap.has(bId) ? orderMap.get(bId) : QUESTIONS_CANONICAL_ORDER.length;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return aId.localeCompare(bId);
  });
}

// Get all questions (optionalLogin - for Module 0 anonymous access)
app.get('/api/questions', optionalLogin, async (req, res) => {
  const startTime = Date.now();
  try {
    console.log(`GET /api/questions - Request received from user: ${req.session.userId || 'unknown'}`);
    
    // Add timeout wrapper for MongoDB operations
    const getQuestionsWithTimeout = async () => {
      return new Promise(async (resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Database query timed out after 10 seconds'));
        }, 10000); // 10 second timeout for database operations
        
        try {
          const result = await db.getQuestions();
          clearTimeout(timeout);
          resolve(result);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
        }
      });
    };
    
    // Try MongoDB first, fallback to JSON files
    let questions;
    try {
      questions = await getQuestionsWithTimeout();
      console.log(`GET /api/questions - MongoDB query completed in ${Date.now() - startTime}ms`);
    } catch (mongoError) {
      console.warn(`GET /api/questions - MongoDB query failed or timed out: ${mongoError.message}`);
      questions = null;
    }
    
    if (questions === null) {
      // Fallback to JSON files
      questions = readJSONFile(QUESTIONS_FILE);
      console.log(`GET /api/questions - Using JSON file storage (${questions.length} questions)`);
    } else {
      console.log(`GET /api/questions - Using MongoDB (${questions.length} questions)`);
    }
    questions = sortQuestionsByCanonicalOrder(questions);
    console.log(`GET /api/questions - Returning ${questions.length} questions (total time: ${Date.now() - startTime}ms)`);
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to load questions', details: error.message });
  }
});

// Update questions (for admin/configuration - requires login)
app.post('/api/questions', requireLogin, async (req, res) => {
  try {
    const questions = req.body;
    if (!Array.isArray(questions)) {
      return res.status(400).json({ success: false, message: 'Questions must be an array' });
    }
    
    // Try MongoDB first, fallback to JSON files
    const mongoResult = await db.saveQuestions(questions);
    
    if (mongoResult === null) {
      // Fallback to JSON files
      writeJSONFile(QUESTIONS_FILE, questions);
      console.log(`POST /api/questions - Saved to JSON file (${questions.length} questions)`);
      res.json({ success: true, message: 'Questions updated successfully (JSON file)' });
    } else {
      console.log(`POST /api/questions - Saved to MongoDB (${questions.length} questions)`);
      res.json({ success: true, message: 'Questions updated successfully (MongoDB)' });
    }
  } catch (error) {
    console.error('Error saving questions:', error);
    res.status(500).json({ success: false, message: 'Failed to save questions: ' + error.message });
  }
});

// Settings API - college AI provider etc. (admin)
app.get('/api/settings', (req, res) => {
  try {
    res.json(getAppSettings());
  } catch (e) {
    console.error('GET /api/settings error:', e);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});
app.post('/api/settings', requireLogin, (req, res) => {
  try {
    const body = req.body || {};
    const allowed = ['collegeNameMatch', 'collegeBlurb', 'collegeDetails'];
    const updates = {};
    allowed.forEach(k => {
      if (body[k] === 'openai' || body[k] === 'claude') updates[k] = body[k];
    });
    if (body.studentInsights !== undefined && typeof body.studentInsights === 'string') {
      updates.studentInsights = body.studentInsights;
    }
    if (body.ragInsights !== undefined && typeof body.ragInsights === 'object' && body.ragInsights !== null && !Array.isArray(body.ragInsights)) {
      updates.ragInsights = body.ragInsights;
    }
    if (body.promoCodes !== undefined && Array.isArray(body.promoCodes)) {
      updates.promoCodes = body.promoCodes;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid settings to save.' });
    }
    const current = getAppSettings();
    setAppSettings({ ...current, ...updates });
    console.log('Settings updated:', updates);
    res.json({ success: true, settings: getAppSettings() });
  } catch (e) {
    console.error('POST /api/settings error:', e);
    res.status(500).json({ success: false, message: e.message || 'Failed to save settings' });
  }
});

// Course/Modules API - POST for admin (GET is registered early before static)
app.post('/api/course', requireLogin, (req, res) => {
  try {
    const course = req.body;
    if (!course || typeof course !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid course data' });
    }
    writeJSONFile(COURSE_FILE, course);
    res.json({ success: true, message: 'Course updated successfully' });
  } catch (error) {
    console.error('Error saving course:', error);
    res.status(500).json({ success: false, message: 'Failed to save course' });
  }
});

// Post-College Recommendations Messages endpoints
app.get('/api/post-college-messages', requireLogin, async (req, res) => {
  try {
    // Try MongoDB first, fallback to JSON files
    let data = await db.getPostCollegeMessages();
    
    if (data === null) {
      // Fallback to JSON files
      try {
        data = readJSONFile(POST_COLLEGE_MESSAGES_FILE);
      } catch (error) {
        // If file doesn't exist, return empty array for backward compatibility
        if (error.code === 'ENOENT') {
          return res.json([]);
        } else {
          console.error('Error reading post-college messages:', error);
          return res.status(500).json({ success: false, message: 'Failed to load messages' });
        }
      }
    } else {
      // MongoDB data - remove the type field before returning
      delete data.type;
    }
    
    // Handle both old format (array) and new format (object)
    if (Array.isArray(data)) {
      // Old format - return as is for backward compatibility
      res.json(data);
    } else {
      // New format - return object with questions and finalMessage
      res.json(data);
    }
  } catch (error) {
    console.error('Error reading post-college messages:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

app.post('/api/post-college-messages', requireLogin, async (req, res) => {
  try {
    const data = req.body;
    console.log('POST /api/post-college-messages - Received data:', JSON.stringify(data, null, 2));
    console.log('Data type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('Data length:', Array.isArray(data) ? data.length : 'N/A');
    
    // Check if it's the new format with questions and finalMessage FIRST (before checking if it's an array)
    if (data && typeof data === 'object' && !Array.isArray(data) && 'questions' in data) {
      // New format with questions array and finalMessage
      // Allow empty questions array (user might only want a final message)
      const questionsArray = Array.isArray(data.questions) ? data.questions : [];
      const validQuestions = questionsArray.filter(q => 
        q && typeof q === 'object' && q !== null && q.type !== undefined && typeof q.type === 'string'
      );
      const dataToSave = {
        questions: validQuestions,
        finalMessage: typeof data.finalMessage === 'string' ? data.finalMessage : ''
      };
      console.log('Saving post-college questions with final message:', validQuestions.length, 'questions');
      console.log('Final message:', dataToSave.finalMessage);
      
      // Try MongoDB first, fallback to JSON files
      const mongoResult = await db.savePostCollegeMessages(dataToSave);
      
      if (mongoResult === null) {
        // Fallback to JSON files
        writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
        console.log('File written successfully to:', POST_COLLEGE_MESSAGES_FILE);
        res.json({ success: true, message: 'Post-college questions updated successfully (JSON file)' });
      } else {
        console.log('✅ Post-college questions saved to MongoDB');
        res.json({ success: true, message: 'Post-college questions updated successfully (MongoDB)' });
      }
    } else if (Array.isArray(data)) {
      // Check if it's old format (has delay property) or new format (has type property)
      // More reliable check: new format has 'type', old format has 'delay' but no 'type'
      const hasType = data.length > 0 && data[0] && data[0].type !== undefined;
      const hasDelay = data.length > 0 && data[0] && data[0].delay !== undefined;
      
      console.log('Format detection:', { 
        hasType, 
        hasDelay, 
        firstItemKeys: data[0] ? Object.keys(data[0]) : [],
        firstItem: data[0] 
      });
      
      if (hasType) {
        // New format - questions (has 'type' property)
        // Accept all questions that have a type property, even if text is empty
        const validQuestions = data.filter(q => 
          q && typeof q === 'object' && q !== null && q.type !== undefined && typeof q.type === 'string'
        );
        console.log('Saving post-college questions (new format):', validQuestions.length, 'questions');
        console.log('Questions to save:', JSON.stringify(validQuestions, null, 2));
        
        if (validQuestions.length > 0) {
          writeJSONFile(POST_COLLEGE_MESSAGES_FILE, validQuestions);
          console.log('File written successfully to:', POST_COLLEGE_MESSAGES_FILE);
          
          // Verify the file was written
          if (fs.existsSync(POST_COLLEGE_MESSAGES_FILE)) {
            const written = JSON.parse(fs.readFileSync(POST_COLLEGE_MESSAGES_FILE, 'utf8'));
            console.log('Verified file contents:', written.length, 'questions');
          }
          
          // Save as object with questions array and empty finalMessage for consistency
          const dataToSave = {
            questions: validQuestions,
            finalMessage: ''
          };
          
          // Try MongoDB first, fallback to JSON files
          const mongoResult = await db.savePostCollegeMessages(dataToSave);
          
          if (mongoResult === null) {
            // Fallback to JSON files
            writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
            console.log('File written successfully to:', POST_COLLEGE_MESSAGES_FILE);
            res.json({ success: true, message: 'Post-college questions updated successfully (JSON file)' });
          } else {
            console.log('✅ Post-college questions saved to MongoDB');
            res.json({ success: true, message: 'Post-college questions updated successfully (MongoDB)' });
          }
        } else {
          console.error('No valid questions to save after filtering');
          res.status(400).json({ success: false, message: 'No valid questions to save' });
        }
      } else if (hasDelay) {
        // Old format - validate and save as array
        const validMessages = data.filter(msg => 
          msg && typeof msg.text === 'string' && typeof msg.delay === 'number'
        );
        console.log('Saving old format messages:', validMessages.length);
        
        // Try MongoDB first, fallback to JSON files
        const dataToSave = { questions: [], finalMessage: '' }; // Convert old format to new format
        const mongoResult = await db.savePostCollegeMessages(dataToSave);
        
        if (mongoResult === null) {
          writeJSONFile(POST_COLLEGE_MESSAGES_FILE, validMessages);
          res.json({ success: true, message: 'Post-college messages updated successfully (JSON file)' });
        } else {
          res.json({ success: true, message: 'Post-college messages updated successfully (MongoDB)' });
        }
      } else {
        // Unknown format or empty array
        console.error('Unknown format or empty data:', data);
        res.status(400).json({ success: false, message: 'Invalid data format' });
      }
    } else if (data && typeof data === 'object' && Array.isArray(data.messages)) {
      // Legacy format with messages and promptMessage
      const validMessages = data.messages.filter(msg => 
        msg && typeof msg.text === 'string' && typeof msg.delay === 'number'
      );
      const dataToSave = {
        questions: [],
        finalMessage: data.promptMessage || "Is there anything else you'd like to ask or discuss? Feel free to share your thoughts or questions!"
      };
      
      // Try MongoDB first, fallback to JSON files
      const mongoResult = await db.savePostCollegeMessages(dataToSave);
      
      if (mongoResult === null) {
        writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
        res.json({ success: true, message: 'Post-college messages updated successfully (JSON file)' });
      } else {
        res.json({ success: true, message: 'Post-college messages updated successfully (MongoDB)' });
      }
    } else {
      // Log detailed information about what we received
      console.error('Invalid format - Data received:', JSON.stringify(data, null, 2));
      console.error('Data type:', typeof data);
      console.error('Is array:', Array.isArray(data));
      console.error('Has questions property:', data && typeof data === 'object' && 'questions' in data);
      console.error('Questions is array:', data && typeof data === 'object' && Array.isArray(data.questions));
      res.status(400).json({ success: false, message: 'Invalid format. Expected object with questions array and optional finalMessage.' });
    }
  } catch (error) {
    console.error('Error saving post-college messages:', error);
    res.status(500).json({ success: false, message: 'Failed to save messages' });
  }
});

// Submit responses (requires login)
app.post('/api/responses', requireLogin, async (req, res) => {
  try {
    console.log('POST /api/responses - User:', req.session.userId, req.session.username);
    const response = req.body;
    
    // Add user info and timestamp (ensure userId is always set)
    response.userId = req.session.userId;
    response.username = req.session.username;
    response.timestamp = new Date().toISOString();
    response.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9); // More unique ID
    
    console.log('Saving response with userId:', response.userId);
    
    // Try MongoDB first, fallback to JSON files
    const mongoResult = await db.saveResponse(response);
    
    if (mongoResult === null) {
      // Fallback to JSON files
      const responses = readJSONFile(RESPONSES_FILE);
      responses.push(response);
      writeJSONFile(RESPONSES_FILE, responses);
      console.log(`Response submitted by user: ${req.session.username} (ID: ${response.id}) - Saved to JSON file`);
    } else {
      console.log(`Response submitted by user: ${req.session.username} (ID: ${response.id}) - Saved to MongoDB`);
    }
    
    res.json({ 
      success: true, 
      message: 'Response saved successfully', 
      id: response.id,
      userId: response.userId 
    });
  } catch (error) {
    console.error('Error submitting response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save response: ' + error.message 
    });
  }
});

// Get user's own responses (requires login)
app.get('/api/my-responses', requireLogin, async (req, res) => {
  try {
    console.log('GET /api/my-responses - User:', req.session.userId, req.session.username);
    
    // Try MongoDB first, fallback to JSON files
    let userResponses = await db.getResponsesByUserId(req.session.userId);
    
    if (userResponses === null) {
      // Fallback to JSON files
      const allResponses = readJSONFile(RESPONSES_FILE);
      userResponses = allResponses.filter(r => r.userId === req.session.userId);
      console.log(`GET /api/my-responses - Returning ${userResponses.length} responses (from JSON file)`);
    } else {
      console.log(`GET /api/my-responses - Returning ${userResponses.length} responses (from MongoDB)`);
    }
    res.json(userResponses || []);
  } catch (error) {
    console.error('Error getting user responses:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to load responses',
      message: error.message 
    });
  }
});

// Update a specific response (requires login, and must be user's own response)
app.put('/api/responses/:id', requireLogin, async (req, res) => {
  try {
    const responseId = req.params.id;
    const updatedData = req.body;
    
    // Try MongoDB first, fallback to JSON files
    const mongoResult = await db.updateResponse(responseId, req.session.userId, updatedData);
    
    if (mongoResult !== null && mongoResult !== false) {
      // Successfully updated in MongoDB
      console.log(`Response ${responseId} updated by user: ${req.session.username} (MongoDB)`);
      return res.json({ 
        success: true, 
        message: 'Response updated successfully',
        response: mongoResult
      });
    } else if (mongoResult === false) {
      // Response not found or doesn't belong to user
      return res.status(404).json({ 
        success: false, 
        message: 'Response not found or you do not have permission to edit it' 
      });
    } else {
      // MongoDB not available, fallback to JSON files
      const responses = readJSONFile(RESPONSES_FILE);
      
      const responseIndex = responses.findIndex(r => r.id === responseId);
      
      if (responseIndex === -1) {
        return res.status(404).json({ 
          success: false, 
          message: 'Response not found' 
        });
      }
      
      // Check if the response belongs to the logged-in user
      if (responses[responseIndex].userId !== req.session.userId) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only edit your own responses' 
        });
      }
      
      // Update the response (preserve userId and username)
      responses[responseIndex] = {
        ...responses[responseIndex],
        ...updatedData,
        userId: req.session.userId, // Ensure userId is preserved
        username: req.session.username, // Ensure username is preserved
        updatedAt: new Date().toISOString()
      };
      
      writeJSONFile(RESPONSES_FILE, responses);
      
      console.log(`Response ${responseId} updated by user: ${req.session.username} (JSON file)`);
      res.json({ 
        success: true, 
        message: 'Response updated successfully',
        response: responses[responseIndex]
      });
    }
  } catch (error) {
    console.error('Error updating response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update response: ' + error.message
    });
  }
});

// Delete a response (requires login, and must be user's own response)
app.delete('/api/responses/:id', requireLogin, async (req, res) => {
  try {
    const responseId = req.params.id;
    
    // Try MongoDB first, fallback to JSON files
    const mongoResult = await db.deleteResponse(responseId, req.session.userId);
    
    if (mongoResult === true) {
      // Successfully deleted from MongoDB
      console.log(`Response ${responseId} deleted by user: ${req.session.username} (MongoDB)`);
      return res.json({ 
        success: true, 
        message: 'Response deleted successfully'
      });
    } else if (mongoResult === false) {
      // Response not found or doesn't belong to user
      return res.status(404).json({ 
        success: false, 
        message: 'Response not found or you do not have permission to delete it' 
      });
    } else {
      // MongoDB not available, fallback to JSON files
      const responses = readJSONFile(RESPONSES_FILE);
      
      const responseIndex = responses.findIndex(r => r.id === responseId);
      
      if (responseIndex === -1) {
        return res.status(404).json({ 
          success: false, 
          message: 'Response not found' 
        });
      }
      
      // Check if the response belongs to the logged-in user
      if (responses[responseIndex].userId !== req.session.userId) {
        return res.status(403).json({ 
          success: false, 
          message: 'You can only delete your own responses' 
        });
      }
      
      // Remove the response
      responses.splice(responseIndex, 1);
      writeJSONFile(RESPONSES_FILE, responses);
      
      console.log(`Response ${responseId} deleted by user: ${req.session.username} (JSON file)`);
      res.json({ 
        success: true, 
        message: 'Response deleted successfully'
      });
    }
  } catch (error) {
    console.error('Error deleting response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete response: ' + error.message 
    });
  }
});

// Get all responses (protected - requires password)
app.get('/api/responses', requireAuth, (req, res) => {
  try {
    const responses = readJSONFile(RESPONSES_FILE);
    console.log(`GET /api/responses - Returning ${responses.length} responses (authenticated)`);
    res.json(responses);
  } catch (error) {
    console.error('Error getting responses:', error);
    res.status(500).json({ error: 'Failed to load responses' });
  }
});

// Export data (questions and responses) (protected - requires password)
app.get('/api/export', requireAuth, (req, res) => {
  try {
    const questions = readJSONFile(QUESTIONS_FILE);
    const responses = readJSONFile(RESPONSES_FILE);
    
    const exportData = {
      exportDate: new Date().toISOString(),
      questions: questions,
      responses: responses,
      totalResponses: responses.length
    };
    
    console.log(`GET /api/export - Exporting ${responses.length} responses (authenticated)`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=questionnaire-export.json');
    res.json(exportData);
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Check payment status (optionalLogin - returns hasPayment: false when not logged in)
app.get('/api/payment/status', optionalLogin, async (req, res) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.json({ success: true, hasPayment: false, paymentPlan: null, paymentDate: null });
    }
    // Try MongoDB first, fallback to JSON files
    let user = await db.getUserById(req.session.userId);
    
    if (user === null) {
      // Fallback to JSON files
      const users = readJSONFile(USERS_FILE);
      user = users.find(u => u.id === req.session.userId);
    }
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found',
        hasPayment: false 
      });
    }
    
    res.json({
      success: true,
      hasPayment: user.hasPayment || false,
      paymentPlan: user.paymentPlan || null,
      paymentDate: user.paymentDate || null
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to check payment status',
      hasPayment: false 
    });
  }
});

// Record payment completion (requires login). Accepts optional code: feature code grants plan without charge.
app.post('/api/payment/complete', requireLogin, async (req, res) => {
  try {
    console.log('Payment complete request:', {
      userId: req.session.userId,
      username: req.session.username,
      body: req.body
    });
    
    const { plan, price, code } = req.body;
    let planToRecord = plan;

    // Feature code can grant a plan without payment
    if (typeof code === 'string' && code.trim()) {
      const codeResult = validatePromoCode(code);
      if (codeResult.valid && codeResult.type === 'feature' && codeResult.grantPlan) {
        planToRecord = codeResult.grantPlan;
      }
    }
    
    if (!planToRecord) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment plan is required' 
      });
    }
    
    // Try MongoDB first, fallback to JSON files
    let user = await db.getUserById(req.session.userId);
    let usingMongoDB = true;
    
    if (user === null) {
      // Fallback to JSON files
      usingMongoDB = false;
      const users = readJSONFile(USERS_FILE);
      const userIndex = users.findIndex(u => u.id === req.session.userId);
      
      if (userIndex === -1) {
        console.error('User not found for payment:', req.session.userId);
        return res.status(404).json({ 
          success: false, 
          message: 'User not found. Please log in again.' 
        });
      }
      user = users[userIndex];
    }
    
    if (!user) {
      console.error('User not found for payment:', req.session.userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found. Please log in again.' 
      });
    }
    
    // Update user payment status
    const paymentDate = new Date().toISOString();
    const updateData = {
      hasPayment: true,
      paymentPlan: planToRecord,
      paymentDate: paymentDate
    };
    
    if (usingMongoDB) {
      // Update in MongoDB
      const result = await db.updateUser(req.session.userId, updateData);
      if (result) {
        console.log(`Payment recorded for user: ${user.username}, plan: ${planToRecord} (MongoDB)`);
      } else {
        console.error('Failed to update payment in MongoDB');
        return res.status(500).json({ 
          success: false, 
          message: 'Payment could not be recorded. Please try again.' 
        });
      }
    } else {
      // Update in JSON file
      const users = readJSONFile(USERS_FILE);
      const userIndex = users.findIndex(u => u.id === req.session.userId);
      users[userIndex].hasPayment = true;
      users[userIndex].paymentPlan = planToRecord;
      users[userIndex].paymentDate = paymentDate;
      writeJSONFile(USERS_FILE, users);
      console.log(`Payment recorded for user: ${user.username}, plan: ${planToRecord} (JSON file)`);
    }
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      paymentPlan: planToRecord,
      paymentDate: paymentDate
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment' 
    });
  }
});

// ----- Stripe (real payments) -----
function getAppUrl(req) {
  const base = process.env.APP_URL;
  if (base) return base.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3001';
  return `${proto}://${host}`;
}

// Validate promo or feature code (no login required for checkout flow)
app.post('/api/payment/validate-code', (req, res) => {
  try {
    const { code } = req.body || {};
    const result = validatePromoCode(code);
    res.json(result);
  } catch (e) {
    res.status(500).json({ valid: false, message: e.message || 'Invalid request' });
  }
});

// Create Stripe Checkout Session (redirect user to Stripe to pay)
app.post('/api/payment/create-checkout-session', requireLogin, async (req, res) => {
  try {
    const { plan, price, code } = req.body;
    const planName = plan || 'premium';
    let amountCents = Math.round((Number(price) || 100) * 100);
    const codeResult = validatePromoCode(code);

    // Feature code that grants this plan (or any plan): grant without payment
    if (codeResult.valid && codeResult.type === 'feature' && codeResult.grantPlan) {
      const grantPlan = codeResult.grantPlan;
      const ok = await recordPaymentForUser(req.session.userId, grantPlan);
      if (ok) {
        return res.json({ success: true, granted: true, plan: grantPlan, url: null });
      }
    }

    // Promo code: apply discount
    if (codeResult.valid && codeResult.type === 'promo') {
      amountCents = applyPromoToAmount(amountCents, codeResult);
    }

    if (amountCents <= 0) {
      const planToRecord = codeResult.grantPlan || planName;
      const ok = await recordPaymentForUser(req.session.userId, planToRecord);
      if (ok) return res.json({ success: true, granted: true, plan: planToRecord, url: null });
    }

    if (!stripe) {
      return res.status(503).json({ success: false, message: 'Stripe is not configured. Set STRIPE_SECRET_KEY.' });
    }

    const baseUrl = getAppUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Pathwise – ${planName}` },
          unit_amount: amountCents
        },
        quantity: 1
      }],
      success_url: `${baseUrl}/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payment-process.html`,
      client_reference_id: req.session.userId,
      metadata: { userId: req.session.userId, plan: planName }
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    console.error('Stripe create-checkout-session error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create checkout session' });
  }
});

// Verify Stripe session and mark user paid (called from payment-success page)
app.get('/api/payment/verify-session', requireLogin, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ success: false, message: 'Stripe is not configured.' });
  }
  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ success: false, message: 'session_id required' });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, message: 'Payment not completed' });
    }
    const userId = session.metadata?.userId || session.client_reference_id;
    const plan = session.metadata?.plan || 'premium';
    if (userId !== req.session.userId) {
      return res.status(403).json({ success: false, message: 'Session does not match your account' });
    }
    const ok = await recordPaymentForUser(userId, plan);
    if (!ok) {
      return res.status(500).json({ success: false, message: 'Could not record payment' });
    }
    res.json({ success: true, paymentDate: new Date().toISOString() });
  } catch (err) {
    console.error('Stripe verify-session error:', err);
    res.status(500).json({ success: false, message: err.message || 'Verification failed' });
  }
});

// Stripe webhook (receives checkout.session.completed)
async function paymentWebhookHandler(req, res) {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Stripe webhook not configured');
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).send('Missing stripe-signature');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).send('OK');
  }
  const session = event.data.object;
  const userId = session.metadata?.userId || session.client_reference_id;
  const plan = session.metadata?.plan || 'premium';
  if (!userId) {
    console.error('Stripe webhook: no userId in session');
    return res.status(200).send('OK');
  }
  await recordPaymentForUser(userId, plan);
  res.status(200).send('OK');
}

// Serve login page
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve admin page (requires login)
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Serve responses page (client-side will check auth)
app.get('/responses.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'responses.html'));
});

// Serve documents management page
app.get('/documents.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'documents.html'));
});

// Serve test prompt page
app.get('/test-prompt.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'test-prompt.html'));
});

// Helper function to find matching response based on keywords
function findMatchingResponse(message, prompts) {
  const lowerMessage = message.toLowerCase();
  
  // Check each response for keyword matches
  for (const responseItem of prompts.responses || []) {
    const keywords = responseItem.keywords || [];
    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return responseItem.response;
      }
    }
  }
  
  // Return default if no match found
  return prompts.default || "Thank you for your message. I'm here to help guide you on your path forward.";
}

// Helper function to get user's questionnaire responses for context
async function getUserResponsesForContext(userId) {
  try {
    const doc = await db.getResponseByUserId(userId);
    if (doc && doc.answers) return doc;
    const responses = readJSONFile(RESPONSES_FILE);
    const list = Array.isArray(responses) ? responses : [];
    const userResponses = list.filter(r => r && r.userId === userId);
    if (userResponses.length > 0) return userResponses[userResponses.length - 1];
    return null;
  } catch (error) {
    console.error('Error getting user responses for context:', error);
    return null;
  }
}

// Get student's application cycle from Module 0 question 16 (e.g. "2027-2028")
async function getApplicationCycleForUser(userId) {
  try {
    const context = await getModule0ContextForUser(userId);
    const cycle = context && context.allAnswers && context.allAnswers['16'];
    if (cycle && typeof cycle === 'string' && cycle.trim()) return cycle.trim();
    return null;
  } catch (_) { return null; }
}

// Build Module 0 context string and merged answers for college match
async function getModule0ContextForUser(userId) {
  try {
    let responses = await db.getResponsesByUserId(userId);
    if (!responses || responses.length === 0) {
      const all = readJSONFile(RESPONSES_FILE);
      const list = Array.isArray(all) ? all : [];
      const uid = String(userId || '');
      responses = list.filter(r => r && String(r.userId || '') === uid);
    }
    const toTime = (r) => {
      const t = r.timestamp || r.submittedAt;
      if (!t) return 0;
      const ms = new Date(t).getTime();
      return Number.isNaN(ms) ? 0 : ms;
    };
    // Match module-0 by moduleId or legacy 'module' field (case-insensitive)
    const norm = (v) => String(v || '').trim().toLowerCase();
    let module0 = responses
      .filter(r => norm(r.moduleId || r.module) === 'module-0')
      .sort((a, b) => toTime(b) - toTime(a));
    if (module0.length === 0) {
      // Fallback: use most recent response (legacy responses may lack moduleId)
      const anySorted = responses.slice().sort((a, b) => toTime(b) - toTime(a));
      if (anySorted.length === 0) return null;
      module0 = [anySorted[0]];
    }
    const mostRecent = module0[0];
    const merged = { ...(mostRecent.answers || {}) };
    if (Object.keys(merged).length === 0) return null;

    let questions = await db.getQuestions();
    if (!questions || questions.length === 0) questions = readJSONFile(QUESTIONS_FILE);
    const questionsMap = {};
    (questions || []).forEach(q => { if (q && q.id != null) questionsMap[String(q.id)] = q; });

    const systemFields = ['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions', 'postCollegeAnswers'];
    let allAnswersFormatted = Object.entries(merged)
      .filter(([key]) => !systemFields.includes(key))
      .map(([qId, ans]) => {
        const q = questionsMap[qId] || questionsMap[String(qId)];
        const qText = q ? q.text : qId;
        const formattedAns = Array.isArray(ans) ? ans.join(', ') : String(ans ?? '');
        if (!formattedAns || formattedAns.trim() === '') return null;
        if (q && q.chatPrompt && q.chatPrompt.includes('{answer}')) return q.chatPrompt.replace(/{answer}/g, formattedAns);
        return `${qText}: ${formattedAns}`;
      })
      .filter(Boolean)
      .join('\n');
    if (!allAnswersFormatted || !allAnswersFormatted.trim()) {
      allAnswersFormatted = Object.entries(merged)
        .filter(([key]) => !systemFields.includes(key))
        .map(([qId, ans]) => {
          const formattedAns = Array.isArray(ans) ? ans.join(', ') : String(ans ?? '');
          if (!formattedAns || formattedAns.trim() === '') return null;
          return `Question ${qId}: ${formattedAns}`;
        })
        .filter(Boolean)
        .join('\n');
    }
    return { allAnswersFormatted, allAnswers: merged };
  } catch (err) {
    console.error('Error building Module 0 context:', err);
    return null;
  }
}

// College recommendations endpoint (special endpoint for initial college suggestions)
// Always uses the most recent Module 0 submission from the server (not client-sent data).
app.post('/api/chat/colleges', requireLogin, async (req, res) => {
  try {
    if (!hasLLM) {
      return res.status(500).json({
        success: false,
        message: 'AI integration is not available. Please configure ANTHROPIC_API_KEY in .env for Claude.'
      });
    }

    const context = await getModule0ContextForUser(req.session.userId);
    const responseSummary = (context && context.allAnswersFormatted && context.allAnswersFormatted.trim())
      ? context.allAnswersFormatted
      : null;

    if (!responseSummary) {
      return res.status(400).json({
        success: false,
        message: 'Complete Module 0 (Initial Diagnostic) first to get college recommendations.'
      });
    }

    // Create a specialized prompt for college recommendations
    const collegePrompt = `Based on the following questionnaire responses from a student, recommend 3-5 colleges or universities that would be a good fit. Explain why each college is a good match based on their responses. Be specific and personalized.

Student's Questionnaire Responses:
${responseSummary}

Please provide college recommendations in a clear, organized format. For each college, include:
- College name
- Why it's a good fit based on their responses
- Key features that match their interests/goals

Format your response as a list with clear explanations.`;

    try {
      const collegeRecommendations = await chatComplete(
        'You are a helpful college counselor assistant. Provide personalized college recommendations based on student questionnaire responses.',
        collegePrompt,
        { maxTokens: 2048, temperature: 0.7 }
      );
      
      console.log(`College recommendations generated for user ${req.session.username}`);
      
      res.json({
        success: true,
        message: collegeRecommendations
      });
    } catch (chatGPTError) {
      console.error('ChatGPT error in college recommendations:', chatGPTError);
      res.status(500).json({
        success: false,
        message: 'Failed to generate college recommendations. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Error processing college recommendations:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process college recommendations'
    });
  }
});

// College list with details - multi-step flow: (1) get list, (2) get details for each, (3) format
// Uses most recent Module 0 submission from server for questionnaire context.
app.post('/api/chat/colleges-detailed', requireLogin, async (req, res) => {
  try {
    const { allAnswers, listPrompt } = req.body;

    if (!hasLLM) {
      return res.status(500).json({
        success: false,
        message: 'AI integration is not available. Please configure ANTHROPIC_API_KEY in .env for Claude.'
      });
    }

    const module0Context = await getModule0ContextForUser(req.session.userId);
    let allAnswersFormatted = (module0Context && module0Context.allAnswersFormatted && module0Context.allAnswersFormatted.trim())
      ? module0Context.allAnswersFormatted
      : '';

    if (!allAnswersFormatted && (!allAnswers || Object.keys(allAnswers || {}).length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Complete Module 0 (Initial Diagnostic) first to get college recommendations.'
      });
    }

    if (!allAnswersFormatted && allAnswers && Object.keys(allAnswers).length > 0) {
      const questions = readJSONFile(QUESTIONS_FILE);
      const questionsMap = {};
      (questions || []).forEach(q => { questionsMap[q.id] = q; });
      let postCollegeQuestionsMap = {};
      try {
        const postCollegeData = await db.getPostCollegeMessages();
        if (postCollegeData && postCollegeData.questions && Array.isArray(postCollegeData.questions)) {
          postCollegeData.questions.forEach(q => { postCollegeQuestionsMap[q.id] = q; });
        }
      } catch (err) { console.error('Error loading post-college questions:', err); }
      const allQuestionsMap = { ...questionsMap, ...postCollegeQuestionsMap };
      const systemFields = ['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions'];
      const regularAnswers = { ...allAnswers };
      const postCollegeAnswers = regularAnswers.postCollegeAnswers || {};
      delete regularAnswers.postCollegeAnswers;
      const regularFormatted = Object.entries(regularAnswers)
        .filter(([qId, ans]) => {
          if (systemFields.includes(qId)) return false;
          if (ans === undefined || ans === null || ans === '') return false;
          if (Array.isArray(ans) && ans.length === 0) return false;
          return true;
        })
        .map(([qId, ans]) => {
          const q = allQuestionsMap[qId] || questionsMap[qId];
          const qText = q ? q.text : qId;
          const formattedAns = Array.isArray(ans) ? ans.join(', ') : String(ans);
          if (!formattedAns || formattedAns.trim() === '') return null;
          if (q && q.chatPrompt && q.chatPrompt.trim()) return q.chatPrompt.replace(/{answer}/g, formattedAns);
          return `${qText}: ${formattedAns}`;
        })
        .filter(Boolean)
        .join('\n');
      const postCollegeFormatted = Object.entries(postCollegeAnswers)
        .map(([qId, ans]) => {
          const q = allQuestionsMap[qId] || postCollegeQuestionsMap[qId];
          const qText = q ? q.text : qId;
          const formattedAns = Array.isArray(ans) ? ans.join(', ') : String(ans);
          if (q && q.chatPrompt && q.chatPrompt.trim()) return q.chatPrompt.replace(/{answer}/g, formattedAns);
          return `${qText}: ${formattedAns}`;
        })
        .filter(t => t && t.trim())
        .join('\n');
      if (regularFormatted && regularFormatted.trim()) allAnswersFormatted += 'Regular questionnaire answers:\n' + regularFormatted;
      if (postCollegeFormatted && postCollegeFormatted.trim()) {
        if (allAnswersFormatted) allAnswersFormatted += '\n\n';
        allAnswersFormatted += 'Post-college question answers:\n' + postCollegeFormatted;
      }
    } else if (allAnswersFormatted && allAnswers && (allAnswers.postCollegeAnswers || {}) && Object.keys(allAnswers.postCollegeAnswers || {}).length > 0) {
      const questions = readJSONFile(QUESTIONS_FILE);
      const questionsMap = {};
      (questions || []).forEach(q => { questionsMap[q.id] = q; });
      let postCollegeQuestionsMap = {};
      try {
        const postCollegeData = await db.getPostCollegeMessages();
        if (postCollegeData && postCollegeData.questions && Array.isArray(postCollegeData.questions)) {
          postCollegeData.questions.forEach(q => { postCollegeQuestionsMap[q.id] = q; });
        }
      } catch (err) { console.error('Error loading post-college questions:', err); }
      const postCollegeAnswers = allAnswers.postCollegeAnswers || {};
      const postCollegeFormatted = Object.entries(postCollegeAnswers)
        .map(([qId, ans]) => {
          const q = postCollegeQuestionsMap[qId] || questionsMap[qId];
          const qText = q ? q.text : qId;
          const formattedAns = Array.isArray(ans) ? ans.join(', ') : String(ans);
          if (q && q.chatPrompt && q.chatPrompt.trim()) return q.chatPrompt.replace(/{answer}/g, formattedAns);
          return `${qText}: ${formattedAns}`;
        })
        .filter(t => t && t.trim())
        .join('\n');
      if (postCollegeFormatted && postCollegeFormatted.trim()) {
        allAnswersFormatted += '\n\nPost-college question answers:\n' + postCollegeFormatted;
      }
    }

    let collegeListFormatted = 'No colleges added yet.';
    try {
      const listUser = await db.getUserById(req.session.userId);
      const list = (listUser && listUser.collegeList && Array.isArray(listUser.collegeList)) ? listUser.collegeList : [];
      if (list.length > 0) {
        collegeListFormatted = list.map(c => c.blurb ? `${(c.name || '').trim()}: ${(c.blurb || '').trim()}` : (c.name || '').trim()).filter(Boolean).join('\n');
      }
    } catch (_) {}

    // Step 1: Get list of colleges
    const defaultListPrompt = `Based on the following questionnaire responses from a student, provide a list of 5-8 college or university names that would be a good fit. Return ONLY the college names, one per line, no numbering, bullets, or extra text.

Student's questionnaire responses:
${allAnswersFormatted || 'No responses yet.'}`;

    const listPromptToUse = (listPrompt && listPrompt.trim())
      ? replaceInsightPlaceholders(listPrompt.replace(/{allAnswers}/g, allAnswersFormatted || 'No responses yet.').replace(/\{collegeList\}/g, collegeListFormatted))
      : defaultListPrompt;

    const listText = await chatComplete(
      'You are a college counselor. Return only college names, one per line, nothing else.',
      listPromptToUse,
      { maxTokens: 2048, temperature: 0.7 }
    ) || '';

    // Parse college names: split by newline, strip numbers/bullets, trim
    const collegeNames = listText
      .split(/\r?\n/)
      .map(line => line.replace(/^\s*[\d\-*•.]+\s*/, '').replace(/\s*[-–—].*$/, '').trim())
      .filter(name => name.length > 2)
      .slice(0, 8);

    if (collegeNames.length === 0) {
      return res.json({
        success: true,
        message: 'I couldn\'t generate a college list from the responses. Please ensure you\'ve completed the questionnaire.'
      });
    }

    // Step 2: Get details for each college (limit 6, run 2 at a time)
    const MAX_COLLEGES = 6;
    const collegesToDetail = collegeNames.slice(0, MAX_COLLEGES);
    const detailPrompts = collegesToDetail.map(name => ({
      college: name,
      prompt: `Provide concise details about "${name}" for a college counselor context: location, notable programs, acceptance rate (if known), campus culture, and why it might be a good fit for students. Use 2-3 sentences.`
    }));

    const details = [];
    for (let i = 0; i < detailPrompts.length; i += 2) {
      const batch = detailPrompts.slice(i, i + 2);
      const batchResults = await Promise.all(
        batch.map(async ({ college, prompt }) => {
          const text = await chatComplete(
            'You are a college counselor. Provide brief, factual details.',
            prompt,
            { maxTokens: 800, temperature: 0.5 }
          );
          return { college, text: text || '' };
        })
      );
      details.push(...batchResults);
    }

    // Step 3: Format combined output
    let formatted = '**College recommendations with details:**\n\n';
    details.forEach(({ college, text }) => {
      formatted += `### ${college}\n\n${text.trim()}\n\n`;
    });

    if (collegeNames.length > MAX_COLLEGES) {
      formatted += `*Also considered: ${collegeNames.slice(MAX_COLLEGES).join(', ')}*`;
    }

    console.log(`College list + details generated for user ${req.session.username} (${details.length} colleges)`);

    res.json({
      success: true,
      message: formatted
    });
  } catch (error) {
    console.error('Error in colleges-detailed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate college list with details.'
    });
  }
});

// Question-specific ChatGPT endpoint (for responses after each question)
app.post('/api/chat/question', requireLogin, async (req, res) => {
  try {
    const { questionId, questionText, answer, allAnswers, prompt } = req.body;
    
    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    // Check if Claude is available
    if (!hasLLM) {
      return res.status(500).json({
        success: false,
        message: 'AI integration is not available. Please configure ANTHROPIC_API_KEY in .env for Claude.'
      });
    }

    try {
      // Get questions to format all answers nicely and check RAG settings
      const questions = readJSONFile(QUESTIONS_FILE);
      const questionsMap = {};
      questions.forEach(q => {
        questionsMap[q.id] = q;
      });
      
      // Also get post-college questions to format post-college answers
      let postCollegeQuestionsMap = {};
      try {
        const postCollegeData = await db.getPostCollegeMessages();
        if (postCollegeData && postCollegeData.questions && Array.isArray(postCollegeData.questions)) {
          postCollegeData.questions.forEach(q => {
            postCollegeQuestionsMap[q.id] = q;
          });
        }
      } catch (error) {
        console.error('Error loading post-college questions for formatting:', error);
      }
      
      // Combine both question maps
      const allQuestionsMap = { ...questionsMap, ...postCollegeQuestionsMap };

      const currentQuestion = allQuestionsMap[questionId] || questionsMap[questionId];

      // Build context with all answers formatted using question-specific prompts if available
      let contextPrompt = prompt;
      
      // Format the current answer
      let formattedCurrentAns = '';
      if (answer) {
        if (Array.isArray(answer)) {
          formattedCurrentAns = answer.join(', ');
        } else {
          formattedCurrentAns = answer;
        }
      }
      
      // Debug: Log what we received
      console.log('Received for ChatGPT:', {
        questionId,
        hasAllAnswers: !!allAnswers,
        allAnswersKeys: allAnswers ? Object.keys(allAnswers) : [],
        allAnswersSample: allAnswers ? JSON.stringify(allAnswers).substring(0, 500) : 'none',
        hasPostCollegeAnswers: allAnswers && allAnswers.postCollegeAnswers ? Object.keys(allAnswers.postCollegeAnswers).length : 0,
        postCollegeAnswersSample: allAnswers && allAnswers.postCollegeAnswers ? JSON.stringify(allAnswers.postCollegeAnswers).substring(0, 300) : 'none'
      });
      
      // If allAnswers is provided, add formatted context
      // Handle both regular answers and post-college answers
      if (allAnswers && Object.keys(allAnswers).length > 0) {
        // Separate regular answers from post-college answers
        const regularAnswers = { ...allAnswers };
        const postCollegeAnswers = regularAnswers.postCollegeAnswers || {};
        delete regularAnswers.postCollegeAnswers;
        
        // Format regular answers
        // Filter out empty/null/undefined answers and system fields
        const systemFields = ['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions'];
        const regularAnswersFormatted = Object.entries(regularAnswers)
          .filter(([qId, ans]) => {
            // Skip system fields and empty answers
            if (systemFields.includes(qId)) return false;
            if (ans === undefined || ans === null || ans === '') return false;
            if (Array.isArray(ans) && ans.length === 0) return false;
            return true;
          })
          .map(([qId, ans]) => {
            const question = allQuestionsMap[qId] || questionsMap[qId];
            const qText = question ? question.text : qId;
            
            // Format the answer
            let formattedAns;
            if (Array.isArray(ans)) {
              formattedAns = ans.join(', ');
            } else {
              formattedAns = String(ans);
            }
            
            // Skip if formatted answer is empty
            if (!formattedAns || formattedAns.trim() === '') {
              return null;
            }
            
            // Use question-specific prompt if available
            if (question && question.chatPrompt && question.chatPrompt.trim()) {
              return question.chatPrompt.replace(/{answer}/g, formattedAns);
            }
            
            // Always include question text with answer: "Question: Answer"
            return `${qText}: ${formattedAns}`;
          })
          .filter(text => text && text.trim()) // Remove null/empty entries
          .join('\n');
        
        // Format post-college answers
        const postCollegeAnswersFormatted = Object.entries(postCollegeAnswers)
          .map(([qId, ans]) => {
            const question = allQuestionsMap[qId] || postCollegeQuestionsMap[qId];
            const qText = question ? question.text : qId;
            
            // Format the answer
            let formattedAns;
            if (Array.isArray(ans)) {
              formattedAns = ans.join(', ');
            } else {
              formattedAns = ans;
            }
            
            // Use question-specific prompt if available
            if (question && question.chatPrompt && question.chatPrompt.trim()) {
              return question.chatPrompt.replace(/{answer}/g, formattedAns);
            }
            
            // Always include question text with answer: "Question: Answer"
            return `${qText}: ${formattedAns}`;
          })
          .filter(text => text.trim()) // Remove empty entries
          .join('\n');
        
        // Combine both formatted answer sets
        let allAnswersFormatted = '';
        if (regularAnswersFormatted && regularAnswersFormatted.trim()) {
          allAnswersFormatted += 'Regular questionnaire answers:\n' + regularAnswersFormatted;
        }
        if (postCollegeAnswersFormatted && postCollegeAnswersFormatted.trim()) {
          if (allAnswersFormatted) allAnswersFormatted += '\n\n';
          allAnswersFormatted += 'Post-college question answers:\n' + postCollegeAnswersFormatted;
        }
        
        // Debug: Log formatted answers
        console.log('Formatted answers for context:', {
          regularAnswersCount: Object.keys(regularAnswers).length,
          regularAnswersFormattedCount: regularAnswersFormatted ? regularAnswersFormatted.split('\n').length : 0,
          postCollegeAnswersCount: Object.keys(postCollegeAnswers).length,
          postCollegeAnswersFormattedCount: postCollegeAnswersFormatted ? postCollegeAnswersFormatted.split('\n').length : 0,
          totalLength: allAnswersFormatted.length,
          regularAnswersSample: regularAnswersFormatted ? regularAnswersFormatted.substring(0, 500) : 'empty',
          postCollegeAnswersSample: postCollegeAnswersFormatted ? postCollegeAnswersFormatted.substring(0, 500) : 'empty',
          hasRegularAnswers: !!regularAnswersFormatted && regularAnswersFormatted.trim().length > 0,
          hasPostCollegeAnswers: !!postCollegeAnswersFormatted && postCollegeAnswersFormatted.trim().length > 0
        });
        
        // Check if prompt already has {allAnswers} replaced (client-side replacement)
        // If it does, we still want to add our formatted context to ensure completeness
        const promptHasAllAnswers = prompt.includes('Regular questionnaire answers:') || prompt.includes('Post-college question answers:');
        
        // Always include current question and answer at the top (even if it's in allAnswers, it's clearer this way)
        // Even if answer is empty (when going back), still include the context
        if (questionText) {
          if (allAnswersFormatted && allAnswersFormatted.trim()) {
            // We have previous answers, include them
            // If prompt already has answers, append our formatted version for completeness
            if (promptHasAllAnswers) {
              // Prompt already has answers, but add our formatted version to ensure all context is included
              if (formattedCurrentAns) {
                contextPrompt = `Current question: ${questionText}\nCurrent answer: ${formattedCurrentAns}\n\nComplete user information:\n${allAnswersFormatted}\n\n${prompt}`;
              } else {
                contextPrompt = `Current question: ${questionText}\n\nComplete user information:\n${allAnswersFormatted}\n\n${prompt}`;
              }
            } else {
              // Prompt doesn't have answers, add them
              if (formattedCurrentAns) {
                contextPrompt = `Current question: ${questionText}\nCurrent answer: ${formattedCurrentAns}\n\nAll previous answers:\n${allAnswersFormatted}\n\n${prompt}`;
              } else {
                // Answer is empty (going back), but still include all previous answers
                contextPrompt = `Current question: ${questionText}\n\nAll previous answers:\n${allAnswersFormatted}\n\n${prompt}`;
              }
            }
          } else {
            // No previous answers formatted, just use current question/answer
            if (formattedCurrentAns) {
              contextPrompt = `Current question: ${questionText}\nCurrent answer: ${formattedCurrentAns}\n\n${prompt}`;
            } else {
              contextPrompt = `Current question: ${questionText}\n\n${prompt}`;
            }
          }
        } else {
          if (allAnswersFormatted && allAnswersFormatted.trim()) {
            if (promptHasAllAnswers) {
              contextPrompt = `Complete user information:\n${allAnswersFormatted}\n\n${prompt}`;
            } else {
              contextPrompt = `All previous answers:\n${allAnswersFormatted}\n\n${prompt}`;
            }
          } else {
            contextPrompt = prompt;
          }
        }
      } else if (questionText && formattedCurrentAns) {
        // If no previous answers, just include current question and answer
        contextPrompt = `Current question: ${questionText}\nCurrent answer: ${formattedCurrentAns}\n\n${prompt}`;
      }

      // Query RAG system if enabled for this question
      // Check both currentQuestion (from questions array) and request body (for post-college questions)
      let ragResults = '';
      const useRAG = (currentQuestion && currentQuestion.useRAG) || (req.body.useRAG === true);
      const ragQuery = (currentQuestion && currentQuestion.ragQuery) || req.body.ragQuery;
      
      if (useRAG && ragQuery && ragQueryHandler) {
        try {
          // Build the RAG search query, replacing {answer} with actual answer
          let ragQueryToUse = ragQuery.replace(/{answer}/g, answer);
          
          console.log(`RAG search for question ${questionId}: ${ragQueryToUse}`);
          
          const ragResult = await ragQueryHandler.query(ragQueryToUse, {
            topK: 5,
            temperature: 0.7,
            maxTokens: 2048
          });

          if (ragResult.success && ragResult.sources && ragResult.sources.length > 0) {
            // Format RAG results
            ragResults = '\n\nRelevant information from knowledge base:\n';
            ragResult.sources.forEach((source, idx) => {
              ragResults += `[Source ${idx + 1}]: ${source.text}\n`;
            });
            console.log(`RAG found ${ragResult.sources.length} relevant sources`);
          } else {
            ragResults = '\n\nNo relevant information found in knowledge base.';
            console.log('RAG search returned no results');
          }
        } catch (ragError) {
          console.error('RAG query error (non-fatal):', ragError);
          ragResults = '\n\nError searching knowledge base.';
        }
      }
      
      let collegeListFormattedQ = 'No colleges added yet.';
      try {
        const qUser = await db.getUserById(req.session.userId);
        const qList = (qUser && qUser.collegeList && Array.isArray(qUser.collegeList)) ? qUser.collegeList : [];
        if (qList.length > 0) {
          collegeListFormattedQ = qList.map(c => c.blurb ? `${(c.name || '').trim()}: ${(c.blurb || '').trim()}` : (c.name || '').trim()).filter(Boolean).join('\n');
        }
      } catch (_) {}
      let finalPrompt = contextPrompt
        .replace(/{ragResults}/g, ragResults || 'No RAG results available.')
        .replace(/\{collegeList\}/g, collegeListFormattedQ);
      
      // Debug: Log the final prompt being sent to ChatGPT
      console.log('Final prompt to Claude:');
      console.log('  Length:', finalPrompt.length);
      console.log('  Contains "Regular questionnaire answers:":', finalPrompt.includes('Regular questionnaire answers:'));
      console.log('  Contains "Post-college question answers:":', finalPrompt.includes('Post-college question answers:'));
      console.log('  Contains "All previous answers:":', finalPrompt.includes('All previous answers:'));
      console.log('  Contains "Complete user information:":', finalPrompt.includes('Complete user information:'));
      console.log('  First 1500 chars:', finalPrompt.substring(0, 1500));
      console.log('  Last 500 chars:', finalPrompt.substring(Math.max(0, finalPrompt.length - 500)));
      
      const response = await chatComplete(
        "You are a helpful counselor assistant. Provide brief, helpful responses based on all the context provided about the user's previous answers and any relevant information from the knowledge base.",
        finalPrompt,
        { maxTokens: 2048, temperature: 0.7 }
      );
      
      console.log(`Question-specific Claude response for question ${questionId} (with ${Object.keys(allAnswers || {}).length} previous answers${ragResults ? ' + RAG' : ''})`);
      
      res.json({
        success: true,
        message: response
      });
    } catch (chatError) {
      console.error('AI error in question response:', chatError);
      const errMsg = chatError && chatError.message ? chatError.message : 'Unknown error';
      res.status(500).json({
        success: false,
        message: `Failed to generate response: ${errMsg}`
      });
    }
  } catch (error) {
    console.error('Error processing question Claude response:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process response'
    });
  }
});

// Run a post-college question's prompt and return the AI output (for Module 1 counselor flow)
app.post('/api/chat/run-post-college', requireLogin, async (req, res) => {
  try {
    const { questionId, userResponses } = req.body;
    if (!questionId) {
      return res.status(400).json({ success: false, message: 'questionId is required' });
    }
    if (!hasLLM) {
      return res.status(503).json({
        success: false,
        message: 'AI integration is not available. Set ANTHROPIC_API_KEY in .env and restart the server.'
      });
    }
    let userResponse = userResponses || await getUserResponsesForContext(req.session.userId);
    if (Array.isArray(userResponse)) {
      const merged = { answers: {}, postCollegeAnswers: {} };
      userResponse.forEach(r => {
        Object.assign(merged.answers, r.answers || r);
        if (r.postCollegeAnswers) Object.assign(merged.postCollegeAnswers, r.postCollegeAnswers);
      });
      userResponse = merged;
    }
    const answers = (userResponse && userResponse.answers) || userResponse || {};
    const postCollegeAnswers = (userResponse && userResponse.postCollegeAnswers) || {};
    const allAnswers = { ...answers, ...postCollegeAnswers };

    let postCollegeData = null;
    try {
      postCollegeData = await db.getPostCollegeMessages();
    } catch (e) { /* ignore */ }
    if (!postCollegeData || !postCollegeData.questions) {
      try {
        postCollegeData = readJSONFile(POST_COLLEGE_MESSAGES_FILE);
      } catch (e) {
        return res.status(400).json({ success: false, message: 'Post-college questions not configured. Add them in Admin.' });
      }
    }
    const pcQuestions = Array.isArray(postCollegeData.questions) ? postCollegeData.questions : [];
    const question = pcQuestions.find(q => q && q.id === questionId);
    if (!question || !question.chatPrompt) {
      return res.status(400).json({ success: false, message: 'Question not found or has no prompt.' });
    }

    let questions = [];
    try {
      const qResult = await db.getQuestions();
      if (Array.isArray(qResult)) questions = qResult;
      else if (!questions.length) questions = readJSONFile(QUESTIONS_FILE);
    } catch (e) {
      try { questions = readJSONFile(QUESTIONS_FILE); } catch (e2) { questions = []; }
    }
    if (!Array.isArray(questions)) questions = [];
    const questionsMap = {};
    questions.forEach(q => { if (q && q.id) questionsMap[q.id] = q; });
    const postCollegeMap = {};
    pcQuestions.forEach(q => { if (q && q.id) postCollegeMap[q.id] = q; });
    const allQuestionsMap = { ...questionsMap, ...postCollegeMap };

    const responseSummary = Object.entries(allAnswers)
      .filter(([key]) => key && !['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions', 'postCollegeAnswers'].includes(key))
      .map(([qId, value]) => {
        const q = allQuestionsMap[qId];
        const text = (q && q.text) || qId;
        const formatted = Array.isArray(value) ? value.join(', ') : String(value ?? '');
        return (q && q.chatPrompt && typeof q.chatPrompt === 'string' && q.chatPrompt.includes('{answer}'))
          ? q.chatPrompt.replace(/{answer}/g, formatted)
          : `${text}: ${formatted}`;
      })
      .filter(t => t && t.trim())
      .join('\n');

    const allAnswersStr = responseSummary || 'No responses yet.';
    const directPrompt = replaceInsightPlaceholders(
      String(question.chatPrompt || '')
        .replace(/{allAnswers}/g, allAnswersStr)
        .replace(/\{q:([^}]+)\}/g, (_, qId) => {
          const ans = allAnswers[(qId || '').trim()];
          return ans != null ? (Array.isArray(ans) ? ans.join(', ') : String(ans)) : '';
        })
    );

    let result;
    try {
      result = await chatComplete(
        'You are a college counselor. Follow the instructions exactly. Return only what is asked for.',
        directPrompt,
        { maxTokens: 2048, temperature: 0.7 }
      );
    } catch (apiError) {
      console.error('run-post-college Claude API error:', apiError);
      const msg = apiError.message || String(apiError);
      return res.status(500).json({
        success: false,
        message: msg.includes('API key') ? 'AI is not configured. Check ANTHROPIC_API_KEY.' : (msg || 'AI request failed. Try again.')
      });
    }

    res.json({ success: true, message: result || '' });
  } catch (error) {
    console.error('run-post-college error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to run post-college question'
    });
  }
});

// Counselor chat endpoint (combines preset prompts with ChatGPT)
app.post('/api/chat', requireLogin, async (req, res) => {
  try {
    const { message, userResponses, conversationHistory } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Load prompts from file
    const prompts = readJSONFile(PROMPTS_FILE);
    
    // Find matching preset response based on keywords
    const presetResponse = findMatchingResponse(message, prompts);
    
    // Check if Claude should be used
    const useClaude = hasLLM && (prompts.useClaude !== false || prompts.useChatGPT !== false);
    
    let finalResponse = presetResponse;
    
    if (useClaude) {
      try {
        // Get user's questionnaire responses for context
        // Prefer userResponses from client, fallback to database lookup
        let userResponse = userResponses || await getUserResponsesForContext(req.session.userId);
        if (Array.isArray(userResponse)) {
          const merged = { answers: {}, postCollegeAnswers: {} };
          userResponse.forEach(r => {
            Object.assign(merged.answers, r.answers || r);
            if (r.postCollegeAnswers) Object.assign(merged.postCollegeAnswers, r.postCollegeAnswers);
          });
          userResponse = merged;
        }
        
        let postCollegeQuestionsMap = {};
        let responseSummary = '';
        let allAnswers = {};
        let collegeListFormatted = 'No colleges added yet.';
        try {
          const chatUser = await db.getUserById(req.session.userId);
          const list = (chatUser && chatUser.collegeList && Array.isArray(chatUser.collegeList)) ? chatUser.collegeList : [];
          if (list.length > 0) {
            collegeListFormatted = list.map(c => c.blurb ? `${(c.name || '').trim()}: ${(c.blurb || '').trim()}` : (c.name || '').trim()).filter(Boolean).join('\n');
          }
        } catch (_) {}

        // Load post-college questions (always, for routing college/scholarship queries)
        try {
          const postCollegeData = await db.getPostCollegeMessages();
          if (postCollegeData && postCollegeData.questions && Array.isArray(postCollegeData.questions)) {
            postCollegeData.questions.forEach(q => { postCollegeQuestionsMap[q.id] = q; });
          }
        } catch (err) {
          try {
            const postCollegeFile = readJSONFile(POST_COLLEGE_MESSAGES_FILE);
            if (postCollegeFile && postCollegeFile.questions) {
              postCollegeFile.questions.forEach(q => { postCollegeQuestionsMap[q.id] = q; });
            }
          } catch (e) { /* ignore */ }
        }
        
        // Build system prompt with context
        let systemPrompt = prompts.systemPrompt || "You are a helpful counselor assistant. Provide guidance and support.";
        
        if (userResponse) {
          // Get questions to access question-specific prompts
          const questions = readJSONFile(QUESTIONS_FILE);
          const questionsMap = {};
          questions.forEach(q => { questionsMap[q.id] = q; });
          const allQuestionsMap = { ...questionsMap, ...postCollegeQuestionsMap };
          
          // Get answers from userResponse (could be in 'answers' field or directly in response)
          const answers = userResponse.answers || userResponse;
          
          // Also include post-college answers if they exist
          const postCollegeAnswers = userResponse.postCollegeAnswers || {};
          
          // Combine regular answers and post-college answers
          const allAnswers = { ...answers, ...postCollegeAnswers };
          
          // Add context about user's responses using question-specific prompts
          const responseSummary = Object.entries(allAnswers)
            .filter(([key]) => !['id', 'userId', 'username', 'timestamp', 'submittedAt', 'questions', 'postCollegeAnswers'].includes(key))
            .map(([questionId, value]) => {
              const question = allQuestionsMap[questionId];
              const questionText = question ? question.text : questionId;
              
              // Format the value
              let formattedValue;
              if (Array.isArray(value)) {
                formattedValue = value.join(', ');
              } else {
                formattedValue = String(value ?? '');
              }
              
              // Use question-specific prompt only if it has {answer} (post-college use {allAnswers} differently)
              if (question && question.chatPrompt && question.chatPrompt.includes('{answer}')) {
                return question.chatPrompt.replace(/{answer}/g, formattedValue);
              }
              
              // Default format
              return `${questionText}: ${formattedValue}`;
            })
            .filter(t => t && t.trim())
            .join('\n');
          
          systemPrompt += `\n\nStudent's Initial Diagnostic (Module 0) and questionnaire responses:\n${responseSummary}`;

          // Always include college list in context when available
          if (collegeListFormatted && collegeListFormatted !== 'No colleges added yet.') {
            systemPrompt += `\n\nStudent's college list:\n${collegeListFormatted}`;
          }

          // Add post-college question prompts for college/scholarship guidance
          const postCollegeQuestions = Object.values(postCollegeQuestionsMap);
          if (postCollegeQuestions.length > 0) {
            const allAnswersForPrompts = responseSummary || 'No responses yet.';
            const postCollegeInstructions = postCollegeQuestions
              .filter(q => q.chatPrompt && q.chatPrompt.trim())
              .map(q => {
                let prompt = q.chatPrompt
                  .replace(/{allAnswers}/g, allAnswersForPrompts)
                  .replace(/\{collegeList\}/g, collegeListFormatted)
                  .replace(/\{q:([^}]+)\}/g, (_, qId) => {
                    const ans = allAnswers[qId.trim()];
                    return ans != null ? (Array.isArray(ans) ? ans.join(', ') : String(ans)) : '';
                  });
                return `When user asks about "${q.text}": ${prompt}`;
              })
              .join('\n\n');
            if (postCollegeInstructions) {
              systemPrompt += `\n\nPost-college guidance prompts (use when relevant):\n${postCollegeInstructions}`;
            }
          }
        }
        systemPrompt = systemPrompt.replace(/\{studentInsights\}/g, (getAppSettings().studentInsights || ''));
        
        // Build messages array for Claude
        const messages = [
          { role: 'system', content: systemPrompt }
        ];
        
        // Add conversation history if provided (for context)
        if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
          // Add last few messages from conversation history for context
          conversationHistory.slice(-5).forEach(msg => {
            if (msg.role && msg.content) {
              messages.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
              });
            }
          });
        }
        
        // Add current user message
        messages.push({ role: 'user', content: message });

        // Route college/scholarship queries to post-college prompts (use as direct prompt)
        const msgLower = message.toLowerCase().trim();
        const isCollegeQuery = /\b(college|colleges|university|universities|schools?|recommendations?|where should i (go|apply)|fit for me)\b/.test(msgLower);
        const isScholarshipQuery = /\b(scholarship|scholarships|financial aid|grants?|money for college)\b/.test(msgLower);
        const postCollegeQuestions = Object.values(postCollegeQuestionsMap || {});
        let matchedPostCollege = null;
        if (isCollegeQuery && postCollegeQuestions.length > 0) {
          matchedPostCollege = postCollegeQuestions.find(q => /college|recommendation/i.test(q.text || ''));
        }
        if (isScholarshipQuery && !matchedPostCollege && postCollegeQuestions.length > 0) {
          matchedPostCollege = postCollegeQuestions.find(q => /scholarship/i.test(q.text || ''));
        }

        let chatGPTResponse;
        if (matchedPostCollege && matchedPostCollege.chatPrompt) {
          const allAnswersForPrompt = responseSummary || 'No responses yet.';
          const directPrompt = replaceInsightPlaceholders(
            matchedPostCollege.chatPrompt
              .replace(/{allAnswers}/g, allAnswersForPrompt)
              .replace(/\{collegeList\}/g, collegeListFormatted)
              .replace(/\{q:([^}]+)\}/g, (_, qId) => {
                const ans = allAnswers[qId.trim()];
                return ans != null ? (Array.isArray(ans) ? ans.join(', ') : String(ans)) : '';
              })
          );
          chatGPTResponse = await chatComplete(
            'You are a college counselor. Follow the instructions exactly. Return only what is asked for.',
            directPrompt,
            { maxTokens: 2048, temperature: 0.7 }
          );
          console.log(`Chat: used post-college prompt for "${matchedPostCollege.text}"`);
        } else {
          chatGPTResponse = await chatCompleteWithMessages(
            systemPrompt,
            messages.filter(m => m.role !== 'system'),
            { maxTokens: 2048, temperature: 0.7 }
          );
        }
        
        // Combine preset and Claude responses based on weights
        const presetWeight = prompts.presetWeight || 0.3;
        const claudeWeight = prompts.claudeWeight || prompts.chatGPTWeight || 0.7;
        
        if (presetResponse === prompts.default) {
          finalResponse = chatGPTResponse;
        } else {
          finalResponse = `${presetResponse}\n\n${chatGPTResponse}`;
        }
        
        console.log(`Chat message from user ${req.session.username}: ${message.substring(0, 50)}... (Claude + Preset)`);
      } catch (chatGPTError) {
        console.error('Claude error, using preset only:', chatGPTError);
        // Fall back to preset response if Claude fails
        finalResponse = presetResponse;
      }
    } else {
      console.log(`Chat message from user ${req.session.username}: ${message.substring(0, 50)}... (Preset only)`);
    }

    res.json({
      success: true,
      message: finalResponse
    });
  } catch (error) {
    console.error('Error processing chat message:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process message'
    });
  }
});

// RAG System Endpoints

// Upload PDF document
app.post('/api/rag/upload', requireLogin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded'
      });
    }

    if (!documentProcessor) {
      return res.status(500).json({
        success: false,
        message: 'RAG system not initialized. Please configure OpenAI API key.'
      });
    }

    const filePath = req.file.path;
    const fileName = req.file.originalname;

    // Process PDF
    const result = await documentProcessor.processPDF(filePath, {
      fileName,
      uploadedBy: req.session.username,
      uploadedAt: new Date().toISOString()
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      message: `PDF processed successfully. ${result.numChunks} chunks created from ${result.numPages} pages.`,
      documentIds: result.documentIds,
      numChunks: result.numChunks,
      numPages: result.numPages
    });
  } catch (error) {
    console.error('Error uploading PDF:', error);
    
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to process PDF: ' + error.message
    });
  }
});

// Test ChatGPT prompt endpoint
app.post('/api/chat/test', requireLogin, async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Prompt is required'
      });
    }

    if (!hasLLM) {
      return res.status(500).json({
        success: false,
        message: 'AI integration is not available. Please configure ANTHROPIC_API_KEY in .env for Claude.'
      });
    }

    try {
      const response = await chatComplete(
        'You are a helpful assistant.',
        prompt,
        { maxTokens: 2048, temperature: 0.7 }
      );

      res.json({
        success: true,
        message: response
      });
    } catch (chatGPTError) {
      console.error('Claude error in test:', chatGPTError);
      res.status(500).json({
        success: false,
        message: 'Failed to get response from Claude: ' + chatGPTError.message
      });
    }
  } catch (error) {
    console.error('Error testing prompt:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to test prompt'
    });
  }
});

// Query RAG system
app.post('/api/rag/query', requireLogin, async (req, res) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Query is required'
      });
    }

    if (!ragQueryHandler) {
      return res.status(500).json({
        success: false,
        message: 'RAG system not initialized. Please configure OpenAI API key.'
      });
    }

    const result = await ragQueryHandler.query(query, {
      topK,
      temperature: 0.7,
      maxTokens: 2048
    });

    res.json(result);
  } catch (error) {
    console.error('Error querying RAG system:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to query RAG system: ' + error.message
    });
  }
});

// Run RAG analysis (e.g. similarities between students who got in, GPA/SAT patterns).
// Returns answer and sources. Optionally save the answer so it is injected into prompts as {studentInsights}.
app.post('/api/rag/analyze', requireLogin, async (req, res) => {
  try {
    const { query, moduleText = '', topK = 8, saveToInsights = false, insightName = '' } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Query is required',
        answer: '',
        sources: []
      });
    }

    if (!ragQueryHandler) {
      return res.status(500).json({
        success: false,
        message: 'RAG system not initialized. Configure OpenAI for embeddings and upload student application/outcome documents first.',
        answer: '',
        sources: []
      });
    }

    const result = await ragQueryHandler.query(query.trim(), {
      topK: Math.min(20, Math.max(1, topK)),
      temperature: 0.5,
      maxTokens: 2048,
      moduleText: typeof moduleText === 'string' ? moduleText : ''
    });

    if (saveToInsights && result.success && result.message) {
      const settings = getAppSettings();
      setAppSettings({ ...settings, studentInsights: result.message });
    }

    res.json({
      success: result.success,
      message: result.message || result.success ? '' : 'No relevant documents found.',
      answer: result.success ? result.message : (result.message || ''),
      sources: result.sources || [],
      savedToInsights: !!(saveToInsights && result.success && result.message)
    });
  } catch (error) {
    console.error('Error in RAG analyze:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run analysis: ' + error.message,
      answer: '',
      sources: []
    });
  }
});

// Get all uploaded documents
app.get('/api/rag/documents', requireLogin, (req, res) => {
  try {
    const documents = vectorStore.getAllDocuments();
    
    // Group by source file
    const grouped = {};
    documents.forEach(doc => {
      const source = doc.metadata.source || 'unknown';
      if (!grouped[source]) {
        grouped[source] = {
          source,
          chunks: [],
          metadata: doc.metadata
        };
      }
      grouped[source].chunks.push({
        id: doc.id,
        text: doc.text.substring(0, 200) + '...',
        chunkIndex: doc.metadata.chunkIndex
      });
    });

    res.json({
      success: true,
      documents: Object.values(grouped),
      totalChunks: documents.length
    });
  } catch (error) {
    console.error('Error getting documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get documents: ' + error.message
    });
  }
});

// Clear all documents
app.delete('/api/rag/documents', requireLogin, async (req, res) => {
  try {
    await vectorStore.clear();
    res.json({
      success: true,
      message: 'All documents cleared'
    });
  } catch (error) {
    console.error('Error clearing documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear documents: ' + error.message
    });
  }
});

// Delete documents by source file
app.delete('/api/rag/documents/:source', requireLogin, async (req, res) => {
  try {
    const source = decodeURIComponent(req.params.source);
    const removed = await vectorStore.removeBySource(source);
    
    res.json({
      success: true,
      message: `Removed ${removed} chunks from ${source}`,
      removed
    });
  } catch (error) {
    console.error('Error removing documents:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove documents: ' + error.message
    });
  }
});

// Serve the main page (landing page - accessible without auth)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all handler: serve index.html for any non-API routes
// This allows client-side routing to work properly
// Must be placed AFTER all other routes
app.get('*', (req, res) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).send('Not found');
  }
  // Skip requests for files with extensions (static files should be handled by express.static)
  if (path.extname(req.path)) {
    return res.status(404).send('Not found');
  }
  // Serve index.html for all other routes (client-side routing)
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware (should be before routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  console.error('Error stack:', err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message
  });
});

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Data stored in: ${DATA_DIR}`);
  console.log(`Session secret configured: ${!!process.env.SESSION_SECRET}`);
  console.log(`MongoDB URI configured: ${!!process.env.MONGODB_URI}`);
  console.log(`Claude (AI chat) enabled: ${hasLLM} ${!hasLLM ? '- set ANTHROPIC_API_KEY in .env to enable' : ''}`);

  // Connect to MongoDB on startup
  try {
    const database = await db.connectToDatabase();
    if (database) {
      console.log('✅ MongoDB: All data will be saved to MongoDB Atlas');
    } else {
      console.log('⚠️  MongoDB: Using JSON file storage (data will not persist on Render free tier)');
    }
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.log('⚠️  Falling back to JSON file storage');
  }
  
  console.log('ROUTES AVAILABLE:');
    console.log('  GET  /');
    console.log('  GET  /payment');
    console.log('  GET  /questionnaire.html');
    console.log('  GET  /responses.html');
    console.log('  GET  /admin.html');
    console.log('API endpoints available:');
  console.log('  GET  /api/questions');
  console.log('  POST /api/questions');
  console.log('  GET  /api/responses (admin)');
  console.log('  POST /api/responses');
  console.log('  GET  /api/my-responses');
  console.log('  PUT  /api/responses/:id');
  console.log('  DELETE /api/responses/:id');
  console.log('  GET  /api/export');
  console.log('  GET  /api/payment/status');
  console.log('  POST /api/payment/complete');
  console.log('  POST /api/chat');
  console.log('');
});



