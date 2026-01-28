import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, BarChart, Bar } from 'recharts';
import { Target, Download, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import { formatCurrency, formatNumber } from '../utils/formatters';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const Gauge = ({ value, max, color, label, raw, weighted }) => {
    const data = [
        { name: 'Value', value: value },
        { name: 'Empty', value: max - value }
    ];

    // Calculate percentage for needle or just filled arc
    const percent = (value / max) * 100;

    return (
        <div className="h-40 w-full relative flex flex-col items-center justify-center">
            <ResponsiveContainer width="100%" height={160} minWidth={100}>
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="70%"
                        startAngle={180}
                        endAngle={0}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                    >
                        <Cell key="val" fill={color} />
                        <Cell key="empty" fill="#f1f5f9" />
                    </Pie>
                </PieChart>
            </ResponsiveContainer>
            <div className="absolute top-[65%] text-center">
                <div className="text-3xl font-bold text-slate-800">{formatNumber(value, 2)}</div>
                <div className="text-xs text-slate-400 uppercase">{label}</div>
                {(raw !== undefined || weighted !== undefined) && (
                    <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                        {raw !== undefined && <div>Raw: {formatNumber(raw, 2)}</div>}
                        {weighted !== undefined && <div>Weighted: {formatNumber(weighted, 2)}</div>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default function Dashboard({ results, simulationData, myDiscount, competitorDiscount, lotData, lotKey }) {
    const { t } = useTranslation();
    const [monteCarlo, setMonteCarlo] = useState(null);
    const [mcLoading, setMcLoading] = useState(false);
    const [exportLoading, setExportLoading] = useState(false);

    // Competitor inputs for discount optimizer
    const [competitorTechScore, setCompetitorTechScore] = useState(lotData?.max_tech_score || 60);
    const [competitorEconDiscount, setCompetitorEconDiscount] = useState(Math.min(30.0, competitorDiscount));
    const [optimizerResults, setOptimizerResults] = useState(null);
    const [optimizerLoading, setOptimizerLoading] = useState(false);

    // Run Monte Carlo when params change
    useEffect(() => {
        if (!results || !lotData) return;

        const runMC = async () => {
            setMcLoading(true);
            try {
                const res = await axios.post(`${API_URL}/monte-carlo`, {
                    lot_key: lotKey,
                    base_amount: lotData.base_amount,
                    my_discount: myDiscount,
                    competitor_discount_mean: competitorDiscount,
                    competitor_discount_std: 3.5, // assumed volatility
                    current_tech_score: results.technical_score,
                    iterations: 500
                });
                setMonteCarlo(res.data);
            } catch (err) {
                console.error("MC Error", err);
            } finally {
                setMcLoading(false);
            }
        };

        const timer = setTimeout(runMC, 1000); // debounce
        return () => clearTimeout(timer);
    }, [myDiscount, competitorDiscount, results?.technical_score, lotKey]);

    // Ensure competitor discount doesn't exceed Best Offer
    useEffect(() => {
        if (competitorEconDiscount > competitorDiscount) {
            setCompetitorEconDiscount(competitorDiscount);
        }
    }, [competitorDiscount]);

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
    }, [competitorTechScore, competitorEconDiscount, results?.technical_score, lotKey, competitorDiscount]);

    const handleExport = async () => {
        setExportLoading(true);
        try {
            const res = await axios.post(`${API_URL}/export-pdf`, {
                lot_key: lotKey,
                technical_score: results.technical_score,
                economic_score: results.economic_score,
                total_score: results.total_score,
                my_discount: myDiscount,
                competitor_discount: competitorDiscount,
                win_probability: monteCarlo?.win_probability || 0,
                avg_total_score: monteCarlo?.avg_total_score || 0,
                details: results.details,
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

    if (!results) return null;

    return (
        <div className="space-y-6 sticky top-6">

            {/* 1. Score Cards */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-semibold text-slate-800">{t('dashboard.performance_score')}</h3>
                    <button
                        onClick={handleExport}
                        disabled={exportLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-all text-sm font-medium disabled:opacity-50"
                    >
                        {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {t('dashboard.export_pdf')}
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <Gauge
                        value={results.technical_score}
                        max={lotData.max_tech_score || 60}
                        color="#3b82f6"
                        label={t('dashboard.technical')}
                    />
                    <Gauge value={results.economic_score} max={lotData.max_econ_score || 40} color="#10b981" label={t('dashboard.economic')} />
                    <Gauge value={results.total_score} max={100} color="#f59e0b" label={t('dashboard.total')} />
                </div>
            </div>

            {/* Strategic Analysis (Monte Carlo) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden relative">
                <div className="relative z-10">
                    {/* Competitor Inputs for Optimizer */}
                    <div className="mb-6 pb-6 border-b border-slate-100">
                        <div className="flex items-center gap-2 mb-4">
                            <Target className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Competitor da Battere</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-semibold text-slate-600 mb-2 block">
                                    Punteggio Tecnico Competitor
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max={lotData?.max_tech_score || 60}
                                        step="0.5"
                                        value={competitorTechScore}
                                        onChange={(e) => setCompetitorTechScore(parseFloat(e.target.value))}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <span className="text-sm font-bold text-slate-800 w-12 text-right">
                                        {formatNumber(competitorTechScore, 2)}
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    Max: {lotData?.max_tech_score || 60}
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-slate-600 mb-2 block">
                                    Sconto Economico Competitor
                                </label>
                                <div className="flex items-center gap-3">
                                    <input
                                        type="range"
                                        min="0"
                                        max={competitorDiscount}
                                        step="0.5"
                                        value={Math.min(competitorEconDiscount, competitorDiscount)}
                                        onChange={(e) => setCompetitorEconDiscount(parseFloat(e.target.value))}
                                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                    />
                                    <span className="text-sm font-bold text-slate-800 w-12 text-right">
                                        {formatNumber(competitorEconDiscount, 2)}%
                                    </span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-1">
                                    Max: Best Offer {formatNumber(competitorDiscount, 2)}%
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
                                    <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Competitor Totale</div>
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-xl font-bold text-slate-800">{formatNumber(optimizerResults.competitor_total_score, 2)}</span>
                                        <span className="text-xs text-slate-500">
                                            (Tech: {formatNumber(optimizerResults.competitor_tech_score, 2)} + Econ: {formatNumber(optimizerResults.competitor_econ_score, 2)})
                                        </span>
                                    </div>
                                </div>

                                {/* Current Scenario */}
                                <div className="p-3 bg-blue-50 rounded-lg border-2 border-blue-300">
                                    <div className="text-[10px] text-blue-700 uppercase font-bold mb-2">Scenario Attuale</div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">Sconto</span>
                                            <span className="text-lg font-bold text-slate-800">
                                                {formatNumber(myDiscount, 2)}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">Score Totale</span>
                                            <span className="text-sm font-bold text-slate-700">
                                                {formatNumber(results.total_score, 2)}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">Win Prob</span>
                                            <span className={`text-sm font-bold ${monteCarlo?.win_probability >= 90 ? 'text-green-600' : monteCarlo?.win_probability >= 80 ? 'text-blue-600' : monteCarlo?.win_probability >= 70 ? 'text-orange-600' : 'text-red-600'}`}>
                                                {monteCarlo?.win_probability || 0}%
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-baseline">
                                            <span className="text-[10px] text-slate-600">Delta vs Comp</span>
                                            <span className={`text-xs font-bold ${(results.total_score - optimizerResults.competitor_total_score) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {(results.total_score - optimizerResults.competitor_total_score) > 0 ? '+' : ''}{formatNumber(results.total_score - optimizerResults.competitor_total_score, 2)}
                                            </span>
                                        </div>
                                        <div className="pt-1.5 border-t border-blue-200 mt-1.5">
                                            <div className="flex justify-between items-baseline">
                                                <span className="text-[10px] text-slate-600">Costo Sconto</span>
                                                <span className="text-xs font-semibold text-red-600">
                                                    -{formatCurrency(lotData?.base_amount * (myDiscount / 100))}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Scenarios Grid */}
                                <div className="text-[10px] text-slate-600 uppercase font-bold mb-2">Scenari Ottimali di Sconto</div>
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
                                                    {scenario.name}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">Sconto</span>
                                                        <span className="text-lg font-bold text-slate-800">
                                                            {formatNumber(scenario.suggested_discount, 2)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">Score Totale</span>
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {formatNumber(scenario.resulting_total_score, 2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">Win Prob</span>
                                                        <span className={`text-sm font-bold ${scenario.win_probability >= 90 ? 'text-green-600' : scenario.win_probability >= 80 ? 'text-blue-600' : 'text-orange-600'}`}>
                                                            {formatNumber(scenario.win_probability, 2)}%
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between items-baseline">
                                                        <span className="text-[10px] text-slate-500">Delta vs Comp</span>
                                                        <span className={`text-xs font-bold ${scenario.delta_vs_competitor > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            {scenario.delta_vs_competitor > 0 ? '+' : ''}{formatNumber(scenario.delta_vs_competitor, 2)}
                                                        </span>
                                                    </div>
                                                    <div className="pt-1.5 border-t border-slate-200 mt-1.5">
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-[10px] text-slate-500">Costo Sconto</span>
                                                            <span className="text-xs font-semibold text-red-600">
                                                                -{formatCurrency(scenario.economic_impact)}
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
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-semibold text-slate-800">{t('dashboard.bid_to_win')}</h3>
                    <div className="flex gap-4">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Safe Zone</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Tu</span>
                        </div>
                    </div>
                </div>

                {simulationData && simulationData.length > 0 && (
                    <div className="w-full" style={{ height: '320px' }}>
                        <ResponsiveContainer width="100%" height={320} minWidth={100}>
                            <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="discount"
                                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                                    label={{ value: 'Sconto %', position: 'insideBottom', offset: -5, fontSize: 10 }}
                                />
                                <YAxis domain={['auto', 40]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                                <Tooltip
                                    formatter={(value) => [`${value} Punti Economici`, 'Economic Score']}
                                    labelFormatter={(label) => `Sconto: ${label}%`}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
                                />

                                {/* Optimal Discount Zone Shading */}
                                {monteCarlo?.optimal_discount && (
                                    <ReferenceLine
                                        segment={[{ x: monteCarlo.optimal_discount, y: 0 }, { x: 70, y: 0 }]}
                                        stroke="transparent"
                                    />
                                )}

                                <Area
                                    type="monotone"
                                    dataKey="economic_score"
                                    stroke="#10b981"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorTotal)"
                                    name={t('dashboard.economic')}
                                />

                                {/* Current Economic Position Line */}
                                <ReferenceLine
                                    y={results?.economic_score || 0}
                                    stroke="#ef4444"
                                    strokeWidth={2}
                                    strokeDasharray="3 3"
                                    label={{ position: 'right', value: 'Tua Posizione', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }}
                                />

                                {/* Competitor Threshold Line */}
                                <ReferenceLine
                                    y={monteCarlo?.competitor_threshold || 95}
                                    stroke="#f97316"
                                    strokeDasharray="4 4"
                                    label={{ position: 'right', value: t('dashboard.threshold_win'), fill: '#f97316', fontSize: 10, fontWeight: 'bold' }}
                                />

                                {/* Safe Zone Marker */}
                                {monteCarlo?.optimal_discount && (
                                    <ReferenceLine
                                        x={monteCarlo.optimal_discount}
                                        stroke="#10b981"
                                        strokeWidth={1}
                                        label={{ position: 'top', value: 'Safe Zone Start', fill: '#10b981', fontSize: 9, fontWeight: 'bold' }}
                                    />
                                )}

                                {/* Marker for Current Position */}
                                <ReferenceLine x={myDiscount} stroke="#ef4444" strokeWidth={2} label={{ position: 'top', value: 'TU', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                )}
                <div className="mt-4 flex flex-col gap-1 items-center">
                    <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                        {t('dashboard.chart_description')}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                        Safe Zone: {t('dashboard.win_prob')} {">"} 90%
                    </p>
                </div>
            </div>


            {/* 3. Detailed Score Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-semibold text-slate-800">{t('dashboard.detail_table')}</h3>
                    <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-100 shadow-sm">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Weighted:</span>
                            <span className="text-sm font-bold">{formatNumber(results.technical_score, 2)} / {lotData?.max_tech_score || 60}</span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-100 text-slate-500 px-3 py-1 rounded-full border border-slate-200">
                            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60">Raw:</span>
                            <span className="text-sm font-bold">{formatNumber(results.raw_technical_score || 0, 2)} / {lotData?.max_raw_score || 0}</span>
                        </div>
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th scope="col" className="px-6 py-3">{t('dashboard.requirement')}</th>
                                <th scope="col" className="px-6 py-3 text-right">{t('dashboard.points')}</th>
                                <th scope="col" className="px-6 py-3 text-right">{t('dashboard.max')}</th>
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
                                <td className="px-6 py-4 text-center">
                                    {((results.company_certs_score || 0) >= (lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0.001) && (results.company_certs_score || 0) > 0) ?
                                        <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded border border-green-200">MAX</span> :
                                        <span className="bg-slate-100 text-slate-800 text-xs font-medium px-2.5 py-0.5 rounded border border-slate-200">{formatNumber((results.company_certs_score || 0) / (lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 1) * 100, 0)}%</span>
                                    }
                                </td>
                            </tr>

                            {/* Requirements */}
                            {lotData && lotData.reqs.map(req => {
                                const score = results.details[req.id] || 0;
                                const isMax = score >= req.max_points;
                                return (
                                    <tr key={req.id} className="bg-white border-b border-slate-100 hover:bg-slate-50">
                                        <td className="px-6 py-4 font-medium text-slate-900">
                                            {req.label}
                                            <div className="text-xs text-slate-400 font-normal">{req.id}</div>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-blue-600">{formatNumber(score, 2)}</td>
                                        <td className="px-6 py-4 text-right text-slate-500">{formatNumber(req.max_points, 2)}</td>
                                        <td className="px-6 py-4 text-center">
                                            {isMax ?
                                                <span className="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded border border-green-200">MAX</span>
                                                :
                                                <span className="bg-slate-100 text-slate-800 text-xs font-medium px-2.5 py-0.5 rounded border border-slate-200">{formatNumber(score / req.max_points * 100, 0)}%</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}
