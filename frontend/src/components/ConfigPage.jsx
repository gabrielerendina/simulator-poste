import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../utils/formatters';
import { Save, Plus, Trash2, Settings2, Building2, Users, DollarSign, Briefcase, FileCheck, Award, Info, TrendingUp, Search, X } from 'lucide-react';
import LotSelector from '../features/config/components/LotSelector';
import CompanyCertsEditor from '../features/config/components/CompanyCertsEditor';

export default function ConfigPage({ config, masterData, onSave, onAddLot, onDeleteLot, onBack }) {
    const { t } = useTranslation();
    const [editedConfig, setEditedConfig] = useState(JSON.parse(JSON.stringify(config)));
    const [selectedLot, setSelectedLot] = useState(Object.keys(editedConfig)[0] || "");
    const [activeTab, setActiveTab] = useState('resource');
    const [certSearch, setCertSearch] = useState('');

    // Sync editedConfig if parent config changes (e.g. after onAddLot)
    useEffect(() => {
        setEditedConfig(JSON.parse(JSON.stringify(config)));
        // If we just added a lot, it might not be the selected one yet
        // but App.jsx usually handles the selection change
    }, [config]);

    // For formatted display of Euro values
    const [displayBase, setDisplayBase] = useState("");

    const currentLot = editedConfig[selectedLot] || { name: "", base_amount: 0, max_tech_score: 60, max_econ_score: 40, max_raw_score: 100, reqs: [], company_certs: [] };

    // Prefill data for suggestions from Master Data
    const knownCerts = masterData?.company_certs || [];
    const knownLabels = masterData?.requirement_labels || [];
    const knownProfCerts = masterData?.prof_certs || [];

    useEffect(() => {
        if (currentLot.base_amount) {
            setDisplayBase(formatNumber(currentLot.base_amount, 2));
        }
    }, [selectedLot]);

    // Auto-calculate Raw Score & Sync Individual Max Points
    useEffect(() => {
        if (!currentLot) return;

        // 1. Sync individual req max points
        let changed = false;
        currentLot.reqs?.forEach(r => {
            const oldMax = r.max_points;
            syncRequirementMaxPoints(r);
            if (oldMax !== r.max_points) changed = true;
        });

        // 2. Calculate lot total
        const reqsTotal = currentLot.reqs?.reduce((sum, r) => sum + (r.max_points || 0), 0) || 0;
        const certsTotal = currentLot.company_certs?.reduce((sum, c) => sum + (c.points || 0), 0) || 0;
        const total = reqsTotal + certsTotal;

        if (currentLot.max_raw_score !== total || changed) {
            currentLot.max_raw_score = total;
            setEditedConfig({ ...editedConfig });
        }
    }, [currentLot.reqs, currentLot.company_certs, selectedLot]);

    const syncRequirementMaxPoints = (req) => {
        if (req.type === 'resource') {
            const R = Math.max(0, parseInt(req.prof_R) || 0);
            const C = Math.min(R, Math.max(0, parseInt(req.prof_C) || 0));
            req.max_points = (2 * R) + (R * C);
        } else if (req.type === 'reference' || req.type === 'project') {
            const subSum = (req.sub_reqs?.reduce((s, r) => s + (parseFloat(r.weight) || 0), 0) || 0) * 5;
            const attSum = parseFloat(req.attestazione_score) || 0;
            const customSum = req.custom_metrics?.reduce((s, m) => s + (parseFloat(m.max_score) || 0), 0) || 0;
            req.max_points = subSum + attSum + customSum;
        }
    };

    const addRequirement = (type) => {
        const newReq = {
            id: "",
            label: t('config.new_requirement'),
            max_points: 0,
            type,
            ...(type === 'resource' && { prof_R: 1, prof_C: 1, selected_prof_certs: [] }),
            ...(type === 'reference' && { sub_reqs: [{ id: 'a', label: `${t('tech.criteria')} 1`, weight: 1.0 }], attestazione_score: 0, custom_metrics: [] }),
            ...(type === 'project' && { sub_reqs: [{ id: 'a', label: `${t('tech.criteria')} 1`, weight: 1.0 }], attestazione_score: 0, custom_metrics: [] })
        };
        syncRequirementMaxPoints(newReq);
        currentLot.reqs.push(newReq);
        setEditedConfig({ ...editedConfig });
    };

    const deleteRequirement = (reqId) => {
        currentLot.reqs = currentLot.reqs.filter(r => r.id !== reqId);
        setEditedConfig({ ...editedConfig });
    };

    const updateRequirement = (reqId, field, value) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req) {
            req[field] = value;
            syncRequirementMaxPoints(req);
            setEditedConfig({ ...editedConfig });
        }
    };

    const addSubReq = (reqId) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req) {
            if (!req.sub_reqs) req.sub_reqs = [];
            const newId = String.fromCharCode(97 + req.sub_reqs.length); // a, b, c...
            req.sub_reqs.push({ id: newId, label: t('tech.criteria') + ' ' + (req.sub_reqs.length + 1), weight: 1.0 });
            syncRequirementMaxPoints(req);
            setEditedConfig({ ...editedConfig });
        }
    };

    const updateSubReq = (reqId, subId, field, value) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req && req.sub_reqs) {
            const sub = req.sub_reqs.find(s => s.id === subId);
            if (sub) {
                sub[field] = value;
                syncRequirementMaxPoints(req);
                setEditedConfig({ ...editedConfig });
            }
        }
    };

    const deleteSubReq = (reqId, subId) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req && req.sub_reqs) {
            req.sub_reqs = req.sub_reqs.filter(s => s.id !== subId);
            syncRequirementMaxPoints(req);
            setEditedConfig({ ...editedConfig });
        }
    };

    const addCustomMetric = (reqId) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req) {
            if (!req.custom_metrics) req.custom_metrics = [];
            const newId = `M${req.custom_metrics.length + 1}`;
            req.custom_metrics.push({ id: newId, label: 'Nuova Voce Tabellare', min_score: 0.0, max_score: 5.0 });
            syncRequirementMaxPoints(req);
            setEditedConfig({ ...editedConfig });
        }
    };

    const updateCustomMetric = (reqId, metricId, field, value) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req && req.custom_metrics) {
            const metric = req.custom_metrics.find(m => m.id === metricId);
            if (metric) {
                metric[field] = value;
                syncRequirementMaxPoints(req);
                setEditedConfig({ ...editedConfig });
            }
        }
    };

    const deleteCustomMetric = (reqId, metricId) => {
        const req = currentLot.reqs.find(r => r.id === reqId);
        if (req && req.custom_metrics) {
            req.custom_metrics = req.custom_metrics.filter(m => m.id !== metricId);
            syncRequirementMaxPoints(req);
            setEditedConfig({ ...editedConfig });
        }
    };

    // Calculate professional certification score using formula: P = (2 * R) + (R * C)
    const calculateProfCertScore = (R, C) => {
        if (!R || !C) return 0;
        R = Math.max(0, parseInt(R) || 0);
        C = Math.max(0, parseInt(C) || 0);
        // Enforce constraint: C must be <= R
        if (C > R) C = R;
        return (2 * R) + (R * C);
    };

    const addCompanyCert = () => {
        if (!currentLot.company_certs) currentLot.company_certs = [];
        // Use first available cert as default if possible, or empty string
        const defaultLabel = knownCerts.length > 0 ? knownCerts[0] : "";
        currentLot.company_certs.push({ label: defaultLabel, points: 2.0 });
        setEditedConfig({ ...editedConfig });
    };
    const updateCompanyCert = (idx, label) => {
        currentLot.company_certs[idx].label = label;
        setEditedConfig({ ...editedConfig });
    };
    const updateCompanyCertPoints = (idx, pts) => {
        currentLot.company_certs[idx].points = pts;
        setEditedConfig({ ...editedConfig });
    };
    const deleteCompanyCert = (idx) => {
        currentLot.company_certs.splice(idx, 1);
        setEditedConfig({ ...editedConfig });
    };

    const filteredReqs = currentLot.reqs?.filter(r => r.type === activeTab) || [];

    if (!selectedLot || !currentLot) return <div className="p-10 text-center">{t('config.no_config')}</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-6 overflow-auto pb-32">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('config.title')}</h1>
                        <p className="text-slate-500">{t('config.subtitle')}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onBack}
                            className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={() => onSave(editedConfig)}
                            className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 shadow-sm text-sm font-medium"
                        >
                            <Save className="w-4 h-4" />
                            {t('config.save_all')}
                        </button>
                    </div>
                </div>

                {/* Gara/Lotto Selector & Metadata */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <LotSelector
                        config={editedConfig}
                        selectedLot={selectedLot}
                        onSelectLot={setSelectedLot}
                        onAddLot={onAddLot}
                        onDeleteLot={onDeleteLot}
                    />

                    {/* Datalists for suggestions from Master Data */}
                    <datalist id="known-certs">
                        {knownCerts.map(c => <option key={c} value={c} />)}
                    </datalist>
                    <datalist id="known-labels">
                        {knownLabels.map(l => <option key={l} value={l} />)}
                    </datalist>
                    <datalist id="known-prof-certs">
                        {knownProfCerts.map(l => <option key={l} value={l} />)}
                    </datalist>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('config.lot_name')}</label>
                            <input
                                type="text"
                                value={currentLot.name}
                                onChange={(e) => {
                                    currentLot.name = e.target.value;
                                    setEditedConfig({ ...editedConfig });
                                }}
                                className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('config.base_amount')}</label>
                            <input
                                type="text"
                                value={displayBase}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/\./g, '').replace(',', '.');
                                    setDisplayBase(e.target.value);
                                    if (!isNaN(parseFloat(raw))) {
                                        currentLot.base_amount = parseFloat(raw);
                                        setEditedConfig({ ...editedConfig });
                                    }
                                }}
                                onBlur={() => setDisplayBase(formatNumber(currentLot.base_amount, 2))}
                                className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono text-right text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('config.max_tech_score')}</label>
                            <input
                                type="number"
                                min="0"
                                value={currentLot.max_tech_score || 60}
                                onChange={(e) => {
                                    currentLot.max_tech_score = Math.max(0, parseFloat(e.target.value) || 0);
                                    setEditedConfig({ ...editedConfig });
                                }}
                                className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">{t('config.max_econ_score')}</label>
                            <input
                                type="number"
                                min="0"
                                value={currentLot.max_econ_score || 40}
                                onChange={(e) => {
                                    currentLot.max_econ_score = Math.max(0, parseFloat(e.target.value) || 0);
                                    setEditedConfig({ ...editedConfig });
                                }}
                                className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                            />
                        </div>
                        <div>
                            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
                                {t('config.max_raw_score')}
                                <div className="group relative">
                                    <Info className="w-3.5 h-3.5 text-slate-400 cursor-help" />
                                    <div
                                        className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-slate-800 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 font-normal normal-case"
                                    >
                                        {t('config.max_raw_tooltip')}
                                    </div>
                                </div>
                            </label>
                            <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600 font-mono text-sm">
                                {currentLot.max_raw_score || 0}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Company Certifications */}
                <CompanyCertsEditor
                    companyCerts={currentLot.company_certs}
                    knownCerts={knownCerts}
                    onAdd={addCompanyCert}
                    onUpdate={updateCompanyCert}
                    onUpdatePoints={updateCompanyCertPoints}
                    onDelete={deleteCompanyCert}
                />

                {/* Economic Formula */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp className="w-5 h-5 text-amber-600" />
                        <h2 className="text-lg font-semibold text-slate-800">Formula Scoring Economico</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Alpha */}
                            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                                <label className="block text-xs font-bold text-green-700 uppercase mb-2 tracking-wider">Coefficiente Alpha (α)</label>
                                <input
                                    type="number"
                                    step="0.05"
                                    min="0"
                                    max="1"
                                    value={currentLot.alpha || 0.3}
                                    onChange={(e) => {
                                        currentLot.alpha = parseFloat(e.target.value);
                                        setEditedConfig({ ...editedConfig });
                                    }}
                                    className="w-full p-2 border border-green-300 bg-white rounded-lg focus:ring-2 focus:ring-green-500 outline-none font-bold text-lg text-green-700"
                                />
                            </div>

                            {/* Max Economic Score */}
                            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                                <label className="block text-xs font-bold text-amber-700 uppercase mb-2 tracking-wider">Punteggio Massimo</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={currentLot.max_econ_score || 40}
                                    onChange={(e) => {
                                        currentLot.max_econ_score = Math.max(0, parseFloat(e.target.value) || 0);
                                        setEditedConfig({ ...editedConfig });
                                    }}
                                    className="w-full p-2 border border-amber-300 bg-white rounded-lg focus:ring-2 focus:ring-amber-500 outline-none font-bold text-lg text-amber-700"
                                />
                            </div>

                            {/* Formula Selection */}
                            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                <label className="block text-xs font-bold text-blue-700 uppercase mb-2 tracking-wider">Tipo Formula</label>
                                <select
                                    className="w-full p-2 border border-blue-300 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-sm text-blue-700"
                                    value={currentLot.economic_formula || 'interp_alpha'}
                                    onChange={(e) => {
                                        currentLot.economic_formula = e.target.value;
                                        setEditedConfig({ ...editedConfig });
                                    }}
                                >
                                    {masterData?.economic_formulas?.map(f => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Formula Display with Dynamic Values */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                            <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 tracking-wider">📐 Formula Dinamica</h3>
                            <div className="bg-white rounded-lg p-4 border border-slate-200 font-mono text-sm text-slate-800 leading-relaxed space-y-3">
                                {(() => {
                                    const formula = masterData?.economic_formulas?.find(f => f.id === (currentLot.economic_formula || 'interp_alpha'))?.desc || 'Formula non definita';
                                    const alpha = (currentLot.alpha || 0.3).toFixed(2);
                                    const maxEcon = (currentLot.max_econ_score || 40).toFixed(1);

                                    const updatedFormula = formula
                                        .replace(/\\alpha/g, `(${alpha})`)
                                        .replace(/P\\_{.*?max.*?}/g, `(${maxEcon})`);

                                    return (
                                        <>
                                            <div>
                                                <div className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">Formula Base:</div>
                                                <div className="text-slate-600 font-mono text-xs">{formula}</div>
                                            </div>
                                            {formula !== updatedFormula && (
                                                <>
                                                    <div className="border-t border-slate-200 my-3"></div>
                                                    <div>
                                                        <div className="text-xs font-bold text-blue-700 uppercase mb-2 tracking-wider">Con i Tuoi Valori:</div>
                                                        <div className="text-blue-700 font-bold text-base bg-blue-50 p-3 rounded border border-blue-200">{updatedFormula}</div>
                                                    </div>
                                                </>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Requirements with Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center gap-2 mb-6">
                        <Award className="w-5 h-5 text-slate-500" />
                        <h2 className="text-lg font-semibold text-slate-800">Requisiti Tecnici</h2>
                    </div>

                    <div className="flex gap-2 mb-6 border-b border-slate-200">
                        <button
                            onClick={() => setActiveTab('resource')}
                            className={`px-4 py-2 font-semibold text-sm transition-colors -mb-px border-b-2 ${activeTab === 'resource' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <Award className="w-4 h-4 inline mr-2" />
                            {t('tech.prof_certs')}
                        </button>
                        <button
                            onClick={() => setActiveTab('reference')}
                            className={`px-4 py-2 font-semibold text-sm transition-colors -mb-px border-b-2 ${activeTab === 'reference' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <FileCheck className="w-4 h-4 inline mr-2" />
                            {t('tech.references')}
                        </button>
                        <button
                            onClick={() => setActiveTab('project')}
                            className={`px-4 py-2 font-semibold text-sm transition-colors -mb-px border-b-2 ${activeTab === 'project' ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        >
                            <Briefcase className="w-4 h-4 inline mr-2" />
                            {t('tech.projects')}
                        </button>
                    </div>

                    <div className="mb-4">
                        <button
                            onClick={() => addRequirement(activeTab)}
                            className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Plus className="w-4 h-4" />
                            {t('common.add')} {activeTab === 'resource' ? t('config.new_certification') : activeTab === 'reference' ? t('config.new_reference') : t('config.new_project')}
                        </button>
                    </div>

                    <div className="space-y-4">
                        {filteredReqs.length > 0 ? (
                            filteredReqs.map((req) => (
                                <div key={req.id} className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex-1">
                                            <p className="text-xs text-slate-500 font-bold uppercase mb-1">{t('config.label')}</p>
                                            <input
                                                type="text"
                                                value={req.label}
                                                list="known-labels"
                                                onChange={(e) => updateRequirement(req.id, 'label', e.target.value)}
                                                className="font-semibold text-slate-800 bg-white border border-slate-200 rounded p-1 focus:ring-2 focus:ring-blue-500 outline-none w-full"
                                            />
                                            <div className="mt-2">
                                                <p className="text-[10px] text-slate-500 font-bold uppercase mb-1">{t('config.id')}</p>
                                                <input
                                                    type="text"
                                                    value={req.id}
                                                    placeholder="E.g. REQ_01"
                                                    onChange={(e) => updateRequirement(req.id, 'id', e.target.value)}
                                                    className="font-mono text-[11px] text-slate-600 bg-white border border-slate-200 rounded p-1 focus:ring-2 focus:ring-blue-500 outline-none w-full max-w-xs"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteRequirement(req.id)}
                                            className="text-slate-400 hover:text-red-600 hover:bg-red-100 p-2 rounded transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Professional Certification Configuration */}
                                    {req.type === 'resource' && (
                                        <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                                            <div className="mb-3">
                                                <h4 className="font-semibold text-purple-800 text-sm mb-1">Certificazioni Professionali</h4>
                                                <p className="text-xs text-purple-600">
                                                    P = (2 × R) + (R × C), dove R ≥ C
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-purple-700 mb-1">R - Risorse</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={req.prof_R || 1}
                                                        onChange={(e) => {
                                                            const newR = parseInt(e.target.value) || 1;
                                                            const newC = req.prof_C || 1;
                                                            if (newC > newR) {
                                                                updateRequirement(req.id, 'prof_C', newR);
                                                            }
                                                            updateRequirement(req.id, 'prof_R', newR);
                                                            const score = calculateProfCertScore(newR, newC > newR ? newR : newC);
                                                            updateRequirement(req.id, 'max_points', score);
                                                        }}
                                                        className="w-full p-2 border border-purple-200 bg-white rounded text-sm font-bold text-center focus:ring-2 focus:ring-purple-500 outline-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-purple-700 mb-1">C - Certificati</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={req.prof_C || 1}
                                                        max={req.prof_R || 10}
                                                        onChange={(e) => {
                                                            const newC = parseInt(e.target.value) || 1;
                                                            const newR = req.prof_R || 1;
                                                            if (newC > newR) {
                                                                updateRequirement(req.id, 'prof_C', newR);
                                                                const score = calculateProfCertScore(newR, newR);
                                                                updateRequirement(req.id, 'max_points', score);
                                                            } else {
                                                                updateRequirement(req.id, 'prof_C', newC);
                                                                const score = calculateProfCertScore(newR, newC);
                                                                updateRequirement(req.id, 'max_points', score);
                                                            }
                                                        }}
                                                        className="w-full p-2 border border-purple-200 bg-white rounded text-sm font-bold text-center focus:ring-2 focus:ring-purple-500 outline-none"
                                                    />
                                                </div>

                                                <div className="bg-white p-2 rounded border border-purple-200 text-center">
                                                    <div className="text-xs font-medium text-purple-700 mb-1">Punteggio Max</div>
                                                    <div className="text-2xl font-bold text-purple-600">
                                                        {calculateProfCertScore(req.prof_R || 1, Math.min(req.prof_C || 1, req.prof_R || 1))}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Certification Selection */}
                                            <div className="border-t border-purple-100 pt-3">
                                                <div className="flex justify-between items-center mb-2">
                                                    <h5 className="text-[10px] font-bold text-purple-700 uppercase tracking-widest">{t('config.selected_certs')}</h5>
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${req.selected_prof_certs?.length === (req.prof_C || 1) ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                                                        {req.selected_prof_certs?.length || 0} / {req.prof_C || 1}
                                                    </span>
                                                </div>

                                                {/* Selected Chips */}
                                                <div className="flex flex-wrap gap-1.5 mb-3">
                                                    {req.selected_prof_certs?.map(cert => (
                                                        <span key={cert} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-600 text-white text-[10px] font-bold rounded-full group">
                                                            {cert}
                                                            <button
                                                                onClick={() => {
                                                                    const updated = req.selected_prof_certs.filter(c => c !== cert);
                                                                    updateRequirement(req.id, 'selected_prof_certs', updated);
                                                                }}
                                                                className="hover:bg-purple-700 rounded-full p-0.5 transition-colors"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                    {(!req.selected_prof_certs || req.selected_prof_certs.length === 0) && (
                                                        <span className="text-[10px] text-slate-400 italic">Nessuna certificazione selezionata</span>
                                                    )}
                                                </div>

                                                {/* Search & Selection List */}
                                                <div className="relative mb-2">
                                                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                                                        <Search className="h-3.5 w-3.5 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={t('config.select_certs') + '...'}
                                                        value={certSearch}
                                                        onChange={(e) => setCertSearch(e.target.value)}
                                                        className="block w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 text-[11px]"
                                                    />
                                                </div>

                                                <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-md bg-white">
                                                    {knownProfCerts
                                                        .filter(cert => !req.selected_prof_certs?.includes(cert))
                                                        .filter(cert => cert.toLowerCase().includes(certSearch.toLowerCase()))
                                                        .map(cert => {
                                                            const count = req.selected_prof_certs?.length || 0;
                                                            const canSelectMore = count < (req.prof_C || 1);

                                                            return (
                                                                <button
                                                                    key={cert}
                                                                    disabled={!canSelectMore}
                                                                    onClick={() => {
                                                                        const current = req.selected_prof_certs || [];
                                                                        updateRequirement(req.id, 'selected_prof_certs', [...current, cert]);
                                                                        setCertSearch(''); // Clear search after selection
                                                                    }}
                                                                    className={`w-full text-left px-3 py-2 text-[11px] font-medium border-b border-slate-50 last:border-0 transition-colors ${canSelectMore
                                                                        ? 'hover:bg-purple-50 text-slate-700'
                                                                        : 'bg-slate-50 text-slate-400 cursor-not-allowed opacity-60'}`}
                                                                >
                                                                    {cert}
                                                                </button>
                                                            );
                                                        })}
                                                    {knownProfCerts.length === 0 && (
                                                        <p className="text-[10px] italic text-slate-400 p-3 text-center">Nessuna certificazione in Master Data.</p>
                                                    )}
                                                    {knownProfCerts.length > 0 && knownProfCerts.filter(cert => !req.selected_prof_certs?.includes(cert)).filter(cert => cert.toLowerCase().includes(certSearch.toLowerCase())).length === 0 && (
                                                        <p className="text-[10px] italic text-slate-400 p-3 text-center">Nessun risultato trovato.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                    }

                                    {/* Sub-Requirements, Attestazione, and Custom Metrics (for reference/project) */}
                                    {(req.type === 'reference' || req.type === 'project') && (
                                        <div className="mt-4 space-y-4">
                                            {/* 1. Criteria & Weights */}
                                            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-4">
                                                        <div>
                                                            <h4 className="font-semibold text-blue-800 text-sm">{t('tech.criteria')} e Pesi</h4>
                                                            <p className="text-xs text-blue-600 mt-1">P_max = Σ(Peso × Valutazione)</p>
                                                        </div>
                                                        <div className="bg-white px-3 py-1 rounded border border-blue-200 text-center shadow-sm">
                                                            <div className="text-[9px] font-bold text-blue-400 uppercase leading-none mb-1">Max Req</div>
                                                            <div className="text-lg font-black text-blue-600 leading-none">{(req.max_points || 0).toFixed(1)}</div>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => addSubReq(req.id)}
                                                        className="px-3 py-1.5 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors flex items-center gap-1.5 text-xs font-medium"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        {t('common.add')}
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {req.sub_reqs && req.sub_reqs.length > 0 ? (
                                                        req.sub_reqs.map((sub) => (
                                                            <div key={sub.id} className="flex gap-3 items-center bg-white p-2 rounded border border-blue-200">
                                                                <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-700 rounded font-mono text-xs font-bold shrink-0">{sub.id}</span>
                                                                <input
                                                                    type="text"
                                                                    value={sub.label}
                                                                    onChange={(e) => updateSubReq(req.id, sub.id, 'label', e.target.value)}
                                                                    placeholder={t('tech.criteria') + ' label'}
                                                                    className="flex-1 p-1.5 border border-slate-200 bg-white rounded text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                                                />
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-xs font-medium text-slate-500">Peso</span>
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        min="0.1"
                                                                        value={sub.weight}
                                                                        onChange={(e) => updateSubReq(req.id, sub.id, 'weight', Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                                                                        className="w-14 p-1.5 border border-slate-200 bg-white rounded text-xs font-bold text-center focus:ring-1 focus:ring-blue-500 outline-none"
                                                                    />
                                                                </div>
                                                                <button
                                                                    onClick={() => deleteSubReq(req.id, sub.id)}
                                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-center py-3 text-blue-900/50 text-xs italic">
                                                            {t('config.no_subreqs', 'Nessun criterio definito.')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 2. Attestazione Cliente */}
                                            <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                                <h4 className="font-semibold text-emerald-800 text-sm mb-3">{t('config.attestazione_title')}</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">{t('config.attestazione_score_label')}</label>
                                                        <input
                                                            type="number"
                                                            step="0.5"
                                                            value={req.attestazione_score || 0.0}
                                                            onChange={(e) => updateRequirement(req.id, 'attestazione_score', parseFloat(e.target.value) || 0)}
                                                            className="w-full p-2 border border-emerald-200 bg-white rounded text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                                                        />
                                                    </div>
                                                    <div className="flex items-end">
                                                        <p className="text-[10px] text-emerald-600 italic">
                                                            {t('config.attestazione_desc', { points: req.attestazione_score || 0 })}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 3. Voci Tabellari (Custom Metrics) */}
                                            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div>
                                                        <h4 className="font-semibold text-orange-800 text-sm">{t('config.custom_metrics_title')}</h4>
                                                        <p className="text-xs text-orange-600 mt-1">{t('config.custom_metrics_subtitle')}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => addCustomMetric(req.id)}
                                                        className="px-3 py-1.5 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition-colors flex items-center gap-1.5 text-xs font-medium"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        {t('common.add')} {t('config.add_custom_metric')}
                                                    </button>
                                                </div>
                                                <div className="space-y-3">
                                                    {req.custom_metrics?.map((metric) => (
                                                        <div key={metric.id} className="bg-white p-3 rounded-md border border-orange-100 flex flex-col gap-2">
                                                            <div className="flex justify-between items-start">
                                                                <input
                                                                    type="text"
                                                                    value={metric.label}
                                                                    placeholder={t('config.custom_metric_placeholder')}
                                                                    onChange={(e) => updateCustomMetric(req.id, metric.id, 'label', e.target.value)}
                                                                    className="flex-1 p-1.5 border-b border-slate-100 bg-transparent text-xs font-bold focus:border-orange-500 outline-none"
                                                                />
                                                                <button onClick={() => deleteCustomMetric(req.id, metric.id)} className="text-slate-300 hover:text-red-500 p-1">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-500 uppercase">{t('config.min_points')}</label>
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        value={metric.min_score}
                                                                        onChange={(e) => updateCustomMetric(req.id, metric.id, 'min_score', parseFloat(e.target.value) || 0)}
                                                                        className="w-full p-1 border border-slate-100 rounded text-xs font-medium"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-[9px] font-bold text-slate-500 uppercase">{t('config.max_points_label')}</label>
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        value={metric.max_score}
                                                                        onChange={(e) => updateCustomMetric(req.id, metric.id, 'max_score', parseFloat(e.target.value) || 0)}
                                                                        className="w-full p-1 border border-slate-100 rounded text-xs font-medium"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(!req.custom_metrics || req.custom_metrics.length === 0) && (
                                                        <div className="text-center py-2 text-orange-900/40 text-[10px] italic">
                                                            {t('config.no_custom_metrics')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                                <p>{t('config.no_reqs')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div >
    );
}
