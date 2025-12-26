# Raw2Insight Frontend - Vercel Deployment Guide

## 🚀 Deploy to Vercel (Recommended)

### Option 1: Vercel CLI (Fastest)

```bash
# Install Vercel CLI globally
npm install -g vercel

# Navigate to frontend directory
cd /Users/anuragchaubey/Desktop/Raw2Insight/frontend

# Login to Vercel
vercel login

# Deploy to production
vercel --prod
```

**Follow the prompts:**
- Set up and deploy? **Y**
- Which scope? Choose your account
- Link to existing project? **N**
- What's your project's name? **raw2insight-frontend**
- In which directory is your code located? **./** (current directory)
- Want to modify settings? **N**

**Add environment variable when prompted:**
```
VITE_API_URL=https://anuragchaubey00-raw2insight-backend.hf.space/api/v1
```

---

### Option 2: Vercel Dashboard (Step-by-Step)

#### Step 1: Go to Vercel
Visit: https://vercel.com/new

#### Step 2: Import Repository
1. Click **"Import Git Repository"**
2. Select your GitHub account
3. Find and select **"Raw2Insight"** repository
4. Click **"Import"**

#### Step 3: Configure Project
```
Framework Preset: Vite
Root Directory: frontend
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

#### Step 4: Add Environment Variables
Click **"Environment Variables"** and add:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://anuragchaubey00-raw2insight-backend.hf.space/api/v1` |

#### Step 5: Deploy
Click **"Deploy"** button

⏱️ Deployment takes ~2-3 minutes

---

## ✅ Post-Deployment Checklist

### 1. Test Your Deployed Frontend

Once deployed, your app will be at: `https://raw2insight-frontend.vercel.app`

**Test these features:**
- ✅ Visit homepage
- ✅ Sign up new account
- ✅ Login
- ✅ Upload document (PDF/image)
- ✅ Process document
- ✅ View results
- ✅ Check history

### 2. Update Backend CORS (Important!)

Your HF Space backend needs to allow requests from Vercel domain.

**Option A: Allow All Origins (Quick)**
In HF Space Settings → Repository secrets:
```
CORS_ORIGINS=*
```

**Option B: Specific Domain (Secure)**
```
CORS_ORIGINS=https://raw2insight-frontend.vercel.app
```

### 3. Get Custom Domain (Optional)

In Vercel Dashboard:
1. Go to your project settings
2. Click **"Domains"**
3. Add your custom domain (e.g., `raw2insight.com`)
4. Follow DNS configuration steps

---

## 🔧 Vercel Configuration Files

### vercel.json (Already Created)
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This config:
- ✅ Enables client-side routing (React Router)
- ✅ Sets correct build output directory
- ✅ Configures Vite framework detection

---

## 🛠️ Troubleshooting

### Build Fails
```bash
# Test build locally first
cd frontend
npm run build

# If it works locally, build should work on Vercel
```

### 404 on Routes
- ✅ Fixed by `vercel.json` rewrites configuration
- Ensures all routes go through React Router

### API Calls Failing
Check environment variables:
1. Go to Vercel Dashboard
2. Project Settings → Environment Variables
3. Verify `VITE_API_URL` is set correctly
4. Redeploy after adding variables

### CORS Errors
Update HF Space backend CORS settings:
```env
CORS_ORIGINS=https://raw2insight-frontend.vercel.app
```

---

## 📊 Vercel Features You Get

- ✅ **Automatic HTTPS** - Free SSL certificate
- ✅ **Global CDN** - Fast worldwide access
- ✅ **Auto-deployment** - Push to GitHub → Auto deploy
- ✅ **Preview Deployments** - Every PR gets preview URL
- ✅ **Edge Functions** - Serverless at the edge
- ✅ **Analytics** - Built-in performance monitoring
- ✅ **Zero Config** - Works out of the box

---

## 🎯 Quick Deploy Command

**One-liner to deploy right now:**
```bash
cd /Users/anuragchaubey/Desktop/Raw2Insight/frontend && npx vercel --prod
```

---

## 📝 After First Deployment

### Enable Auto-Deploy from GitHub
Vercel automatically sets this up! Every push to `main` branch will:
1. Trigger new deployment
2. Run build
3. Deploy to production
4. Update your live site

### Monitor Deployments
- Dashboard: https://vercel.com/dashboard
- View logs, analytics, and performance metrics

---

## ✅ You're Ready!

Run this now:
```bash
cd frontend
npx vercel --prod
```

When prompted for `VITE_API_URL`, paste:
```
https://anuragchaubey00-raw2insight-backend.hf.space/api/v1
```

**That's it!** Your frontend will be live in 2-3 minutes! 🚀
