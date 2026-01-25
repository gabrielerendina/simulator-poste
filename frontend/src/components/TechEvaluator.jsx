import { useState } from 'react';
import { Check, Star, Info, ChevronDown, ChevronUp } from 'lucide-react';
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
        const cur = inputs[req.id] || { sub_req_vals: [] };
        return sum + (cur.sub_req_vals?.reduce((subSum, sv) =>
            subSum + (sv.val || 0) * ((req.sub_reqs || req.criteria)?.find(s => s.sub_id === sv.sub_id || s.id === sv.sub_id)?.weight || 1), 0) || 0);
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

                                    <div className="grid grid-cols-2 gap-8">
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
                                                    // If new R < current C, auto-adjust C
                                                    if (cur.c_val > newR) {
                                                        updateInput(req.id, 'c_val', Math.min(newR, maxC));
                                                    }
                                                    updateInput(req.id, 'r_val', newR);
                                                }}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <div className="text-[10px] text-slate-500 mt-1">Max configurato: {maxR}</div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between mb-1">
                                                <span className="text-xs font-semibold text-slate-600">{t('common.certificates')} (C)</span>
                                                <span className="text-xs font-bold">{cur.c_val} / {maxC}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={maxC}
                                                value={Math.min(cur.c_val, maxC)}
                                                onChange={(e) => updateInput(req.id, 'c_val', parseInt(e.target.value))}
                                                className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                                            />
                                            <div className="text-[10px] text-slate-500 mt-1">
                                                Max configurato: {maxC} {cur.r_val < maxC && `(limitato a ${cur.r_val} da R)`}
                                            </div>
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

                                <div className="space-y-4">
                                    {/* Sub-requirements / Criteria */}
                                    {(req.sub_reqs || req.criteria)?.map(sub => {
                                        const subVal = cur.sub_req_vals?.find(s => s.sub_id === sub.id)?.val ?? 0;
                                        const weight = sub.weight || 1;
                                        const contribution = weight * subVal;

                                        return (
                                            <div key={sub.id} className="border-l-2 border-blue-200 pl-4 pb-4">
                                                <div className="flex justify-between items-center mb-2">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-sm font-semibold text-slate-700">{sub.label}</span>
                                                        <span className="text-xs text-slate-500">Peso (Pe): <span className="font-mono font-bold">{weight}</span></span>
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="text-xs text-slate-500">Contributo (Pe × V)</div>
                                                        <div className="text-sm font-bold text-blue-600">{contribution.toFixed(2)}</div>
                                                    </div>
                                                </div>

                                                {/* Judgment Selection */}
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
                                                            className={`px-2 py-2 rounded border text-xs font-semibold transition-all ${subVal === option.value
                                                                ? `${option.color} ring-2 ring-offset-2 ring-current`
                                                                : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                                                                }`}
                                                        >
                                                            <div>{option.label}</div>
                                                            <div className="text-[10px] font-bold mt-1">{option.value}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {req.bonus_label && (
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
