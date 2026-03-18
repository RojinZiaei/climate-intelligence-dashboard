import pandas as pd
import numpy as np

# 1. LOAD RAW DATA
country_meta = pd.read_csv('/Users/nazdimziaei/Downloads/AirPollutionData/Data/MetadataCountry.csv')
mortality_raw = pd.read_csv('/Users/nazdimziaei/Downloads/AirPollutionData/Data/mortality_trimmed.csv')
oecd_raw = pd.read_csv('/Users/nazdimziaei/Downloads/AirPollutionData/Data/OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv')
aqi_raw = pd.read_csv('/Users/nazdimziaei/Downloads/AirPollutionData/Data/AQI and Lat Long of Countries.csv')
who_raw = pd.read_csv('/Users/nazdimziaei/Downloads/AirPollutionData/Data/who_ambient_air_quality_database_version_2023_(v6.0).xlsx - Update 2023 (V6.0).csv')

# ============================================================
# TABLE 1: country
# Schema: country(country_code, region, income_group, special_notes, table_name)
# ============================================================
countries = country_meta[['Country Code', 'Region', 'IncomeGroup', 'SpecialNotes', 'TableName']].copy()
countries.columns = ['country_code', 'region', 'income_group', 'special_notes', 'table_name']
countries = countries.dropna(subset=['country_code']).drop_duplicates(subset=['country_code'])
countries.to_csv('country.csv', index=False)

# ============================================================
# TABLE 2: indicator
# Schema: indicator(indicator_code, indicator_name, source_organization)
# ============================================================
indicators = pd.DataFrame([
    {'indicator_code': 'SH.STA.AIRP.P5', 'indicator_name': 'Mortality rate attributed to air pollution', 'source_organization': 'World Bank'},
    {'indicator_code': 'DALY_PM25', 'indicator_name': 'Disability-adjusted life years (DALYs) from PM2.5', 'source_organization': 'OECD'}
])
indicators.to_csv('indicator.csv', index=False)

# ============================================================
# TABLE 3: aqi_reference
# Schema: aqi_reference(category_name, min_value, max_value)
# ============================================================
aqi_ref = pd.DataFrame([
    {'category_name': 'Good', 'min_value': 0, 'max_value': 50},
    {'category_name': 'Moderate', 'min_value': 51, 'max_value': 100},
    {'category_name': 'Unhealthy for Sensitive Groups', 'min_value': 101, 'max_value': 150},
    {'category_name': 'Unhealthy', 'min_value': 151, 'max_value': 200},
    {'category_name': 'Very Unhealthy', 'min_value': 201, 'max_value': 300},
    {'category_name': 'Hazardous', 'min_value': 301, 'max_value': 2000}
])
aqi_ref.to_csv('aqi_reference.csv', index=False)

# ============================================================
# TABLE 4: city_aqi (all pollutant columns, no category — use aqi_reference)
# Schema: city_aqi(country, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng)
# ============================================================
city_aqi = aqi_raw[['Country', 'City', 'AQI Value', 'CO AQI Value', 'Ozone AQI Value', 'NO2 AQI Value', 'PM2.5 AQI Value', 'lat', 'lng']].copy()
city_aqi.columns = ['country', 'city', 'aqi_value', 'co_aqi_value', 'ozone_aqi_value', 'no2_aqi_value', 'pm25_aqi_value', 'lat', 'lng']
city_aqi = city_aqi.drop_duplicates()
city_aqi.to_csv('city_aqi.csv', index=False)

# ============================================================
# TABLE 5: mortality_normalized (World Bank only, unpivoted)
# Schema: mortality_normalized(country_code, indicator_code, year, impact_value)
# ============================================================
year_cols = [str(y) for y in range(1960, 2026) if str(y) in mortality_raw.columns]
mortality_norm = mortality_raw.melt(
    id_vars=['Country Code', 'Indicator Code'],
    value_vars=year_cols,
    var_name='year',
    value_name='impact_value'
)
mortality_norm.columns = ['country_code', 'indicator_code', 'year', 'impact_value']
mortality_norm = mortality_norm.dropna(subset=['impact_value'])
mortality_norm.to_csv('mortality_normalized.csv', index=False)

# ============================================================
# TABLE 6: oecd_normalized (OECD native column names)
# Schema: oecd_normalized(ref_area, time_period, obs_value)
# ============================================================
oecd_norm = oecd_raw[['REF_AREA', 'TIME_PERIOD', 'OBS_VALUE']].copy()
oecd_norm.columns = ['ref_area', 'time_period', 'obs_value']
oecd_norm = oecd_norm.drop_duplicates()
oecd_norm.to_csv('oecd_normalized.csv', index=False)

# ============================================================
# TABLE 7: mortality_wide_raw (staging — wide format, no country_name/indicator_name)
# Schema: mortality_wide_raw(country_code, indicator_code, 1960, 1961, ..., 2025)
# ============================================================
staging_cols = ['Country Code', 'Indicator Code'] + year_cols
mortality_wide = mortality_raw[staging_cols].copy()
mortality_wide.columns = ['country_code', 'indicator_code'] + year_cols
mortality_wide = mortality_wide.drop_duplicates(subset=['country_code', 'indicator_code'])
mortality_wide.to_csv('mortality_wide_raw.csv', index=False)

# ============================================================
# TABLE 8: who_air_quality (WHO Ambient Air Quality Database)
# Schema: who_air_quality(country_code, city, year, pm25_concentration, pm10_concentration, no2_concentration, latitude, longitude)
# BCNF: PK is (country_code, city, year, latitude, longitude)
#   FD: (country_code, city, year, latitude, longitude) → pm25_concentration, pm10_concentration, no2_concentration
#   Only determinant is the composite PK → BCNF satisfied
# ============================================================
who_aq = who_raw[['iso3', 'city', 'year', 'pm25_concentration', 'pm10_concentration', 'no2_concentration', 'latitude', 'longitude']].copy()
who_aq.columns = ['country_code', 'city', 'year', 'pm25_concentration', 'pm10_concentration', 'no2_concentration', 'latitude', 'longitude']
# Convert concentration columns to numeric (WHO uses 'NA' strings)
for col in ['pm25_concentration', 'pm10_concentration', 'no2_concentration']:
    who_aq[col] = pd.to_numeric(who_aq[col], errors='coerce')
who_aq['year'] = pd.to_numeric(who_aq['year'], errors='coerce')
who_aq = who_aq.dropna(subset=['country_code', 'city', 'year'])
who_aq = who_aq.drop_duplicates()
who_aq.to_csv('who_air_quality.csv', index=False)

# ============================================================
# TABLE 9: health_impacts is a SQL VIEW (no CSV needed)
#   CREATE VIEW health_impacts AS
#     SELECT country_code, indicator_code, year, impact_value FROM mortality_normalized
#     UNION ALL
#     SELECT ref_area, 'DALY_PM25', time_period, obs_value FROM oecd_normalized;
# ============================================================

print("Data successfully transformed into 8 clean CSVs!")
print("Tables: country, indicator, aqi_reference, city_aqi, mortality_normalized, oecd_normalized, mortality_wide_raw, who_air_quality")
print("Note: health_impacts is a SQL VIEW — see schema.sql")