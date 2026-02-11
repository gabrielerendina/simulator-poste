# Render.com Deployment Guide

Deploy Simulator Poste to Render.com for public access.

## Prerequisites

- GitHub account with this repository
- Render.com account (free tier available)
- SAP IAS OIDC credentials (already configured)

## Cost Estimate

| Service | Plan | Cost |
| --- | --- | --- |
| Backend | Starter | $7/month |
| Frontend | Static (Free) | $0/month |
| **Total** | | **$7/month** |

The Starter plan is required for the backend to have persistent disk storage for SQLite.

## Deployment Steps

### Step 1: Connect Repository

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New** → **Blueprint**
3. Connect your GitHub repository
4. Select the repository containing this project
5. Render will detect `render.yaml` automatically

### Step 2: Deploy Services

1. Review the services that will be created:
   - `simulator-poste-backend` (Web Service, Docker)
   - `simulator-poste-frontend` (Static Site)
2. Click **Apply** to start deployment
3. Wait for both services to deploy (5-10 minutes)

### Step 3: Configure Environment Variables

After initial deployment, you need to set cross-service URLs:

#### Backend Configuration

1. Go to `simulator-poste-backend` service
2. Navigate to **Environment** tab
3. Set `FRONTEND_URL`:

   ```text
   https://simulator-poste-frontend.onrender.com
   ```

   (Use your actual frontend URL)

#### Frontend Configuration

1. Go to `simulator-poste-frontend` service
2. Navigate to **Environment** tab
3. Set `VITE_API_URL`:

   ```text
   https://simulator-poste-backend.onrender.com
   ```

   (Use your actual backend URL - `/api` suffix is added automatically)

### Step 4: Redeploy Services

1. Go to backend service → **Manual Deploy** → **Deploy latest commit**
2. Go to frontend service → **Manual Deploy** → **Clear build cache & deploy**
3. Wait for both to complete

### Step 5: Configure OIDC (if needed)

If using SAP IAS authentication, add your Render URLs to the OIDC application:

1. Go to SAP IAS Admin Console
2. Find your OIDC application
3. Add redirect URIs:

   ```text
   https://simulator-poste-frontend.onrender.com/callback
   https://simulator-poste-frontend.onrender.com/silent-renew.html
   ```

4. Add post-logout redirect URI:

   ```text
   https://simulator-poste-frontend.onrender.com
   ```

## Accessing the Application

After deployment:

- **Frontend**: `https://simulator-poste-frontend.onrender.com`
- **Backend API**: `https://simulator-poste-backend.onrender.com/api`
- **API Docs**: `https://simulator-poste-backend.onrender.com/docs`
- **Health Check**: `https://simulator-poste-backend.onrender.com/health`

## Architecture on Render

```text
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────────┬───────────────────────────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌─────────────────────┐          ┌─────────────────────┐
│  Frontend (Static)  │          │  Backend (Docker)   │
│  Render Static Site │───API───▶│  Render Web Service │
│  Free Tier          │          │  Starter Plan       │
└─────────────────────┘          └──────────┬──────────┘
                                            │
                                 ┌──────────▼──────────┐
                                 │  Persistent Disk    │
                                 │  SQLite Database    │
                                 │  1GB                │
                                 └─────────────────────┘
```

## Troubleshooting

### CORS Errors

If you see CORS errors in browser console:

1. Verify `FRONTEND_URL` is set correctly in backend
2. Check it includes `https://` prefix
3. Redeploy backend after changes

### API Connection Errors

If frontend can't reach backend:

1. Verify `VITE_API_URL` is set in frontend
2. Check backend health: `curl https://your-backend.onrender.com/health`
3. Clear frontend build cache and redeploy

### Database Errors

SQLite database is stored on a persistent disk at `/data/simulator_poste.db`.

To reset the database:

1. Go to backend service → **Disks**
2. Delete the disk
3. Redeploy (a new disk will be created)

### Cold Starts

On Starter plan, services may take 10-30 seconds to wake up after inactivity. This is normal for the pricing tier.

## Updating the Application

Push to your main branch to trigger automatic redeployment:

```bash
git push origin main
```

Both services will rebuild and redeploy automatically.

## Scaling (Future)

If you need more capacity:

1. **Upgrade Backend**: Change `plan: starter` to `plan: standard` in render.yaml
2. **Add More Instances**: Render supports horizontal scaling on higher plans
3. **Switch Database**: For higher load, consider PostgreSQL (Render has managed PostgreSQL)
