const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Data storage paths
const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');

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

// API Routes

// Get all questions
app.get('/api/questions', (req, res) => {
  try {
    const questions = readJSONFile(QUESTIONS_FILE);
    console.log(`GET /api/questions - Returning ${questions.length} questions`);
    res.json(questions);
  } catch (error) {
    console.error('Error getting questions:', error);
    res.status(500).json({ error: 'Failed to load questions' });
  }
});

// Update questions (for admin/configuration)
app.post('/api/questions', (req, res) => {
  const questions = req.body;
  if (Array.isArray(questions)) {
    writeJSONFile(QUESTIONS_FILE, questions);
    res.json({ success: true, message: 'Questions updated successfully' });
  } else {
    res.status(400).json({ success: false, message: 'Questions must be an array' });
  }
});

// Submit responses
app.post('/api/responses', (req, res) => {
  const response = req.body;
  const responses = readJSONFile(RESPONSES_FILE);
  
  // Add timestamp
  response.timestamp = new Date().toISOString();
  response.id = Date.now().toString();
  
  responses.push(response);
  writeJSONFile(RESPONSES_FILE, responses);
  
  res.json({ success: true, message: 'Response saved successfully', id: response.id });
});

// Get all responses
app.get('/api/responses', (req, res) => {
  const responses = readJSONFile(RESPONSES_FILE);
  res.json(responses);
});

// Export data (questions and responses)
app.get('/api/export', (req, res) => {
  const questions = readJSONFile(QUESTIONS_FILE);
  const responses = readJSONFile(RESPONSES_FILE);
  
  const exportData = {
    exportDate: new Date().toISOString(),
    questions: questions,
    responses: responses,
    totalResponses: responses.length
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename=questionnaire-export.json');
  res.json(exportData);
});

// Serve the main page
app.get('/', (req, res) => {
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

