# Climate Intelligence Dashboard

A full-stack data dashboard that integrates multiple international datasets to analyze the relationship between air pollution, health outcomes, and economic context.

The system combines data from the **World Bank, WHO, OECD, and AQI sources** into a unified relational database and exposes analytical queries through a web interface.

---

## Project Overview

Air pollution is one of the largest environmental health risks worldwide. However, understanding its impacts requires integrating data from many different sources.

This project builds a **multi-source environmental intelligence system** that:

- integrates global pollution datasets
- normalizes schemas across sources
- stores them in a relational database
- exposes analytical queries through a backend API
- visualizes insights through a web dashboard

The dashboard allows users to explore patterns such as:

- pollution exposure across income groups
- cities with severe air quality
- links between pollution and mortality
- health burden across regions

---

## System Architecture

```
Datasets
   ↓
MySQL Database
   ↓
Node.js + Express API
   ↓
React Dashboard
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

The system integrates multiple datasets:

| Source | Data Type |
|------|------|
| WHO Air Quality Database | PM2.5 / NO2 city-level pollution |
| World Bank | Mortality from air pollution |
| OECD | Health burden indicators |
| City AQI dataset | Real-time pollution indices |
| Country Metadata | Region and income group |

These datasets were **cleaned and unified** using shared country codes.

---

## Database Design

The database (`air_pollution`) includes the following core tables (BCNF normalized):

- `country` – Country metadata (region, income group)
- `indicator` – Indicator definitions
- `health_impacts` – Unified mortality + OECD DALYs
- `city_aqi` – City-level AQI data
- `aqi_reference` – AQI category thresholds
- `mortality_normalized` – World Bank mortality (long format)
- `oecd_normalized` – OECD health burden

The schema is designed in **BCNF** and supports multi-table joins for analytical queries.

---

## Example Analytical Queries

The dashboard includes several "canned queries":

### 1. Mortality and PM2.5 by Income Group
Compares air pollution exposure and mortality rates across economic categories.

**Insight:**  
Lower-income countries experience significantly higher pollution exposure and mortality.

Tables used:

- World Bank Mortality
- WHO Air Quality
- Country Metadata

---

### 2. High Pollution and High Mortality Countries
Identifies countries where pollution exposure and mortality are both high.

Tables used:

- WHO Air Quality
- World Bank Mortality
- Country Metadata

---

### 3. AQI and WHO Cross-Validation
Finds cities where both AQI data and WHO pollution measurements indicate severe pollution.

Tables used:

- City AQI
- WHO Air Quality
- Country Metadata

---

### 4. Health Burden and Pollution Mortality
Links national pollution mortality with broader health system burden.

Tables used:

- World Bank Mortality
- OECD Health Burden
- Country Metadata

---

## Features

- Interactive dashboard
- Multi-source data integration
- SQL joins across multiple datasets
- Chart visualization
- Source attribution for each metric
- Insight explanations for each query

---

## Running the Project

### Backend

```
cd Backend
npm install
node server.js
```

Backend runs on:

```
http://localhost:3000
```

---

### Frontend

```
cd Frontend
npm install
npm start
```

Frontend runs on:

```
http://localhost:3001
```

---

## Example Dashboard

The dashboard shows:

- pollution vs mortality trends
- income-group comparisons
- city-level pollution hotspots
- regional health burden

Charts are generated dynamically from SQL query results.

## Dashboard Preview

![Dashboard](dashboard.png)
---

## Technologies

- React
- Node.js
- Express
- MySQL
- Recharts
- SQL
- Glassmorphism UI design

---

## Author

Rojin Ziaei  
Mahsa Khoshnoodi
Georgetown University
