-- Apply on existing air_pollution DB (skip if you reload full schema.sql).
-- Adds STORED generated columns + index for faster monthly aggregates on city_air_health_daily.

USE air_pollution;

ALTER TABLE city_air_health_daily
  ADD COLUMN cal_year INT GENERATED ALWAYS AS (YEAR(obs_date)) STORED AFTER obs_date,
  ADD COLUMN cal_ym CHAR(7) GENERATED ALWAYS AS (DATE_FORMAT(obs_date, '%Y-%m')) STORED AFTER cal_year;

CREATE INDEX idx_cah_country_city_cal ON city_air_health_daily (country_code, city(80), cal_year, cal_ym);

ANALYZE TABLE city_air_health_daily;
