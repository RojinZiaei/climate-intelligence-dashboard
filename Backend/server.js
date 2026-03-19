const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'shirin ebadi',
  database: 'air_pollution',
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

// Source Legend for all 8 tables + 1 view
app.get('/api/source-legend', (req, res) => {
  res.json({
    country:               { label: 'Country Metadata',             color: '#7FB6E8' },
    indicator:             { label: 'Health Indicators',             color: '#F28C8C' },
    aqi_reference:         { label: 'AQI Reference Lookup',         color: '#8CE89D' },
    city_aqi:              { label: 'City AQI Data',                 color: '#B79AE8' },
    mortality_normalized:  { label: 'WB Mortality (Normalized)',     color: '#E8B67F' },
    oecd_normalized:       { label: 'OECD DALYs (Normalized)',       color: '#E87FB6' },
    mortality_wide_raw:    { label: 'Mortality Wide (Staging)',       color: '#8CB6E8' },
    who_air_quality:       { label: 'WHO Air Quality',                color: '#7FE8C8' },
    health_impacts:        { label: 'Health Impacts (View)',          color: '#E8D67F' }
  });
});

// Query Catalog
app.get('/api/query-catalog', (req, res) => {
  res.json([
    {
      id: 'global-health-snapshot',
      title: 'Global Health Snapshot (2019)',
      endpoint: '/api/global-health-snapshot',
      description: 'Shows the top 30 countries by mortality rate attributed to air pollution in 2019 using the World Bank mortality_normalized table joined with country metadata.',
      tables: ['country', 'mortality_normalized', 'indicator']
    },
    {
      id: 'oecd-dalys-income',
      title: 'OECD DALYs by Income Group (2019)',
      endpoint: '/api/oecd-dalys-income',
      description: 'Calculates the average DALYs lost to PM2.5 in 2019, grouped by country income level, querying the OECD-specific oecd_normalized table directly.',
      tables: ['country', 'oecd_normalized']
    },
    {
      id: 'hazardous-cities',
      title: 'Cities with Hazardous PM2.5 Levels',
      endpoint: '/api/hazardous-cities',
      description: 'Finds all cities where the PM2.5 AQI falls in the Hazardous range (>300) using a range-based JOIN between city_aqi and aqi_reference.',
      tables: ['city_aqi', 'aqi_reference', 'country']
    },
    {
      id: 'regional-hotspots',
      title: 'Regional Pollution Hotspots Count',
      endpoint: '/api/regional-hotspots',
      description: 'Counts how many cities in each world region have an overall AQI classified as Unhealthy or worse (>150).',
      tables: ['country', 'city_aqi', 'aqi_reference']
    },
    {
      id: 'decade-trend',
      title: 'OECD Decade Trend (2010 vs 2019)',
      endpoint: '/api/decade-trend',
      description: 'Compares OECD DALY rates between 2010 and 2019 for European countries using a self-join on oecd_normalized to show improvement or decline over a decade.',
      tables: ['country', 'oecd_normalized']
    },
    {
      id: 'safest-high-income',
      title: 'Safest Cities in High-Income Nations',
      endpoint: '/api/safest-high-income',
      description: 'Returns the 20 cleanest cities in High-Income countries where overall AQI is classified as Good (≤50), showing all pollutant breakdowns.',
      tables: ['country', 'city_aqi', 'aqi_reference']
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
      id: 'health-data-coverage',
      title: 'Health Data Coverage Check',
      endpoint: '/api/health-data-coverage',
      description: 'Counts health records per region and data source by querying the health_impacts VIEW, which internally unions mortality_normalized and oecd_normalized.',
      tables: ['country', 'health_impacts', 'indicator']
    },
    {
      id: 'who-vs-mortality',
      title: 'WHO PM2.5 vs National Mortality',
      endpoint: '/api/who-vs-mortality',
      description: 'Cross-validates WHO city-level PM2.5 concentrations against World Bank national mortality rates by joining who_air_quality with mortality_normalized through the country table.',
      tables: ['who_air_quality', 'country', 'mortality_normalized']
    },
    {
      id: 'who-regional-pm25',
      title: 'WHO PM2.5 Trends by Region',
      endpoint: '/api/who-regional-pm25',
      description: 'Average PM2.5 concentration by world region from WHO measurements, showing the geographic distribution of fine particulate matter.',
      tables: ['who_air_quality', 'country']
    },
    {
      id: 'category-aggregator',
      title: 'AQI Category Aggregator (Sub-Saharan Africa)',
      endpoint: '/api/category-aggregator',
      description: 'Shows the distribution of AQI categories across Sub-Saharan African cities with average pollutant breakdown per category.',
      tables: ['city_aqi', 'aqi_reference', 'country']
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
           COUNT(DISTINCT o.ref_area) AS countries_reporting
    FROM country c
    JOIN oecd_normalized o ON c.country_code = o.ref_area
    WHERE o.time_period = 2019
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
    SELECT a.city, a.country, c.region,
           a.pm25_aqi_value, a.co_aqi_value, a.no2_aqi_value,
           r.category_name
    FROM city_aqi a
    JOIN aqi_reference r ON a.pm25_aqi_value BETWEEN r.min_value AND r.max_value
    LEFT JOIN country c ON a.country = c.table_name
    WHERE r.category_name = 'Hazardous'
    ORDER BY a.pm25_aqi_value DESC;
  `;
  const sourceMap = {
    city: 'city_aqi', country: 'city_aqi', region: 'country',
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
    JOIN city_aqi a ON c.table_name = a.country
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
// Q5 — OECD Decade Trend (2010 vs 2019)
//   Tables: country, oecd_normalized (self-join)
//   OECD has data for both 2010 and 2019 (212 countries each)
// ============================================================
app.get('/api/decade-trend', (req, res) => {
  const sql = `
    SELECT c.table_name AS country_name,
           ROUND(o2010.obs_value, 2) AS daly_2010,
           ROUND(o2019.obs_value, 2) AS daly_2019,
           ROUND(o2019.obs_value - o2010.obs_value, 2) AS ten_year_change
    FROM country c
    JOIN oecd_normalized o2010 ON c.country_code = o2010.ref_area
    JOIN oecd_normalized o2019 ON c.country_code = o2019.ref_area
    WHERE c.region = 'Europe & Central Asia'
      AND o2010.time_period = 2010
      AND o2019.time_period = 2019
      AND c.income_group IS NOT NULL
    ORDER BY ten_year_change ASC
    LIMIT 20;
  `;
  const sourceMap = {
    country_name: 'country', daly_2010: 'oecd_normalized',
    daly_2019: 'oecd_normalized', ten_year_change: 'oecd_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'OECD Decade Trend (2010 vs 2019)',
    'DALYs change over a decade in Europe & Central Asia.',
    sourceMap, ['country', 'oecd_normalized']));
});

// ============================================================
// Q6 — Safest Cities in High-Income Nations
//   Tables: city_aqi, country, aqi_reference
//   Plenty of Good AQI cities in High income countries
// ============================================================
app.get('/api/safest-high-income', (req, res) => {
  const sql = `
    SELECT a.city, c.table_name AS country_name, a.aqi_value,
           a.pm25_aqi_value, a.co_aqi_value, a.ozone_aqi_value, a.no2_aqi_value,
           r.category_name
    FROM city_aqi a
    JOIN country c ON a.country = c.table_name
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
// Q7 — Dual-Source Comparison (WB + OECD)
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
    JOIN oecd_normalized o ON c.country_code = o.ref_area
    WHERE m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
      AND o.time_period = 2019
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
// Q8 — City AQI vs. National Mortality
//   Tables: city_aqi, country, mortality_normalized
//   city_aqi.country joins to country.table_name
//   mortality_normalized has 2019 data
// ============================================================
app.get('/api/city-vs-national', (req, res) => {
  const sql = `
    SELECT a.city, a.country,
           a.aqi_value AS city_current_aqi,
           ROUND(m.impact_value, 2) AS national_mortality_rate_2019
    FROM city_aqi a
    JOIN country c ON a.country = c.table_name
    JOIN mortality_normalized m ON c.country_code = m.country_code
    WHERE m.indicator_code = 'SH.STA.AIRP.P5'
      AND m.year = 2019
    ORDER BY a.aqi_value DESC
    LIMIT 50;
  `;
  const sourceMap = {
    city: 'city_aqi', country: 'city_aqi',
    city_current_aqi: 'city_aqi',
    national_mortality_rate_2019: 'mortality_normalized'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'City AQI vs. National Mortality',
    'Top 50 most polluted cities vs their country mortality.',
    sourceMap, ['country', 'mortality_normalized', 'city_aqi']));
});

// ============================================================
// Q9 — Health Data Coverage Check
//   Tables: country, health_impacts (VIEW), indicator
//   The VIEW unions mortality_normalized + oecd_normalized
// ============================================================
app.get('/api/health-data-coverage', (req, res) => {
  const sql = `
    SELECT c.region, i.source_organization AS source,
           COUNT(h.impact_value) AS total_records,
           MIN(h.year) AS earliest_data,
           MAX(h.year) AS latest_data
    FROM country c
    JOIN health_impacts h ON c.country_code = h.country_code
    JOIN indicator i ON h.indicator_code = i.indicator_code
    WHERE c.region IS NOT NULL
    GROUP BY c.region, i.source_organization
    ORDER BY c.region, i.source_organization;
  `;
  const sourceMap = {
    region: 'country', source: 'indicator',
    total_records: 'health_impacts', earliest_data: 'health_impacts',
    latest_data: 'health_impacts'
  };
  db.query(sql, (err, results) => sendQueryResponse(res, err, results,
    'Health Data Coverage Check',
    'Records per region and source via health_impacts VIEW.',
    sourceMap, ['country', 'health_impacts', 'indicator']));
});

// ============================================================
// Q10 — WHO PM2.5 vs National Mortality
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
// Q11 — WHO PM2.5 Trends by Region
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
// Q12 — AQI Category Aggregator (Sub-Saharan Africa)
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
    JOIN country c ON a.country = c.table_name
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
  console.log(`Air Pollution API running at http://localhost:${port}`);
});