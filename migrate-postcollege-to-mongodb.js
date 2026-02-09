// Script to migrate existing post-college questions and final message from JSON to MongoDB
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const DATA_DIR = path.join(__dirname, 'data');
const POST_COLLEGE_MESSAGES_FILE = path.join(DATA_DIR, 'post-college-messages.json');

async function migratePostCollegeMessages() {
  console.log('🔄 Starting post-college questions migration to MongoDB...\n');

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

  // Read post-college messages from JSON file
  let data = null;
  if (fs.existsSync(POST_COLLEGE_MESSAGES_FILE)) {
    try {
      const fileContent = fs.readFileSync(POST_COLLEGE_MESSAGES_FILE, 'utf8');
      data = JSON.parse(fileContent);
      console.log('📄 Found post-college data in local JSON file\n');
    } catch (error) {
      console.error('❌ Error reading post-college messages file:', error.message);
      process.exit(1);
    }
  } else {
    console.log('⚠️  No post-college-messages.json file found. Nothing to migrate.');
    process.exit(0);
  }

  if (!data || (Array.isArray(data) && data.length === 0) || (typeof data === 'object' && !data.questions && !data.finalMessage)) {
    console.log('⚠️  No post-college data found in file. Nothing to migrate.');
    process.exit(0);
  }

  // Normalize data format
  let dataToSave = null;
  
  if (Array.isArray(data)) {
    // Check if it's old format (has delay) or new format (has type)
    if (data.length > 0 && data[0] && data[0].type !== undefined) {
      // New format - questions array
      dataToSave = {
        questions: data,
        finalMessage: ''
      };
      console.log(`📋 Found ${data.length} post-college questions (array format)\n`);
    } else {
      // Old format - convert to new format
      dataToSave = {
        questions: [],
        finalMessage: ''
      };
      console.log('📋 Found old format messages (will be converted)\n');
    }
  } else if (data && typeof data === 'object' && 'questions' in data) {
    // New format with questions and finalMessage
    dataToSave = {
      questions: Array.isArray(data.questions) ? data.questions : [],
      finalMessage: typeof data.finalMessage === 'string' ? data.finalMessage : ''
    };
    console.log(`📋 Found ${dataToSave.questions.length} post-college questions and final message\n`);
  } else {
    console.log('⚠️  Unknown data format. Nothing to migrate.');
    process.exit(0);
  }

  // Check what's already in MongoDB
  try {
    const existing = await db.getPostCollegeMessages();
    if (existing && (existing.questions?.length > 0 || existing.finalMessage)) {
      console.log(`⚠️  Found existing post-college data in MongoDB`);
      console.log(`   Questions: ${existing.questions?.length || 0}`);
      console.log(`   Final message: ${existing.finalMessage ? 'Yes' : 'No'}`);
      console.log('This will replace the existing data in MongoDB.\n');
    }
  } catch (error) {
    console.log('No existing post-college data in MongoDB (or error checking)\n');
  }

  // Save to MongoDB
  try {
    console.log('💾 Saving post-college questions to MongoDB...');
    const result = await db.savePostCollegeMessages(dataToSave);
    
    if (result) {
      console.log(`✅ Successfully migrated to MongoDB!`);
      console.log(`   Questions: ${dataToSave.questions.length}`);
      console.log(`   Final message: ${dataToSave.finalMessage ? 'Yes' : 'No'}`);
      
      if (dataToSave.questions.length > 0) {
        console.log('\n📊 Questions summary:');
        dataToSave.questions.forEach((q, index) => {
          console.log(`   ${index + 1}. ${q.text || q.id || 'Question ' + (index + 1)} (ID: ${q.id || 'N/A'}, Type: ${q.type || 'N/A'})`);
        });
      }
      
      if (dataToSave.finalMessage) {
        console.log(`\n💬 Final message: ${dataToSave.finalMessage.substring(0, 100)}${dataToSave.finalMessage.length > 100 ? '...' : ''}`);
      }
      
      console.log('\n✅ Migration complete!');
      console.log('Your post-college questions are now stored in MongoDB and will persist across restarts.');
      console.log('You can keep the local post-college-messages.json file as a backup,');
      console.log('or delete it if you want (new data will go to MongoDB).');
    } else {
      console.error('❌ Failed to save post-college messages to MongoDB');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error saving post-college messages:', error.message);
    process.exit(1);
  }

  // Close database connection
  await db.closeDatabase();
  process.exit(0);
}

// Run migration
migratePostCollegeMessages().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

