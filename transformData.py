"""
AirLense — ETL: raw CSVs under ./data/ → ./clean_data/ for MySQL LOAD DATA.
"""
import pandas as pd
import numpy as np
import os

# ============================================================
# PATHS — raw data in ./data/, cleaned output in ./clean_data/
# ============================================================
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
CLEAN_DATA_DIR = os.path.join(SCRIPT_DIR, 'clean_data')
os.makedirs(CLEAN_DATA_DIR, exist_ok=True)

def data_path(filename):
    return os.path.join(DATA_DIR, filename)

def clean_path(filename):
    return os.path.join(CLEAN_DATA_DIR, filename)


# ============================================================
# LOAD RAW DATA (using actual files in data/)
# ============================================================
country_meta  = pd.read_csv(data_path('Metadata_Country_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv'))
mortality_raw = pd.read_csv(data_path('API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv'), skiprows=4)
oecd_raw      = pd.read_csv(data_path('OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv'))
aqi_raw       = pd.read_csv(data_path('AQI and Lat Long of Countries.csv'))
who_raw       = pd.read_csv(data_path('who_ambient_air_quality_database_version_2023_(v6.0).xlsx - Update 2023 (V6.0).csv'))
pm25_raw      = pd.read_csv(data_path('API_EN.ATM.PM25.MC.M3_DS2_en_csv_v2_316.csv'), skiprows=4)
pm25_meta_country   = pd.read_csv(data_path('Metadata_Country_API_EN.ATM.PM25.MC.M3_DS2_en_csv_v2_316.csv'))
pm25_meta_indicator = pd.read_csv(data_path('Metadata_Indicator_API_EN.ATM.PM25.MC.M3_DS2_en_csv_v2_316.csv'))
aq_health_raw       = pd.read_csv(data_path('air_quality_health_dataset.csv'))

print("All raw data loaded.")


# ============================================================
# SCHEMA UNIFICATION — ISO3 COUNTRY CODE MAPPING
# ============================================================
iso3_map = dict(zip(who_raw['country_name'], who_raw['iso3']))

for _, row in oecd_raw[['REF_AREA', 'Reference area']].drop_duplicates().iterrows():
    if row['Reference area'] not in iso3_map:
        iso3_map[row['Reference area']] = row['REF_AREA']

for _, row in mortality_raw[['Country Name', 'Country Code']].drop_duplicates().iterrows():
    if row['Country Name'] not in iso3_map:
        iso3_map[row['Country Name']] = row['Country Code']

manual_fixes = {
    'Russian Federation':                'RUS',
    "Côte d'Ivoire":                     'CIV',
    'Democratic Republic of the Congo':  'COD',
    'Congo':                             'COG',
    'Kingdom of Eswatini':               'SWZ',
    "China (People's Republic of)":      'CHN',
    'Bolivia (Plurinational State of)':  'BOL',
    'Venezuela (Bolivarian Republic of)':'VEN',
    'Iran (Islamic Republic of)':        'IRN',
    'Syrian Arab Republic':              'SYR',
    'Republic of Korea':                 'KOR',
    'Türkiye':                           'TUR',
    'Turkey':                            'TUR',
    'Viet Nam':                          'VNM',
    'Lao PDR':                           'LAO',
    'Republic of Moldova':               'MDA',
    'Republic of North Macedonia':       'MKD',
    'State of Palestine':                'PSE',
    'United States of America':          'USA',
}
iso3_map.update(manual_fixes)

# Cities only appear in air_quality_health_dataset.csv (no country column) — fixed ISO3 for BCNF FK to country
AQ_HEALTH_CITY_TO_ISO3 = {
    'Los Angeles': 'USA',
    'Beijing':     'CHN',
    'London':      'GBR',
    'Mexico City': 'MEX',
    'Delhi':       'IND',
    'Cairo':       'EGY',
    'Tokyo':       'JPN',
    'São Paulo':   'BRA',
}

NON_COUNTRY_CODES = {
    'AFE','AFW','ARB','CEB','CSS','EAP','EAR','EAS','ECA','ECS','EMU',
    'EUU','FCS','HIC','HPC','IBD','IBT','IDA','IDB','IDX','INX','LAC',
    'LCN','LDC','LIC','LMC','LMY','LTE','MEA','MIC','MNA','NAC','OED',
    'OSS','PRE','PSS','PST','SAS','SSA','SSF','SST','TEA','TEC','TLA',
    'TMN','TSA','TSS','UMC','WLD',
    'EU28','EU27','EA19','G20','OECDSO','OECDA','OECDE','ASEAN','A9',
    'W','TWN','F98',
}

print("ISO3 mapping built.")


# ============================================================
# TABLE 1: country
# ============================================================
countries = country_meta[['Country Code', 'Region', 'IncomeGroup', 'SpecialNotes', 'TableName']].copy()
countries.columns = ['country_code', 'region', 'income_group', 'special_notes', 'table_name']
countries = countries.dropna(subset=['country_code'])
countries = countries[~countries['country_code'].isin(NON_COUNTRY_CODES)]
countries = countries.drop_duplicates(subset=['country_code'])
countries.to_csv(clean_path('country.csv'), index=False)
print(f"TABLE 1 — country:                    {len(countries)} rows")


# ============================================================
# TABLE 2: indicator
# ============================================================
indicators = pd.DataFrame([
    {'indicator_code': 'SH.STA.AIRP.P5', 'indicator_name': 'Mortality rate attributed to household and ambient air pollution, age-standardized (per 100,000 population)', 'source_organization': 'World Health Organization (WHO) via World Bank'},
    {'indicator_code': 'DALY_PM25', 'indicator_name': 'Disability-adjusted life years (DALYs) from PM2.5 outdoor exposure (per 1,000 inhabitants)', 'source_organization': 'OECD Environment Statistics'},
    {'indicator_code': 'EN.ATM.PM25.MC.M3', 'indicator_name': 'PM2.5 air pollution, mean annual exposure (micrograms per cubic meter)', 'source_organization': 'Global Burden of Disease Study 2021 (IHME) via World Bank'},
])
indicators.to_csv(clean_path('indicator.csv'), index=False)
print(f"TABLE 2 — indicator:                  {len(indicators)} rows")


# ============================================================
# TABLE 3: aqi_reference
# ============================================================
aqi_ref = pd.DataFrame([
    {'category_name': 'Good', 'min_value': 0, 'max_value': 50},
    {'category_name': 'Moderate', 'min_value': 51, 'max_value': 100},
    {'category_name': 'Unhealthy for Sensitive Groups', 'min_value': 101, 'max_value': 150},
    {'category_name': 'Unhealthy', 'min_value': 151, 'max_value': 200},
    {'category_name': 'Very Unhealthy', 'min_value': 201, 'max_value': 300},
    {'category_name': 'Hazardous', 'min_value': 301, 'max_value': 2000},
])
aqi_ref.to_csv(clean_path('aqi_reference.csv'), index=False)
print(f"TABLE 3 — aqi_reference:              {len(aqi_ref)} rows")


# ============================================================
# TABLE 4: city_aqi
# ============================================================
city_aqi = aqi_raw[['Country', 'City', 'AQI Value', 'CO AQI Value', 'Ozone AQI Value', 'NO2 AQI Value', 'PM2.5 AQI Value', 'lat', 'lng']].copy()
city_aqi.columns = ['country', 'city', 'aqi_value', 'co_aqi_value', 'ozone_aqi_value', 'no2_aqi_value', 'pm25_aqi_value', 'lat', 'lng']
city_aqi['country_code'] = city_aqi['country'].map(iso3_map)
city_aqi = city_aqi[['country_code', 'country', 'city', 'aqi_value', 'co_aqi_value', 'ozone_aqi_value', 'no2_aqi_value', 'pm25_aqi_value', 'lat', 'lng']]
city_aqi = city_aqi.drop_duplicates()

unmapped = city_aqi[city_aqi['country_code'].isna()]['country'].unique()
if len(unmapped) > 0:
    print(f"  city_aqi — {len(unmapped)} countries not mapped to ISO3 (rows will be dropped): {list(unmapped)[:5]}...")

# Rows without ISO3 cannot satisfy PK/FK in schema.sql
city_aqi = city_aqi.dropna(subset=['country_code'])

city_aqi.to_csv(clean_path('city_aqi.csv'), index=False)
print(f"TABLE 4 — city_aqi:                   {len(city_aqi)} rows")


# ============================================================
# TABLE 5: mortality_normalized
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
mortality_norm = mortality_norm[mortality_norm['impact_value'].astype(str) != '']
mortality_norm = mortality_norm[~mortality_norm['country_code'].isin(NON_COUNTRY_CODES)]
mortality_norm['year'] = pd.to_numeric(mortality_norm['year'], errors='coerce').astype('Int64')
mortality_norm = mortality_norm.dropna(subset=['year'])
mortality_norm['year'] = mortality_norm['year'].astype(int)
mortality_norm = mortality_norm.reset_index(drop=True)
mortality_norm.to_csv(clean_path('mortality_normalized.csv'), index=False)
print(f"TABLE 5 — mortality_normalized:       {len(mortality_norm)} rows")


# ============================================================
# TABLE 6: oecd_normalized
# ============================================================
oecd_norm = oecd_raw[['REF_AREA', 'TIME_PERIOD', 'OBS_VALUE']].copy()
oecd_norm.columns = ['country_code', 'year', 'obs_value']
oecd_norm = oecd_norm[~oecd_norm['country_code'].isin(NON_COUNTRY_CODES)]
oecd_norm = oecd_norm.dropna(subset=['obs_value'])
oecd_norm = oecd_norm.drop_duplicates()
oecd_norm['year'] = pd.to_numeric(oecd_norm['year'], errors='coerce')
oecd_norm = oecd_norm.dropna(subset=['year'])
oecd_norm['year'] = oecd_norm['year'].astype(int)
oecd_norm = oecd_norm.reset_index(drop=True)
oecd_norm.to_csv(clean_path('oecd_normalized.csv'), index=False)
print(f"TABLE 6 — oecd_normalized:            {len(oecd_norm)} rows")


# ============================================================
# TABLE 7: mortality_wide_raw
# ============================================================
staging_cols = ['Country Code', 'Indicator Code'] + year_cols
mortality_wide = mortality_raw[staging_cols].copy()
mortality_wide.columns = ['country_code', 'indicator_code'] + year_cols
mortality_wide = mortality_wide[~mortality_wide['country_code'].isin(NON_COUNTRY_CODES)]
mortality_wide = mortality_wide.drop_duplicates(subset=['country_code', 'indicator_code'])
mortality_wide.to_csv(clean_path('mortality_wide_raw.csv'), index=False)
print(f"TABLE 7 — mortality_wide_raw:         {len(mortality_wide)} rows")


# ============================================================
# TABLE 8: who_air_quality
# ============================================================
who_aq = who_raw[['iso3', 'city', 'year', 'pm25_concentration', 'pm10_concentration', 'no2_concentration', 'latitude', 'longitude']].copy()
who_aq.columns = ['country_code', 'city', 'year', 'pm25_concentration', 'pm10_concentration', 'no2_concentration', 'latitude', 'longitude']
for col in ['pm25_concentration', 'pm10_concentration', 'no2_concentration']:
    who_aq[col] = pd.to_numeric(who_aq[col], errors='coerce')
who_aq['year'] = pd.to_numeric(who_aq['year'], errors='coerce')
who_aq = who_aq.dropna(subset=['country_code', 'city', 'year'])
who_aq = who_aq.drop_duplicates()
who_aq['year'] = who_aq['year'].astype('Int64')
who_aq = who_aq.reset_index(drop=True)
who_aq.to_csv(clean_path('who_air_quality.csv'), index=False)
print(f"TABLE 8 — who_air_quality:            {len(who_aq)} rows")


# ============================================================
# TABLE 9: pm25_exposure_normalized
# ============================================================
pm25_year_cols = [c for c in pm25_raw.columns if str(c).isdigit() and int(c) >= 1990]

pm25_clean = pm25_raw[~pm25_raw['Country Code'].isin(NON_COUNTRY_CODES)].copy()
pm25_clean = pm25_clean.dropna(subset=pm25_year_cols, how='all')
pm25_clean = pm25_clean[['Country Name', 'Country Code'] + pm25_year_cols].copy()
pm25_clean.columns = ['country_name', 'country_code'] + pm25_year_cols

pm25_long = pm25_clean.melt(
    id_vars=['country_name', 'country_code'],
    value_vars=pm25_year_cols,
    var_name='year',
    value_name='pm25_exposure_ugm3'
)
pm25_long = pm25_long.dropna(subset=['pm25_exposure_ugm3'])
pm25_long['year'] = pm25_long['year'].astype(int)
pm25_long['indicator_code'] = 'EN.ATM.PM25.MC.M3'
pm25_long = pm25_long[['country_code', 'country_name', 'year', 'pm25_exposure_ugm3', 'indicator_code']]
pm25_long = pm25_long.sort_values(['country_code', 'year']).reset_index(drop=True)
pm25_long.to_csv(clean_path('pm25_exposure_normalized.csv'), index=False)
print(f"TABLE 9 — pm25_exposure_normalized:   {len(pm25_long)} rows, {pm25_long['country_code'].nunique()} countries")


# ============================================================
# TABLE 10: population_density_category (lookup, BCNF)
# ============================================================
density_lookup = pd.DataFrame([
    {'density_category': 'Urban'},
    {'density_category': 'Suburban'},
    {'density_category': 'Rural'},
])
density_lookup.to_csv(clean_path('population_density_category.csv'), index=False)
print(f"TABLE 10 — population_density_category: {len(density_lookup)} rows")


# ============================================================
# TABLE 11: city_air_health_daily (BCNF)
# One row per (country, city, date); density_category → population_density_category
# ============================================================
cah = aq_health_raw.rename(columns={'date': 'obs_date', 'population_density': 'density_category'}).copy()
cah['country_code'] = cah['city'].map(AQ_HEALTH_CITY_TO_ISO3)
unmapped_cities = cah[cah['country_code'].isna()]['city'].unique()
if len(unmapped_cities) > 0:
    print(f"  city_air_health_daily — cities without ISO3 map (rows dropped): {list(unmapped_cities)}")

cah = cah.dropna(subset=['country_code'])
cah = cah[~cah['country_code'].isin(NON_COUNTRY_CODES)]

for col in ('aqi', 'humidity', 'hospital_admissions', 'hospital_capacity'):
    cah[col] = pd.to_numeric(cah[col], errors='coerce')
for col in ('pm2_5', 'pm10', 'no2', 'o3', 'temperature'):
    cah[col] = pd.to_numeric(cah[col], errors='coerce')

cah['obs_date'] = pd.to_datetime(cah['obs_date'], errors='coerce').dt.strftime('%Y-%m-%d')
cah = cah.dropna(subset=['obs_date'])

allowed_density = set(density_lookup['density_category'])
bad_density = cah[~cah['density_category'].isin(allowed_density)]['density_category'].unique()
if len(bad_density) > 0:
    print(f"  city_air_health_daily — unknown density categories (rows dropped): {list(bad_density)}")
cah = cah[cah['density_category'].isin(allowed_density)]

valid_country = set(countries['country_code'])
before = len(cah)
cah = cah[cah['country_code'].isin(valid_country)]
if before != len(cah):
    print(f"  city_air_health_daily — dropped {before - len(cah)} rows (country_code not in country dimension)")

out_cols = [
    'country_code', 'city', 'obs_date', 'aqi', 'pm2_5', 'pm10', 'no2', 'o3',
    'temperature', 'humidity', 'hospital_admissions', 'hospital_capacity', 'density_category',
]
cah = cah[out_cols].drop_duplicates(subset=['country_code', 'city', 'obs_date'])
cah = cah.sort_values(['country_code', 'city', 'obs_date']).reset_index(drop=True)
cah.to_csv(clean_path('city_air_health_daily.csv'), index=False)
print(f"TABLE 11 — city_air_health_daily:       {len(cah)} rows")


# ============================================================
# DONE
# ============================================================
print()
print("=" * 57)
print("All tables written to clean_data/")
print("=" * 57)
print("  TABLE 1  — clean_data/country.csv")
print("  TABLE 2  — clean_data/indicator.csv")
print("  TABLE 3  — clean_data/aqi_reference.csv")
print("  TABLE 4  — clean_data/city_aqi.csv")
print("  TABLE 5  — clean_data/mortality_normalized.csv")
print("  TABLE 6  — clean_data/oecd_normalized.csv")
print("  TABLE 7  — clean_data/mortality_wide_raw.csv")
print("  TABLE 8  — clean_data/who_air_quality.csv")
print("  TABLE 9  — clean_data/pm25_exposure_normalized.csv")
print("  TABLE 10 — clean_data/population_density_category.csv")
print("  TABLE 11 — clean_data/city_air_health_daily.csv")
print("  VIEW     — health_impacts (define in schema.sql)")
print()
print("  Unified join key: country_code (ISO3)")
