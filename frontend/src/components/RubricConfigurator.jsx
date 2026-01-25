import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X } from 'lucide-react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useToast } from '../shared/components/ui/Toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const JUDGMENT_LEVELS = [
    { value: 5, label: "Ottimo", color: "bg-green-100 border-green-300 text-green-800" },
    { value: 4, label: "Più che adeguato", color: "bg-lime-100 border-lime-300 text-lime-800" },
    { value: 3, label: "Adeguato", color: "bg-yellow-100 border-yellow-300 text-yellow-800" },
    { value: 2, label: "Parzialmente adeguato", color: "bg-orange-100 border-orange-300 text-orange-800" },
    { value: 0, label: "Assente/Inadeguato", color: "bg-red-100 border-red-300 text-red-800" }
];

export default function RubricConfigurator({ lotKey, lotConfig, onUpdate, onClose }) {
    const { t } = useTranslation();
    const { success, error: showError } = useToast();
    const [criteria, setCriteria] = useState({});
    const [judgments, setJudgments] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        // Inizializzazione da lotConfig
        if (lotConfig && lotConfig.reqs) {
            const initialCriteria = {};
            const initialJudgments = {};

            lotConfig.reqs.forEach(req => {
                if (req.type === 'reference' || req.type === 'project') {
                    // Carica criteri esistenti
                    initialCriteria[req.id] = req.criteria || req.sub_reqs?.map(sr => ({
                        id: sr.id,
                        label: sr.label,
                        weight: sr.weight || 1
                    })) || [];

                    // Carica giudizi dallo stato
                    initialJudgments[req.id] = {};
                    if (lotConfig.state?.tech_inputs?.[req.id]?.sub_req_vals) {
                        lotConfig.state.tech_inputs[req.id].sub_req_vals.forEach(val => {
                            initialJudgments[req.id][val.sub_id] = val.val;
                        });
                    }
                }
            });

            setCriteria(initialCriteria);
            setJudgments(initialJudgments);
        }
    }, [lotConfig]);

    const handleAddCriterion = (reqId) => {
        setCriteria({
            ...criteria,
            [reqId]: [
                ...criteria[reqId],
                {
                    id: `c${criteria[reqId].length + 1}`,
                    label: '',
                    weight: 1
                }
            ]
        });
    };

    const handleRemoveCriterion = (reqId, criterionId) => {
        setCriteria({
            ...criteria,
            [reqId]: criteria[reqId].filter(c => c.id !== criterionId)
        });
    };

    const handleUpdateCriterion = (reqId, criterionId, field, value) => {
        setCriteria({
            ...criteria,
            [reqId]: criteria[reqId].map(c =>
                c.id === criterionId ? { ...c, [field]: value } : c
            )
        });
    };

    const handleJudgmentChange = (reqId, criterionId, value) => {
        setJudgments({
            ...judgments,
            [reqId]: {
                ...judgments[reqId],
                [criterionId]: parseInt(value)
            }
        });
    };

    const calculateScore = (reqId) => {
        const reqs = criteria[reqId] || [];
        const judgmentVals = judgments[reqId] || {};
        let total = 0;

        reqs.forEach(criterion => {
            const judgment = judgmentVals[criterion.id] || 0;
            total += criterion.weight * judgment;
        });

        return parseFloat(total.toFixed(2));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // Aggiorna lo stato con i nuovi criteri e giudizi
            const updatedConfig = { ...lotConfig };
            const updatedTechInputs = updatedConfig.state?.tech_inputs || {};

            // Aggiorna ogni requisito con i nuovi criteri
            updatedConfig.reqs.forEach(req => {
                if (criteria[req.id]) {
                    req.criteria = criteria[req.id];
                    // Salva anche come sub_reqs per compatibilità
                    req.sub_reqs = criteria[req.id];
                }

                if (judgments[req.id]) {
                    const subReqVals = Object.entries(judgments[req.id]).map(([subId, val]) => ({
                        sub_id: subId,
                        val: val
                    }));
                    updatedTechInputs[req.id] = {
                        ...updatedTechInputs[req.id],
                        sub_req_vals: subReqVals
                    };
                }
            });

            updatedConfig.state = {
                ...updatedConfig.state,
                tech_inputs: updatedTechInputs
            };

            // Salva sul backend
            await axios.post(`${API_URL}/config`, {
                [lotKey]: updatedConfig
            });

            if (onUpdate) {
                onUpdate(updatedConfig);
            }

            success(t('config.save_success') || 'Configurazione salvata con successo');
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-96 overflow-y-auto p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-slate-800">
                        Configurazione Criteri di Valutazione - {lotKey}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-slate-100 rounded-lg transition"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-8">
                    {referenceReqs.map(req => (
                        <div key={req.id} className="border-l-4 border-blue-500 pl-4 pb-6">
                            <h3 className="font-bold text-lg text-slate-800 mb-4">
                                {req.label}
                            </h3>

                            <div className="space-y-3 mb-4">
                                {criteria[req.id]?.map(criterion => (
                                    <div key={criterion.id} className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                                        <div className="grid grid-cols-12 gap-4 items-center">
                                            {/* Nome Voce */}
                                            <input
                                                type="text"
                                                value={criterion.label}
                                                onChange={(e) => handleUpdateCriterion(req.id, criterion.id, 'label', e.target.value)}
                                                placeholder="Nome voce (PA)"
                                                className="col-span-4 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />

                                            {/* Peso */}
                                            <input
                                                type="number"
                                                min="0.1"
                                                step="0.1"
                                                value={criterion.weight}
                                                onChange={(e) => handleUpdateCriterion(req.id, criterion.id, 'weight', parseFloat(e.target.value))}
                                                placeholder="Peso (Pe)"
                                                className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />

                                            {/* Giudizio */}
                                            <select
                                                value={judgments[req.id]?.[criterion.id] || 0}
                                                onChange={(e) => handleJudgmentChange(req.id, criterion.id, e.target.value)}
                                                className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                                <option value="">Scegli giudizio</option>
                                                {JUDGMENT_LEVELS.map(level => (
                                                    <option key={level.value} value={level.value}>
                                                        {level.label} ({level.value})
                                                    </option>
                                                ))}
                                            </select>

                                            {/* Rimuovi */}
                                            <button
                                                onClick={() => handleRemoveCriterion(req.id, criterion.id)}
                                                className="col-span-1 p-2 hover:bg-red-100 rounded-lg transition text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>

                                            {/* Contributo */}
                                            <div className="col-span-2 text-right">
                                                <div className="text-xs text-slate-500">Contributo</div>
                                                <div className="text-sm font-bold text-blue-600">
                                                    {(criterion.weight * (judgments[req.id]?.[criterion.id] || 0)).toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Aggiungi voce */}
                            <button
                                onClick={() => handleAddCriterion(req.id)}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition text-sm font-medium mb-4"
                            >
                                <Plus className="w-4 h-4" />
                                Aggiungi voce
                            </button>

                            {/* Score totale */}
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                                <div className="flex justify-between items-center">
                                    <span className="font-semibold text-slate-800">Pmax (Punteggio Massimo)</span>
                                    <span className="text-2xl font-bold text-blue-600">
                                        {calculateScore(req.id)}
                                    </span>
                                </div>
                                <div className="text-xs text-slate-500 mt-2">
                                    Formula: Σ(Pe_i × V_i)
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Bottoni azione */}
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-slate-200">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition font-medium text-slate-700"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                    >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvataggio...' : 'Salva'}
                    </button>
                </div>
            </div>
        </div>
    );
}
