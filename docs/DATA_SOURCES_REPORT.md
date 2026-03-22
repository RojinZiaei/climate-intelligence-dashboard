# AirLense — Data Sources Report

**Purpose:** Explain what each dataset measures, how it differs from the others, and what is redundant vs complementary. This supports correct interpretation of queries and custom SQL.

**Related:** For **relational normal forms** (NF1–BCNF) on the normalized schema, see [NORMALIZATION_PROOF.md](NORMALIZATION_PROOF.md). For **three substantive data aspects** (health burden, national exposure, subnational air quality), see [ASSIGNMENT_THREE_ASPECTS.md](ASSIGNMENT_THREE_ASPECTS.md).

---

## 1. Executive summary

The dashboard combines **multiple independent streams** about air pollution and health. They are **not** duplicates of the same facts:

| Theme | Role in the dashboard |
|--------|------------------------|
| **National health burden** | World Bank **SH** mortality (`SH.STA.AIRP.P5`) — deaths attributed to air pollution per country/year. |
| **National exposure (modeled)** | World Bank **EN** PM2.5 (`EN.ATM.PM25.MC.M3`) — mean annual PM2.5 exposure (µg/m³) per country/year. |
| **Urban / station air quality** | **WHO** Ambient Air Quality Database — PM2.5, PM10, NO2 at **city/station** level. |
| **City-level AQI snapshot** | Separate **AQI** dataset — index values and sub-indices with coordinates. |
| **OECD burden** | **OECD** DALYs from outdoor PM2.5 — national, comparable to a health-burden lens. |

The only **intentional duplication** in storage is **wide vs long** World Bank mortality (`mortality_wide_raw` vs `mortality_normalized`) — same indicator, two shapes; analytics should prefer the **normalized** table.

**Note:** The World Bank **SH** extract shipped in `data/API_SH.STA.AIRP.P5…csv` currently has **values only under the 2019 column** for this indicator (other years are blank). **Mortality** comparisons across consecutive years need a fuller WDI download; the canned **OECD DALY (2018 vs 2019)** query uses a **self-join** on **`oecd_normalized`** (2018 ⟕ 2019), which includes both years.

---

## 2. Dataset-by-dataset reference

### 2.1 World Bank SH — air-pollution mortality (`mortality_normalized`)

- **Indicator:** `SH.STA.AIRP.P5`  
- **Meaning:** Mortality rate **attributed to household and ambient air pollution**, age-standardized (per 100,000 population).  
- **Grain:** **Country × year** (one row per country per year for this indicator).  
- **Raw input:** `data/API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv`  
- **Clean table:** `mortality_normalized` (+ optional wide staging `mortality_wide_raw`).  

**This is not concentration data.** It is a **health outcome / burden** statistic at national level.

---

### 2.2 World Bank EN — PM2.5 mean exposure (`pm25_exposure_normalized`)

- **Indicator:** `EN.ATM.PM25.MC.M3`  
- **Meaning:** **Mean annual PM2.5 exposure** (micrograms per cubic meter) — national-level estimate.  
- **Grain:** **Country × year** (with `indicator_code`).  
- **Raw input:** `data/API_EN.ATM.PM25.MC.M3_DS2_en_csv_v2_316.csv`  
- **Clean table:** `pm25_exposure_normalized`.  

**Relationship to SH mortality:** Same broad topic (air pollution), **different measure** (exposure µg/m³ vs mortality rate). They can be **joined on `country_code` and year** for cross-indicator analysis; correlation does not imply duplicate data.

---

### 2.3 WHO Ambient Air Quality Database (`who_air_quality`)

- **Meaning:** **Measured or reported concentrations** — PM2.5, PM10, NO2 (µg/m³) for **cities / stations**.  
- **Grain:** **Country × city × year × (latitude, longitude)** (unique station reading in the schema).  
- **Raw input:** `data/who_ambient_air_quality_database_version_2023_(v6.0)...csv`  

**Relationship to SH mortality:**  
- **Not the same data.** SH is a **national mortality rate**; WHO table is **local air quality**.  
- WHO as an **organization** also contributes to global health evidence, but the **rows in `who_air_quality`** are **pollution levels**, not the SH mortality series.

**Relationship to EN PM2.5:**  
- Both involve PM2.5 in µg/m³, but **EN is national mean exposure** from the World Bank series; **WHO is often city/station-specific**. Aggregating WHO to country-level averages is a **derived** comparison, not a second copy of EN.

---

### 2.4 City AQI dataset (`city_aqi`)

- **Meaning:** **Air Quality Index** and pollutant sub-indices (e.g. PM2.5 AQI) plus **lat/lng**.  
- **Grain:** **Country code × city × lat × lng** (monitoring points / cities).  
- **Raw input:** `data/AQI and Lat Long of Countries.csv`  

**Relationship to WHO:** Both are “subnational air quality,” but **AQI is an index** and **WHO table uses µg/m³** (and different coverage). They are **complementary**, not identical.

---

### 2.5 OECD PM2.5 DALYs (`oecd_normalized`)

- **Meaning:** Disability-adjusted life years (DALYs) from **outdoor PM2.5** exposure (OECD definition / series).  
- **Grain:** **Country × year** (`obs_value`).  
- **Raw input:** `data/OECD.ENV.EPI,...csv`  

**Relationship to SH:** Both are **burden-style** metrics but from **different institutions and methodologies**. Useful for **dual-source** comparisons (e.g. with `health_impacts` view that unions OECD with WB mortality rows).

---

### 2.6 Reference / dimension tables

| Table | Role |
|--------|------|
| `country` | Regions, income group, display name (`table_name`), ISO3 `country_code`. |
| `indicator` | Definitions for `SH…`, `EN…`, `DALY_PM25`, etc. |
| `aqi_reference` | AQI category bounds for range JOINs. |
| `health_impacts` | **VIEW:** `mortality_normalized` ∪ OECD as `DALY_PM25` — unified **health** lens, not a fourth raw file. |

---

## 3. Redundancy and what to use for analysis

### 3.1 Redundant (same facts, two layouts)

- **`mortality_wide_raw`** vs **`mortality_normalized`**  
  - Same underlying **SH.STA.AIRP.P5** World Bank extract.  
  - **Prefer `mortality_normalized`** for SQL, charts, and joins (BCNF-friendly).  
  - Keep wide table only if you need **year-as-column** exports or legacy tools.

### 3.2 Not redundant (different measures or grain)

- **SH mortality** ≠ **WHO concentrations**  
- **SH mortality** ≠ **EN PM2.5 exposure**  
- **WHO city PM2.5** ≠ **EN national PM2.5** (same unit possible, different spatial aggregation)  
- **City AQI** ≠ **WHO µg/m³** (index vs physical concentration)  
- **OECD DALY** ≠ **SH mortality** (different source and metric design)

---

## 4. Recommended join keys and analysis patterns

- **National joins:** `country_code` + **`year`** where both sides have a time dimension.  
- **City AQI / WHO to country attributes:** `country_code` → `country`.  
- **Labels:** use `country.table_name` for display, not redundant name columns removed from `city_aqi` for normalization.  

**Example meaningful analyses (as implemented in canned queries):**

- Exposure vs burden: **EN** + **SH** (same year).  
- Ground vs modeled PM2.5: **WHO** (aggregated) vs **EN** (national).  
- Subnational pressure vs national mortality: **city_aqi** + **SH**.  
- Multi-source panel: **EN + SH + OECD + WHO** (strict inner join on countries with all sources — small but comparable set).

---

## 5. Conclusion

- **SH mortality** and **WHO data in this project are not the same data:** one is **national mortality attributed to air pollution**, the other is **city/station air pollutant concentrations**.  
- **EN PM2.5** adds a **national exposure** series distinct from both.  
- The only clear **storage redundancy** to be aware of is **wide vs normalized** WB mortality; prefer **normalized** for reporting and dashboards.

---

*Generated for the **AirLense** repository. Aligns with `schema.sql`, `transformData.py`, and `Backend/server.js` canned queries as of the report date.*
