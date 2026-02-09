// Script to migrate existing questions from JSON file to MongoDB
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DATA_DIR = path.join(__dirname, 'data');
const QUESTIONS_FILE = path.join(DATA_DIR, 'questions.json');

async function migrateQuestions() {
  console.log('🔄 Starting questions migration to MongoDB...\n');

  // Check if MongoDB is configured
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set in .env file');
    console.log('Please add your MongoDB connection string to .env file first.');
    process.exit(1);
  }

  // Connect to MongoDB
  try {
    const database = await db.connectToDatabase();
    if (!database) {
      console.error('❌ Failed to connect to MongoDB');
      process.exit(1);
    }
    console.log('✅ Connected to MongoDB\n');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }

  // Read questions from JSON file
  let questions = [];
  if (fs.existsSync(QUESTIONS_FILE)) {
    try {
      const fileContent = fs.readFileSync(QUESTIONS_FILE, 'utf8');
      questions = JSON.parse(fileContent);
      console.log(`📄 Found ${questions.length} questions in local JSON file\n`);
    } catch (error) {
      console.error('❌ Error reading questions file:', error.message);
      process.exit(1);
    }
  } else {
    console.log('⚠️  No questions.json file found. Nothing to migrate.');
    process.exit(0);
  }

  if (questions.length === 0) {
    console.log('⚠️  No questions found in file. Nothing to migrate.');
    process.exit(0);
  }

  // Check what's already in MongoDB
  try {
    const existingQuestions = await db.getQuestions();
    if (existingQuestions && existingQuestions.length > 0) {
      console.log(`⚠️  Found ${existingQuestions.length} questions already in MongoDB`);
      console.log('This will replace all existing questions in MongoDB.\n');
    }
  } catch (error) {
    console.log('No existing questions in MongoDB (or error checking)\n');
  }

  // Save questions to MongoDB
  try {
    console.log('💾 Saving questions to MongoDB...');
    const result = await db.saveQuestions(questions);
    
    if (result) {
      console.log(`✅ Successfully migrated ${questions.length} questions to MongoDB!\n`);
      console.log('📊 Questions summary:');
      questions.forEach((q, index) => {
        console.log(`   ${index + 1}. ${q.text || q.id || 'Question ' + (index + 1)} (Type: ${q.type || 'N/A'})`);
      });
      console.log('\n✅ Migration complete!');
      console.log('You can now delete the local questions.json file if you want,');
      console.log('but it will be kept as a backup.');
    } else {
      console.error('❌ Failed to save questions to MongoDB');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error saving questions:', error.message);
    process.exit(1);
  }

  // Close database connection
  await db.closeDatabase();
  process.exit(0);
}

// Run migration
migrateQuestions().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

