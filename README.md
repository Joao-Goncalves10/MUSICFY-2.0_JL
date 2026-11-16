# Musicfy 2.0

Musicfy 2.0 is a full-stack music discovery and social review platform inspired by Frutiger Aero design language. The app combines a React front end with an Express back end connected to TiDB Cloud, enabling artist catalog management, release browsing, user reviews, social interactions, and administrator tools.

## Architecture

- Front end: React + Vite
- Back end: Node.js + Express
- Database: TiDB Cloud (MySQL-compatible)
- Authentication: JWT with bcrypt password hashing
- Styling: custom CSS with glassmorphism and vibrant gradients

This combination keeps the project lightweight while still providing a real persistent database, protected API routes, and a production-ready structure suitable for local deployment and further scaling.

## Features implemented

- User registration and login
- Role-based access control with ADMIN and USER roles
- Artist and release catalog
- Tracklists and media links
- Review publishing and rating system
- Like system for reviews
- Artist detail pages and release detail pages
- Social feed with recent community reviews
- User profile page
- Playlist and favorites support
- Pre-save flow and notification model
- Admin dashboard for creating artists and releases
- Responsive Frutiger Aero UI

## Local setup

### Requirements

- Node.js 20.19+ (or 22.12+) and npm
- A TiDB Cloud cluster with a database created for Musicfy

### Install and run

1. Create a database (for example, `musicfy`) in TiDB Cloud and get the cluster's connection details.

2. From the project root, install all front-end and back-end dependencies:

   npm install

3. Create and configure the local environment file. In PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

   Fill in `TIDB_HOST`, `TIDB_USER`, `TIDB_PASSWORD`, and `TIDB_DATABASE` from TiDB Cloud. Keep `TIDB_PORT=4000`; set `TIDB_CA_PATH` if TiDB Cloud gives you a CA certificate file. Set `JWT_SECRET` to a random value of at least 32 characters and choose a unique `MUSICFY_ADMIN_PASSWORD` of at least 12 characters for the first database startup. Do not commit `.env`.

   On macOS/Linux, create the file with `cp .env.example .env`.

4. Start the application in development mode:

   npm run dev

This runs both the API and the Vite front-end dev server. On startup, the API applies `server/schema.sql` to the configured TiDB database and seeds demo content if the tables are empty.

- Front end: http://localhost:5173
- API: http://localhost:4000

Useful commands:

- `npm run build` — build the front end for production
- `npm run start` — start the API server

## Admin account

The first database startup creates the admin account using `MUSICFY_ADMIN_USERNAME`, `MUSICFY_ADMIN_EMAIL`, `MUSICFY_ADMIN_NAME`, and `MUSICFY_ADMIN_PASSWORD`. Choose and keep the password private in `.env`; there is no default admin password.

## Database notes

The TiDB schema is defined in `server/schema.sql` using MySQL-compatible types and syntax. The API applies it to the database named by `TIDB_DATABASE` at startup. The database must already exist in TiDB Cloud. Connection settings are read from `.env`; the server fails with a configuration error if required `TIDB_*` values are missing.

The relational catalog links artists to releases and releases (albums, EPs, or singles) to tracks. Artist, release, and track URLs are stored in `artist_links`, `release_links`, and `track_links`. Lyrics and translations are stored in `track_texts`, keyed by track, content type, and language code; use `und` when the language is unknown. The existing local SQLite database is not uploaded or copied to TiDB automatically; it remains untouched.

User passwords are stored as bcrypt hashes. Reviews and their likes use `reviews` and `review_likes`; track favorites use `favorites`. Playlists, playlist tracks, pre-saves, notifications, and featured releases are persisted in their corresponding tables. A new database is seeded with roles, the configured admin account, a demo user, artists, releases, and tracks.

Additional content endpoints (writes require an admin token):

- `GET /api/content/:entityType/:id/links` — list links for an `artist`, `release`, or `track`
- `POST /api/content/:entityType/:id/links` — add a link (`platform`, `url`, optional `link_type`)
- `DELETE /api/content/:entityType/:id/links/:linkId` — remove a link
- `GET /api/tracks/:id/texts` — list a track's lyrics and translations
- `PUT /api/tracks/:id/texts` — add/update text (`content_type`, `language_code`, `content`, optional `source_language_code` and `source_url`)
- `DELETE /api/tracks/:id/texts/:contentType/:languageCode` — remove a language entry

## Build for production

npm run build

To serve the built static front end with the API in production mode:

PowerShell: `$env:NODE_ENV='production'; npm run start`

macOS/Linux: `NODE_ENV=production npm run start`

## Project structure

- `server/index.js` — Express API, database bootstrap and endpoints
- `server/schema.sql` — TiDB/MySQL-compatible database schema
- `src/App.jsx` — React pages and UI logic
- `src/styles.css` — full visual styling
- `index.html` — Vite entry point
- `vite.config.js` — Vite configuration and API proxy

## Main API routes

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/artists`
- `GET /api/artists/:id`
- `GET /api/releases`
- `GET /api/releases/:id`
- `POST /api/reviews`
- `POST /api/reviews/:id/like`
- `GET /api/profile/:userId`
- `GET /api/explore`
- `GET /api/dashboard` (admin only)

## Notes

This project is built as a functional MVP aligned with the requested product brief. It prioritizes real persistence, secure API handling, and working feature flows over a static mockup.
