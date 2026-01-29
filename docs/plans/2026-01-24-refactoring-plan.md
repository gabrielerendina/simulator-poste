# Piano di Refactoring Completo - Simulator Poste
**Data:** 2026-01-24
**Branch:** kyma-optimization
**Stato:** Draft per approvazione

---

## 📋 Executive Summary

Questo piano descrive il refactoring completo dell'applicazione Simulator Poste per migliorare:
- **Manutenibilità**: Ridurre complessità ciclomatica e accoppiamento
- **Scalabilità**: Architettura modulare per future features
- **Developer Experience**: Code quality, type safety, testing
- **User Experience**: Error handling, loading states, performance

**Impatto stimato:**
- Backend: ~60% del codice modificato
- Frontend: ~70% del codice modificato
- Kyma config: ~40% modifiche (security + monitoring)

---

## 🎯 Obiettivi del Refactoring

### Obiettivi Primari
1. **Backend Clean Architecture**: Separazione layers (API → Service → Repository)
2. **Frontend Component Architecture**: Context API + Custom Hooks + Composition
3. **Error Handling Robusto**: Toast notifications + Error boundaries + Retry logic
4. **Type Safety**: Migrazione graduale a TypeScript
5. **Test Coverage**: Da ~10% a 80%+

### Obiettivi Secondari
6. Code style consistency (ESLint + Prettier)
7. Performance optimization (React.memo, lazy loading)
8. Accessibility (ARIA labels, keyboard navigation)
9. Documentation (JSDoc + README updates)

---

## 📊 Stato Attuale - Analisi Dettagliata

### Backend Issues
```
backend/
├── main.py (1018 linee) ❌ TOO BIG
│   ├── API routes (12 endpoints)
│   ├── Business logic (scoring, simulation)
│   ├── PDF generation
│   ├── Health checks
│   └── Exception handlers
├── crud.py (156 linee) ⚠️ Mixed responsibilities
├── auth.py (229 linee) ⚠️ OIDC + middleware together
└── schemas.py (133 linee) ✅ OK
```

**Problemi identificati:**
- Nessuna separazione concerns (routing + business logic + data access)
- Business logic duplicata (calculate_economic_score in main.py)
- Mancano service layer patterns
- Test coverage: ~30% (solo main endpoints)

### Frontend Issues
```
frontend/src/
├── App.jsx (450 linee) ❌ GOD COMPONENT
│   ├── 12+ useState hooks
│   ├── API calls inline
│   ├── Business logic (simulation)
│   └── Routing logic
├── components/
│   ├── ConfigPage.jsx (646 linee) ❌ TOO BIG
│   ├── Dashboard.jsx (548 linee) ❌ TOO BIG
│   ├── TechEvaluator.jsx (353 linee) ⚠️ Complex
│   └── Sidebar.jsx (179 linee) ✅ OK
└── contexts/
    └── AuthContext.jsx (211 linee) ✅ OK
```

**Problemi identificati:**
- Props drilling (8+ props da App → Sidebar)
- Nessun Context per state globale (config, simulation)
- Custom hooks assenti (API calls duplicate)
- Componenti monolitici (ConfigPage, Dashboard)
- Error handling con alert() browser
- Test coverage: ~5% (solo 1 test file)

---

## 🏗️ Architettura Target

### Backend - Clean Architecture

```
backend/
├── main.py (50 linee) ← Entry point + app config
├── api/
│   ├── __init__.py
│   ├── dependencies.py ← DB session, auth
│   └── v1/
│       ├── __init__.py
│       ├── config.py ← Config endpoints
│       ├── simulation.py ← Simulation endpoints
│       ├── master_data.py ← Master data endpoints
│       └── health.py ← Health/monitoring
├── services/
│   ├── __init__.py
│   ├── config_service.py ← Business logic config
│   ├── scoring_service.py ← Scoring calculations
│   ├── simulation_service.py ← Monte Carlo, optimize
│   └── pdf_service.py ← PDF generation
├── repositories/
│   ├── __init__.py
│   ├── config_repository.py ← DB operations config
│   └── master_data_repository.py
├── core/
│   ├── __init__.py
│   ├── config.py ← App settings
│   ├── exceptions.py ← Custom exceptions
│   └── security.py ← Auth helpers
├── models.py ✅ Unchanged
├── schemas.py ✅ Unchanged
└── tests/
    ├── unit/
    │   ├── test_scoring_service.py
    │   └── test_simulation_service.py
    ├── integration/
    │   └── test_api_endpoints.py
    └── conftest.py
```

**Benefits:**
- Single Responsibility: ogni modulo ha 1 scopo
- Testability: services testabili senza API
- Scalability: aggiungere features senza toccare esistenti
- Separation of Concerns: routing → validation → logic → data

### Frontend - Feature-Based Architecture

```
frontend/src/
├── App.jsx (100 linee) ← Layout + providers
├── features/
│   ├── config/
│   │   ├── components/
│   │   │   ├── ConfigPage.jsx (200 linee)
│   │   │   ├── LotSelector.jsx
│   │   │   ├── RequirementEditor.jsx
│   │   │   └── CriteriaConfigurator.jsx
│   │   ├── hooks/
│   │   │   ├── useConfig.js
│   │   │   └── useConfigForm.js
│   │   └── context/
│   │       └── ConfigContext.jsx
│   ├── simulation/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx ✅
│   │   │   ├── Dashboard.jsx (250 linee)
│   │   │   ├── TechEvaluator.jsx (200 linee)
│   │   │   └── MonteCarloModal.jsx
│   │   ├── hooks/
│   │   │   ├── useSimulation.js
│   │   │   ├── useLotState.js
│   │   │   └── useScoring.js
│   │   └── context/
│   │       └── SimulationContext.jsx
│   └── master-data/
│       ├── components/
│       │   └── MasterDataConfig.jsx
│       └── hooks/
│           └── useMasterData.js
├── shared/
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Toast.jsx ← NEW
│   │   │   ├── Button.jsx
│   │   │   ├── Modal.jsx
│   │   │   ├── Gauge.jsx ← Extract from Dashboard
│   │   │   └── LoadingSpinner.jsx
│   │   ├── layout/
│   │   │   ├── Header.jsx ← Extract from App
│   │   │   └── ErrorBoundary.jsx ← NEW
│   │   └── auth/
│   │       ├── ProtectedRoute.jsx ✅
│   │       └── LogoutButton.jsx ✅
│   ├── hooks/
│   │   ├── useApiCall.js ← NEW (retry + loading)
│   │   ├── useToast.js ← NEW
│   │   └── useDebounce.js ← NEW
│   ├── contexts/
│   │   ├── AuthContext.jsx ✅
│   │   └── ToastContext.jsx ← NEW
│   └── utils/
│       ├── formatters.js ✅
│       ├── logger.js ✅
│       └── api.js ← NEW (axios instance)
└── tests/
    ├── components/
    ├── hooks/
    └── integration/
```

**Benefits:**
- Feature isolation: config, simulation, master-data separati
- Reusability: shared components/hooks riutilizzabili
- Maintainability: trovare codice facilmente
- Scalability: aggiungere features senza conflitti

---

## 📝 Piano di Implementazione - Fase per Fase

### FASE 1: Foundation & Infrastructure (Priorità ALTA)

#### 1.1 Backend - Service Layer Extraction
**Obiettivo:** Estrarre business logic da main.py in services/

**Step 1.1.1 - Creare struttura services/**
```bash
mkdir -p backend/services
touch backend/services/__init__.py
touch backend/services/scoring_service.py
touch backend/services/simulation_service.py
touch backend/services/pdf_service.py
```

**Step 1.1.2 - Migrare scoring logic**
File: `backend/services/scoring_service.py`
```python
"""
Scoring Service - Business logic for technical and economic scoring
"""
from typing import Dict, List
import numpy as np

class ScoringService:
    """Service for calculating scores"""

    @staticmethod
    def calculate_economic_score(
        p_base: float,
        p_offered: float,
        p_best_competitor: float,
        alpha: float = 0.3,
        max_econ: float = 40.0
    ) -> float:
        """
        Calculate economic score with progressive discount reward.

        Args:
            p_base: Base price
            p_offered: Our offered price
            p_best_competitor: Best competitor's price
            alpha: Exponent factor (0-1) for discount curve
            max_econ: Maximum economic score achievable

        Returns:
            Economic score (0 to max_econ)
        """
        if p_offered > p_base:
            return 0.0

        actual_best = min(p_offered, p_best_competitor)
        denom = p_base - actual_best

        if denom <= 0:
            return max_econ if actual_best == p_base else 0.0

        num = p_base - p_offered
        ratio = max(0.0, min(1.0, num / denom))

        return max_econ * (ratio ** alpha)

    @staticmethod
    def calculate_professional_score(
        resources: int,
        certifications: int,
        max_resources: int,
        max_points: float,
        max_certifications: int = 5
    ) -> float:
        """
        Calculate professional score based on resources and certifications.

        Formula: score = (2 * R) + (R * C)
        where R = min(resources, max_resources)
              C = min(certifications, max_certifications)

        Args:
            resources: Number of resources
            certifications: Number of certifications
            max_resources: Maximum resources to count
            max_points: Cap score at this value
            max_certifications: Maximum certifications to count

        Returns:
            Professional score (capped at max_points)
        """
        R = min(resources, max_resources)
        C = min(certifications, max_certifications)

        # Ensure C doesn't exceed R
        if R < C:
            C = R

        score = (2 * R) + (R * C)
        return min(score, max_points)
```

**Step 1.1.3 - Aggiornare main.py per usare service**
```python
# main.py - BEFORE
from typing import List, Dict

def calculate_economic_score(...):
    # 30 lines of logic here

# main.py - AFTER
from services.scoring_service import ScoringService

scoring_service = ScoringService()
# Use: scoring_service.calculate_economic_score(...)
```

**Test validation:**
```bash
# Run existing tests - should still pass
pytest backend/test_main.py -v

# Add new service tests
pytest backend/tests/unit/test_scoring_service.py -v
```

#### 1.2 Frontend - Context API Setup
**Obiettivo:** Eliminare props drilling con Context providers

**Step 1.2.1 - Creare ConfigContext**
File: `frontend/src/features/config/context/ConfigContext.jsx`
```jsx
import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { logger } from '../../../shared/utils/logger';

const ConfigContext = createContext(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return context;
};

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(null);
  const [masterData, setMasterData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const [configRes, masterRes] = await Promise.all([
        axios.get('/api/config'),
        axios.get('/api/master-data')
      ]);
      setConfig(configRes.data);
      setMasterData(masterRes.data);
      setError(null);
    } catch (err) {
      logger.error('Failed to fetch config', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async (newConfig) => {
    try {
      await axios.post('/api/config', newConfig);
      setConfig(newConfig);
      return { success: true };
    } catch (err) {
      logger.error('Failed to update config', err);
      return { success: false, error: err.message };
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const value = {
    config,
    masterData,
    loading,
    error,
    refetch: fetchConfig,
    updateConfig
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};
```

**Step 1.2.2 - Creare SimulationContext**
File: `frontend/src/features/simulation/context/SimulationContext.jsx`
```jsx
import { createContext, useContext, useState, useReducer } from 'react';

const SimulationContext = createContext(null);

// Reducer for complex state (techInputs, companyCerts)
const simulationReducer = (state, action) => {
  switch (action.type) {
    case 'SET_LOT':
      return { ...state, selectedLot: action.payload };
    case 'SET_DISCOUNT':
      return { ...state, [action.key]: action.value };
    case 'SET_TECH_INPUT':
      return {
        ...state,
        techInputs: {
          ...state.techInputs,
          [action.reqId]: action.value
        }
      };
    case 'SET_COMPANY_CERT':
      return {
        ...state,
        companyCerts: {
          ...state.companyCerts,
          [action.label]: action.checked
        }
      };
    case 'RESET':
      return action.payload;
    default:
      return state;
  }
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within SimulationProvider');
  }
  return context;
};

export const SimulationProvider = ({ children }) => {
  const [state, dispatch] = useReducer(simulationReducer, {
    selectedLot: null,
    myDiscount: 0.0,
    competitorDiscount: 30.0,
    techInputs: {},
    companyCerts: {}
  });

  const [results, setResults] = useState(null);
  const [simulationData, setSimulationData] = useState([]);

  const setLot = (lotKey) => {
    dispatch({ type: 'SET_LOT', payload: lotKey });
  };

  const setDiscount = (key, value) => {
    dispatch({ type: 'SET_DISCOUNT', key, value });
  };

  const setTechInput = (reqId, value) => {
    dispatch({ type: 'SET_TECH_INPUT', reqId, value });
  };

  const setCompanyCert = (label, checked) => {
    dispatch({ type: 'SET_COMPANY_CERT', label, checked });
  };

  const resetState = (newState) => {
    dispatch({ type: 'RESET', payload: newState });
  };

  const value = {
    ...state,
    results,
    simulationData,
    setLot,
    setDiscount,
    setTechInput,
    setCompanyCert,
    resetState,
    setResults,
    setSimulationData
  };

  return (
    <SimulationContext.Provider value={value}>
      {children}
    </SimulationContext.Provider>
  );
};
```

**Step 1.2.3 - Aggiornare App.jsx**
```jsx
// App.jsx - BEFORE (450 lines)
function App() {
  const [config, setConfig] = useState(null);
  const [selectedLot, setSelectedLot] = useState("Lotto 1");
  // ... 10 more useState

  return (
    <div>
      <Sidebar
        config={config}
        selectedLot={selectedLot}
        // ... 8 more props
      />
    </div>
  );
}

// App.jsx - AFTER (100 lines)
import { ConfigProvider } from './features/config/context/ConfigContext';
import { SimulationProvider } from './features/simulation/context/SimulationContext';

function App() {
  return (
    <ConfigProvider>
      <SimulationProvider>
        <Layout>
          <Router />
        </Layout>
      </SimulationProvider>
    </ConfigProvider>
  );
}
```

**Step 1.2.4 - Aggiornare Sidebar per usare Context**
```jsx
// Sidebar.jsx - BEFORE
export default function Sidebar({
  config,
  selectedLotKey,
  onSelectLot,
  // ... 8 more props
}) {
  // ...
}

// Sidebar.jsx - AFTER
import { useConfig } from '../../features/config/context/ConfigContext';
import { useSimulation } from '../../features/simulation/context/SimulationContext';

export default function Sidebar({ isOpen, onClose }) {
  const { config } = useConfig();
  const {
    selectedLot,
    myDiscount,
    competitorDiscount,
    setLot,
    setDiscount
  } = useSimulation();

  // No more prop drilling! 🎉
}
```

**Migration checklist:**
- [ ] ConfigContext creato e testato
- [ ] SimulationContext creato e testato
- [ ] App.jsx refactorato con providers
- [ ] Sidebar aggiornato per usare contexts
- [ ] Dashboard aggiornato per usare contexts
- [ ] TechEvaluator aggiornato per usare contexts
- [ ] Props drilling eliminato (0 props da App ai children)

#### 1.3 Error Handling - Toast System
**Obiettivo:** Sostituire alert() con sistema toast professionale

**Step 1.3.1 - Creare Toast Component**
File: `frontend/src/shared/components/ui/Toast.jsx`
```jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = useCallback(({ type = 'info', message, duration = 5000 }) => {
    const id = Date.now();
    const toast = { id, type, message, duration };

    setToasts(prev => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const hideToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const value = {
    showToast,
    hideToast,
    success: (message, duration) => showToast({ type: 'success', message, duration }),
    error: (message, duration) => showToast({ type: 'error', message, duration }),
    info: (message, duration) => showToast({ type: 'info', message, duration }),
    warning: (message, duration) => showToast({ type: 'warning', message, duration })
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={hideToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={() => onClose(toast.id)} />
      ))}
    </div>
  );
};

const Toast = ({ toast, onClose }) => {
  const { type, message } = toast;

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    error: <AlertCircle className="w-5 h-5 text-red-600" />,
    warning: <AlertCircle className="w-5 h-5 text-yellow-600" />,
    info: <Info className="w-5 h-5 text-blue-600" />
  };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] max-w-md ${styles[type]}`}>
      {icons[type]}
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button onClick={onClose} className="hover:opacity-70">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
```

**Step 1.3.2 - Sostituire tutti gli alert()**
```jsx
// ConfigPage.jsx - BEFORE
try {
  await axios.post('/api/config', newConfig);
  alert('✓ Configurazione salvata con successo'); // ❌
} catch (err) {
  alert('Errore durante il salvataggio'); // ❌
}

// ConfigPage.jsx - AFTER
import { useToast } from '../../shared/hooks/useToast';

const { success, error } = useToast();

try {
  await axios.post('/api/config', newConfig);
  success('Configurazione salvata con successo'); // ✅
} catch (err) {
  error('Errore durante il salvataggio'); // ✅
}
```

**Migration checklist:**
- [ ] ToastContext creato
- [ ] ToastProvider integrato in App.jsx
- [ ] Tutti i 15+ alert() sostituiti con toast
- [ ] Testing manuale toast (success, error, warning, info)

#### 1.4 Loading States - useApiCall Hook
**Obiettivo:** Standardizzare API calls con loading + error + retry

**Step 1.4.1 - Creare useApiCall hook**
File: `frontend/src/shared/hooks/useApiCall.js`
```javascript
import { useState, useCallback } from 'react';
import axios from 'axios';
import { logger } from '../utils/logger';
import { useToast } from './useToast';

export const useApiCall = (options = {}) => {
  const {
    onSuccess,
    onError,
    showToastOnError = true,
    retryCount = 0,
    retryDelay = 1000
  } = options;

  const { error: showErrorToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const execute = useCallback(async (apiCall, ...args) => {
    setLoading(true);
    setError(null);

    let lastError;
    let attempts = 0;

    while (attempts <= retryCount) {
      try {
        const result = await apiCall(...args);
        setData(result);
        setLoading(false);

        if (onSuccess) onSuccess(result);
        return { success: true, data: result };

      } catch (err) {
        lastError = err;
        attempts++;

        if (attempts <= retryCount) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempts));
          logger.warn(`Retrying API call (attempt ${attempts}/${retryCount})`, err);
        }
      }
    }

    // All retries failed
    setError(lastError);
    setLoading(false);

    logger.error('API call failed after retries', lastError);

    if (showToastOnError) {
      showErrorToast(lastError?.response?.data?.detail || lastError?.message || 'Errore di rete');
    }

    if (onError) onError(lastError);
    return { success: false, error: lastError };

  }, [retryCount, retryDelay, onSuccess, onError, showToastOnError, showErrorToast]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return {
    execute,
    loading,
    error,
    data,
    reset
  };
};

// Usage example:
// const { execute, loading, error } = useApiCall({ retryCount: 2 });
// const result = await execute(axios.get, '/api/config');
```

**Step 1.4.2 - Creare skeleton components**
File: `frontend/src/shared/components/ui/SkeletonCard.jsx`
```jsx
export const SkeletonCard = () => (
  <div className="bg-white rounded-lg border border-slate-200 p-6 animate-pulse">
    <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
  </div>
);

export const SkeletonGauge = () => (
  <div className="h-40 w-full flex items-center justify-center animate-pulse">
    <div className="w-32 h-32 rounded-full bg-slate-200"></div>
  </div>
);
```

**Step 1.4.3 - Aggiornare componenti con loading states**
```jsx
// Dashboard.jsx - BEFORE
export default function Dashboard({ results, ... }) {
  if (!results) return null; // ❌ No feedback

  return <div>...</div>;
}

// Dashboard.jsx - AFTER
import { SkeletonGauge, SkeletonCard } from '../../shared/components/ui/Skeleton';

export default function Dashboard() {
  const { results, loading } = useSimulation();

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonGauge />
        <SkeletonCard />
      </div>
    ); // ✅ Loading feedback
  }

  if (!results) return null;

  return <div>...</div>;
}
```

---

### FASE 2: Component Refactoring (Priorità MEDIA)

#### 2.1 Splittare ConfigPage (646 → 200 linee)

**Target architecture:**
```
features/config/components/
├── ConfigPage.jsx (200 linee) ← Orchestrator
├── LotList.jsx (80 linee) ← Lot selection sidebar
├── LotEditor.jsx (120 linee) ← Edit lot details
├── RequirementEditor.jsx (100 linee) ← Requirements list
├── RequirementForm.jsx (80 linee) ← Single requirement form
└── CompanyCertsEditor.jsx (60 linee) ← Company certs
```

**Step 2.1.1 - Extract LotList component**
```jsx
// LotList.jsx
export const LotList = ({ selectedLot, onSelectLot, onAddLot, onDeleteLot }) => {
  const { config } = useConfig();

  return (
    <div className="w-64 border-r">
      {Object.keys(config).map(lotKey => (
        <LotListItem
          key={lotKey}
          lotKey={lotKey}
          isSelected={lotKey === selectedLot}
          onClick={() => onSelectLot(lotKey)}
          onDelete={() => onDeleteLot(lotKey)}
        />
      ))}
      <AddLotButton onClick={onAddLot} />
    </div>
  );
};
```

**Step 2.1.2 - Extract RequirementEditor**
```jsx
// RequirementEditor.jsx
export const RequirementEditor = ({ lotKey }) => {
  const { config, updateConfig } = useConfig();
  const lot = config[lotKey];

  const handleAddRequirement = () => { ... };
  const handleEditRequirement = (reqId) => { ... };
  const handleDeleteRequirement = (reqId) => { ... };

  return (
    <div className="space-y-4">
      <RequirementList
        requirements={lot.reqs}
        onEdit={handleEditRequirement}
        onDelete={handleDeleteRequirement}
      />
      <AddRequirementButton onClick={handleAddRequirement} />
    </div>
  );
};
```

**Step 2.1.3 - Refactor ConfigPage come orchestrator**
```jsx
// ConfigPage.jsx - AFTER refactoring
import { LotList } from './LotList';
import { LotEditor } from './LotEditor';
import { RequirementEditor } from './RequirementEditor';

export default function ConfigPage() {
  const [selectedLot, setSelectedLot] = useState(null);
  const [editMode, setEditMode] = useState('view'); // view | edit | add

  return (
    <div className="flex h-full">
      <LotList
        selectedLot={selectedLot}
        onSelectLot={setSelectedLot}
        onAddLot={() => setEditMode('add')}
        onDeleteLot={handleDelete}
      />

      <div className="flex-1">
        {editMode === 'view' && (
          <LotEditor lotKey={selectedLot} onEdit={() => setEditMode('edit')} />
        )}
        {editMode === 'edit' && (
          <RequirementEditor lotKey={selectedLot} onSave={handleSave} />
        )}
      </div>
    </div>
  );
}
```

#### 2.2 Splittare Dashboard (548 → 250 linee)

**Target architecture:**
```
features/simulation/components/
├── Dashboard.jsx (250 linee) ← Layout
├── ScoreGauges.jsx (100 linee) ← 3 gauges
├── SimulationChart.jsx (120 linee) ← Area chart
├── MonteCarloPanel.jsx (80 linee) ← MC simulation
└── shared/components/ui/
    └── Gauge.jsx (60 linee) ← Extracted reusable
```

**Step 2.2.1 - Extract Gauge component**
```jsx
// shared/components/ui/Gauge.jsx
export const Gauge = ({ value, max, color, label, subtitle }) => {
  const data = [
    { name: 'Value', value: value },
    { name: 'Empty', value: max - value }
  ];

  return (
    <div className="h-40 w-full relative">
      <ResponsiveContainer width="100%" height={160}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="70%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            dataKey="value"
          >
            <Cell fill={color} />
            <Cell fill="#f1f5f9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="absolute top-[65%] text-center w-full">
        <div className="text-3xl font-bold">{value.toFixed(2)}</div>
        <div className="text-xs text-slate-400 uppercase">{label}</div>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
    </div>
  );
};
```

**Step 2.2.2 - Extract ScoreGauges**
```jsx
// ScoreGauges.jsx
import { Gauge } from '../../../shared/components/ui/Gauge';

export const ScoreGauges = ({ results, maxTech = 60, maxEcon = 40 }) => {
  if (!results) return null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <Gauge
        value={results.total_score}
        max={100}
        color="#3b82f6"
        label="Totale"
      />
      <Gauge
        value={results.technical_score}
        max={maxTech}
        color="#10b981"
        label="Tecnico"
        subtitle={`Raw: ${results.raw_technical_score}`}
      />
      <Gauge
        value={results.economic_score}
        max={maxEcon}
        color="#f59e0b"
        label="Economico"
      />
    </div>
  );
};
```

**Step 2.2.3 - Refactor Dashboard**
```jsx
// Dashboard.jsx - AFTER
import { ScoreGauges } from './ScoreGauges';
import { SimulationChart } from './SimulationChart';
import { MonteCarloPanel } from './MonteCarloPanel';

export default function Dashboard() {
  const { results, simulationData, loading } = useSimulation();

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <ScoreGauges results={results} />
      <SimulationChart data={simulationData} />
      <MonteCarloPanel />
    </div>
  );
}
```

#### 2.3 Custom Hooks Extraction

**Step 2.3.1 - useConfigForm hook**
File: `frontend/src/features/config/hooks/useConfigForm.js`
```javascript
import { useState, useCallback } from 'react';
import { useConfig } from '../context/ConfigContext';
import { useToast } from '../../../shared/hooks/useToast';

export const useConfigForm = (initialData) => {
  const { updateConfig } = useConfig();
  const { success, error } = useToast();
  const [formData, setFormData] = useState(initialData);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChange = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const result = await updateConfig(formData);
      if (result.success) {
        success('Configurazione salvata');
        setIsDirty(false);
      } else {
        error('Errore salvataggio');
      }
    } finally {
      setSaving(false);
    }
  }, [formData, updateConfig, success, error]);

  const reset = useCallback(() => {
    setFormData(initialData);
    setIsDirty(false);
  }, [initialData]);

  return {
    formData,
    isDirty,
    saving,
    handleChange,
    handleSubmit,
    reset
  };
};
```

**Step 2.3.2 - useSimulationCalculation hook**
```javascript
// hooks/useSimulationCalculation.js
import { useState, useEffect } from 'react';
import { useApiCall } from '../../../shared/hooks/useApiCall';
import axios from 'axios';

export const useSimulationCalculation = (lotKey, inputs) => {
  const [results, setResults] = useState(null);
  const { execute, loading } = useApiCall();

  useEffect(() => {
    if (!lotKey || !inputs) return;

    const calculate = async () => {
      const response = await execute(
        axios.post,
        '/api/calculate',
        inputs
      );

      if (response.success) {
        setResults(response.data);
      }
    };

    // Debounce calculation (500ms after last input change)
    const timer = setTimeout(calculate, 500);
    return () => clearTimeout(timer);

  }, [lotKey, inputs, execute]);

  return { results, loading };
};
```

---

### FASE 3: Code Quality & Testing (Priorità MEDIA)

#### 3.1 ESLint + Prettier Setup

**Step 3.1.1 - Install dependencies**
```bash
cd frontend
npm install --save-dev \
  eslint \
  eslint-plugin-react \
  eslint-plugin-react-hooks \
  @typescript-eslint/eslint-plugin \
  @typescript-eslint/parser \
  prettier \
  eslint-config-prettier \
  eslint-plugin-prettier
```

**Step 3.1.2 - Create .eslintrc.js**
```javascript
module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  plugins: ['react', 'react-hooks', 'prettier'],
  rules: {
    'prettier/prettier': 'error',
    'react/prop-types': 'off', // We'll use TS later
    'react/react-in-jsx-scope': 'off', // React 17+
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn'
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};
```

**Step 3.1.3 - Create .prettierrc**
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "avoid"
}
```

**Step 3.1.4 - Add npm scripts**
```json
{
  "scripts": {
    "lint": "eslint src --ext .js,.jsx",
    "lint:fix": "eslint src --ext .js,.jsx --fix",
    "format": "prettier --write \"src/**/*.{js,jsx,json,css}\"",
    "format:check": "prettier --check \"src/**/*.{js,jsx,json,css}\""
  }
}
```

**Step 3.1.5 - Setup pre-commit hook**
```bash
npm install --save-dev husky lint-staged

npx husky init
```

File: `.husky/pre-commit`
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

File: `package.json` (add)
```json
{
  "lint-staged": {
    "*.{js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,css,md}": [
      "prettier --write"
    ]
  }
}
```

#### 3.2 Backend Testing Strategy

**Step 3.2.1 - Test structure**
```
backend/tests/
├── conftest.py ← Fixtures
├── unit/
│   ├── test_scoring_service.py
│   ├── test_simulation_service.py
│   └── test_pdf_service.py
├── integration/
│   ├── test_config_endpoints.py
│   ├── test_simulation_endpoints.py
│   └── test_auth_flow.py
└── e2e/
    └── test_user_workflows.py
```

**Step 3.2.2 - Example unit test**
File: `backend/tests/unit/test_scoring_service.py`
```python
import pytest
from services.scoring_service import ScoringService

class TestScoringService:
    """Test suite for ScoringService"""

    def test_calculate_economic_score_best_price(self):
        """Test economic score when we offer best price"""
        score = ScoringService.calculate_economic_score(
            p_base=100000,
            p_offered=70000,
            p_best_competitor=80000,
            alpha=0.3,
            max_econ=40.0
        )

        assert score == 40.0  # Maximum score for best offer

    def test_calculate_economic_score_worse_than_competitor(self):
        """Test economic score when competitor has better price"""
        score = ScoringService.calculate_economic_score(
            p_base=100000,
            p_offered=85000,
            p_best_competitor=70000,
            alpha=0.3,
            max_econ=40.0
        )

        assert 0 < score < 40.0  # Partial score

    def test_calculate_economic_score_exceeds_base(self):
        """Test economic score when price exceeds base (invalid)"""
        score = ScoringService.calculate_economic_score(
            p_base=100000,
            p_offered=110000,  # Over budget
            p_best_competitor=90000,
            alpha=0.3,
            max_econ=40.0
        )

        assert score == 0.0  # Zero score for invalid offer

    @pytest.mark.parametrize("resources,certs,expected", [
        (5, 3, 25),  # (2*5) + (5*3) = 25
        (10, 5, 70), # (2*10) + (10*5) = 70
        (3, 5, 21),  # (2*3) + (3*3) = 15 (certs capped at resources)
    ])
    def test_calculate_professional_score(self, resources, certs, expected):
        """Test professional score calculation with various inputs"""
        score = ScoringService.calculate_professional_score(
            resources=resources,
            certifications=certs,
            max_resources=10,
            max_points=100,
            max_certifications=5
        )

        assert score == expected
```

**Step 3.2.3 - Integration test example**
File: `backend/tests/integration/test_config_endpoints.py`
```python
import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_db, Base, engine

@pytest.fixture
def client():
    """Test client with clean database"""
    Base.metadata.create_all(bind=engine)
    client = TestClient(app)
    yield client
    Base.metadata.drop_all(bind=engine)

class TestConfigEndpoints:
    """Integration tests for /api/config endpoints"""

    def test_get_config_returns_all_lots(self, client):
        """Test GET /api/config returns all lot configurations"""
        response = client.get("/api/config")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
        assert len(data) > 0

    def test_add_lot_creates_new_configuration(self, client):
        """Test POST /api/config/add creates new lot"""
        lot_name = "Test Lot"

        response = client.post(f"/api/config/add?lot_key={lot_name}")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == lot_name
        assert "base_amount" in data

    def test_delete_lot_removes_configuration(self, client):
        """Test DELETE /api/config/{lot_key} removes lot"""
        # First create a lot
        lot_name = "Temp Lot"
        client.post(f"/api/config/add?lot_key={lot_name}")

        # Then delete it
        response = client.delete(f"/api/config/{lot_name}")

        assert response.status_code == 200

        # Verify it's gone
        get_response = client.get("/api/config")
        config = get_response.json()
        assert lot_name not in config
```

**Step 3.2.4 - Add pytest coverage**
```bash
cd backend
pip install pytest pytest-cov

# Run tests with coverage
pytest --cov=. --cov-report=html --cov-report=term

# Target: 80%+ coverage
```

#### 3.3 Frontend Testing Strategy

**Step 3.3.1 - Setup Vitest + React Testing Library**
```bash
cd frontend
npm install --save-dev \
  vitest \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  jsdom
```

**Step 3.3.2 - Configure Vitest**
File: `frontend/vite.config.js` (update)
```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.js',
    coverage: {
      provider: 'c8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/',
        'src/setupTests.js',
      ]
    }
  }
});
```

**Step 3.3.3 - Example component test**
File: `frontend/src/features/simulation/components/__tests__/ScoreGauges.test.jsx`
```jsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreGauges } from '../ScoreGauges';

describe('ScoreGauges', () => {
  it('renders three gauges with correct values', () => {
    const results = {
      total_score: 75.5,
      technical_score: 45.2,
      economic_score: 30.3,
      raw_technical_score: 80.0
    };

    render(<ScoreGauges results={results} />);

    expect(screen.getByText('75.50')).toBeInTheDocument();
    expect(screen.getByText('45.20')).toBeInTheDocument();
    expect(screen.getByText('30.30')).toBeInTheDocument();
  });

  it('renders nothing when results are null', () => {
    const { container } = render(<ScoreGauges results={null} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Step 3.3.4 - Hook test example**
File: `frontend/src/shared/hooks/__tests__/useApiCall.test.js`
```javascript
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApiCall } from '../useApiCall';
import axios from 'axios';

vi.mock('axios');

describe('useApiCall', () => {
  it('executes API call successfully', async () => {
    const mockData = { id: 1, name: 'Test' };
    axios.get.mockResolvedValue({ data: mockData });

    const { result } = renderHook(() => useApiCall());

    expect(result.current.loading).toBe(false);

    const response = await result.current.execute(axios.get, '/api/test');

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(mockData);
      expect(response.success).toBe(true);
    });
  });

  it('handles API errors and retries', async () => {
    const mockError = new Error('Network error');
    axios.get.mockRejectedValue(mockError);

    const { result } = renderHook(() =>
      useApiCall({ retryCount: 2, retryDelay: 100 })
    );

    const response = await result.current.execute(axios.get, '/api/test');

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toEqual(mockError);
      expect(response.success).toBe(false);
      expect(axios.get).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });
});
```

---

### FASE 4: TypeScript Migration (Priorità BASSA)

**Strategia:** Migrazione graduale, file per file

**Step 4.1 - Setup TypeScript**
```bash
cd frontend
npm install --save-dev typescript @types/react @types/react-dom

# Generate tsconfig.json
npx tsc --init
```

**Step 4.2 - Configure tsconfig.json**
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

**Step 4.3 - Gradual migration order**
1. Start with utility files (no React deps):
   - `formatters.js` → `formatters.ts`
   - `logger.js` → `logger.ts`

2. Then hooks (minimal deps):
   - `useApiCall.js` → `useApiCall.ts`
   - `useToast.js` → `useToast.ts`

3. Then contexts:
   - `ConfigContext.jsx` → `ConfigContext.tsx`
   - `SimulationContext.jsx` → `SimulationContext.tsx`

4. Finally components (from leaf to root):
   - `Gauge.jsx` → `Gauge.tsx`
   - `ScoreGauges.jsx` → `ScoreGauges.tsx`
   - `Dashboard.jsx` → `Dashboard.tsx`

**Step 4.4 - Example TS conversion**
```typescript
// formatters.ts - AFTER
export const formatCurrency = (value: number, locale: string = 'it-IT'): string => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

export const formatNumber = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};
```

```typescript
// useApiCall.ts - AFTER
import { useState, useCallback } from 'react';
import axios, { AxiosResponse } from 'axios';

interface UseApiCallOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  showToastOnError?: boolean;
  retryCount?: number;
  retryDelay?: number;
}

interface ApiCallResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
}

interface UseApiCallReturn<T> {
  execute: <Args extends any[]>(
    apiCall: (...args: Args) => Promise<AxiosResponse<T>>,
    ...args: Args
  ) => Promise<ApiCallResult<T>>;
  loading: boolean;
  error: Error | null;
  data: T | null;
  reset: () => void;
}

export const useApiCall = <T = any>(
  options: UseApiCallOptions<T> = {}
): UseApiCallReturn<T> => {
  const {
    onSuccess,
    onError,
    showToastOnError = true,
    retryCount = 0,
    retryDelay = 1000
  } = options;

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [data, setData] = useState<T | null>(null);

  const execute = useCallback(async <Args extends any[]>(
    apiCall: (...args: Args) => Promise<AxiosResponse<T>>,
    ...args: Args
  ): Promise<ApiCallResult<T>> => {
    // ... implementation
  }, [retryCount, retryDelay, onSuccess, onError]);

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setData(null);
  }, []);

  return { execute, loading, error, data, reset };
};
```

---

## 📈 Success Metrics

### Code Quality Metrics
- [ ] Backend main.py: 1018 → <200 linee
- [ ] Frontend App.jsx: 450 → <150 linee
- [ ] Frontend ConfigPage.jsx: 646 → <250 linee
- [ ] Frontend Dashboard.jsx: 548 → <250 linee
- [ ] Props drilling: 8+ props → 0 props (Context API)
- [ ] alert() calls: 15+ → 0 (Toast system)

### Test Coverage
- [ ] Backend: 30% → 80%+
- [ ] Frontend: 5% → 70%+
- [ ] Integration tests: 0 → 20+ scenarios
- [ ] E2E tests: 0 → 5+ user workflows

### Performance
- [ ] Initial load time: <3s (measure with Lighthouse)
- [ ] API response time: <500ms p95
- [ ] Bundle size: <500KB gzipped
- [ ] Lighthouse score: >90

### Developer Experience
- [ ] ESLint errors: 0
- [ ] Prettier formatting: 100% files
- [ ] TypeScript coverage: 0% → 50%+ (gradual)
- [ ] Pre-commit hooks: active
- [ ] CI/CD pipeline: green

---

## 🚀 Implementation Timeline

### Week 1: Foundation (FASE 1)
- [ ] Day 1-2: Backend service layer extraction
- [ ] Day 2-3: Frontend Context API setup
- [ ] Day 3-4: Toast system + Error handling
- [ ] Day 4-5: useApiCall hook + Loading states

### Week 2: Component Refactoring (FASE 2)
- [ ] Day 6-7: ConfigPage split
- [ ] Day 8-9: Dashboard split
- [ ] Day 9-10: Custom hooks extraction

### Week 3: Code Quality (FASE 3)
- [ ] Day 11-12: ESLint + Prettier setup
- [ ] Day 12-14: Backend testing (unit + integration)
- [ ] Day 14-15: Frontend testing (components + hooks)

### Week 4: TypeScript (FASE 4) - Optional
- [ ] Day 16-18: TS setup + utility migration
- [ ] Day 18-20: Hooks + contexts migration
- [ ] Day 20-21: Components migration (gradual)

---

## ⚠️ Risks & Mitigation

### Risk 1: Breaking Changes
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Comprehensive test suite before refactoring
- Feature flags for gradual rollout
- Rollback plan with git branches

### Risk 2: Performance Regression
**Impact:** Medium
**Probability:** Low
**Mitigation:**
- Performance benchmarks before/after
- React.memo for expensive components
- Lazy loading for large components

### Risk 3: Context Re-render Issues
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Split contexts by concern (Config vs Simulation)
- Use React.memo + useMemo for optimization
- Monitor with React DevTools Profiler

### Risk 4: TypeScript Learning Curve
**Impact:** Low
**Probability:** High
**Mitigation:**
- Gradual migration (not all-at-once)
- Team training sessions
- Allow `.js` files alongside `.ts`

---

## 🔄 Rollback Plan

### If Phase 1 Fails
1. Revert to main branch
2. Keep only Toast system (low risk)
3. Document lessons learned

### If Phase 2 Fails
1. Keep Context API (Phase 1)
2. Revert component splitting
3. Re-evaluate component boundaries

### If Phase 3 Fails
1. Keep ESLint + Prettier
2. Continue with manual testing
3. Increase test coverage gradually

### If Phase 4 Fails
1. Stop TS migration
2. Keep `.js` files
3. Document TS-compatible patterns

---

## 📚 Next Steps

1. **Review & Approve** questo piano
2. **Create Feature Branch**: `git checkout -b refactoring/phase-1-foundation`
3. **Setup Project Board** con tasks dettagliate
4. **Start FASE 1** con backend service layer
5. **Daily Standups** per monitorare progress

---

## 🎓 References & Resources

### Backend Architecture
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)
- [Clean Architecture in Python](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### Frontend Architecture
- [React Context Best Practices](https://kentcdodds.com/blog/application-state-management-with-react)
- [Custom Hooks Patterns](https://react.dev/learn/reusing-logic-with-custom-hooks)
- [Component Composition](https://react.dev/learn/passing-props-to-a-component)

### Testing
- [React Testing Library Guide](https://testing-library.com/docs/react-testing-library/intro/)
- [Pytest Best Practices](https://docs.pytest.org/en/stable/goodpractices.html)

### TypeScript
- [TypeScript + React Guide](https://react-typescript-cheatsheet.netlify.app/)
- [Gradual TypeScript Migration](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)

---

**Fine del piano di refactoring**

Pronto per approvazione e implementazione! 🚀
