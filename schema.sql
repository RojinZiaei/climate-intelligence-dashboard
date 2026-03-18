-- ============================================================
-- Climate Intelligence Dashboard — 8-Table BCNF Schema
-- ============================================================

DROP DATABASE IF EXISTS air_pollution;
CREATE DATABASE air_pollution;
USE air_pollution;

-- ============================================================
-- 1. country
-- ============================================================
CREATE TABLE country (
    country_code   VARCHAR(10)  PRIMARY KEY,
    region         VARCHAR(100),
    income_group   VARCHAR(50),
    special_notes  TEXT,
    table_name     VARCHAR(100)
);

LOAD DATA LOCAL INFILE 'country.csv'
INTO TABLE country
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, region, income_group, special_notes, table_name);

-- ============================================================
-- 2. indicator
-- ============================================================
CREATE TABLE indicator (
    indicator_code      VARCHAR(30) PRIMARY KEY,
    indicator_name      VARCHAR(200),
    source_organization VARCHAR(200)
);

LOAD DATA LOCAL INFILE 'indicator.csv'
INTO TABLE indicator
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(indicator_code, indicator_name, source_organization);

-- ============================================================
-- 3. aqi_reference
-- ============================================================
CREATE TABLE aqi_reference (
    category_name  VARCHAR(50) PRIMARY KEY,
    min_value      INT,
    max_value      INT
);

LOAD DATA LOCAL INFILE 'aqi_reference.csv'
INTO TABLE aqi_reference
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(category_name, min_value, max_value);

-- ============================================================
-- 4. city_aqi  (all 5 pollutant columns)
-- ============================================================
CREATE TABLE city_aqi (
    country         VARCHAR(100),
    city            VARCHAR(150),
    aqi_value       INT,
    co_aqi_value    INT,
    ozone_aqi_value INT,
    no2_aqi_value   INT,
    pm25_aqi_value  INT,
    lat             DECIMAL(10,4),
    lng             DECIMAL(10,4),
    PRIMARY KEY (country, city, lat, lng)
);

LOAD DATA LOCAL INFILE 'city_aqi.csv'
INTO TABLE city_aqi
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng);

-- ============================================================
-- 5. mortality_normalized  (World Bank mortality, unpivoted)
-- ============================================================
CREATE TABLE mortality_normalized (
    country_code   VARCHAR(10),
    indicator_code VARCHAR(30),
    year           INT,
    impact_value   DECIMAL(20,6),
    PRIMARY KEY (country_code, indicator_code, year),
    FOREIGN KEY (country_code)   REFERENCES country(country_code),
    FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
);

LOAD DATA LOCAL INFILE 'mortality_normalized.csv'
INTO TABLE mortality_normalized
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(country_code, indicator_code, year, impact_value);

-- ============================================================
-- 6. oecd_normalized  (OECD DALYs, native column names)
-- ============================================================
CREATE TABLE oecd_normalized (
    ref_area    VARCHAR(10),
    time_period INT,
    obs_value   DECIMAL(20,6),
    PRIMARY KEY (ref_area, time_period)
);

LOAD DATA LOCAL INFILE 'oecd_normalized.csv'
INTO TABLE oecd_normalized
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS
(ref_area, time_period, obs_value);

-- ============================================================
-- 7. mortality_wide_raw  (staging — wide format)
-- ============================================================
CREATE TABLE mortality_wide_raw (
    country_code   VARCHAR(10),
    indicator_code VARCHAR(30),
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
    PRIMARY KEY (country_code, indicator_code)
);

LOAD DATA LOCAL INFILE 'mortality_wide_raw.csv'
INTO TABLE mortality_wide_raw
FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;

-- ============================================================
-- 8. health_impacts  (VIEW — unions the two source tables)
-- ============================================================
CREATE VIEW health_impacts AS
    SELECT country_code, indicator_code, year, impact_value
    FROM mortality_normalized
  UNION ALL
    SELECT ref_area    AS country_code,
           'DALY_PM25' AS indicator_code,
           time_period AS year,
           obs_value   AS impact_value
    FROM oecd_normalized;
