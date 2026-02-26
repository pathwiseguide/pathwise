#!/usr/bin/env node
/**
 * Reorder questions in MongoDB to a logical flow for college counseling.
 * Run from project root with: node reorder-questions-mongodb.js
 * Requires MONGODB_URI in .env (or environment).
 */

require('dotenv').config();
const db = require('./db');

// Desired order: question ids in the order we want (1 = first, etc.)
const ORDERED_IDS = [
  '1',                    // What is your name?
  '2',                    // What is your grade?
  '3',                    // How old are you?
  '1765772170950',        // What gender do you identify with?
  '4',                    // What race do you identify with?
  '1765772367077',        // What city and state do you currently reside in?
  '1765772344326',        // What school do you currently attend?
  '1765772762906',        // Give any details about your high school.
  '16',                   // Which application cycle are you in?
  '1765772397699',        // What's your current GPA?
  '1765772638610',        // What courses do you currently take?
  '1765772688681',        // What courses have you taken in the past?
  '1765772450417',        // Have you taken the SAT or ACT?
  '1765772501152',        // SAT Math score
  '1765772542631',        // SAT English score
  '1765772550210',        // ACT score
  '1765772412151',        // What are your top activities?
  '1765772737014',        // Why did you choose your top activities?
  '1765772440701',        // What are you current interests?
  '1765772561776',        // What are your top awards or achievements?
  '1765772590257',        // What work or research do you have?
  '1765772750883',        // Why did you choose your research?
  '1765772211033',        // What is your family income?
  '1765772243220',        // How many people are in your household?
  '1765772607883',        // Do you have any extenuating circumstances?
  '1765772624492',        // What majors are you thinking about?
  '1765772701161',       // If you have chosen a major, why?
];

async function main() {
  console.log('Connecting to MongoDB and fetching questions...');
  const questions = await db.getQuestions();
  if (!questions || questions.length === 0) {
    console.log('No questions found in MongoDB. Exiting.');
    process.exit(1);
  }

  const byId = new Map();
  questions.forEach(q => {
    const id = q.id || q._id?.toString();
    if (id) byId.set(id, q);
  });

  const reordered = [];
  const used = new Set();

  for (const id of ORDERED_IDS) {
    const q = byId.get(id);
    if (q) {
      reordered.push(q);
      used.add(q.id || q._id?.toString());
    }
  }

  // Append any questions in MongoDB that weren't in our order list
  for (const q of questions) {
    const id = q.id || q._id?.toString();
    if (id && !used.has(id)) {
      reordered.push(q);
      console.log('  (appended question not in order list:', (q.text || '').substring(0, 50) + '...)');
    }
  }

  console.log(`Reordered ${reordered.length} questions. Saving to MongoDB...`);
  const ok = await db.saveQuestions(reordered);
  if (ok) {
    console.log('Done. Questions in MongoDB are now in the new order.');
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
