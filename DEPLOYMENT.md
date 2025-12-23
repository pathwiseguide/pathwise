# Deployment Guide for Pathwise

## Quick Deploy to Render (Recommended)

### Step 1: Commit and Push Your Changes
```bash
git add .
git commit -m "Update home page and prepare for deployment"
git push origin main
```

### Step 2: Deploy on Render

1. **Go to Render.com** and sign up/login: https://render.com

2. **Create a New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `pathwiseguide/pathwise`
   - Select the repository

3. **Configure the Service**:
   - **Name**: `pathwise` (or your preferred name)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free (or choose a paid plan)

4. **Set Environment Variables**:
   Click "Advanced" → "Add Environment Variable" and add:
   - `NODE_ENV` = `production`
   - `PORT` = `10000` (Render sets this automatically, but good to have)
   - `SESSION_SECRET` = (generate a random string, e.g., use: `openssl rand -hex 32`)
   - `OPENAI_API_KEY` = (your OpenAI API key if you're using ChatGPT)
   - Any other environment variables from your `.env` file

5. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically build and deploy your app
   - Your site will be live at: `https://pathwise.onrender.com` (or your custom domain)

### Step 3: Custom Domain (Optional)
- Go to your service settings
- Click "Custom Domains"
- Add your domain (e.g., `pathwise.com`)
- Follow DNS configuration instructions

## Alternative: Deploy to Railway

1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js and deploy
5. Add environment variables in the Railway dashboard

## Environment Variables Needed

Make sure to set these in your hosting platform:
- `NODE_ENV` = `production`
- `SESSION_SECRET` = (random secure string)
- `OPENAI_API_KEY` = (if using ChatGPT features)
- `PORT` = (usually auto-set by platform)

## After Deployment

1. Test your live site
2. Check that all features work
3. Set up a custom domain if desired
4. Monitor logs in your hosting dashboard

## Troubleshooting

- **Build fails**: Check that all dependencies are in `package.json`
- **App crashes**: Check environment variables are set correctly
- **Static files not loading**: Ensure `public` folder is in the root
- **Database issues**: Check that data directory permissions are correct
