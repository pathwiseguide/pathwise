#!/usr/bin/env node
/**
 * Add question 16 "Which application cycle are you in?" to the database.
 * Run from project root: node add-question-16.js
 * Requires MONGODB_URI in .env (or environment).
 */

require('dotenv').config();
const db = require('./db');

const QUESTION_16 = {
  id: '16',
  text: 'Which application cycle are you in?',
  type: 'radio',
  required: false,
  options: ['2026-2027', '2027-2028', '2028-2029', '2029-2030', '2030-2031', '2031-2032']
};

// Order including new question 16 (after high school details, before Academics)
const ORDERED_IDS = [
  '1', '2', '3', '1765772170950', '4', '1765772367077', '1765772344326', '1765772762906',
  '16',
  '1765772397699', '1765772638610', '1765772688681', '1765772450417', '1765772501152', '1765772542631', '1765772550210',
  '1765772412151', '1765772737014', '1765772440701', '1765772561776', '1765772590257', '1765772750883',
  '1765772211033', '1765772243220', '1765772607883',
  '1765772624492', '1765772701161'
];

async function main() {
  console.log('Connecting to MongoDB and fetching questions...');
  const questions = await db.getQuestions();
  if (!questions) {
    console.log('Could not connect to MongoDB or no questions. Exiting.');
    process.exit(1);
  }

  const byId = new Map();
  questions.forEach(q => {
    const id = q.id || q._id?.toString();
    if (id) byId.set(id, q);
  });

  // Add or update question 16 so type/options are always correct
  console.log('Updating question 16: "Which application cycle are you in?" (multiple choice)');
  byId.set('16', { ...QUESTION_16 });

  const reordered = [];
  const used = new Set();
  for (const id of ORDERED_IDS) {
    const q = byId.get(id);
    if (q) {
      reordered.push(q);
      used.add(q.id || q._id?.toString());
    }
  }
  for (const q of questions) {
    const id = q.id || q._id?.toString();
    if (id && !used.has(id)) {
      reordered.push(q);
      used.add(id);
    }
  }

  console.log(`Saving ${reordered.length} questions to MongoDB...`);
  const ok = await db.saveQuestions(reordered);
  if (ok) {
    console.log('Done. Question 16 is in place and questions are in order.');
  } else {
    console.error('Failed to save questions to MongoDB.');
    process.exit(1);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
