# CommerceOS WooCommerce CRM

A React/Vite manager dashboard and customer storefront backed by an Express API and PostgreSQL.

## Important security note
The original archive contained `backend/.env`. It has been excluded from this cleaned package because environment files can contain credentials. If those values were real and the archive was shared, rotate the database password and JWT secret. Create a fresh local `backend/.env` from `backend/.env.example`.

## Requirements
- Node.js 20 or newer
- PostgreSQL 14 or newer

## Setup
1. Create a PostgreSQL database named `commerceos_crm` (or choose another name in `.env`).
2. In `backend/`, copy `.env.example` to `.env` and fill in database credentials, a random `JWT_SECRET` of at least 32 characters, and a unique manager password of at least 12 characters.
3. Run the SQL files in order: `backend/db/schema.sql`, then `backend/db/commerceos_migration.sql`.
4. Install backend dependencies with `cd backend && npm install`.
5. Create/update the manager login with `npm run create-manager`.
6. Start the API with `npm start` (or from project root `node server.js`). It listens on port 5000 by default.
7. In `frontend/`, create `.env` from `.env.example`, run `npm install`, then `npm run dev`.
8. In `storefront/`, do the same. Vite typically uses ports 5173 and 5174; if a port changes, local CORS accepts localhost development ports.

## Fixing “This website origin is not allowed”
For deployed websites, set `FRONTEND_URL` and `STOREFRONT_URL` in the backend environment to the exact origins, e.g. `https://admin.example.com` and `https://shop.example.com` (no path and no trailing slash). Restart the backend after changing environment variables. If you have more origins, add them comma-separated to `ALLOWED_ORIGINS`. Do not use `*` for a credentialed application.

## API URL for deployment
Set `VITE_API_BASE_URL` in each Vite app to the deployed API URL ending in `/api`, then rebuild the frontend. Example: `https://api.example.com/api`.

## Checks
- Backend syntax: `node --check backend/server.js`
- Frontend production build: `cd frontend && npm run build`
- Storefront production build: `cd storefront && npm run build`

The project needs valid PostgreSQL credentials and a reachable database for live API checks; syntax/build checks alone do not prove database connectivity.
