# Data Files & Database Schema Reference

## Database: `air_pollution`

---

## 1. Metadata_Country_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv

| CSV Column | Database Column | Type |
|------------|-----------------|------|
| Country Code | country_code | VARCHAR(10) |
| Region | region | VARCHAR(100) |
| IncomeGroup | income_group | VARCHAR(100) |K
| SpecialNotes | special_notes | TEXT |
| TableName | table_name | VARCHAR(200) |

**→ Table:** `country`

| | |
|---|---|
| **Primary Key** | country_code |
| **Foreign Keys** | — |

---

## 2. Metadata_Indicator_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv

| CSV Column | Database Column | Type |
|------------|-----------------|------|
| INDICATOR_CODE | indicator_code | VARCHAR(50) |
| INDICATOR_NAME | indicator_name | VARCHAR(255) |
| SOURCE_NOTE | *(skipped)* | — |
| SOURCE_ORGANIZATION | source_organization | VARCHAR(255) |

**→ Table:** `indicator`

| | |
|---|---|
| **Primary Key** | indicator_code |
| **Foreign Keys** | — |

---

## 3. API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv (World Bank Mortality)

| CSV Column | Database Column | Type |
|------------|-----------------|------|
| Country Name | *(skipped)* | — |
| Country Code | country_code | VARCHAR(10) |
| Indicator Name | *(skipped)* | — |
| Indicator Code | indicator_code | VARCHAR(50) |
| 1960 … 2025 | \`1960\` … \`2025\` | DECIMAL(10,3) each |

**→ Table:** `mortality_wide_raw` (staging)

| | |
|---|---|
| **Primary Key** | (country_code, indicator_code) |
| **Foreign Keys** | — |

**→ Table:** `mortality_normalized` (via unpivot)

| | |
|---|---|
| **Columns** | country_code, indicator_code, year, impact_value |
| **Primary Key** | (country_code, indicator_code, year) |
| **Foreign Keys** | country_code → country(country_code), indicator_code → indicator(indicator_code) |

---

## 4. OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv

| CSV Column | Database Column | Type |
|------------|-----------------|------|
| REF_AREA | ref_area | VARCHAR(10) |
| TIME_PERIOD | time_period | INT |
| OBS_VALUE | obs_value | DECIMAL(15,5) |
| *(all others)* | *(skipped)* | — |

**→ Table:** `oecd_normalized`

| | |
|---|---|
| **Primary Key** | (ref_area, time_period) |
| **Foreign Keys** | — |

---

## 5. AQI and Lat Long of Countries.csv

| CSV Column | Database Column | Type |
|------------|-----------------|------|
| Country | country | VARCHAR(200) |
| City | city | VARCHAR(200) |
| AQI Value | aqi_value | INT |
| AQI Category | *(skipped)* | — |
| CO AQI Value | co_aqi_value | INT |
| CO AQI Category | *(skipped)* | — |
| Ozone AQI Value | ozone_aqi_value | INT |
| Ozone AQI Category | *(skipped)* | — |
| NO2 AQI Value | no2_aqi_value | INT |
| NO2 AQI Category | *(skipped)* | — |
| PM2.5 AQI Value | pm25_aqi_value | INT |
| PM2.5 AQI Category | *(skipped)* | — |
| lat | lat | DECIMAL(10,6) |
| lng | lng | DECIMAL(10,6) |

**→ Table:** `city_aqi`

| | |
|---|---|
| **Primary Key** | (country, city, lat, lng) |
| **Foreign Keys** | — |

---

## 6. aqi_reference (no CSV – hardcoded)

| Column | Type |
|--------|------|
| category_name | VARCHAR(50) |
| min_value | INT |
| max_value | INT |

| | |
|---|---|
| **Primary Key** | category_name |
| **Foreign Keys** | — |

**Values:** Good (0–50), Moderate (51–100), Unhealthy (101–150), Hazardous (151–999)

---

## 7. health_impacts (derived – no direct CSV)

| Column | Type |
|--------|------|
| country_code | VARCHAR(10) |
| indicator_code | VARCHAR(50) |
| year | INT |
| impact_value | DECIMAL(15,5) |

| | |
|---|---|
| **Primary Key** | (country_code, indicator_code, year) |
| **Foreign Keys** | country_code → country(country_code), indicator_code → indicator(indicator_code) |

**Source:** Union of `mortality_normalized` and `oecd_normalized` (with indicator_code = 'DALY_PM25')

---

## Summary: All Tables

| Table | Primary Key | Foreign Keys |
|-------|-------------|--------------|
| country | country_code | — |
| indicator | indicator_code | — |
| health_impacts | (country_code, indicator_code, year) | → country, indicator |
| aqi_reference | category_name | — |
| city_aqi | (country, city, lat, lng) | — |
| mortality_wide_raw | — | — |
| mortality_normalized | (country_code, indicator_code, year) | → country, indicator |
| oecd_normalized | (ref_area, time_period) | — |
