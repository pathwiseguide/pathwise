// RAG (Retrieval-Augmented Generation) System for PDFs and Documents
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Persistent vector store with MongoDB support and file-based fallback
class VectorStore {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, 'data', 'vector-store.json');
    this.documents = []; // { id, text, embedding, metadata }
    this.embeddings = []; // For similarity search
    this.useMongoDB = false; // Will be set after checking MongoDB connection
    this.loadingPromise = null; // Track async loading
    // Load synchronously from JSON first, then check MongoDB
    this.loadFromDisk();
    // Start async MongoDB check in background
    this.initializeMongoDB();
  }
  
  async initializeMongoDB() {
    try {
      const mongoDocs = await db.getVectorStoreDocuments();
      if (mongoDocs !== null && mongoDocs.length > 0) {
        this.useMongoDB = true;
        this.documents = mongoDocs;
        this.embeddings = mongoDocs.map(doc => doc.embedding);
        console.log(`✅ Vector store using MongoDB (${this.documents.length} documents)`);
      } else if (mongoDocs !== null) {
        // MongoDB available but empty - use it for new documents
        this.useMongoDB = true;
        console.log('✅ Vector store using MongoDB (empty, will save new documents there)');
      }
    } catch (error) {
      console.log('⚠️  MongoDB not available for vector store, using JSON files');
      this.useMongoDB = false;
    }
  }
  
  // Load data from disk (synchronous, for initial load)
  loadFromDisk() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.documents = data.documents || [];
        this.embeddings = data.embeddings || [];
        console.log(`Loaded ${this.documents.length} documents from JSON file`);
      } else {
        console.log('No existing vector store found, starting fresh');
      }
    } catch (error) {
      console.error('Error loading vector store from disk:', error);
      this.documents = [];
      this.embeddings = [];
    }
  }

  // Save data to storage (MongoDB or disk)
  async saveToStorage() {
    if (this.useMongoDB) {
      // Note: We don't need to save all at once since addDocument saves individually
      // This is mainly for compatibility
      return;
    }
    
    // Fallback to JSON file
    try {
      // Ensure directory exists
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const data = {
        documents: this.documents,
        embeddings: this.embeddings,
        lastUpdated: new Date().toISOString()
      };

      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error saving vector store to disk:', error);
    }
  }

  async addDocument(text, embedding, metadata = {}) {
    const id = crypto.randomUUID();
    const doc = {
      id,
      text,
      embedding,
      metadata: {
        ...metadata,
        addedAt: new Date().toISOString()
      }
    };
    
    // Add to in-memory arrays
    this.documents.push(doc);
    this.embeddings.push(embedding);
    
    // Save to MongoDB if available
    if (this.useMongoDB) {
      try {
        const result = await db.addVectorStoreDocument(doc);
        if (result !== null) {
          return id;
        } else {
          // MongoDB failed, fall back to JSON
          this.useMongoDB = false;
          await this.saveToStorage();
        }
      } catch (error) {
        console.error('Error saving to MongoDB, falling back to JSON:', error);
        this.useMongoDB = false;
        await this.saveToStorage();
      }
    } else {
      // Save to JSON file
      await this.saveToStorage();
    }
    
    return id;
  }

  // Simple cosine similarity search
  async search(queryEmbedding, topK = 5) {
    // If using MongoDB, try MongoDB search first
    if (this.useMongoDB) {
      try {
        const results = await db.searchVectorStore(queryEmbedding, topK);
        if (results !== null) {
          return results;
        }
      } catch (error) {
        console.error('Error searching MongoDB, falling back to in-memory:', error);
      }
    }
    
    // Fallback to in-memory search
    if (this.embeddings.length === 0) return [];

    const similarities = this.embeddings.map((emb, idx) => {
      const similarity = this.cosineSimilarity(queryEmbedding, emb);
      return { index: idx, similarity };
    });

    // Sort by similarity and get top K
    similarities.sort((a, b) => b.similarity - a.similarity);
    
    return similarities.slice(0, topK).map(item => ({
      ...this.documents[item.index],
      similarity: item.similarity
    }));
  }

  cosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  getAllDocuments() {
    return this.documents;
  }

  async clear() {
    if (this.useMongoDB) {
      try {
        await db.clearVectorStore();
      } catch (error) {
        console.error('Error clearing MongoDB vector store:', error);
      }
    }
    
    this.documents = [];
    this.embeddings = [];
    await this.saveToStorage(); // Persist the clear operation
  }

  // Remove documents by source file
  async removeBySource(source) {
    const initialLength = this.documents.length;
    
    if (this.useMongoDB) {
      try {
        const removed = await db.removeVectorStoreDocumentsBySource(source);
        if (removed !== null) {
          // Reload from MongoDB to sync in-memory arrays
          await this.loadFromStorage();
          return removed;
        }
      } catch (error) {
        console.error('Error removing from MongoDB, falling back to in-memory:', error);
      }
    }
    
    // Fallback to in-memory removal
    const indicesToRemove = [];
    
    this.documents.forEach((doc, index) => {
      if (doc.metadata.source === source) {
        indicesToRemove.push(index);
      }
    });

    // Remove in reverse order to maintain indices
    indicesToRemove.reverse().forEach(index => {
      this.documents.splice(index, 1);
      this.embeddings.splice(index, 1);
    });

    if (indicesToRemove.length > 0) {
      await this.saveToStorage();
      console.log(`Removed ${indicesToRemove.length} chunks from source: ${source}`);
    }

    return indicesToRemove.length;
  }
}

// Document Processor
class DocumentProcessor {
  constructor(openai, vectorStore) {
    this.openai = openai;
    this.vectorStore = vectorStore;
  }

  // Parse PDF file
  async parsePDF(filePath) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return {
        text: data.text,
        numPages: data.numpages,
        info: data.info
      };
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to parse PDF: ' + error.message);
    }
  }

  // Split text into chunks
  chunkText(text, chunkSize = 1000, overlap = 200) {
    const chunks = [];
    let start = 0;
    
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();
      
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      
      start = end - overlap;
      if (start >= text.length) break;
    }
    
    return chunks;
  }

  // Generate embeddings using OpenAI
  async generateEmbedding(text) {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small', // or 'text-embedding-ada-002'
        input: text
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding: ' + error.message);
    }
  }

  // Process and store PDF
  async processPDF(filePath, metadata = {}) {
    console.log('Processing PDF:', filePath);
    
    // Parse PDF
    const pdfData = await this.parsePDF(filePath);
    
    // Split into chunks
    const chunks = this.chunkText(pdfData.text);
    console.log(`Split PDF into ${chunks.length} chunks`);
    
    // Generate embeddings and store
    const documentIds = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await this.generateEmbedding(chunk);
      
      const docId = await this.vectorStore.addDocument(chunk, embedding, {
        ...metadata,
        chunkIndex: i,
        totalChunks: chunks.length,
        source: path.basename(filePath)
      });
      
      documentIds.push(docId);
      
      // Small delay to avoid rate limits
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return {
      documentIds,
      numChunks: chunks.length,
      numPages: pdfData.numPages
    };
  }

  // Search for relevant documents
  async searchDocuments(query, topK = 5) {
    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);
    
    // Search vector store
    const results = await this.vectorStore.search(queryEmbedding, topK);
    
    return results;
  }
}

// RAG Query Handler
class RAGQueryHandler {
  constructor(documentProcessor, openai, chatCompleteFn = null) {
    this.documentProcessor = documentProcessor;
    this.openai = openai;
    this.chatComplete = chatCompleteFn;
  }

  // Query with RAG - retrieves relevant docs and generates response.
  // options.moduleText: optional questionnaire/module context included in the prompt.
  async query(query, options = {}) {
    const {
      topK = 5,
      temperature = 0.7,
      maxTokens = 2048,
      moduleText = ''
    } = options;

    // Search for relevant documents
    console.log('Searching documents for query:', query);
    const relevantDocs = await this.documentProcessor.searchDocuments(query, topK);
    
    if (relevantDocs.length === 0) {
      return {
        success: false,
        message: 'No relevant documents found in the knowledge base.',
        sources: []
      };
    }

    // Build context from relevant documents
    const context = relevantDocs
      .map((doc, idx) => `[Document ${idx + 1} - ${doc.metadata.source || 'Unknown'}]\n${doc.text}`)
      .join('\n\n---\n\n');

    const sources = relevantDocs.map(doc => ({
      text: doc.text.substring(0, 200) + '...',
      similarity: doc.similarity,
      metadata: doc.metadata
    }));

    // Generate response using GPT-3.5-turbo
    try {
      const response = await this.queryOpenAI(query, context, { temperature, maxTokens, moduleText });

      return {
        success: true,
        message: response,
        sources
      };
    } catch (error) {
      console.error('Error generating RAG response:', error);
      return {
        success: false,
        message: 'Failed to generate response: ' + error.message,
        sources: []
      };
    }
  }

  async queryOpenAI(query, context, options) {
    const system = 'You are a helpful assistant that answers questions based on provided documents.';
    const moduleText = (options.moduleText || '').trim();
    const moduleSection = moduleText
      ? `Module/questionnaire context (use this to frame your answer):\n${moduleText}\n\n`
      : '';
    const userContent = `${moduleSection}Documents:
${context}

Question: ${query}

Answer the question based on the documents above${moduleSection ? ' and the module context' : ''}. If the answer is not in the documents, say so. Cite which document(s) you used when possible.`;

    if (!this.chatComplete) {
      throw new Error('Claude is required for RAG chat. Set ANTHROPIC_API_KEY in .env');
    }
    return await this.chatComplete(system, userContent, {
      temperature: options.temperature,
      maxTokens: options.maxTokens
    });
  }
}

module.exports = {
  VectorStore,
  DocumentProcessor,
  RAGQueryHandler
};

