# Deployment Guide

This guide will help you deploy your questionnaire app to the internet.

## Option 1: Render (Recommended - Free & Easy)

**Render** offers a free tier and is very easy to use.

### Steps:

1. **Create a GitHub account** (if you don't have one) at https://github.com

2. **Create a new repository** on GitHub:
   - Go to https://github.com/new
   - Name it `questionnaire-app`
   - Make it public (for free tier)
   - Click "Create repository"

3. **Push your code to GitHub**:
   ```bash
   cd C:\Users\jiayu\questionnaire-app
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/questionnaire-app.git
   git push -u origin main
   ```
   (Replace YOUR_USERNAME with your GitHub username)

4. **Deploy on Render**:
   - Go to https://render.com
   - Sign up for free
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select your `questionnaire-app` repository
   - Configure:
     - **Name**: questionnaire-app (or any name)
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
   - Click "Create Web Service"
   - Wait for deployment (takes 2-3 minutes)
   - Your site will be live at: `https://questionnaire-app.onrender.com` (or similar)

## Option 2: Railway (Free Tier Available)

1. **Push code to GitHub** (same as steps 1-3 above)

2. **Deploy on Railway**:
   - Go to https://railway.app
   - Sign up with GitHub
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository
   - Railway auto-detects Node.js and deploys
   - Your site will be live automatically!

## Option 3: Vercel (Great for Node.js)

1. **Push code to GitHub** (same as steps 1-3 above)

2. **Deploy on Vercel**:
   - Go to https://vercel.com
   - Sign up with GitHub
   - Click "New Project"
   - Import your repository
   - Configure:
     - **Framework Preset**: Other
     - **Build Command**: (leave empty)
     - **Output Directory**: (leave empty)
     - **Install Command**: `npm install`
   - Click "Deploy"
   - Your site will be live!

## Option 4: Heroku (Requires Credit Card for Free Tier)

1. **Install Heroku CLI**: https://devcenter.heroku.com/articles/heroku-cli

2. **Login and deploy**:
   ```bash
   heroku login
   cd C:\Users\jiayu\questionnaire-app
   heroku create your-app-name
   git init
   git add .
   git commit -m "Initial commit"
   git push heroku main
   ```

## Option 5: DigitalOcean App Platform

1. **Push code to GitHub**

2. **Deploy on DigitalOcean**:
   - Go to https://cloud.digitalocean.com
   - Create account
   - Go to "App Platform"
   - Connect GitHub
   - Select repository
   - Auto-detects and deploys

## Important Notes:

- **Data Persistence**: The free tiers on most platforms may reset data on restart. For production, consider using a database (MongoDB, PostgreSQL) instead of JSON files.

- **Environment Variables**: The app uses `process.env.PORT` so it will work on any platform automatically.

- **Custom Domain**: Most platforms allow you to add a custom domain (you'll need to purchase one from a registrar like Namecheap, Google Domains, etc.)

## Which Should You Choose?

- **Easiest**: Render or Railway
- **Most Popular**: Vercel or Heroku
- **Most Control**: DigitalOcean or AWS

All of these will give you a public URL where anyone can access your questionnaire!


