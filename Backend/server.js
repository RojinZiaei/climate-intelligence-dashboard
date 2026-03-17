const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

if (!process.env.MYSQL_PASSWORD) {
  console.error('MYSQL_PASSWORD environment variable is required');
  process.exit(1);
}

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Use air_pollution database (from new.sql / load_air_pollution_db.py)
const db = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'air_pollution',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

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

// Map AQI country names to country.table_name for joins
const COUNTRY_NAME_MAP = `
  CASE a.country
    WHEN 'United States of America' THEN 'United States'
    WHEN 'Iran (Islamic Republic of)' THEN 'Iran, Islamic Rep.'
    WHEN 'Bolivia (Plurinational State of)' THEN 'Bolivia'
    WHEN 'Venezuela (Bolivarian Republic of)' THEN 'Venezuela, RB'
    WHEN 'Türkiye' THEN 'Turkiye'
    ELSE a.country
  END
`;

// ----------------------------------------
// Source legend for frontend coloring
// ----------------------------------------
app.get('/api/source-legend', (req, res) => {
  res.json({
    country: {
      label: 'Country Metadata',
      color: '#7FB6E8'
    },
    health_impacts: {
      label: 'Health Impacts (Mortality & DALYs)',
      color: '#F28C8C'
    },
    city_aqi: {
      label: 'City AQI',
      color: '#B79AE8'
    },
    oecd_normalized: {
      label: 'OECD Health Burden',
      color: '#F6B37A'
    }
  });
});

// ----------------------------------------
// Query catalog for frontend buttons
// ----------------------------------------
app.get('/api/query-catalog', (req, res) => {
  res.json([
    {
      id: 'top-pollution-mortality',
      title: 'High Mortality with AQI and Income Context',
      endpoint: '/api/top-pollution-mortality',
      description: 'Countries where mortality is high, with city AQI and regional/income context.',
      tables: ['health_impacts', 'city_aqi', 'country'],
      insight: 'Shows which countries face the heaviest health burden from air pollution, with local AQI data and economic context.'
    },
    {
      id: 'aqi-high-pollution-cities',
      title: 'Cities with High AQI by Region',
      endpoint: '/api/aqi-high-pollution-cities',
      description: 'Cities where AQI indicates severe pollution, with regional context.',
      tables: ['city_aqi', 'country'],
      insight: 'Identifies pollution hotspots using AQI data. Cities with high PM2.5 AQI are likely true pollution hotspots.'
    },
    {
      id: 'mortality-by-income',
      title: 'Mortality by Income Group',
      endpoint: '/api/mortality-by-income',
      description: 'Compares country income groups on air-pollution mortality burden.',
      tables: ['health_impacts', 'country'],
      insight: 'Reveals environmental inequality—whether lower-income countries suffer disproportionately higher mortality from air pollution.'
    },
    {
      id: 'high-mortality-health-burden',
      title: 'High Mortality and OECD Health Burden',
      endpoint: '/api/high-mortality-health-burden',
      description: 'Countries with high mortality and high OECD DALY health burden.',
      tables: ['health_impacts', 'country'],
      insight: 'Connects pollution mortality with broader health burden. Highlights countries where air pollution drives both deaths and wider public-health strain.'
    },
    {
      id: 'cities-in-high-mortality-countries',
      title: 'Cities in High-Mortality Countries',
      endpoint: '/api/cities-in-high-mortality-countries',
      description: 'Cities with high local AQI in countries with high national mortality.',
      tables: ['city_aqi', 'health_impacts', 'country'],
      insight: 'Identifies local city-level hotspots inside countries with high national mortality—where targeted interventions may be most needed.'
    }
  ]);
});

// ----------------------------------------
// 1) High mortality + AQI + income context
// Tables: health_impacts + city_aqi + country
// ----------------------------------------
app.get('/api/top-pollution-mortality', (req, res) => {
  const sql = `
    SELECT 
      c.table_name AS country_name,
      c.region,
      c.income_group,
      ROUND(AVG(a.pm25_aqi_value), 2) AS avg_pm25_aqi,
      ROUND(AVG(h.impact_value), 2) AS avg_mortality
    FROM health_impacts h
    JOIN country c ON h.country_code = c.country_code
    LEFT JOIN city_aqi a ON ${COUNTRY_NAME_MAP} = c.table_name
    WHERE h.indicator_code = 'SH.STA.AIRP.P5'
      AND h.year >= 2015
      AND c.income_group IS NOT NULL
      AND c.income_group != ''
    GROUP BY c.table_name, c.region, c.income_group
    HAVING AVG(h.impact_value) > 50
    ORDER BY avg_mortality DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'country',
    region: 'country',
    income_group: 'country',
    avg_pm25_aqi: 'city_aqi',
    avg_mortality: 'health_impacts'
  };

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'High Mortality with AQI and Income Context',
      'Countries where mortality is high, with city AQI and regional/income context.',
      sourceMap,
      ['health_impacts', 'city_aqi', 'country']
    );
  });
});

// ----------------------------------------
// 2) Cities with high AQI by region
// Tables: city_aqi + country
// ----------------------------------------
app.get('/api/aqi-high-pollution-cities', (req, res) => {
  const sql = `
    SELECT 
      a.country AS country_name,
      a.city AS city_name,
      c.region,
      ROUND(AVG(a.pm25_aqi_value), 2) AS avg_pm25_aqi,
      ROUND(AVG(a.aqi_value), 2) AS avg_aqi,
      ROUND(AVG(a.no2_aqi_value), 2) AS avg_no2_aqi
    FROM city_aqi a
    LEFT JOIN country c ON ${COUNTRY_NAME_MAP} = c.table_name
    WHERE a.pm25_aqi_value IS NOT NULL
    GROUP BY a.country, a.city, c.region
    HAVING AVG(a.pm25_aqi_value) > 100
    ORDER BY avg_pm25_aqi DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'city_aqi',
    city_name: 'city_aqi',
    region: 'country',
    avg_pm25_aqi: 'city_aqi',
    avg_aqi: 'city_aqi',
    avg_no2_aqi: 'city_aqi'
  };

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'Cities with High AQI by Region',
      'Cities where AQI indicates severe pollution, with regional context.',
      sourceMap,
      ['city_aqi', 'country']
    );
  });
});

// ----------------------------------------
// 3) Mortality by income group
// Tables: health_impacts + country + city_aqi (for PM2.5 AQI)
// ----------------------------------------
app.get('/api/mortality-by-income', (req, res) => {
  const sql = `
    SELECT 
      c.income_group,
      ROUND(AVG(h.impact_value), 2) AS avg_mortality,
      ROUND(AVG(a.pm25_aqi_value), 2) AS avg_pm25,
      COUNT(DISTINCT h.country_code) AS countries_count
    FROM health_impacts h
    JOIN country c ON h.country_code = c.country_code
    LEFT JOIN city_aqi a ON ${COUNTRY_NAME_MAP} = c.table_name
    WHERE h.indicator_code = 'SH.STA.AIRP.P5'
      AND c.income_group IS NOT NULL
      AND c.income_group != ''
    GROUP BY c.income_group
    ORDER BY avg_mortality DESC
  `;

  const sourceMap = {
    income_group: 'country',
    avg_mortality: 'health_impacts',
    avg_pm25: 'city_aqi',
    countries_count: 'health_impacts'
  };

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'Mortality by Income Group',
      'Compares income groups on air-pollution mortality burden.',
      sourceMap,
      ['health_impacts', 'country', 'city_aqi']
    );
  });
});

// ----------------------------------------
// 4) High mortality and OECD health burden
// Tables: health_impacts (both indicators) + country
// ----------------------------------------
app.get('/api/high-mortality-health-burden', (req, res) => {
  const sql = `
    SELECT
      c.table_name AS country_name,
      c.region,
      ROUND(AVG(CASE WHEN h.indicator_code = 'SH.STA.AIRP.P5' THEN h.impact_value END), 2) AS avg_mortality,
      ROUND(AVG(CASE WHEN h.indicator_code = 'DALY_PM25' THEN h.impact_value END), 2) AS avg_health_burden
    FROM health_impacts h
    JOIN country c ON h.country_code = c.country_code
    WHERE h.indicator_code IN ('SH.STA.AIRP.P5', 'DALY_PM25')
    GROUP BY c.table_name, c.region
    HAVING AVG(CASE WHEN h.indicator_code = 'SH.STA.AIRP.P5' THEN h.impact_value END) IS NOT NULL
       AND AVG(CASE WHEN h.indicator_code = 'DALY_PM25' THEN h.impact_value END) IS NOT NULL
    ORDER BY avg_mortality DESC, avg_health_burden DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'country',
    region: 'country',
    avg_mortality: 'health_impacts',
    avg_health_burden: 'health_impacts'
  };

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'High Mortality and OECD Health Burden',
      'Countries with high mortality and high OECD DALY health burden.',
      sourceMap,
      ['health_impacts', 'country']
    );
  });
});

// ----------------------------------------
// 5) Cities in high-mortality countries
// Tables: city_aqi + health_impacts + country
// ----------------------------------------
app.get('/api/cities-in-high-mortality-countries', (req, res) => {
  const sql = `
    SELECT
      a.country AS country_name,
      a.city AS city_name,
      c.region,
      ROUND(AVG(a.pm25_aqi_value), 2) AS avg_pm25_aqi,
      ROUND(AVG(h.impact_value), 2) AS avg_mortality
    FROM city_aqi a
    JOIN country c ON ${COUNTRY_NAME_MAP} = c.table_name
    JOIN health_impacts h ON h.country_code = c.country_code AND h.indicator_code = 'SH.STA.AIRP.P5'
    WHERE a.pm25_aqi_value IS NOT NULL
      AND h.year >= 2015
    GROUP BY a.country, a.city, c.region
    HAVING AVG(h.impact_value) > 50
    ORDER BY avg_pm25_aqi DESC, avg_mortality DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'city_aqi',
    city_name: 'city_aqi',
    region: 'country',
    avg_pm25_aqi: 'city_aqi',
    avg_mortality: 'health_impacts'
  };

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'Cities in High-Mortality Countries',
      'Cities with high local AQI in countries with high national mortality.',
      sourceMap,
      ['city_aqi', 'health_impacts', 'country']
    );
  });
});

// ----------------------------------------
// Test endpoint
// ----------------------------------------
app.get('/api/mortality', (req, res) => {
  const sql = `SELECT * FROM health_impacts WHERE indicator_code = 'SH.STA.AIRP.P5' LIMIT 10`;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Error fetching mortality test data:', err);
      return res.status(500).json({
        error: 'Database connection error',
        details: err.message
      });
    }
    res.json(results);
  });
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
  console.log(`Using database: ${process.env.MYSQL_DATABASE || 'air_pollution'}`);
});
