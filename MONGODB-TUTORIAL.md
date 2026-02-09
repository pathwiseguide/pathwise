# MongoDB Tutorial for Pathwise

## Part 1: Setting Up MongoDB Atlas (Free Database)

### Step 1: Create MongoDB Atlas Account

1. **Go to MongoDB Atlas**: https://www.mongodb.com/cloud/atlas/register
2. **Click "Try Free"** or "Sign Up"
3. **Fill in your details**:
   - Email
   - Password
   - Company (optional - can put "Personal" or "Pathwise")
4. **Click "Get started free"**

### Step 2: Create a Free Cluster

1. **Choose "Build a Database"**
2. **Select "Free" (M0) tier** - This is the free option
3. **Choose a Cloud Provider**:
   - AWS (recommended)
   - Google Cloud
   - Azure
4. **Select a Region**:
   - Choose the region closest to you (or where Render is hosted)
   - For US: `N. Virginia (us-east-1)` or `Oregon (us-west-2)`
5. **Cluster Name**: Leave as "Cluster0" or name it "pathwise-cluster"
6. **Click "Create Cluster"**
   - ⏱️ This takes 3-5 minutes

### Step 3: Create Database User

1. **You'll see a security popup** - Click "Create Database User"
2. **Authentication Method**: "Password"
3. **Username**: `pathwise-admin` (or any username you want)
4. **Password**: 
   - Click "Autogenerate Secure Password" (SAVE THIS!)
   - Or create your own strong password
   - ⚠️ **SAVE THIS PASSWORD** - You'll need it!
5. **Database User Privileges**: "Read and write to any database"
6. **Click "Create Database User"**

### Step 4: Whitelist IP Addresses (Allow Connections)

1. **In the security popup**, click "Add My Current IP Address"
2. **Also click "Allow Access from Anywhere"** (0.0.0.0/0)
   - This allows Render to connect
   - ⚠️ For production, you can restrict this later
3. **Click "Finish and Close"**

### Step 5: Get Your Connection String

1. **Click "Connect"** button on your cluster
2. **Choose "Connect your application"**
3. **Driver**: "Node.js"
4. **Version**: "5.5 or later" (or latest)
5. **Copy the connection string**
   - It looks like: `mongodb+srv://pathwise-admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. **Replace `<password>` with your actual password**
   - Example: `mongodb+srv://pathwise-admin:MySecurePass123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
7. **Add database name**: Change `?retryWrites` to `/pathwise?retryWrites`
   - Final: `mongodb+srv://pathwise-admin:MySecurePass123@cluster0.xxxxx.mongodb.net/pathwise?retryWrites=true&w=majority`

### Step 6: Save Your Connection String

**This is your MongoDB connection string!** Save it somewhere safe.

You'll add this to Render as an environment variable: `MONGODB_URI`

---

## Part 2: Understanding MongoDB Basics

### What is MongoDB?

- **NoSQL Database**: Stores data as documents (like JSON objects)
- **Collections**: Like tables in SQL (e.g., "users", "responses")
- **Documents**: Like rows in SQL (e.g., one user = one document)

### MongoDB vs JSON Files

**Before (JSON Files):**
```javascript
// Read all users
const users = readJSONFile('users.json'); // Array of users
users.push(newUser);
writeJSONFile('users.json', users); // Save all users
```

**After (MongoDB):**
```javascript
// Insert one user
await db.collection('users').insertOne(newUser);

// Find all users
const users = await db.collection('users').find({}).toArray();

// Find one user
const user = await db.collection('users').findOne({ username: 'john' });
```

### Key MongoDB Operations

1. **Insert**: Add new document
   ```javascript
   await collection.insertOne({ name: 'John', age: 30 });
   ```

2. **Find**: Get documents
   ```javascript
   await collection.find({ name: 'John' }).toArray();
   ```

3. **Update**: Modify document
   ```javascript
   await collection.updateOne(
     { name: 'John' },
     { $set: { age: 31 } }
   );
   ```

4. **Delete**: Remove document
   ```javascript
   await collection.deleteOne({ name: 'John' });
   ```

---

## Part 3: Installing MongoDB in Your Project

### Step 1: Install MongoDB Driver

```bash
npm install mongodb
```

### Step 2: Create MongoDB Connection File

I'll create this for you - it handles connecting to MongoDB.

---

## Part 4: Migrating Your Code

I'll help you migrate:
- ✅ User registration/login
- ✅ Saving responses
- ✅ Loading questions
- ✅ All other data operations

---

## Next Steps

1. **Complete Part 1** (Set up MongoDB Atlas)
2. **Get your connection string**
3. **Tell me when you're done**
4. **I'll help you install and migrate your code!**

---

## Common Questions

**Q: Is MongoDB free?**
A: Yes! The M0 (free) tier gives you 512MB storage, which is plenty for starting out.

**Q: What happens when I exceed 512MB?**
A: MongoDB will notify you. You can upgrade to a paid plan ($9/month for 2GB) or optimize your data.

**Q: Is my data safe?**
A: Yes! MongoDB Atlas has automatic backups, encryption, and 99.95% uptime SLA.

**Q: Can I use it locally too?**
A: Yes! You can install MongoDB locally for development, but Atlas is easier for production.

