import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, X, FileSearch, Building2, AlertCircle, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../utils/formatters';
import { useConfig } from '../features/config/context/ConfigContext';
import { useSimulation } from '../features/simulation/context/SimulationContext';

export default function Sidebar({
    onClose,
    onNavigate,
    currentView
}) {
    const { t } = useTranslation();

    // Track lots where we've already saved default quotas
    const savedDefaultQuotasRef = useRef(new Set());

    // Ref for quota save timeout (avoids global window property)
    const quotaSaveTimeoutRef = useRef(null);

    // Get data from contexts (no more prop drilling!)
    const { config, updateConfig, setConfig } = useConfig();
    const {
        selectedLot,
        myDiscount,
        competitorDiscount,
        results,
        setLot,
        setDiscount
    } = useSimulation();

    // Local state for RTI quotas editing
    const [localQuotas, setLocalQuotas] = useState({});
    const [quotaError, setQuotaError] = useState(null);

    // Derived values
    const lotData = config && selectedLot ? config[selectedLot] : null;
    const isRti = lotData?.rti_enabled || false;
    const rtiCompanies = lotData?.rti_companies || [];
    const baseAmount = lotData?.base_amount || 0;
    const p_best = baseAmount * (1 - competitorDiscount / 100);
    const p_my = baseAmount * (1 - myDiscount / 100);
    const isBest = p_my < p_best;

    // Keep a stable ref to updateConfig to avoid re-triggering the effect
    const updateConfigRef = useRef(updateConfig);
    useEffect(() => {
        updateConfigRef.current = updateConfig;
    }, [updateConfig]);

    // Stable ref for lotData to use inside effect without causing re-triggers
    const lotDataRef = useRef(lotData);
    useEffect(() => {
        lotDataRef.current = lotData;
    }, [lotData]);

    // Serialize rtiCompanies to a string for stable dependency comparison
    const rtiCompaniesKey = rtiCompanies.join(',');

    // Initialize local quotas from config when lot changes
    useEffect(() => {
        const currentLotData = lotDataRef.current;
        if (currentLotData?.rti_quotas && Object.keys(currentLotData.rti_quotas).length > 0) {
            setLocalQuotas(currentLotData.rti_quotas);
        } else if (isRti && rtiCompaniesKey) {
            // Initialize default quotas: Lutech 70%, rest split among partners
            const companies = rtiCompaniesKey.split(',');
            const partnerCount = companies.length;
            const remaining = 30.0;
            const perPartner = partnerCount > 0 ? Math.round((remaining / partnerCount) * 100) / 100 : 0;
            const defaultQuotas = { Lutech: 70.0 };
            companies.forEach(company => {
                defaultQuotas[company] = perPartner;
            });
            setLocalQuotas(defaultQuotas);
            
            // Auto-save default quotas to backend so they're available for export
            // Only save once per lot to avoid loops
            if (currentLotData && selectedLot && !savedDefaultQuotasRef.current.has(selectedLot)) {
                savedDefaultQuotasRef.current.add(selectedLot);
                const updatedLot = { ...currentLotData, rti_quotas: defaultQuotas };
                updateConfigRef.current({ [selectedLot]: updatedLot });
            }
        } else {
            setLocalQuotas({});
        }
    }, [selectedLot, isRti, rtiCompaniesKey]);

    // Validate that quotas sum to 100
    const totalQuota = Object.values(localQuotas).reduce((sum, q) => sum + (parseFloat(q) || 0), 0);
    const isQuotaValid = Math.abs(totalQuota - 100) < 0.01;

    // Debounced save of quotas to backend
    const saveQuotas = useCallback(async (quotas) => {
        if (!lotData || !selectedLot) return;
        
        const total = Object.values(quotas).reduce((sum, q) => sum + (parseFloat(q) || 0), 0);
        if (Math.abs(total - 100) > 0.01) {
            setQuotaError(t('simulation.rti_total_must_100'));
            return;
        }
        setQuotaError(null);

        // Update local config immediately for responsive UI
        const updatedLot = { ...lotData, rti_quotas: quotas };
        const updatedConfig = { ...config, [selectedLot]: updatedLot };
        setConfig(updatedConfig);

        // Save to backend
        await updateConfig({ [selectedLot]: updatedLot });
    }, [lotData, selectedLot, config, setConfig, updateConfig, t]);

    // Handle quota change with debounce
    const handleQuotaChange = (company, value) => {
        const numValue = parseFloat(value) || 0;
        const newQuotas = { ...localQuotas, [company]: numValue };
        setLocalQuotas(newQuotas);
        
        // Debounce the save using ref instead of global
        if (quotaSaveTimeoutRef.current) {
            clearTimeout(quotaSaveTimeoutRef.current);
        }
        quotaSaveTimeoutRef.current = setTimeout(() => {
            saveQuotas(newQuotas);
        }, 1000);
    };

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (quotaSaveTimeoutRef.current) {
                clearTimeout(quotaSaveTimeoutRef.current);
            }
        };
    }, []);

    // Get all RTI companies including Lutech
    const allRtiCompanies = isRti ? ['Lutech', ...rtiCompanies] : [];

    return (
        <div className="w-[85vw] max-w-80 md:w-80 glass border-r flex flex-col h-full shadow-xl z-20">
            {/* Lutech Logo Banner */}
            <div className="p-4 glass-subtle border-b flex justify-between items-center">
                <button
                    onClick={() => {
                        if (onNavigate) onNavigate('dashboard');
                        if (window.innerWidth < 768 && onClose) onClose();
                    }}
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                    aria-label="Vai alla Home"
                >
                    <img src="/logo-lutech.png" alt="Lutech" className="h-10 object-contain" />
                </button>
                {/* Close button - mobile only */}
                <button
                    onClick={onClose}
                    className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label="Chiudi menu"
                >
                    <X className="w-5 h-5 text-slate-600" />
                </button>
            </div>

            <div className="p-6 border-b border-white/60 bg-white/30">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-lg">{t('simulation.title')}</h2>
                </div>

                <label className="block text-sm font-medium text-slate-700 mb-1">{t('sidebar.title')}</label>
                <select
                    value={selectedLot || ''}
                    onChange={(e) => {
                        setLot(e.target.value);
                        // Close sidebar on mobile after selection
                        if (window.innerWidth < 768 && onClose) onClose();
                    }}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    {config && Object.keys(config)
                        .filter(k => config[k]?.is_active !== false)  // Show only active lots
                        .sort((a, b) => a.localeCompare(b, 'it'))    // Sort by name
                        .map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
                {config && selectedLot && config[selectedLot] && (
                    <div className="flex items-center gap-2 mt-1">
                        <p className="text-xs text-slate-500">{config[selectedLot].name}</p>
                        {config[selectedLot].rti_enabled && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full border border-indigo-200">
                                <Building2 className="w-3 h-3" />
                                RTI ({(config[selectedLot].rti_companies?.length || 0) + 1})
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-4">

                {/* Economic Inputs */}
                <div className="space-y-3">
                    {/* Base Amount - compact */}
                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                        <label className="text-xs font-medium text-slate-600">{t('config.base_amount')}</label>
                        <span className="text-sm font-mono font-semibold text-slate-700">{formatCurrency(baseAmount)}</span>
                    </div>

                    {/* Discount inputs - unified compact style */}
                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                        {/* Best Offer row */}
                        <div className="relative">
                            <div 
                                className="absolute inset-y-0 left-0 bg-orange-50 transition-all duration-300"
                                style={{ width: `${Math.min(competitorDiscount, 100)}%` }}
                            />
                            <div className="relative px-4 py-3 flex items-center gap-3 border-b border-slate-100">
                                <div className="w-1 h-8 rounded-full bg-orange-500" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-slate-700 uppercase">{t('simulation.competitor_discount')}</div>
                                    <div className="text-[11px] text-slate-500 font-mono">{formatCurrency(p_best)}</div>
                                </div>
                                <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={competitorDiscount.toFixed(1)}
                                        onChange={(e) => setDiscount('competitorDiscount', Math.round(parseFloat(e.target.value) * 10) / 10 || 0)}
                                        className="w-16 text-sm font-mono text-right px-2 py-1.5 focus:outline-none focus:bg-orange-50"
                                    />
                                    <span className="text-xs text-slate-400 pr-2 bg-slate-50 py-1.5 pl-0.5">%</span>
                                </div>
                            </div>
                        </div>

                        {/* My Discount row */}
                        <div className="relative">
                            <div 
                                className={`absolute inset-y-0 left-0 ${isBest ? 'bg-green-50' : 'bg-blue-50'} transition-all duration-300`}
                                style={{ width: `${Math.min(myDiscount, 100)}%` }}
                            />
                            <div className="relative px-4 py-3 flex items-center gap-3">
                                <div className={`w-1 h-8 rounded-full ${isBest ? 'bg-green-500' : 'bg-blue-500'}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-semibold text-slate-700 uppercase">
                                        {isRti ? t('simulation.my_discount_rti') : t('simulation.my_discount')}
                                    </div>
                                    <div className="text-[11px] text-slate-500 font-mono">
                                        {formatCurrency(p_my)}
                                        {isBest && <span className="ml-2 text-green-600 font-bold">🔥 BEST</span>}
                                    </div>
                                </div>
                                <div className={`flex items-center bg-white border rounded-lg shadow-sm overflow-hidden ${isBest ? 'border-green-300' : 'border-slate-200'}`}>
                                    <input
                                        type="number"
                                        step="0.1"
                                        min="0"
                                        max="100"
                                        value={myDiscount.toFixed(1)}
                                        onChange={(e) => setDiscount('myDiscount', Math.round(parseFloat(e.target.value) * 10) / 10 || 0)}
                                        className={`w-16 text-sm font-mono text-right px-2 py-1.5 focus:outline-none font-bold ${isBest ? 'text-green-600 focus:bg-green-50' : 'text-blue-600 focus:bg-blue-50'}`}
                                    />
                                    <span className="text-xs text-slate-400 pr-2 bg-slate-50 py-1.5 pl-0.5">%</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RTI Quota Breakdown */}
                    {isRti && allRtiCompanies.length > 0 && (
                        <div className="rounded-xl border border-indigo-200 overflow-hidden">
                            {/* Header */}
                            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-white" />
                                        <span className="text-sm font-semibold text-white">{t('simulation.rti_breakdown')}</span>
                                    </div>
                                    <span className="font-mono text-sm font-semibold text-white">{formatCurrency(p_my)}</span>
                                </div>
                            </div>
                            
                            {quotaError && (
                                <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                                    {quotaError}
                                </div>
                            )}

                            {/* Company rows */}
                            <div className="bg-white divide-y divide-slate-100">
                                {allRtiCompanies.map((company) => {
                                    const quota = parseFloat(localQuotas[company]) || 0;
                                    const amount = p_my * (quota / 100);
                                    const isLutech = company === 'Lutech';
                                    const barColor = isLutech ? 'bg-blue-500' : 'bg-indigo-400';
                                    const textColor = isLutech ? 'text-blue-700' : 'text-slate-700';
                                    
                                    return (
                                        <div key={company} className="relative">
                                            {/* Background progress bar */}
                                            <div 
                                                className={`absolute inset-y-0 left-0 ${isLutech ? 'bg-blue-50' : 'bg-indigo-50'} transition-all duration-300`}
                                                style={{ width: `${Math.min(quota, 100)}%` }}
                                            />
                                            
                                            <div className="relative px-4 py-2.5 flex items-center gap-3">
                                                {/* Company indicator */}
                                                <div className={`w-1 h-7 rounded-full ${barColor}`} />
                                                
                                                {/* Company name */}
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-sm font-semibold ${textColor} truncate`}>
                                                        {company}
                                                    </div>
                                                    <div className="text-[11px] text-slate-500 font-mono">
                                                        {formatCurrency(amount)}
                                                    </div>
                                                </div>
                                                
                                                {/* Quota input */}
                                                <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="100"
                                                        value={quota.toFixed(1)}
                                                        onChange={(e) => handleQuotaChange(company, e.target.value)}
                                                        className="w-16 text-sm font-mono text-right px-2 py-1.5 focus:outline-none focus:bg-indigo-50"
                                                    />
                                                    <span className="text-xs text-slate-400 pr-2 bg-slate-50 py-1.5 pl-0.5">%</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer with total */}
                            <div className="bg-slate-50 px-4 py-2 border-t border-slate-200">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{t('simulation.rti_total')}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-mono font-bold ${isQuotaValid ? 'text-green-600' : 'text-red-500'}`}>
                                            {totalQuota.toFixed(1)}%
                                        </span>
                                        {!isQuotaValid && (
                                            <span className="text-[10px] text-red-500 font-mono">
                                                ({totalQuota < 100 ? `+${(100 - totalQuota).toFixed(1)}` : `-${(totalQuota - 100).toFixed(1)}`})
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Mini Summary */}
                {results && (
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <div className="grid grid-cols-3 gap-3 text-center mb-6">
                            <div>
                                <div className="text-2xl font-bold text-slate-800">{results.total_score}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard.total')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-blue-600">{results.technical_score}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard.technical')}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-600">{results.economic_score}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wider">{t('dashboard.economic')}</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Section - Business Plan & Cert Verification */}
            <div className="p-4 border-t border-white/60 bg-white/30 space-y-2">
                <button
                    onClick={() => {
                        if (onNavigate) onNavigate('businessPlan');
                        if (window.innerWidth < 768 && onClose) onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all font-medium text-sm ${
                        currentView === 'businessPlan'
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    <Briefcase className="w-4 h-4" />
                    <span>{t('business_plan.title')}</span>
                </button>
                <button
                    onClick={() => {
                        if (onNavigate) onNavigate('certs');
                        if (window.innerWidth < 768 && onClose) onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all font-medium text-sm ${
                        currentView === 'certs'
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    <FileSearch className="w-4 h-4" />
                    <span>Verifica Certificazioni</span>
                </button>
            </div>

            {/* Footer - Credits */}
            <div className="p-3 border-t border-white/60 bg-white/40">
                <a
                    href="https://it.linkedin.com/in/gabrielerendina"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 hover:opacity-70 transition-opacity"
                >
                    <img src="/gr-logo.png" alt="GR" className="h-5 w-auto opacity-70" />
                    <span className="text-[10px] text-slate-400 font-medium">Gabriele Rendina 2026</span>
                </a>
            </div>
        </div>
    );
}
