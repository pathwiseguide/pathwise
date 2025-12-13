# How to Access Response Data (Admin Only - Password Protected)

The "Export Data" button has been removed from the public website. Only you (the admin) can access the data through the backend API using a password.

## 🔐 Setting Up Your Password

### Step 1: Set Password in Render

1. Go to your Render dashboard
2. Click on your web service
3. Go to "Environment" tab
4. Click "Add Environment Variable"
5. Add:
   - **Key**: `ADMIN_PASSWORD`
   - **Value**: Your chosen password (e.g., `MySecurePassword123!`)
6. Click "Save Changes"
7. Render will automatically redeploy with the new password

### Step 2: Default Password (For Testing)

If you haven't set `ADMIN_PASSWORD` yet, the default password is: `admin123`

⚠️ **Important:** Change this immediately by setting the `ADMIN_PASSWORD` environment variable in Render!

## API Endpoints (Password Protected)

Your app is deployed at: `https://your-app.onrender.com` (replace with your actual URL)

### 1. View All Responses
**GET** `https://your-app.onrender.com/api/responses?password=YOUR_PASSWORD`

Returns all submitted responses in JSON format.

**Example:**
```bash
# Using curl (command line)
curl "https://your-app.onrender.com/api/responses?password=YOUR_PASSWORD"

# Or open in browser:
https://your-app.onrender.com/api/responses?password=YOUR_PASSWORD
```

**Response format:**
```json
[
  {
    "id": "1234567890",
    "timestamp": "2025-01-13T10:30:00.000Z",
    "questions": [...],
    "answers": {
      "1": "John Doe",
      "2": "john@example.com",
      "3": "Excellent"
    },
    "submittedAt": "2025-01-13T10:30:00.000Z"
  }
]
```

### 2. View All Questions
**GET** `https://your-app.onrender.com/api/questions`

Returns the current questions configuration.
*(This endpoint is public - no password required)*

### 3. Export All Data (Questions + Responses)
**GET** `https://your-app.onrender.com/api/export?password=YOUR_PASSWORD`

Returns a downloadable JSON file with:
- All questions
- All responses
- Export metadata

**To download:**
- Open the URL in your browser with your password
- The file will download automatically as `questionnaire-export.json`

## Easy Ways to Access Data

### Option 1: Browser (Easiest)
1. Go to: `https://your-app.onrender.com/api/responses?password=YOUR_PASSWORD`
   (Replace `YOUR_PASSWORD` with your actual password)
2. You'll see all responses in JSON format
3. Copy the JSON and paste into a JSON viewer/formatter online

### Option 2: Browser Extension
Install a JSON viewer extension (like "JSON Viewer" for Chrome) to format the JSON nicely in your browser.

### Option 3: Command Line (curl)
```bash
curl "https://your-app.onrender.com/api/responses?password=YOUR_PASSWORD" > responses.json
```

### Option 4: Python Script
```python
import requests
import json

url = "https://your-app.onrender.com/api/responses"
password = "YOUR_PASSWORD"  # Replace with your actual password

response = requests.get(url, params={"password": password})
data = response.json()

# Save to file
with open('responses.json', 'w') as f:
    json.dump(data, f, indent=2)

print(f"Saved {len(data)} responses to responses.json")
```

## 🔒 Security

✅ **Password Protection Enabled!**

- `/api/responses` - **Protected** (requires password)
- `/api/export` - **Protected** (requires password)
- `/api/questions` - **Public** (no password needed - this is safe)

The password is stored securely in Render's environment variables and never appears in your code.

## Alternative: Using Headers (More Secure)

Instead of putting the password in the URL, you can use a header:

```bash
# Using curl with header
curl -H "X-Admin-Password: YOUR_PASSWORD" https://your-app.onrender.com/api/responses
```

This is more secure because the password won't appear in browser history or server logs.

