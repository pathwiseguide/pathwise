# How to Save Users Permanently - Database Setup Guide

## Current Problem
Your users are stored in JSON files that get deleted when Render restarts (free tier).

## Solution Options (Ranked by Ease)

### ✅ Option 1: MongoDB Atlas (Recommended - FREE)
**Best for:** Easy setup, free tier, no credit card needed

#### Setup Steps:

1. **Create MongoDB Atlas Account**
   - Go to https://www.mongodb.com/cloud/atlas/register
   - Sign up (free)

2. **Create a Free Cluster**
   - Choose "Free" tier (M0)
   - Select a region close to you
   - Click "Create Cluster" (takes 3-5 minutes)

3. **Create Database User**
   - Go to "Database Access" → "Add New Database User"
   - Username: `pathwise-admin`
   - Password: Generate a secure password (save it!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

4. **Whitelist Your IP**
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (for Render)
   - Or add Render's IP ranges

5. **Get Connection String**
   - Go to "Clusters" → Click "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your database user password
   - Example: `mongodb+srv://pathwise-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/pathwise?retryWrites=true&w=majority`

6. **Add to Render Environment Variables**
   - In Render dashboard → Your service → Environment
   - Add: `MONGODB_URI` = (your connection string)

7. **Install MongoDB Package**
   ```bash
   npm install mongodb
   ```

8. **I can help you migrate your code** to use MongoDB instead of JSON files

---

### ✅ Option 2: Supabase (PostgreSQL - FREE)
**Best for:** SQL database, 500MB free storage

#### Setup Steps:

1. **Create Supabase Account**
   - Go to https://supabase.com
   - Sign up (free)

2. **Create New Project**
   - Click "New Project"
   - Name: `pathwise`
   - Database Password: (save it!)
   - Region: Choose closest
   - Click "Create new project"

3. **Get Connection String**
   - Go to "Settings" → "Database"
   - Copy "Connection string" (URI format)
   - Example: `postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres`

4. **Add to Render Environment Variables**
   - Add: `DATABASE_URL` = (your connection string)

5. **Install PostgreSQL Package**
   ```bash
   npm install pg
   ```

---

### ✅ Option 3: Automated GitHub Backups (Quick Fix)
**Best for:** Temporary solution, keeps data safe but requires manual restore

#### Setup Steps:

1. **Create a Private GitHub Gist**
   - Go to https://gist.github.com
   - Create a new private gist (any name)
   - Copy the Gist ID from the URL

2. **Create GitHub Personal Access Token**
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token
   - Check "gist" scope
   - Copy the token

3. **Add to Render Environment Variables**
   - `GIST_ID` = (your Gist ID)
   - `GITHUB_TOKEN` = (your personal access token)

4. **Run Auto-Backup**
   - I've created `auto-backup.js` that backs up every hour
   - Add to your server startup or run as a cron job

---

## Which Should You Choose?

### For Quick Fix (Today):
→ **Option 3: GitHub Backups** - Takes 5 minutes, keeps data safe

### For Long-Term (This Week):
→ **Option 1: MongoDB Atlas** - Free, reliable, scales well

### For SQL Lovers:
→ **Option 2: Supabase** - Free PostgreSQL, great for complex queries

---

## Next Steps

Tell me which option you want, and I'll:
1. Help you set it up
2. Migrate your code to use the database
3. Test it works
4. Deploy it

**Recommendation:** Start with MongoDB Atlas - it's free, easy, and I can migrate your code quickly.

