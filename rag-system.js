// RAG (Retrieval-Augmented Generation) System for PDFs and Documents
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Persistent vector store with file-based storage
class VectorStore {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, 'data', 'vector-store.json');
    this.documents = []; // { id, text, embedding, metadata }
    this.embeddings = []; // For similarity search
    this.loadFromDisk();
  }

  // Load data from disk
  loadFromDisk() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.documents = data.documents || [];
        this.embeddings = data.embeddings || [];
        console.log(`Loaded ${this.documents.length} documents from persistent storage`);
      } else {
        console.log('No existing vector store found, starting fresh');
      }
    } catch (error) {
      console.error('Error loading vector store from disk:', error);
      this.documents = [];
      this.embeddings = [];
    }
  }

  // Save data to disk
  saveToDisk() {
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

  addDocument(text, embedding, metadata = {}) {
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
    this.documents.push(doc);
    this.embeddings.push(embedding);
    this.saveToDisk(); // Persist after each addition
    return id;
  }

  // Simple cosine similarity search
  search(queryEmbedding, topK = 5) {
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

  clear() {
    this.documents = [];
    this.embeddings = [];
    this.saveToDisk(); // Persist the clear operation
  }

  // Remove documents by source file
  removeBySource(source) {
    const initialLength = this.documents.length;
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
      this.saveToDisk();
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
      
      const docId = this.vectorStore.addDocument(chunk, embedding, {
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
    const results = this.vectorStore.search(queryEmbedding, topK);
    
    return results;
  }
}

// RAG Query Handler
class RAGQueryHandler {
  constructor(documentProcessor, openai) {
    this.documentProcessor = documentProcessor;
    this.openai = openai;
  }

  // Query with RAG - retrieves relevant docs and generates response
  async query(query, options = {}) {
    const {
      topK = 5,
      temperature = 0.7,
      maxTokens = 1000
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
      const response = await this.queryOpenAI(query, context, { temperature, maxTokens });

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
    const prompt = `You are a helpful assistant that answers questions based on the provided documents.

Documents:
${context}

Question: ${query}

Answer the question based on the documents above. If the answer is not in the documents, say so. Cite which document(s) you used when possible.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that answers questions based on provided documents.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    return completion.choices[0].message.content;
  }
}

module.exports = {
  VectorStore,
  DocumentProcessor,
  RAGQueryHandler
};

