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
  const [selectedEndpoint, setSelectedEndpoint] = useState('/api/top-pollution-mortality');
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typedInsight, setTypedInsight] = useState('');

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

  const selectedQueryMeta = useMemo(() => {
    return catalog.find((query) => query.endpoint === selectedEndpoint);
  }, [catalog, selectedEndpoint]);

  useEffect(() => {
    if (!selectedQueryMeta?.insight) {
      setTypedInsight('');
      return;
    }

    let i = 0;
    const text = selectedQueryMeta.insight;
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

  const getFieldColor = (fieldName) => {
    if (!queryResult?.sourceMap) return '#1f2937';
    const tableName = queryResult.sourceMap[fieldName];
    return legendMap[tableName]?.color || '#1f2937';
  };

  const chartConfigs = useMemo(() => {
    if (!queryResult?.data?.length) return [];

    if (selectedEndpoint === '/api/top-pollution-mortality') {
      return [
        {
          title: 'Average PM2.5 AQI and Mortality by Country',
          xKey: 'country_name',
          bars: [
            { key: 'avg_pm25_aqi', color: getFieldColor('avg_pm25_aqi'), name: 'Avg PM2.5 AQI' },
            { key: 'avg_mortality', color: getFieldColor('avg_mortality'), name: 'Avg Mortality' }
          ]
        }
      ];
    }

    if (selectedEndpoint === '/api/aqi-high-pollution-cities') {
      return [
        {
          title: 'Cities with High AQI by Region',
          xKey: 'city_name',
          bars: [
            { key: 'avg_pm25_aqi', color: getFieldColor('avg_pm25_aqi'), name: 'Avg PM2.5 AQI' },
            { key: 'avg_aqi', color: getFieldColor('avg_aqi'), name: 'Avg AQI' },
            { key: 'avg_no2_aqi', color: getFieldColor('avg_no2_aqi'), name: 'Avg NO2 AQI' }
          ]
        }
      ];
    }

    if (selectedEndpoint === '/api/mortality-by-income') {
      return [
        {
          title: 'Average Mortality by Income Group',
          xKey: 'income_group',
          bars: [
            { key: 'avg_mortality', color: getFieldColor('avg_mortality'), name: 'Avg Mortality' }
          ]
        },
        {
          title: 'Average PM2.5 by Income Group',
          xKey: 'income_group',
          bars: [
            { key: 'avg_pm25', color: getFieldColor('avg_pm25'), name: 'Avg PM2.5' }
          ]
        }
      ];
    }

    if (selectedEndpoint === '/api/high-mortality-health-burden') {
      return [
        {
          title: 'Mortality and Health Burden by Country',
          xKey: 'country_name',
          bars: [
            { key: 'avg_mortality', color: getFieldColor('avg_mortality'), name: 'Avg Mortality' },
            { key: 'avg_health_burden', color: getFieldColor('avg_health_burden'), name: 'Avg Health Burden' }
          ]
        }
      ];
    }

    if (selectedEndpoint === '/api/cities-in-high-mortality-countries') {
      return [
        {
          title: 'Cities in High-Mortality Countries',
          xKey: 'city_name',
          bars: [
            { key: 'avg_pm25_aqi', color: getFieldColor('avg_pm25_aqi'), name: 'Avg PM2.5 AQI' },
            { key: 'avg_mortality', color: getFieldColor('avg_mortality'), name: 'Avg Mortality' }
          ]
        }
      ];
    }

    return [];
  }, [queryResult, selectedEndpoint, legendMap]);

  const summaryCards = useMemo(() => {
    if (!queryResult?.data?.length) return [];

    const rows = queryResult.data;

    if (selectedEndpoint === '/api/mortality-by-income') {
      const highestMortality = rows.reduce((max, row) =>
        Number(row.avg_mortality) > Number(max.avg_mortality) ? row : max
      , rows[0]);

      const highestPM25 = rows.reduce((max, row) =>
        Number(row.avg_pm25) > Number(max.avg_pm25) ? row : max
      , rows[0]);

      const totalCountries = rows.reduce((sum, row) => sum + Number(row.countries_count || 0), 0);

      return [
        {
          label: 'Highest Mortality Group',
          value: highestMortality.income_group,
          field: 'income_group'
        },
        {
          label: 'Max Avg Mortality',
          value: highestMortality.avg_mortality,
          field: 'avg_mortality'
        },
        {
          label: 'Max Avg PM2.5',
          value: highestPM25.avg_pm25,
          field: 'avg_pm25'
        },
        {
          label: 'Total Countries Counted',
          value: totalCountries,
          field: 'countries_count'
        }
      ];
    }

    const firstRow = rows[0];
    return Object.entries(firstRow).slice(0, 4).map(([key, value]) => ({
      label: key,
      value,
      field: key
    }));
  }, [queryResult, selectedEndpoint]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <h1>Climate Intelligence Dashboard</h1>
          <p>
            Air pollution health analysis using World Bank mortality, OECD DALYs, city AQI, and country metadata.
          </p>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar card">
          <h2 className="sidebar-title">Canned Queries</h2>

          <div className="query-list">
            {catalog.map((query) => (
              <button
                key={query.id}
                className={`query-button ${selectedEndpoint === query.endpoint ? 'active' : ''}`}
                onClick={() => setSelectedEndpoint(query.endpoint)}
              >
                <span className="query-title">{query.title}</span>
                <span className="query-description">{query.description}</span>
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
          {loading && (
            <div className="card status-card">
              <p>Loading query...</p>
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
                <p>{queryResult.description}</p>

                <div className="meta-row">
                  <div className="pill">
                    <span className="pill-label">Rows</span>
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

                {selectedQueryMeta?.insight && (
                  <section className="insight-box">
                    <h3>Insight</h3>
                    <p className="typing-cursor">{typedInsight}</p>

                    {selectedQueryMeta.tables?.length > 0 && (
                      <div className="insight-tables">
                        <span className="insight-label">Tables used:</span>
                        {selectedQueryMeta.tables.map((table) => (
                          <span
                            key={table}
                            className="insight-table-pill"
                            style={{
                              borderColor: legendMap[table]?.color || '#cbd5e1',
                              color: legendMap[table]?.color || '#334155'
                            }}
                          >
                            {legendMap[table]?.label || table}
                          </span>
                        ))}
                      </div>
                    )}
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
                            margin={{ top: 10, right: 20, left: 10, bottom: 70 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey={chart.xKey}
                              angle={-35}
                              textAnchor="end"
                              interval={0}
                              height={90}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            {chart.bars.map((bar) => (
                              <Bar
                                key={bar.key}
                                dataKey={bar.key}
                                fill={bar.color}
                                name={bar.name}
                                radius={[6, 6, 0, 0]}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </section>
                  ))}

                  <section className="card table-card">
                    <div className="table-card-header">
                      <h3>Query Results</h3>
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
        </main>
      </div>
    </div>
  );
}

export default App;