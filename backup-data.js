// Backup script to save data before taking site down
// Run this before stopping your Render service: node backup-data.js

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backups');

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

// Create timestamped backup folder
fs.mkdirSync(backupPath, { recursive: true });

// Files to backup
const filesToBackup = [
  'users.json',
  'responses.json',
  'questions.json',
  'counselor-prompts.json',
  'post-college-messages.json'
];

console.log('Starting backup...');

filesToBackup.forEach(file => {
  const sourcePath = path.join(DATA_DIR, file);
  const destPath = path.join(backupPath, file);
  
  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    console.log(`✓ Backed up ${file}`);
  } else {
    console.log(`⚠ ${file} not found, skipping`);
  }
});

console.log(`\nBackup complete! Files saved to: ${backupPath}`);
console.log(`\nTo restore, copy files from ${backupPath} back to ${DATA_DIR}`);

