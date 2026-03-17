#!/usr/bin/env python3
"""
Load Air Pollution database - Python equivalent of new.sql
Creates air_pollution database with BCNF-normalized tables and loads data from data/ folder.
"""

import os
from pathlib import Path

import pandas as pd

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from sqlalchemy import create_engine, text
from sqlalchemy.engine import URL

# ----------------------------
# CONFIG
# ----------------------------
MYSQL_USER = os.environ.get("MYSQL_USER", "root")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "root123")
MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
DB_NAME = "air_pollution"

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

# Data files (matching new.sql paths)
COUNTRY_META_FILE = DATA_DIR / "Metadata_Country_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv"
INDICATOR_META_FILE = DATA_DIR / "Metadata_Indicator_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv"
MORTALITY_FILE = DATA_DIR / "API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv"
OECD_FILE = DATA_DIR / "OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv"
AQI_FILE = DATA_DIR / "AQI and Lat Long of Countries.csv"

# ----------------------------
# DATABASE CONNECTION
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


def run_sql(conn, sql: str, params=None):
    """Execute SQL statement."""
    conn.execute(text(sql), params or {})


def create_database():
    """Create database and tables."""
    with engine_no_db.connect() as conn:
        run_sql(conn, f"CREATE DATABASE IF NOT EXISTS {DB_NAME} CHARACTER SET utf8mb4")
        conn.commit()
    print(f"Database {DB_NAME} created/verified.")


def create_tables():
    """Create all tables in dependency order."""
    with engine.connect() as conn:
        # Drop in dependency order
        run_sql(conn, "DROP TABLE IF EXISTS health_impacts")
        run_sql(conn, "DROP TABLE IF EXISTS mortality_normalized")
        run_sql(conn, "DROP TABLE IF EXISTS mortality_wide_raw")
        run_sql(conn, "DROP TABLE IF EXISTS oecd_normalized")
        run_sql(conn, "DROP TABLE IF EXISTS city_aqi")
        run_sql(conn, "DROP TABLE IF EXISTS aqi_reference")
        run_sql(conn, "DROP TABLE IF EXISTS country")
        run_sql(conn, "DROP TABLE IF EXISTS indicator")

        # country
        run_sql(
            conn,
            """
            CREATE TABLE country (
                country_code   VARCHAR(10) PRIMARY KEY,
                region         VARCHAR(100),
                income_group   VARCHAR(100),
                special_notes  TEXT,
                table_name     VARCHAR(200)
            )
            """,
        )

        # indicator
        run_sql(
            conn,
            """
            CREATE TABLE indicator (
                indicator_code      VARCHAR(50) PRIMARY KEY,
                indicator_name      VARCHAR(255),
                source_organization VARCHAR(255)
            )
            """,
        )

        # health_impacts
        run_sql(
            conn,
            """
            CREATE TABLE health_impacts (
                country_code   VARCHAR(10),
                indicator_code VARCHAR(50),
                year           INT,
                impact_value   DECIMAL(15,5),
                PRIMARY KEY (country_code, indicator_code, year),
                FOREIGN KEY (country_code)   REFERENCES country(country_code),
                FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
            )
            """,
        )

        # aqi_reference
        run_sql(
            conn,
            """
            CREATE TABLE aqi_reference (
                category_name VARCHAR(50) PRIMARY KEY,
                min_value     INT,
                max_value     INT
            )
            """,
        )

        # city_aqi
        run_sql(
            conn,
            """
            CREATE TABLE city_aqi (
                country            VARCHAR(200),
                city               VARCHAR(200),
                aqi_value          INT,
                co_aqi_value       INT,
                ozone_aqi_value    INT,
                no2_aqi_value      INT,
                pm25_aqi_value     INT,
                lat                DECIMAL(10,6),
                lng                DECIMAL(10,6),
                PRIMARY KEY (country, city, lat, lng)
            )
            """,
        )

        # mortality_normalized
        run_sql(
            conn,
            """
            CREATE TABLE mortality_normalized (
                country_code   VARCHAR(10),
                indicator_code VARCHAR(50),
                year           INT,
                impact_value   DECIMAL(15,5),
                PRIMARY KEY (country_code, indicator_code, year),
                FOREIGN KEY (country_code)   REFERENCES country(country_code),
                FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
            )
            """,
        )

        # oecd_normalized
        run_sql(
            conn,
            """
            CREATE TABLE oecd_normalized (
                ref_area     VARCHAR(10),
                time_period  INT,
                obs_value    DECIMAL(15,5),
                PRIMARY KEY (ref_area, time_period)
            )
            """,
        )

        conn.commit()
    print("Tables created.")


def load_country():
    """Load country metadata."""
    df = pd.read_csv(COUNTRY_META_FILE)
    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "Country Code": "country_code",
            "Region": "region",
            "IncomeGroup": "income_group",
            "SpecialNotes": "special_notes",
            "TableName": "table_name",
        }
    )
    df = df[["country_code", "region", "income_group", "special_notes", "table_name"]]
    df.to_sql("country", engine, if_exists="append", index=False)
    print(f"  country: {len(df)} rows")


def load_indicator():
    """Load indicator metadata and add OECD indicator."""
    df = pd.read_csv(INDICATOR_META_FILE)
    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "INDICATOR_CODE": "indicator_code",
            "INDICATOR_NAME": "indicator_name",
            "SOURCE_ORGANIZATION": "source_organization",
        }
    )
    df = df[["indicator_code", "indicator_name", "source_organization"]]

    # Add OECD indicator
    oecd_row = pd.DataFrame(
        [
            {
                "indicator_code": "DALY_PM25",
                "indicator_name": "Disability-adjusted life years (DALYs) from Ambient Particulate Matter",
                "source_organization": "OECD",
            }
        ]
    )
    df = pd.concat([df, oecd_row], ignore_index=True)

    df.to_sql("indicator", engine, if_exists="append", index=False)
    print(f"  indicator: {len(df)} rows")


def load_mortality_and_normalize():
    """Load mortality (wide format) and unpivot to mortality_normalized."""
    df = pd.read_csv(MORTALITY_FILE, skiprows=4)
    df.columns = df.columns.str.strip()

    base_cols = ["Country Name", "Country Code", "Indicator Name", "Indicator Code"]
    year_cols = [c for c in df.columns if c.isdigit()]

    # Normalize missing values
    df = df.replace(["..", "", " "], pd.NA)

    # Unpivot (melt) to long format
    long = df.melt(
        id_vars=base_cols,
        value_vars=year_cols,
        var_name="year",
        value_name="impact_value",
    )

    long["year"] = pd.to_numeric(long["year"], errors="coerce")
    long["impact_value"] = pd.to_numeric(long["impact_value"], errors="coerce")
    long = long.dropna(subset=["impact_value"])

    long = long.rename(
        columns={
            "Country Code": "country_code",
            "Indicator Code": "indicator_code",
        }
    )

    # Keep only 3-letter country codes (filter to valid countries)
    long = long[long["country_code"].astype(str).str.match(r"^[A-Z]{3}$", na=False)]

    # Filter to countries in our metadata
    with engine.connect() as conn:
        valid_countries = pd.read_sql("SELECT country_code FROM country", conn)
    valid_codes = set(valid_countries["country_code"])
    long = long[long["country_code"].isin(valid_codes)]

    mortality_norm = long[["country_code", "indicator_code", "year", "impact_value"]]
    mortality_norm.to_sql("mortality_normalized", engine, if_exists="append", index=False)
    print(f"  mortality_normalized: {len(mortality_norm)} rows")


def load_oecd():
    """Load OECD data."""
    df = pd.read_csv(OECD_FILE)
    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "REF_AREA": "ref_area",
            "TIME_PERIOD": "time_period",
            "OBS_VALUE": "obs_value",
        }
    )
    df = df[["ref_area", "time_period", "obs_value"]]
    df = df.dropna(subset=["ref_area", "time_period", "obs_value"])
    df.to_sql("oecd_normalized", engine, if_exists="append", index=False)
    print(f"  oecd_normalized: {len(df)} rows")


def load_aqi_reference():
    """Insert AQI reference values."""
    df = pd.DataFrame(
        [
            ("Good", 0, 50),
            ("Moderate", 51, 100),
            ("Unhealthy", 101, 150),
            ("Hazardous", 151, 999),
        ],
        columns=["category_name", "min_value", "max_value"],
    )
    df.to_sql("aqi_reference", engine, if_exists="append", index=False)
    print(f"  aqi_reference: {len(df)} rows")


def load_city_aqi():
    """Load city AQI data (skip category columns for BCNF)."""
    df = pd.read_csv(AQI_FILE)
    df.columns = df.columns.str.strip()
    df = df.rename(
        columns={
            "Country": "country",
            "City": "city",
            "AQI Value": "aqi_value",
            "CO AQI Value": "co_aqi_value",
            "Ozone AQI Value": "ozone_aqi_value",
            "NO2 AQI Value": "no2_aqi_value",
            "PM2.5 AQI Value": "pm25_aqi_value",
            "lat": "lat",
            "lng": "lng",
        }
    )
    df = df[["country", "city", "aqi_value", "co_aqi_value", "ozone_aqi_value",
            "no2_aqi_value", "pm25_aqi_value", "lat", "lng"]]
    df = df.dropna(subset=["country", "city", "lat", "lng"])
    df = df.drop_duplicates(subset=["country", "city", "lat", "lng"])
    df.to_sql("city_aqi", engine, if_exists="append", index=False)
    print(f"  city_aqi: {len(df)} rows")


def populate_health_impacts():
    """Populate health_impacts from mortality_normalized and oecd_normalized."""
    with engine.connect() as conn:
        # From mortality
        run_sql(
            conn,
            """
            INSERT INTO health_impacts (country_code, indicator_code, year, impact_value)
            SELECT country_code, indicator_code, year, impact_value FROM mortality_normalized
            """,
        )
        # From OECD (only countries in metadata)
        run_sql(
            conn,
            """
            INSERT INTO health_impacts (country_code, indicator_code, year, impact_value)
            SELECT o.ref_area, 'DALY_PM25', o.time_period, o.obs_value
            FROM oecd_normalized o
            INNER JOIN country c ON o.ref_area = c.country_code
            """,
        )
        conn.commit()
    print("  health_impacts populated")


def main():
    print("Loading Air Pollution database...")
    print(f"Data directory: {DATA_DIR}")

    for f in [COUNTRY_META_FILE, INDICATOR_META_FILE, MORTALITY_FILE, OECD_FILE, AQI_FILE]:
        if not f.exists():
            print(f"ERROR: File not found: {f}")
            return 1

    create_database()
    create_tables()

    print("\nLoading data:")
    load_country()
    load_indicator()
    load_mortality_and_normalize()
    load_oecd()
    load_aqi_reference()
    load_city_aqi()
    populate_health_impacts()

    print("\nDone.")
    return 0


if __name__ == "__main__":
    exit(main())
