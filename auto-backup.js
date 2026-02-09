// Automated backup system - saves data to GitHub or cloud storage
// This runs periodically to backup user data

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_INTERVAL = 1000 * 60 * 60; // Backup every hour (adjust as needed)

// Backup to GitHub Gist (free, private storage)
async function backupToGist() {
  const GIST_ID = process.env.GIST_ID; // Create a private Gist and get its ID
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Personal access token
  
  if (!GIST_ID || !GITHUB_TOKEN) {
    console.log('Gist backup not configured. Set GIST_ID and GITHUB_TOKEN environment variables.');
    return;
  }

  const filesToBackup = {
    'users.json': fs.readFileSync(path.join(DATA_DIR, 'users.json'), 'utf8'),
    'responses.json': fs.readFileSync(path.join(DATA_DIR, 'responses.json'), 'utf8'),
    'questions.json': fs.readFileSync(path.join(DATA_DIR, 'questions.json'), 'utf8'),
    'counselor-prompts.json': fs.readFileSync(path.join(DATA_DIR, 'counselor-prompts.json'), 'utf8'),
    'post-college-messages.json': fs.readFileSync(path.join(DATA_DIR, 'post-college-messages.json'), 'utf8')
  };

  const data = JSON.stringify({
    files: Object.keys(filesToBackup).reduce((acc, filename) => {
      acc[filename] = { content: filesToBackup[filename] };
      return acc;
    }, {})
  });

  const options = {
    hostname: 'api.github.com',
    path: `/gists/${GIST_ID}`,
    method: 'PATCH',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Pathwise-Backup',
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✓ Backup to Gist successful');
          resolve();
        } else {
          console.error('✗ Backup failed:', res.statusCode, responseData);
          reject(new Error(`Backup failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('✗ Backup error:', error);
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Simple file-based backup (saves to backups folder)
function backupToFile() {
  const BACKUP_DIR = path.join(__dirname, 'backups');
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);
  fs.mkdirSync(backupPath, { recursive: true });

  const filesToBackup = [
    'users.json',
    'responses.json',
    'questions.json',
    'counselor-prompts.json',
    'post-college-messages.json'
  ];

  filesToBackup.forEach(file => {
    const sourcePath = path.join(DATA_DIR, file);
    const destPath = path.join(backupPath, file);
    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
    }
  });

  console.log(`✓ File backup created: ${backupPath}`);
  
  // Keep only last 24 backups (delete older ones)
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup-'))
    .sort()
    .reverse();
  
  if (backups.length > 24) {
    backups.slice(24).forEach(oldBackup => {
      const oldPath = path.join(BACKUP_DIR, oldBackup);
      fs.rmSync(oldPath, { recursive: true, force: true });
      console.log(`  Deleted old backup: ${oldBackup}`);
    });
  }
}

// Run backup
async function runBackup() {
  console.log(`[${new Date().toISOString()}] Starting backup...`);
  
  try {
    // Try Gist backup first (if configured)
    if (process.env.GIST_ID && process.env.GITHUB_TOKEN) {
      await backupToGist();
    } else {
      // Fallback to file backup
      backupToFile();
    }
  } catch (error) {
    console.error('Backup error:', error);
    // Fallback to file backup if Gist fails
    backupToFile();
  }
}

// Run immediately, then on interval
runBackup();
setInterval(runBackup, BACKUP_INTERVAL);

console.log('Auto-backup system started. Backups will run every hour.');

