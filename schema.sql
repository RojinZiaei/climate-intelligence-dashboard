-- ============================================================
-- AirLense — BCNF Schema
-- Load order: dimension tables first, then facts.
-- Run from project root: mysql -u USER -p --local-infile < schema.sql
-- ============================================================
-- NF1: Atomic values only (no repeating groups in core tables)
-- NF2: No partial dependencies (non-keys depend on whole PK)
-- NF3: No transitive dependencies (redundant columns omitted in loads)
-- BCNF: Every determinant is a candidate key
-- ============================================================

DROP DATABASE IF EXISTS air_pollution;
CREATE DATABASE air_pollution
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE air_pollution;

SET NAMES utf8mb4;

-- ============================================================
-- 1. country (BCNF)
-- PK: country_code
-- ============================================================
CREATE TABLE country (
    country_code   VARCHAR(10)  PRIMARY KEY,
    region         VARCHAR(100),
    income_group   VARCHAR(50),
    special_notes  TEXT,
    table_name     VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/country.csv'
INTO TABLE country
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, region, income_group, special_notes, table_name);

-- ============================================================
-- 2. indicator (BCNF)
-- PK: indicator_code
-- ============================================================
CREATE TABLE indicator (
    indicator_code      VARCHAR(30) PRIMARY KEY,
    indicator_name      VARCHAR(500),
    source_organization VARCHAR(200)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/indicator.csv'
INTO TABLE indicator
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(indicator_code, indicator_name, source_organization);

-- ============================================================
-- 3. aqi_reference (BCNF)
-- PK: category_name
-- ============================================================
CREATE TABLE aqi_reference (
    category_name  VARCHAR(50) PRIMARY KEY,
    min_value      INT,
    max_value      INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/aqi_reference.csv'
INTO TABLE aqi_reference
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(category_name, min_value, max_value);

-- ============================================================
-- 3b. population_density_category (BCNF)
-- PK: density_category — lookup for city_air_health_daily
-- ============================================================
CREATE TABLE population_density_category (
    density_category VARCHAR(20) PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/population_density_category.csv'
INTO TABLE population_density_category
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(density_category);

-- ============================================================
-- 4. city_aqi (BCNF)
-- PK: (country_code, city, lat, lng)
-- CSV "country" column skipped (derive via country.table_name)
-- ============================================================
CREATE TABLE city_aqi (
    country_code     VARCHAR(10)   NOT NULL,
    city             VARCHAR(150)  NOT NULL,
    aqi_value        INT,
    co_aqi_value     INT,
    ozone_aqi_value  INT,
    no2_aqi_value    INT,
    pm25_aqi_value   INT,
    lat              DECIMAL(10,4) NOT NULL,
    lng              DECIMAL(10,4) NOT NULL,
    PRIMARY KEY (country_code, city, lat, lng),
    FOREIGN KEY (country_code) REFERENCES country(country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/city_aqi.csv'
INTO TABLE city_aqi
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, @dummy_country, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng);

-- ============================================================
-- 5. mortality_normalized (BCNF)
-- PK: (country_code, indicator_code, year)
-- ============================================================
CREATE TABLE mortality_normalized (
    country_code   VARCHAR(10)  NOT NULL,
    indicator_code VARCHAR(30)  NOT NULL,
    year           INT          NOT NULL,
    impact_value   DECIMAL(20,6),
    PRIMARY KEY (country_code, indicator_code, year),
    FOREIGN KEY (country_code)   REFERENCES country(country_code),
    FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/mortality_normalized.csv'
INTO TABLE mortality_normalized
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, indicator_code, year, impact_value);

-- ============================================================
-- 6. oecd_normalized (BCNF)
-- PK: (country_code, year)
-- ============================================================
CREATE TABLE oecd_normalized (
    country_code VARCHAR(10)  NOT NULL,
    year         INT          NOT NULL,
    obs_value    DECIMAL(20,6),
    PRIMARY KEY (country_code, year),
    FOREIGN KEY (country_code) REFERENCES country(country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/oecd_normalized.csv'
INTO TABLE oecd_normalized
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, year, obs_value);

-- ============================================================
-- 7. who_air_quality (BCNF)
-- PK: (country_code, city, year, latitude, longitude)
-- ============================================================
CREATE TABLE who_air_quality (
    country_code       VARCHAR(10)   NOT NULL,
    city               VARCHAR(200)  NOT NULL,
    year               INT           NOT NULL,
    pm25_concentration DECIMAL(10,2),
    pm10_concentration DECIMAL(10,2),
    no2_concentration  DECIMAL(10,2),
    latitude           DECIMAL(10,6) NOT NULL,
    longitude          DECIMAL(10,6) NOT NULL,
    PRIMARY KEY (country_code, city(100), year, latitude, longitude),
    FOREIGN KEY (country_code) REFERENCES country(country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/who_air_quality.csv'
INTO TABLE who_air_quality
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, city, year, pm25_concentration, pm10_concentration, no2_concentration, latitude, longitude);

-- ============================================================
-- 8. pm25_exposure_normalized (BCNF)
-- PK: (country_code, year, indicator_code)
-- CSV "country_name" skipped (derive via country)
-- ============================================================
CREATE TABLE pm25_exposure_normalized (
    country_code       VARCHAR(10)  NOT NULL,
    year               INT          NOT NULL,
    indicator_code     VARCHAR(30)  NOT NULL,
    pm25_exposure_ugm3 DECIMAL(20,6),
    PRIMARY KEY (country_code, year, indicator_code),
    FOREIGN KEY (country_code)   REFERENCES country(country_code),
    FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/pm25_exposure_normalized.csv'
INTO TABLE pm25_exposure_normalized
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, @dummy_country_name, year, pm25_exposure_ugm3, indicator_code);

-- ============================================================
-- 8b. city_air_health_daily (BCNF)
-- PK: (country_code, city, obs_date) — daily air + health proxy measures
-- Source: data/air_quality_health_dataset.csv
-- ============================================================
CREATE TABLE city_air_health_daily (
    country_code         VARCHAR(10)   NOT NULL,
    city                 VARCHAR(150)  NOT NULL,
    obs_date             DATE          NOT NULL,
    aqi                  INT,
    pm2_5                DECIMAL(10,2),
    pm10                 DECIMAL(10,2),
    no2                  DECIMAL(10,2),
    o3                   DECIMAL(10,2),
    temperature          DECIMAL(8,2),
    humidity             INT,
    hospital_admissions  INT,
    hospital_capacity    INT,
    density_category     VARCHAR(20)   NOT NULL,
    PRIMARY KEY (country_code, city(100), obs_date),
    FOREIGN KEY (country_code)     REFERENCES country(country_code),
    FOREIGN KEY (density_category) REFERENCES population_density_category(density_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/city_air_health_daily.csv'
INTO TABLE city_air_health_daily
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, city, obs_date, aqi, pm2_5, pm10, no2, o3,
 temperature, humidity, hospital_admissions, hospital_capacity, density_category);

-- ============================================================
-- 9. mortality_wide_raw (STAGING — NOT 1NF)
-- Wide year columns; for exports/legacy tools only.
-- Prefer mortality_normalized for analytics.
-- ============================================================
CREATE TABLE mortality_wide_raw (
    country_code   VARCHAR(10)  NOT NULL,
    indicator_code VARCHAR(30)  NOT NULL,
    `1960` DECIMAL(20,6), `1961` DECIMAL(20,6), `1962` DECIMAL(20,6),
    `1963` DECIMAL(20,6), `1964` DECIMAL(20,6), `1965` DECIMAL(20,6),
    `1966` DECIMAL(20,6), `1967` DECIMAL(20,6), `1968` DECIMAL(20,6),
    `1969` DECIMAL(20,6), `1970` DECIMAL(20,6), `1971` DECIMAL(20,6),
    `1972` DECIMAL(20,6), `1973` DECIMAL(20,6), `1974` DECIMAL(20,6),
    `1975` DECIMAL(20,6), `1976` DECIMAL(20,6), `1977` DECIMAL(20,6),
    `1978` DECIMAL(20,6), `1979` DECIMAL(20,6), `1980` DECIMAL(20,6),
    `1981` DECIMAL(20,6), `1982` DECIMAL(20,6), `1983` DECIMAL(20,6),
    `1984` DECIMAL(20,6), `1985` DECIMAL(20,6), `1986` DECIMAL(20,6),
    `1987` DECIMAL(20,6), `1988` DECIMAL(20,6), `1989` DECIMAL(20,6),
    `1990` DECIMAL(20,6), `1991` DECIMAL(20,6), `1992` DECIMAL(20,6),
    `1993` DECIMAL(20,6), `1994` DECIMAL(20,6), `1995` DECIMAL(20,6),
    `1996` DECIMAL(20,6), `1997` DECIMAL(20,6), `1998` DECIMAL(20,6),
    `1999` DECIMAL(20,6), `2000` DECIMAL(20,6), `2001` DECIMAL(20,6),
    `2002` DECIMAL(20,6), `2003` DECIMAL(20,6), `2004` DECIMAL(20,6),
    `2005` DECIMAL(20,6), `2006` DECIMAL(20,6), `2007` DECIMAL(20,6),
    `2008` DECIMAL(20,6), `2009` DECIMAL(20,6), `2010` DECIMAL(20,6),
    `2011` DECIMAL(20,6), `2012` DECIMAL(20,6), `2013` DECIMAL(20,6),
    `2014` DECIMAL(20,6), `2015` DECIMAL(20,6), `2016` DECIMAL(20,6),
    `2017` DECIMAL(20,6), `2018` DECIMAL(20,6), `2019` DECIMAL(20,6),
    `2020` DECIMAL(20,6), `2021` DECIMAL(20,6), `2022` DECIMAL(20,6),
    `2023` DECIMAL(20,6), `2024` DECIMAL(20,6), `2025` DECIMAL(20,6),
    PRIMARY KEY (country_code, indicator_code),
    FOREIGN KEY (country_code)   REFERENCES country(country_code),
    FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

LOAD DATA LOCAL INFILE 'clean_data/mortality_wide_raw.csv'
INTO TABLE mortality_wide_raw
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- ============================================================
-- VIEW: health_impacts (mortality + OECD DALY)
-- ============================================================
CREATE VIEW health_impacts AS
    SELECT country_code, indicator_code, year, impact_value
    FROM mortality_normalized
  UNION ALL
    SELECT country_code,
           'DALY_PM25' AS indicator_code,
           year,
           obs_value   AS impact_value
    FROM oecd_normalized;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_mortality_country_year ON mortality_normalized(country_code, year);
CREATE INDEX idx_oecd_country ON oecd_normalized(country_code);
CREATE INDEX idx_who_country_year ON who_air_quality(country_code, year);
CREATE INDEX idx_pm25_country_year ON pm25_exposure_normalized(country_code, year);
CREATE INDEX idx_city_aqi_country ON city_aqi(country_code);
CREATE INDEX idx_city_air_health_country_date ON city_air_health_daily(country_code, obs_date);
-- Speeds canned monthly rollups partitioned by city + ordered by month (see Backend daily-air-health query)
CREATE INDEX idx_city_air_health_city_date ON city_air_health_daily(city(80), obs_date);
