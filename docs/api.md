# API Reference - Simulator Poste

Documentazione completa delle API REST del sistema Simulator Poste.

**Base URL:** `http://localhost:8000` (development)

**Autenticazione:** Bearer Token (JWT) - header `Authorization: Bearer <token>`

> **Nota:** In modalità development (`ENVIRONMENT != production`), l'autenticazione è bypassata automaticamente.

---

## Indice

- [Health & Monitoring](#health--monitoring)
- [Configuration](#configuration)
- [Master Data](#master-data)
- [Scoring & Simulation](#scoring--simulation)
- [Export](#export)
- [Schemi Dati](#schemi-dati)

---

## Health & Monitoring

### GET /health

Health check completo con stato del sistema.

**Response 200:**

```json
{
  "status": "healthy",
  "timestamp": "2026-02-10T12:00:00.000000",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "message": "Database connection OK"
    },
    "lot_configs": {
      "status": "healthy",
      "count": 1,
      "message": "OK"
    },
    "master_data": {
      "status": "healthy",
      "message": "OK"
    }
  }
}
```

**Response 503:** Sistema degradato (database non disponibile)

---

### GET /health/ready

Probe di readiness Kubernetes. Ritorna 200 solo se l'app è pronta a servire traffico.

**Response 200:**

```json
{
  "status": "ready",
  "timestamp": "2026-02-10T12:00:00.000000"
}
```

**Response 503:**

```json
{
  "status": "not_ready",
  "reason": "No lot configurations"
}
```

---

### GET /health/live

Probe di liveness Kubernetes (controllo leggero).

**Response 200:**

```json
{
  "status": "alive",
  "timestamp": "2026-02-10T12:00:00.000000"
}
```

---

### GET /metrics

Metriche di sistema per monitoring.

**Response 200:**

```json
{
  "timestamp": "2026-02-10T12:00:00.000000",
  "process": {
    "memory_mb": 54.32,
    "memory_percent": 0.67,
    "cpu_percent": 0.5,
    "num_threads": 4,
    "uptime_seconds": 3600.5
  },
  "system": {
    "cpu_count": 8,
    "memory_total_gb": 16.0,
    "memory_available_gb": 8.5,
    "memory_percent": 46.88
  }
}
```

> **Nota:** Richiede `psutil` installato per metriche dettagliate.

---

## Configuration

### GET /api/config

Recupera tutte le configurazioni dei lotti.

**Response 200:**

```json
{
  "Gara 21707 - Lotto 3 - DC": {
    "name": "Gara 21707 - Lotto 3 - DC",
    "base_amount": 5000000.0,
    "max_tech_score": 60.0,
    "max_econ_score": 40.0,
    "max_raw_score": 150.0,
    "alpha": 0.3,
    "economic_formula": "interp_alpha",
    "company_certs": [
      {"label": "ISO 9001", "points": 2.0, "gara_weight": 1.0},
      {"label": "ISO 27001", "points": 2.0, "gara_weight": 1.0}
    ],
    "reqs": [
      {
        "id": "REQ_01",
        "label": "Certificazioni Professionali",
        "type": "resource",
        "max_points": 35.0,
        "gara_weight": 10.0,
        "prof_R": 5,
        "prof_C": 5,
        "max_res": 5,
        "max_certs": 5,
        "selected_prof_certs": ["AWS Solutions Architect", "Azure Administrator"]
      }
    ],
    "state": {}
  }
}
```

---

### POST /api/config

Aggiorna la configurazione di uno o più lotti.

**Request Body:**

```json
{
  "Gara 21707 - Lotto 3 - DC": {
    "name": "Gara 21707 - Lotto 3 - DC",
    "base_amount": 5500000.0,
    "max_tech_score": 60.0,
    "max_econ_score": 40.0,
    "alpha": 0.25,
    "company_certs": [],
    "reqs": []
  }
}
```

**Response 200:** Configurazione aggiornata (stesso formato GET)

---

### POST /api/config/add

Crea un nuovo lotto con configurazione di default.

**Query Parameters:**

- `lot_key` (string, required): Nome/identificativo del nuovo lotto

**Request:**

```text
POST /api/config/add?lot_key=Nuova%20Gara%202026
```

**Response 200:**

```json
{
  "name": "Nuova Gara 2026",
  "base_amount": 1000000.0,
  "max_tech_score": 60.0,
  "max_econ_score": 40.0,
  "company_certs": [
    {"label": "ISO 9001", "points": 2.0},
    {"label": "ISO 27001", "points": 2.0}
  ],
  "reqs": []
}
```

**Response 400:** Lotto già esistente

---

### DELETE /api/config/{lot_key}

Elimina un lotto esistente.

**Path Parameters:**

- `lot_key` (string): Identificativo del lotto

**Response 200:**

```json
{
  "status": "success",
  "message": "Gara/Lotto Nuova Gara 2026 eliminato"
}
```

**Response 404:** Lotto non trovato

---

### POST /api/config/state

Salva lo stato della simulazione per un lotto (persistenza sconto, input tecnici).

**Query Parameters:**

- `lot_key` (string, required): Identificativo del lotto

**Request Body:**

```json
{
  "my_discount": 35.5,
  "competitor_discount": 30.0,
  "competitor_tech_score": 55.0,
  "competitor_econ_discount": 28.0,
  "tech_inputs": {
    "REQ_01": {"r_val": 4, "c_val": 3}
  },
  "company_certs": {
    "ISO 9001": true,
    "ISO 27001": false
  }
}
```

**Response 200:**

```json
{"status": "success"}
```

---

### GET /api/config/{lot_key}/req/{req_id}/criteria

Recupera i criteri di un requisito specifico.

**Response 200:**

```json
{
  "req_id": "REQ_02",
  "label": "Referenza Aziendale",
  "type": "reference",
  "max_points": 25.0,
  "criteria": [
    {"id": "a", "label": "Complessità progetto", "weight": 1.5, "max_value": 5},
    {"id": "b", "label": "Durata contratto", "weight": 1.0, "max_value": 5}
  ],
  "bonus_label": null,
  "bonus_val": 0.0
}
```

---

### POST /api/config/{lot_key}/req/{req_id}/criteria

Aggiorna i criteri di un requisito.

**Request Body:**

```json
[
  {"id": "a", "label": "Complessità progetto", "weight": 2.0, "max_value": 5},
  {"id": "b", "label": "Durata contratto", "weight": 1.0, "max_value": 5}
]
```

**Response 200:**

```json
{
  "status": "success",
  "message": "Criteri aggiornati per REQ_02"
}
```

---

## Master Data

### GET /api/master-data

Recupera i dati master condivisi (certificazioni, etichette, formule).

**Response 200:**

```json
{
  "company_certs": [
    "ISO 9001",
    "ISO 27001",
    "ISO 14001",
    "ISO 20000"
  ],
  "prof_certs": [
    "AWS Solutions Architect",
    "Azure Administrator",
    "Google Cloud Professional",
    "ITIL Foundation"
  ],
  "requirement_labels": [
    "Certificazioni Professionali",
    "Referenza Aziendale",
    "Progetto Tecnico"
  ],
  "economic_formulas": [
    {
      "id": "interp_alpha",
      "label": "Interpolazione con Alpha",
      "desc": "P_{econ} = P_{max} × ((P_{base} - P_{off}) / (P_{base} - P_{best}))^\\alpha"
    }
  ]
}
```

---

### POST /api/master-data

Aggiorna i dati master.

**Request Body:** Stesso formato della response GET

**Response 200:** Dati master aggiornati

---

## Scoring & Simulation

### POST /api/calculate

Calcola punteggi tecnici ed economici completi.

**Request Body:**

```json
{
  "lot_key": "Gara 21707 - Lotto 3 - DC",
  "base_amount": 5000000.0,
  "competitor_discount": 30.0,
  "my_discount": 35.0,
  "tech_inputs": [
    {
      "req_id": "REQ_01",
      "r_val": 4,
      "c_val": 3
    },
    {
      "req_id": "REQ_02",
      "sub_req_vals": [
        {"sub_id": "a", "val": 4},
        {"sub_id": "b", "val": 5}
      ],
      "attestazione_active": true,
      "custom_metric_vals": {"M1": 3.5}
    }
  ],
  "selected_company_certs": ["ISO 9001", "ISO 27001"]
}
```

**Response 200:**

```json
{
  "technical_score": 52.35,
  "economic_score": 38.75,
  "competitor_economic_score": 35.20,
  "total_score": 91.10,
  "raw_technical_score": 78.50,
  "company_certs_score": 4.0,
  "details": {
    "REQ_01": 28.0,
    "REQ_02": 22.5
  },
  "max_raw_scores": {
    "REQ_01": 35.0,
    "REQ_02": 25.0
  },
  "weighted_scores": {
    "REQ_01": 8.0,
    "REQ_02": 9.0
  },
  "category_company_certs": 2.0,
  "category_resource": 8.0,
  "category_reference": 9.0,
  "category_project": 0.0,
  "calculated_max_tech_score": 60.0,
  "calculated_max_raw_score": 150.0,
  "calculated_max_econ_score": 40.0
}
```

**Campi Response:**

| Campo | Tipo | Descrizione |
| --- | --- | --- |
| `technical_score` | float | Punteggio tecnico pesato (gara points) |
| `economic_score` | float | Punteggio economico |
| `total_score` | float | Somma tech + econ |
| `raw_technical_score` | float | Punteggio tecnico grezzo (prima della pesatura) |
| `details` | object | Punteggi raw per requisito |
| `weighted_scores` | object | Punteggi pesati per requisito |
| `category_*` | float | Somme per categoria |

---

### POST /api/simulate

Genera curva di simulazione: punteggio totale per ogni livello di sconto.

**Request Body:**

```json
{
  "lot_key": "Gara 21707 - Lotto 3 - DC",
  "base_amount": 5000000.0,
  "competitor_discount": 30.0,
  "my_discount": 35.0,
  "current_tech_score": 52.35
}
```

**Response 200:**

```json
[
  {"discount": 10, "total_score": 70.25, "economic_score": 17.90},
  {"discount": 12, "total_score": 72.50, "economic_score": 20.15},
  {"discount": 70, "total_score": 92.35, "economic_score": 40.00}
]
```

> **Nota:** Itera sconti dal 10% al 70% con step di 2%.
> Il `current_tech_score` viene clampato al `max_tech_score` del lotto.

---

### POST /api/monte-carlo

Esegue simulazione Monte Carlo per calcolare probabilità di vittoria.

**Request Body:**

```json
{
  "lot_key": "Gara 21707 - Lotto 3 - DC",
  "base_amount": 5000000.0,
  "my_discount": 35.0,
  "competitor_discount_mean": 30.0,
  "competitor_discount_std": 3.5,
  "current_tech_score": 52.35,
  "competitor_tech_score_mean": 55.0,
  "competitor_tech_score_std": 3.0,
  "iterations": 500
}
```

**Parametri:**

| Parametro | Default | Descrizione |
| --- | --- | --- |
| `competitor_discount_std` | 3.5 | Deviazione standard sconto competitore |
| `competitor_tech_score_mean` | 90% max | Media punteggio tecnico competitore |
| `competitor_tech_score_std` | 3.0 | Deviazione standard tech competitore |
| `iterations` | 500 | Numero iterazioni (max 10000) |

**Response 200:**

```json
{
  "win_probability": 78.4,
  "iterations": 500,
  "avg_total_score": 91.25,
  "min_score": 85.30,
  "max_score": 96.80,
  "score_distribution": [91.2, 90.8, 92.1],
  "competitor_avg_score": 88.50,
  "competitor_min_score": 82.10,
  "competitor_max_score": 94.20,
  "competitor_threshold": 88.50
}
```

---

### POST /api/optimize-discount

Trova lo sconto ottimale per battere un competitore specifico.

**Request Body:**

```json
{
  "lot_key": "Gara 21707 - Lotto 3 - DC",
  "base_amount": 5000000.0,
  "my_tech_score": 52.35,
  "competitor_tech_score": 55.0,
  "competitor_discount": 28.0,
  "best_offer_discount": 30.0
}
```

**Response 200:**

```json
{
  "competitor_total_score": 88.50,
  "competitor_tech_score": 55.0,
  "competitor_econ_score": 33.50,
  "scenarios": [
    {
      "name": "Conservativo",
      "suggested_discount": 32.0,
      "resulting_total_score": 89.25,
      "resulting_economic_score": 36.90,
      "win_probability": 72.5,
      "economic_impact": 1600000.0,
      "delta_vs_competitor": 0.75
    },
    {
      "name": "Bilanciato",
      "suggested_discount": 37.0,
      "resulting_total_score": 91.80,
      "resulting_economic_score": 39.45,
      "win_probability": 85.0,
      "economic_impact": 1850000.0,
      "delta_vs_competitor": 3.30
    },
    {
      "name": "Aggressivo",
      "suggested_discount": 42.0,
      "win_probability": 92.5
    },
    {
      "name": "Max",
      "suggested_discount": 47.0,
      "win_probability": 96.0
    }
  ]
}
```

**Scenari:**

- **Conservativo**: Minimo sconto per battere il competitore
- **Bilanciato**: +5% sopra conservativo
- **Aggressivo**: +10% sopra conservativo
- **Max**: +15% sopra conservativo

---

## Export

### POST /api/export-pdf

Genera report PDF professionale.

**Request Body:**

```json
{
  "lot_key": "Gara 21707 - Lotto 3 - DC",
  "base_amount": 5000000.0,
  "technical_score": 52.35,
  "economic_score": 38.75,
  "total_score": 91.10,
  "my_discount": 35.0,
  "competitor_discount": 30.0,
  "competitor_tech_score": 55.0,
  "category_company_certs": 2.0,
  "category_resource": 8.0,
  "category_reference": 9.0,
  "category_project": 0.0,
  "max_tech_score": 60.0,
  "max_econ_score": 40.0
}
```

**Response 200:**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename=report_Gara_21707_Lotto_3_DC.pdf`

**Contenuto PDF:**

1. Intestazione con logo e data
2. Riepilogo punteggi (gauge grafici)
3. Dettaglio per categoria
4. Distribuzione Monte Carlo (istogramma)
5. Analisi strategica

---

## Schemi Dati

### LotConfig

```typescript
interface LotConfig {
  name: string;                    // Nome identificativo
  base_amount: number;             // Importo base gara (€)
  max_tech_score: number;          // Max punteggio tecnico (default: 60)
  max_econ_score: number;          // Max punteggio economico (default: 40)
  max_raw_score: number;           // Max punteggio grezzo (auto-calcolato)
  alpha: number;                   // Esponente formula economica (0-1)
  economic_formula: string;        // ID formula ("interp_alpha")
  company_certs: CompanyCert[];    // Certificazioni aziendali
  reqs: Requirement[];             // Requisiti tecnici
  state?: SimulationState;         // Stato simulazione salvato
}
```

### Requirement

```typescript
interface Requirement {
  id: string;                      // ID univoco (es. "REQ_01")
  label: string;                   // Etichetta descrittiva
  type: "resource" | "reference" | "project";
  max_points: number;              // Max punti raw (auto-calcolato)
  gara_weight: number;             // Peso nella gara (punti finali)
  
  // Solo per type="resource"
  prof_R?: number;                 // Max risorse attese
  prof_C?: number;                 // Max certificazioni per risorsa
  max_res?: number;                // Alias prof_R
  max_certs?: number;              // Alias prof_C
  selected_prof_certs?: string[];  // Certificazioni selezionate
  
  // Solo per type="reference" | "project"
  sub_reqs?: SubReq[];             // Criteri di valutazione
  criteria?: SubReq[];             // Alias sub_reqs
  attestazione_score?: number;     // Punti attestazione cliente
  custom_metrics?: CustomMetric[]; // Voci tabellari
  bonus_label?: string;            // Etichetta bonus (legacy)
  bonus_val?: number;              // Punti bonus (legacy)
}
```

### SubReq (Criterio)

```typescript
interface SubReq {
  id: string;        // ID (es. "a", "b", "c")
  label: string;     // Descrizione criterio
  weight: number;    // Peso interno (default: 1.0)
  max_value?: number; // Valore massimo (default: 5)
}
```

### TechInput

```typescript
interface TechInput {
  req_id: string;                   // ID requisito
  r_val?: number;                   // Numero risorse (per resource)
  c_val?: number;                   // Numero certificazioni (per resource)
  sub_req_vals?: SubReqVal[];       // Valori criteri (per reference/project)
  bonus_active?: boolean;           // Bonus attivato
  attestazione_active?: boolean;    // Attestazione cliente attivata
  custom_metric_vals?: Record<string, number>; // Valori metriche custom
}

interface SubReqVal {
  sub_id: string;   // ID criterio
  val: number;      // Valore assegnato (0-5)
}
```

---

## Codici Errore

| Codice | Descrizione |
| --- | --- |
| 400 | Bad Request - Parametri non validi |
| 401 | Unauthorized - Token mancante o non valido |
| 404 | Not Found - Risorsa non trovata |
| 413 | Payload Too Large - Max 10MB |
| 422 | Validation Error - Errore validazione Pydantic |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Sistema non pronto |

**Formato errore standard:**

```json
{
  "detail": "Messaggio di errore"
}
```

**Formato errore validazione (422):**

```json
{
  "detail": "Validation error",
  "errors": [
    {
      "loc": ["body", "base_amount"],
      "msg": "Input should be greater than 0",
      "type": "greater_than"
    }
  ]
}
```
