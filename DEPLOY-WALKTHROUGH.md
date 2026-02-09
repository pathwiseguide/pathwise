# Deploy Pathwise Online – Step-by-Step

## Before You Start

1. **Code on GitHub** – Your app must be in a GitHub repo. If it isn’t yet:
   ```bash
   git init
   git add .
   git commit -m "Prepare for deployment"
   git branch -M main
   # Create a new repo at github.com, then:
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Environment variables** – You’ll need these (see “Set environment variables” below).

---

## Option A: Render (simplest)

### 1. Push your code

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Create a Render account

- Go to **https://render.com** and sign up (use “Sign up with GitHub” so Render can see your repo).

### 3. Create a Web Service

- Dashboard → **New +** → **Web Service**.
- Connect your GitHub account if asked, then select the repo that contains Pathwise (e.g. `questionnaire-app` or `pathwise`).
- Click **Connect**.

### 4. Configure the service

- **Name**: e.g. `pathwise` or `questionnaire-app`.
- **Environment**: **Node**.
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Free (or paid if you prefer).

### 5. Set environment variables

In the same screen, open **Advanced** → **Add Environment Variable**. Add:

| Name            | Value                    | Required |
|-----------------|--------------------------|----------|
| `NODE_ENV`      | `production`             | Yes      |
| `SESSION_SECRET`| Random string (see below)| Yes      |
| `MONGODB_URI`   | Your Atlas connection string | If you use MongoDB |
| `OPENAI_API_KEY`| Your OpenAI key          | If you use RAG/chat |
| `ANTHROPIC_API_KEY` | Your Anthropic key   | If you use Claude |

**Generate SESSION_SECRET** (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

Or use any long random string (e.g. 32+ characters).

### 6. Deploy

- Click **Create Web Service**.
- Render will build and deploy. When it’s done, your site will be at:
  **`https://YOUR-SERVICE-NAME.onrender.com`**

### 7. (Optional) MongoDB Atlas for persistent data

If you want users and data to persist (recommended):

1. Go to **https://www.mongodb.com/cloud/atlas** and sign up.
2. Create a **free M0 cluster** and a database user (username + password).
3. **Network Access** → **Add IP Address** → **Allow Access from Anywhere**.
4. **Clusters** → **Connect** → **Connect your application** → copy the connection string.
5. Replace `<password>` in the string with your database user password.
6. In Render: **Environment** → add **MONGODB_URI** = that connection string.
7. Redeploy the service (Render usually redeploys when you save env vars).

---

## Option B: Fly.io (free tier, stays on 24/7)

### 1. Install Fly CLI (Windows PowerShell)

```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Close and reopen PowerShell, then:

```powershell
cd C:\Users\jiayu\questionnaire-app
fly auth login
```

Sign in in the browser when prompted.

### 2. Launch the app

```powershell
fly launch
```

- **App name**: e.g. `pathwise` or `questionnaire-app` (must be unique).
- **Region**: Pick one close to you (e.g. `iad` for US East).
- **PostgreSQL**: No  
- **Redis**: No  

### 3. Set secrets (environment variables)

```powershell
fly secrets set SESSION_SECRET="YOUR_RANDOM_SECRET_HERE"
fly secrets set NODE_ENV=production
```

If you use MongoDB:

```powershell
fly secrets set MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/pathwise?retryWrites=true&w=majority"
```

If you use OpenAI/Anthropic:

```powershell
fly secrets set OPENAI_API_KEY="your-key"
fly secrets set ANTHROPIC_API_KEY="your-key"
```

### 4. Deploy

```powershell
fly deploy
```

### 5. Open your app

```powershell
fly open
```

Your site will be at **`https://YOUR-APP-NAME.fly.dev`**.

---

## After deployment

1. Visit your URL and test: login, signup, questionnaire, payment flow.
2. Check logs if something fails:
   - **Render**: Dashboard → your service → **Logs**.
   - **Fly.io**: `fly logs`.
3. (Optional) Add a custom domain in the dashboard (Render or Fly.io).

---

## Quick reference – env vars

| Variable           | Used for                          |
|--------------------|-----------------------------------|
| `NODE_ENV`         | Set to `production`               |
| `SESSION_SECRET`   | Session cookies (required)        |
| `MONGODB_URI`      | MongoDB Atlas (persistent data)   |
| `OPENAI_API_KEY`   | RAG embeddings / OpenAI chat      |
| `ANTHROPIC_API_KEY`| Claude chat                       |

If you tell me whether you prefer **Render** or **Fly.io** (and if you already have a GitHub repo), I can give you the exact commands for your case step by step.
