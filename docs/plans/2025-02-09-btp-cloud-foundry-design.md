# Design: Deployment su SAP BTP Cloud Foundry

**Data**: 2025-02-09  
**Aggiornamento**: 2025-02-10  
**Stato**: Approvato (Revisionato)  
**Branch**: `feature/btp-cloud-foundry` (da creare)

## Obiettivo

Deployare l'applicazione simulator-poste su SAP BTP Cloud Foundry minimizzando gli impatti sul codice esistente, mantenendo l'implementazione Render.com funzionante in parallelo.

## Decisioni Chiave

| Aspetto | Decisione | Motivazione |
| --- | --- | --- |
| Database | PostgreSQL (BTP managed) | SQLAlchemy già supportato, CF è stateless |
| Frontend | nginx-buildpack | Migliore controllo su routing e proxy API |
| Auth | OIDC diretto con SAP IAS | Zero modifiche al codice auth esistente |
| Ambiente | CF org/space esistente | Già disponibile |
| OCR | **Disabilitato** su CF | Tesseract/Poppler non disponibili su CF buildpacks |

## Limitazioni Cloud Foundry

> ⚠️ **IMPORTANTE**: La funzionalità **Verifica Certificazioni PDF (OCR)** non sarà disponibile su BTP Cloud Foundry.
>
> **Motivo**: Il Python buildpack di CF non include Tesseract OCR e Poppler (necessari per `pytesseract` e `pdf2image`). L'installazione di pacchetti di sistema non è supportata nei buildpack standard.
>
> **Workaround futuri**:
>
> - Usare un Docker container custom (CF supporta Docker, richiede configurazione extra)
> - Integrare un servizio OCR esterno (es. SAP Document Information Extraction, Google Vision API)
> - Mantenere la funzionalità OCR solo su deployment Docker (locale/Render.com)

## Architettura

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                         SAP BTP Cloud Foundry                             │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌────────────────────┐                ┌─────────────────────────────┐   │
│  │   Frontend App     │                │       Backend App           │   │
│  │   (nginx-buildpack)│   ──/api/──►   │       (python_buildpack)    │   │
│  │                    │                │                             │   │
│  │  - Vite build      │                │  - FastAPI                  │   │
│  │  - SPA routing     │                │  - Gunicorn                 │   │
│  │  - API proxy       │                │  - SQLAlchemy               │   │
│  └────────────────────┘                └──────────────┬──────────────┘   │
│           │                                           │                   │
│           ▼                                           ▼                   │
│  ┌────────────────────┐                ┌─────────────────────────────┐   │
│  │  CF Route          │                │   PostgreSQL Service        │   │
│  │  (*.cfapps.eu10)   │                │   (SAP BTP managed)         │   │
│  └────────────────────┘                └─────────────────────────────┘   │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                       ┌──────────────────────┐
                       │      SAP IAS         │
                       │  (OIDC Provider)     │
                       │  asojzafbi.accounts  │
                       │  .ondemand.com       │
                       └──────────────────────┘
```

## File da Creare

### 1. `mta.yaml` (root) - Multi-Target Application Descriptor

```yaml
_schema-version: "3.1"
ID: simulator-poste
version: 1.0.0
description: "Simulatore Gara Poste - Technical and Economic Score Simulator"

parameters:
  enable-parallel-deployments: true

build-parameters:
  before-all:
    - builder: custom
      commands:
        - echo "Building simulator-poste MTA"

modules:
  # ═══════════════════════════════════════════════════════════════════
  # Backend Python Application
  # ═══════════════════════════════════════════════════════════════════
  - name: simulator-poste-backend
    type: python
    path: backend
    parameters:
      buildpack: python_buildpack
      memory: 512M
      disk-quota: 1G
      instances: 1
      command: gunicorn main:app --bind 0.0.0.0:$PORT --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120
    properties:
      ENVIRONMENT: production
      # OCR disabled on CF (Tesseract/Poppler not available)
      OCR_ENABLED: "false"
    requires:
      - name: simulator-poste-db
    provides:
      - name: backend-api
        properties:
          url: ${default-url}
    build-parameters:
      builder: custom
      commands:
        - pip download -r requirements-cf.txt -d vendor --no-binary :all: || pip download -r requirements-cf.txt -d vendor

  # ═══════════════════════════════════════════════════════════════════
  # Frontend Static Application
  # ═══════════════════════════════════════════════════════════════════
  - name: simulator-poste-frontend
    type: staticfile
    path: frontend
    parameters:
      buildpack: nginx-buildpack
      memory: 128M
      disk-quota: 256M
      instances: 1
    properties:
      BACKEND_URL: ~{backend-api/url}
    requires:
      - name: backend-api
    build-parameters:
      builder: npm
      build-result: dist
      commands:
        - npm ci --only=production
        - npm run build:cf
      requires:
        - name: simulator-poste-backend
          properties:
            VITE_API_URL: ~{url}/api

resources:
  # ═══════════════════════════════════════════════════════════════════
  # PostgreSQL Database Service
  # ═══════════════════════════════════════════════════════════════════
  - name: simulator-poste-db
    type: org.cloudfoundry.managed-service
    parameters:
      service: postgresql-db
      service-plan: trial  # Use "standard" for production
    properties:
      # Connection will be injected via VCAP_SERVICES
```

### 2. `backend/manifest.yml` - CF Manifest (alternativa a MTA per deploy standalone)

```yaml
---
applications:
  - name: simulator-poste-backend
    memory: 512M
    disk_quota: 1G
    instances: 1
    buildpack: python_buildpack
    command: gunicorn main:app --bind 0.0.0.0:$PORT --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120
    path: .
    env:
      ENVIRONMENT: production
      OCR_ENABLED: "false"
    services:
      - simulator-poste-db
    routes:
      - route: simulator-poste-backend.cfapps.eu10.hana.ondemand.com
```

### 3. `backend/requirements-cf.txt` - Requisiti senza OCR

```text
fastapi==0.128.0
uvicorn==0.40.0
pydantic==2.12.5
python-multipart==0.0.21
gunicorn==23.0.0
numpy==1.26.4
reportlab==4.4.9
matplotlib==3.9.4
sqlalchemy==2.0.46
psycopg2-binary==2.9.10
python-json-logger==2.0.7
psutil==5.9.8
python-dotenv==1.0.1
python-jose[cryptography]==3.3.0
requests==2.31.0
cairosvg==2.8.2
# OCR packages EXCLUDED for CF deployment
# pytesseract==0.3.13
# pdf2image==1.17.0
# Pillow==11.2.1
```

### 4. `backend/runtime.txt`

```text
python-3.11.x
```

### 5. `backend/Procfile` - Gunicorn startup

```text
web: gunicorn main:app --bind 0.0.0.0:$PORT --workers 2 --worker-class uvicorn.workers.UvicornWorker --timeout 120 --access-logfile - --error-logfile -
```

### 6. `frontend/manifest.yml` - Frontend CF Manifest

```yaml
---
applications:
  - name: simulator-poste-frontend
    memory: 128M
    disk_quota: 256M
    instances: 1
    buildpack: nginx-buildpack
    path: dist
    routes:
      - route: simulator-poste-frontend.cfapps.eu10.hana.ondemand.com
```

### 7. `frontend/Staticfile` - nginx-buildpack config

```text
pushstate: enabled
force_https: true
```

### 8. `frontend/nginx.conf` - Custom nginx configuration

```nginx
worker_processes 1;
daemon off;

error_log stderr;
events { worker_connections 1024; }

http {
    charset utf-8;
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /dev/stdout main;

    default_type application/octet-stream;
    include mime.types;
    sendfile on;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    server {
        listen {{port}};
        server_name localhost;
        root /home/vcap/app/public;

        # API Proxy to Backend
        location /api/ {
            proxy_pass {{env "BACKEND_URL"}}/api/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_read_timeout 120s;
            proxy_connect_timeout 60s;
        }

        # SPA fallback routing
        location / {
            try_files $uri $uri/ /index.html;
        }

        # Security headers
        add_header X-Frame-Options "DENY" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }
}
```

### 9. `frontend/mime.types` - MIME types per nginx

```text
types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml;
    application/javascript                js;
    application/json                      json;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/png                             png;
    image/svg+xml                         svg svgz;
    image/webp                            webp;
    font/woff                             woff;
    font/woff2                            woff2;
    application/font-woff                 woff;
    application/font-woff2                woff2;
}
```

### 10. `frontend/buildpack.yml` - nginx-buildpack config

```yaml
nginx:
  version: 1.25.x
```

## File da Modificare

### 1. `backend/database.py` - Supporto VCAP_SERVICES

```python
"""
Database configuration and setup for SQLite/PostgreSQL
Supports local development (SQLite) and BTP Cloud Foundry (PostgreSQL via VCAP_SERVICES)
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import json
import logging

logger = logging.getLogger(__name__)


def get_database_url() -> str:
    """
    Get database URL with priority:
    1. VCAP_SERVICES (BTP Cloud Foundry)
    2. DATABASE_URL environment variable
    3. SQLite fallback for local development
    """
    # Check for BTP Cloud Foundry environment
    if "VCAP_SERVICES" in os.environ:
        try:
            vcap = json.loads(os.environ["VCAP_SERVICES"])
            
            # Try different PostgreSQL service names used in BTP
            pg_services = (
                vcap.get("postgresql-db") or 
                vcap.get("postgresql") or 
                vcap.get("postgres")
            )
            
            if pg_services and len(pg_services) > 0:
                creds = pg_services[0]["credentials"]
                
                # Prefer URI if available, otherwise build from components
                if "uri" in creds:
                    db_url = creds["uri"]
                else:
                    db_url = (
                        f"postgresql://{creds['username']}:{creds['password']}"
                        f"@{creds['hostname']}:{creds['port']}/{creds['dbname']}"
                    )
                
                logger.info("Using PostgreSQL from VCAP_SERVICES")
                return db_url
                
        except (json.JSONDecodeError, KeyError, IndexError) as e:
            logger.error(f"Failed to parse VCAP_SERVICES: {e}")
    
    # Check for explicit DATABASE_URL
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        logger.info(f"Using DATABASE_URL: {db_url[:30]}...")
        return db_url
    
    # Fallback to SQLite for local development
    logger.info("Using SQLite fallback for local development")
    return "sqlite:///./simulator_poste.db"


# Get database URL
DATABASE_URL = get_database_url()

# Determine if using SQLite (for specific options)
is_sqlite = "sqlite" in DATABASE_URL.lower()

# Create engine with appropriate options
engine_kwargs = {
    "echo": False,  # Set to True for SQL query logging
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL connection pool settings for production
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_pre_ping"] = True  # Check connection health

engine = create_engine(DATABASE_URL, **engine_kwargs)

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for models
Base = declarative_base()
```

### 2. `backend/main.py` - Disabilitare OCR su CF

Aggiungere check per `OCR_ENABLED` nelle route OCR:

```python
# In main.py - aggiungere all'inizio
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() == "true"

# Modificare gli endpoint OCR per restituire errore se disabilitato
@router.get("/verify-certs/status")
async def get_ocr_status():
    """Check OCR availability"""
    if not OCR_ENABLED:
        return {
            "ocr_available": False,
            "message": "OCR is disabled on this deployment (Cloud Foundry)",
            "reason": "Tesseract and Poppler are not available on CF buildpacks"
        }
    # ... resto del codice esistente ...
```

### 3. `frontend/package.json` - Script build CF

Aggiungere script dedicato per build CF:

```json
{
  "scripts": {
    "build": "vite build",
    "build:cf": "VITE_API_URL=/api vite build"
  }
}
```

### 4. `frontend/vite.config.js` - Configurazione base path

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: mode !== 'production',
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
}))
```

## Configurazione SAP IAS

Aggiungere alle Redirect URIs dell'applicazione OIDC esistente:

```text
https://simulator-poste-frontend.cfapps.eu10.hana.ondemand.com/callback
https://simulator-poste-frontend.cfapps.eu10.hana.ondemand.com
```

Post-Logout Redirect URIs:

```text
https://simulator-poste-frontend.cfapps.eu10.hana.ondemand.com
```

**Nota**: Gli URL Render.com esistenti rimangono configurati per funzionamento parallelo.

## Variabili d'Ambiente CF

### Backend

| Variabile | Valore | Note |
| --- | --- | --- |
| `ENVIRONMENT` | `production` | Abilita logging production |
| `OCR_ENABLED` | `false` | Disabilita OCR (non supportato su CF) |
| `OIDC_ISSUER` | `https://asojzafbi.accounts.ondemand.com` | SAP IAS issuer |
| `OIDC_CLIENT_ID` | `c763a5f1-287c-4115-93bc-61e06b1bd7a3` | Existing client ID |
| `OIDC_AUDIENCE` | `c763a5f1-287c-4115-93bc-61e06b1bd7a3` | Same as client ID |
| `FRONTEND_URL` | `https://simulator-poste-frontend.cfapps.eu10.hana.ondemand.com` | For CORS |

### Frontend (build-time)

| Variabile | Valore | Note |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Relative path, nginx proxies to backend |
| `VITE_OIDC_AUTHORITY` | `https://asojzafbi.accounts.ondemand.com` | SAP IAS |
| `VITE_OIDC_CLIENT_ID` | `c763a5f1-287c-4115-93bc-61e06b1bd7a3` | OIDC client |

## Processo di Deployment

### Opzione 1: MTA Build & Deploy (Raccomandato)

```bash
# 1. Installa MBT (MTA Build Tool) se non presente
npm install -g mbt

# 2. Login a Cloud Foundry
cf login -a https://api.cf.eu10.hana.ondemand.com -o <ORG> -s <SPACE>

# 3. Crea servizio PostgreSQL (una tantum)
cf create-service postgresql-db trial simulator-poste-db

# 4. Attendi che il servizio sia pronto
cf service simulator-poste-db

# 5. Build MTA archive
mbt build

# 6. Deploy
cf deploy mta_archives/simulator-poste_1.0.0.mtar

# 7. Verifica
cf apps
cf logs simulator-poste-backend --recent
```

### Opzione 2: Deploy Manuale (per debug)

```bash
# Backend
cd backend
cf push simulator-poste-backend -f manifest.yml

# Frontend (dopo build locale)
cd frontend
npm run build:cf
cf push simulator-poste-frontend -f manifest.yml
```

### Rollback

```bash
# Visualizza deployment history
cf mta-ops

# Rollback a versione precedente
cf undeploy simulator-poste --delete-services=false
cf deploy mta_archives/simulator-poste_<PREVIOUS_VERSION>.mtar
```

## Migrazione Dati

Se hai dati esistenti su SQLite (Render.com), puoi migrarli:

```bash
# 1. Export da SQLite locale
sqlite3 simulator_poste.db .dump > data_export.sql

# 2. Converti SQL per PostgreSQL (se necessario)
# Nota: SQLite e PostgreSQL hanno differenze sintattiche minime per INSERT

# 3. Ottieni credenziali PostgreSQL CF
cf env simulator-poste-backend | grep VCAP_SERVICES

# 4. Connect e import (usando cf ssh tunnel)
cf ssh -L 5432:${PG_HOST}:${PG_PORT} simulator-poste-backend

# In altro terminale
psql -h localhost -p 5432 -U ${PG_USER} -d ${PG_DB} < data_export.sql
```

## Impatto Totale

| Area | File Nuovi | File Modificati | Righe di Codice |
| --- | --- | --- | --- |
| Backend | 3 (`runtime.txt`, `Procfile`, `manifest.yml`, `requirements-cf.txt`) | 2 (`database.py`, `main.py`) | ~80 righe |
| Frontend | 5 (`Staticfile`, `nginx.conf`, `mime.types`, `buildpack.yml`, `manifest.yml`) | 2 (`package.json`, `vite.config.js`) | ~120 righe |
| Root | 1 (`mta.yaml`) | 0 | ~70 righe |
| **Totale** | **9 file** | **4 file** | **~270 righe** |

## Confronto Ambienti

| Aspetto | Docker (locale) | Render.com | BTP Cloud Foundry |
| --- | --- | --- | --- |
| Database | SQLite | SQLite (persistent disk) | PostgreSQL (managed) |
| OCR | ✅ Funzionante | ✅ Funzionante | ❌ Disabilitato |
| Auth | SAP IAS OIDC | SAP IAS OIDC | SAP IAS OIDC |
| Scaling | Manuale | Auto (paid plans) | Auto (CF native) |
| Costo | Free | $7/mese (starter) | Incluso nel BTP contract |
| SSL | Manuale | Automatico | Automatico |

## Checklist Implementazione

### Fase 1: Preparazione Branch

- [ ] Creare branch `feature/btp-cloud-foundry`
- [ ] Verificare accesso CF: `cf target`

### Fase 2: Backend

- [ ] Creare `backend/requirements-cf.txt` (senza OCR packages)
- [ ] Creare `backend/runtime.txt` con `python-3.11.x`
- [ ] Creare `backend/Procfile` per Gunicorn
- [ ] Creare `backend/manifest.yml`
- [ ] Modificare `backend/database.py` per VCAP_SERVICES
- [ ] Modificare `backend/main.py` aggiungere `OCR_ENABLED` check
- [ ] Testare localmente con `DATABASE_URL` PostgreSQL

### Fase 3: Frontend

- [ ] Creare `frontend/Staticfile`
- [ ] Creare `frontend/nginx.conf` con proxy configuration
- [ ] Creare `frontend/mime.types`
- [ ] Creare `frontend/buildpack.yml`
- [ ] Creare `frontend/manifest.yml`
- [ ] Aggiungere script `build:cf` in `package.json`
- [ ] Verificare build: `npm run build:cf`

### Fase 4: Root

- [ ] Creare `mta.yaml`
- [ ] Verificare MBT installato: `mbt --version`

### Fase 5: Deployment

- [ ] Login CF: `cf login`
- [ ] Creare PostgreSQL service: `cf create-service postgresql-db trial simulator-poste-db`
- [ ] Build MTA: `mbt build`
- [ ] Deploy: `cf deploy mta_archives/simulator-poste_*.mtar`

### Fase 6: Post-Deploy

- [ ] Verificare apps: `cf apps`
- [ ] Controllare logs backend: `cf logs simulator-poste-backend --recent`
- [ ] Aggiungere redirect URIs in SAP IAS
- [ ] Test login OIDC
- [ ] Test funzionalità (escluso OCR)
- [ ] Verificare messaggio OCR disabilitato nella UI

### Fase 7: Finalize

- [ ] Documentare URLs finali
- [ ] Merge in main (opzionale)
- [ ] Setup CI/CD pipeline (opzionale)

## Troubleshooting

### Errori Comuni

| Errore | Causa | Soluzione |
| --- | --- | --- |
| `502 Bad Gateway` | Backend non risponde | Verificare logs: `cf logs simulator-poste-backend --recent` |
| `VCAP_SERVICES not found` | Service non bound | `cf bind-service simulator-poste-backend simulator-poste-db` |
| `Connection refused /api` | Proxy nginx mal configurato | Verificare `BACKEND_URL` in frontend env |
| `401 Unauthorized` | Token non valido | Verificare OIDC config e redirect URIs |
| `App crashed` | OOM o startup error | Aumentare memory in manifest.yml |

### Comandi Utili

```bash
# Visualizza env vars
cf env simulator-poste-backend

# Restart app
cf restart simulator-poste-backend

# SSH into app container
cf ssh simulator-poste-backend

# Tail logs in real-time
cf logs simulator-poste-backend

# Scale app
cf scale simulator-poste-backend -i 2

# Visualizza service keys (DB credentials)
cf create-service-key simulator-poste-db mykey
cf service-key simulator-poste-db mykey
```

## Note

- L'implementazione Render.com rimane intatta e funzionante
- Il `client_id` OIDC rimane invariato
- Nessuna modifica alla logica business, API, o autenticazione
- **La funzionalità OCR (Verifica Certificazioni) è disponibile SOLO su Docker/Render.com**

## Evoluzione Futura

### Abilitare OCR su BTP

Se in futuro si volesse abilitare OCR su BTP, le opzioni sono:

1. **CF Docker Support**

   ```yaml
   # manifest.yml con Docker
   applications:
     - name: simulator-poste-backend
       docker:
         image: ghcr.io/raistlin82/simulator-poste-backend:latest
   ```

   Richiede: Docker image con Tesseract preinstallato, CF Docker support abilitato

2. **SAP Document Information Extraction**
   - Servizio SAP BTP per estrazione documenti
   - Richiede subscription e integrazione API

3. **Microservizio OCR Dedicato**
   - Deploy container Docker separato solo per OCR
   - Backend principale resta su CF standard

## Appendice: URL Finali (template)

| Servizio | URL |
| --- | --- |
| Frontend | `https://simulator-poste-frontend.cfapps.eu10.hana.ondemand.com` |
| Backend | `https://simulator-poste-backend.cfapps.eu10.hana.ondemand.com` |
| API Health | `https://simulator-poste-backend.cfapps.eu10.hana.ondemand.com/health` |

---

*Documento aggiornato il 2025-02-10 con analisi approfondita e configurazioni production-ready.*
