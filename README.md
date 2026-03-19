# Climate Intelligence Dashboard

A full-stack web dashboard that integrates **4 international datasets** (World Bank, OECD, WHO, AQI) into a BCNF-normalized relational database and visualizes air pollution, health outcomes, and economic patterns through **12 analytical queries** + a **custom SQL query editor**.

![Dashboard](dashboard.png)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Data Sources](#data-sources)
- [Database Schema (9 Tables, BCNF)](#database-schema-9-tables-bcnf)
- [ETL Pipeline](#etl-pipeline)
- [Backend API](#backend-api)
- [Frontend](#frontend)
- [Canned Queries](#canned-queries)
- [Custom SQL Query Tab](#custom-sql-query-tab)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Generate CSVs from raw data
python3 transformData.py

# 2. Create database + load data into MySQL
mysql -u root -p --local-infile=1 < schema.sql

# 3. Start the backend (Terminal 1)
cd Backend
npm install
node server.js
# → http://localhost:3000

# 4. Start the frontend (Terminal 2, from project root)
npm install
npm start
# → http://localhost:3001
```

Open **http://localhost:3001** in your browser.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v18+ | Backend API + React frontend |
| **npm** | v9+ | Package manager |
| **MySQL** | 8.0+ | Database |
| **Python 3** | 3.8+ | ETL script |
| **pandas** | any | Python data processing |

Install Python dependencies:

```bash
pip3 install pandas numpy
```

### MySQL Configuration

### Frontend
- React
- Recharts 
- Glassmorphism UI styling

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| User | `root` |
| Password | `shirin ebadi` |
| Database | `air_pollution` |

Update these in `Backend/server.js` (lines 13–18) if your MySQL setup differs.

The `schema.sql` script uses `LOAD DATA LOCAL INFILE`. If you get an error, enable it:

```sql
SET GLOBAL local_infile = 1;
```

Or run mysql with:

```bash
mysql -u root -p --local-infile=1 < schema.sql
```

---

## Project Structure

```
JsAirPolution/
├── Backend/
│   ├── server.js              # Express API — 12 canned queries + custom query endpoint
│   └── package.json           # Backend dependencies (express, mysql2, cors)
│
├── src/
│   ├── App.js                 # React dashboard — charts, query selector, custom SQL tab
│   ├── App.css                # Glassmorphism styling
│   ├── index.js               # React entry point
│   └── index.css              # Global styles
│
├── public/
│   └── index.html             # HTML shell
│
├── Data/                      # Raw source data (7 files)
│   ├── MetadataCountry.csv                         # World Bank country metadata
│   ├── mortality_trimmed.csv                       # World Bank mortality rates
│   ├── API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv  # World Bank raw mortality (full)
│   ├── OECD...csv                                  # OECD DALYs from PM2.5
│   ├── AQI and Lat Long of Countries.csv           # City-level AQI measurements
│   ├── who_ambient_air_quality_...csv              # WHO Air Quality Database v2023
│   └── Metadata_Indicator...csv                    # Indicator metadata
│
├── transformData.py           # ETL: reads raw Data/ → outputs 8 CSVs
├── schema.sql                 # DDL: creates 9 tables + loads CSVs into MySQL
│
├── country.csv                # Generated CSV — country metadata
├── indicator.csv              # Generated CSV — health indicator definitions
├── aqi_reference.csv          # Generated CSV — AQI category lookup
├── city_aqi.csv               # Generated CSV — city AQI with 5 pollutants
├── mortality_normalized.csv   # Generated CSV — WB mortality (unpivoted)
├── oecd_normalized.csv        # Generated CSV — OECD DALYs
├── mortality_wide_raw.csv     # Generated CSV — WB staging (wide format)
├── who_air_quality.csv        # Generated CSV — WHO air quality measurements
│
├── package.json               # Frontend dependencies (react, recharts)
├── dashboard.png              # Dashboard screenshot
└── README.md                  # This file
```

---

## Data Sources

| # | Source | File | Description | Records |
|---|--------|------|-------------|---------|
| 1 | **World Bank** | `MetadataCountry.csv` | Country classification (region, income group) | 265 countries |
| 2 | **World Bank** | `mortality_trimmed.csv` | Mortality rate attributed to air pollution | 231 × 1 year (2019) |
| 3 | **OECD** | `OECD...csv` | Disability-adjusted life years (DALYs) from PM2.5 | 212 countries × 10 years |
| 4 | **AQI Dataset** | `AQI and Lat Long of Countries.csv` | City-level AQI with 5 pollutant types | ~16,700 cities |
| 5 | **WHO** | `who_ambient_air_quality_...csv` | City-level PM2.5, PM10, NO2 concentrations | ~41,200 measurements |

---

## Database Schema (9 Tables, BCNF)

All tables satisfy **Boyce-Codd Normal Form** — every non-trivial functional dependency has a superkey as its determinant.

| # | Table | Type | Primary Key | Rows | Source |
|---|-------|------|-------------|------|--------|
| 1 | `country` | table | `country_code` | 265 | World Bank |
| 2 | `indicator` | table | `indicator_code` | 2 | World Bank |
| 3 | `aqi_reference` | table | `category_name` | 6 | Derived |
| 4 | `city_aqi` | table | `(country, city, lat, lng)` | 16,695 | AQI Dataset |
| 5 | `mortality_normalized` | table | `(country_code, indicator_code, year)` | 231 | World Bank |
| 6 | `oecd_normalized` | table | `(ref_area, time_period)` | 2,120 | OECD |
| 7 | `mortality_wide_raw` | table | `(country_code, indicator_code)` | staging | World Bank |
| 8 | `who_air_quality` | table | `(country_code, city, year, lat, lng)` | 41,236 | WHO |
| 9 | `health_impacts` | **VIEW** | — | 2,351 | UNION of #5 + #6 |

### Key Design Decisions

- **AQI categories removed from `city_aqi`** — eliminates transitive dependency (`aqi_value → category`). Use range-based JOINs with `aqi_reference` instead.
- **WB and OECD kept in separate tables** — different source schemas. The `health_impacts` VIEW unifies them for cross-source queries.
- **`who_air_quality` stores concentrations (µg/m³)** — distinct from `city_aqi` which stores AQI index values. No redundancy.
- **`mortality_wide_raw` is a staging table** — preserves the original wide-format data (years as columns) for reference.

### Entity-Relationship Diagram

```
country ──┬── mortality_normalized ──── indicator
           ├── oecd_normalized
           ├── who_air_quality
           └── city_aqi ──── aqi_reference (range JOIN)

health_impacts = VIEW(mortality_normalized UNION oecd_normalized)
```

---

## ETL Pipeline

`transformData.py` reads the 5 raw data files and outputs 8 clean CSVs:

```
Raw Data Files (Data/)          →  transformData.py  →  8 CSVs (project root)
                                                     →  schema.sql loads CSVs → MySQL
```

### Updating Data Paths

The script uses absolute paths. If your raw data is in a different location, update lines 5–9 in `transformData.py`:

```python
country_meta = pd.read_csv('Data/MetadataCountry.csv')        # adjust path
mortality_raw = pd.read_csv('Data/mortality_trimmed.csv')      # adjust path
# ... etc
```

### Running the ETL

```bash
python3 transformData.py
```

Output:

```
Data successfully transformed into 8 clean CSVs!
Tables: country, indicator, aqi_reference, city_aqi, mortality_normalized, oecd_normalized, mortality_wide_raw, who_air_quality
Note: health_impacts is a SQL VIEW — see schema.sql
```

---

## Backend API

**Location:** `Backend/server.js`  
**Port:** 3000  
**Dependencies:** express, mysql2, cors

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/source-legend` | Color/label map for all 9 tables |
| GET | `/api/query-catalog` | Metadata for all 12 canned queries |
| GET | `/api/global-health-snapshot` | Q1: Top 30 countries by mortality |
| GET | `/api/oecd-dalys-income` | Q2: OECD DALYs by income group |
| GET | `/api/hazardous-cities` | Q3: Cities with PM2.5 > 300 |
| GET | `/api/regional-hotspots` | Q4: Polluted cities count by region |
| GET | `/api/decade-trend` | Q5: OECD DALYs 2010 vs 2019 |
| GET | `/api/safest-high-income` | Q6: Cleanest high-income cities |
| GET | `/api/dual-source` | Q7: WB + OECD cross-comparison |
| GET | `/api/city-vs-national` | Q8: City AQI vs national mortality |
| GET | `/api/health-data-coverage` | Q9: Coverage via health_impacts VIEW |
| GET | `/api/who-vs-mortality` | Q10: WHO PM2.5 vs WB mortality |
| GET | `/api/who-regional-pm25` | Q11: WHO PM2.5 by region |
| GET | `/api/category-aggregator` | Q12: AQI categories in Sub-Saharan Africa |
| **POST** | `/api/custom-query` | **Custom SQL** (SELECT only, LIMIT 200 default) |

### Response Format (Canned Queries)

```json
{
  "queryName": "Global Health Snapshot (2019)",
  "description": "Top 30 countries by air pollution mortality.",
  "rowCount": 30,
  "sourceMap": { "country_name": "country", "mortality_rate_2019": "mortality_normalized" },
  "tablesUsed": ["country", "mortality_normalized", "indicator"],
  "data": [...]
}
```

### Custom Query Request

```bash
curl -X POST http://localhost:3000/api/custom-query \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM country WHERE region = '\''South Asia'\''"}'
```

---

## Frontend

**Location:** `src/App.js`, `src/App.css`  
**Port:** 3001  
**Dependencies:** React 18, Recharts

### Features

- **Sidebar** with 12 canned query buttons + Custom SQL Query button
- **Source color map** — each table has a unique color shown in the legend
- **Bar charts** via Recharts with per-field color coding
- **Results table** with column headers color-coded by source table
- **Summary cards** showing top result values
- **Typing animation** for query descriptions
- **Custom SQL editor** — monospace textarea with Run Query button
- **Glassmorphism UI** with dark theme

---

## Canned Queries

| # | Query | Tables Used | SQL Techniques |
|---|-------|-------------|----------------|
| Q1 | Global Health Snapshot (2019) | country, mortality_normalized, indicator | 3-table JOIN |
| Q2 | OECD DALYs by Income Group | country, oecd_normalized | GROUP BY, AVG |
| Q3 | Hazardous PM2.5 Cities | city_aqi, aqi_reference, country | Range-based JOIN (BETWEEN), LEFT JOIN |
| Q4 | Regional Pollution Hotspots | country, city_aqi, aqi_reference | COUNT, GROUP BY |
| Q5 | OECD Decade Trend (2010 vs 2019) | country, oecd_normalized | **Self-join** |
| Q6 | Safest Cities (High-Income) | city_aqi, country, aqi_reference | Multi-table JOIN, ORDER BY |
| Q7 | Dual-Source Comparison | country, mortality_normalized, oecd_normalized | **Cross-source JOIN** |
| Q8 | City AQI vs National Mortality | city_aqi, country, mortality_normalized | Mixed granularity JOIN |
| Q9 | Health Data Coverage | country, health_impacts (VIEW), indicator | **VIEW query**, GROUP BY |
| Q10 | WHO PM2.5 vs Mortality | who_air_quality, country, mortality_normalized | **3-source cross-validation** |
| Q11 | WHO PM2.5 by Region | who_air_quality, country | Aggregate concentrations |
| Q12 | AQI Category Aggregator | city_aqi, aqi_reference, country | Range JOIN, multi-AVG |

---

## Custom SQL Query Tab

Click **"✏️ Custom SQL Query"** at the top of the sidebar to open the SQL editor.

- Write any `SELECT` statement against the 9 tables
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, etc. are **blocked**
- A `LIMIT 200` is added automatically if you don't specify one
- Results appear in a styled table below the editor
- MySQL error messages are shown inline for debugging

### Example Custom Queries

```sql
-- Top 10 most polluted cities
SELECT city, country, aqi_value, pm25_aqi_value
FROM city_aqi ORDER BY aqi_value DESC LIMIT 10;

-- Countries in both WHO and WB datasets
SELECT DISTINCT c.table_name, c.region
FROM country c
JOIN who_air_quality w ON c.country_code = w.country_code
JOIN mortality_normalized m ON c.country_code = m.country_code;

-- Average WHO PM2.5 by income group
SELECT c.income_group, ROUND(AVG(w.pm25_concentration), 1) AS avg_pm25
FROM who_air_quality w
JOIN country c ON w.country_code = c.country_code
WHERE c.income_group IS NOT NULL
GROUP BY c.income_group;
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `ECONNREFUSED` or "Failed to fetch" | Backend not running. Run `cd Backend && node server.js` |
| `ER_NO_SUCH_TABLE` | Database not set up. Run `mysql -u root -p --local-infile=1 < schema.sql` |
| `Table has 0 rows` | CSVs not generated. Run `python3 transformData.py` first |
| `command not found: python` | Use `python3` on macOS |
| `local_infile disabled` | Run `mysql -u root -p -e "SET GLOBAL local_infile = 1;"` |
| Frontend on wrong port | Frontend runs on `:3001`, backend on `:3000` |
| Custom query blocked | Only `SELECT` is allowed — no write operations |

---

## Technologies

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Recharts, CSS (Glassmorphism) |
| Backend | Node.js, Express, mysql2, CORS |
| Database | MySQL 9.0 |
| ETL | Python 3, pandas |
| Schema | 9 tables in BCNF + 1 SQL VIEW |

---

## Authors

Rojin Ziaei
Mahsa Khoshnoodi
Georgetown University
