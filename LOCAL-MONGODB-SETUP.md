# Setting Up MongoDB Locally - Step by Step

## ✅ You've Created Your Account - What's Next?

### Step 1: Create Your Free Cluster

1. **After logging in**, you'll see the MongoDB Atlas dashboard
2. **Click "Build a Database"** (or "Create" → "Database")
3. **Choose "Free" (M0) tier** - This is the free option (512MB storage)
4. **Select Cloud Provider:**
   - Choose **AWS** (recommended)
   - Or Google Cloud / Azure (both work fine)
5. **Select Region:**
   - For US: Choose `N. Virginia (us-east-1)` or `Oregon (us-west-2)`
   - For Europe: Choose closest to you
   - For Asia: Choose closest to you
6. **Cluster Name:** Leave as "Cluster0" or name it "pathwise-cluster"
7. **Click "Create Cluster"** 
   - ⏱️ **This takes 3-5 minutes** - Wait for it to finish

### Step 2: Create Database User (While Cluster is Creating)

1. **You'll see a security popup** - Click "Create Database User"
2. **Authentication Method:** "Password"
3. **Username:** `pathwise-admin` (or any username you want)
4. **Password:** 
   - **Option A:** Click "Autogenerate Secure Password" 
     - ⚠️ **COPY THIS PASSWORD NOW!** You won't see it again!
     - Save it in a text file temporarily
   - **Option B:** Create your own strong password
     - Make it at least 12 characters
     - Mix of letters, numbers, symbols
5. **Database User Privileges:** "Read and write to any database"
6. **Click "Create Database User"**

### Step 3: Whitelist IP Addresses (Allow Connections)

1. **In the same security popup**, look for "Network Access"
2. **Click "Add My Current IP Address"** - This adds your computer's IP
3. **Also click "Allow Access from Anywhere"** (0.0.0.0/0)
   - This allows:
     - Your local computer
     - Render (when you deploy)
     - Any other location
   - ⚠️ For production, you can restrict this later
4. **Click "Finish and Close"**

### Step 4: Wait for Cluster to Finish Creating

- Look at the top of the page
- You'll see "Creating Cluster..." with a progress bar
- Wait until it says "Cluster is ready" (green checkmark)
- This usually takes 3-5 minutes

### Step 5: Get Your Connection String

1. **Click "Connect"** button (on your cluster card)
2. **Choose "Connect your application"**
3. **Driver:** Select "Node.js"
4. **Version:** "5.5 or later" (or latest shown)
5. **You'll see a connection string** like:
   ```
   mongodb+srv://pathwise-admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. **Click the copy button** to copy it

### Step 6: Customize Your Connection String

**Important:** You need to modify the connection string:

1. **Replace `<password>`** with your actual database user password
   - Example: If password is `MyPass123!`, replace `<password>` with `MyPass123!`
   - **Note:** If your password has special characters, you may need to URL-encode them:
     - `@` becomes `%40`
     - `#` becomes `%23`
     - `$` becomes `%24`
     - `%` becomes `%25`
     - `&` becomes `%26`
     - `+` becomes `%2B`
     - `=` becomes `%3D`

2. **Add database name** - Change `?retryWrites` to `/pathwise?retryWrites`
   - Final example:
   ```
   mongodb+srv://pathwise-admin:MyPass123!@cluster0.xxxxx.mongodb.net/pathwise?retryWrites=true&w=majority
   ```

### Step 7: Add to Your Local .env File

1. **Open your `.env` file** in the project root
2. **Add this line:**
   ```
   MONGODB_URI=mongodb+srv://pathwise-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/pathwise?retryWrites=true&w=majority
   ```
3. **Replace `YOUR_PASSWORD`** with your actual password
4. **Replace the cluster URL** with your actual cluster URL
5. **Save the file**

### Step 8: Test Locally!

1. **Start your server:**
   ```bash
   npm start
   ```

2. **Look for this message:**
   ```
   ✅ Connected to MongoDB Atlas
   ✅ Database indexes created
   ```

3. **If you see errors:**
   - Check your connection string is correct
   - Make sure password is correct
   - Make sure you whitelisted your IP address
   - Check the error message for clues

4. **Test registration:**
   - Go to your local site (http://localhost:3001)
   - Try registering a new user
   - Check the console - should say: `✅ New user registered in MongoDB`

## 🎉 Success!

If you see "✅ Connected to MongoDB Atlas" in your console, you're all set!

## Next: Deploy to Render

Once it works locally:
1. Add `MONGODB_URI` to Render environment variables
2. Deploy
3. Your users will be saved permanently!

## ❓ Troubleshooting

**"MONGODB_URI not set"**
- Make sure you added it to `.env` file
- Restart your server after adding it

**Connection timeout**
- Make sure you whitelisted your IP (0.0.0.0/0)
- Wait a few minutes after whitelisting

**Authentication failed**
- Check your password is correct
- URL-encode special characters in password
- Make sure username is correct

**"MongoServerError: bad auth"**
- Password is wrong or needs URL encoding
- Username is wrong

