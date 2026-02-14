import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Layers, Plus, Trash2, GripVertical, Percent, Save, X } from 'lucide-react';

/**
 * TowConfigTable - Configurazione Type of Work
 * Gestisce: TOW ID, label, tipo, peso %, attività, deliverables
 */
export default function TowConfigTable({
  tows = [],
  practices = [],
  towAssignments = {},
  onChange,
  onAssignmentChange,
  disabled = false
}) {
  const { t } = useTranslation();
  const [showAddRow, setShowAddRow] = useState(false);
  const [newTow, setNewTow] = useState({
    tow_id: '',
    label: '',
    type: 'task',
    weight_pct: 0,
    num_tasks: 0,
    duration_months: 0,
    activities: '',
    deliverables: ''
  });

  const towTypes = [
    { value: 'task', label: 'Task', color: 'blue' },
    { value: 'corpo', label: 'A Corpo', color: 'purple' },
    { value: 'consumo', label: 'A Consumo', color: 'amber' }
  ];

  const handleAddTow = () => {
    if (!newTow.tow_id.trim() || !newTow.label.trim()) return;

    onChange?.([...tows, { ...newTow }]);
    setNewTow({
      tow_id: '',
      label: '',
      type: 'task',
      weight_pct: 0,
      num_tasks: 0,
      duration_months: 0,
      activities: '',
      deliverables: ''
    });
    setShowAddRow(false);
  };

  const handleRemoveTow = (index) => {
    const updated = tows.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  const handleUpdateTow = (index, field, value) => {
    const updated = tows.map((t, i) => {
      if (i !== index) return t;
      return { ...t, [field]: value };
    });
    onChange?.(updated);
  };

  const handlePracticeAssignment = (towId, practiceId) => {
    onAssignmentChange?.({
      ...towAssignments,
      [towId]: practiceId
    });
  };

  // Calcola totale pesi
  const totalWeight = tows.reduce((sum, t) => sum + (parseFloat(t.weight_pct) || 0), 0);
  const isWeightValid = Math.abs(totalWeight - 100) < 0.1;

  const getTypeStyle = (type) => {
    const t = towTypes.find(tt => tt.value === type);
    if (!t) return 'bg-slate-100 text-slate-600';
    const colors = {
      blue: 'bg-blue-100 text-blue-700',
      purple: 'bg-purple-100 text-purple-700',
      amber: 'bg-amber-100 text-amber-700'
    };
    return colors[t.color];
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Layers className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {t('business_plan.tow_config')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('business_plan.tow_config_desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {tows.length > 0 && (
              <div className={`px-2 py-1 rounded-lg text-xs font-semibold
                              ${isWeightValid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                <Percent className="w-3 h-3 inline mr-1" />
                {totalWeight.toFixed(1)}%
              </div>
            )}
            <button
              onClick={() => setShowAddRow(true)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                         text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Aggiungi TOW
            </button>
          </div>
        </div>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600 w-24">ID</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Descrizione</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-24">Tipo</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-20">Peso %</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">Quantità</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-36">Practice</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tows.length === 0 && !showAddRow ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Layers className="w-8 h-8 text-slate-300" />
                    <p>Nessun TOW configurato</p>
                    <button
                      onClick={() => setShowAddRow(true)}
                      disabled={disabled}
                      className="text-indigo-600 hover:underline text-sm"
                    >
                      Aggiungi il primo Type of Work
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              tows.map((tow, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={tow.tow_id}
                      onChange={(e) => handleUpdateTow(idx, 'tow_id', e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1 font-mono text-xs border border-transparent
                                 hover:border-slate-200 focus:border-indigo-300 rounded
                                 focus:outline-none disabled:bg-transparent"
                      placeholder="TOW_XX"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={tow.label}
                      onChange={(e) => handleUpdateTow(idx, 'label', e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1 border border-transparent hover:border-slate-200
                                 focus:border-indigo-300 rounded focus:outline-none
                                 disabled:bg-transparent"
                      placeholder="Nome TOW..."
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={tow.type}
                      onChange={(e) => handleUpdateTow(idx, 'type', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-2 py-1 text-xs font-medium rounded border-0
                                  focus:outline-none focus:ring-2 focus:ring-indigo-300
                                  disabled:cursor-not-allowed ${getTypeStyle(tow.type)}`}
                    >
                      {towTypes.map(tt => (
                        <option key={tt.value} value={tt.value}>{tt.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={tow.weight_pct}
                      onChange={(e) => handleUpdateTow(idx, 'weight_pct', parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      step="0.1"
                      min="0"
                      max="100"
                      className="w-full px-2 py-1 text-center border border-slate-200 rounded
                                 focus:border-indigo-300 focus:outline-none
                                 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-4 py-2">
                    {tow.type === 'task' ? (
                      <input
                        type="number"
                        value={tow.num_tasks || ''}
                        onChange={(e) => handleUpdateTow(idx, 'num_tasks', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        min="0"
                        placeholder="N. task"
                        className="w-full px-2 py-1 text-center border border-slate-200 rounded
                                   focus:border-indigo-300 focus:outline-none text-xs
                                   disabled:bg-slate-50 disabled:cursor-not-allowed"
                      />
                    ) : tow.type === 'corpo' ? (
                      <input
                        type="number"
                        value={tow.duration_months || ''}
                        onChange={(e) => handleUpdateTow(idx, 'duration_months', parseInt(e.target.value) || 0)}
                        disabled={disabled}
                        min="0"
                        placeholder="N. mesi"
                        className="w-full px-2 py-1 text-center border border-slate-200 rounded
                                   focus:border-indigo-300 focus:outline-none text-xs
                                   disabled:bg-slate-50 disabled:cursor-not-allowed"
                      />
                    ) : (
                      <span className="block text-center text-slate-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={towAssignments[tow.tow_id] || ''}
                      onChange={(e) => handlePracticeAssignment(tow.tow_id, e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded
                                 focus:border-indigo-300 focus:outline-none
                                 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    >
                      <option value="">-- Practice --</option>
                      {practices.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleRemoveTow(idx)}
                      disabled={disabled}
                      className="p-1 text-slate-400 hover:text-red-500 rounded
                                 opacity-0 group-hover:opacity-100 transition-opacity
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}

            {/* Riga per aggiunta nuovo TOW */}
            {showAddRow && (
              <tr className="bg-indigo-50">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newTow.tow_id}
                    onChange={(e) => setNewTow({ ...newTow, tow_id: e.target.value.toUpperCase() })}
                    placeholder="TOW_XX"
                    autoFocus
                    className="w-full px-2 py-1 font-mono text-xs border border-indigo-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newTow.label}
                    onChange={(e) => setNewTow({ ...newTow, label: e.target.value })}
                    placeholder="Nome TOW..."
                    className="w-full px-2 py-1 border border-indigo-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={newTow.type}
                    onChange={(e) => setNewTow({ ...newTow, type: e.target.value })}
                    className="w-full px-2 py-1 text-xs border border-indigo-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {towTypes.map(tt => (
                      <option key={tt.value} value={tt.value}>{tt.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={newTow.weight_pct}
                    onChange={(e) => setNewTow({ ...newTow, weight_pct: parseFloat(e.target.value) || 0 })}
                    step="0.1"
                    min="0"
                    max="100"
                    className="w-full px-2 py-1 text-center border border-indigo-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </td>
                <td className="px-4 py-2">
                  {newTow.type === 'task' ? (
                    <input
                      type="number"
                      value={newTow.num_tasks || ''}
                      onChange={(e) => setNewTow({ ...newTow, num_tasks: parseInt(e.target.value) || 0 })}
                      min="0"
                      placeholder="N. task"
                      className="w-full px-2 py-1 text-center text-xs border border-indigo-300 rounded
                                 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : newTow.type === 'corpo' ? (
                    <input
                      type="number"
                      value={newTow.duration_months || ''}
                      onChange={(e) => setNewTow({ ...newTow, duration_months: parseInt(e.target.value) || 0 })}
                      min="0"
                      placeholder="N. mesi"
                      className="w-full px-2 py-1 text-center text-xs border border-indigo-300 rounded
                                 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  ) : (
                    <span className="block text-center text-slate-400 text-xs">-</span>
                  )}
                </td>
                <td className="px-4 py-2 text-center text-slate-400">-</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={handleAddTow}
                      disabled={!newTow.tow_id.trim() || !newTow.label.trim()}
                      className="p-1 text-green-600 hover:bg-green-100 rounded
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Salva TOW"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setShowAddRow(false)}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                      title="Annulla"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Warning se pesi != 100% */}
      {tows.length > 0 && !isWeightValid && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100">
          <p className="text-xs text-amber-700">
            La somma dei pesi deve essere 100% (attuale: {totalWeight.toFixed(1)}%)
          </p>
        </div>
      )}
    </div>
  );
}
