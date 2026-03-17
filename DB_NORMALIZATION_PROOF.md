# Database Normalization Proof: Air Pollution Database

**Assignment: Formal proof that the database design satisfies 1NF, 2NF, 3NF, and BCNF**

---

## 1. Schema Overview

The database (`air_pollution`) contains the following tables:

| Table | Attributes |
|-------|------------|
| **country** | country_code, region, income_group, special_notes, table_name |
| **indicator** | indicator_code, indicator_name, source_organization |
| **health_impacts** | country_code, indicator_code, year, impact_value |
| **aqi_reference** | category_name, min_value, max_value |
| **city_aqi** | country, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng |
| **mortality_normalized** | country_code, indicator_code, year, impact_value |
| **oecd_normalized** | ref_area, time_period, obs_value |
| **mortality_wide_raw** | country_code, indicator_code, `1960`–`2025` (wide staging) |

---

## 2. Definitions

- **1NF:** Every attribute contains atomic (indivisible) values; no repeating groups; each row is unique.
- **2NF:** 1NF + every non-prime attribute depends on the **entire** primary key (no partial dependencies).
- **3NF:** 2NF + no non-prime attribute depends on another non-prime attribute (no transitive dependencies).
- **BCNF:** Every determinant is a candidate key.

---

## 3. Table-by-Table Proof

### 3.1 country

**Schema:** `country(country_code, region, income_group, special_notes, table_name)`

**Primary Key:** `country_code`

**Functional Dependencies:** `country_code → region, income_group, special_notes, table_name`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows via country_code. |
| 2NF | Single-attribute PK; no partial dependency possible. |
| 3NF | No transitive dependencies among non-prime attributes. |
| BCNF | Only determinant is the candidate key. |

**Conclusion:** ✅ **country satisfies 1NF through BCNF.**

---

### 3.2 indicator

**Schema:** `indicator(indicator_code, indicator_name, source_organization)`

**Primary Key:** `indicator_code`

**Functional Dependencies:** `indicator_code → indicator_name, source_organization`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | Single-attribute PK. |
| 3NF | No transitive dependencies. |
| BCNF | Only determinant is the candidate key. |

**Conclusion:** ✅ **indicator satisfies 1NF through BCNF.**

---

### 3.3 health_impacts

**Schema:** `health_impacts(country_code, indicator_code, year, impact_value)`

**Primary Key:** `(country_code, indicator_code, year)`

**Functional Dependencies:** `(country_code, indicator_code, year) → impact_value`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | `impact_value` depends on full key (country+indicator+year). |
| 3NF | Single non-prime attribute; no transitive dependencies. |
| BCNF | Only determinant is the composite PK. |

**Conclusion:** ✅ **health_impacts satisfies 1NF through BCNF.**

---

### 3.4 aqi_reference

**Schema:** `aqi_reference(category_name, min_value, max_value)`

**Primary Key:** `category_name`

**Functional Dependencies:** `category_name → min_value, max_value`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | Single-attribute PK. |
| 3NF | min_value and max_value depend only on category_name; no transitive dependency between them. |
| BCNF | Only determinant is the candidate key. |

**Conclusion:** ✅ **aqi_reference satisfies 1NF through BCNF.**

---

### 3.5 city_aqi

**Schema:** `city_aqi(country, city, aqi_value, co_aqi_value, ozone_aqi_value, no2_aqi_value, pm25_aqi_value, lat, lng)`

**Primary Key:** `(country, city, lat, lng)` — one row per station/location (same city can have multiple stations).

**Functional Dependencies:** `(country, city, lat, lng) → {all other attributes}`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | All non-prime attributes depend on full key. |
| 3NF | No transitive dependencies. |
| BCNF | Only determinant is the composite PK. |

**Note:** AQI category columns were removed for BCNF (category depends on value, not city); use `aqi_reference` for lookups.

**Conclusion:** ✅ **city_aqi satisfies 1NF through BCNF.**

---

### 3.6 mortality_normalized

**Schema:** `mortality_normalized(country_code, indicator_code, year, impact_value)`

**Primary Key:** `(country_code, indicator_code, year)`

**Functional Dependencies:** `(country_code, indicator_code, year) → impact_value`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | `impact_value` depends on full key. |
| 3NF | Single non-prime attribute. |
| BCNF | Only determinant is the composite PK. |

**Conclusion:** ✅ **mortality_normalized satisfies 1NF through BCNF.**

---

### 3.7 oecd_normalized

**Schema:** `oecd_normalized(ref_area, time_period, obs_value)`

**Primary Key:** `(ref_area, time_period)`

**Functional Dependencies:** `(ref_area, time_period) → obs_value`

| NF | Proof |
|----|-------|
| 1NF | Atomic values; no repeating groups; unique rows. |
| 2NF | `obs_value` depends on full key. |
| 3NF | Single non-prime attribute. |
| BCNF | Only determinant is the composite PK. |

**Note:** Code/name pairs (REF_AREA/Reference area, MEASURE/Measure, etc.) were removed; dimensions are constant for this dataset.

**Conclusion:** ✅ **oecd_normalized satisfies 1NF through BCNF.**

---

### 3.8 mortality_wide_raw (Staging)

**Schema:** `mortality_wide_raw(country_code, indicator_code, 1960, 1961, …, 2025)`

**Primary Key:** `(country_code, indicator_code)`

**Functional Dependencies:** `(country_code, indicator_code) → 1960, 1961, …, 2025`

| NF | Proof |
|----|-------|
| 1NF | Atomic values per cell; no repeating groups; unique rows via (country_code, indicator_code). |
| 2NF | All year columns depend on full key; no partial dependencies (country_name, indicator_name removed). |
| 3NF | No transitive dependencies among year columns. |
| BCNF | Only determinant is the composite PK. |

**Note:** `country_name` and `indicator_name` were removed to eliminate partial dependencies. Use JOIN with `country` and `indicator` for lookups.

**Conclusion:** ✅ **mortality_wide_raw satisfies 1NF through BCNF.**

---

## 4. Summary Table

| Table | 1NF | 2NF | 3NF | BCNF | Notes |
|-------|-----|-----|-----|------|-------|
| country | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| indicator | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| health_impacts | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| aqi_reference | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| city_aqi | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| mortality_normalized | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| oecd_normalized | ✅ | ✅ | ✅ | ✅ | Satisfies all NFs |
| mortality_wide_raw | ✅ | ✅ | ✅ | ✅ | Wide staging; names via JOIN |

---

## 5. Conclusion

**Current schema (air_pollution):**

- All **core tables** (country, indicator, health_impacts, aqi_reference, city_aqi, mortality_normalized, oecd_normalized) satisfy **1NF, 2NF, 3NF, and BCNF**.
- **mortality_wide_raw** is a wide-format staging table; it satisfies BCNF (country_name, indicator_name removed to avoid partial dependencies).

**Design improvements over previous schema:**

- **country** replaces `countries_metadata`; no redundant `country_name` (use `table_name`).
- **health_impacts** unifies mortality and OECD DALYs into one fact table; no partial dependencies.
- **indicator** separates indicator metadata; referenced by `health_impacts`.
- **city_aqi** uses `(country, city, lat, lng)` as PK; AQI categories moved to `aqi_reference`.
- **oecd_normalized** keeps only varying dimensions (ref_area, time_period, obs_value).
