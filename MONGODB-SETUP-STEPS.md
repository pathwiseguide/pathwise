# MongoDB Setup Steps - Quick Guide

## ✅ Step 1: Install MongoDB (DONE!)
I've already installed the MongoDB package for you.

## 📝 Step 2: Set Up MongoDB Atlas

Follow the tutorial in `MONGODB-TUTORIAL.md` to:
1. Create MongoDB Atlas account
2. Create a free cluster
3. Create database user
4. Get your connection string

## 🔑 Step 3: Get Your Connection String

Your connection string will look like:
```
mongodb+srv://pathwise-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/pathwise?retryWrites=true&w=majority
```

**Important:** Replace:
- `YOUR_PASSWORD` with your actual database user password
- Make sure `/pathwise` is in the path (database name)

## 🌐 Step 4: Add to Render Environment Variables

1. Go to Render dashboard → Your service
2. Click "Environment" tab
3. Click "Add Environment Variable"
4. Add:
   - **Key:** `MONGODB_URI`
   - **Value:** Your full connection string
5. Click "Save Changes"
6. Render will automatically redeploy

## ✅ Step 5: Test It!

Once deployed:
1. Try registering a new user
2. Check Render logs - you should see: `✅ Connected to MongoDB Atlas`
3. Your users will now be saved permanently!

## 🔄 How It Works

The code I've updated:
- **Tries MongoDB first** - If `MONGODB_URI` is set, uses MongoDB
- **Falls back to JSON files** - If MongoDB isn't configured, uses JSON files (old way)
- **Seamless migration** - Works with or without MongoDB

## 📊 What's Migrated So Far

✅ **User Registration** - Now uses MongoDB
✅ **User Login** - Now uses MongoDB

## 🚀 Next Steps (I'll help you with these)

- Migrate responses saving
- Migrate questions loading
- Migrate prompts
- Migrate post-college messages

## ❓ Troubleshooting

**"MONGODB_URI not set" message:**
- This is normal if you haven't set it up yet
- The app will use JSON files as fallback
- Once you add `MONGODB_URI` to Render, it will use MongoDB

**Connection errors:**
- Check your connection string is correct
- Make sure you whitelisted IP addresses (0.0.0.0/0 for Render)
- Check your password is correct in the connection string

**Users not saving:**
- Check Render logs for errors
- Verify `MONGODB_URI` environment variable is set
- Make sure connection string includes `/pathwise` database name

