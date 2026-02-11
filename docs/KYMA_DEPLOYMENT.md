# Kyma Deployment Guide - Simulator Poste

**Ultima revisione**: Febbraio 2026  
**Versione**: 2.0 (completa)

Questa guida documenta **passo per passo** l'intero processo di deployment dell'applicazione Simulator Poste su SAP BTP Kyma, dalle configurazioni iniziali al deploy automatizzato.

---

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [Architettura dell'Applicazione](#2-architettura-dellapplicazione)
3. [Configurazione SAP BTP Kyma](#3-configurazione-sap-btp-kyma)
4. [Configurazione SAP IAS (Identity Authentication)](#4-configurazione-sap-ias-identity-authentication)
5. [Configurazione GitHub](#5-configurazione-github)
6. [Configurazione File Kubernetes](#6-configurazione-file-kubernetes)
7. [Primo Deploy Manuale](#7-primo-deploy-manuale)
8. [Deploy Automatizzato (CI/CD)](#8-deploy-automatizzato-cicd)
9. [Verifica e Troubleshooting](#9-verifica-e-troubleshooting)
10. [Lesson Learned](#10-lesson-learned)

---

## 1. Prerequisiti

### 1.1 Account e Servizi SAP

| Requisito | Descrizione |
| --- | --- |
| SAP BTP Account | Accesso a SAP Business Technology Platform |
| Kyma Environment | Ambiente Kyma abilitato nel subaccount |
| SAP IAS | Identity Authentication Service configurato |

### 1.2 Strumenti Locali

```bash
# Verifica installazione kubectl
kubectl version --client

# Se non installato (macOS)
brew install kubectl

# Verifica versione (raccomandato v1.29+)
kubectl version --client --short
```

### 1.3 Account GitHub

- Repository con accesso a **GitHub Container Registry (ghcr.io)**
- Permessi per creare **GitHub Secrets**
- GitHub Actions abilitato

---

## 2. Architettura dell'Applicazione

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET                                         │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     SAP BTP Kyma Cluster                                      │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                    Kyma API Gateway                                      │  │
│  │                (kyma-system/kyma-gateway)                                │  │
│  │         https://simulator-poste.c-xxxxx.kyma.ondemand.com               │  │
│  └─────────────────────────────┬──────────────────────────────────────────┘  │
│                                │                                              │
│  ┌─────────────────────────────┴──────────────────────────────────────────┐  │
│  │                         APIRule v2                                       │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────────┐  │  │
│  │  │  /api/{**}  │    │ /health/{**}│    │          /*                 │  │  │
│  │  │  → backend  │    │  → backend  │    │      → frontend             │  │  │
│  │  └──────┬──────┘    └──────┬──────┘    └────────────┬────────────────┘  │  │
│  └─────────│──────────────────│─────────────────────────│──────────────────┘  │
│            │                  │                         │                      │
│  ┌─────────▼──────────────────▼─────────┐    ┌─────────▼────────────────────┐│
│  │        backend-service:8000           │    │    frontend-service:80       ││
│  │  ┌─────────────────────────────────┐  │    │  ┌────────────────────────┐  ││
│  │  │   simulator-poste-backend       │  │    │  │ simulator-poste-frontend│ ││
│  │  │   FastAPI + Gunicorn            │  │    │  │ Nginx + React SPA      │ ││
│  │  │   1 replica (SQLite constraint) │  │    │  │ 2 repliche             │ ││
│  │  │   UID 1000 (non-root)           │  │    │  │ UID 1000 (non-root)    │ ││
│  │  └───────────────┬─────────────────┘  │    │  └────────────────────────┘  ││
│  └──────────────────│────────────────────┘    └──────────────────────────────┘│
│                     │                                                          │
│  ┌──────────────────▼────────────────────┐                                    │
│  │         PVC: backend-data (1Gi)        │                                    │
│  │         SQLite: /data/simulator.db     │                                    │
│  └────────────────────────────────────────┘                                    │
│                                                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  Secrets & ConfigMaps                                                    │  │
│  │  • oidc-credentials (Secret)                                             │  │
│  │  • backend-config (ConfigMap)                                            │  │
│  │  • frontend-config (ConfigMap) - solo riferimento                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Componenti

| Componente | Tecnologia | Container Image | Note |
| --- | --- | --- | --- |
| Backend | FastAPI + Python 3.10 | `ghcr.io/{owner}/simulator-poste-backend` | Gunicorn con 4 workers |
| Frontend | React 18 + Vite | `ghcr.io/{owner}/simulator-poste-frontend` | Nginx per SPA |
| Database | SQLite | N/A | Persistente su PVC |
| Auth | OIDC | SAP IAS | Token validation nel backend |

---

## 3. Configurazione SAP BTP Kyma

### 3.1 Ottenere Kubeconfig

1. Accedi a **SAP BTP Cockpit**: <https://cockpit.btp.cloud.sap>
2. Naviga al tuo **Subaccount**
3. Vai su **Kyma Environment** → **Link to dashboard**
4. Oppure scarica direttamente il kubeconfig:
   - Nel subaccount vai su **Overview** → **Kyma Environment**
   - Click su **KubeconfigURL** per scaricare il file

### 3.2 Configurare Kubeconfig Localmente

```bash
# Crea directory se non esiste
mkdir -p ~/.kube

# Copia il kubeconfig scaricato
cp ~/Downloads/kubeconfig.yaml ~/.kube/config-kyma

# Imposta la variabile d'ambiente
export KUBECONFIG=~/.kube/config-kyma

# Verifica connessione
kubectl cluster-info
# Output atteso: Kubernetes control plane is running at https://api.c-xxxxx.kyma.ondemand.com
```

### 3.3 Identificare il Dominio Cluster

Il dominio del cluster si trova nel kubeconfig o nel BTP cockpit:

```bash
# Estrai il dominio dal current-context
kubectl config view --minify -o jsonpath='{.clusters[0].cluster.server}'
# Output: https://api.c-6dc1be8.kyma.ondemand.com

# Il dominio applicativo sarà:
# c-6dc1be8.kyma.ondemand.com
```

**⚠️ ANNOTARE IL DOMINIO**: `c-xxxxxxx.kyma.ondemand.com`

---

## 4. Configurazione SAP IAS (Identity Authentication)

### 4.1 Creare/Configurare Applicazione OIDC

1. Accedi a SAP IAS Admin Console: `https://{tenant}.accounts.ondemand.com/admin`
2. Vai su **Applications & Resources** → **Applications**
3. Crea o modifica l'applicazione `simulator-poste`

### 4.2 Configurare OpenID Connect

In **Trust** → **OpenID Connect Configuration**:

| Campo | Valore |
| --- | --- |
| Name | simulator-poste |
| Subject Name Identifier | Email |
| Default Name ID Format | Email |

### 4.3 Configurare Redirect URIs

In **Trust** → **OpenID Connect Configuration** → **Redirect URIs**:

```text
https://simulator-poste.c-xxxxxxx.kyma.ondemand.com/callback
https://simulator-poste.c-xxxxxxx.kyma.ondemand.com
https://simulator-poste.c-xxxxxxx.kyma.ondemand.com/silent-renew.html
```

### 4.4 Configurare Post Logout Redirect URIs

```text
https://simulator-poste.c-xxxxxxx.kyma.ondemand.com
```

### 4.5 Ottenere Credenziali OIDC

In **Trust** → **OpenID Connect Configuration** → **Secrets**:

1. Click **Add** per generare un nuovo client secret
2. **Annotare**:
   - **Client ID**: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - **Client Secret**: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 4.6 Configurare Token Policy

In **Trust** → **Token Configuration**:

| Campo | Valore |
| --- | --- |
| Token Lifetime | 3600 (1 ora) |
| Refresh Token Lifetime | 43200 (12 ore) |

---

## 5. Configurazione GitHub

### 5.1 Abilitare GitHub Container Registry

1. Vai su **GitHub** → **Settings** → **Developer settings** → **Personal access tokens**
2. Genera token con scope: `write:packages`, `read:packages`, `delete:packages`
3. Oppure usa `GITHUB_TOKEN` (automaticamente disponibile in Actions)

### 5.2 Configurare GitHub Secrets

Vai su **Repository** → **Settings** → **Secrets and variables** → **Actions**

Aggiungi i seguenti secrets:

| Secret Name | Valore | Descrizione |
| --- | --- | --- |
| `KYMA_KUBECONFIG` | `<base64>` | Kubeconfig codificato in base64 |
| `KYMA_APP_URL` | `https://simulator-poste.c-xxxxxxx.kyma.ondemand.com` | URL completo app |
| `OIDC_CLIENT_ID` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Client ID da SAP IAS |
| `OIDC_CLIENT_SECRET` | `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | Client Secret da SAP IAS |
| `OIDC_AUDIENCE` | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` | Uguale al Client ID |
| `OIDC_ISSUER` | `https://asojzafbi.accounts.ondemand.com` | Issuer URL SAP IAS |

### 5.3 Codificare Kubeconfig in Base64

```bash
# macOS/Linux
cat ~/.kube/config-kyma | base64 | tr -d '\n' > kubeconfig-base64.txt

# Copia il contenuto di kubeconfig-base64.txt in GitHub Secret KYMA_KUBECONFIG
cat kubeconfig-base64.txt | pbcopy  # macOS
```

### 5.4 Configurare Environment (opzionale ma raccomandato)

1. Vai su **Repository** → **Settings** → **Environments**
2. Crea environment `production`
3. Aggiungi protection rules se necessario (approval, branch restrictions)

---

## 6. Configurazione File Kubernetes

### 6.1 Struttura Directory

```text
k8s/
├── namespace.yaml           # Namespace con istio-injection
├── apirule.yaml            # Routing API Gateway  [⚠️ MODIFICARE DOMINIO]
├── secrets.yaml.template   # Template (non usato)
├── backend/
│   ├── configmap.yaml      # Env vars backend    [⚠️ MODIFICARE DOMINIO]
│   ├── deployment.yaml     # Pod spec backend
│   ├── service.yaml        # ClusterIP service
│   └── pvc.yaml           # Persistent volume
└── frontend/
    ├── configmap.yaml      # Env vars frontend   [⚠️ MODIFICARE DOMINIO]
    ├── deployment.yaml     # Pod spec frontend
    └── service.yaml        # ClusterIP service
```

### 6.2 File da Aggiornare con Dominio

**IMPORTANTE**: Sostituire `c-xxxxxxx.kyma.ondemand.com` con il tuo dominio cluster.

#### k8s/apirule.yaml (riga 14)

```yaml
spec:
  hosts:
    - simulator-poste.c-xxxxxxx.kyma.ondemand.com  # ← MODIFICARE
```

#### k8s/backend/configmap.yaml (riga 14)

```yaml
data:
  FRONTEND_URL: "https://simulator-poste.c-xxxxxxx.kyma.ondemand.com"  # ← MODIFICARE
```

#### k8s/frontend/configmap.yaml (righe 13-14)

```yaml
data:
  VITE_OIDC_REDIRECT_URI: "https://simulator-poste.c-xxxxxxx.kyma.ondemand.com/callback"  # ← MODIFICARE
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI: "https://simulator-poste.c-xxxxxxx.kyma.ondemand.com"  # ← MODIFICARE
```

### 6.3 Script di Aggiornamento Automatico

```bash
#!/bin/bash
# update-domain.sh

DOMAIN="${1:-c-xxxxxxx.kyma.ondemand.com}"
OLD_DOMAIN="c-6dc1be8.kyma.ondemand.com"  # Dominio attuale nei file

echo "Aggiornamento dominio da $OLD_DOMAIN a $DOMAIN"

# macOS usa -i '' per sed in-place
sed -i '' "s/$OLD_DOMAIN/$DOMAIN/g" k8s/apirule.yaml
sed -i '' "s/$OLD_DOMAIN/$DOMAIN/g" k8s/backend/configmap.yaml
sed -i '' "s/$OLD_DOMAIN/$DOMAIN/g" k8s/frontend/configmap.yaml

echo "File aggiornati!"
grep -r "$DOMAIN" k8s/
```

---

## 7. Primo Deploy Manuale

### 7.1 Preparazione

```bash
# Imposta kubeconfig
export KUBECONFIG=~/.kube/config-kyma

# Verifica connessione
kubectl cluster-info
kubectl get nodes
```

### 7.2 Creazione Namespace

```bash
# Crea namespace con istio-injection
kubectl apply -f k8s/namespace.yaml

# Verifica
kubectl get namespace simulator-poste
# Output: simulator-poste   Active   ...
```

### 7.3 Creazione PVC per SQLite

```bash
kubectl apply -f k8s/backend/pvc.yaml

# Verifica
kubectl get pvc -n simulator-poste
# Output: backend-data   Bound   ...   1Gi   ...
```

### 7.4 Creazione Secret OIDC

```bash
# Crea secret con credenziali OIDC
kubectl create secret generic oidc-credentials \
  --from-literal=client-id="YOUR_CLIENT_ID" \
  --from-literal=client-secret="YOUR_CLIENT_SECRET" \
  --from-literal=audience="YOUR_CLIENT_ID" \
  --from-literal=issuer="https://asojzafbi.accounts.ondemand.com" \
  --namespace=simulator-poste

# Verifica
kubectl get secret oidc-credentials -n simulator-poste
```

### 7.5 Deploy ConfigMaps

```bash
kubectl apply -f k8s/backend/configmap.yaml
kubectl apply -f k8s/frontend/configmap.yaml

# Verifica
kubectl get configmaps -n simulator-poste
```

### 7.6 Deploy Backend

```bash
kubectl apply -f k8s/backend/deployment.yaml
kubectl apply -f k8s/backend/service.yaml

# Attendi che il pod sia pronto
kubectl rollout status deployment/simulator-poste-backend -n simulator-poste --timeout=300s

# Verifica
kubectl get pods -n simulator-poste -l app=simulator-poste-backend
kubectl get service backend-service -n simulator-poste
```

### 7.7 Deploy Frontend

```bash
kubectl apply -f k8s/frontend/deployment.yaml
kubectl apply -f k8s/frontend/service.yaml

# Attendi che i pod siano pronti
kubectl rollout status deployment/simulator-poste-frontend -n simulator-poste --timeout=300s

# Verifica
kubectl get pods -n simulator-poste -l app=simulator-poste-frontend
kubectl get service frontend-service -n simulator-poste
```

### 7.8 Deploy APIRule

```bash
kubectl apply -f k8s/apirule.yaml

# Attendi propagazione (può richiedere 1-2 minuti)
sleep 60

# Verifica status
kubectl get apirules -n simulator-poste
# Status deve essere "OK"
```

### 7.9 Test Deployment

```bash
# Test health endpoint
curl -s https://simulator-poste.c-xxxxxxx.kyma.ondemand.com/health/live
# Output atteso: {"status":"live"}

# Test API config
curl -s https://simulator-poste.c-xxxxxxx.kyma.ondemand.com/api/config
# Output atteso: JSON con configurazione

# Apri frontend nel browser
open https://simulator-poste.c-xxxxxxx.kyma.ondemand.com
```

---

## 8. Deploy Automatizzato (CI/CD)

### 8.1 GitHub Actions Workflow

Il file `.github/workflows/deploy.yml` gestisce:

1. **Build immagini Docker** per backend e frontend
2. **Push** a GitHub Container Registry (ghcr.io)
3. **Deploy** risorse Kubernetes su Kyma

### 8.2 Trigger

| Evento | Branch | Azione |
| --- | --- | --- |
| Push | `main` | Deploy automatico |
| Push | `kyma` | Deploy automatico |
| Manual | qualsiasi | `workflow_dispatch` |

### 8.3 Flusso CI/CD

```text
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Git Push   │ ──▶ │   Build     │ ──▶ │   Deploy    │
│  (main/kyma)│     │ Docker imgs │     │   to Kyma   │
└─────────────┘     └─────────────┘     └─────────────┘
                     ▲           ▲               │
                     │           │               ▼
              ┌──────┴───┐ ┌─────┴────┐   ┌───────────┐
              │ Backend  │ │ Frontend │   │  kubectl  │
              │ Dockerfile│ │Dockerfile│   │  apply    │
              └──────────┘ └──────────┘   └───────────┘
```

### 8.4 Variabili Build Frontend

Il frontend è compilato con variabili OIDC iniettate al build time:

```yaml
build-args: |
  VITE_API_URL=/api
  VITE_OIDC_AUTHORITY=${{ secrets.OIDC_ISSUER }}
  VITE_OIDC_CLIENT_ID=${{ secrets.OIDC_CLIENT_ID }}
  VITE_OIDC_REDIRECT_URI=${{ secrets.KYMA_APP_URL }}/callback
  VITE_OIDC_POST_LOGOUT_REDIRECT_URI=${{ secrets.KYMA_APP_URL }}
```

### 8.5 Forzare Redeploy

```bash
# Via GitHub Actions
# Vai su Actions → Build and Deploy to Kyma → Run workflow

# Via kubectl (restart pods)
kubectl rollout restart deployment/simulator-poste-backend -n simulator-poste
kubectl rollout restart deployment/simulator-poste-frontend -n simulator-poste
```

---

## 9. Verifica e Troubleshooting

### 9.1 Comandi di Verifica

```bash
# Stato generale
kubectl get all -n simulator-poste

# Pod status dettagliato
kubectl get pods -n simulator-poste -o wide

# Log backend
kubectl logs -l app=simulator-poste-backend -n simulator-poste --tail=100

# Log frontend
kubectl logs -l app=simulator-poste-frontend -n simulator-poste --tail=100

# APIRule status
kubectl get apirules -n simulator-poste -o yaml | grep -A 20 "status:"
```

### 9.2 Pod non si avvia

```bash
# Descrivi il pod per vedere gli errori
kubectl describe pod <pod-name> -n simulator-poste

# Errori comuni:
# - ImagePullBackOff: immagine non trovata o credenziali mancanti
# - CrashLoopBackOff: errore nell'applicazione, controlla i log
# - Pending: risorse insufficienti o PVC non bound
```

### 9.3 ImagePullBackOff

```bash
# Le immagini ghcr.io devono essere pubbliche o configurare imagePullSecrets

# Verifica che l'immagine esista
docker pull ghcr.io/{owner}/simulator-poste-backend:latest

# Se l'immagine è privata, crea secret:
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_GITHUB_USER \
  --docker-password=YOUR_GITHUB_TOKEN \
  --namespace=simulator-poste
```

### 9.4 APIRule non funziona

```bash
# Verifica lo status
kubectl get apirules simulator-poste -n simulator-poste -o jsonpath='{.status}'

# Log del controller (kyma-system)
kubectl logs -l app=ory-oathkeeper -n kyma-system --tail=50
```

**Errori comuni APIRule**:

- `hosts mismatch`: il dominio non corrisponde al cluster
- `service not found`: il service non esiste o nome errato
- `gateway not ready`: attendere che il gateway sia pronto

### 9.5 Errori CORS

```bash
# Verifica FRONTEND_URL nel backend
kubectl get configmap backend-config -n simulator-poste -o yaml | grep FRONTEND

# Deve corrispondere esattamente all'URL dell'app
```

### 9.6 Errori OIDC / Login fallito

1. **Verifica redirect URI in SAP IAS** - deve includere `/callback`
2. **Verifica client ID** nei secrets Kubernetes
3. **Controlla i log del backend**:

```bash
kubectl logs -l app=simulator-poste-backend -n simulator-poste | grep -i oidc
```

### 9.7 Database non persistente

```bash
# Verifica che il PVC sia bound
kubectl get pvc backend-data -n simulator-poste

# Verifica che il volume sia montato nel pod
kubectl describe pod -l app=simulator-poste-backend -n simulator-poste | grep -A 5 Mounts
```

---

## 10. Lesson Learned

### 10.1 APIRule v2 vs v1

Kyma ha introdotto **APIRule v2** con sintassi diversa:

```yaml
# v1 (deprecato)
apiVersion: gateway.kyma-project.io/v1beta1
spec:
  service:
    name: frontend-service
    port: 80
  rules:
    - path: /api
      accessStrategies:
        - handler: noop

# v2 (attuale)
apiVersion: gateway.kyma-project.io/v2
spec:
  gateway: kyma-system/kyma-gateway
  service:
    name: frontend-service
    port: 80
  rules:
    - path: /api/{**}
      methods: [GET, POST, ...]
      noAuth: true
      service:
        name: backend-service
        port: 8000
```

### 10.2 Wildcards nei Path

```yaml
# ✅ Corretto (v2)
path: /api/{**}  # Cattura tutto sotto /api/

# ❌ Errato
path: /api/*     # Non funziona in v2
path: /api/**    # Sintassi errata
```

### 10.3 SQLite su Kubernetes

- **1 sola replica** obbligatoria per evitare corruzione
- **Strategy: Recreate** invece di RollingUpdate
- **PVC ReadWriteOnce** è sufficiente

```yaml
spec:
  replicas: 1
  strategy:
    type: Recreate
```

### 10.4 Frontend Vite Variables

Le variabili `VITE_*` devono essere iniettate al **build time**, non a runtime:

```dockerfile
# Nel Dockerfile
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build  # Le variabili vengono incorporate qui
```

### 10.5 Nginx non-root

Per eseguire Nginx come non-root (UID 1000), bisogna dare i permessi corretti:

```dockerfile
RUN mkdir -p /var/cache/nginx/client_temp \
    && chmod -R 777 /var/cache/nginx \
    && chmod -R 777 /var/run \
    && chmod -R 777 /etc/nginx/conf.d
```

### 10.6 Istio Sidecar

Il namespace deve avere `istio-injection: enabled`:

```yaml
metadata:
  labels:
    istio-injection: enabled
```

E i pod devono avere l'annotazione:

```yaml
template:
  metadata:
    annotations:
      sidecar.istio.io/inject: "true"
```

### 10.7 Health Checks

Configurare probe con timeout più lunghi per cold start:

```yaml
livenessProbe:
  initialDelaySeconds: 30  # Tempo per avvio container
  periodSeconds: 30
  timeoutSeconds: 10       # Importante per Istio sidecar
  failureThreshold: 5
```

### 10.8 Ordine di Deploy

Rispettare l'ordine per evitare errori di dipendenze:

1. Namespace
2. PVC
3. Secrets
4. ConfigMaps
5. Backend (Deployment + Service)
6. Frontend (Deployment + Service)
7. APIRule (ultimo, dipende dai services)

---

## Appendice A: Checklist Pre-Deploy

- [ ] Kubeconfig scaricato e configurato
- [ ] Dominio cluster annotato: `c-xxxxxxx.kyma.ondemand.com`
- [ ] SAP IAS configurato con redirect URIs corretti
- [ ] GitHub Secrets configurati (6 secrets)
- [ ] File k8s aggiornati con dominio corretto (3 file)
- [ ] Immagini Docker pubbliche o imagePullSecrets configurati

## Appendice B: URL e Endpoint

| Tipo | URL |
| --- | --- |
| App | `https://simulator-poste.{domain}` |
| API | `https://simulator-poste.{domain}/api/...` |
| Health | `https://simulator-poste.{domain}/health/live` |
| SAP IAS | `https://{tenant}.accounts.ondemand.com` |
| GitHub Registry | `ghcr.io/{owner}/simulator-poste-*` |

## Appendice C: Risorse Kubernetes Finali

| Risorsa | Nome | Namespace |
| --- | --- | --- |
| Namespace | simulator-poste | - |
| Deployment | simulator-poste-backend | simulator-poste |
| Deployment | simulator-poste-frontend | simulator-poste |
| Service | backend-service | simulator-poste |
| Service | frontend-service | simulator-poste |
| PVC | backend-data | simulator-poste |
| Secret | oidc-credentials | simulator-poste |
| ConfigMap | backend-config | simulator-poste |
| ConfigMap | frontend-config | simulator-poste |
| APIRule | simulator-poste | simulator-poste |
