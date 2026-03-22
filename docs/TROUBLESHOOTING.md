# AirLense — troubleshooting (what’s wrong, why, and what to do)

## 0. `Access denied for user 'root'@'localhost' (using password: NO)`

**What’s wrong**  
The API is connecting to MySQL **without** a password (`DB_PASSWORD` is empty or unset).

**Why**  
Your MySQL `root` user (or `DB_USER`) is configured to require a password, but `Backend/.env` doesn’t define `DB_PASSWORD`.

**What to do**

1. Create or edit **`Backend/.env`** (copy from `Backend/.env.example`).
2. Set:
   ```env
   DB_USER=root
   DB_PASSWORD=the_same_password_you_use_for_mysql_-p
   ```
   (The app always uses the **`air_pollution`** database; `DB_NAME` / `MYSQL_DATABASE` in `.env` are ignored.)
3. Restart the backend (`Ctrl+C`, then `npm start` in `Backend/`).

You can use **`Backend/.env`** or a **project-root `.env`**. The server loads both; **`Backend/.env` overrides the root file** so a stray empty `DB_PASSWORD=` in the root file cannot block your real password in `Backend/.env`.

If it still says **`using password: NO`**, check: (1) `Backend/.env` is in the **`Backend/`** folder next to `server.js`, (2) the line has **no spaces** around `=` (`DB_PASSWORD=secret`, not `DB_PASSWORD = secret`), (3) you restarted `node` after saving.

---

## 1. “Failed to fetch query results” or “Cannot reach API…”

**What’s wrong**  
The browser cannot get a successful response from the backend, or the backend returns an error status.

**Why it happens**

| Situation | Cause |
|-----------|--------|
| Message mentions **Cannot reach API** | Backend is not running, wrong host/port, or firewall blocking `localhost`. |
| Message shows **API 500: …** | Express is running, but the **SQL query failed** (wrong credentials, missing DB/tables) or MySQL is down. |
| **EADDRINUSE** when starting backend | Another process already uses port **3000** (often an old `node server.js`). |

**What to do**

1. Start the API: `cd Backend && npm start`.  
2. Check DB from the terminal: `curl http://localhost:3000/api/health`  
   - **`"database": true`** → MySQL is reachable.  
   - **`503`** with `details` → fix `Backend/.env` and ensure MySQL has the `air_pollution` database (`mysql < schema.sql`).  
3. If the API is not on port 3000, set `REACT_APP_API_ORIGIN` in `Frontend/.env` and restart `npm start` in `Frontend/`.  
4. Free port 3000: `lsof -i :3000` then `kill <PID>`.

---

## 2. Catalog loads but charts show an API error

**What’s wrong**  
`/api/query-catalog` and `/api/source-legend` don’t touch the database; canned query endpoints **do**. So the UI can load the sidebar and still fail on the first data request.

**Why**  
MySQL connection or a specific SQL error only appears when a route runs `db.query(...)`.

**What to do**  
Read the full error text (the UI shows **`API 500: …`** with the MySQL message). Typical fixes:

- **Access denied** → correct `DB_USER` / `DB_PASSWORD` in `Backend/.env`.  
- **Unknown database** → run `schema.sql`.  
- **Table doesn’t exist** → run `schema.sql` after `python3 transformData.py`.

---

## 3. Frontend hid the real error (fixed in code)

**What was wrong**  
One React `error` state was used for both “catalog/legend failed” and “canned query failed.” Starting a canned query **cleared** that state, so a setup error could disappear.

**What we did**  
Split into **`bootstrapError`** (catalog/legend) and **`queryError`** (canned queries) so messages stay visible and are easier to interpret.

---

## 4. Backend console on startup

When the server starts, you should see either:

- `[DB] MySQL OK — database: air_pollution`  
- or `[DB] Connection failed: …` with a hint to fix `.env` / `schema.sql`.

If you see the failure line, fix the database **before** debugging the React app.

---

## 5. Canned queries Q14–Q15 fail (syntax error near `OVER`, `WITH`, `ROW_NUMBER`)

**What’s wrong**  
**Q14** needs **window functions** (`ROW_NUMBER`). **Q15** uses a **`WITH` CTE** — also **MySQL 8.0+** only (5.7 has no CTEs).

**What to do**  
Run `SELECT VERSION();` — if **5.7** or older, upgrade to **8.0+** for **Q14–Q15**, or skip them. **Q16** (OECD DALY change 2018→2019) uses only **`JOIN`s** (no CTE, no windows) and works on **MySQL 5.7+**.
