import { useState, useEffect } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import Sidebar from './components/Sidebar';
import TechEvaluator from './components/TechEvaluator';
import Dashboard from './components/Dashboard';
import ConfigPage from './components/ConfigPage';
import MasterDataConfig from './components/MasterDataConfig';
import { Settings, Menu, X } from 'lucide-react';
import { formatCurrency, formatNumber } from './utils/formatters';
import { logger } from './utils/logger';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LogoutButton from './components/LogoutButton';

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Main app content (to be wrapped with auth)
function AppContent() {
  const { getAccessToken, handleCallback, isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();
  const [view, setView] = useState('dashboard'); // dashboard, config, master
  const [config, setConfig] = useState(null);
  const [masterData, setMasterData] = useState({
    company_certs: [],
    prof_certs: [],
    requirement_labels: []
  });
  const [selectedLot, setSelectedLot] = useState("Lotto 1");
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Mobile sidebar state

  // State for Inputs
  const [baseAmount, setBaseAmount] = useState(0);
  const [competitorDiscount, setCompetitorDiscount] = useState(30.0);
  const [myDiscount, setMyDiscount] = useState(0.0);

  // Tech inputs: { req_id: { r_val, c_val, qual_val, bonus_active } }
  const [techInputs, setTechInputs] = useState({});
  const [companyCerts, setCompanyCerts] = useState({});

  // Results State
  const [results, setResults] = useState(null);
  const [simulationData, setSimulationData] = useState([]);
  const [mockMode, setMockMode] = useState(false); // Track if using mock data

  // Configure axios interceptor to add auth token
  useEffect(() => {
    const interceptor = axios.interceptors.request.use(
      (config) => {
        const token = getAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    return () => {
      axios.interceptors.request.eject(interceptor);
    };
  }, [getAccessToken]);

  // Handle OIDC callback - wait for auth to be ready
  useEffect(() => {
    const handleOIDCCallback = async () => {
      if (window.location.pathname === '/callback' && !authLoading) {
        try {
          await handleCallback();
          setView('dashboard');
        } catch (err) {
          logger.error("OIDC callback failed", err, { component: "App" });
        }
      }
    };
    handleOIDCCallback();
  }, [handleCallback, authLoading]);

  // Fetch initial data - only when authenticated
  useEffect(() => {
    // Don't fetch if still processing auth or not authenticated
    if (authLoading || !isAuthenticated) {
      return;
    }

    const fetchData = async () => {
      try {
        const [configRes, masterRes] = await Promise.all([
          axios.get(`${API_URL}/config`),
          axios.get(`${API_URL}/master-data`)
        ]);
        setConfig(configRes.data);
        setMasterData(masterRes.data);
        const firstLot = Object.keys(configRes.data)[0];
        setSelectedLot(firstLot);
        setBaseAmount(configRes.data[firstLot].base_amount);
      } catch (err) {
        logger.error("Failed to fetch initial data", err, { component: "App" });

        // Use mock data for frontend-only testing
        setMockMode(true);
        const mockConfig = {
          "Lotto 1": {
            name: "Lotto 1 - Demo Mode",
            base_amount: 1000000,
            alpha: 0.3,
            max_econ_score: 40,
            max_tech_score: 60,
            max_raw_score: 100,
            company_certs: [
              { label: "ISO 9001", points: 2 },
              { label: "ISO 27001", points: 2 }
            ],
            reqs: [
              { id: "req1", label: "Team Size", type: "resource", max_points: 20, max_res: 10, max_certs: 5 },
              { id: "req2", label: "Experience", type: "resource", max_points: 15, max_res: 8, max_certs: 3 }
            ]
          },
          "Lotto 2": {
            name: "Lotto 2 - Demo Mode",
            base_amount: 800000,
            alpha: 0.3,
            max_econ_score: 40,
            max_tech_score: 60,
            max_raw_score: 100,
            company_certs: [],
            reqs: []
          }
        };
        setConfig(mockConfig);
        setSelectedLot("Lotto 1");
        setBaseAmount(1000000);

        // Set mock results
        setResults({
          technical_score: 45.5,
          economic_score: 28.3,
          total_score: 73.8,
          raw_technical_score: 75.8,
          company_certs_score: 4.0,
          details: {}
        });

        // Set mock simulation data
        setSimulationData([
          { discount: 10, total_score: 50.2, economic_score: 10.1 },
          { discount: 20, total_score: 60.5, economic_score: 20.3 },
          { discount: 30, total_score: 70.8, economic_score: 30.6 },
          { discount: 40, total_score: 75.2, economic_score: 35.0 },
          { discount: 50, total_score: 78.5, economic_score: 38.3 }
        ]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [isAuthenticated, authLoading]);

  // Update simulation state when lot changes
  useEffect(() => {
    if (config && selectedLot) {
      const lot = config[selectedLot];
      setBaseAmount(lot.base_amount);

      // Load saved state if available
      if (lot.state) {
        setMyDiscount(lot.state.my_discount ?? 0.0);
        setCompetitorDiscount(lot.state.competitor_discount ?? 30.0);
        setTechInputs(lot.state.tech_inputs ?? {});
        setCompanyCerts(lot.state.company_certs ?? {});
      } else {
        // Reset to defaults for new lots
        setMyDiscount(0.0);
        setCompetitorDiscount(30.0);
        setTechInputs({});
        setCompanyCerts({});
      }
    }
  }, [selectedLot, config]);

  // Manual save function for simulation state
  const handleSaveState = async () => {
    if (!config || !selectedLot) return false;
    try {
      const statePayload = {
        my_discount: myDiscount,
        competitor_discount: competitorDiscount,
        tech_inputs: techInputs,
        company_certs: companyCerts
      };
      await axios.post(`${API_URL}/config/state?lot_key=${encodeURIComponent(selectedLot)}`, statePayload);

      // Update local config with saved state
      setConfig(prev => ({
        ...prev,
        [selectedLot]: {
          ...prev[selectedLot],
          state: statePayload
        }
      }));

      return true;
    } catch (err) {
      logger.error("Failed to save state", err, { component: "App", lot: selectedLot });
      return false;
    }
  };

  // Debounced auto-save effect for simulation state
  useEffect(() => {
    if (!config || !selectedLot || loading) return;

    const timer = setTimeout(() => {
      handleSaveState();
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [myDiscount, competitorDiscount, techInputs, companyCerts, selectedLot]);

  // Refetch master data when entering config or master views to ensure fresh sync
  useEffect(() => {
    if (view === 'config' || view === 'master') {
      axios.get(`${API_URL}/master-data`)
        .then(res => setMasterData(res.data))
        .catch(err => logger.error("Failed to sync master data", err, { component: "App" }));
    }
  }, [view]);

  // Main Calculation Effect
  useEffect(() => {
    if (!config || !selectedLot) return;

    const payload = {
      lot_key: selectedLot,
      base_amount: baseAmount,
      competitor_discount: competitorDiscount,
      my_discount: myDiscount,
      tech_inputs: Object.entries(techInputs).map(([k, v]) => ({ req_id: k, ...v })),
      selected_company_certs: Object.entries(companyCerts)
        .filter(([_, checked]) => checked)
        .map(([label, _]) => label)
    };

    // Calculate Scores
    axios.post(`${API_URL}/calculate`, payload)
      .then(res => setResults(res.data))
      .catch(err => logger.error("Calculation failed", err, { component: "App", lot: selectedLot }));
  }, [baseAmount, competitorDiscount, myDiscount, techInputs, companyCerts, selectedLot, config]);

  // Simulation Effect (runs only when technical or economic results change)
  useEffect(() => {
    if (!config || !selectedLot || !results) return; // Simulate for Chart

    axios.post(`${API_URL}/simulate`, {
      lot_key: selectedLot,
      base_amount: baseAmount,
      competitor_discount: competitorDiscount,
      my_discount: myDiscount,
      current_tech_score: results.technical_score
    })
      .then(res => setSimulationData(res.data))
      .catch(err => logger.error("Simulation failed", err, { component: "App", lot: selectedLot }));
  }, [baseAmount, competitorDiscount, myDiscount, results?.technical_score, selectedLot, config]);

  if (loading) return <div className="flex items-center justify-center h-screen">{t('common.loading')}</div>;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - responsive */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar
          config={config}
          selectedLotKey={selectedLot}
          onSelectLot={setSelectedLot}
          baseAmount={baseAmount}
          competitorDiscount={competitorDiscount}
          setCompetitorDiscount={setCompetitorDiscount}
          myDiscount={myDiscount}
          setMyDiscount={setMyDiscount}
          results={results}
          onSaveState={handleSaveState}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <main className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Demo mode banner */}
        {mockMode && (
          <div className="bg-yellow-100 border-b border-yellow-300 px-4 py-2 text-center">
            <span className="text-sm font-medium text-yellow-800">
              🎨 DEMO MODE - Frontend Only (Backend non disponibile)
            </span>
          </div>
        )}

        <header className="bg-white border-b border-slate-200 p-4 shadow-sm z-10">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3 md:gap-6">
              {/* Hamburger button - mobile only */}
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Toggle menu"
              >
                <Menu className="w-6 h-6 text-slate-600" />
              </button>

              <div className="flex items-center gap-3">
                <img src="/poste-italiane-logo.svg" alt="Poste Italiane" className="h-6 md:h-8 object-contain" />
                <div className="hidden sm:block w-px h-8 bg-slate-200"></div>
                <h1 className="text-base md:text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  {t('app.title')}
                </h1>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-200 rounded-full shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    {view === 'dashboard' ? t('common.home') : view === 'config' ? t('common.gara_lotto') : t('common.master_data')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => setView('dashboard')}
                className={`flex items-center gap-2 px-2 md:px-4 py-2 rounded-xl transition-all font-medium text-sm ${view === 'dashboard' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                aria-label="Home"
              >
                <span className="text-lg md:hidden">🏠</span>
                <span className="hidden md:inline">🏠 {t('common.home')}</span>
              </button>
              <button
                onClick={() => setView('config')}
                className={`flex items-center gap-2 px-2 md:px-4 py-2 rounded-xl transition-all font-medium text-sm ${view === 'config' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                aria-label="Configurazione"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">{t('sidebar.config_btn')}</span>
              </button>
              <button
                onClick={() => setView('master')}
                className={`hidden sm:flex items-center gap-2 px-2 md:px-4 py-2 rounded-xl transition-all font-medium text-sm ${view === 'master' ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                aria-label="Master Data"
              >
                <Settings className="w-4 h-4" />
                <span className="hidden md:inline">{t('common.master_data')}</span>
              </button>
              <LogoutButton />
            </div>
          </div>
        </header>

        {view === 'config' ? (
          <ConfigPage
            config={config}
            masterData={masterData}
            onSave={async (newCfg) => {
              try {
                await axios.post(`${API_URL}/config`, newCfg);
                setConfig(newCfg);
                // Rimane in configurazione dopo salvataggio, non torna a dashboard
                alert(t('config.save_success') || '✓ Configurazione salvata con successo');
              } catch (err) {
                logger.error("Failed to save configuration", err, { component: "ConfigPage" });
                alert(t('config.save_error'));
              }
            }}
            onAddLot={async (lotName) => {
              try {
                await axios.post(`${API_URL}/config/add?lot_key=${encodeURIComponent(lotName)}`);
                const res = await axios.get(`${API_URL}/config`);
                setConfig(res.data);
                setSelectedLot(lotName);
                alert(t('app.add_success', { name: lotName }));
              } catch (err) {
                logger.error("Failed to add lot", err, { component: "ConfigPage", lotName });
                alert(t('app.add_error'));
              }
            }}
            onDeleteLot={async (lotKey) => {
              if (!window.confirm(t('app.delete_confirm', { name: lotKey }))) return;
              try {
                await axios.delete(`${API_URL}/config/${encodeURIComponent(lotKey)}`);
                const res = await axios.get(`${API_URL}/config`);
                setConfig(res.data);
                const keys = Object.keys(res.data);
                if (keys.length > 0) setSelectedLot(keys[0]);
                setView('dashboard');
                alert(t('app.delete_success', { name: lotKey }));
              } catch (err) {
                logger.error("Failed to delete lot", err, { component: "ConfigPage", lotKey });
                alert(t('app.delete_error'));
              }
            }}
            onBack={() => setView('dashboard')}
          />
        ) : view === 'master' ? (
          <MasterDataConfig onBack={() => setView('dashboard')} />
        ) : (
          <div className="flex-1 overflow-auto p-3 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
            <div className="lg:col-span-7 space-y-4 md:space-y-6">
              <TechEvaluator
                lotData={config?.[selectedLot]}
                inputs={techInputs}
                setInputs={setTechInputs}
                certs={companyCerts}
                setCerts={setCompanyCerts}
                results={results}
              />
            </div>
            <div className="lg:col-span-5 space-y-4 md:space-y-6">
              <Dashboard
                results={results}
                simulationData={simulationData}
                myDiscount={myDiscount}
                competitorDiscount={competitorDiscount}
                lotData={config[selectedLot]}
                lotKey={selectedLot}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Main App wrapper with authentication
export default function App() {
  return (
    <AuthProvider>
      <ProtectedRoute>
        <AppContent />
      </ProtectedRoute>
    </AuthProvider>
  );
}
