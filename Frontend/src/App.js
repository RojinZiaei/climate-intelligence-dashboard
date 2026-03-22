import React, { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

/** Backend origin (CRA: set REACT_APP_API_ORIGIN in Frontend/.env) */
const API_ORIGIN = process.env.REACT_APP_API_ORIGIN || 'http://localhost:3000';
const API_BASE = `${API_ORIGIN}/api`;

async function readApiError(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    return j.details || j.error || text || res.statusText;
  } catch {
    return text || res.statusText || 'Unknown error';
  }
}

/** X-axis category line in multi-series bar chart tooltips */
function formatChartAxisLabel(xKey, label) {
  if (label == null || label === '') return '';
  if (xKey === 'country_name') return `Country: ${label}`;
  if (xKey === 'city') return `City: ${label}`;
  if (xKey === 'region') return `Region: ${label}`;
  if (xKey === 'income_group') return `Income group: ${label}`;
  if (xKey === 'category_name') return `Category: ${label}`;
  return String(label);
}

/**
 * One row per series with spacing and divider lines (default Recharts tooltip packs lines together).
 */
function ChartBarTooltip({ active, payload, label, chart }) {
  if (!active || !payload?.length) return null;

  const order = chart.bars.map((b) => b.key);
  const sorted = [...payload]
    .filter((e) => e != null)
    .sort((a, b) => {
      const ia = order.indexOf(String(a.dataKey != null ? a.dataKey : ''));
      const ib = order.indexOf(String(b.dataKey != null ? b.dataKey : ''));
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  const title = formatChartAxisLabel(chart.xKey, label);

  return (
    <div className="chart-tooltip-panel">
      {title ? <div className="chart-tooltip-title">{title}</div> : null}
      <ul className="chart-tooltip-rows">
        {sorted.map((entry, index) => {
          const key = entry.dataKey != null ? String(entry.dataKey) : null;
          const barDef = key
            ? chart.bars.find((x) => x.key === key)
            : chart.bars.find((x) => x.name === entry.name);
          const seriesName = barDef?.name ?? String(entry.name ?? '');
          const val = entry.value;
          const display =
            typeof val === 'number' && Number.isFinite(val)
              ? Number(val).toFixed(3)
              : val == null
                ? '—'
                : String(val);
          const color = entry.color ?? barDef?.color ?? '#64748b';
          return (
            <li key={`${key ?? 'row'}-${index}`} className="chart-tooltip-row">
              <span
                className="chart-tooltip-swatch"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <span className="chart-tooltip-row-label">{seriesName}</span>
              <span className="chart-tooltip-row-value">{display}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Y-axis that includes 0 when all values are positive (bars start from baseline 0); still spans negatives for e.g. YoY change. */
function barChartYDomain(rows, barDefs) {
  if (!rows?.length || !barDefs?.length) return undefined;
  const keys = barDefs.map((b) => b.key);
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    for (const k of keys) {
      const v = Number(row[k]);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 'auto'];
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (lo === hi) return [0, 'auto'];
  return [lo, hi];
}

/** For Custom SQL — matches air_pollution schema (see schema.sql). */
const SCHEMA_TABLE_REFERENCE = [
  {
    key: 'country',
    name: 'country',
    kind: 'TABLE',
    desc: 'Country dimension (World Bank metadata). Join almost everything on country_code.',
    pk: 'country_code',
    columns: 'country_code, region, income_group, special_notes, table_name'
  },
  {
    key: 'indicator',
    name: 'indicator',
    kind: 'TABLE',
    desc: 'Indicator codes and labels (WB mortality, WB PM2.5 exposure, OECD DALY, etc.).',
    pk: 'indicator_code',
    columns: 'indicator_code, indicator_name, source_organization'
  },
  {
    key: 'aqi_reference',
    name: 'aqi_reference',
    kind: 'TABLE',
    desc: 'AQI category numeric ranges for bucket joins.',
    pk: 'category_name',
    columns: 'category_name, min_value, max_value'
  },
  {
    key: 'population_density_category',
    name: 'population_density_category',
    kind: 'TABLE',
    desc: 'Lookup: Urban / Suburban / Rural — FK target for city_air_health_daily.',
    pk: 'density_category',
    columns: 'density_category'
  },
  {
    key: 'city_aqi',
    name: 'city_aqi',
    kind: 'TABLE',
    desc: 'City AQI snapshot; no country name column — JOIN country for labels.',
    pk: '(country_code, city, lat, lng)',
    columns: 'country_code, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng'
  },
  {
    key: 'mortality_normalized',
    name: 'mortality_normalized',
    kind: 'TABLE',
    desc: 'WB air-pollution mortality (SH.STA.AIRP.P5), long format by year.',
    pk: '(country_code, indicator_code, year)',
    columns: 'country_code, indicator_code, year, impact_value'
  },
  {
    key: 'oecd_normalized',
    name: 'oecd_normalized',
    kind: 'TABLE',
    desc: 'OECD PM2.5 outdoor DALYs per country-year.',
    pk: '(country_code, year)',
    columns: 'country_code, year, obs_value'
  },
  {
    key: 'who_air_quality',
    name: 'who_air_quality',
    kind: 'TABLE',
    desc: 'WHO ambient concentrations (µg/m³); city may be (national aggregate) for country-level rows.',
    pk: '(country_code, city, year, latitude, longitude)',
    columns: 'country_code, city, year, pm25_concentration, pm10_concentration, no2_concentration, latitude, longitude'
  },
  {
    key: 'pm25_exposure_normalized',
    name: 'pm25_exposure_normalized',
    kind: 'TABLE',
    desc: 'WB national mean PM2.5 exposure (EN.ATM.PM25.MC.M3), long by year.',
    pk: '(country_code, year, indicator_code)',
    columns: 'country_code, year, indicator_code, pm25_exposure_ugm3'
  },
  {
    key: 'city_air_health_daily',
    name: 'city_air_health_daily',
    kind: 'TABLE',
    desc: 'Daily synthetic panel: air + hospital proxies; cal_year and cal_ym are STORED generated columns.',
    pk: '(country_code, city, obs_date)',
    columns: 'country_code, city, obs_date, cal_year, cal_ym, aqi, pm2_5, pm10, no2, o3, temperature, humidity, hospital_admissions, hospital_capacity, density_category'
  },
  {
    key: 'health_impacts',
    name: 'health_impacts',
    kind: 'VIEW',
    desc: 'UNION ALL: mortality_normalized plus oecd_normalized rows with indicator_code DALY_PM25.',
    pk: '— (view; no PK)',
    columns: 'country_code, indicator_code, year, impact_value'
  }
];

function App() {
  const [catalog, setCatalog] = useState([]);
  const [legendMap, setLegendMap] = useState({});
  // Default matches first item in /api/query-catalog (OECD DALY 2018→2019)
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/oecd-daly-yoy-2018-2019');
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  /** Catalog / legend fetch failed (do not clear when running a canned query) */
  const [bootstrapError, setBootstrapError] = useState('');
  /** Canned query failed */
  const [queryError, setQueryError] = useState('');

  // Custom query state
  const [customMode, setCustomMode] = useState(false);
  const [customSql, setCustomSql] = useState('SELECT c.table_name AS country, c.region, c.income_group\nFROM country c\nWHERE c.region IS NOT NULL\nLIMIT 10;');
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError] = useState('');
  const [customLoading, setCustomLoading] = useState(false);
  /** Collapsible panel for canned queries (from /api/query-catalog) */
  const [cannedQueriesOpen, setCannedQueriesOpen] = useState(false);
  /** Collapsible tables / view list on Custom SQL tab */
  const [schemaTablesRefOpen, setSchemaTablesRefOpen] = useState(false);

  // 1. Fetch query catalog & source legend on mount
  useEffect(() => {
    fetch(`${API_BASE}/query-catalog`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        return res.json();
      })
      .then(setCatalog)
      .catch((err) => {
        console.error(err);
        setBootstrapError(
          err.message === 'Failed to fetch'
            ? `Cannot reach API at ${API_ORIGIN}. Start backend: cd Backend && npm start`
            : `Catalog: ${err.message}`
        );
      });

    fetch(`${API_BASE}/source-legend`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        return res.json();
      })
      .then(setLegendMap)
      .catch((err) => {
        console.error(err);
        setBootstrapError((prev) =>
          prev ||
          (err.message === 'Failed to fetch'
            ? `Cannot reach API at ${API_ORIGIN}. Start backend: cd Backend && npm start`
            : `Legend: ${err.message}`)
        );
      });
  }, []);

  // 2. Fetch Data when selected endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;

    setLoading(true);
    setQueryError('');

    fetch(`${API_ORIGIN}${selectedEndpoint}`)
      .then(async (res) => {
        if (!res.ok) {
          const detail = await readApiError(res);
          throw new Error(`API ${res.status}: ${detail}`);
        }
        return res.json();
      })
      .then((data) => {
        setQueryResult(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        const msg =
          err.message === 'Failed to fetch'
            ? `Cannot reach API at ${API_ORIGIN}. Is the backend running? (cd Backend && npm start)`
            : err.message;
        setQueryError(msg);
        setLoading(false);
      });
  }, [selectedEndpoint]);

  // 3. Catalog row for selected canned query (objective text, etc.)
  const selectedQueryMeta = useMemo(() => {
    return catalog.find((query) => query.endpoint === selectedEndpoint);
  }, [catalog, selectedEndpoint]);

  const resultColumnKeys = useMemo(
    () => (queryResult?.data?.[0] ? Object.keys(queryResult.data[0]) : []),
    [queryResult]
  );

  const getFieldColor = useCallback(
    (fieldName) => {
      if (!queryResult?.sourceMap) return '#1f2937';
      const tableName = queryResult.sourceMap[fieldName];
      return legendMap[tableName]?.color || '#1f2937';
    },
    [queryResult?.sourceMap, legendMap]
  );

  // 5. Chart configurations per canned-query endpoint (see /api/query-catalog)
  const chartConfigs = useMemo(() => {
    if (!queryResult?.data?.length) return [];

    switch (selectedEndpoint) {
      case '/api/global-health-snapshot':
        return [{
          title: 'Mortality Rate by Country (2019)',
          xKey: 'country_name',
          bars: [{ key: 'mortality_rate_2019', color: getFieldColor('mortality_rate_2019'), name: 'Mortality Rate' }]
        }];

      case '/api/oecd-dalys-income':
        return [{
          title: 'Average DALYs Lost by Income Group (OECD, 2019)',
          xKey: 'income_group',
          bars: [{ key: 'avg_daly_lost', color: getFieldColor('avg_daly_lost'), name: 'Avg DALYs Lost' }]
        }];

      case '/api/hazardous-cities':
        return [{
          title: 'Hazardous PM2.5 AQI by City',
          xKey: 'city',
          bars: [
            { key: 'pm25_aqi_value', color: getFieldColor('pm25_aqi_value'), name: 'PM2.5 AQI' },
            { key: 'co_aqi_value', color: getFieldColor('co_aqi_value'), name: 'CO AQI' },
            { key: 'no2_aqi_value', color: getFieldColor('no2_aqi_value'), name: 'NO₂ AQI' }
          ]
        }];

      case '/api/regional-hotspots':
        return [{
          title: 'Severely Polluted Cities by Region',
          xKey: 'region',
          bars: [{ key: 'severely_polluted_cities', color: getFieldColor('severely_polluted_cities'), name: 'Polluted Cities Count' }]
        }];

      case '/api/safest-high-income':
        return [{
          title: 'Cleanest High-Income Cities (All Pollutants)',
          xKey: 'city',
          bars: [
            { key: 'aqi_value', color: getFieldColor('aqi_value'), name: 'Overall AQI' },
            { key: 'pm25_aqi_value', color: getFieldColor('pm25_aqi_value'), name: 'PM2.5' },
            { key: 'co_aqi_value', color: getFieldColor('co_aqi_value'), name: 'CO' },
            { key: 'ozone_aqi_value', color: getFieldColor('ozone_aqi_value'), name: 'Ozone' },
            { key: 'no2_aqi_value', color: getFieldColor('no2_aqi_value'), name: 'NO₂' }
          ]
        }];

      case '/api/dual-source':
        return [{
          title: 'World Bank Mortality vs OECD DALYs (2019)',
          xKey: 'country_name',
          bars: [
            { key: 'wb_mortality_rate', color: getFieldColor('wb_mortality_rate'), name: 'WB Mortality Rate' },
            { key: 'oecd_daly_rate', color: getFieldColor('oecd_daly_rate'), name: 'OECD DALYs' }
          ]
        }];

      case '/api/city-vs-national':
        return [{
          title: 'City AQI vs National Mortality',
          xKey: 'city',
          bars: [
            { key: 'city_current_aqi', color: getFieldColor('city_current_aqi'), name: 'City Current AQI' },
            { key: 'national_mortality_rate_2019', color: getFieldColor('national_mortality_rate_2019'), name: 'National Mortality (2019)' }
          ]
        }];

      case '/api/who-vs-mortality':
        return [{
          title: 'WHO PM2.5 Concentration vs WB Mortality',
          xKey: 'country_name',
          bars: [
            { key: 'avg_who_pm25', color: getFieldColor('avg_who_pm25'), name: 'WHO Avg PM2.5 (µg/m³)' },
            { key: 'wb_mortality_rate', color: getFieldColor('wb_mortality_rate'), name: 'WB Mortality Rate' }
          ]
        }];

      case '/api/who-regional-pm25':
        return [{
          title: 'WHO Pollutant Concentrations by Region',
          xKey: 'region',
          bars: [
            { key: 'avg_pm25', color: getFieldColor('avg_pm25'), name: 'Avg PM2.5 (µg/m³)' },
            { key: 'avg_no2', color: getFieldColor('avg_no2'), name: 'Avg NO₂ (µg/m³)' },
            { key: 'avg_pm10', color: getFieldColor('avg_pm10'), name: 'Avg PM10 (µg/m³)' }
          ]
        }];

      case '/api/category-aggregator':
        return [{
          title: 'Cities per AQI Category (Sub-Saharan Africa)',
          xKey: 'category_name',
          bars: [
            { key: 'number_of_cities', color: getFieldColor('number_of_cities'), name: 'Number of Cities' },
            { key: 'average_pm25', color: getFieldColor('average_pm25'), name: 'Avg PM2.5' },
            { key: 'average_co', color: getFieldColor('average_co'), name: 'Avg CO' },
            { key: 'average_no2', color: getFieldColor('average_no2'), name: 'Avg NO₂' },
            { key: 'average_ozone', color: getFieldColor('average_ozone'), name: 'Avg Ozone' }
          ]
        }];

      case '/api/wb-pm25-by-region':
        return [{
          title: 'World Bank PM2.5 mean exposure by region (µg/m³, latest year)',
          xKey: 'region',
          bars: [
            { key: 'avg_pm25_exposure_ugm3', color: getFieldColor('avg_pm25_exposure_ugm3'), name: 'Avg PM2.5 (µg/m³)' }
          ]
        }];

      case '/api/wb-pm25-vs-mortality':
        return [{
          title: 'WB national PM2.5 exposure vs air-pollution mortality (2019)',
          xKey: 'country_name',
          bars: [
            { key: 'wb_pm25_exposure_ugm3', color: getFieldColor('wb_pm25_exposure_ugm3'), name: 'PM2.5 exposure (µg/m³)' },
            { key: 'wb_mortality_rate', color: getFieldColor('wb_mortality_rate'), name: 'Mortality rate' }
          ]
        }];

      case '/api/multi-source-pm25-health-2019':
        return [
          {
            title: 'National WB PM2.5 (EN file) vs WHO average city PM2.5 — same units (µg/m³)',
            xKey: 'country_name',
            bars: [
              { key: 'en_wb_national_pm25_ugm3', color: getFieldColor('en_wb_national_pm25_ugm3'), name: 'WB national (EN)' },
              { key: 'who_avg_city_pm25_ugm3', color: getFieldColor('who_avg_city_pm25_ugm3'), name: 'WHO cities avg' }
            ]
          },
          {
            title: 'Health burden: WB air-pollution mortality vs OECD PM2.5 DALY',
            xKey: 'country_name',
            bars: [
              { key: 'sh_wb_mortality_per_100k', color: getFieldColor('sh_wb_mortality_per_100k'), name: 'Mortality /100k (SH)' },
              { key: 'oecd_daly_pm25', color: getFieldColor('oecd_daly_pm25'), name: 'OECD DALY' }
            ]
          }
        ];

      case '/api/top-cities-per-region-aqi':
        return [{
          title: 'Top 3 cities by AQI per region (window: ROW_NUMBER)',
          xKey: 'plot_label',
          bars: [{ key: 'aqi_value', color: getFieldColor('aqi_value'), name: 'Overall AQI' }]
        }];

      case '/api/wb-pm25-above-regional-average-2019':
        return [{
          title: 'National PM2.5 vs regional mean (countries above average, 2019)',
          xKey: 'country_name',
          bars: [
            {
              key: 'country_pm25',
              color: legendMap.pm25_exposure_normalized?.color ?? getFieldColor('country_pm25'),
              name: 'Country PM2.5 (µg/m³)'
            },
            {
              key: 'regional_avg_pm25',
              color: legendMap.country?.color ?? getFieldColor('regional_avg_pm25'),
              name: 'Region average'
            },
            {
              key: 'gap_vs_region',
              color: legendMap.indicator?.color ?? getFieldColor('gap_vs_region'),
              name: 'Gap vs region'
            }
          ]
        }];

      case '/api/oecd-daly-yoy-2018-2019':
      case '/api/mortality-yoy-change-2018-2019':
        return [{
          title: 'OECD PM2.5 DALY — change from 2018 to 2019',
          xKey: 'country_name',
          bars: [
            {
              key: 'prior_year_daly',
              color: legendMap.country?.color ?? getFieldColor('prior_year_daly'),
              name: 'DALY rate (2018)'
            },
            {
              key: 'daly_rate',
              color: legendMap.oecd_normalized?.color ?? getFieldColor('daly_rate'),
              name: 'DALY rate (2019)'
            },
            {
              key: 'yoy_change',
              color: legendMap.indicator?.color ?? getFieldColor('yoy_change'),
              name: 'Change (2019 − 2018)'
            }
          ]
        }];

      default:
        return [];
    }
  }, [queryResult, selectedEndpoint, legendMap, getFieldColor]);

  // 6. Generic Summary Cards
  const summaryCards = useMemo(() => {
    if (!queryResult?.data?.length) return [];

    const firstRow = queryResult.data[0];

    return Object.entries(firstRow)
      .slice(0, 4)
      .map(([key, value]) => {
        let displayValue = value;
        if (typeof value === 'number' && value % 1 !== 0) {
          displayValue = value.toFixed(2);
        }

        return {
          label: `Top result: ${key.replace(/_/g, ' ')}`,
          value: displayValue,
          field: key
        };
      });
  }, [queryResult, selectedEndpoint]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>AirLense</h1>
          <p className="hero-tagline">
            Air quality, exposure, and health burden.
          </p>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar card">
          <h2 className="sidebar-title">Queries</h2>

          <button
            className={`query-button custom-query-btn ${customMode ? 'active' : ''}`}
            onClick={() => { setCustomMode(true); setQueryError(''); }}
            style={customMode ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none' } : { background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
          >
            <span className="query-title">✏️ Custom SQL Query</span>
          </button>

          <button
            type="button"
            className={`canned-queries-toggle ${cannedQueriesOpen ? 'open' : ''}`}
            onClick={() => setCannedQueriesOpen((o) => !o)}
            aria-expanded={cannedQueriesOpen}
            aria-controls="canned-queries-panel"
            id="canned-queries-label"
          >
            <span className="canned-queries-toggle-chevron" aria-hidden>
              {cannedQueriesOpen ? '▼' : '▶'}
            </span>
            <span className="canned-queries-toggle-text">Canned Queries</span>
            <span className="canned-queries-count">{catalog.length}</span>
          </button>

          <div
            id="canned-queries-panel"
            className="canned-queries-panel"
            role="region"
            aria-labelledby="canned-queries-label"
            hidden={!cannedQueriesOpen}
          >
            <div className="query-list">
              {catalog.map((query) => (
                <button
                  key={query.id}
                  className={`query-button ${!customMode && selectedEndpoint === query.endpoint ? 'active' : ''}`}
                  onClick={() => {
                    setCustomMode(false);
                    setSelectedEndpoint(query.endpoint);
                  }}
                >
                  <span className="query-title">{query.title}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="legend-box">
            <h3>Source Color Map</h3>
            {Object.entries(legendMap).map(([tableName, info]) => (
              <div key={tableName} className="legend-row">
                <span
                  className="legend-swatch"
                  style={{ backgroundColor: info.color }}
                />
                <span className="legend-label">{info.label}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="content">
          {customMode ? (
            /* ==================== CUSTOM QUERY MODE ==================== */
            <>
              <section className="card result-header">
                <h2>✏️ Custom SQL Query</h2>
                <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: '14px' }}>
                  Write a query against the database. A LIMIT of 200 is added automatically if not specified.
                </p>
              </section>

              <section className="card custom-query-schema-ref-wrap" aria-label="Database tables reference">
                <button
                  type="button"
                  className={`canned-queries-toggle custom-sql-schema-toggle ${schemaTablesRefOpen ? 'open' : ''}`}
                  onClick={() => setSchemaTablesRefOpen((o) => !o)}
                  aria-expanded={schemaTablesRefOpen}
                  aria-controls="custom-sql-schema-panel"
                  id="custom-sql-schema-label"
                >
                  <span className="canned-queries-toggle-chevron" aria-hidden>
                    {schemaTablesRefOpen ? '▼' : '▶'}
                  </span>
                  <span className="canned-queries-toggle-text">Tables &amp; view for custom SQL</span>
                  <span className="canned-queries-count">{SCHEMA_TABLE_REFERENCE.length}</span>
                </button>

                <div
                  id="custom-sql-schema-panel"
                  className="custom-sql-schema-panel"
                  role="region"
                  aria-labelledby="custom-sql-schema-label"
                  hidden={!schemaTablesRefOpen}
                >
                  <p className="schema-ref-lead">
                    Use these names exactly as in MySQL. Colors match the dashboard legend when available.
                  </p>
                  <ul className="schema-ref-list">
                    {SCHEMA_TABLE_REFERENCE.map((row) => (
                      <li key={row.name} className="schema-ref-item">
                        <span
                          className="schema-ref-swatch"
                          style={{ backgroundColor: legendMap[row.key]?.color || '#94a3b8' }}
                          title={legendMap[row.key]?.label || row.name}
                        />
                        <div className="schema-ref-body">
                          <div className="schema-ref-topline">
                            <code className="schema-ref-name">{row.name}</code>
                            <span className={`schema-ref-kind schema-ref-kind--${row.kind === 'VIEW' ? 'view' : 'table'}`}>
                              {row.kind}
                            </span>
                          </div>
                          <p className="schema-ref-desc">{row.desc}</p>
                          {'pk' in row && row.pk ? (
                            <p className="schema-ref-pk">
                              <span className="schema-ref-label">PK</span>
                              <code className="schema-ref-code">{row.pk}</code>
                            </p>
                          ) : null}
                          {'columns' in row && row.columns ? (
                            <p className="schema-ref-columns">
                              <span className="schema-ref-label">Columns</span>
                              <span className="schema-ref-code schema-ref-code--wrap">{row.columns}</span>
                            </p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="card" style={{ padding: '24px' }}>
                <div style={{ marginBottom: '8px', fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600 }}>SQL Editor</div>
                <textarea
                  value={customSql}
                  onChange={(e) => setCustomSql(e.target.value)}
                  spellCheck={false}
                  style={{
                    width: '100%', minHeight: '160px', padding: '16px',
                    fontFamily: '"SF Mono", "Fira Code", "Cascadia Code", monospace', fontSize: '14px', lineHeight: '1.6',
                    background: 'rgba(15, 23, 42, 0.8)', color: '#e2e8f0', border: '1px solid rgba(99,102,241,0.3)',
                    borderRadius: '10px', resize: 'vertical', outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(99,102,241,0.7)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(99,102,241,0.3)'}
                />

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '16px' }}>
                  <button
                    onClick={() => {
                      if (!customSql.trim()) return;
                      setCustomLoading(true);
                      setCustomError('');
                      setCustomResult(null);
                      fetch(`${API_BASE}/custom-query`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ sql: customSql })
                      })
                        .then(r => r.json())
                        .then(data => {
                          if (data.error) {
                            setCustomError(data.details || data.error);
                          } else {
                            setCustomResult(data);
                          }
                          setCustomLoading(false);
                        })
                        .catch(err => {
                          setCustomError(err.message);
                          setCustomLoading(false);
                        });
                    }}
                    disabled={customLoading || !customSql.trim()}
                    style={{
                      padding: '10px 28px', fontWeight: 600, fontSize: '14px',
                      background: customLoading ? '#475569' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                      color: '#fff', border: 'none', borderRadius: '8px', cursor: customLoading ? 'wait' : 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {customLoading ? '⏳ Running...' : '▶ Run Query'}
                  </button>

                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Tip: use <code style={{ fontSize: '11px' }}>country_code</code> to join tables.
                  </span>
                </div>
              </section>

              {customError && (
                <section className="card status-card error-card">
                  <h3>Query Error</h3>
                  <p style={{ fontFamily: 'monospace', fontSize: '13px', whiteSpace: 'pre-wrap' }}>{customError}</p>
                </section>
              )}

              {customResult && (
                <>
                  <section className="card result-header">
                    <div className="meta-row">
                      <div className="pill">
                        <span className="pill-label">Rows Returned</span>
                        <span className="pill-value">{customResult.rowCount}</span>
                      </div>
                      <div className="pill">
                        <span className="pill-label">Columns</span>
                        <span className="pill-value">{customResult.columns?.length || 0}</span>
                      </div>
                    </div>
                  </section>

                  {customResult.rowCount === 0 ? (
                    <section className="card status-card">
                      <h3>No rows returned</h3>
                      <p>The query executed successfully but returned no matching rows.</p>
                    </section>
                  ) : (
                    <section className="card table-card">
                      <div className="table-card-header">
                        <h3>Query Results</h3>
                      </div>
                      <div className="table-wrapper">
                        <table>
                          <thead>
                            <tr>
                              {customResult.columns.map((col) => (
                                <th key={col} style={{ borderBottom: '3px solid #6366f1' }}>
                                  <span className="header-chip" style={{ color: '#a5b4fc', borderColor: '#6366f1' }}>
                                    {col}
                                  </span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {customResult.data.map((row, ri) => (
                              <tr key={ri}>
                                {customResult.columns.map((col) => (
                                  <td key={col}>
                                    <span className="cell-badge" style={{ borderLeft: '4px solid #6366f1' }}>
                                      {row[col] === null ? <em style={{ color: '#475569' }}>NULL</em> : String(row[col])}
                                    </span>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </>
              )}
            </>
          ) : (
            /* ==================== CANNED QUERY MODE ==================== */
            <>
              {loading && (
                <div className="card status-card">
                  <p>Executing query...</p>
                </div>
              )}

              {bootstrapError && (
                <div className="card status-card error-card">
                  <p><strong>Setup:</strong> {bootstrapError}</p>
                </div>
              )}

              {queryError && !loading && (
                <div className="card status-card error-card">
                  <p>{queryError}</p>
                </div>
              )}

              {queryResult && !loading && !queryError && (
                <>
                  <section className="card result-header">
                    <h2>{queryResult.queryName}</h2>

                    <div className="meta-row">
                      <div className="pill">
                        <span className="pill-label">Rows Returned</span>
                        <span className="pill-value">{queryResult.rowCount}</span>
                      </div>

                      {queryResult.tablesUsed?.map((table) => (
                        <div
                          key={table}
                          className="table-pill"
                          style={{
                            borderColor: legendMap[table]?.color || '#cbd5e1',
                            color: legendMap[table]?.color || '#334155'
                          }}
                        >
                          {legendMap[table]?.label || table}
                        </div>
                      ))}
                    </div>

                    {selectedQueryMeta?.description && (
                      <section className="insight-box">
                        <h3>Query Objective</h3>
                        <p>{selectedQueryMeta?.description}</p>
                      </section>
                    )}
                  </section>

                  {summaryCards.length > 0 && (
                    <section className="summary-grid">
                      {summaryCards.map((card, index) => (
                        <div key={index} className="card summary-card">
                          <div
                            className="summary-key"
                            style={{ color: getFieldColor(card.field) }}
                          >
                            {card.label}
                          </div>
                          <div className="summary-value">{card.value}</div>
                        </div>
                      ))}
                    </section>
                  )}

                  {queryResult.rowCount === 0 ? (
                    <section className="card status-card">
                      <h3>No matching rows returned</h3>
                      <p>
                        This query executed successfully, but the joined datasets did not produce matching rows for the current conditions.
                      </p>
                    </section>
                  ) : (
                    <>
                      {chartConfigs.map((chart, idx) => (
                        <section key={idx} className="card chart-card">
                          <h3>{chart.title}</h3>
                          <div className="chart-wrapper">
                            <ResponsiveContainer width="100%" height={320}>
                              <BarChart
                                data={chart.data ?? queryResult.data}
                                margin={{ top: 10, right: 20, left: 10, bottom: 28 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey={chart.xKey}
                                  angle={-40}
                                  textAnchor="end"
                                  interval={0}
                                  height={88}
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis
                                  domain={barChartYDomain(chart.data ?? queryResult.data, chart.bars)}
                                />
                                <Tooltip
                                  wrapperStyle={{ outline: 'none' }}
                                  cursor={{ fill: 'rgba(99, 102, 241, 0.07)' }}
                                  content={(tooltipProps) => (
                                    <ChartBarTooltip {...tooltipProps} chart={chart} />
                                  )}
                                />
                                {chart.bars.map((bar) => (
                                  <Bar
                                    key={bar.key}
                                    dataKey={bar.key}
                                    fill={bar.color}
                                    name={bar.name}
                                    radius={[4, 4, 0, 0]}
                                  />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                            <div className="chart-legend" role="list" aria-label="Series legend">
                              {chart.bars.map((bar) => (
                                <span key={bar.key} className="chart-legend-item" role="listitem">
                                  <span
                                    className="chart-legend-swatch"
                                    style={{ backgroundColor: bar.color }}
                                    aria-hidden
                                  />
                                  <span>{bar.name}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        </section>
                      ))}

                      <section className="card table-card">
                        <div className="table-card-header">
                          <h3>Raw Query Results</h3>
                        </div>

                        <div className="table-wrapper">
                          <table>
                            <thead>
                              <tr>
                                {resultColumnKeys.map((field) => (
                                  <th
                                    key={field}
                                    style={{
                                      borderBottom: `3px solid ${getFieldColor(field)}`
                                    }}
                                  >
                                    <span
                                      className="header-chip"
                                      style={{
                                        color: getFieldColor(field),
                                        borderColor: getFieldColor(field)
                                      }}
                                    >
                                      {field}
                                    </span>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResult.data.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {resultColumnKeys.map((field) => (
                                    <td key={field}>
                                      <span
                                        className="cell-badge"
                                        style={{
                                          borderLeft: `4px solid ${getFieldColor(field)}`
                                        }}
                                      >
                                        {row[field]}
                                      </span>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;