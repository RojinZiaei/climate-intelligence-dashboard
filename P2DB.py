import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# ----------------------------
# 1) CONFIG
# ----------------------------
MYSQL_USER = "root"
MYSQL_PASSWORD = "SE"
MYSQL_HOST = "127.0.0.1"
MYSQL_PORT = 3306
DB_NAME = "climate_db"

BASE_PATH = "/Users/nazdimziaei/Downloads/Climate"

worldbank_file = f"{BASE_PATH}/API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv"
metadata_file = f"{BASE_PATH}/Metadata_Country_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv"
who_file = f"{BASE_PATH}/who_ambient_air_quality_database_version_2023_(v6.0).xlsx - Update 2023 (V6.0).csv"
aqi_file = f"{BASE_PATH}/AQI and Lat Long of Countries.csv"
oecd_file = f"{BASE_PATH}/OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv"

# ----------------------------
# 2) CONNECTIONS
# ----------------------------
url_no_db = URL.create(
    "mysql+mysqlconnector",
    username=MYSQL_USER,
    password=MYSQL_PASSWORD,
    host=MYSQL_HOST,
    port=MYSQL_PORT,
)

url_with_db = URL.create(
    "mysql+mysqlconnector",
    username=MYSQL_USER,
    password=MYSQL_PASSWORD,
    host=MYSQL_HOST,
    port=MYSQL_PORT,
    database=DB_NAME,
)

engine_no_db = create_engine(url_no_db)
engine = create_engine(url_with_db)

# ----------------------------
# 3) CREATE DATABASE
# ----------------------------
with engine_no_db.connect() as conn:
    conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))
    conn.commit()

# ----------------------------
# 4) WORLD BANK MORTALITY
# ----------------------------
wb = pd.read_csv(worldbank_file, skiprows=4)
wb.columns = wb.columns.map(str).str.strip()

print("\nWorld Bank columns:")
print(wb.columns.tolist())

base_cols = ["Country Name", "Country Code", "Indicator Name", "Indicator Code"]
all_year_cols = [c for c in wb.columns if c.isdigit()]

# Normalize missing values
wb = wb.replace(["..", "", " "], pd.NA)

# Count non-null values per year
non_null_counts = wb[all_year_cols].notna().sum().sort_values(ascending=False)

print("\nWorld Bank non-null counts by year (top 20):")
print(non_null_counts.head(20))

# Keep only years that actually have at least one value
year_cols = [col for col in all_year_cols if wb[col].notna().sum() > 0]

print("\nWorld Bank years with data:")
print(year_cols)

wb = wb[base_cols + year_cols].copy()

print("\nWB wide preview:")
print(wb.head(10))

wb_long = wb.melt(
    id_vars=base_cols,
    value_vars=year_cols,
    var_name="year",
    value_name="mortality_rate_per_100k"
)

wb_long["year"] = pd.to_numeric(wb_long["year"], errors="coerce")
wb_long["mortality_rate_per_100k"] = pd.to_numeric(
    wb_long["mortality_rate_per_100k"], errors="coerce"
)

wb_long = wb_long.rename(columns={
    "Country Name": "country_name",
    "Country Code": "country_code",
    "Indicator Name": "indicator_name",
    "Indicator Code": "indicator_code"
})

# Keep 3-letter codes only
wb_long = wb_long[
    wb_long["country_code"].astype(str).str.match(r"^[A-Z]{3}$", na=False)
].copy()

# Drop rows where the value is missing
wb_long = wb_long[wb_long["mortality_rate_per_100k"].notna()].copy()

print("\nWB long preview:")
print(wb_long.head(20))

print("\nNon-null mortality counts by year:")
if not wb_long.empty:
    print(wb_long.groupby("year")["mortality_rate_per_100k"].count())
else:
    print("No non-null World Bank mortality values found.")

print("\nSample rows with non-null mortality:")
print(wb_long.head(20))

# ----------------------------
# 5) COUNTRY METADATA
# ----------------------------
meta = pd.read_csv(metadata_file)
meta.columns = meta.columns.map(str).str.strip()

meta = meta.rename(columns={
    "Country Code": "country_code",
    "TableName": "country_name",
    "Region": "region",
    "IncomeGroup": "income_group",
    "SpecialNotes": "special_notes"
})

meta_keep = [
    c for c in ["country_code", "country_name", "region", "income_group", "special_notes"]
    if c in meta.columns
]
meta = meta[meta_keep].copy()

print("\nMetadata preview:")
print(meta.head(10))

# ----------------------------
# 6) WHO AIR QUALITY
# ----------------------------
who = pd.read_csv(who_file)
who.columns = who.columns.map(str).str.strip()

print("\nWHO columns:")
print(list(who.columns))

who = who.rename(columns={
    "WHO region": "who_region",
    "WHO Region": "who_region",
    "iso3": "iso3",
    "ISO3": "iso3",
    "Country": "country_name",
    "country_name": "country_name",
    "City": "city_name",
    "city": "city_name",
    "Year": "year",
    "PM10": "pm10_concentration",
    "pm10_concentration": "pm10_concentration",
    "PM2.5": "pm25_concentration",
    "pm25_concentration": "pm25_concentration",
    "NO2": "no2_concentration",
    "no2_concentration": "no2_concentration",
    "Latitude": "latitude",
    "latitude": "latitude",
    "Longitude": "longitude",
    "longitude": "longitude",
    "Population": "population",
    "population": "population",
    "Station type": "type_of_stations",
    "Type of stations": "type_of_stations",
    "type_of_stations": "type_of_stations",
})

who_cols = [
    "who_region", "iso3", "country_name", "city_name", "year",
    "pm10_concentration", "pm25_concentration", "no2_concentration",
    "type_of_stations", "population", "latitude", "longitude"
]
who = who[[c for c in who_cols if c in who.columns]].copy()

for col in [
    "year", "pm10_concentration", "pm25_concentration",
    "no2_concentration", "population", "latitude", "longitude"
]:
    if col in who.columns:
        who[col] = pd.to_numeric(who[col], errors="coerce")

print("\nWHO preview:")
print(who.head(10))

# ----------------------------
# 7) AQI FILE
# ----------------------------
aqi = pd.read_csv(aqi_file)
aqi.columns = aqi.columns.map(str).str.strip()

print("\nAQI columns:")
print(list(aqi.columns))

aqi = aqi.rename(columns={
    "Country": "country_name",
    "City": "city_name",
    "AQI Value": "aqi_value",
    "AQI Category": "aqi_category",
    "CO AQI Value": "co_aqi_value",
    "CO AQI Category": "co_aqi_category",
    "Ozone AQI Value": "ozone_aqi_value",
    "Ozone AQI Category": "ozone_aqi_category",
    "NO2 AQI Value": "no2_aqi_value",
    "NO2 AQI Category": "no2_aqi_category",
    "PM2.5 AQI Value": "pm25_aqi_value",
    "PM2.5 AQI Category": "pm25_aqi_category",
    "lat": "latitude",
    "lng": "longitude",
    "Latitude": "latitude",
    "Longitude": "longitude",
})

aqi_cols = [
    "country_name", "city_name", "aqi_value", "aqi_category",
    "co_aqi_value", "co_aqi_category", "ozone_aqi_value", "ozone_aqi_category",
    "no2_aqi_value", "no2_aqi_category", "pm25_aqi_value", "pm25_aqi_category",
    "latitude", "longitude"
]
aqi = aqi[[c for c in aqi_cols if c in aqi.columns]].copy()

for col in [
    "aqi_value", "co_aqi_value", "ozone_aqi_value",
    "no2_aqi_value", "pm25_aqi_value", "latitude", "longitude"
]:
    if col in aqi.columns:
        aqi[col] = pd.to_numeric(aqi[col], errors="coerce")

print("\nAQI preview:")
print(aqi.head(10))

# ----------------------------
# 8) OECD FILE
# ----------------------------
oecd = pd.read_csv(oecd_file)
oecd.columns = oecd.columns.map(str).str.strip()

print("\nOECD columns:")
print(list(oecd.columns))

oecd = oecd.rename(columns={
    "REF_AREA": "ref_area_code",
    "Reference area": "country_name",
    "FREQ": "frequency_code",
    "MEASURE": "measure_code",
    "Measure": "measure_name",
    "UNIT_MEASURE": "unit_measure_code",
    "Unit of measure": "unit_measure_name",
    "RISK": "risk_code",
    "Risk": "risk_name",
    "AGE": "age_code",
    "Age": "age_name",
    "SEX": "sex_code",
    "Sex": "sex_name",
    "TIME_PERIOD": "year",
    "OBS_VALUE": "obs_value",
    "OBS_STATUS": "obs_status",
    "UNIT_MULT": "unit_mult",
    "DECIMALS": "decimals",
    "CONVERSION_TYPE": "conversion_type",
    "PRICE_BASE": "price_base",
})

oecd_cols = [
    "ref_area_code", "country_name", "frequency_code", "measure_code", "measure_name",
    "unit_measure_code", "unit_measure_name", "risk_code", "risk_name",
    "age_code", "age_name", "sex_code", "sex_name", "year",
    "obs_value", "obs_status", "unit_mult", "decimals", "conversion_type", "price_base"
]
oecd = oecd[[c for c in oecd_cols if c in oecd.columns]].copy()

for col in ["year", "obs_value", "unit_mult", "decimals"]:
    if col in oecd.columns:
        oecd[col] = pd.to_numeric(oecd[col], errors="coerce")

print("\nOECD preview:")
print(oecd.head(10))

# ----------------------------
# 9) WRITE TO MYSQL
# ----------------------------
meta.to_sql("countries_metadata", engine, if_exists="replace", index=False)
wb_long.to_sql("wb_air_pollution_mortality", engine, if_exists="replace", index=False)
who.to_sql("who_air_quality", engine, if_exists="replace", index=False)
aqi.to_sql("city_aqi", engine, if_exists="replace", index=False)
oecd.to_sql("oecd_health_burden", engine, if_exists="replace", index=False)

# ----------------------------
# 10) SUMMARY
# ----------------------------
print("\nDone.")
print("countries_metadata rows:", len(meta))
print("wb_air_pollution_mortality rows:", len(wb_long))
print("who_air_quality rows:", len(who))
print("city_aqi rows:", len(aqi))
print("oecd_health_burden rows:", len(oecd))