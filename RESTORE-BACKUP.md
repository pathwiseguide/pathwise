# How to Backup and Restore Your Data

## ⚠️ IMPORTANT: Data Persistence on Render

**On Render's free tier, your data is NOT automatically saved.** If you:
- Stop your service
- Restart your service
- Deploy new code
- Render restarts your service

**All user data will be LOST** unless you back it up first.

## Quick Backup (Before Taking Site Down)

1. **SSH into your Render service** (or use Render Shell):
   ```bash
   # In Render dashboard, go to your service → Shell
   ```

2. **Run the backup script**:
   ```bash
   node backup-data.js
   ```

3. **Download the backup folder** from your Render service

## Better Solution: Use a Database

For production, you should migrate to a database. Options:

### Option 1: MongoDB Atlas (Free Tier Available)
- Free 512MB database
- Persistent storage
- Easy to set up

### Option 2: Render PostgreSQL (Paid)
- Managed database
- Automatic backups
- $7/month

### Option 3: Supabase (Free Tier)
- Free PostgreSQL database
- 500MB storage
- Great for small apps

## Immediate Action Items

1. **Before taking site down**: Run backup script
2. **After bringing site back up**: Restore from backup if needed
3. **Long-term**: Migrate to a database for persistent storage

## Restoring from Backup

1. Copy backup files to your `data/` directory
2. Restart your service
3. Data will be restored

