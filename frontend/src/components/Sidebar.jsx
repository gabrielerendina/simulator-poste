import { useState } from 'react';
import { Sliders, Settings, Check, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatCurrency, formatNumber } from '../utils/formatters';

export default function Sidebar({
    config, selectedLotKey, onSelectLot,
    baseAmount,
    competitorDiscount, setCompetitorDiscount,
    myDiscount, setMyDiscount,
    results,
    onSaveState,
    isOpen,
    onClose
}) {
    const { t } = useTranslation();
    const p_best = baseAmount * (1 - competitorDiscount / 100);
    const p_my = baseAmount * (1 - myDiscount / 100);
    const isBest = p_my < p_best;

    const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, success

    const handleManualSave = async () => {
        setSaveStatus('saving');
        const success = await onSaveState?.();
        if (success) {
            setSaveStatus('success');
            setTimeout(() => setSaveStatus('idle'), 2000);
        } else {
            setSaveStatus('idle');
        }
    };

    return (
        <div className="w-80 bg-white border-r border-slate-200 flex flex-col h-full shadow-lg z-20">
            {/* Lutech Logo Banner */}
            <div className="p-4 bg-gradient-to-br from-slate-50 to-white border-b border-slate-200 flex justify-between items-center">
                <img src="/logo-lutech.png" alt="Lutech" className="h-10 object-contain" />
                {/* Close button - mobile only */}
                <button
                    onClick={onClose}
                    className="md:hidden p-2 hover:bg-slate-100 rounded-lg transition-colors"
                    aria-label="Chiudi menu"
                >
                    <X className="w-5 h-5 text-slate-600" />
                </button>
            </div>

            <div className="p-6 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2 mb-4">
                    <Settings className="w-5 h-5 text-blue-600" />
                    <h2 className="font-semibold text-lg">{t('simulation.title')}</h2>
                </div>

                <label className="block text-sm font-medium text-slate-700 mb-1">{t('sidebar.title')}</label>
                <select
                    value={selectedLotKey}
                    onChange={(e) => {
                        onSelectLot(e.target.value);
                        // Close sidebar on mobile after selection
                        if (window.innerWidth < 768 && onClose) onClose();
                    }}
                    className="w-full p-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                    {Object.keys(config).map(k => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">{config[selectedLotKey].name}</p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto space-y-8">

                {/* Economic Inputs */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">{t('config.base_amount')}</label>
                        <div className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md text-slate-600 font-mono text-sm shadow-sm ring-1 ring-slate-100 italic">
                            {formatCurrency(baseAmount)}
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-600 uppercase">{t('simulation.competitor_discount')}</label>
                            <div className="flex items-center gap-1 bg-white border rounded px-2 py-0.5">
                                <input
                                    type="number"
                                    step="0.1"
                                    value={competitorDiscount}
                                    onChange={(e) => setCompetitorDiscount(Math.round(parseFloat(e.target.value) * 10) / 10 || 0)}
                                    className="w-12 text-sm font-mono focus:outline-none text-right"
                                />
                                <span className="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                        <input
                            type="range" min="0" max="100" step="0.1"
                            value={competitorDiscount}
                            onChange={(e) => setCompetitorDiscount(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                        />
                        <p className="text-xs text-slate-400 mt-1 text-right">{t('simulation.best_price')}: {formatCurrency(p_best)}</p>
                    </div>

                    <div className={`p-4 rounded-lg border transition-colors ${isBest ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs font-bold text-slate-600 uppercase">{t('simulation.my_discount')}</label>
                            <div className="flex items-center gap-1 bg-white border rounded px-2 py-0.5">
                                <input
                                    type="number"
                                    step="0.1"
                                    value={myDiscount}
                                    onChange={(e) => setMyDiscount(Math.round(parseFloat(e.target.value) * 10) / 10 || 0)}
                                    className="w-12 text-sm font-mono focus:outline-none text-right text-blue-600 font-bold"
                                />
                                <span className="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                        <input
                            type="range" min="0" max="100" step="0.1"
                            value={myDiscount}
                            onChange={(e) => setMyDiscount(parseFloat(e.target.value))}
                            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                        <p className="text-xs text-slate-500 mt-1 text-right">{t('simulation.your_price')}: {formatCurrency(p_my)}</p>
                        {isBest && <p className="text-xs text-green-600 font-bold mt-2">{t('app.best_price_badge')}</p>}
                    </div>
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

                <div className="mt-auto pt-6">
                    {/* Save Button for Simulation State */}
                    <button
                        onClick={handleManualSave}
                        disabled={saveStatus === 'saving'}
                        className={`w-full py-3 px-4 rounded-xl transition-all shadow-md font-medium flex items-center justify-center gap-2 ${saveStatus === 'success'
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                            }`}
                    >
                        {saveStatus === 'success' ? (
                            <>
                                <Check className="w-4 h-4" />
                                {t('common.save_success')}
                            </>
                        ) : saveStatus === 'saving' ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4 text-slate-400" />
                                {t('common.save_config')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
