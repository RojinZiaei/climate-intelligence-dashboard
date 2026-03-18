const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'se',
  database: 'climate_db',
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

// ----------------------------------------
// Source legend for frontend coloring
// ----------------------------------------
app.get('/api/source-legend', (req, res) => {
  res.json({
    countries_metadata: {
      label: 'Country Metadata',
      color: '#7FB6E8'
    },
    wb_air_pollution_mortality: {
      label: 'World Bank Mortality',
      color: '#F28C8C'
    },
    who_air_quality: {
      label: 'WHO Air Quality',
      color: '#8FD19E'
    },
    city_aqi: {
      label: 'City AQI',
      color: '#B79AE8'
    },
    oecd_health_burden: {
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
      title: 'High Pollution, High Mortality, and Income Context',
      endpoint: '/api/top-pollution-mortality',
      description: 'Countries where PM2.5 exposure and mortality are high, with regional and income-group context.',
      tables: ['wb_air_pollution_mortality', 'who_air_quality', 'countries_metadata'],
      insight: 'This query shows which countries face the heaviest combined environmental and health burden. It reveals whether high pollution and high mortality are concentrated in specific regions or lower-income settings.'
    },
    {
      id: 'aqi-pm25-crosscheck',
      title: 'AQI and WHO Cross-Validation by Region',
      endpoint: '/api/aqi-pm25-crosscheck',
      description: 'Cities where AQI and WHO pollution measures both indicate severe pollution, with regional context.',
      tables: ['city_aqi', 'who_air_quality', 'countries_metadata'],
      insight: 'This query validates severe pollution hotspots using two independent air-quality sources. If both AQI and WHO PM2.5 data are high, the city is more likely to be a true pollution hotspot rather than a measurement anomaly.'
    },
    {
      id: 'mortality-by-income',
      title: 'Mortality and PM2.5 by Income Group',
      endpoint: '/api/mortality-by-income',
      description: 'Compares country income groups on both mortality burden and PM2.5 exposure.',
      tables: ['wb_air_pollution_mortality', 'countries_metadata', 'who_air_quality'],
      insight: 'This query reveals environmental inequality. It compares pollution exposure and air-pollution mortality across economic groups, showing whether lower-income countries suffer disproportionately higher health impacts.'
    },
    {
      id: 'high-mortality-health-burden',
      title: 'High Mortality and Health Burden',
      endpoint: '/api/high-mortality-health-burden',
      description: 'Countries with high air-pollution mortality and high OECD health burden values.',
      tables: ['wb_air_pollution_mortality', 'oecd_health_burden', 'countries_metadata'],
      insight: 'This query connects pollution mortality with broader health burden. It highlights countries where air pollution is not only associated with deaths, but also with wider public-health strain.'
    },
    {
      id: 'cities-in-high-mortality-countries',
      title: 'Cities in High-Mortality Countries',
      endpoint: '/api/cities-in-high-mortality-countries',
      description: 'Cities with high local PM2.5 in countries with high national air-pollution mortality.',
      tables: ['who_air_quality', 'wb_air_pollution_mortality', 'countries_metadata'],
      insight: 'This query identifies local city-level hotspots inside countries that already have high national mortality. It helps show where targeted local interventions may be most needed.'
    }
  ]);
});
// ----------------------------------------
// 1) High pollution + high mortality + income context
// Tables:
// wb_air_pollution_mortality + who_air_quality + countries_metadata
// ----------------------------------------
app.get('/api/top-pollution-mortality', (req, res) => {
  const sql = `
    SELECT 
      w.country_name,
      m.region,
      m.income_group,
      ROUND(AVG(a.pm25_concentration), 2) AS avg_pm25,
      ROUND(AVG(w.mortality_rate_per_100k), 2) AS avg_mortality
    FROM wb_air_pollution_mortality w
    JOIN countries_metadata m
      ON w.country_code = m.country_code
    JOIN who_air_quality a
      ON a.iso3 = w.country_code
    WHERE w.year >= 2015
      AND a.pm25_concentration IS NOT NULL
      AND m.income_group IS NOT NULL
      AND w.mortality_rate_per_100k IS NOT NULL
    GROUP BY w.country_name, m.region, m.income_group
    HAVING AVG(a.pm25_concentration) > 20
    ORDER BY avg_mortality DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'wb_air_pollution_mortality',
    region: 'countries_metadata',
    income_group: 'countries_metadata',
    avg_pm25: 'who_air_quality',
    avg_mortality: 'wb_air_pollution_mortality'
  };

  const tablesUsed = [
    'wb_air_pollution_mortality',
    'who_air_quality',
    'countries_metadata'
  ];

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'High Pollution, High Mortality, and Income Context',
      'Countries where PM2.5 exposure and mortality are high, with regional and income-group context.',
      sourceMap,
      tablesUsed
    );
  });
});

// ----------------------------------------
// 2) AQI and WHO cross-validation with region context
// Tables:
// city_aqi + who_air_quality + countries_metadata
// ----------------------------------------
app.get('/api/aqi-pm25-crosscheck', (req, res) => {
  const sql = `
    SELECT 
      a.country_name,
      a.city_name,
      m.region,
      ROUND(AVG(a.pm25_aqi_value), 2) AS avg_pm25_aqi,
      ROUND(AVG(w.pm25_concentration), 2) AS avg_pm25_concentration,
      ROUND(AVG(w.no2_concentration), 2) AS avg_no2_concentration
    FROM city_aqi a
    JOIN who_air_quality w
      ON a.city_name = w.city_name
     AND a.country_name = w.country_name
    JOIN countries_metadata m
      ON w.iso3 = m.country_code
    WHERE a.pm25_aqi_value IS NOT NULL
      AND w.pm25_concentration IS NOT NULL
    GROUP BY a.country_name, a.city_name, m.region
    HAVING AVG(a.pm25_aqi_value) > 100
    ORDER BY avg_pm25_concentration DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'city_aqi',
    city_name: 'city_aqi',
    region: 'countries_metadata',
    avg_pm25_aqi: 'city_aqi',
    avg_pm25_concentration: 'who_air_quality',
    avg_no2_concentration: 'who_air_quality'
  };

  const tablesUsed = [
    'city_aqi',
    'who_air_quality',
    'countries_metadata'
  ];

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'AQI and WHO Cross-Validation by Region',
      'Cities where AQI and WHO pollutant concentration both indicate severe pollution, with regional context.',
      sourceMap,
      tablesUsed
    );
  });
});

// ----------------------------------------
// 3) Mortality and PM2.5 by income group
// Tables:
// wb_air_pollution_mortality + countries_metadata + who_air_quality
// ----------------------------------------
app.get('/api/mortality-by-income', (req, res) => {
  const sql = `
    SELECT 
      m.income_group,
      ROUND(AVG(w.mortality_rate_per_100k), 2) AS avg_mortality,
      ROUND(AVG(a.pm25_concentration), 2) AS avg_pm25,
      COUNT(DISTINCT w.country_code) AS countries_count
    FROM wb_air_pollution_mortality w
    JOIN countries_metadata m
      ON w.country_code = m.country_code
    JOIN who_air_quality a
      ON a.iso3 = w.country_code
    WHERE m.income_group IS NOT NULL
      AND a.pm25_concentration IS NOT NULL
      AND w.mortality_rate_per_100k IS NOT NULL
    GROUP BY m.income_group
    ORDER BY avg_mortality DESC
  `;

  const sourceMap = {
    income_group: 'countries_metadata',
    avg_mortality: 'wb_air_pollution_mortality',
    avg_pm25: 'who_air_quality',
    countries_count: 'wb_air_pollution_mortality'
  };

  const tablesUsed = [
    'wb_air_pollution_mortality',
    'countries_metadata',
    'who_air_quality'
  ];

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'Mortality and PM2.5 by Income Group',
      'Compares income groups on both mortality burden and PM2.5 exposure.',
      sourceMap,
      tablesUsed
    );
  });
});

// ----------------------------------------
// 4) High mortality and OECD health burden
// Tables:
// wb_air_pollution_mortality + oecd_health_burden + countries_metadata
// ----------------------------------------
app.get('/api/high-mortality-health-burden', (req, res) => {
  const sql = `
    SELECT
      w.country_name,
      m.region,
      ROUND(AVG(w.mortality_rate_per_100k), 2) AS avg_mortality,
      ROUND(AVG(o.obs_value), 2) AS avg_health_burden
    FROM wb_air_pollution_mortality w
    JOIN countries_metadata m
      ON w.country_code = m.country_code
    JOIN oecd_health_burden o
      ON w.country_code = o.ref_area_code
    WHERE w.mortality_rate_per_100k IS NOT NULL
      AND o.obs_value IS NOT NULL
    GROUP BY w.country_name, m.region
    ORDER BY avg_mortality DESC, avg_health_burden DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'wb_air_pollution_mortality',
    region: 'countries_metadata',
    avg_mortality: 'wb_air_pollution_mortality',
    avg_health_burden: 'oecd_health_burden'
  };

  const tablesUsed = [
    'wb_air_pollution_mortality',
    'oecd_health_burden',
    'countries_metadata'
  ];

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'High Mortality and Health Burden',
      'Countries with high air-pollution mortality and high OECD health burden, with regional context.',
      sourceMap,
      tablesUsed
    );
  });
});

// ----------------------------------------
// 5) Cities in countries with high national mortality
// Tables:
// who_air_quality + wb_air_pollution_mortality + countries_metadata
// ----------------------------------------
app.get('/api/cities-in-high-mortality-countries', (req, res) => {
  const sql = `
    SELECT
      a.country_name,
      a.city_name,
      m.region,
      ROUND(AVG(a.pm25_concentration), 2) AS avg_pm25,
      ROUND(AVG(w.mortality_rate_per_100k), 2) AS avg_mortality
    FROM who_air_quality a
    JOIN wb_air_pollution_mortality w
      ON a.iso3 = w.country_code
    JOIN countries_metadata m
      ON w.country_code = m.country_code
    WHERE a.pm25_concentration IS NOT NULL
      AND w.mortality_rate_per_100k IS NOT NULL
      AND w.year >= 2015
    GROUP BY a.country_name, a.city_name, m.region
    HAVING AVG(w.mortality_rate_per_100k) > 20
    ORDER BY avg_pm25 DESC, avg_mortality DESC
    LIMIT 15
  `;

  const sourceMap = {
    country_name: 'who_air_quality',
    city_name: 'who_air_quality',
    region: 'countries_metadata',
    avg_pm25: 'who_air_quality',
    avg_mortality: 'wb_air_pollution_mortality'
  };

  const tablesUsed = [
    'who_air_quality',
    'wb_air_pollution_mortality',
    'countries_metadata'
  ];

  db.query(sql, (err, results) => {
    sendQueryResponse(
      res,
      err,
      results,
      'Cities in High-Mortality Countries',
      'Cities with high local PM2.5 located in countries with high national pollution mortality.',
      sourceMap,
      tablesUsed
    );
  });
});

// ----------------------------------------
// Optional simple test endpoint
// ----------------------------------------
app.get('/api/mortality', (req, res) => {
  const sql = `SELECT * FROM wb_air_pollution_mortality LIMIT 10`;

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
});