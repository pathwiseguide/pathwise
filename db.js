// MongoDB Database Connection and Helper Functions
// This file handles all database operations

const { MongoClient } = require('mongodb');

// MongoDB connection string (from environment variable)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'pathwise'; // Database name

let client = null;
let db = null;

// Connect to MongoDB
async function connectToDatabase() {
  // If already connected, return existing connection
  if (db) {
    return db;
  }

  // If no MongoDB URI, return null (will use JSON files as fallback)
  if (!MONGODB_URI) {
    console.log('⚠️  MONGODB_URI not set - using JSON file storage (data will not persist on Render free tier)');
    return null;
  }

  try {
    // Create MongoDB client
    client = new MongoClient(MONGODB_URI, {
      // Connection options
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    // Connect to MongoDB
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas');

    // Get database
    db = client.db(DB_NAME);
    
    // Create indexes for better performance
    await createIndexes(db);

    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    console.error('⚠️  Falling back to JSON file storage');
    return null;
  }
}

// Create database indexes (makes queries faster)
async function createIndexes(database) {
  try {
    // Index on username for fast user lookups
    await database.collection('users').createIndex({ username: 1 }, { unique: true });
    
    // Index on userId for fast response lookups
    await database.collection('responses').createIndex({ userId: 1 });
    
    // Index on userId for fast question lookups
    await database.collection('questions').createIndex({ userId: 1 });
    
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('Index creation error (may already exist):', error.message);
  }
}

// Close database connection
async function closeDatabase() {
  if (client) {
    await client.close();
    console.log('MongoDB connection closed');
    client = null;
    db = null;
  }
}

// ============================================
// USER OPERATIONS
// ============================================

// Get all users
async function getUsers() {
  const database = await connectToDatabase();
  if (!database) return null; // Will use JSON fallback

  try {
    const users = await database.collection('users').find({}).toArray();
    return users;
  } catch (error) {
    console.error('Error getting users from MongoDB:', error);
    return null;
  }
}

// Get user by username
async function getUserByUsername(username) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const user = await database.collection('users').findOne({ username: username });
    return user;
  } catch (error) {
    console.error('Error getting user from MongoDB:', error);
    return null;
  }
}

// Get user by ID
async function getUserById(userId) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const user = await database.collection('users').findOne({ id: userId });
    return user;
  } catch (error) {
    console.error('Error getting user by ID from MongoDB:', error);
    return null;
  }
}

// Create new user
async function createUser(userData) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const result = await database.collection('users').insertOne(userData);
    console.log('✅ User created in MongoDB:', result.insertedId);
    return userData;
  } catch (error) {
    console.error('Error creating user in MongoDB:', error);
    return null;
  }
}

// Update user
async function updateUser(userId, updateData) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const result = await database.collection('users').updateOne(
      { id: userId },
      { $set: updateData }
    );
    return result.matchedCount > 0;
  } catch (error) {
    console.error('Error updating user in MongoDB:', error);
    return null;
  }
}

// ============================================
// RESPONSE OPERATIONS
// ============================================

// Get all responses
async function getResponses() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const responses = await database.collection('responses').find({}).toArray();
    return responses;
  } catch (error) {
    console.error('Error getting responses from MongoDB:', error);
    return null;
  }
}

// Get response by user ID
async function getResponseByUserId(userId) {
  const responses = await getResponsesByUserId(userId);
  return responses && responses.length > 0 ? responses[responses.length - 1] : null;
}

async function getResponsesByUserId(userId) {
  const database = await connectToDatabase();
  if (!database) return null;
  try {
    let responses = await database.collection('responses').find({ userId }).toArray();
    if (responses.length === 0 && userId != null) {
      const altId = String(userId);
      if (altId !== userId) {
        responses = await database.collection('responses').find({ userId: altId }).toArray();
      }
    }
    return responses;
  } catch (error) {
    console.error('Error getting responses from MongoDB:', error);
    return null;
  }
}

async function saveResponse(responseData) {
  const database = await connectToDatabase();
  if (!database) return null;
  try {
    await database.collection('responses').insertOne(responseData);
    console.log('✅ Response saved to MongoDB');
    return true;
  } catch (error) {
    console.error('Error saving response to MongoDB:', error);
    return null;
  }
}

// ============================================
// QUESTION OPERATIONS
// ============================================

// Get all questions
async function getQuestions() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const questions = await database.collection('questions').find({}).toArray();
    return questions;
  } catch (error) {
    console.error('Error getting questions from MongoDB:', error);
    return null;
  }
}

// Save questions
async function saveQuestions(questions) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    // Delete all existing questions and insert new ones
    await database.collection('questions').deleteMany({});
    if (questions.length > 0) {
      await database.collection('questions').insertMany(questions);
    }
    console.log('✅ Questions saved to MongoDB');
    return true;
  } catch (error) {
    console.error('Error saving questions to MongoDB:', error);
    return null;
  }
}

// ============================================
// PROMPTS OPERATIONS
// ============================================

// Get prompts
async function getPrompts() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const prompts = await database.collection('prompts').findOne({ type: 'counselor-prompts' });
    return prompts || null;
  } catch (error) {
    console.error('Error getting prompts from MongoDB:', error);
    return null;
  }
}

// Save prompts
async function savePrompts(promptsData) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    await database.collection('prompts').updateOne(
      { type: 'counselor-prompts' },
      { $set: { ...promptsData, type: 'counselor-prompts' } },
      { upsert: true }
    );
    console.log('✅ Prompts saved to MongoDB');
    return true;
  } catch (error) {
    console.error('Error saving prompts to MongoDB:', error);
    return null;
  }
}

// ============================================
// POST-COLLEGE MESSAGES OPERATIONS
// ============================================

// Get post-college messages
async function getPostCollegeMessages() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const messages = await database.collection('postCollegeMessages').findOne({ type: 'post-college' });
    return messages || null;
  } catch (error) {
    console.error('Error getting post-college messages from MongoDB:', error);
    return null;
  }
}

// Save post-college messages
async function savePostCollegeMessages(messagesData) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    await database.collection('postCollegeMessages').updateOne(
      { type: 'post-college' },
      { $set: { ...messagesData, type: 'post-college' } },
      { upsert: true }
    );
    console.log('✅ Post-college messages saved to MongoDB');
    return true;
  } catch (error) {
    console.error('Error saving post-college messages to MongoDB:', error);
    return null;
  }
}

// Update response by ID
async function updateResponse(responseId, userId, updatedData) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    // First check if response exists and belongs to user
    const response = await database.collection('responses').findOne({ 
      id: responseId,
      userId: userId 
    });
    
    if (!response) {
      return false; // Response not found or doesn't belong to user
    }
    
    // Update the response (preserve userId and username)
    const result = await database.collection('responses').updateOne(
      { id: responseId, userId: userId },
      { 
        $set: { 
          ...updatedData,
          userId: userId, // Ensure userId is preserved
          updatedAt: new Date().toISOString()
        } 
      }
    );
    
    if (result.matchedCount > 0) {
      console.log('✅ Response updated in MongoDB');
      // Return the updated response
      const updatedResponse = await database.collection('responses').findOne({ 
        id: responseId,
        userId: userId 
      });
      return updatedResponse;
    }
    return false;
  } catch (error) {
    console.error('Error updating response in MongoDB:', error);
    return null;
  }
}

// Delete response by ID
async function deleteResponse(responseId, userId) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    // First check if response exists and belongs to user
    const response = await database.collection('responses').findOne({ 
      id: responseId,
      userId: userId 
    });
    
    if (!response) {
      return false; // Response not found or doesn't belong to user
    }
    
    // Delete the response
    const result = await database.collection('responses').deleteOne({ 
      id: responseId,
      userId: userId 
    });
    
    if (result.deletedCount > 0) {
      console.log('✅ Response deleted from MongoDB');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting response from MongoDB:', error);
    return null;
  }
}

// ============================================
// VECTOR STORE OPERATIONS (for RAG documents)
// ============================================

// Get all vector store documents
async function getVectorStoreDocuments() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const documents = await database.collection('vectorStore').find({}).toArray();
    return documents;
  } catch (error) {
    console.error('Error getting vector store documents from MongoDB:', error);
    return null;
  }
}

// Add document to vector store
async function addVectorStoreDocument(doc) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    await database.collection('vectorStore').insertOne(doc);
    return doc.id;
  } catch (error) {
    console.error('Error adding document to vector store in MongoDB:', error);
    return null;
  }
}

// Remove documents by source
async function removeVectorStoreDocumentsBySource(source) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const result = await database.collection('vectorStore').deleteMany({
      'metadata.source': source
    });
    console.log(`✅ Removed ${result.deletedCount} documents from vector store (MongoDB)`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error removing documents from vector store in MongoDB:', error);
    return null;
  }
}

// Clear all vector store documents
async function clearVectorStore() {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const result = await database.collection('vectorStore').deleteMany({});
    console.log(`✅ Cleared ${result.deletedCount} documents from vector store (MongoDB)`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error clearing vector store in MongoDB:', error);
    return null;
  }
}

// Search vector store (load all and do similarity search in memory for now)
// Note: For large datasets, you'd want to use MongoDB's vector search features
async function searchVectorStore(queryEmbedding, topK = 5) {
  const database = await connectToDatabase();
  if (!database) return null;

  try {
    const documents = await database.collection('vectorStore').find({}).toArray();
    
    if (documents.length === 0) return [];
    
    // Calculate similarities
    const similarities = documents.map(doc => {
      const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
      return { ...doc, similarity };
    });
    
    // Sort by similarity and return top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topK);
  } catch (error) {
    console.error('Error searching vector store in MongoDB:', error);
    return null;
  }
}

// Helper function for cosine similarity
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

module.exports = {
  connectToDatabase,
  closeDatabase,
  // User operations
  getUsers,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  // Response operations
  getResponses,
  getResponseByUserId,
  getResponsesByUserId,
  saveResponse,
  updateResponse,
  deleteResponse,
  // Question operations
  getQuestions,
  saveQuestions,
  // Prompts operations
  getPrompts,
  savePrompts,
  // Post-college messages operations
  getPostCollegeMessages,
  savePostCollegeMessages,
  // Vector store operations
  getVectorStoreDocuments,
  addVectorStoreDocument,
  removeVectorStoreDocumentsBySource,
  clearVectorStore,
  searchVectorStore
};

