# Vote Nigeria — Render + Supabase setup

School/demo project. The frontend is a Render Static Site; the API is a separate Render Web Service; the database is Supabase's hosted PostgreSQL. No separately installed PostgreSQL server is needed.

## Folder layout

- `frontend/` — static HTML, CSS and browser JavaScript
- `backend/` — Node.js/Express API
- `database/schema.sql` — SQL schema and demo seed data
- `database/init.js` — optional schema initializer

The frontend API client is configured for `https://votenigeria-backend.onrender.com`.

## 1. Create the Supabase database

1. Open the Supabase project `https://vmmghqqbovlcszfqmjbv.supabase.co`.
2. Go to **SQL Editor** and run the entire contents of `database/schema.sql`.
3. In **Project Settings → Database → Connect**, copy the PostgreSQL URI connection string. Use the Session pooler connection string if the direct connection is not suitable for Render.
4. Replace the password placeholder with your database password. This is the `DATABASE_URL` value for Render. It is distinct from the Supabase publishable and service-role API keys.

The Node backend uses the `pg` driver to connect to Supabase's hosted PostgreSQL. Therefore `DATABASE_URL` is required. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are included as project configuration values, but this existing backend does not use the Supabase JavaScript SDK or service-role key. Keep `SUPABASE_SERVICE_ROLE_KEY` empty unless you later add code that genuinely requires it. Never expose a service-role key in frontend code.

## 2. Deploy backend on Render

Create a **Web Service** from your Git repository (or upload/push this project to a Git provider first).

- **Root Directory:** `project/vote-nigeria-structured`
- **Runtime:** Node
- **Build Command:** `npm install`
- **Start Command:** `npm start`

Add these Environment Variables in Render:

- `NODE_ENV` = `production`
- `DATABASE_URL` = the Supabase PostgreSQL URI from step 1
- `SUPABASE_URL` = `https://vmmghqqbovlcszfqmjbv.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_y6FufxZBtE9mVlKTWKuG-A_q6YTsSGV`
- `SUPABASE_SERVICE_ROLE_KEY` = *(leave empty)*
- `ADMIN_PASSWORD` = choose a new admin password
- `ADMIN_PIN` = choose a new admin PIN

Render sets `PORT` automatically. Do not hard-code it. After deployment, the API should be available at `https://votenigeria-backend.onrender.com`.

### Commands to run locally / in Render Shell

In the backend service's Shell (or locally from this directory):

```bash
npm install
npm run init-db
npm start
```

**Important:** `npm run init-db` runs the schema and seed data. Prefer running `database/schema.sql` once in the Supabase SQL Editor as described above. Do not run the initializer repeatedly because the seed inserts are not all idempotent and can create duplicate demo rows.

## 3. Deploy frontend on Render

Create a **Static Site** from the same repository:

- **Root Directory:** `project/vote-nigeria-structured/frontend`
- **Build Command:** leave blank (or use `echo "Static frontend"`)
- **Publish Directory:** `.`

Deploy it at `https://votenigeria-frontend.onrender.com`. The browser JavaScript is already configured to call `https://votenigeria-backend.onrender.com`.

## 4. Verify

- Visit `https://votenigeria-backend.onrender.com` — it should respond with the landing page only if the backend is serving its bundled static files; for the separate frontend deployment, check API routes such as `/api/elections`.
- Open `https://votenigeria-frontend.onrender.com`.
- If API calls fail, inspect the Render backend logs and confirm `DATABASE_URL`, Supabase database password, and CORS frontend origin.
- If the Supabase database is empty, run `database/schema.sql` in the Supabase SQL Editor.

## Security / demo warning

This is a school project, not a production election system. The included demo NIN records and the original admin credentials are not suitable for real voters. Use a strong unique admin password and PIN. Before any real use, implement robust authentication, authorization, audit logging, rate limiting, and database transaction-safe vote casting. Keep database credentials and any service-role key only in backend environment variables.


## Empty-state behaviour
- Results displays `No matching elections found` until elections exist.
- Nigeria Today displays `No stories for today` until an administrator posts news.
- Election page displays `No available elections` until an administrator creates an election.
- The demo frontend fallback and database schema no longer preload sample elections, candidates, or news.
