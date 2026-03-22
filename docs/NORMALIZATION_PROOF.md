# AirLense — Normalization Proof (`air_pollution` schema, NF1 through BCNF)

This document gives **evidence** that the **normalized** tables in `schema.sql` satisfy **First through Boyce–Codd Normal Form**. Staging or auxiliary objects not listed below are **out of scope** for this proof.

**Scope:** The eight base tables proved in §1 + `health_impacts` VIEW.  
**Reference:** `schema.sql`, `transformData.py` (what is loaded vs omitted for redundancy).

---

## 0. Definitions (quick reference)

| Form | Requirement (informal) |
|------|-------------------------|
| **1NF** | Every column holds **atomic** values; **no repeating groups** of the same kind in one row (no “many years as many columns” for the same fact type). |
| **2NF** | 1NF + no **partial** functional dependency: every **non-key** attribute depends on the **entire** primary key, not a proper subset. |
| **3NF** | 2NF + no **transitive** dependency: non-key attributes depend **only** on the primary key (not on other non-keys). |
| **BCNF** | For every non-trivial FD **X → A**, **X** is a **superkey** (contains a candidate key). (Stronger than 3NF when multiple candidate keys interact; for single-CK tables, BCNF aligns with 3NF.) |

---

## 1. Tables that are in NF1, NF2, NF3, and BCNF

For each table below:

- **PK** = primary key.  
- **Non-keys** = attributes not in PK.  
- **FDs** = functional dependencies we assert for the intended real-world key.

### 1.1 `country`

| Item | Detail |
|------|--------|
| **PK** | `country_code` |
| **Non-keys** | `region`, `income_group`, `special_notes`, `table_name` |

**NF1:** Each attribute is a single value per row; `special_notes` is free text but not a **repeating group** of columns. ✓  

**NF2:** PK is a **single attribute** → no partial dependency on a “part” of the key. ✓  

**NF3 / BCNF:** All non-keys are determined **only** by `country_code` (the entity). No non-key determines another non-key in a way that violates the key. FD: `country_code → region, income_group, special_notes, table_name`. Here **BCNF** holds because `{country_code}` is the (only) candidate key and is the determinant. ✓  

---

### 1.2 `indicator`

| Item | Detail |
|------|--------|
| **PK** | `indicator_code` |
| **Non-keys** | `indicator_name`, `source_organization` |

**NF1:** Atomic scalars / strings per cell. ✓  

**NF2:** Single-attribute PK. ✓  

**NF3 / BCNF:** `indicator_code → indicator_name, source_organization`. Determinant is superkey. ✓  

---

### 1.3 `aqi_reference`

| Item | Detail |
|------|--------|
| **PK** | `category_name` |
| **Non-keys** | `min_value`, `max_value` |

**NF1:** Atomic. ✓  

**NF2:** Single-attribute PK. ✓  

**NF3 / BCNF:** `category_name → min_value, max_value` (bounds belong to the category). ✓  

---

### 1.4 `city_aqi`

| Item | Detail |
|------|--------|
| **PK** | `(country_code, city, lat, lng)` |
| **Non-keys** | `aqi_value`, `co_aqi_value`, `ozone_aqi_value`, `no2_aqi_value`, `pm25_aqi_value` |

**NF1:** One measurement set per **station** (identified by geo + city + country); no multivalued “list of AQIs” in one cell. Redundant **country name** was **removed** from storage (loaded via `@dummy` in `schema.sql`); name comes from `country.table_name` → avoids **transitive** `country_code → country_name → …`. ✓  

**NF2:** All non-keys describe **this** observation at **this** place/time granularity; they depend on the **full** PK (not only `country_code` alone — same city name could exist at different lat/lng). ✓  

**NF3:** No non-key determines another non-key independently of the full observation key in a problematic way. ✓  

**BCNF:** Intended FD: full PK → all measures. No FD where a **non-superkey** determines something else. ✓  

---

### 1.5 `mortality_normalized`

| Item | Detail |
|------|--------|
| **PK** | `(country_code, indicator_code, year)` |
| **Non-keys** | `impact_value` |

**NF1:** One **fact per year** per series per country — **atomic** `year` and `impact_value` per row. ✓  

**NF2:** `impact_value` depends on **all three** key parts (which country, which indicator, which year). ✓  

**NF3:** Single non-key depends **directly** on full PK; nothing transitive off other non-keys. ✓  

**BCNF:** `{country_code, indicator_code, year} → impact_value`; determinant is the PK (superkey). ✓  

---

### 1.6 `oecd_normalized`

| Item | Detail |
|------|--------|
| **PK** | `(country_code, year)` |
| **Non-keys** | `obs_value` |

**NF1–BCNF:** Same pattern as mortality with a **two-part** key: `(country_code, year) → obs_value`. ✓  

---

### 1.7 `who_air_quality`

| Item | Detail |
|------|--------|
| **PK** | `(country_code, city, year, latitude, longitude)` |
| **Non-keys** | `pm25_concentration`, `pm10_concentration`, `no2_concentration` |

**NF1:** Concentrations are atomic numerics. ✓  

**NF2:** Concentrations are **for that** WHO row (city/year/station coords); they depend on the **entire** PK, not e.g. `(country_code, city)` alone (multiple years / coords). ✓  

**NF3 / BCNF:** Full PK → concentrations. ✓  

---

### 1.8 `pm25_exposure_normalized`

| Item | Detail |
|------|--------|
| **PK** | `(country_code, year, indicator_code)` |
| **Non-keys** | `pm25_exposure_ugm3` |

**NF1:** One exposure value per **(country, year, indicator)**. ✓  

**NF2:** Non-key depends on **full** triple key. ✓  

**NF3:** `country_name` removed from load (dummy column) — exposure does not transitively depend on a denormalized name; name from `country`. ✓  

**BCNF:** Full PK → `pm25_exposure_ugm3`. ✓  

---

## 2. `health_impacts` (VIEW)

- **Definition:** `UNION ALL` of `mortality_normalized` and a **renamed** projection of `oecd_normalized` (`obs_value` as `impact_value`, fixed `indicator_code` for DALY).  
- **Normalization:** A view has **no independent storage**; each **source row** already satisfies **NF1–BCNF** in its base table. The result set has **atomic** columns `country_code, indicator_code, year, impact_value`.  
- **Caveat:** The VIEW is a **derived** union; integrity is enforced on **base tables** (FKs on underlying tables, not on the view itself in MySQL).

---

## 3. Summary checklist

| Object | NF1 | NF2 | NF3 | BCNF | Note |
|--------|-----|-----|-----|------|------|
| `country` | ✓ | ✓ | ✓ | ✓ | Single-attribute PK |
| `indicator` | ✓ | ✓ | ✓ | ✓ | Single-attribute PK |
| `aqi_reference` | ✓ | ✓ | ✓ | ✓ | Single-attribute PK |
| `city_aqi` | ✓ | ✓ | ✓ | ✓ | Composite PK; no redundant country name in table |
| `mortality_normalized` | ✓ | ✓ | ✓ | ✓ | Preferred SH mortality store |
| `oecd_normalized` | ✓ | ✓ | ✓ | ✓ | |
| `who_air_quality` | ✓ | ✓ | ✓ | ✓ | |
| `pm25_exposure_normalized` | ✓ | ✓ | ✓ | ✓ | No denormalized country name |
| `health_impacts` (VIEW) | ✓* | ✓* | ✓* | ✓* | *Inherited from base rows |

---

## 4. References in repo

- `schema.sql` — DDL, PKs, FKs, load omissions for 3NF.  
- `docs/DATA_SOURCES_REPORT.md` — semantic difference between sources (not the same as NF, but supports why keys are chosen).  

*AirLense — document aligns with `schema.sql` as in repository.*
