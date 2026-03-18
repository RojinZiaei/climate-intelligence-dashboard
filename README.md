# Climate Intelligence Dashboard

A full-stack data dashboard that integrates multiple international datasets to analyze the relationship between air pollution, health outcomes, and economic context.

The system combines data from the **World Bank, WHO, OECD, and AQI sources** into a unified relational database normalized to **BCNF**, and exposes analytical queries through a web interface.

---

## Project Overview

Air pollution is one of the largest environmental health risks worldwide. However, understanding its impacts requires integrating data from many different sources.

This project builds a **multi-source environmental intelligence system** that:

- integrates global pollution datasets
- normalizes schemas across sources to **BCNF**
- stores them in a relational database (MySQL)
- exposes analytical queries through a backend API
- visualizes insights through a web dashboard

The dashboard allows users to explore patterns such as:

- pollution exposure across income groups
- cities with severe air quality
- links between pollution and mortality
- health burden across regions
- decade-long trends in DALYs

---

## System Architecture

```
Raw Datasets (World Bank, OECD, WHO, AQI)
   ↓
Python ETL (transformData.py)
   ↓
7 BCNF CSV Files
   ↓
MySQL Database (8 tables: 7 base + 1 VIEW)
   ↓
Node.js + Express API (10 canned queries)
   ↓
React + Recharts Dashboard
```

### Backend
- Node.js
- Express
- MySQL
- SQL joins across multiple datasets

### Frontend
- React
- Recharts 
- Glassmorphism UI styling

---

## Data Sources

| Source | Data Type |
|--------|-----------|
| World Bank | Mortality rate attributed to air pollution |
| OECD | Disability-adjusted life years (DALYs) from PM2.5 |
| City AQI dataset | City-level AQI with 5 pollutant types |
| Country Metadata | Region and income group classification |

These datasets were **cleaned, unpivoted, and unified** using shared country codes.

---

## Database Design (BCNF — 8 Tables)

| # | Table | Type | Primary Key | Description |
|---|-------|------|-------------|-------------|
| 1 | `country` | table | `country_code` | Country metadata: region, income group, special notes |
| 2 | `indicator` | table | `indicator_code` | Health indicator definitions and source organization |
| 3 | `aqi_reference` | table | `category_name` | AQI category lookup (Good → Hazardous with value ranges) |
| 4 | `city_aqi` | table | `(country, city, lat, lng)` | City-level AQI with 5 pollutant columns |
| 5 | `mortality_normalized` | table | `(country_code, indicator_code, year)` | World Bank mortality data (unpivoted) |
| 6 | `oecd_normalized` | table | `(ref_area, time_period)` | OECD DALYs data (native column names) |
| 7 | `mortality_wide_raw` | table | `(country_code, indicator_code)` | Staging table (wide format, year columns) |
| 8 | `health_impacts` | **VIEW** | — | UNION of `mortality_normalized` + `oecd_normalized` |

The schema is designed in **BCNF** — every determinant is a candidate key.

Key design decisions:
- **AQI categories removed from city_aqi** to eliminate transitive dependencies (category depends on value, not city). Use `aqi_reference` for lookups via range-based JOINs.
- **WB and OECD data stored separately** in source-specific normalized tables. The `health_impacts` VIEW unions them for cross-source queries.
- **`mortality_wide_raw`** preserves the original wide-format staging data (years as columns).

---

## Canned Queries (10 Analytical Queries)

### Q1 — Global Health Snapshot (2019)
Top 30 countries by air pollution mortality rate.
**Tables:** `country`, `mortality_normalized`, `indicator`

### Q2 — OECD DALYs by Income Group
Average DALYs lost to PM2.5, grouped by country wealth level.
**Tables:** `country`, `oecd_normalized`

### Q3 — Cities with Hazardous PM2.5 Levels
Cities where PM2.5 AQI exceeds 300, using range-based JOIN.
**Tables:** `city_aqi`, `aqi_reference`, `country`

### Q4 — Regional Pollution Hotspots
Count of cities with AQI > 150 per world region.
**Tables:** `country`, `city_aqi`, `aqi_reference`

### Q5 — OECD Decade Trend (2010 vs 2019)
DALY rate changes over a decade using a self-join on `oecd_normalized`.
**Tables:** `country`, `oecd_normalized`

### Q6 — Safest Cities in High-Income Nations
Cleanest cities with full pollutant breakdown.
**Tables:** `country`, `city_aqi`, `aqi_reference`

### Q7 — Dual-Source Comparison (WB + OECD)
Countries with data in both sources, cross-joining both normalized tables.
**Tables:** `country`, `mortality_normalized`, `oecd_normalized`

### Q8 — City AQI vs. National Mortality
Top 50 most polluted cities compared with their country's mortality rate.
**Tables:** `country`, `mortality_normalized`, `city_aqi`

### Q9 — Health Data Coverage Check
Record counts per region and source, queried through the `health_impacts` VIEW.
**Tables:** `country`, `health_impacts` (VIEW), `indicator`

### Q10 — AQI Category Aggregator (Sub-Saharan Africa)
Distribution of AQI categories with average pollutant levels.
**Tables:** `city_aqi`, `aqi_reference`, `country`

---

## Features

- Interactive dashboard with 10 canned queries
- Multi-source data integration (World Bank + OECD + AQI)
- 8-table BCNF-normalized schema with a SQL VIEW
- SQL joins: inner, left, self-joins, range-based, and cross-source
- Recharts bar chart visualization with source color-coding
- Column-level data provenance (each field color-coded by source table)
- Typing animation for query descriptions
- Responsive glassmorphism UI

---

## Running the Project

### 1. Generate CSVs (requires raw data files)

```
python3 transformData.py
```

### 2. Create database and load data

```
mysql -u root -p < schema.sql
```

### 3. Start the backend

```
cd Backend
npm install
node server.js
```

Backend runs on: `http://localhost:3000`

### 4. Start the frontend

```
npm install
npm start
```

Frontend runs on: `http://localhost:3001`

---

## Dashboard Preview

![Dashboard](dashboard.png)

---

## Technologies

- React
- Node.js
- Express
- MySQL
- Recharts
- Python (pandas)
- SQL
- Glassmorphism UI design

---

## Future Improvements

- Add climate datasets (temperature / CO₂)
- Integrate satellite pollution measurements
- Allow user-defined SQL queries
- Deploy the dashboard online

---

## Authors

Rojin Ziaei
Mahsa Khoshnoodi
Georgetown University
