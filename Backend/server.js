const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const rootEnvPath = path.join(__dirname, '..', '.env');
const backendEnvPath = path.join(__dirname, '.env');
// Root .env first, then Backend/.env with override so Backend wins (fixes root .env having empty DB_PASSWORD=)
require('dotenv').config({ path: rootEnvPath });
require('dotenv').config({ path: backendEnvPath, override: true });

/**
 * Read KEY=value from a .env file line-by-line (handles BOM, CRLF, quotes).
 * Fallback when process.env is still empty (dotenv quirks / wrong line format).
 */
function readKeyFromEnvFile(key, filePath) {
  if (!fs.existsSync(filePath)) return '';
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*(.*)$`);
    const m = s.match(re);
    if (m) {
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return '';
}

/** First non-empty trimmed string (supports DB_* and MYSQL_* style .env files). */
function envPick(...candidates) {
  for (const v of candidates) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

// DB_* (README) or MYSQL_* (common alternate) — from process.env and raw file lines
const dbPassword = envPick(
  process.env.DB_PASSWORD,
  process.env.MYSQL_PASSWORD,
  readKeyFromEnvFile('DB_PASSWORD', backendEnvPath),
  readKeyFromEnvFile('MYSQL_PASSWORD', backendEnvPath),
  readKeyFromEnvFile('DB_PASSWORD', rootEnvPath),
  readKeyFromEnvFile('MYSQL_PASSWORD', rootEnvPath)
);

const dbHost = envPick(process.env.DB_HOST, process.env.MYSQL_HOST) || 'localhost';
const dbUser = envPick(process.env.DB_USER, process.env.MYSQL_USER) || 'root';
// Always schema.sql database — ignore DB_NAME / MYSQL_DATABASE in .env (prevents accidental wrong DB name)
const dbName = 'air_pollution';
const dbPort = Number.parseInt(
  envPick(process.env.DB_PORT, process.env.MYSQL_PORT) || '3306',
  10
) || 3306;

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/** Short TTL cache for heavy analytic query (static-ish data after ETL). ?refresh=1 bypasses. */
let dailyAirHealthQueryCache = { savedAt: 0, payload: null };
const DAILY_AIR_HEALTH_CACHE_MS = 90_000;

const db = mysql.createPool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Helper to send standardized responses
function sendQueryResponse(res, err, results, queryName, description, sourceMap, tablesUsed) {
  if (err) {
    console.error(`Error in ${queryName}:`, err);
    return res.status(500).json({
      error: 'Database query failed',
      details: err.message
    });
  }
  res.json({
    queryName,
    description,
    rowCount: results.length,
    sourceMap,
    tablesUsed,
    data: results
  });
}

// Source legend — matches schema.sql tables + health_impacts VIEW
app.get('/api/source-legend', (req, res) => {
  res.json({
    country:                    { label: 'Country Metadata',              color: '#7FB6E8' },
    indicator:                  { label: 'Health Indicators',              color: '#F28C8C' },
    aqi_reference:              { label: 'AQI Reference Lookup',          color: '#8CE89D' },
    city_aqi:                   { label: 'City AQI Data',                  color: '#B79AE8' },
    mortality_normalized:       { label: 'WB Mortality (Normalized)',      color: '#E8B67F' },
    oecd_normalized:            { label: 'OECD DALYs (Normalized)',       color: '#E87FB6' },
    mortality_wide_raw:         { label: 'Mortality Wide (Staging)',       color: '#8CB6E8' },
    who_air_quality:            { label: 'WHO Air Quality',              color: '#7FE8C8' },
    pm25_exposure_normalized:   { label: 'WB PM2.5 Exposure (µg/m³)',      color: '#9FE8A8' },
    health_impacts:             { label: 'Health Impacts (View)',          color: '#E8D67F' },
    city_air_health_daily:      { label: 'Daily City Air + Health',        color: '#A8E6CF' },
    population_density_category:{ label: 'Population Density Lookup',     color: '#FFD8A8' }
  });
});

// Query Catalog — multi-source & WB joins first; ROW_NUMBER / CTE / OECD self-join; then medium → simple
app.get('/api/query-catalog', (req, res) => {
  res.json([
    {
      id: 'multi-source-pm25-health-2019',
      title: 'Multi-Source PM2.5 & Health (2019)',
      endpoint: '/api/multi-source-pm25-health-2019',
      description: 'For 2019, line up national PM2.5, WHO city PM2.5, air-pollution mortality, and OECD burden—only where all four exist.',
      tables: ['country', 'pm25_exposure_normalized', 'mortality_normalized', 'oecd_normalized', 'who_air_quality']
    },
    {
      id: 'daily-air-health-worst-months-vs-wb-pm25',
      title: 'Daily Air–Health: Worst PM2.5 Months vs National WB (CTEs + windows)',
      endpoint: '/api/daily-air-health-worst-months-vs-wb-pm25',
      description: 'Show each city’s worst PM2.5 months next to national WB exposure for the same year (daily panel → monthly).',
      tables: ['city_air_health_daily', 'country', 'pm25_exposure_normalized']
    },
    {
      id: 'wb-pm25-vs-mortality',
      title: 'WB PM2.5 Exposure vs Air-Pollution Mortality (2019)',
      endpoint: '/api/wb-pm25-vs-mortality',
      description: 'Cross-indicator comparison for 2019: national PM2.5 mean exposure (EN.ATM.PM25.MC.M3) vs mortality attributed to air pollution (SH.STA.AIRP.P5), both from World Bank–derived tables.',
      tables: ['country', 'pm25_exposure_normalized', 'mortality_normalized']
    },
    {
      id: 'top-cities-per-region-aqi',
      title: 'Top 3 Cities by AQI per World Region',
      endpoint: '/api/top-cities-per-region-aqi',
      description: 'Uses a CTE plus ROW_NUMBER() OVER (PARTITION BY region …) to rank cities within each region by overall AQI and return only the top 3 per region — classic analytic SQL.',
      tables: ['city_aqi', 'country']
    },
    {
      id: 'wb-pm25-above-regional-average-2019',
      title: 'Countries Above Their Region’s Mean WB PM2.5 (2019, CTE)',
      endpoint: '/api/wb-pm25-above-regional-average-2019',
      description: 'CTE computes each region’s average EN.ATM.PM25 national exposure for 2019; outer query keeps countries strictly above that average with gap vs regional mean.',
      tables: ['country', 'pm25_exposure_normalized']
    },
    {
      id: 'oecd-daly-yoy-2018-2019',
      title: 'OECD PM2.5 DALY — change from 2018 to 2019',
      endpoint: '/api/oecd-daly-yoy-2018-2019',
      description: 'Self-join on oecd_normalized (2018 row ⟕ 2019 row per country) to compute how much each country’s DALY rate moved between those two years. Works on MySQL 5.7+. (Bundled WB SH mortality CSV only has 2019 filled — OECD has a 2010–2019 panel.)',
      tables: ['country', 'oecd_normalized']
    },
    {
      id: 'who-vs-mortality',
      title: 'WHO PM2.5 vs National Mortality',
      endpoint: '/api/who-vs-mortality',
      description: 'Cross-validates WHO city-level PM2.5 concentrations against World Bank national mortality rates by joining who_air_quality with mortality_normalized through the country table.',
      tables: ['who_air_quality', 'country', 'mortality_normalized']
    },
    {
      id: 'wb-pm25-by-region',
      title: 'WB PM2.5 Exposure by Region (latest year)',
      endpoint: '/api/wb-pm25-by-region',
      description: 'Average national mean PM2.5 exposure (µg/m³) from the World Bank API EN.ATM.PM25.MC.M3 series, aggregated by world region for the latest year in pm25_exposure_normalized.',
      tables: ['country', 'pm25_exposure_normalized']
    },
    {
      id: 'dual-source',
      title: 'Dual-Source Comparison (WB + OECD)',
      endpoint: '/api/dual-source',
      description: 'Finds countries that have data in BOTH World Bank mortality and OECD DALYs for 2019, joining the two separate normalized tables through the country table.',
      tables: ['country', 'mortality_normalized', 'oecd_normalized']
    },
    {
      id: 'city-vs-national',
      title: 'City AQI vs. National Mortality',
      endpoint: '/api/city-vs-national',
      description: 'Compares real-time city-level AQI readings with national mortality rates for the 50 most polluted cities by joining city_aqi with mortality_normalized.',
      tables: ['country', 'mortality_normalized', 'city_aqi']
    },
    {
      id: 'regional-hotspots',
      title: 'Regional Pollution Hotspots Count',
      endpoint: '/api/regional-hotspots',
      description: 'Counts how many cities in each world region have an overall AQI classified as Unhealthy or worse (>150).',
      tables: ['country', 'city_aqi', 'aqi_reference']
    },
    {
      id: 'category-aggregator',
      title: 'AQI Category Aggregator (Sub-Saharan Africa)',
      endpoint: '/api/category-aggregator',
      description: 'Shows the distribution of AQI categories across Sub-Saharan African cities with average pollutant breakdown per category.',
      tables: ['city_aqi', 'aqi_reference', 'country']
    },
    {
      id: 'oecd-dalys-income',
      title: 'OECD DALYs by Income Group (2019)',
      endpoint: '/api/oecd-dalys-income',
      description: 'Calculates the average DALYs lost to PM2.5 in 2019, grouped by country income level, querying the OECD-specific oecd_normalized table directly.',
      tables: ['country', 'oecd_normalized']
    },
    {
      id: 'who-regional-pm25',
      title: 'WHO PM2.5 Trends by Region',
      endpoint: '/api/who-regional-pm25',
      description: 'Average PM2.5 concentration by world region from WHO measurements, showing the geographic distribution of fine particulate matter.',
      tables: ['who_air_quality', 'country']
    },
    {
      id: 'global-health-snapshot',
      title: 'Global Health Snapshot (2019)',
      endpoint: '/api/global-health-snapshot',
      description: 'Shows the top 30 countries by mortality rate attributed to air pollution in 2019 using the World Bank mortality_normalized table joined with country metadata.',
      tables: ['country', 'mortality_normalized', 'indicator']
    },
    {
      id: 'hazardous-cities',
      title: 'Cities with Hazardous PM2.5 Levels',
      endpoint: '/api/hazardous-cities',
      description: 'Finds all cities where the PM2.5 AQI falls in the Hazardous range (>300) using a range-based JOIN between city_aqi and aqi_reference.',
      tables: ['city_aqi', 'aqi_reference', 'country']
    },
    {
      id: 'safest-high-income',
      title: 'Safest Cities in High-Income Nations',
      endpoint: '/api/safest-high-income',
      description: 'Returns the 20 cleanest cities in High-Income countries where overall AQI is classified as Good (≤50), showing all pollutant breakdowns.',
      tables: ['country', 'city_aqi', 'aqi_reference']
    }
  ]);
});

// ============================================================
// Q1 — Global Health Snapshot (2019)
//   Tables: country, mortality_normalized, indicator
//   WB mortality data exists for 231 countries in year=2019
// ============================================================
app.get('/api/global-health-snapshot', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name, c.region, c.income_group,
           m.impact_value AS mortality_rate_2019
    FROM country c
    JOIN mortality_normalized m ON c.country_code = m.country_code
    JOIN indicator i ON m.indicator_code = i.indicator_code
    WHERE i.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
      AND c.region IS NOT NULL
    ORDER BY m.impact_value DESC
    LIMIT 30;
  `;
  const sourceMap = {
    country_name: 'country', region: 'country',
    income_group: 'country', mortality_rate_2019: 'mortality_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Global Health Snapshot (2019)',
    'Top 30 countries by air pollution mortality.',
    sourceMap, ['country', 'mortality_normalized', 'indicator']));
});

// ============================================================
// Q2 — OECD DALYs by Income Group (2019)
//   Tables: country, oecd_normalized
//   OECD data: 212 countries, years 2010-2019
// ============================================================
app.get('/api/oecd-dalys-income', (req, res) => {
  const sql = `
    SELECT c.income_group,
           ROUND(AVG(o.obs_value), 2) AS avg_daly_lost,
           COUNT(DISTINCT o.country_code) AS countries_reporting
    FROM country c
    JOIN oecd_normalized o ON c.country_code = o.country_code
    WHERE o.year = 2019
      AND c.income_group IS NOT NULL
    GROUP BY c.income_group
    ORDER BY avg_daly_lost DESC;
  `;
  const sourceMap = {
    income_group: 'country', avg_daly_lost: 'oecd_normalized',
    countries_reporting: 'oecd_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'OECD DALYs by Income Group (2019)',
    'Average DALYs lost to PM2.5 by wealth group.',
    sourceMap, ['country', 'oecd_normalized']));
});

// ============================================================
// Q3 — Cities with Hazardous PM2.5 Levels
//   Tables: city_aqi, aqi_reference, country
//   52 cities have pm25_aqi_value > 300
// ============================================================
app.get('/api/hazardous-cities', (req, res) => {
  const sql = `
    SELECT a.city, c.table_name AS country, c.region,
           a.pm25_aqi_value, a.co_aqi_value, a.no2_aqi_value,
           r.category_name
    FROM city_aqi a
    JOIN aqi_reference r ON a.pm25_aqi_value BETWEEN r.min_value AND r.max_value
    LEFT JOIN country c ON a.country_code = c.country_code
    WHERE r.category_name = 'Hazardous'
    ORDER BY a.pm25_aqi_value DESC;
  `;
  const sourceMap = {
    city: 'city_aqi', country: 'country', region: 'country',
    pm25_aqi_value: 'city_aqi', co_aqi_value: 'city_aqi',
    no2_aqi_value: 'city_aqi', category_name: 'aqi_reference'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Cities with Hazardous PM2.5 Levels',
    'Cities where PM2.5 AQI exceeds 300.',
    sourceMap, ['city_aqi', 'aqi_reference', 'country']));
});

// ============================================================
// Q4 — Regional Pollution Hotspots Count
//   Tables: country, city_aqi, aqi_reference
//   1007 cities have AQI > 150
// ============================================================
app.get('/api/regional-hotspots', (req, res) => {
  const sql = `
    SELECT c.region, COUNT(a.city) AS severely_polluted_cities
    FROM country c
    JOIN city_aqi a ON c.country_code = a.country_code
    JOIN aqi_reference r ON a.aqi_value BETWEEN r.min_value AND r.max_value
    WHERE a.aqi_value > 150
      AND c.region IS NOT NULL
    GROUP BY c.region
    ORDER BY severely_polluted_cities DESC;
  `;
  const sourceMap = {
    region: 'country', severely_polluted_cities: 'city_aqi'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Regional Pollution Hotspots Count',
    'Cities with AQI > 150 per world region.',
    sourceMap, ['country', 'city_aqi', 'aqi_reference']));
});

// ============================================================
// Q5 — Safest Cities in High-Income Nations
//   Tables: city_aqi, country, aqi_reference
//   Plenty of Good AQI cities in High income countries
// ============================================================
app.get('/api/safest-high-income', (req, res) => {
  const sql = `
    SELECT a.city, c.table_name AS country_name, a.aqi_value,
           a.pm25_aqi_value, a.co_aqi_value, a.ozone_aqi_value, a.no2_aqi_value,
           r.category_name
    FROM city_aqi a
    JOIN country c ON a.country_code = c.country_code
    JOIN aqi_reference r ON a.aqi_value BETWEEN r.min_value AND r.max_value
    WHERE c.income_group = 'High income'
      AND r.category_name = 'Good'
    ORDER BY a.aqi_value ASC
    LIMIT 20;
  `;
  const sourceMap = {
    city: 'city_aqi', country_name: 'country', aqi_value: 'city_aqi',
    pm25_aqi_value: 'city_aqi', co_aqi_value: 'city_aqi',
    ozone_aqi_value: 'city_aqi', no2_aqi_value: 'city_aqi',
    category_name: 'aqi_reference'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Safest Cities in High-Income Nations',
    'Cleanest cities with full pollutant breakdown.',
    sourceMap, ['country', 'city_aqi', 'aqi_reference']));
});

// ============================================================
// Q6 — Dual-Source Comparison (WB + OECD)
//   Tables: country, mortality_normalized, oecd_normalized
//   WB has 2019, OECD has 2019 — many countries overlap
// ============================================================
app.get('/api/dual-source', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name, c.region,
           ROUND(m.impact_value, 2) AS wb_mortality_rate,
           ROUND(o.obs_value, 2) AS oecd_daly_rate
    FROM country c
    JOIN mortality_normalized m ON c.country_code = m.country_code
    JOIN oecd_normalized o ON c.country_code = o.country_code
    WHERE m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
      AND o.year = 2019
      AND c.region IS NOT NULL
    ORDER BY wb_mortality_rate DESC
    LIMIT 30;
  `;
  const sourceMap = {
    country_name: 'country', region: 'country',
    wb_mortality_rate: 'mortality_normalized',
    oecd_daly_rate: 'oecd_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Dual-Source Comparison (WB + OECD, 2019)',
    'Countries with both World Bank mortality and OECD DALYs data.',
    sourceMap, ['country', 'mortality_normalized', 'oecd_normalized']));
});

// ============================================================
// Q7 — City AQI vs. National Mortality
//   Tables: city_aqi, country, mortality_normalized
//   city_aqi.country joins to country.table_name
//   mortality_normalized has 2019 data
// ============================================================
app.get('/api/city-vs-national', (req, res) => {
  const sql = `
    SELECT a.city, c.table_name AS country,
           a.aqi_value AS city_current_aqi,
           ROUND(m.impact_value, 2) AS national_mortality_rate_2019
    FROM city_aqi a
    JOIN country c ON a.country_code = c.country_code
    JOIN mortality_normalized m ON c.country_code = m.country_code
    WHERE m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
    ORDER BY a.aqi_value DESC
    LIMIT 50;
  `;
  const sourceMap = {
    city: 'city_aqi', country: 'country',
    city_current_aqi: 'city_aqi',
    national_mortality_rate_2019: 'mortality_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'City AQI vs. National Mortality',
    'Top 50 most polluted cities vs their country mortality.',
    sourceMap, ['country', 'mortality_normalized', 'city_aqi']));
});

// ============================================================
// Q8 — WHO PM2.5 vs National Mortality
//   Tables: who_air_quality, country, mortality_normalized
//   Cross-validates WHO city-level PM2.5 against WB mortality
// ============================================================
app.get('/api/who-vs-mortality', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name, c.region,
           ROUND(AVG(w.pm25_concentration), 1) AS avg_who_pm25,
           ROUND(m.impact_value, 1) AS wb_mortality_rate
    FROM who_air_quality w
    JOIN country c ON w.country_code = c.country_code
    JOIN mortality_normalized m ON c.country_code = m.country_code
    WHERE m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
      AND w.pm25_concentration IS NOT NULL
      AND c.region IS NOT NULL
    GROUP BY c.country_code, c.table_name, c.region, m.impact_value
    ORDER BY avg_who_pm25 DESC
    LIMIT 30;
  `;
  const sourceMap = {
    country_name: 'country', region: 'country',
    avg_who_pm25: 'who_air_quality',
    wb_mortality_rate: 'mortality_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'WHO PM2.5 vs National Mortality',
    'WHO city PM2.5 averages vs WB mortality by country.',
    sourceMap, ['who_air_quality', 'country', 'mortality_normalized']));
});

// ============================================================
// Q9 — WHO PM2.5 Trends by Region
//   Tables: who_air_quality, country
// ============================================================
app.get('/api/who-regional-pm25', (req, res) => {
  const sql = `
    SELECT c.region,
           COUNT(DISTINCT w.city) AS cities_measured,
           ROUND(AVG(w.pm25_concentration), 1) AS avg_pm25,
           ROUND(AVG(w.no2_concentration), 1) AS avg_no2,
           ROUND(AVG(w.pm10_concentration), 1) AS avg_pm10
    FROM who_air_quality w
    JOIN country c ON w.country_code = c.country_code
    WHERE w.pm25_concentration IS NOT NULL
      AND c.region IS NOT NULL
    GROUP BY c.region
    ORDER BY avg_pm25 DESC;
  `;
  const sourceMap = {
    region: 'country', cities_measured: 'who_air_quality',
    avg_pm25: 'who_air_quality', avg_no2: 'who_air_quality',
    avg_pm10: 'who_air_quality'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'WHO PM2.5 Trends by Region',
    'Average pollutant concentrations from WHO measurements.',
    sourceMap, ['who_air_quality', 'country']));
});

// ============================================================
// Q10 — AQI Category Aggregator (Sub-Saharan Africa)
//   Tables: city_aqi, aqi_reference, country
//   Sub-Saharan Africa has hundreds of cities
// ============================================================
app.get('/api/category-aggregator', (req, res) => {
  const sql = `
    SELECT r.category_name,
           COUNT(a.city) AS number_of_cities,
           ROUND(AVG(a.pm25_aqi_value), 1) AS average_pm25,
           ROUND(AVG(a.co_aqi_value), 1) AS average_co,
           ROUND(AVG(a.no2_aqi_value), 1) AS average_no2,
           ROUND(AVG(a.ozone_aqi_value), 1) AS average_ozone
    FROM city_aqi a
    JOIN country c ON a.country_code = c.country_code
    JOIN aqi_reference r ON a.aqi_value BETWEEN r.min_value AND r.max_value
    WHERE c.region = 'Sub-Saharan Africa'
    GROUP BY r.category_name
    ORDER BY MIN(r.min_value) ASC;
  `;
  const sourceMap = {
    category_name: 'aqi_reference', number_of_cities: 'city_aqi',
    average_pm25: 'city_aqi', average_co: 'city_aqi',
    average_no2: 'city_aqi', average_ozone: 'city_aqi'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'AQI Category Aggregator (Sub-Saharan Africa)',
    'Category distribution with full pollutant averages.',
    sourceMap, ['city_aqi', 'aqi_reference', 'country']));
});

// ============================================================
// Q11 — WB PM2.5 exposure by region (API EN.ATM.PM25.MC.M3 → pm25_exposure_normalized)
// ============================================================
app.get('/api/wb-pm25-by-region', (req, res) => {
  const sql = `
    SELECT c.region,
           ROUND(AVG(p.pm25_exposure_ugm3), 2) AS avg_pm25_exposure_ugm3,
           COUNT(DISTINCT p.country_code) AS countries_reporting
    FROM pm25_exposure_normalized p
    JOIN country c ON p.country_code = c.country_code
    WHERE p.indicator_code = 'EN.ATM.PM25.MC.M3'
      AND p.year = (SELECT MAX(year) FROM pm25_exposure_normalized e WHERE e.indicator_code = 'EN.ATM.PM25.MC.M3')
      AND c.region IS NOT NULL
    GROUP BY c.region
    ORDER BY avg_pm25_exposure_ugm3 DESC;
  `;
  const sourceMap = {
    region: 'country',
    avg_pm25_exposure_ugm3: 'pm25_exposure_normalized',
    countries_reporting: 'pm25_exposure_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'WB PM2.5 Exposure by Region (latest year)',
    'Mean PM2.5 (µg/m³) by region from World Bank EN.ATM series.',
    sourceMap, ['country', 'pm25_exposure_normalized']));
});

// ============================================================
// Q12 — WB PM2.5 exposure vs mortality (2019, both WB indicators)
// ============================================================
app.get('/api/wb-pm25-vs-mortality', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name, c.region, c.income_group,
           ROUND(p.pm25_exposure_ugm3, 2) AS wb_pm25_exposure_ugm3,
           ROUND(m.impact_value, 2) AS wb_mortality_rate
    FROM pm25_exposure_normalized p
    JOIN country c ON p.country_code = c.country_code
    JOIN mortality_normalized m ON c.country_code = m.country_code
      AND m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
    WHERE p.indicator_code = 'EN.ATM.PM25.MC.M3'
      AND p.year = 2019
      AND c.region IS NOT NULL
    ORDER BY p.pm25_exposure_ugm3 DESC
    LIMIT 30;
  `;
  const sourceMap = {
    country_name: 'country', region: 'country', income_group: 'country',
    wb_pm25_exposure_ugm3: 'pm25_exposure_normalized',
    wb_mortality_rate: 'mortality_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'WB PM2.5 Exposure vs Air-Pollution Mortality (2019)',
    'National PM2.5 mean (EN) vs mortality rate (SH) for the same year.',
    sourceMap, ['country', 'pm25_exposure_normalized', 'mortality_normalized']));
});

// ============================================================
// Q13 — Complex multi-source join (EN PM2.5 + SH mortality + OECD DALY + WHO cities)
//   Meaning: same country, 2019 — national modeled PM2.5 vs WHO urban PM2.5 vs health burdens
// ============================================================
app.get('/api/multi-source-pm25-health-2019', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name,
           c.region,
           c.income_group,
           ROUND(p.pm25_exposure_ugm3, 2) AS en_wb_national_pm25_ugm3,
           ROUND(w.avg_who_city_pm25, 1) AS who_avg_city_pm25_ugm3,
           ROUND(m.impact_value, 2) AS sh_wb_mortality_per_100k,
           ROUND(o.obs_value, 2) AS oecd_daly_pm25
    FROM country c
    INNER JOIN pm25_exposure_normalized p
      ON c.country_code = p.country_code
      AND p.indicator_code = 'EN.ATM.PM25.MC.M3'
      AND p.year = 2019
    INNER JOIN mortality_normalized m
      ON c.country_code = m.country_code
      AND m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
    INNER JOIN oecd_normalized o
      ON c.country_code = o.country_code
      AND o.year = 2019
    INNER JOIN (
      SELECT country_code, AVG(pm25_concentration) AS avg_who_city_pm25
      FROM who_air_quality
      WHERE pm25_concentration IS NOT NULL
      GROUP BY country_code
    ) w ON c.country_code = w.country_code
    WHERE c.region IS NOT NULL
    ORDER BY p.pm25_exposure_ugm3 DESC
    LIMIT 35;
  `;
  const sourceMap = {
    country_name: 'country',
    region: 'country',
    income_group: 'country',
    en_wb_national_pm25_ugm3: 'pm25_exposure_normalized',
    who_avg_city_pm25_ugm3: 'who_air_quality',
    sh_wb_mortality_per_100k: 'mortality_normalized',
    oecd_daly_pm25: 'oecd_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Multi-Source PM2.5 & Health (2019)',
    'For 2019, line up national PM2.5, WHO city PM2.5, air-pollution mortality, and OECD burden—only where all four exist.',
    sourceMap,
    ['country', 'pm25_exposure_normalized', 'mortality_normalized', 'oecd_normalized', 'who_air_quality']));
});

// ============================================================
// Q13b — city_air_health_daily: monthly rollups, windows, vs WB national PM2.5
//   CTEs + ROW_NUMBER + AVG(...) OVER (ROWS frame) + FK to population_density_category
// ============================================================
app.get('/api/daily-air-health-worst-months-vs-wb-pm25', (req, res) => {
  const bypassCache = req.query.refresh === '1' || req.query.refresh === 'true';
  const now = Date.now();
  if (
    !bypassCache &&
    dailyAirHealthQueryCache.payload &&
    now - dailyAirHealthQueryCache.savedAt < DAILY_AIR_HEALTH_CACHE_MS
  ) {
    return res.json({ ...dailyAirHealthQueryCache.payload, cached: true, cacheAgeMs: now - dailyAirHealthQueryCache.savedAt });
  }

  const sql = `
    WITH monthly AS (
      SELECT c.table_name AS country_name,
             h.country_code,
             h.city,
             c.region,
             c.income_group,
             h.cal_year,
             h.cal_ym,
             ROUND(AVG(h.pm2_5), 2) AS avg_pm25_ugm3,
             ROUND(AVG(h.aqi), 1) AS avg_aqi,
             SUM(h.hospital_admissions) AS admissions_sum,
             COUNT(*) AS days_observed,
             GROUP_CONCAT(DISTINCT h.density_category SEPARATOR ', ') AS density_mix
      FROM city_air_health_daily h
      INNER JOIN country c ON c.country_code = h.country_code
      WHERE c.region IS NOT NULL
      GROUP BY c.table_name, h.country_code, h.city, c.region, c.income_group,
               h.cal_year, h.cal_ym
    ),
    ranked AS (
      SELECT m.*,
             ROW_NUMBER() OVER (PARTITION BY m.city, m.cal_year ORDER BY m.avg_pm25_ugm3 DESC) AS pm25_worst_month_rank,
             AVG(m.avg_pm25_ugm3) OVER (
               PARTITION BY m.city
               ORDER BY m.cal_ym
               ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
             ) AS pm25_trailing_3mo_avg
      FROM monthly m
    )
    SELECT r.city,
           r.country_name,
           r.region,
           r.income_group,
           r.cal_ym AS \`year_month\`,
           r.cal_year AS yr,
           r.avg_pm25_ugm3,
           r.avg_aqi,
           r.admissions_sum,
           r.days_observed,
           r.density_mix,
           r.pm25_worst_month_rank,
           ROUND(r.pm25_trailing_3mo_avg, 2) AS pm25_trailing_3mo_avg,
           ROUND(p.pm25_exposure_ugm3, 2) AS wb_national_pm25_ugm3
    FROM ranked r
    LEFT JOIN pm25_exposure_normalized p
      ON p.country_code = r.country_code
      AND p.indicator_code = 'EN.ATM.PM25.MC.M3'
      AND p.year = r.cal_year
    WHERE r.pm25_worst_month_rank <= 2
    ORDER BY r.city, r.cal_ym;
  `;
  const sourceMap = {
    city: 'city_air_health_daily',
    country_name: 'country',
    region: 'country',
    income_group: 'country',
    year_month: 'city_air_health_daily',
    yr: 'city_air_health_daily',
    avg_pm25_ugm3: 'city_air_health_daily',
    avg_aqi: 'city_air_health_daily',
    admissions_sum: 'city_air_health_daily',
    days_observed: 'city_air_health_daily',
    density_mix: 'city_air_health_daily',
    pm25_worst_month_rank: 'city_air_health_daily',
    pm25_trailing_3mo_avg: 'city_air_health_daily',
    wb_national_pm25_ugm3: 'pm25_exposure_normalized'
  };
  db.query(sql, (err, results) => {
    if (err) {
      return sendQueryResponse(res, err, results,
        'Daily Air–Health: Worst PM2.5 Months vs National WB',
        'Show each city’s worst PM2.5 months next to national WB exposure for the same year (daily panel → monthly).',
        sourceMap,
        ['city_air_health_daily', 'country', 'pm25_exposure_normalized']);
    }
    const payload = {
      queryName: 'Daily Air–Health: Worst PM2.5 Months vs National WB',
      description:
        'Show each city’s worst PM2.5 months next to national WB exposure for the same year (daily panel → monthly).',
      rowCount: results.length,
      sourceMap,
      tablesUsed: ['city_air_health_daily', 'country', 'pm25_exposure_normalized'],
      data: results,
      cached: false
    };
    dailyAirHealthQueryCache = { savedAt: Date.now(), payload };
    res.json(payload);
  });
});

// ============================================================
// Q14 — Top N cities by AQI within each region (CTE + ROW_NUMBER window)
//   Requires MySQL 8+ (window functions)
// ============================================================
app.get('/api/top-cities-per-region-aqi', (req, res) => {
  const sql = `
    WITH city_regions AS (
      SELECT a.city,
             a.country_code,
             a.aqi_value,
             c.region,
             c.table_name AS country_name
      FROM city_aqi a
      JOIN country c ON a.country_code = c.country_code
      WHERE c.region IS NOT NULL
        AND a.aqi_value IS NOT NULL
    ),
    ranked AS (
      SELECT city,
             country_code,
             aqi_value,
             region,
             country_name,
             ROW_NUMBER() OVER (PARTITION BY region ORDER BY aqi_value DESC) AS rank_in_region
      FROM city_regions
    )
    SELECT region,
           country_name,
           city,
           aqi_value,
           rank_in_region,
           CONCAT(city, ' (', region, ', #', rank_in_region, ')') AS plot_label
    FROM ranked
    WHERE rank_in_region <= 3
    ORDER BY region, aqi_value DESC;
  `;
  const sourceMap = {
    region: 'country',
    country_name: 'country',
    city: 'city_aqi',
    aqi_value: 'city_aqi',
    rank_in_region: 'city_aqi',
    plot_label: 'country'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Top 3 Cities by AQI per Region',
    'ROW_NUMBER() partitioned by region — top AQI cities per world region.',
    sourceMap, ['country', 'city_aqi']));
});

// ============================================================
// Q15 — Countries with WB PM2.5 above their region’s average (CTE + join)
// ============================================================
app.get('/api/wb-pm25-above-regional-average-2019', (req, res) => {
  const sql = `
    WITH regional_avg AS (
      SELECT c.region,
             AVG(p.pm25_exposure_ugm3) AS region_avg_pm25
      FROM pm25_exposure_normalized p
      JOIN country c ON p.country_code = c.country_code
      WHERE p.indicator_code = 'EN.ATM.PM25.MC.M3'
        AND p.year = 2019
        AND c.region IS NOT NULL
      GROUP BY c.region
    )
    SELECT c.table_name AS country_name,
           c.region,
           ROUND(p.pm25_exposure_ugm3, 2) AS country_pm25,
           ROUND(r.region_avg_pm25, 2) AS regional_avg_pm25,
           ROUND(p.pm25_exposure_ugm3 - r.region_avg_pm25, 2) AS gap_vs_region
    FROM pm25_exposure_normalized p
    JOIN country c ON p.country_code = c.country_code
    JOIN regional_avg r ON c.region = r.region
    WHERE p.indicator_code = 'EN.ATM.PM25.MC.M3'
      AND p.year = 2019
      AND p.pm25_exposure_ugm3 > r.region_avg_pm25
    ORDER BY gap_vs_region DESC
    LIMIT 40;
  `;
  const sourceMap = {
    country_name: 'country',
    region: 'country',
    country_pm25: 'pm25_exposure_normalized',
    regional_avg_pm25: 'pm25_exposure_normalized',
    gap_vs_region: 'pm25_exposure_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'WB PM2.5 Above Regional Average (2019)',
    'CTE for regional mean EN exposure; countries strictly above their region’s average.',
    sourceMap, ['country', 'pm25_exposure_normalized']));
});

// ============================================================
// Q16 — OECD DALY change 2018→2019 (self-join, no window). Legacy path kept for old bookmarks.
// ============================================================
function handleOecdDalyYoy2018To2019(req, res) {
  const sql = `
    SELECT c.table_name AS country_name,
           c.region,
           m19.year AS year,
           ROUND(m19.obs_value, 3) AS daly_rate,
           ROUND(m18.obs_value, 3) AS prior_year_daly,
           ROUND(m19.obs_value - m18.obs_value, 3) AS yoy_change
    FROM oecd_normalized m18
    INNER JOIN oecd_normalized m19
      ON m18.country_code = m19.country_code
     AND m18.year = 2018
     AND m19.year = 2019
    JOIN country c ON m19.country_code = c.country_code
    WHERE c.region IS NOT NULL
    ORDER BY ABS(m19.obs_value - m18.obs_value) DESC
    LIMIT 35;
  `;
  const sourceMap = {
    country_name: 'country',
    region: 'country',
    year: 'oecd_normalized',
    daly_rate: 'oecd_normalized',
    prior_year_daly: 'oecd_normalized',
    yoy_change: 'oecd_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'OECD PM2.5 DALY — change from 2018 to 2019',
    'Self-join oecd_normalized (2018 ⟕ 2019); countries ranked by largest absolute change between the two years. (WB SH file in this repo has 2019-only values.)',
    sourceMap, ['country', 'oecd_normalized']));
}

app.get('/api/oecd-daly-yoy-2018-2019', handleOecdDalyYoy2018To2019);
/** @deprecated Use `/api/oecd-daly-yoy-2018-2019` — same JSON; old path name (removed from catalog). */
app.get('/api/mortality-yoy-change-2018-2019', handleOecdDalyYoy2018To2019);

// ============================================================
// Health check — use to verify API + MySQL (browser or curl)
app.get('/api/health', (req, res) => {
  db.query('SELECT 1 AS ok', (err) => {
    if (err) {
      return res.status(503).json({
        ok: false,
        database: false,
        details: err.message
      });
    }
    res.json({
      ok: true,
      database: true,
      databaseName: dbName
    });
  });
});

// Custom Query Endpoint — accepts user-written SQL
// Only SELECT statements allowed for safety
// ============================================================
app.post('/api/custom-query', (req, res) => {
  const { sql } = req.body;

  if (!sql || !sql.trim()) {
    return res.status(400).json({ error: 'No SQL query provided.' });
  }

  // Block anything that isn't a SELECT
  const forbidden = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)/i;
  if (forbidden.test(sql.trim())) {
    return res.status(403).json({ error: 'Only SELECT queries are allowed.' });
  }

  // Add LIMIT if not present to prevent huge result sets
  const hasLimit = /\bLIMIT\b/i.test(sql);
  const safeSql = hasLimit ? sql : `${sql.replace(/;\s*$/, '')} LIMIT 200`;

  db.query(safeSql, (err, results) => {
    if (err) {
      return res.status(400).json({
        error: 'Query execution failed',
        details: err.sqlMessage || err.message
      });
    }
    res.json({
      queryName: 'Custom Query',
      description: sql.trim(),
      rowCount: results.length,
      columns: results.length > 0 ? Object.keys(results[0]) : [],
      data: results
    });
  });
});

app.listen(port, () => {
  console.log(`AirLense API running at http://localhost:${port}`);
  db.query('SELECT 1', (err) => {
    if (err) {
      console.error('[DB] Connection failed:', err.message);
      const pwdSet = dbPassword.length > 0;
      if (
        !pwdSet &&
        /using password:\s*NO/i.test(String(err.message))
      ) {
        const dbLen = readKeyFromEnvFile('DB_PASSWORD', backendEnvPath).length;
        const myLen = readKeyFromEnvFile('MYSQL_PASSWORD', backendEnvPath).length;
        console.error(
          '[DB] No password reached mysql2. Use either DB_PASSWORD=... or MYSQL_PASSWORD=... in Backend/.env'
        );
        console.error('[DB] Files:', {
          rootDotEnv: fs.existsSync(rootEnvPath),
          backendDotEnv: fs.existsSync(backendEnvPath)
        });
        console.error(
          '[DB] Parsed from Backend/.env — DB_PASSWORD length:',
          dbLen,
          'MYSQL_PASSWORD length:',
          myLen
        );
      } else {
        console.error('[DB] Check host/user/password/database and that schema exists (run schema.sql for air_pollution).');
      }
    } else {
      console.log('[DB] MySQL OK — database:', dbName);
    }
  });
});