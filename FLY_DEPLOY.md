# Deploy to Fly.io (FREE - Stays Online 24/7)

Fly.io offers a **much better free tier** than Render - your app stays online 24/7!

## Step 1: Install Fly CLI

**Windows (PowerShell):**
```powershell
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

Or download from: https://fly.io/docs/hands-on/install-flyctl/

## Step 2: Sign Up

1. Go to https://fly.io and sign up (free)
2. Verify your email

## Step 3: Login

Open PowerShell in your project directory:
```powershell
cd C:\Users\jiayu\questionnaire-app
fly auth login
```

## Step 4: Launch Your App

```powershell
fly launch
```

When prompted:
- **App name**: `questionnaire-app` (or any unique name)
- **Region**: Choose closest to you (e.g., `iad` for US East)
- **PostgreSQL**: No (we're using JSON files)
- **Redis**: No

## Step 5: Deploy

```powershell
fly deploy
```

## Step 6: Open Your App

```powershell
fly open
```

Your app will be live at: `https://questionnaire-app.fly.dev` (or similar)

## Benefits of Fly.io Free Tier:
- ✅ **Stays online 24/7** (no spin-down!)
- ✅ **3 free VMs** (more than enough for your app)
- ✅ **3GB storage**
- ✅ **160GB outbound data transfer**
- ✅ **Much faster than Render free tier**

## If You Need Help:
- Check logs: `fly logs`
- View app status: `fly status`
- SSH into app: `fly ssh console`

