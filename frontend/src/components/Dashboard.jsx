import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Loader2, FileSearch } from 'lucide-react';
import axios from 'axios';
import { formatCurrency, formatNumber } from '../utils/formatters';
import { SkeletonGauge, SkeletonCard } from '../shared/components/ui/Skeleton';
import ScoreGauges from '../features/simulation/components/ScoreGauges';
import SimulationChart from '../features/simulation/components/SimulationChart';
import { useConfig } from '../features/config/context/ConfigContext';
import { useSimulation } from '../features/simulation/context/SimulationContext';
import { API_URL } from '../utils/api';
import CertVerification from './CertVerification';

export default function Dashboard() {
    const { t } = useTranslation();
    const { config } = useConfig();
    const {
        selectedLot,
        myDiscount,
        competitorDiscount,
        competitorTechScore,
        competitorEconDiscount,
        results,
        simulationData,
        setCompetitorParam
    } = useSimulation();

    // Derive lotData and lotKey from contexts
    const lotKey = selectedLot;
    const lotData = config?.[selectedLot];
    const [monteCarlo, setMonteCarlo] = useState(null);
    const [exportLoading, setExportLoading] = useState(false);
    
    // Certificate verification dialog
    const [showCertVerification, setShowCertVerification] = useState(false);

    // Optimizer results state
    const [optimizerResults, setOptimizerResults] = useState(null);
    const [optimizerLoading, setOptimizerLoading] = useState(false);

    // Run Monte Carlo when params change
    useEffect(() => {
        if (!results || !lotData) return;

        const runMC = async () => {
            try {
                const res = await axios.post(`${API_URL}/monte-carlo`, {
                    lot_key: lotKey,
                    base_amount: lotData.base_amount,
                    my_discount: myDiscount,
                    competitor_discount_mean: competitorDiscount,
                    competitor_discount_std: 3.5, // assumed volatility
                    current_tech_score: results.technical_score,
                    competitor_tech_score_mean: competitorTechScore, // use actual competitor tech score
                    competitor_tech_score_std: 3.0, // assumed volatility
                    iterations: 500
                });
                setMonteCarlo(res.data);
            } catch (err) {
                console.error("MC Error", err);
            }
        };

        const timer = setTimeout(runMC, 1000); // debounce
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [myDiscount, competitorDiscount, results?.technical_score, lotKey, lotData, competitorTechScore]);

    // Run optimizer when competitor inputs change
    useEffect(() => {
        if (!results || !lotData) return;

        const runOptimizer = async () => {
            setOptimizerLoading(true);
            try {
                const res = await axios.post(`${API_URL}/optimize-discount`, {
                    lot_key: lotKey,
                    base_amount: lotData.base_amount,
                    my_tech_score: results.technical_score,
                    competitor_tech_score: competitorTechScore,
                    competitor_discount: competitorEconDiscount,
                    best_offer_discount: competitorDiscount
                });
                setOptimizerResults(res.data);
            } catch (err) {
                console.error("Optimizer Error", err);
            } finally {
                setOptimizerLoading(false);
            }
        };

        const timer = setTimeout(runOptimizer, 1000); // debounce
        return () => clearTimeout(timer);
    }, [competitorTechScore, competitorEconDiscount, results?.technical_score, lotKey, competitorDiscount, lotData, results]);

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const res = await axios.post(`${API_URL}/export-pdf`, {
                lot_key: lotKey,
                base_amount: lotData.base_amount,
                technical_score: results.technical_score,
                economic_score: results.economic_score,
                total_score: results.total_score,
                my_discount: myDiscount,
                competitor_discount: competitorDiscount,
                competitor_tech_score: competitorTechScore, // Pass actual competitor tech score
                win_probability: monteCarlo?.win_probability || 0,
                avg_total_score: monteCarlo?.avg_total_score || 0,
                details: results.details,
                weighted_scores: results.weighted_scores || {},
                category_company_certs: results.category_company_certs || 0,
                category_resource: results.category_resource || 0,
                category_reference: results.category_reference || 0,
                category_project: results.category_project || 0,
                max_tech_score: lotData.max_tech_score || 60,
                max_econ_score: lotData.max_econ_score || 40,
                max_raw_score: lotData.max_raw_score || 0,
                monte_carlo_data: monteCarlo // Pass Monte Carlo data for PDF
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${t('dashboard.strategic_report').replace(/\s+/g, '_')}_${lotKey.replace(/\s+/g, '_')}.pdf`);
            document.body.appendChild(link);
            link.click();

            // Cleanup
            setTimeout(() => {
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            }, 100);
        } catch (err) {
            console.error("Export Error", err);
        } finally {
            setExportLoading(false);
        }
    };

    // Show loading skeleton when no results yet (AFTER all hooks!)
    if (!results || !lotData) {
        return (
            <div className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <SkeletonGauge />
                    <SkeletonGauge />
                    <SkeletonGauge />
                </div>
                <SkeletonCard />
                <SkeletonCard />
            </div>
        );
    }

    return (
        <div className="space-y-6 sticky top-6">

            {/* 1. Score Cards */}
            <ScoreGauges
                results={results}
                lotData={lotData}
                onExport={handleExport}
                exportLoading={exportLoading}
            />

            {/* Strategic Analysis (Monte Carlo) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                <div className="relative z-10">
                    {/* Competitor Inputs for Optimizer */}
                    <div className="mb-6 pb-6 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-4">
                            <Target className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">{t('dashboard.competitor_to_beat')}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-600 mb-2 block">
                                    {t('dashboard.competitor_tech_score')}
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max={lotData?.max_tech_score || 60}
                                        step="0.5"
                                        value={competitorTechScore}
                                        onChange={(e) => setCompetitorParam('competitorTechScore', parseFloat(e.target.value))}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <span className="text-sm font-bold text-slate-800 w-12 text-right">
                                        {formatNumber(competitorTechScore, 2)}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    {t('dashboard.max')}: {lotData?.max_tech_score || 60}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-600 mb-2 block">
                                    {t('dashboard.competitor_econ_discount')}
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max={competitorDiscount}
                                        step="0.5"
                                        value={Math.min(competitorEconDiscount, competitorDiscount)}
                                        onChange={(e) => setCompetitorParam('competitorEconDiscount', parseFloat(e.target.value))}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <span className="text-sm font-bold text-slate-800 w-12 text-right">
                                        {formatNumber(competitorEconDiscount, 2)}%
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    {t('dashboard.max_best_offer', { discount: formatNumber(competitorDiscount, 2) })}
                                </div>
                            </div>
                        </div>

                        {/* Optimizer Results - Discount Scenarios */}
                        {optimizerLoading ? (
                            <div className="mt-4 flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                            </div>
                        ) : optimizerResults && (
                            <div className="mt-4 space-y-3">
                                {/* Competitor Summary */}
                                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">{t('dashboard.competitor_total')}</div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-slate-800">{formatNumber(optimizerResults.competitor_total_score, 2)}</span>
                                        <span className="text-xs text-slate-500">
                                            ({t('dashboard.tech')}: {formatNumber(optimizerResults.competitor_tech_score, 2)} + {t('dashboard.econ')}: {formatNumber(optimizerResults.competitor_econ_score, 2)})
                                        </span>
                                    </div>
                                </div>

                                {/* Current Scenario */}
                                <div className="p-3 bg-blue-50 rounded-lg border-2 border-blue-300">
                                    <div className="text-[10px] text-blue-700 uppercase font-bold mb-2">{t('dashboard.current_scenario')}</div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">{t('dashboard.discount')}</span>
                                            <span className="text-lg font-bold text-slate-800">
                                                {formatNumber(myDiscount, 2)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">{t('dashboard.total_score')}</span>
                                            <span className="text-sm font-bold text-slate-700">
                                                {formatNumber(results.total_score, 2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">{t('dashboard.win_prob')}</span>
                                            <span className={`text-sm font-bold ${monteCarlo?.win_probability >= 90 ? 'text-green-600' : monteCarlo?.win_probability >= 80 ? 'text-blue-600' : monteCarlo?.win_probability >= 70 ? 'text-orange-600' : 'text-red-600'}`}>
                                                {monteCarlo?.win_probability || 0}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">{t('dashboard.delta_vs_comp')}</span>
                                            <span className={`text-xs font-bold ${(results.total_score - optimizerResults.competitor_total_score) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {(results.total_score - optimizerResults.competitor_total_score) > 0 ? '+' : ''}{formatNumber(results.total_score - optimizerResults.competitor_total_score, 2)}
                                            </span>
                                        </div>
                                        <div className="pt-1.5 border-t border-blue-200 mt-1.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] text-slate-600">{t('dashboard.offer_value')}</span>
                                                <span className="text-xs font-semibold text-blue-600">
                                                    {formatCurrency(lotData?.base_amount * (1 - myDiscount / 100))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Discount Impact Calculator */}
                                <div className="mt-4 mb-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
                                    <div className="text-xs font-bold text-purple-900 mb-3 uppercase tracking-wide">📊 {t('dashboard.discount_impact_calculator')}</div>
                                    <div className="grid grid-cols-3 gap-3 text-center">
                                        <div>
                                            <div className="text-[10px] text-slate-600 mb-1">{t('dashboard.current_discount')}</div>
                                            <div className="text-lg font-bold text-slate-900">{formatNumber(myDiscount, 1)}%</div>
                                            <div className="text-xs text-slate-600">{formatNumber(results?.economic_score || 0, 2)} {t('dashboard.points_short')}</div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-600 mb-1">{t('dashboard.best_offer')}</div>
                                            <div className="text-lg font-bold text-orange-600">{formatNumber(competitorDiscount, 1)}%</div>
                                            <div className="text-xs text-slate-600">
                                                {formatNumber(simulationData?.find(p => Math.abs(p.discount - competitorDiscount) < 0.1)?.economic_score || 0, 2)} {t('dashboard.points_short')}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[10px] text-slate-600 mb-1">{t('dashboard.econ_points_diff')}</div>
                                            <div className={`text-lg font-bold ${(results?.economic_score || 0) - (simulationData?.find(p => Math.abs(p.discount - competitorDiscount) < 0.1)?.economic_score || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatNumber((results?.economic_score || 0) - (simulationData?.find(p => Math.abs(p.discount - competitorDiscount) < 0.1)?.economic_score || 0), 2)}
                                            </div>
                                            <div className="text-[10px] text-slate-500">{t('dashboard.vs_competitor')}</div>
                                        </div>
                                    </div>
                                    <div className="mt-3 text-[10px] text-purple-700 text-center">
                                        💡 {t('dashboard.discount_impact_tip', { value: formatNumber(((simulationData?.find(p => p.discount === myDiscount + 1)?.economic_score || 0) - (results?.economic_score || 0)), 2) })}
                                    </div>
                                </div>

                                {/* Scenarios Grid */}
                                <div className="text-[10px] text-slate-600 uppercase font-bold mb-2">{t('dashboard.discount_scenarios')}</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {optimizerResults.scenarios?.map((scenario) => {
                                        const colorClasses = {
                                            'Conservativo': 'border-yellow-200 bg-yellow-50',
                                            'Bilanciato': 'border-blue-200 bg-blue-50',
                                            'Aggressivo': 'border-orange-200 bg-orange-50',
                                            'Max': 'border-green-200 bg-green-50'
                                        };
                                        const textColorClasses = {
                                            'Conservativo': 'text-yellow-700',
                                            'Bilanciato': 'text-blue-700',
                                            'Aggressivo': 'text-orange-700',
                                            'Max': 'text-green-700'
                                        };

                                        return (
                                            <div
                                                key={scenario.name}
                                                className={`p-3 rounded-lg border-2 ${colorClasses[scenario.name] || 'border-slate-200 bg-slate-50'} transition-all hover:shadow-md cursor-pointer`}
                                            >
                                                <div className={`text-xs font-bold mb-2 ${textColorClasses[scenario.name] || 'text-slate-700'}`}>
                                                    {t(`dashboard.scenarios.${scenario.name.toLowerCase()}`)}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">{t('dashboard.discount')}</span>
                                                        <span className="text-lg font-bold text-slate-800">
                                                            {formatNumber(scenario.suggested_discount, 2)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">{t('dashboard.total_score')}</span>
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {formatNumber(scenario.resulting_total_score, 2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">{t('dashboard.win_prob')}</span>
                                                        <span className={`text-sm font-bold ${scenario.win_probability >= 90 ? 'text-green-600' : scenario.win_probability >= 80 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                            {formatNumber(scenario.win_probability, 2)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">{t('dashboard.delta_vs_comp')}</span>
                                                        <span className={`text-xs font-bold ${scenario.delta_vs_competitor > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {scenario.delta_vs_competitor > 0 ? '+' : ''}{formatNumber(scenario.delta_vs_competitor, 2)}
                                                        </span>
                                                    </div>
                                                    <div className="pt-1.5 border-t border-slate-200 mt-1.5">
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-[10px] text-slate-500 font-bold">{t('dashboard.offer_value')}</span>
                                                            <span className="text-sm font-bold text-slate-900">
                                                                {formatCurrency(lotData?.base_amount * (1 - scenario.suggested_discount / 100))}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {/* 2. Simulation Chart */}
            <SimulationChart
                simulationData={simulationData}
                monteCarlo={monteCarlo}
                results={results}
                myDiscount={myDiscount}
                competitorDiscount={competitorDiscount}
            />


            {/* 3. Detailed Score Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800">{t('dashboard.detail_table')}</h3>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">{t('dashboard.weighted')}:</span>
                            <span className="text-sm font-bold">{formatNumber(results.technical_score, 2)} / {lotData?.max_tech_score || 60}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-3 py-1 rounded-full border border-slate-200">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">{t('dashboard.raw')}:</span>
                            <span className="text-sm font-bold">{formatNumber(results.raw_technical_score || 0, 2)} / {lotData?.max_raw_score || 0}</span>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th scope="col" className="px-6 py-3">{t('dashboard.requirement')}</th>
                                <th scope="col" className="px-6 py-3 text-right">{t('dashboard.raw')}</th>
                                <th scope="col" className="px-6 py-3 text-right">{t('dashboard.max_raw')}</th>
                                <th scope="col" className="px-6 py-3 text-right text-amber-700">{t('dashboard.weighted')}</th>
                                <th scope="col" className="px-6 py-3 text-right text-amber-700">{t('dashboard.tender_weight')}</th>
                                <th scope="col" className="px-6 py-3 text-center">{t('dashboard.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Company Certs */}
                            <tr className="bg-white border-b border-slate-100 hover:bg-slate-50">
                                <td className="px-6 py-4 font-medium text-slate-900">
                                    {t('dashboard.company_certs')}
                                    <div className="text-xs text-slate-400 font-normal">{t('config.company_certs')}</div>
                                </td>
                                <td className="px-6 py-4 text-right font-bold text-blue-600">{formatNumber(results.company_certs_score || 0, 2)}</td>
                                <td className="px-6 py-4 text-right text-slate-500">{formatNumber(lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0, 1)}</td>
                                <td className="px-6 py-4 text-right font-bold text-amber-600">{formatNumber(results.category_company_certs || 0, 2)}</td>
                                <td className="px-6 py-4 text-right text-amber-500">{formatNumber(lotData.company_certs?.reduce((sum, c) => sum + (c.gara_weight || 0), 0) || 0, 1)}</td>
                                <td className="px-6 py-4 text-center">
                                    {((results.company_certs_score || 0) >= (lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0.001) && (results.company_certs_score || 0) > 0) ?
                                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded border border-green-200">{t('dashboard.max_status')}</span> :
                                        <span className="bg-slate-100 text-slate-800 text-xs font-medium px-2.5 py-0.5 rounded border border-slate-200">{formatNumber((results.company_certs_score || 0) / (lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 1) * 100, 0)}%</span>
                                    }
                                </td>
                            </tr>

                            {/* Requirements */}
                            {lotData?.reqs?.map(req => {
                                const score = results.details[req.id] || 0;
                                const maxRaw = results.max_raw_scores?.[req.id] || req.max_points; // Use API max_raw if available
                                const weightedScore = results.weighted_scores?.[req.id] || 0;
                                const isMax = score >= maxRaw;
                                const percentage = maxRaw > 0 ? (score / maxRaw * 100) : 0;
                                return (
                                    <tr key={req.id} className="bg-white border-b border-slate-100 hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {req.label}
                                            <div className="text-xs text-slate-400 font-normal">{req.id}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-blue-600">{formatNumber(score, 2)}</td>
                                        <td className="px-6 py-4 text-right text-slate-500">{formatNumber(maxRaw, 2)}</td>
                                        <td className="px-6 py-4 text-right font-bold text-amber-600">{formatNumber(weightedScore, 2)}</td>
                                        <td className="px-6 py-4 text-right text-amber-500">{formatNumber(req.gara_weight || 0, 1)}</td>
                                        <td className="px-6 py-4 text-center">
                                            {isMax ?
                                                <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded border border-green-200">{t('dashboard.max_status')}</span>
                                                :
                                                <span className="bg-slate-100 text-slate-800 text-xs font-medium px-2.5 py-0.5 rounded border border-slate-200">{formatNumber(percentage, 0)}%</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Certificate Verification Button */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <button
                    onClick={() => setShowCertVerification(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors font-medium"
                >
                    <FileSearch className="w-5 h-5" />
                    {t('dashboard.verify_certifications') || 'Verifica Certificazioni PDF'}
                </button>
            </div>

            {/* Certificate Verification Dialog */}
            {showCertVerification && (
                <CertVerification onClose={() => setShowCertVerification(false)} />
            )}

        </div>
    );
}
