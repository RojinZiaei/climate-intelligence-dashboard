-- MySQL setup script for Air Pollution database (BCNF Optimized)
-- Run with:  mysql --local-infile=1 -u your_user -p < mysql_setup.sql

-- 1. Create database
CREATE DATABASE IF NOT EXISTS air_pollution CHARACTER SET utf8mb4;
USE air_pollution;

-- 2. Core Tables (BCNF)
-- Drop in dependency order (child tables before parent)
DROP TABLE IF EXISTS health_impacts;
DROP TABLE IF EXISTS mortality_normalized;

-- Country metadata
DROP TABLE IF EXISTS country;
CREATE TABLE country (
  country_code   VARCHAR(10) PRIMARY KEY,
  region         VARCHAR(100),
  income_group   VARCHAR(100),
  special_notes  TEXT,
  table_name     VARCHAR(200)
);

-- Indicator metadata
DROP TABLE IF EXISTS indicator;
CREATE TABLE indicator (
  indicator_code      VARCHAR(50) PRIMARY KEY,
  indicator_name      VARCHAR(255),
  source_organization VARCHAR(255)
);

-- Unified Fact Table for Health Impacts (Mortality + OECD DALYs)
-- This is BCNF: All non-key attributes depend only on the composite PK
DROP TABLE IF EXISTS health_impacts;
CREATE TABLE health_impacts (
  country_code   VARCHAR(10),
  indicator_code VARCHAR(50),
  year           INT,
  impact_value   DECIMAL(15,5),
  PRIMARY KEY (country_code, indicator_code, year),
  FOREIGN KEY (country_code)   REFERENCES country(country_code),
  FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
);

-- AQI Reference (BCNF: Category depends on Value, not City)
DROP TABLE IF EXISTS aqi_reference;
CREATE TABLE aqi_reference (
  category_name VARCHAR(50) PRIMARY KEY,
  min_value     INT,
  max_value     INT
);

-- City AQI table (Data Table) - BCNF: (country, city, lat, lng) uniquely identifies each station
DROP TABLE IF EXISTS city_aqi;
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
);

-- 3. Staging Tables (For Raw Imports)

-- Mortality: wide format for CSV load (2NF: no country_name/indicator_name - use country/indicator for lookups)
DROP TABLE IF EXISTS mortality_normalized;
DROP TABLE IF EXISTS mortality_wide_raw;
CREATE TABLE mortality_wide_raw (
  country_code   VARCHAR(10),
  indicator_code VARCHAR(50),
  `1960` DECIMAL(10,3), `1961` DECIMAL(10,3), `1962` DECIMAL(10,3), `1963` DECIMAL(10,3),
  `1964` DECIMAL(10,3), `1965` DECIMAL(10,3), `1966` DECIMAL(10,3), `1967` DECIMAL(10,3),
  `1968` DECIMAL(10,3), `1969` DECIMAL(10,3), `1970` DECIMAL(10,3), `1971` DECIMAL(10,3),
  `1972` DECIMAL(10,3), `1973` DECIMAL(10,3), `1974` DECIMAL(10,3), `1975` DECIMAL(10,3),
  `1976` DECIMAL(10,3), `1977` DECIMAL(10,3), `1978` DECIMAL(10,3), `1979` DECIMAL(10,3),
  `1980` DECIMAL(10,3), `1981` DECIMAL(10,3), `1982` DECIMAL(10,3), `1983` DECIMAL(10,3),
  `1984` DECIMAL(10,3), `1985` DECIMAL(10,3), `1986` DECIMAL(10,3), `1987` DECIMAL(10,3),
  `1988` DECIMAL(10,3), `1989` DECIMAL(10,3), `1990` DECIMAL(10,3), `1991` DECIMAL(10,3),
  `1992` DECIMAL(10,3), `1993` DECIMAL(10,3), `1994` DECIMAL(10,3), `1995` DECIMAL(10,3),
  `1996` DECIMAL(10,3), `1997` DECIMAL(10,3), `1998` DECIMAL(10,3), `1999` DECIMAL(10,3),
  `2000` DECIMAL(10,3), `2001` DECIMAL(10,3), `2002` DECIMAL(10,3), `2003` DECIMAL(10,3),
  `2004` DECIMAL(10,3), `2005` DECIMAL(10,3), `2006` DECIMAL(10,3), `2007` DECIMAL(10,3),
  `2008` DECIMAL(10,3), `2009` DECIMAL(10,3), `2010` DECIMAL(10,3), `2011` DECIMAL(10,3),
  `2012` DECIMAL(10,3), `2013` DECIMAL(10,3), `2014` DECIMAL(10,3), `2015` DECIMAL(10,3),
  `2016` DECIMAL(10,3), `2017` DECIMAL(10,3), `2018` DECIMAL(10,3), `2019` DECIMAL(10,3),
  `2020` DECIMAL(10,3), `2021` DECIMAL(10,3), `2022` DECIMAL(10,3), `2023` DECIMAL(10,3),
  `2024` DECIMAL(10,3), `2025` DECIMAL(10,3),
  PRIMARY KEY (country_code, indicator_code)
);

-- Mortality Normalized (BCNF): country_code, indicator_code, year -> impact_value
CREATE TABLE mortality_normalized (
  country_code   VARCHAR(10),
  indicator_code VARCHAR(50),
  year           INT,
  impact_value   DECIMAL(15,5),
  PRIMARY KEY (country_code, indicator_code, year),
  FOREIGN KEY (country_code)   REFERENCES country(country_code),
  FOREIGN KEY (indicator_code) REFERENCES indicator(indicator_code)
);

-- OECD Normalized (BCNF): ref_area, time_period -> obs_value (dimensions are constant for this dataset)
DROP TABLE IF EXISTS oecd_normalized;
CREATE TABLE oecd_normalized (
  ref_area     VARCHAR(10),
  time_period  INT,
  obs_value    DECIMAL(15,5),
  PRIMARY KEY (ref_area, time_period)
);

-- 4. Import Data
SET GLOBAL local_infile = 1;

-- 4.1 Metadata
LOAD DATA LOCAL INFILE 'data/Metadata_Country_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv'
INTO TABLE country FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
(country_code, region, income_group, special_notes, table_name);

LOAD DATA LOCAL INFILE 'data/Metadata_Indicator_API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv'
INTO TABLE indicator FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
(indicator_code, indicator_name, @dummy, source_organization);

-- Add the OECD Indicator manually
INSERT INTO indicator (indicator_code, indicator_name, source_organization)
VALUES ('DALY_PM25', 'Disability-adjusted life years (DALYs) from Ambient Particulate Matter', 'OECD');

-- 4.2 Staging Tables
LOAD DATA LOCAL INFILE 'data/API_SH.STA.AIRP.P5_DS2_en_csv_v2_6093.csv'
INTO TABLE mortality_wide_raw FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 5 LINES
(@country_name, country_code, @indicator_name, indicator_code, `1960`,`1961`,`1962`,`1963`,`1964`,`1965`,`1966`,`1967`,`1968`,`1969`,`1970`,`1971`,`1972`,`1973`,`1974`,`1975`,`1976`,`1977`,`1978`,`1979`,`1980`,`1981`,`1982`,`1983`,`1984`,`1985`,`1986`,`1987`,`1988`,`1989`,`1990`,`1991`,`1992`,`1993`,`1994`,`1995`,`1996`,`1997`,`1998`,`1999`,`2000`,`2001`,`2002`,`2003`,`2004`,`2005`,`2006`,`2007`,`2008`,`2009`,`2010`,`2011`,`2012`,`2013`,`2014`,`2015`,`2016`,`2017`,`2018`,`2019`,`2020`,`2021`,`2022`,`2023`,`2024`,`2025`);

LOAD DATA LOCAL INFILE 'data/OECD.ENV.EPI,DSD_EXP_MORSC@DF_EXP_MORSC,1.0+.A.DALY.10P3HB.PM_2_5_OUT._T._T.csv'
INTO TABLE oecd_normalized FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\r\n' IGNORE 1 LINES
(@s1, @s2, @s3, @a, ref_area, @r, @f1, @f2, @m1, @m2, @u1, @u2, @risk1, @risk2, @age1, @age2, @sex1, @sex2, time_period, @tp, obs_value, @ov, @os1, @os2, @um, @um2, @d1, @d2, @ct1, @ct2, @pb1, @pb2);

-- 4.3 AQI Reference Values
INSERT INTO aqi_reference VALUES ('Good', 0, 50), ('Moderate', 51, 100), ('Unhealthy', 101, 150), ('Hazardous', 151, 999);

-- 4.4 City AQI (Skipping categories for BCNF)
LOAD DATA LOCAL INFILE 'data/AQI and Lat Long of Countries.csv'
IGNORE INTO TABLE city_aqi FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\n' IGNORE 1 LINES
(country, city, aqi_value, @cat1, co_aqi_value, @cat2, ozone_aqi_value, @cat3, no2_aqi_value, @cat4, pm25_aqi_value, @cat5, lat, lng);

-- 5. Populate Normalized Tables and health_impacts

-- 5.1 Unpivot mortality_wide_raw -> mortality_normalized (BCNF)
INSERT INTO mortality_normalized (country_code, indicator_code, year, impact_value)
SELECT m.country_code, m.indicator_code, 1960, m.`1960` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1960` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1961, m.`1961` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1961` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1962, m.`1962` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1962` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1963, m.`1963` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1963` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1964, m.`1964` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1964` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1965, m.`1965` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1965` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1966, m.`1966` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1966` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1967, m.`1967` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1967` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1968, m.`1968` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1968` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1969, m.`1969` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1969` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1970, m.`1970` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1970` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1971, m.`1971` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1971` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1972, m.`1972` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1972` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1973, m.`1973` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1973` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1974, m.`1974` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1974` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1975, m.`1975` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1975` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1976, m.`1976` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1976` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1977, m.`1977` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1977` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1978, m.`1978` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1978` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1979, m.`1979` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1979` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1980, m.`1980` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1980` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1981, m.`1981` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1981` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1982, m.`1982` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1982` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1983, m.`1983` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1983` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1984, m.`1984` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1984` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1985, m.`1985` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1985` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1986, m.`1986` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1986` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1987, m.`1987` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1987` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1988, m.`1988` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1988` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1989, m.`1989` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1989` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1990, m.`1990` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1990` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1991, m.`1991` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1991` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1992, m.`1992` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1992` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1993, m.`1993` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1993` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1994, m.`1994` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1994` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1995, m.`1995` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1995` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1996, m.`1996` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1996` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1997, m.`1997` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1997` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1998, m.`1998` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1998` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 1999, m.`1999` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`1999` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2000, m.`2000` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2000` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2001, m.`2001` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2001` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2002, m.`2002` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2002` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2003, m.`2003` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2003` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2004, m.`2004` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2004` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2005, m.`2005` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2005` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2006, m.`2006` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2006` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2007, m.`2007` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2007` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2008, m.`2008` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2008` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2009, m.`2009` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2009` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2010, m.`2010` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2010` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2011, m.`2011` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2011` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2012, m.`2012` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2012` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2013, m.`2013` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2013` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2014, m.`2014` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2014` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2015, m.`2015` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2015` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2016, m.`2016` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2016` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2017, m.`2017` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2017` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2018, m.`2018` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2018` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2019, m.`2019` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2019` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2020, m.`2020` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2020` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2021, m.`2021` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2021` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2022, m.`2022` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2022` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2023, m.`2023` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2023` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2024, m.`2024` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2024` IS NOT NULL
UNION ALL SELECT m.country_code, m.indicator_code, 2025, m.`2025` FROM mortality_wide_raw m INNER JOIN country c ON m.country_code = c.country_code WHERE m.`2025` IS NOT NULL;

-- 5.2 Populate health_impacts from normalized tables
INSERT INTO health_impacts (country_code, indicator_code, year, impact_value)
SELECT country_code, indicator_code, year, impact_value FROM mortality_normalized;

INSERT INTO health_impacts (country_code, indicator_code, year, impact_value)
SELECT o.ref_area, 'DALY_PM25', o.time_period, o.obs_value FROM oecd_normalized o
INNER JOIN country c ON o.ref_area = c.country_code;