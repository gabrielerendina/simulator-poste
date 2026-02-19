import { useState } from 'react';
import { Star, Info, ChevronDown, ChevronUp, Plus, Minus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../utils/formatters';
import { useConfig } from '../features/config/context/ConfigContext';
import { useSimulation } from '../features/simulation/context/SimulationContext';

export default function TechEvaluator() {
    const { t } = useTranslation();
    const { config } = useConfig();
    const {
        selectedLot,
        techInputs: inputs,
        companyCerts: certs,
        results,
        setTechInput,
        setCompanyCert
    } = useSimulation();

    // Derive lotData from context
    const lotData = config?.[selectedLot];
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
        const currentInput = inputs[reqId] || {};
        setTechInput(reqId, {
            ...currentInput,
            [field]: value
        });
    };

    const setCertStatus = (label, status) => {
        setCompanyCert(label, status);  // "all", "partial", "none"
    };

    // Guard clause - return early if no lotData
    if (!lotData) {
        return (
            <div className="glass-card rounded-lg p-6">
                <div className="animate-pulse">
                    <div className="h-6 bg-slate-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-slate-200 rounded w-1/2 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                </div>
            </div>
        );
    }

    // Dynamic Category Totals
    // Use backend-calculated values when available for consistency
    const maxCompanyCerts = results?.max_company_certs_raw ?? (lotData.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0);
    // Use backend-calculated max_raw_scores when available (respects max_points_manual)
    const maxProfCerts = lotData.reqs?.filter(r => r.type === 'resource').reduce((sum, r) => 
        sum + (results?.max_raw_scores?.[r.id] ?? r.max_points ?? 0), 0) || 0;
    const maxProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, r) => 
        sum + (results?.max_raw_scores?.[r.id] ?? r.max_points ?? 0), 0) || 0;

    // Calculate raw scores for each category
    // Use backend-calculated score for consistency
    const rawCompanyCerts = results?.company_certs_score ?? 0;


    const rawProfCerts = lotData.reqs?.filter(r => r.type === 'resource').reduce((sum, req) => {
        // Use backend-calculated score from results?.details instead of recalculating locally
        return sum + (results?.details?.[req.id] || 0);
    }, 0) || 0;

    const weightedProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, r) =>
        sum + (results?.details[r.id] || 0), 0) || 0;

    const rawProjectRefs = lotData.reqs?.filter(r => ['reference', 'project'].includes(r.type)).reduce((sum, req) => {
        const cur = inputs[req.id] || { sub_req_vals: [], bonus_active: false, attestazione_active: false, custom_metric_vals: {} };

        // 1. Sub-reqs/Criteria raw (WITH INTERNAL WEIGHTS)
        const subSum = cur.sub_req_vals?.reduce((subSum, sv) => {
            const sub = (req.sub_reqs || req.criteria || []).find(s => s.id === sv.sub_id);
            const weight = sub?.weight || 1;
            return subSum + ((sv.val || 0) * weight);
        }, 0) || 0;

        // 2. Attestazione Cliente raw
        const attSum = cur.attestazione_active ? (req.attestazione_score || 0) : 0;

        // 3. Custom Metrics raw
        const customSum = Object.entries(cur.custom_metric_vals || {}).reduce((cSum, [, mVal]) =>
            cSum + (parseFloat(mVal) || 0), 0);

        // 4. Legacy bonus raw
        const bonusSum = cur.bonus_active ? (req.bonus_val || 0) : 0;

        // Use max_points from config (already calculated with internal weights)
        const maxRaw = req.max_points || 0;

        // Final pts for this req (raw is capped at max_raw)
        const reqPts = Math.min(subSum + attSum + customSum + bonusSum, maxRaw);

        return sum + reqPts;
    }, 0) || 0;

    // Safety check
    if (!lotData || !Array.isArray(lotData.reqs)) {
        return (
            <div className="text-center text-red-500 font-bold p-8">
                {t('errors.lot_data_unavailable')}
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">

            {/* 1. Company Certifications */}
            <div className="glass-card rounded-xl overflow-hidden">
                <button
                    onClick={() => toggleSection('companyCerts')}
                    className="w-full px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 hover:bg-slate-100 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800">{t('dashboard.company_certs')}</h3>
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] font-bold text-slate-500">Raw: <span className="text-slate-700">{formatNumber(rawCompanyCerts, 2)} / {formatNumber(maxCompanyCerts, 2)}</span></span>
                                <span className="text-[10px] font-bold text-amber-600">Pesato: <span className="text-amber-700">{formatNumber(results?.category_company_certs || 0, 2)}</span></span>
                            </div>
                        </div>
                    </div>
                    {expandedSections.companyCerts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.companyCerts && (
                    <div className="p-6 space-y-3">
                        {lotData.company_certs && lotData.company_certs.length > 0 ? (
                            lotData.company_certs.map((cert) => {
                                const status = certs[cert.label] || "none";
                                const statusColor = status === "all" ? "text-green-600" : status === "partial" ? "text-amber-600" : "text-red-500";
                                const borderColor = status === "all" ? "border-green-300 bg-green-50" : status === "partial" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
                                
                                return (
                                    <div key={cert.label} className={`flex items-center justify-between gap-4 p-3 rounded-lg border ${borderColor} transition-all`}>
                                        <span className="text-sm font-medium text-slate-800 flex-1">{cert.label}</span>
                                        <select
                                            value={status}
                                            onChange={(e) => setCertStatus(cert.label, e.target.value)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-semibold border-0 outline-none cursor-pointer ${statusColor} bg-transparent`}
                                        >
                                            <option value="none" className="text-red-600">{t('tech.cert_absent')}</option>
                                            {(cert.points_partial > 0) && (
                                                <option value="partial" className="text-amber-600">{t('tech.cert_partial')}</option>
                                            )}
                                            <option value="all" className="text-green-600">{t('tech.cert_complete')}</option>
                                        </select>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="text-center py-4 text-slate-400 text-sm italic">
                                {t('config.no_certs')}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* 2. Professional Certs */}
            <div className="glass-card rounded-xl overflow-hidden">
                <button
                    onClick={() => toggleSection('profCerts')}
                    className="w-full px-6 py-4 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors flex justify-between items-center"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800">{t('tech.prof_certs')}</h3>
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] font-bold text-slate-500">Raw: <span className="text-slate-700">{formatNumber(rawProfCerts, 2)} / {formatNumber(maxProfCerts, 2)}</span></span>
                                <span className="text-[10px] font-bold text-amber-600">Pesato: <span className="text-amber-700">{formatNumber(results?.category_resource || 0, 2)}</span></span>
                            </div>
                        </div>
                    </div>
                    {expandedSections.profCerts ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.profCerts && (
                    <div className="p-6 space-y-6">
                        {lotData.reqs.filter(r => r.type === 'resource').length === 0 ? (
                            <div className="text-center text-slate-400 text-sm italic py-4">
                                ⚠️ {t('errors.no_prof_certs_configured')}
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
                                                        {t('tech.formula')}: (2 × R) + (R × C)
                                                    </span>
                                                </div>
                                                <p className="text-xs text-purple-600 font-semibold mb-1">
                                                    📋 {t('tech.config_required')}: R={maxR}, C={maxC} | Max {req.max_points}pt
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-blue-600">{formatNumber(pts, 2)}</span>
                                                <span className="text-xs text-slate-400"> / {formatNumber(req.max_points, 2)}</span>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
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
                                                <div className="text-[10px] text-slate-500 mt-1">{t('tech.max_configured')}: {maxR}</div>
                                            </div>

                                            <div className="bg-white p-4 rounded-lg border border-slate-200">
                                                <div className="flex justify-between items-center mb-4">
                                                    <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">{t('common.certificates')} (C)</span>
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${cur.c_val > cur.r_val ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                        {t('tech.total_c')}: {cur.c_val || 0}
                                                    </span>
                                                </div>

                                                <div className="space-y-3">
                                                    {req.selected_prof_certs && req.selected_prof_certs.length > 0 ? (
                                                        req.selected_prof_certs.map(cert => {
                                                            const count = (cur.cert_counts?.[cert]) || 0;
                                                            // cert_company_counts: { certName: { 'Lutech': 2, 'Partner': 1 } }
                                                            const companyCounts = cur.cert_company_counts?.[cert] || {};
                                                            const assignedTotal = Object.values(companyCounts).reduce((s, v) => s + v, 0);
                                                            const unassigned = count - assignedTotal;
                                                            
                                                            // RTI companies: Lutech always present, partners added if rti_enabled
                                                            const rtiCompanies = lotData?.rti_enabled 
                                                                ? ['Lutech', ...(lotData.rti_companies || [])] 
                                                                : ['Lutech'];

                                                            const updateCount = (delta) => {
                                                                const counts = { ...(cur.cert_counts || {}) };
                                                                const newVal = Math.max(0, count + delta);
                                                                counts[cert] = newVal;

                                                                const newTotalC = req.selected_prof_certs.reduce((s, c) => s + (counts[c] || 0), 0);
                                                                const currentInput = inputs[req.id] || {};
                                                                
                                                                // If reducing count, also reduce company counts proportionally
                                                                let newCompanyCounts = { ...(currentInput.cert_company_counts || {}) };
                                                                if (delta < 0 && newCompanyCounts[cert]) {
                                                                    const certCompCounts = { ...newCompanyCounts[cert] };
                                                                    const currentAssigned = Object.values(certCompCounts).reduce((s, v) => s + v, 0);
                                                                    if (currentAssigned > newVal) {
                                                                        // Need to reduce company counts
                                                                        const excess = currentAssigned - newVal;
                                                                        let toReduce = excess;
                                                                        // Reduce from each company proportionally
                                                                        Object.keys(certCompCounts).forEach(comp => {
                                                                            if (toReduce > 0 && certCompCounts[comp] > 0) {
                                                                                const reduce = Math.min(certCompCounts[comp], toReduce);
                                                                                certCompCounts[comp] -= reduce;
                                                                                toReduce -= reduce;
                                                                            }
                                                                        });
                                                                        newCompanyCounts[cert] = certCompCounts;
                                                                    }
                                                                }
                                                                
                                                                setTechInput(req.id, {
                                                                    ...currentInput,
                                                                    cert_counts: counts,
                                                                    cert_company_counts: newCompanyCounts,
                                                                    c_val: newTotalC
                                                                });
                                                            };

                                                            const updateCompanyCount = (company, delta) => {
                                                                const currentInput = inputs[req.id] || {};
                                                                const allCompanyCounts = { ...(currentInput.cert_company_counts || {}) };
                                                                const certCompCounts = { ...(allCompanyCounts[cert] || {}) };
                                                                const currentVal = certCompCounts[company] || 0;
                                                                const currentAssigned = Object.values(certCompCounts).reduce((s, v) => s + v, 0);
                                                                
                                                                // Calculate new value with constraints
                                                                let newVal = currentVal + delta;
                                                                newVal = Math.max(0, newVal); // Can't go below 0
                                                                newVal = Math.min(newVal, count - (currentAssigned - currentVal)); // Can't exceed total count
                                                                
                                                                certCompCounts[company] = newVal;
                                                                allCompanyCounts[cert] = certCompCounts;
                                                                
                                                                setTechInput(req.id, {
                                                                    ...currentInput,
                                                                    cert_company_counts: allCompanyCounts
                                                                });
                                                            };

                                                            return (
                                                                <div key={cert} className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                                                                    <div className="flex items-center justify-between mb-2">
                                                                        <span className="text-[11px] font-semibold text-slate-700 truncate mr-2" title={cert}>{cert}</span>
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <button
                                                                                onClick={() => updateCount(-1)}
                                                                                className="p-2.5 min-w-[40px] min-h-[40px] rounded-md hover:bg-slate-200 active:bg-slate-300 text-slate-500 transition-colors flex items-center justify-center"
                                                                                aria-label={t('common.decrease')}
                                                                            >
                                                                                <Minus className="w-4 h-4" />
                                                                            </button>
                                                                            <input
                                                                                type="number"
                                                                                min="0"
                                                                                value={count}
                                                                                onChange={(e) => {
                                                                                    const val = Math.min(maxC, Math.max(0, parseInt(e.target.value) || 0));
                                                                                    const counts = { ...(cur.cert_counts || {}) };
                                                                                    counts[cert] = val;
                                                                                    const newTotalC = req.selected_prof_certs.reduce((s, c) => s + (counts[c] || 0), 0);
                                                                                    const currentInput = inputs[req.id] || {};
                                                                                    setTechInput(req.id, {
                                                                                        ...currentInput,
                                                                                        cert_counts: counts,
                                                                                        c_val: newTotalC
                                                                                    });
                                                                                }}
                                                                                className="w-12 text-center bg-white border border-slate-200 rounded text-sm font-bold py-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                            />
                                                                            <button
                                                                                onClick={() => updateCount(1)}
                                                                                className="p-2.5 min-w-[40px] min-h-[40px] rounded-md hover:bg-slate-200 active:bg-slate-300 text-slate-500 transition-colors flex items-center justify-center"
                                                                                aria-label={t('common.increase')}
                                                                            >
                                                                                <Plus className="w-4 h-4" />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {/* Per-company assignment with counters */}
                                                                    {count > 0 && rtiCompanies.length > 1 && (
                                                                        <div className="mt-2 pt-2 border-t border-slate-200">
                                                                            <div className="flex justify-between items-center mb-2">
                                                                                <span className="text-[9px] font-bold text-slate-500 uppercase">{t('tech.company_assignment')}</span>
                                                                                {unassigned > 0 && (
                                                                                    <span className="text-[9px] font-bold text-amber-600">{t('tech.unassigned')}: {unassigned}</span>
                                                                                )}
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                {rtiCompanies.map(company => {
                                                                                    const compCount = companyCounts[company] || 0;
                                                                                    return (
                                                                                        <div key={company} className="flex items-center justify-between bg-white rounded px-2 py-1 border border-slate-100">
                                                                                            <span className="text-[10px] font-medium text-slate-600">{company}</span>
                                                                                            <div className="flex items-center gap-1">
                                                                                                <button
                                                                                                    onClick={() => updateCompanyCount(company, -1)}
                                                                                                    disabled={compCount === 0}
                                                                                                    className="p-1 rounded hover:bg-slate-100 active:bg-slate-200 text-slate-400 disabled:opacity-30 transition-colors"
                                                                                                >
                                                                                                    <Minus className="w-3 h-3" />
                                                                                                </button>
                                                                                                <span className={`w-6 text-center text-[11px] font-bold ${compCount > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>
                                                                                                    {compCount}
                                                                                                </span>
                                                                                                <button
                                                                                                    onClick={() => updateCompanyCount(company, 1)}
                                                                                                    disabled={unassigned === 0}
                                                                                                    className="p-1 rounded hover:bg-slate-100 active:bg-slate-200 text-slate-400 disabled:opacity-30 transition-colors"
                                                                                                >
                                                                                                    <Plus className="w-3 h-3" />
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="text-[10px] text-slate-400 italic text-center py-2">
                                                            {t('tech.no_certs_selected')}
                                                        </div>
                                                    )}
                                                </div>

                                                {(!req.selected_prof_certs || req.selected_prof_certs.length === 0) && (
                                                    <div className="mt-4 pt-3 border-t border-slate-100">
                                                        <div className="flex justify-between mb-1">
                                                            <span className="text-xs font-semibold text-slate-500">{t('tech.manual_adjustment')} C</span>
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
                                                            <b>{t('common.warning')}:</b> {t('tech.certs_exceed_resources', { c: cur.c_val, r: cur.r_val })}
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
            <div className="glass-card rounded-xl overflow-hidden">
                <button
                    onClick={() => toggleSection('projectRefs')}
                    className="w-full px-6 py-4 border-b border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors flex justify-between items-center"
                >
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-800 text-left">{t('tech.project_refs')}</h3>
                            <div className="flex gap-3 mt-1">
                                <span className="text-[10px] font-bold text-slate-500">Raw: <span className="text-slate-700">{formatNumber(rawProjectRefs, 2)} / {formatNumber(maxProjectRefs, 2)}</span></span>
                                <span className="text-[10px] font-bold text-amber-600">Pesato: <span className="text-amber-700">{formatNumber(results?.category_reference !== undefined && results?.category_project !== undefined ? (results.category_reference + results.category_project) : weightedProjectRefs, 2)}</span></span>
                            </div>
                        </div>
                    </div>
                    {expandedSections.projectRefs ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </button>
                {expandedSections.projectRefs && (
                    <div className="divide-y divide-slate-100">
                        {lotData.reqs.filter(r => ['reference', 'project'].includes(r.type)).map(req => {
                            const cur = inputs[req.id] || { qual_val: 'Adeguato', bonus_active: false };
                            const pts = results?.details[req.id] || 0;

                            // Function to build judgement options from criterion's levels
                            const getJudgementOptions = (criterion) => {
                                const levels = criterion?.judgement_levels;
                                if (levels) {
                                    return [
                                        { value: levels.assente_inadeguato ?? 0, label: "Assente/Inadeguato", color: "bg-red-100 border-red-300 text-red-800" },
                                        { value: levels.parzialmente_adeguato ?? 2, label: "Parzialmente adeguato", color: "bg-orange-100 border-orange-300 text-orange-800" },
                                        { value: levels.adeguato ?? 3, label: "Adeguato", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
                                        { value: levels.piu_che_adeguato ?? 4, label: "Più che adeguato", color: "bg-lime-100 border-lime-300 text-lime-800" },
                                        { value: levels.ottimo ?? 5, label: "Ottimo", color: "bg-green-100 border-green-300 text-green-800" }
                                    ];
                                }
                                // Default values for backwards compatibility
                                return [
                                    { value: 0, label: "Assente/Inadeguato", color: "bg-red-100 border-red-300 text-red-800" },
                                    { value: 2, label: "Parzialmente adeguato", color: "bg-orange-100 border-orange-300 text-orange-800" },
                                    { value: 3, label: "Adeguato", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
                                    { value: 4, label: "Più che adeguato", color: "bg-lime-100 border-lime-300 text-lime-800" },
                                    { value: 5, label: "Ottimo", color: "bg-green-100 border-green-300 text-green-800" }
                                ];
                            };

                            // Calculate raw score for this requirement (WITH INTERNAL WEIGHTS)
                            const reqRawScore = (() => {
                                // Apply internal weights to sub-requirement values
                                const subSum = cur.sub_req_vals?.reduce((subSum, sv) => {
                                    const sub = (req.sub_reqs || req.criteria || []).find(s => s.id === sv.sub_id);
                                    const weight = sub?.weight || 1;
                                    return subSum + ((sv.val || 0) * weight);
                                }, 0) || 0;

                                const attSum = cur.attestazione_active ? (req.attestazione_score || 0) : 0;
                                const customSum = Object.entries(cur.custom_metric_vals || {}).reduce((cSum, [, mVal]) =>
                                    cSum + (parseFloat(mVal) || 0), 0);
                                const bonusSum = cur.bonus_active ? (req.bonus_val || 0) : 0;

                                // Use max_points from config (already calculated with internal weights)
                                const maxRaw = req.max_points || 0;

                                return Math.min(subSum + attSum + customSum + bonusSum, maxRaw);
                            })();

                            const reqWeightedScore = results?.weighted_scores?.[req.id] || 0;
                            // RTI companies: Lutech always present, partners added if rti_enabled
                            const rtiCompanies = lotData?.rti_enabled 
                                ? ['Lutech', ...(lotData.rti_companies || [])] 
                                : ['Lutech'];
                            const assignedCompany = cur.assigned_company || '';

                            const setAssignedCompany = (company) => {
                                const currentInput = inputs[req.id] || {};
                                setTechInput(req.id, {
                                    ...currentInput,
                                    assigned_company: company
                                });
                            };

                            return (
                                <div key={req.id} className="p-6 hover:bg-slate-50 transition-colors">
                                    <div className="flex justify-between mb-4">
                                        <div>
                                            <h4 className="font-medium text-slate-900 flex items-center gap-2">
                                                <Star className="w-4 h-4 text-orange-400 fill-orange-400" />
                                                {req.label}
                                            </h4>
                                            <div className="flex gap-3 mt-1">
                                                <span className="text-[10px] font-bold text-slate-500">Raw: <span className="text-slate-700">{formatNumber(reqRawScore, 2)} / {formatNumber(req.max_points, 2)}</span></span>
                                                <span className="text-[10px] font-bold text-amber-600">Pesato: <span className="text-amber-700">{formatNumber(reqWeightedScore, 2)} / {formatNumber(req.gara_weight || 0, 2)}</span></span>
                                            </div>
                                            {/* Company assignment for project/reference */}
                                            {rtiCompanies.length > 1 && (
                                                <div className="flex items-center gap-2 mt-2">
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">{t('tech.assigned_company')}:</span>
                                                    <select
                                                        value={assignedCompany}
                                                        onChange={(e) => setAssignedCompany(e.target.value)}
                                                        className="text-xs px-2 py-1 border border-slate-200 rounded bg-white text-slate-700 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                    >
                                                        <option value="">{t('common.select')}</option>
                                                        {rtiCompanies.map(company => (
                                                            <option key={company} value={company}>{company}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </div>
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
                                                            <div className="flex gap-3">
                                                                <span className="text-xs text-slate-500">Raw: <span className="font-mono font-bold text-slate-700">{subVal}</span></span>
                                                                <span className="text-xs text-slate-500">Peso: <span className="font-mono font-bold text-blue-600">×{weight}</span></span>
                                                                <span className="text-xs text-amber-600">Pesato: <span className="font-mono font-bold text-amber-700">{contribution.toFixed(2)}</span></span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                                        {getJudgementOptions(sub).map(option => (
                                                            <button
                                                                key={option.value}
                                                                onClick={() => {
                                                                    const newVal = option.value;
                                                                    const existingSubVals = cur.sub_req_vals || [];
                                                                    const updatedSubVals = existingSubVals.filter(s => s.sub_id !== sub.id);
                                                                    updatedSubVals.push({ sub_id: sub.id, val: newVal });
                                                                    updateInput(req.id, 'sub_req_vals', updatedSubVals);
                                                                }}
                                                                className={`px-2 py-3 min-h-[44px] rounded-lg border text-xs sm:text-[10px] font-bold transition-all ${subVal === option.value
                                                                    ? `${option.color} ring-2 ring-offset-1 ring-blue-500 shadow-sm`
                                                                    : 'bg-white border-slate-200 text-slate-500 hover:border-blue-400 hover:bg-slate-50 active:bg-slate-100'
                                                                    }`}
                                                                aria-pressed={subVal === option.value}
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
                                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                                                <div className="flex justify-between items-center">
                                                    <label className="flex items-center gap-3 cursor-pointer group">
                                                        <div className="relative">
                                                            <input
                                                                type="checkbox"
                                                                checked={cur.attestazione_active || false}
                                                                onChange={(e) => updateInput(req.id, 'attestazione_active', e.target.checked)}
                                                                className="sr-only"
                                                            />
                                                            <div className={`w-6 h-6 border-2 rounded flex items-center justify-center transition-all ${cur.attestazione_active ? 'bg-emerald-500 border-emerald-600' : 'bg-white border-emerald-500'}`}>
                                                                {cur.attestazione_active && (
                                                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                )}
                                                            </div>
                                                        </div>
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
                                                                    className="p-2 min-w-[40px] min-h-[40px] hover:bg-white rounded-lg border border-transparent hover:border-slate-300 active:bg-slate-100 transition-all text-slate-500 flex items-center justify-center"
                                                                    aria-label={t('common.decrease')}
                                                                >
                                                                    <Minus className="w-5 h-5" />
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
                                                                    className="p-2 min-w-[40px] min-h-[40px] hover:bg-white rounded-lg border border-transparent hover:border-slate-300 active:bg-slate-100 transition-all text-slate-500 flex items-center justify-center"
                                                                    aria-label={t('common.increase')}
                                                                >
                                                                    <Plus className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* 4. Legacy Bonus Flag - Hide if it contains Attestazione/Att./Volumi (migrated to attestazione_score/custom_metrics) */}
                                        {req.bonus_label &&
                                         !req.bonus_label.includes("Attestazione Cliente") &&
                                         !req.bonus_label.includes("Att.") &&
                                         !req.bonus_label.includes("Volumi") && (
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
