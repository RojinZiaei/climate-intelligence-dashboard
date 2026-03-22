# AirLense — assignment alignment (**three aspects from the data**)

This checklist is **grounded in what the datasets actually measure** (see [`DATA_SOURCES_REPORT.md`](DATA_SOURCES_REPORT.md)). Use it when the assignment asks for **three aspects of the topic** as reflected in **your data**, not only schema or UI.

---

## The three data aspects (substance)

| # | Data aspect | What it is (in this project) | Primary tables | Example raw inputs under `data/` |
|---|-------------|------------------------------|----------------|----------------------------------|
| **1** | **Health burden (outcomes)** | National **health impact** metrics from air pollution — **not** µg/m³ in the street. | `mortality_normalized` (WB **SH**), `oecd_normalized`, **`health_impacts`** VIEW (mortality ∪ OECD as `DALY_PM25`) | `API_SH.STA.AIRP.P5…csv`, `OECD.ENV.EPI,…csv` |
| **2** | **Exposure & modeled / national air metrics** | **Population-level exposure** and comparable **national** pollution-related series (µg/m³ where applicable). | `pm25_exposure_normalized` (WB **EN** mean PM2.5) | `API_EN.ATM.PM25…csv` |
| **3** | **Subnational air quality (local)** | **City / station** concentrations and **AQI-style** indices — finer geography than country-year aggregates. | `who_air_quality`, `city_aqi`, `aqi_reference` | WHO ambient DB CSV, `AQI and Lat Long of Countries.csv` |

**Cross-aspect rule (from the data report):** these streams are **complementary**, not duplicates — e.g. **SH mortality ≠ WHO concentrations**, **EN national PM2.5 ≠ WHO city PM2.5** (same unit possible, different **grain**). Joins use **`country_code`** and often **`year`** where both sides are national.

**Dimensions that support all three:** `country`, `indicator` — they **describe** rows in aspects 1–3 but are not themselves “burden” or “concentration” facts.

---

## Quick verification (data-based)

- [ ] **Aspect 1:** You can name one **outcome** column (e.g. `impact_value` / SH) and one **OECD burden** use (`obs_value` / DALY).  
- [ ] **Aspect 2:** You can explain **EN** as **national mean PM2.5 exposure** (`pm25_exposure_ugm3`) vs mortality.  
- [ ] **Aspect 3:** You can contrast **WHO** (city/year/station µg/m³) with **city_aqi** (index + sub-indices at lat/lng).

Canned queries that **span** aspects (see `Backend/server.js`): e.g. **EN + SH** (2+1), **WHO vs mortality** (3+1), **multi-source** (2+1+3+OECD).

---

## Other rubrics (if the brief is not “data substance”)

<details>
<summary>Whole project: design + data + application</summary>

| 1 | Data & domain | [`DATA_SOURCES_REPORT.md`](DATA_SOURCES_REPORT.md), `data/`, `transformData.py` |
| 2 | Database design | [`schema.sql`](../schema.sql), [`NORMALIZATION_PROOF.md`](NORMALIZATION_PROOF.md) |
| 3 | Analytics & UI | `Backend/server.js`, `Frontend/src/App.js` |

</details>

<details>
<summary>Normalization only: 1NF, 2NF, 3NF</summary>

Covered in [`NORMALIZATION_PROOF.md`](NORMALIZATION_PROOF.md) §0 + per-table proofs (+ BCNF as extension).

</details>

---

*Aligns with §1 executive summary and §2–4 of [`DATA_SOURCES_REPORT.md`](DATA_SOURCES_REPORT.md).*
