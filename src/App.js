import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [catalog, setCatalog] = useState([]);
  const [legendMap, setLegendMap] = useState({});
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/global-health-snapshot');
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typedInsight, setTypedInsight] = useState('');

  // Custom query state
  const [customMode, setCustomMode] = useState(false);
  const [customSql, setCustomSql] = useState('SELECT c.table_name AS country, c.region, c.income_group\nFROM country c\nWHERE c.region IS NOT NULL\nLIMIT 10;');
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError] = useState('');
  const [customLoading, setCustomLoading] = useState(false);

  // 1. Fetch Catalog & Legend on mount
  useEffect(() => {
    fetch(`${API_BASE}/query-catalog`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load query catalog');
        return res.json();
      })
      .then(setCatalog)
      .catch((err) => {
        console.error(err);
        setError('Could not load query catalog.');
      });

    fetch(`${API_BASE}/source-legend`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load source legend');
        return res.json();
      })
      .then(setLegendMap)
      .catch((err) => {
        console.error(err);
        setError('Could not load source legend.');
      });
  }, []);

  // 2. Fetch Data when selected endpoint changes
  useEffect(() => {
    if (!selectedEndpoint) return;

    setLoading(true);
    setError('');

    fetch(`http://localhost:3000${selectedEndpoint}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch query results');
        return res.json();
      })
      .then((data) => {
        setQueryResult(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [selectedEndpoint]);

  // 3. Handle Typing Effect for Insights
  const selectedQueryMeta = useMemo(() => {
    return catalog.find((query) => query.endpoint === selectedEndpoint);
  }, [catalog, selectedEndpoint]);

  useEffect(() => {
    if (!selectedQueryMeta?.description) {
      setTypedInsight('');
      return;
    }

    let i = 0;
    const text = selectedQueryMeta.description;
    setTypedInsight('');

    const interval = setInterval(() => {
      i += 1;
      setTypedInsight(text.slice(0, i));

      if (i >= text.length) {
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [selectedQueryMeta]);

  // 4. Color Mapping Helper
  const getFieldColor = (fieldName) => {
    if (!queryResult?.sourceMap) return '#1f2937';
    const tableName = queryResult.sourceMap[fieldName];
    return legendMap[tableName]?.color || '#1f2937';
  };

  // 5. Chart Configurations for the 10 Queries (8-table schema)
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

      case '/api/decade-trend':
        return [{
          title: 'OECD DALYs: 2010 vs 2019 (Europe & Central Asia)',
          xKey: 'country_name',
          bars: [
            { key: 'daly_2010', color: getFieldColor('daly_2010'), name: '2010 DALYs' },
            { key: 'daly_2019', color: getFieldColor('daly_2019'), name: '2019 DALYs' }
          ]
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
          title: 'World Bank Mortality vs OECD DALYs (2017)',
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

      case '/api/health-data-coverage':
        return [{
          title: 'Total Health Records by Region (via VIEW)',
          xKey: 'region',
          bars: [{ key: 'total_records', color: getFieldColor('total_records'), name: 'Total Data Records' }]
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

      default:
        return [];
    }
  }, [queryResult, selectedEndpoint, legendMap]);

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
          <h1>BCNF Air Pollution &amp; Health Dashboard</h1>
          <p>
            9-table relational schema with multi-source data analysis — World Bank mortality, OECD DALYs, WHO air quality, and city-level AQI.
          </p>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar card">
          <h2 className="sidebar-title">Queries</h2>

          <button
            className={`query-button custom-query-btn ${customMode ? 'active' : ''}`}
            onClick={() => { setCustomMode(true); setError(''); }}
            style={customMode ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none' } : { background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.15))', border: '1px solid rgba(99,102,241,0.4)', color: '#a5b4fc' }}
          >
            <span className="query-title">✏️ Custom SQL Query</span>
          </button>

          <div style={{ margin: '12px 0 4px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.2px', color: '#94a3b8', fontWeight: 600 }}>Canned Queries</div>

          <div className="query-list">
            {catalog.map((query) => (
              <button
                key={query.id}
                className={`query-button ${!customMode && selectedEndpoint === query.endpoint ? 'active' : ''}`}
                onClick={() => { setCustomMode(false); setSelectedEndpoint(query.endpoint); }}
              >
                <span className="query-title">{query.title}</span>
              </button>
            ))}
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
                  Write a SELECT query against the BCNF schema. Only SELECT is allowed. A LIMIT of 200 is added automatically if not specified.
                </p>
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

                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    Tables: country, indicator, aqi_reference, city_aqi, mortality_normalized, oecd_normalized, who_air_quality, mortality_wide_raw, health_impacts (view)
                  </div>
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

              {error && !loading && (
                <div className="card status-card error-card">
                  <p>{error}</p>
                </div>
              )}

              {queryResult && !loading && !error && (
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
                        <p className="typing-cursor">{typedInsight}</p>
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
                            <ResponsiveContainer width="100%" height={380}>
                              <BarChart
                                data={queryResult.data}
                                margin={{ top: 10, right: 20, left: 10, bottom: 85 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                  dataKey={chart.xKey}
                                  angle={-40}
                                  textAnchor="end"
                                  interval={0}
                                  height={100}
                                  tick={{ fontSize: 12 }}
                                />
                                <YAxis />
                                <Tooltip />
                                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: '20px' }} />
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
                                {queryResult.data.length > 0 &&
                                  Object.keys(queryResult.data[0]).map((field) => (
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
                                  {Object.entries(row).map(([field, value]) => (
                                    <td key={field}>
                                      <span
                                        className="cell-badge"
                                        style={{
                                          borderLeft: `4px solid ${getFieldColor(field)}`
                                        }}
                                      >
                                        {value}
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