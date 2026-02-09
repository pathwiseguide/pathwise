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

## Step 7: Set secrets (required for production)

Your app needs these in production. Set them on Fly so the app can start:

```powershell
fly secrets set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/pathwise"
fly secrets set SESSION_SECRET="your-long-random-secret-here"
fly secrets set ADMIN_PASSWORD="your-admin-password"
# Optional: for AI features
fly secrets set ANTHROPIC_API_KEY="your-key"
fly secrets set OPENAI_API_KEY="your-key"
```

If `MONGODB_URI` is not set, the app may start but data won’t persist. If the app crashes on boot, check logs (Step 8).

## If deploy fails or the app won’t start

1. **See why it failed**
   - After `fly deploy`, read the build/output error.
   - Then run: `fly logs` (live logs from the running app).

2. **Check app status**
   - `fly status` — shows machine state and region.

3. **Common issues**
   - **Build fails** (e.g. “node-gyp” or “npm ci”): The Dockerfile was updated to use Node 20 and add `cmake` for native modules. Pull latest and redeploy.
   - **App exits right after start**: Usually missing or wrong secrets. Set `MONGODB_URI`, `SESSION_SECRET`, and `ADMIN_PASSWORD` with `fly secrets set ...`.
   - **502 / “no response”**: App might not be listening on the port Fly uses. The app listens on `PORT` (Fly sets this to 3001). If you changed the app port, set `internal_port` in `fly.toml` to match.

4. **SSH into the machine** (advanced)
   - `fly ssh console` — then run `node -v` or `ls` to debug.

## App shows as “suspended” on the Fly website

That usually means the machine is **stopped** (no traffic = Fly stopped it to save resources). Start it again:

1. **Start the machine** (from your project folder):
   ```powershell
   fly machine list
   ```
   Note the machine **ID** (first column). Then:
   ```powershell
   fly machine start <machine-id>
   ```
   Example: `fly machine start 1234567890abcdef`

2. **Keep it running**  
   Your `fly.toml` already has `min_machines_running = 1`, so after you **redeploy** at least one machine stays on and the site won’t go “suspended” when idle:
   ```powershell
   fly deploy
   ```

3. **If the dashboard says the app/account is suspended** (e.g. billing or policy), check your Fly dashboard and email from Fly for the reason and follow their instructions (e.g. add payment method or contact support).







