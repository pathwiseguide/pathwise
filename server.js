// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads', 'documents');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize OpenAI (ChatGPT) - only if API key is provided
let openai = null;
if (process.env.OPENAI_API_KEY) {
  const OpenAI = require('openai');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('ChatGPT integration enabled');
} else {
  console.log('ChatGPT integration disabled - OPENAI_API_KEY not set');
}

// Initialize RAG System with persistent storage
const { VectorStore, DocumentProcessor, RAGQueryHandler } = require('./rag-system');
const VECTOR_STORE_PATH = path.join(__dirname, 'data', 'vector-store.json');
const vectorStore = new VectorStore(VECTOR_STORE_PATH);
let documentProcessor = null;
let ragQueryHandler = null;

if (openai) {
  documentProcessor = new DocumentProcessor(openai, vectorStore);
  ragQueryHandler = new RAGQueryHandler(documentProcessor, openai);
  console.log('RAG system initialized with GPT-3.5-turbo');
} else {
  console.log('RAG system disabled - OPENAI_API_KEY not set');
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
app.use(bodyParser.json());
// Serve payment page route BEFORE static files
app.get('/payment', (req, res) => {
  console.log('=== PAYMENT ROUTE HIT ===');
  const filePath = path.join(__dirname, 'public', 'payment.html');
  console.log('File path:', filePath);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Payment page not found');
  }
  res.sendFile(filePath);
});

app.use(express.static('public'));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROMPTS_FILE = path.join(DATA_DIR, 'counselor-prompts.json');
const POST_COLLEGE_MESSAGES_FILE = path.join(DATA_DIR, 'post-college-messages.json');

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
    "useChatGPT": true,
    "chatGPTWeight": 0.7,
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
app.post('/api/auth/register', (req, res) => {
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
    
    const users = readJSONFile(USERS_FILE);
    
    // Check if username already exists
    if (users.find(u => u.username === username)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username already exists' 
      });
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
    
    users.push(newUser);
    writeJSONFile(USERS_FILE, users);
    
    // Auto-login after registration
    req.session.userId = newUser.id;
    req.session.username = newUser.username;
    
    console.log(`New user registered: ${username}`);
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

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and password are required' 
      });
    }
    
    const users = readJSONFile(USERS_FILE);
    const user = users.find(u => u.username === username);
    
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

// Get all questions (requires login)
app.get('/api/questions', requireLogin, (req, res) => {
  try {
    console.log(`GET /api/questions - Request received from user: ${req.session.userId || 'unknown'}`);
    const questions = readJSONFile(QUESTIONS_FILE);
    console.log(`GET /api/questions - Returning ${questions.length} questions`);
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to load questions', details: error.message });
  }
});

// Update questions (for admin/configuration - requires login)
app.post('/api/questions', requireLogin, (req, res) => {
  const questions = req.body;
  if (Array.isArray(questions)) {
    writeJSONFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: 'Questions updated successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Questions must be an array' });
  }
});

// Post-College Recommendations Messages endpoints
app.get('/api/post-college-messages', requireLogin, (req, res) => {
  try {
    const data = readJSONFile(POST_COLLEGE_MESSAGES_FILE);
    // Handle both old format (array) and new format (object)
    if (Array.isArray(data)) {
      // Old format - return as is for backward compatibility
      res.json(data);
    } else {
      // New format - return object with messages and promptMessage
      res.json(data);
    }
  } catch (error) {
    // If file doesn't exist, return empty array for backward compatibility
    if (error.code === 'ENOENT') {
      res.json([]);
    } else {
      console.error('Error reading post-college messages:', error);
      res.status(500).json({ success: false, message: 'Failed to load messages' });
    }
  }
});

app.post('/api/post-college-messages', requireLogin, (req, res) => {
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
      writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
      console.log('File written successfully to:', POST_COLLEGE_MESSAGES_FILE);
      res.json({ success: true, message: 'Post-college questions updated successfully' });
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
          writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
          console.log('File written successfully to:', POST_COLLEGE_MESSAGES_FILE);
          
          // Verify the file was written
          if (fs.existsSync(POST_COLLEGE_MESSAGES_FILE)) {
            const written = JSON.parse(fs.readFileSync(POST_COLLEGE_MESSAGES_FILE, 'utf8'));
            console.log('Verified file contents:', Array.isArray(written) ? written.length : written.questions?.length, 'questions');
          }
          
          res.json({ success: true, message: 'Post-college questions updated successfully' });
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
        writeJSONFile(POST_COLLEGE_MESSAGES_FILE, validMessages);
        res.json({ success: true, message: 'Post-college messages updated successfully' });
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
        messages: validMessages,
        promptMessage: data.promptMessage || "Is there anything else you'd like to ask or discuss? Feel free to share your thoughts or questions!"
      };
      writeJSONFile(POST_COLLEGE_MESSAGES_FILE, dataToSave);
      res.json({ success: true, message: 'Post-college messages updated successfully' });
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
app.post('/api/responses', requireLogin, (req, res) => {
  try {
    console.log('POST /api/responses - User:', req.session.userId, req.session.username);
    const response = req.body;
    const responses = readJSONFile(RESPONSES_FILE);
    
    // Add user info and timestamp (ensure userId is always set)
    response.userId = req.session.userId;
    response.username = req.session.username;
    response.timestamp = new Date().toISOString();
    response.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9); // More unique ID
    
    console.log('Saving response with userId:', response.userId);
    
    responses.push(response);
    writeJSONFile(RESPONSES_FILE, responses);
    
    console.log(`Response submitted by user: ${req.session.username} (ID: ${response.id})`);
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
app.get('/api/my-responses', requireLogin, (req, res) => {
  try {
    console.log('GET /api/my-responses - User:', req.session.userId, req.session.username);
    const responses = readJSONFile(RESPONSES_FILE);
    console.log('Total responses in file:', responses.length);
    
    // Filter to only show responses from the logged-in user
    // Only include responses that have userId matching the current user
    const userResponses = responses.filter(r => {
      // Skip responses without userId (old responses before account system)
      if (!r.userId) {
        console.log('Response has no userId, skipping:', r.id);
        return false;
      }
      const matches = r.userId === req.session.userId;
      if (!matches) {
        console.log('Response filtered out - userId mismatch:', r.userId, 'vs', req.session.userId);
      }
      return matches;
    });
    
    console.log(`GET /api/my-responses - Returning ${userResponses.length} responses for user: ${req.session.username}`);
    res.json(userResponses);
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
app.put('/api/responses/:id', requireLogin, (req, res) => {
  try {
    const responseId = req.params.id;
    const updatedData = req.body;
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
    
    console.log(`Response ${responseId} updated by user: ${req.session.username}`);
    res.json({ 
      success: true, 
      message: 'Response updated successfully',
      response: responses[responseIndex]
    });
  } catch (error) {
    console.error('Error updating response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update response' 
    });
  }
});

// Delete a response (requires login, and must be user's own response)
app.delete('/api/responses/:id', requireLogin, (req, res) => {
  try {
    const responseId = req.params.id;
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
    
    console.log(`Response ${responseId} deleted by user: ${req.session.username}`);
    res.json({ 
      success: true, 
      message: 'Response deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting response:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete response' 
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

// Check payment status (requires login)
app.get('/api/payment/status', requireLogin, (req, res) => {
  try {
    const users = readJSONFile(USERS_FILE);
    const user = users.find(u => u.id === req.session.userId);
    
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

// Record payment completion (requires login)
app.post('/api/payment/complete', requireLogin, (req, res) => {
  try {
    console.log('Payment complete request:', {
      userId: req.session.userId,
      username: req.session.username,
      body: req.body
    });
    
    const { plan, price } = req.body;
    
    if (!plan) {
      return res.status(400).json({ 
        success: false, 
        message: 'Payment plan is required' 
      });
    }
    
    const users = readJSONFile(USERS_FILE);
    const userIndex = users.findIndex(u => u.id === req.session.userId);
    
    console.log('User lookup:', {
      userId: req.session.userId,
      userIndex: userIndex,
      totalUsers: users.length
    });
    
    if (userIndex === -1) {
      console.error('User not found for payment:', req.session.userId);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found. Please log in again.' 
      });
    }
    
    // Update user payment status
    users[userIndex].hasPayment = true;
    users[userIndex].paymentPlan = plan;
    users[userIndex].paymentDate = new Date().toISOString();
    
    writeJSONFile(USERS_FILE, users);
    
    console.log(`Payment recorded for user: ${users[userIndex].username}, plan: ${plan}`);
    
    res.json({
      success: true,
      message: 'Payment recorded successfully',
      paymentPlan: plan,
      paymentDate: users[userIndex].paymentDate
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment' 
    });
  }
});

// Serve login page
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve questionnaire page (client-side will check auth and payment)
app.get('/questionnaire.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'questionnaire.html'));
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
    const responses = readJSONFile(RESPONSES_FILE);
    const userResponses = responses.filter(r => r.userId === userId);
    // Return the most recent response
    if (userResponses.length > 0) {
      return userResponses[userResponses.length - 1];
    }
    return null;
  } catch (error) {
    console.error('Error getting user responses for context:', error);
    return null;
  }
}

// College recommendations endpoint (special endpoint for initial college suggestions)
app.post('/api/chat/colleges', requireLogin, async (req, res) => {
  try {
    const { responseData } = req.body;
    
    if (!responseData || !responseData.answers) {
      return res.status(400).json({
        success: false,
        message: 'Response data is required'
      });
    }

    // Check if ChatGPT is available
    if (!openai) {
      return res.status(500).json({
        success: false,
        message: 'ChatGPT integration is not available. Please configure OPENAI_API_KEY.'
      });
    }

    // Get questions to access question-specific prompts
    const questions = readJSONFile(QUESTIONS_FILE);
    const questionsMap = {};
    questions.forEach(q => {
      questionsMap[q.id] = q;
    });

    // Format questionnaire responses for ChatGPT using question-specific prompts
    const responseSummary = Object.entries(responseData.answers)
      .map(([questionId, value]) => {
        const question = questionsMap[questionId];
        const questionText = question ? question.text : questionId;
        
        // Format the value
        let formattedValue;
        if (Array.isArray(value)) {
          formattedValue = value.join(', ');
        } else {
          formattedValue = value;
        }
        
        // Use question-specific prompt if available, otherwise use default format
        if (question && question.chatPrompt && question.chatPrompt.trim()) {
          // Replace {answer} placeholder with the actual answer
          return question.chatPrompt.replace(/{answer}/g, formattedValue);
        }
        
        // Default format
        return `${questionText}: ${formattedValue}`;
      })
      .join('\n');

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
      // Call ChatGPT
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'system', content: 'You are a helpful college counselor assistant. Provide personalized college recommendations based on student questionnaire responses.' },
          { role: 'user', content: collegePrompt }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });
      
      const collegeRecommendations = completion.choices[0].message.content;
      
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

    // Check if ChatGPT is available
    if (!openai) {
      return res.status(500).json({
        success: false,
        message: 'ChatGPT integration is not available. Please configure OPENAI_API_KEY.'
      });
    }

    try {
      // Get questions to format all answers nicely and check RAG settings
      const questions = readJSONFile(QUESTIONS_FILE);
      const questionsMap = {};
      questions.forEach(q => {
        questionsMap[q.id] = q;
      });

      const currentQuestion = questionsMap[questionId];

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
      
      // If allAnswers is provided, add formatted context
      if (allAnswers && Object.keys(allAnswers).length > 0) {
        const allAnswersFormatted = Object.entries(allAnswers)
          .map(([qId, ans]) => {
            const question = questionsMap[qId];
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
          .join('\n');
        
        // Always include current question and answer at the top (even if it's in allAnswers, it's clearer this way)
        if (questionText && formattedCurrentAns) {
          contextPrompt = `Current question: ${questionText}\nCurrent answer: ${formattedCurrentAns}\n\nAll previous answers:\n${allAnswersFormatted}\n\n${prompt}`;
        } else {
          contextPrompt = `All previous answers:\n${allAnswersFormatted}\n\n${prompt}`;
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
            maxTokens: 1000
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
      
      // Replace {ragResults} placeholder in the prompt
      let finalPrompt = contextPrompt.replace(/{ragResults}/g, ragResults || 'No RAG results available.');
      
      // Call ChatGPT with the formatted prompt
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: 'system', content: 'You are a helpful counselor assistant. Provide brief, helpful responses based on all the context provided about the user\'s previous answers and any relevant information from the knowledge base.' },
          { role: 'user', content: finalPrompt }
        ],
        max_tokens: 500,
        temperature: 0.7
      });
      
      const response = completion.choices[0].message.content;
      
      console.log(`Question-specific ChatGPT response for question ${questionId} (with ${Object.keys(allAnswers || {}).length} previous answers${ragResults ? ' + RAG' : ''})`);
      
      res.json({
        success: true,
        message: response
      });
    } catch (chatGPTError) {
      console.error('ChatGPT error in question response:', chatGPTError);
      res.status(500).json({
        success: false,
        message: 'Failed to generate response. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Error processing question ChatGPT response:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process response'
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
    
    // Check if ChatGPT should be used
    const useChatGPT = prompts.useChatGPT !== false && openai !== null;
    
    let finalResponse = presetResponse;
    
    if (useChatGPT) {
      try {
        // Get user's questionnaire responses for context
        // Prefer userResponses from client, fallback to database lookup
        let userResponse = userResponses || await getUserResponsesForContext(req.session.userId);
        
        // Build system prompt with context
        let systemPrompt = prompts.systemPrompt || "You are a helpful counselor assistant. Provide guidance and support.";
        
        if (userResponse) {
          // Get questions to access question-specific prompts
          const questions = readJSONFile(QUESTIONS_FILE);
          const questionsMap = {};
          questions.forEach(q => {
            questionsMap[q.id] = q;
          });
          
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
              const question = questionsMap[questionId];
              const questionText = question ? question.text : questionId;
              
              // Format the value
              let formattedValue;
              if (Array.isArray(value)) {
                formattedValue = value.join(', ');
              } else {
                formattedValue = value;
              }
              
              // Use question-specific prompt if available, otherwise use default format
              if (question && question.chatPrompt && question.chatPrompt.trim()) {
                // Replace {answer} placeholder with the actual answer
                return question.chatPrompt.replace(/{answer}/g, formattedValue);
              }
              
              // Default format
              return `${questionText}: ${formattedValue}`;
            })
            .join('\n');
          
          systemPrompt += `\n\nUser's questionnaire responses:\n${responseSummary}`;
        }
        
        // Build messages array for ChatGPT
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
        
        // Call ChatGPT
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: messages,
          max_tokens: 500,
          temperature: 0.7
        });
        
        const chatGPTResponse = completion.choices[0].message.content;
        
        // Combine preset and ChatGPT responses based on weights
        const presetWeight = prompts.presetWeight || 0.3;
        const chatGPTWeight = prompts.chatGPTWeight || 0.7;
        
        // If preset response is the default, prioritize ChatGPT
        if (presetResponse === prompts.default) {
          finalResponse = chatGPTResponse;
        } else {
          // Combine both responses
          finalResponse = `${presetResponse}\n\n${chatGPTResponse}`;
        }
        
        console.log(`Chat message from user ${req.session.username}: ${message.substring(0, 50)}... (ChatGPT + Preset)`);
      } catch (chatGPTError) {
        console.error('ChatGPT error, using preset only:', chatGPTError);
        // Fall back to preset response if ChatGPT fails
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

    if (!openai) {
      return res.status(500).json({
        success: false,
        message: 'ChatGPT integration is not available. Please configure OPENAI_API_KEY.'
      });
    }

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const response = completion.choices[0].message.content;

      res.json({
        success: true,
        message: response
      });
    } catch (chatGPTError) {
      console.error('ChatGPT error in test:', chatGPTError);
      res.status(500).json({
        success: false,
        message: 'Failed to get response from ChatGPT: ' + chatGPTError.message
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
      maxTokens: 1000
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
app.delete('/api/rag/documents', requireLogin, (req, res) => {
  try {
    vectorStore.clear();
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
app.delete('/api/rag/documents/:source', requireLogin, (req, res) => {
  try {
    const source = decodeURIComponent(req.params.source);
    const removed = vectorStore.removeBySource(source);
    
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Data stored in: ${DATA_DIR}`);
  console.log(`Session secret configured: ${!!process.env.SESSION_SECRET}`);
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



