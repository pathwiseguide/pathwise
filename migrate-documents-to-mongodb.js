// Script to migrate existing vector store documents from JSON to MongoDB
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

const VECTOR_STORE_PATH = path.join(__dirname, 'data', 'vector-store.json');

async function migrateDocuments() {
  console.log('🔄 Starting vector store documents migration to MongoDB...\n');

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

  // Read documents from JSON file
  let documents = [];
  if (fs.existsSync(VECTOR_STORE_PATH)) {
    try {
      const fileContent = fs.readFileSync(VECTOR_STORE_PATH, 'utf8');
      const data = JSON.parse(fileContent);
      documents = data.documents || [];
      console.log(`📄 Found ${documents.length} document chunks in local JSON file\n`);
    } catch (error) {
      console.error('❌ Error reading vector store file:', error.message);
      process.exit(1);
    }
  } else {
    console.log('⚠️  No vector-store.json file found. Nothing to migrate.');
    process.exit(0);
  }

  if (documents.length === 0) {
    console.log('⚠️  No documents found in file. Nothing to migrate.');
    process.exit(0);
  }

  // Check what's already in MongoDB
  try {
    const existingDocs = await db.getVectorStoreDocuments();
    if (existingDocs && existingDocs.length > 0) {
      console.log(`⚠️  Found ${existingDocs.length} documents already in MongoDB`);
      console.log('This will add new documents. Existing documents will be preserved.\n');
    }
  } catch (error) {
    console.log('No existing documents in MongoDB (or error checking)\n');
  }

  // Save documents to MongoDB
  try {
    console.log('💾 Saving documents to MongoDB...');
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      try {
        const result = await db.addVectorStoreDocument(doc);
        if (result !== null) {
          successCount++;
        } else {
          errorCount++;
        }
        
        // Progress indicator
        if ((i + 1) % 10 === 0 || i === documents.length - 1) {
          console.log(`  Progress: ${i + 1}/${documents.length} documents processed...`);
        }
      } catch (error) {
        console.error(`  Error saving document ${i + 1}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\n✅ Successfully migrated ${successCount} documents to MongoDB!`);
    if (errorCount > 0) {
      console.log(`⚠️  ${errorCount} documents failed to migrate`);
    }
    
    console.log('\n✅ Migration complete!');
    console.log('Your documents are now stored in MongoDB and will persist across restarts.');
    console.log('You can keep the local vector-store.json file as a backup,');
    console.log('or delete it if you want (new documents will go to MongoDB).');
  } catch (error) {
    console.error('❌ Error saving documents:', error.message);
    process.exit(1);
  }

  // Close database connection
  await db.closeDatabase();
  process.exit(0);
}

// Run migration
migrateDocuments().catch(error => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});

