import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Save, X, ChevronDown, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { isEqual } from '../utils/isEqual';
import { useToast } from '../shared/components/ui/Toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const JUDGMENT_LEVELS = [
    { value: 5, label: "Ottimo" },
    { value: 4, label: "Più che adeguato" },
    { value: 3, label: "Adeguato" },
    { value: 2, label: "Parzialmente adeguato" },
    { value: 0, label: "Assente/Inadeguato" }
];

export default function CriteriConfiguratePage({ lotKey, lotConfig, onBack, onSave }) {
    const { t } = useTranslation();
    const { warning, error: showError } = useToast();
    const [expandedReqs, setExpandedReqs] = useState({});
    const [editingCriteria, setEditingCriteria] = useState({});
    const [localJudgments, setLocalJudgments] = useState({});
    const [saving, setSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState("");
    const [errors, setErrors] = useState({});
    const prevLotConfigRef = useRef();

    useEffect(() => {
        if (isEqual(lotConfig, prevLotConfigRef.current)) {
            return;
        }
        // Inizializza la configurazione dai requisiti
        const initial = {};

        lotConfig?.reqs?.forEach(req => {
            if (req.type === 'reference' || req.type === 'project') {
                const criteria = req.criteria || req.sub_reqs || [];
                initial[req.id] = criteria.map(c => ({
                    id: c.id,
                    label: c.label,
                    weight: c.weight || 1
                }));
            }
        });

        setEditingCriteria(initial);
        setLocalJudgments({});
        prevLotConfigRef.current = lotConfig;
    }, [lotConfig]);

    const handleToggleExpand = (reqId) => {
        setExpandedReqs(prev => ({
            ...prev,
            [reqId]: !prev[reqId]
        }));
    };

    const handleAddCriterion = (reqId) => {
        setSuccessMsg("");
        setEditingCriteria(prev => ({
            ...prev,
            [reqId]: [
                ...(prev[reqId] || []),
                {
                    id: `c_${Date.now()}`,
                    label: '',
                    weight: 1
                }
            ]
        }));
    };

    const handleRemoveCriterion = (reqId, criterionId) => {
        setSuccessMsg("");
        setEditingCriteria(prev => ({
            ...prev,
            [reqId]: prev[reqId].filter(c => c.id !== criterionId)
        }));

        setLocalJudgments(prev => ({
            ...prev,
            [reqId]: {
                ...prev[reqId],
                [criterionId]: undefined
            }
        }));
    };

    const handleUpdateCriterion = (reqId, criterionId, field, value) => {
        setSuccessMsg("");
        let processedValue = value;
        if (field === 'weight') {
            if (value === '') {
                processedValue = '';
            } else {
                const numValue = parseFloat(value);
                processedValue = isNaN(numValue) ? '' : numValue;
            }
        }

        setEditingCriteria(prev => ({
            ...prev,
            [reqId]: prev[reqId].map(c =>
                c.id === criterionId ? { ...c, [field]: processedValue } : c
            )
        }));

        // Clear validation error on change
        if (errors[reqId]?.[criterionId]?.[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                if (newErrors[reqId]?.[criterionId]) {
                    delete newErrors[reqId][criterionId][field];
                    if (Object.keys(newErrors[reqId][criterionId]).length === 0) {
                        delete newErrors[reqId][criterionId];
                    }
                    if (Object.keys(newErrors[reqId]).length === 0) {
                        delete newErrors[reqId];
                    }
                }
                return newErrors;
            });
        }
    };

    const handleSetJudgment = (reqId, criterionId, value) => {
        setSuccessMsg("");
        setLocalJudgments(prev => ({
            ...prev,
            [reqId]: {
                ...prev[reqId],
                [criterionId]: value
            }
        }));
    };

    const calculateScore = (reqId) => {
        const criteria = editingCriteria[reqId] || [];
        const judgments = localJudgments[reqId] || {};
        let total = 0;

        criteria.forEach(criterion => {
            const judgment = judgments[criterion.id] || 0;
            const weight = criterion.weight === '' ? 0 : criterion.weight;
            total += weight * judgment;
        });

        return parseFloat(total.toFixed(2));
    };

    const validateCriteria = () => {
        const newErrors = {};
        let isValid = true;

        for (const [reqId, criteria] of Object.entries(editingCriteria)) {
            criteria.forEach((criterion) => {
                if (!criterion.label || criterion.label.trim() === '') {
                    if (!newErrors[reqId]) newErrors[reqId] = {};
                    newErrors[reqId][criterion.id] = { ...newErrors[reqId]?.[criterion.id], label: 'Il nome non può essere vuoto.' };
                    isValid = false;
                }

                if (criterion.weight === '' || criterion.weight <= 0) {
                    if (!newErrors[reqId]) newErrors[reqId] = {};
                    newErrors[reqId][criterion.id] = { ...newErrors[reqId]?.[criterion.id], weight: 'Il peso deve essere un numero positivo.' };
                    isValid = false;
                }
            });
        }

        setErrors(newErrors);
        return isValid;
    };


    const handleSave = async () => {
        if (!validateCriteria()) {
            warning(t('config.validation_error') || 'Errore di validazione: controlla i criteri');
            return;
        }
        setSaving(true);
        setSuccessMsg("");

        try {
            // Crea una copia profonda della configurazione per evitare mutazioni dirette
            const updatedLotConfig = JSON.parse(JSON.stringify(lotConfig));

            // Aggiorna i criteri per ogni requisito modificato
            for (const [reqId, criteria] of Object.entries(editingCriteria)) {
                const reqToUpdate = updatedLotConfig.reqs.find(r => r.id === reqId);
                if (reqToUpdate) {
                    reqToUpdate.criteria = criteria;
                    reqToUpdate.sub_reqs = criteria; // Manteniamo la coerenza
                }
            }

            // Update judgments in the state
            if (!updatedLotConfig.state) {
                updatedLotConfig.state = { tech_inputs: {} };
            }
            if (!updatedLotConfig.state.tech_inputs) {
                updatedLotConfig.state.tech_inputs = {};
            }

            for (const [reqId, judgments] of Object.entries(localJudgments)) {
                if (!updatedLotConfig.state.tech_inputs[reqId]) {
                    updatedLotConfig.state.tech_inputs[reqId] = {};
                }
                updatedLotConfig.state.tech_inputs[reqId].sub_req_vals = Object.entries(judgments).map(([subId, value]) => ({
                    sub_id: subId,
                    val: value
                }));
            }


            // Prepara il payload per l'aggiornamento globale
            const payload = {
                [lotKey]: updatedLotConfig
            };

            // Invia la configurazione completa al backend
            await axios.post(`${API_URL}/config`, payload);

            setSuccessMsg("✓ Configurazione salvata con successo!");

            if (onSave) {
                onSave(); // Riesegue il fetch della configurazione aggiornata
            }
        } catch (error) {
            console.error('Errore nel salvataggio:', error);
            showError(t('config.save_error') || 'Errore durante il salvataggio');
        } finally {
            setSaving(false);
        }
    };

    const referenceReqs = lotConfig?.reqs?.filter(req =>
        req.type === 'reference' || req.type === 'project'
    ) || [];

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">
                            {t('config.criteri_title')} - <span className="text-slate-500">{lotKey}</span>
                        </h1>
                        <p className="text-slate-500">
                            {t('config.criteri_subtitle')}
                        </p>
                    </div>
                    <button
                        onClick={onBack}
                        className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                    >
                        {t('common.back')}
                    </button>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-blue-800">{t('config.criteri_formula_title')}</p>
                        <p className="text-sm text-blue-700 mt-1 font-mono">
                            P_max = Σ(Pe_i × V_i)
                        </p>
                    </div>
                </div>

                {/* Success Message */}
                {successMsg && (
                    <div className="bg-green-100 border border-green-300 text-green-800 px-4 py-3 rounded-lg mb-6">
                        {successMsg}
                    </div>
                )}

                {/* Requisiti */}
                <div className="space-y-4">
                    {referenceReqs.map(req => {
                        const criteria = editingCriteria[req.id] || [];
                        const isExpanded = expandedReqs[req.id];
                        const scoreValue = calculateScore(req.id);

                        return (
                            <div key={req.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                                {/* Header Requisito */}
                                <button
                                    onClick={() => handleToggleExpand(req.id)}
                                    className="w-full px-6 py-4 flex justify-between items-center hover:bg-slate-50 transition"
                                >
                                    <div className="flex items-center gap-4 flex-1 text-left">
                                        <ChevronDown
                                            className={`w-5 h-5 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                        />
                                        <div>
                                            <h3 className="font-semibold text-slate-800">{req.label}</h3>
                                            <p className="text-xs text-slate-500 mt-1 font-mono">{req.id} · {req.type}</p>
                                        </div>
                                    </div>

                                    {/* Score Badge */}
                                    <div className="text-right ml-4">
                                        <div className="text-2xl font-bold text-blue-600">
                                            {scoreValue.toFixed(2)}
                                        </div>
                                        <div className="text-xs text-slate-400">/ {req.max_points} max</div>
                                    </div>
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200">
                                        <div className="space-y-3 mb-6">
                                            {criteria.map((criterion) => {
                                                const judgment = localJudgments[req.id]?.[criterion.id] || 0;
                                                const criterionErrors = errors[req.id]?.[criterion.id] || {};

                                                return (
                                                    <div key={criterion.id} className="bg-white p-3 rounded-lg border border-slate-200">
                                                        <div className="grid grid-cols-12 gap-3 items-start">
                                                            {/* Label */}
                                                            <div className="col-span-4">
                                                                <input
                                                                    type="text"
                                                                    value={criterion.label}
                                                                    onChange={(e) => handleUpdateCriterion(req.id, criterion.id, 'label', e.target.value)}
                                                                    placeholder="Nome voce di valutazione"
                                                                    className={`w-full px-3 py-2 border ${criterionErrors.label ? 'border-red-500' : 'border-slate-200'} bg-white rounded-lg text-sm focus:outline-none focus:ring-2 ${criterionErrors.label ? 'ring-red-500' : 'focus:ring-blue-500'}`}
                                                                />
                                                                {criterionErrors.label && <p className="text-red-500 text-xs mt-1">{criterionErrors.label}</p>}
                                                            </div>

                                                            {/* Weight */}
                                                            <div className="col-span-2">
                                                                <input
                                                                    type="number"
                                                                    min="0.1"
                                                                    step="0.1"
                                                                    value={criterion.weight}
                                                                    onChange={(e) => handleUpdateCriterion(req.id, criterion.id, 'weight', e.target.value)}
                                                                    placeholder="Peso"
                                                                    className={`w-full px-3 py-2 border ${criterionErrors.weight ? 'border-red-500' : 'border-slate-200'} bg-white rounded-lg text-sm focus:outline-none focus:ring-2 ${criterionErrors.weight ? 'ring-red-500' : 'focus:ring-blue-500'} text-center font-bold`}
                                                                />
                                                                {criterionErrors.weight && <p className="text-red-500 text-xs mt-1">{criterionErrors.weight}</p>}
                                                            </div>

                                                            {/* Contribution Display */}
                                                            <div className="col-span-5 flex items-center gap-2">
                                                                <div className="grid grid-cols-5 gap-1 w-full">
                                                                    {JUDGMENT_LEVELS.map(level => (
                                                                        <button
                                                                            key={level.value}
                                                                            onClick={() => handleSetJudgment(req.id, criterion.id, level.value)}
                                                                            title={level.label}
                                                                            className={`h-8 rounded border text-xs font-semibold transition-all ${judgment === level.value
                                                                                ? `bg-blue-500 border-blue-500 text-white`
                                                                                : 'bg-white border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600'
                                                                                }`}
                                                                        >
                                                                            {level.value}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>


                                                            {/* Delete Button */}
                                                            <div className="col-span-1 text-right">
                                                                <button
                                                                    onClick={() => handleRemoveCriterion(req.id, criterion.id)}
                                                                    className="p-2 hover:bg-red-100 rounded-lg transition text-slate-400 hover:text-red-500"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Add Criterion Button */}
                                        <button
                                            onClick={() => handleAddCriterion(req.id)}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition font-medium text-sm mb-4"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Aggiungi Criterio
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
                    <button
                        onClick={onBack}
                        className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 shadow-sm text-sm font-medium disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvataggio...' : 'Salva Configurazione'}
                    </button>
                </div>
            </div>
        </div>
    );
}
