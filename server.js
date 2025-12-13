const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const session = require('express-session');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'pathwise-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware
app.use(cors({
  origin: true,
  credentials: true // Allow cookies
}));
app.use(bodyParser.json());
app.use(express.static('public'));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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

// Helper function to read JSON file
function readJSONFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
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
  if (req.session && req.session.userId) {
    next();
  } else {
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
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    writeJSONFile(USERS_FILE, users);
    
    // Auto-login after registration
    req.session.userId = newUser.id;
    req.session.username = newUser.username;
    
    console.log(`New user registered: ${username}`);
    res.json({ 
      success: true, 
      message: 'Account created successfully',
      user: { id: newUser.id, username: newUser.username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Registration failed' 
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
    res.json({ 
      success: true, 
      message: 'Login successful',
      user: { id: user.id, username: user.username }
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
    const questions = readJSONFile(QUESTIONS_FILE);
    console.log(`GET /api/questions - Returning ${questions.length} questions`);
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to load questions' });
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

// Submit responses (requires login)
app.post('/api/responses', requireLogin, (req, res) => {
  const response = req.body;
  const responses = readJSONFile(RESPONSES_FILE);
  
  // Add user info and timestamp
  response.userId = req.session.userId;
  response.username = req.session.username;
  response.timestamp = new Date().toISOString();
  response.id = Date.now().toString();
  
  responses.push(response);
  writeJSONFile(RESPONSES_FILE, responses);
  
  console.log(`Response submitted by user: ${req.session.username}`);
  res.json({ success: true, message: 'Response saved successfully', id: response.id });
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

// Serve login page
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve the main page (check authentication)
app.get('/', checkAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Data stored in: ${DATA_DIR}`);
  console.log('API endpoints available:');
  console.log('  GET  /api/questions');
  console.log('  POST /api/questions');
  console.log('  GET  /api/responses');
  console.log('  POST /api/responses');
  console.log('  GET  /api/export');
});

