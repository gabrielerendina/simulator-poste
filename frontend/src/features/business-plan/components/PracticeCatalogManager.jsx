import { useState } from 'react';
import {
  Building2,
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Euro,
} from 'lucide-react';

/**
 * PracticeCatalogManager - Gestione Practice e Profili Lutech con tariffe
 *
 * Permette di:
 * - Creare/modificare/eliminare Practice
 * - Per ogni Practice, gestire profili con: label, seniority, daily_rate
 */
export default function PracticeCatalogManager({
  practices = [],
  onSavePractice,
  onDeletePractice,
  disabled = false,
}) {
  const [expandedPractice, setExpandedPractice] = useState(null);
  const [editingPractice, setEditingPractice] = useState(null);
  const [showAddPractice, setShowAddPractice] = useState(false);
  const [newPractice, setNewPractice] = useState({ label: '', profiles: [] });

  // Gestione nuova Practice
  const handleAddPractice = async () => {
    if (!newPractice.label.trim()) return;

    // Auto-genera ID dal label
    const generatedId = newPractice.label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Rimuovi caratteri speciali
      .replace(/\s+/g, '_') // Sostituisci spazi con underscore
      .substring(0, 50); // Limita lunghezza

    await onSavePractice?.({
      id: generatedId || `practice_${Date.now()}`, // Fallback se label è solo caratteri speciali
      label: newPractice.label,
      profiles: [],
    });

    setNewPractice({ label: '', profiles: [] });
    setShowAddPractice(false);
  };

  // Gestione modifica Practice
  const handleStartEdit = (practice) => {
    setEditingPractice({ ...practice, profiles: [...(practice.profiles || [])] });
    setExpandedPractice(practice.id);
  };

  const handleCancelEdit = () => {
    setEditingPractice(null);
  };

  const handleSaveEdit = async () => {
    if (!editingPractice) return;
    await onSavePractice?.(editingPractice);
    setEditingPractice(null);
  };

  // Genera ID alfabetico (a, b, c, ..., z, aa, ab, ...)
  const generateProfileId = (existingProfiles) => {
    if (!existingProfiles || existingProfiles.length === 0) return 'a';

    // Estrai tutte le lettere ID
    const ids = existingProfiles
      .map(p => p.id)
      .filter(id => /^[a-z]+$/.test(id))
      .sort();

    if (ids.length === 0) return 'a';

    const lastId = ids[ids.length - 1];

    // Incrementa la lettera
    const increment = (str) => {
      let chars = str.split('');
      let i = chars.length - 1;

      while (i >= 0) {
        if (chars[i] === 'z') {
          chars[i] = 'a';
          i--;
        } else {
          chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
          return chars.join('');
        }
      }

      // Tutti erano 'z', aggiungi un carattere
      return 'a' + chars.join('');
    };

    return increment(lastId);
  };

  // Gestione profili dentro una Practice
  const handleAddProfile = () => {
    if (!editingPractice) return;

    const newId = generateProfileId(editingPractice.profiles);
    setEditingPractice({
      ...editingPractice,
      profiles: [
        ...editingPractice.profiles,
        { id: newId, label: '', daily_rate: 400 }
      ]
    });
  };

  const handleUpdateProfile = (index, field, value) => {
    if (!editingPractice) return;

    const updatedProfiles = editingPractice.profiles.map((p, i) => {
      if (i !== index) return p;
      return { ...p, [field]: field === 'daily_rate' ? (parseFloat(value) || 0) : value };
    });

    setEditingPractice({ ...editingPractice, profiles: updatedProfiles });
  };

  const handleRemoveProfile = (index) => {
    if (!editingPractice) return;

    setEditingPractice({
      ...editingPractice,
      profiles: editingPractice.profiles.filter((_, i) => i !== index)
    });
  };

  const formatCurrency = (val) => `€${val.toFixed(2)}`;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Catalogo Profili Lutech</h3>
              <p className="text-xs text-slate-500">Definisci Practice e figure professionali con tariffe</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddPractice(true)}
            disabled={disabled || showAddPractice}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                       text-purple-600 hover:bg-purple-50 rounded-lg transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            Nuova Practice
          </button>
        </div>
      </div>

      {/* Form nuova Practice */}
      {showAddPractice && (
        <div className="p-4 bg-purple-50 border-b border-purple-100">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newPractice.label}
              onChange={(e) => setNewPractice({ ...newPractice, label: e.target.value })}
              placeholder="Nome Practice (es. Data & AI)"
              className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg
                         focus:border-purple-500 focus:outline-none bg-white"
              autoFocus
            />
            <button
              onClick={handleAddPractice}
              disabled={!newPractice.label.trim()}
              className="p-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowAddPractice(false)}
              className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Lista Practice */}
      <div className="divide-y divide-slate-100">
        {practices.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">Nessuna Practice configurata</p>
            <p className="text-sm mt-1">Crea la prima Practice per definire i profili Lutech</p>
          </div>
        ) : (
          practices.map((practice) => {
            const isExpanded = expandedPractice === practice.id;
            const isEditing = editingPractice?.id === practice.id;
            const displayPractice = isEditing ? editingPractice : practice;
            const profiles = displayPractice.profiles || [];

            return (
              <div key={practice.id}>
                {/* Riga Practice */}
                <div className="flex items-center justify-between p-4 hover:bg-slate-50 transition-colors">
                  <button
                    onClick={() => setExpandedPractice(isExpanded ? null : practice.id)}
                    className="flex items-center gap-4 flex-1 text-left"
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-800">{practice.label}</div>
                      <div className="text-sm text-slate-500">
                        {profiles.length} profili · ID: {practice.id}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    {!isEditing ? (
                      <>
                        <button
                          onClick={() => handleStartEdit(practice)}
                          disabled={disabled}
                          className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeletePractice?.(practice.id)}
                          disabled={disabled}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={handleSaveEdit}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpandedPractice(isExpanded ? null : practice.id)}
                      className="p-2 text-slate-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Pannello profili espanso */}
                {isExpanded && (
                  <div className="px-4 pb-4 bg-slate-50">
                    <div className="p-4 bg-white rounded-xl border border-slate-200">
                      {/* Intestazione tabella */}
                      <div className="grid grid-cols-12 gap-3 mb-3 pb-2 border-b border-slate-100">
                        <div className="col-span-1 text-xs font-semibold text-slate-500 uppercase">ID</div>
                        <div className="col-span-6 text-xs font-semibold text-slate-500 uppercase">Profilo</div>
                        <div className="col-span-4 text-xs font-semibold text-slate-500 uppercase">Tariffa/GG</div>
                        <div className="col-span-1"></div>
                      </div>

                      {/* Righe profili */}
                      {profiles.length === 0 ? (
                        <div className="py-6 text-center text-slate-500 text-sm">
                          <Users className="w-6 h-6 mx-auto mb-2 text-slate-300" />
                          Nessun profilo. {isEditing ? 'Aggiungi il primo.' : 'Clicca Modifica per aggiungere.'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {profiles.map((profile, idx) => (
                            <div key={profile.id || idx} className="grid grid-cols-12 gap-3 items-center">
                              {/* ID */}
                              <div className="col-span-1">
                                <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2 py-1.5 rounded block text-center">
                                  {profile.id}
                                </span>
                              </div>

                              {/* Label */}
                              <div className="col-span-6">
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={profile.label}
                                    onChange={(e) => handleUpdateProfile(idx, 'label', e.target.value)}
                                    placeholder="Nome profilo..."
                                    className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded
                                               focus:border-purple-500 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-sm font-medium text-slate-700">{profile.label}</span>
                                )}
                              </div>

                              {/* Daily Rate */}
                              <div className="col-span-4">
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <Euro className="w-4 h-4 text-slate-400" />
                                    <input
                                      type="number"
                                      value={profile.daily_rate}
                                      onChange={(e) => handleUpdateProfile(idx, 'daily_rate', e.target.value)}
                                      step="10"
                                      min="0"
                                      className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded
                                                 focus:border-purple-500 focus:outline-none"
                                    />
                                  </div>
                                ) : (
                                  <span className="text-sm font-semibold text-slate-700">
                                    {formatCurrency(profile.daily_rate || 0)}/gg
                                  </span>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="col-span-1 flex justify-end">
                                {isEditing && (
                                  <button
                                    onClick={() => handleRemoveProfile(idx)}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Pulsante aggiungi profilo */}
                      {isEditing && (
                        <button
                          onClick={handleAddProfile}
                          className="mt-3 w-full flex items-center justify-center gap-2 py-2 text-sm font-medium
                                     text-purple-600 hover:bg-purple-50 rounded-lg border border-dashed border-purple-300"
                        >
                          <Plus className="w-4 h-4" />
                          Aggiungi Profilo
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
