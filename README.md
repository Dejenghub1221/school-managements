# School Management System (React + Node.js)

- `server/` Express API with JWT login, role-based permissions and in-memory sample data
- `client/` React (Vite) app with the same design: icon sidebar, role-based menu, responsive tables

## Run
```bash
cd server && npm install && npm run dev     # http://localhost:4000
cd client && npm install && npm run dev     # http://localhost:5173
```
Sign in as `admin`, `teacher`, `student` or `parent`. The password for all four is `school123`.

## Configure
Server env: `PORT`, `JWT_SECRET` (change it), `CLIENT_URL`, `DEMO_PASSWORD`. Client env: `VITE_API_URL`.

## Next steps
Data lives in `server/src/data.js`, so it resets on restart. To use a real database such as PostgreSQL,
replace the `db.<resource>` reads and writes in `server/src/index.js` with queries.
Permissions are defined once, in `PM` in `server/src/auth.js`. The client gets them at login.
