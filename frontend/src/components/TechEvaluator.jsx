import { useState } from 'react';
import { Check, Star, Info, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../utils/formatters';

export default function TechEvaluator({ lotData, inputs, setInputs, certs, setCerts, results }) {
    const { t } = useTranslation();
    const [expandedSections, setExpandedSections] = useState({
        companyCerts: true,
        profCerts: true,
        projectRefs: true
    });

    const toggleSection = (section) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };
    const QUAL_OPTIONS = [
        t('tech.qual_options.absent'),
        t('tech.qual_options.partial'),
        t('tech.qual_options.adequate'),
        t('tech.qual_options.good'),
        t('tech.qual_options.excellent'),
        t('tech.qual_options.outstanding')
    ];

    const updateInput = (reqId, field, value) => {
        setInputs(prev => ({
            ...prev,
            [reqId]: {
                ...prev[reqId],
                [field]: value
            }
        }));
    };

    const toggleCert = (key) => {
        setCerts(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Guard clause - return early if no lotData
    if (!lotData) {
        return (
            <div className="bg-white rounded-lg border border-slate-200 p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-slate-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                </div>
            </div>
        );
    }

    // Dynamic Category Totals
    const maxCompanyCerts = lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0;
    const maxProfCerts = lotData.reqs?.filter(r => r.type === 'resource').reduce((sum, r) => sum + (r.max_points || 0), 0) || 0;
    const maxProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, r) => sum + (r.max_points || 0), 0) || 0;

    // Calculate raw scores for each category
    const rawCompanyCerts = lotData.company_certs?.reduce((sum, cert) =>
        sum + (certs[cert.label] ? cert.points : 0), 0) || 0;

    const weightedProfCerts = lotData.reqs?.filter(r => r.type === 'resource').reduce((sum, r) =>
        sum + (results?.details[r.id] || 0), 0) || 0;

    const rawProfCerts = lotData.reqs?.filter(r => r.type === 'resource').reduce((sum, req) => {
        const cur = inputs[req.id] || { r_val: 0, c_val: 0 };
        return sum + (2 * cur.r_val + cur.r_val * cur.c_val);
    }, 0) || 0;

    const weightedProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, r) =>
        sum + (results?.details[r.id] || 0), 0) || 0;

    const rawProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, req) => {
        const cur = inputs[req.id] || { sub_req_vals: [], bonus_active: false, attestazione_active: false, custom_metric_vals: {} };

        // 1. Sub-reqs/Criteria raw
        const subSum = cur.sub_req_vals?.reduce((subSum, sv) =>
            subSum + (sv.val || 0) * ((req.sub_reqs || req.criteria)?.find(s => s.sub_id === sv.sub_id || s.id === sv.sub_id)?.weight || 1), 0) || 0;

        // 2. Attestazione Cliente raw
        const attSum = cur.attestazione_active ? (req.attestazione_score || 0) : 0;

        // 3. Custom Metrics raw
        const customSum = Object.entries(cur.custom_metric_vals || {}).reduce((cSum, [mId, mVal]) =>
            cSum + (parseFloat(mVal) || 0), 0);

        // 4. Legacy bonus raw
        const bonusSum = cur.bonus_active ? (req.bonus_val || 0) : 0;

        // Final pts for this req (raw is capped at requirement max_points)
        const reqPts = Math.min(subSum + attSum + customSum + bonusSum, req.max_points);

        return sum + reqPts;
    }, 0) || 0;

    // Safety check
    if (!lotData || !Array.isArray(lotData.reqs)) {
        return (
            <div className="text-center text-red-500 font-bold p-8">
                Errore: dati del lotto non disponibili o corrotti.<br />
                Controlla la configurazione e riprova.
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">

            {/* 1. Company Certifications */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                    onClick={() => toggleSection('companyCerts')}
                    className="w-full px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800">{t('dashboard.company_certs')}</h3>
                            <div className="text-[10px] text-slate-500 mt-1">
                                <span>Raw: {formatNumber(rawCompanyCerts, 2)}</span>
                                <span className="mx-2">•</span>
                                <span>Weighted: {formatNumber(results?.company_certs_score || 0, 2)}</span>
                            </div>
                        </div>
                        <span className="text-sm font-bold text-blue-600">
                            {formatNumber(results?.company_certs_score || 0, 2)} / {formatNumber(maxCompanyCerts, 2)} pt
                        </span>
                    </div>
                    {expandedSections.companyCerts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.companyCerts && (
                    <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {lotData.company_certs && lotData.company_certs.length > 0 ? (
                            lotData.company_certs.map((cert) => (
                                <button
                                    key={cert.label}
                                    onClick={() => toggleCert(cert.label)}
                                    className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${certs[cert.label] ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                        }`}
                                >
                                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${certs[cert.label] ? 'bg-blue-500 border-blue-500' : 'bg-white border-slate-300'}`}>
                                        {certs[cert.label] && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className="text-sm font-semibold truncate flex-1">{cert.label}</span>
                                    <span className={`text-xs font-bold ${certs[cert.label] ? 'text-blue-600' : 'text-slate-400'}`}>
                                        +{cert.points}
                                    </span>
                                </button>
                            ))
                        ) : (
                            <div className="col-span-full text-center py-4 text-slate-400 text-sm italic">
                                {t('config.no_certs')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. Professional Certs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                    onClick={() => toggleSection('profCerts')}
                    className="w-full px-6 py-4 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors flex justify-between items-center"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800">{t('tech.prof_certs')}</h3>
                            <div className="text-[10px] text-slate-500 mt-1">
                                <span>Raw: {formatNumber(rawProfCerts, 2)}</span>
                                <span className="mx-2">•</span>
                                <span>Weighted: {formatNumber(weightedProfCerts, 2)}</span>
                            </div>
                        </div>
                        <span className="text-sm font-bold text-indigo-600">
                            {formatNumber(weightedProfCerts, 2)} / {formatNumber(maxProfCerts, 2)} pt
                        </span>
                    </div>
                    {expandedSections.profCerts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.profCerts && (
                    <div className="p-6 space-y-6">
                        {lotData.reqs.filter(r => r.type === 'resource').length === 0 ? (
                            <div className="text-center text-slate-400 text-sm italic py-4">
                                ⚠️ Nessuna certificazione professionale configurata per questo lotto.<br />
                                Verifica la configurazione in <b>ConfigPage</b> o la sincronizzazione dei dati.
                            </div>
                        ) : (
                            lotData.reqs.filter(r => r.type === 'resource').map(req => {
                                const cur = inputs[req.id] || { r_val: 0, c_val: 0 };
                                const pts = results?.details[req.id] || 0;
                                // Dynamic max values from configuration

                                // Mostra sempre la formula, anche se prof_R/prof_C sono bassi o mancanti
                                const maxR = typeof req.prof_R === 'number' ? req.prof_R : (typeof req.max_res === 'number' ? req.max_res : 1);
                                const maxC = typeof req.prof_C === 'number' ? req.prof_C : (typeof req.max_certs === 'number' ? req.max_certs : 1);

                                return (
                                    <div key={req.id} className="p-4 bg-slate-50 rounded-lg border border-slate-100">

                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h4 className="font-medium text-slate-900 mb-1">{req.label}</h4>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs font-bold">
                                                        <Info className="w-3 h-3 mr-1 text-blue-400" />
                                                        {t('tech.formula')}: 2R + RC
                                                    </span>
                                                </div>
                                                <p className="text-xs text-purple-600 font-semibold mb-1">
                                                    📋 Configurazione richiesta: R={maxR}, C={maxC} | Max {req.max_points}pt
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-blue-600">{formatNumber(pts, 2)}</span>
                                                <span className="text-xs text-slate-400"> / {formatNumber(req.max_points, 2)}</span>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div>
                                                <div className="flex justify-between mb-1">
                                                    <span className="text-xs font-semibold text-slate-600">{t('tech.num_resources')} (R)</span>
                                                    <span className="text-xs font-bold">{cur.r_val} / {maxR}</span>
                                                </div>
                                                <input
                                                    type="range" min="0" max={maxR}
                                                    value={cur.r_val}
                                                    onChange={(e) => {
                                                        const newR = parseInt(e.target.value);
                                                        updateInput(req.id, 'r_val', newR);

                                                        // Informative cap for C based on R if needed, 
                                                        // though formula 2R + RC works mathematically with any C
                                                        if (cur.c_val > newR) {
                                                            // Optional: auto-adjust total C if it exceeds R
                                                            // updateInput(req.id, 'c_val', newR);
                                                        }
                                                    }}
                                                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />
                                                <div className="text-[10px] text-slate-500 mt-1">Max configurato: {maxR}</div>
                                            </div>

                                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{t('common.certificates')} (C)</span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cur.c_val > cur.r_val ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                        TOTALE C: {cur.c_val || 0}
                                                    </span>
                                                </div>

                                                <div className="space-y-3">
                                                    {req.selected_prof_certs && req.selected_prof_certs.length > 0 ? (
                                                        req.selected_prof_certs.map(cert => {
                                                            const count = (cur.cert_counts?.[cert]) || 0;

                                                            const updateCount = (delta) => {
                                                                const counts = { ...(cur.cert_counts || {}) };
                                                                const newVal = Math.max(0, count + delta);
                                                                counts[cert] = newVal;

                                                                const newTotalC = req.selected_prof_certs.reduce((s, c) => s + (counts[c] || 0), 0);
                                                                updateInput(req.id, 'cert_counts', counts);
                                                                updateInput(req.id, 'c_val', newTotalC);
                                                            };

                                                            return (
                                                                <div key={cert} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                                                                    <span className="text-[11px] font-semibold text-slate-700 truncate mr-2" title={cert}>{cert}</span>
                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                        <button
                                                                            onClick={() => updateCount(-1)}
                                                                            className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                                                                        >
                                                                            <Minus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <input
                                                                            type="number"
                                                                            min="0"
                                                                            value={count}
                                                                            onChange={(e) => {
                                                                                const val = parseInt(e.target.value) || 0;
                                                                                const counts = { ...(cur.cert_counts || {}) };
                                                                                counts[cert] = Math.max(0, val);
                                                                                const newTotalC = req.selected_prof_certs.reduce((s, c) => s + (counts[c] || 0), 0);
                                                                                updateInput(req.id, 'cert_counts', counts);
                                                                                updateInput(req.id, 'c_val', newTotalC);
                                                                            }}
                                                                            className="w-10 text-center bg-white border border-slate-200 rounded text-xs font-bold py-1 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                        />
                                                                        <button
                                                                            onClick={() => updateCount(1)}
                                                                            className="p-1 rounded-md hover:bg-slate-200 text-slate-500 transition-colors"
                                                                        >
                                                                            <Plus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="text-[10px] text-slate-400 italic text-center py-2">
                                                            Nessuna certificazione specifica selezionata in configurazione.
                                                        </div>
                                                    )}
                                                </div>

                                                {(!req.selected_prof_certs || req.selected_prof_certs.length === 0) && (
                                                    <div className="mt-4 pt-3 border-t border-slate-100">
                                                        <div className="flex justify-between mb-1">
                                                            <span className="text-xs font-semibold text-slate-500">Regolazione Manuale C</span>
                                                            <span className="text-xs font-bold">{cur.c_val || 0}</span>
                                                        </div>
                                                        <input
                                                            type="range"
                                                            min={0}
                                                            max={Math.max(10, cur.r_val)}
                                                            value={cur.c_val || 0}
                                                            onChange={(e) => updateInput(req.id, 'c_val', parseInt(e.target.value))}
                                                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                                        />
                                                    </div>
                                                )}

                                                {cur.c_val > cur.r_val && (
                                                    <div className="mt-3 p-2 bg-amber-50 rounded border border-amber-200 flex items-start gap-2">
                                                        <Info className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                                        <p className="text-[9px] text-amber-700 leading-tight">
                                                            <b>Attenzione:</b> Il numero totale di certificazioni (C={cur.c_val}) è superiore al numero di risorse (R={cur.r_val}).
                                                            Assicurati che sia corretto per la formula 2R + RC.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>

            {/* 3. Projects & Refs */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <button
                    onClick={() => toggleSection('projectRefs')}
                    className="w-full px-6 py-4 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors flex justify-between items-center"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800 text-left">{t('tech.project_refs')}</h3>
                            {expandedSections.projectRefs && (
                                <p className="text-xs text-slate-500 mt-1 text-left">Giudizio Discrezionale: Assente=0, Parziale=2, Adeguato=3, Più che adeguato=4, Ottimo=5</p>
                            )}
                            <div className="text-[10px] text-slate-500 mt-1">
                                <span>Raw: {formatNumber(rawProjectRefs, 2)}</span>
                                <span className="mx-2">•</span>
                                <span>Weighted: {formatNumber(weightedProjectRefs, 2)}</span>
                            </div>
                        </div>
                        <span className="text-sm font-bold text-purple-600">
                            {formatNumber(weightedProjectRefs, 2)} / {formatNumber(maxProjectRefs, 2)} pt
                        </span>
                    </div>
                    {expandedSections.projectRefs ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.projectRefs && (
                    <div className="divide-y divide-slate-100">
                        {lotData.reqs.filter(r => ['reference', 'project'].includes(r.type)).map(req => {
                            const cur = inputs[req.id] || { qual_val: 'Adeguato', bonus_active: false };
                            const pts = results?.details[req.id] || 0;

                            const JUDGMENT_OPTIONS = [
                                { value: 0, label: "Assente/Inadeguato", color: "bg-red-100 border-red-300 text-red-800" },
                                { value: 2, label: "Parzialmente adeguato", color: "bg-orange-100 border-orange-300 text-orange-800" },
                                { value: 3, label: "Adeguato", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
                                { value: 4, label: "Più che adeguato", color: "bg-lime-100 border-lime-300 text-lime-800" },
                                { value: 5, label: "Ottimo", color: "bg-green-100 border-green-300 text-green-800" }
                            ];

                            return (
                                <div key={req.id} className="p-6 hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between mb-4">
                                        <h4 className="font-medium text-slate-900 flex items-center gap-2">
                                            <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
                                            {req.label}
                                        </h4>
                                        <div className="text-right">
                                            <span className="text-lg font-bold text-blue-600">{formatNumber(pts, 2)}</span>
                                            <span className="text-xs text-slate-400"> / {formatNumber(req.max_points, 2)}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-6">
                                        {/* 1. Sub-requirements / Criteria (Discretionary) */}
                                        {(req.sub_reqs || req.criteria)?.map(sub => {
                                            const subVal = cur.sub_req_vals?.find(s => s.sub_id === sub.id)?.val ?? 0;
                                            const weight = sub.weight || 1;
                                            const contribution = weight * subVal;

                                            return (
                                                <div key={sub.id} className="border-l-2 border-blue-200 pl-4">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-sm font-semibold text-slate-700">{sub.label}</span>
                                                            <span className="text-xs text-slate-500">Peso: <span className="font-mono font-bold text-blue-600">{weight}</span></span>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-[10px] text-slate-500 uppercase font-bold">Contribution</div>
                                                            <div className="text-sm font-bold text-blue-600">{contribution.toFixed(2)}</div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-5 gap-2">
                                                        {JUDGMENT_OPTIONS.map(option => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => {
                                                                    const newVal = option.value;
                                                                    const existingSubVals = cur.sub_req_vals || [];
                                                                    const updatedSubVals = existingSubVals.filter(s => s.sub_id !== sub.id);
                                                                    updatedSubVals.push({ sub_id: sub.id, val: newVal });
                                                                    updateInput(req.id, 'sub_req_vals', updatedSubVals);
                                                                }}
                                                                className={`px-2 py-2 rounded-lg border text-[10px] font-bold transition-all ${subVal === option.value
                                                                    ? `${option.color} ring-2 ring-offset-1 ring-blue-500 shadow-sm`
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:bg-slate-50'
                                                                    }`}
                                                            >
                                                                <div className="truncate">{option.label}</div>
                                                                <div className="text-xs">{option.value}</div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {/* 2. Attestazione Cliente */}
                                        {req.attestazione_score > 0 && (
                                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100/50">
                                                <div className="flex justify-between items-center">
                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                        <input
                                                            type="checkbox"
                                                            checked={cur.attestazione_active || false}
                                                            onChange={(e) => updateInput(req.id, 'attestazione_active', e.target.checked)}
                                                            className="w-5 h-5 text-emerald-600 rounded border-emerald-300 focus:ring-emerald-500 transition-all cursor-pointer"
                                                        />
                                                        <div>
                                                            <span className="text-sm font-bold text-emerald-900 group-hover:text-emerald-700 block transition-colors">{t('tech_evaluator.attestazione_label')}</span>
                                                        </div>
                                                    </label>
                                                    <div className="text-right">
                                                        <div className="text-[10px] text-emerald-600 uppercase font-bold">{t('tech_evaluator.points_unit')}</div>
                                                        <div className="text-lg font-black text-emerald-600">+{cur.attestazione_active ? req.attestazione_score : 0}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 3. Voci Tabellari (Custom Metrics) */}
                                        {req.custom_metrics?.length > 0 && (
                                            <div className="space-y-3 pt-2 border-t border-slate-100">
                                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">{t('tech_evaluator.custom_metrics_section')}</h5>
                                                {req.custom_metrics.map(metric => {
                                                    const mVal = cur.custom_metric_vals?.[metric.id] ?? metric.min_score;
                                                    return (
                                                        <div key={metric.id} className="bg-slate-50 p-3 rounded-xl border border-slate-200/50 flex items-center justify-between gap-4">
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-sm font-semibold text-slate-700 block truncate" title={metric.label}>{metric.label}</span>
                                                                <span className="text-[10px] text-slate-500 font-medium">Range: {metric.min_score} - {metric.max_score}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <button
                                                                    onClick={() => {
                                                                        const prev = cur.custom_metric_vals || {};
                                                                        const val = Math.max(metric.min_score, (prev[metric.id] ?? metric.min_score) - 0.5);
                                                                        updateInput(req.id, 'custom_metric_vals', { ...prev, [metric.id]: val });
                                                                    }}
                                                                    className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-300 transition-all text-slate-500"
                                                                >
                                                                    <Minus className="w-4 h-4" />
                                                                </button>
                                                                <div className="w-16 text-center">
                                                                    <div className="text-sm font-black text-blue-700">{formatNumber(mVal, 1)}</div>
                                                                    <div className="text-[9px] font-bold text-slate-400 uppercase leading-none">{t('tech_evaluator.points_unit')}</div>
                                                                </div>
                                                                <button
                                                                    onClick={() => {
                                                                        const prev = cur.custom_metric_vals || {};
                                                                        const val = Math.min(metric.max_score, (prev[metric.id] ?? metric.min_score) + 0.5);
                                                                        updateInput(req.id, 'custom_metric_vals', { ...prev, [metric.id]: val });
                                                                    }}
                                                                    className="p-1.5 hover:bg-white rounded-lg border border-transparent hover:border-slate-300 transition-all text-slate-500"
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* 4. Legacy Bonus Flag - Hide if it contains Attestazione Cliente as requested */}
                                        {req.bonus_label && !req.bonus_label.includes("Attestazione Cliente") && (
                                            <label className="flex items-center gap-3 cursor-pointer group pt-2 border-t border-slate-100">
                                                <input
                                                    type="checkbox"
                                                    checked={cur.bonus_active}
                                                    onChange={(e) => updateInput(req.id, 'bonus_active', e.target.checked)}
                                                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                                                />
                                                <span className="text-sm text-slate-600 group-hover:text-slate-900 transition-colors font-medium">{req.bonus_label}</span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

        </div>
    );
}
