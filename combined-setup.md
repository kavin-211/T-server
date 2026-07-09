# Combined-repo setup (T-client + T-server)

This project runs both API + frontend from **one** repo/deployment.

## What to do
1. Copy frontend files into:
   - `T-server/client/`

2. Ensure backend serves from `T-server/client/` (already updated in `T-server/server.js`).

3. Vercel deployment:
   - Root `vercel.json` should route `/api/*` to `T-server/server.js`.
   - Everything else should be served by the same server (because Express serves static `T-server/client`).

## Important
- In `T-client/script.js`, `API_URL` currently points to `http://localhost:5000`. That must be changed to relative `/api` for Vercel.

