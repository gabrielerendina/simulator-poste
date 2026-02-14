import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Trash2, Upload, Calculator, Save, X, GraduationCap } from 'lucide-react';

const DAYS_PER_FTE = 220;

const SENIORITY_OPTIONS = [
  { value: 'jr', label: 'Junior', color: 'blue', icon: '🌱' },
  { value: 'mid', label: 'Middle', color: 'emerald', icon: '🌿' },
  { value: 'sr', label: 'Senior', color: 'purple', icon: '🌳' },
  { value: 'expert', label: 'Expert', color: 'amber', icon: '⭐' },
];

const getSeniorityStyle = (seniority) => {
  const opt = SENIORITY_OPTIONS.find(s => s.value === seniority) || SENIORITY_OPTIONS[1];
  const colors = {
    blue: 'bg-blue-100 text-blue-700 border-blue-300',
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    purple: 'bg-purple-100 text-purple-700 border-purple-300',
    amber: 'bg-amber-100 text-amber-700 border-amber-300'
  };
  return { ...opt, className: colors[opt.color] };
};

/**
 * TeamCompositionTable - Tabella composizione team da capitolato Poste
 * Gestisce: profili, seniority, FTE, giorni/anno, allocazione per TOW
 */
export default function TeamCompositionTable({
  team = [],
  tows = [],
  durationMonths = 36,
  onChange,
  disabled = false
}) {
  const { t } = useTranslation();
  const [showAddRow, setShowAddRow] = useState(false);
  const [newProfile, setNewProfile] = useState({
    profile_id: '',
    label: '',
    seniority: 'mid',
    fte: 1,
    days_year: DAYS_PER_FTE,
    tow_allocation: {}
  });

  const handleAddProfile = () => {
    if (!newProfile.label.trim()) return;

    const profile = {
      ...newProfile,
      profile_id: newProfile.profile_id || newProfile.label.toLowerCase().replace(/\s+/g, '_'),
      days_year: newProfile.fte * DAYS_PER_FTE,
    };

    onChange?.([...team, profile]);
    setNewProfile({
      profile_id: '',
      label: '',
      seniority: 'mid',
      fte: 1,
      days_year: DAYS_PER_FTE,
      tow_allocation: {}
    });
    setShowAddRow(false);
  };

  const handleRemoveProfile = (index) => {
    const updated = team.filter((_, i) => i !== index);
    onChange?.(updated);
  };

  const handleUpdateProfile = (index, field, value) => {
    const updated = team.map((p, i) => {
      if (i !== index) return p;

      const updatedProfile = { ...p, [field]: value };

      // Auto-calculate days when FTE changes
      if (field === 'fte') {
        updatedProfile.days_year = parseFloat(value) * DAYS_PER_FTE;
      }

      return updatedProfile;
    });
    onChange?.(updated);
  };

  const handleTowAllocation = (profileIndex, towId, pct) => {
    const updated = team.map((p, i) => {
      if (i !== profileIndex) return p;
      return {
        ...p,
        tow_allocation: {
          ...p.tow_allocation,
          [towId]: parseFloat(pct) || 0
        }
      };
    });
    onChange?.(updated);
  };

  // Calcoli totali
  const durationYears = durationMonths / 12;
  const totalFte = team.reduce((sum, p) => sum + (parseFloat(p.fte) || 0), 0);
  const totalDays = team.reduce((sum, p) => sum + (parseFloat(p.days_year) || 0), 0);
  const totalDaysOverall = totalDays * durationYears;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {t('business_plan.team_composition')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('business_plan.team_composition_desc')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddRow(true)}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                         text-blue-600 hover:bg-blue-50 rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Aggiungi
            </button>
          </div>
        </div>
      </div>

      {/* Tabella */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Profilo</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">Seniority</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-24">FTE</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">GG/Anno</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">GG Totale</th>
              {tows.map(tow => (
                <th key={tow.tow_id} className="px-3 py-3 text-center font-semibold text-slate-600 w-20">
                  <div className="truncate" title={tow.label}>
                    {tow.tow_id}
                  </div>
                </th>
              ))}
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.length === 0 && !showAddRow ? (
              <tr>
                <td colSpan={6 + tows.length} className="px-4 py-8 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 text-slate-300" />
                    <p>Nessun profilo configurato</p>
                    <button
                      onClick={() => setShowAddRow(true)}
                      disabled={disabled}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Aggiungi il primo profilo
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              team.map((profile, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={profile.label}
                      onChange={(e) => handleUpdateProfile(idx, 'label', e.target.value)}
                      disabled={disabled}
                      className="w-full px-2 py-1 border border-transparent hover:border-slate-200
                                 focus:border-blue-300 rounded focus:outline-none
                                 disabled:bg-transparent disabled:cursor-not-allowed"
                      placeholder="Nome profilo..."
                    />
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={profile.seniority || 'mid'}
                      onChange={(e) => handleUpdateProfile(idx, 'seniority', e.target.value)}
                      disabled={disabled}
                      className={`w-full px-2 py-1.5 text-center text-xs font-semibold border rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-blue-300
                                 disabled:cursor-not-allowed ${getSeniorityStyle(profile.seniority || 'mid').className}`}
                    >
                      {SENIORITY_OPTIONS.map(s => (
                        <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={profile.fte}
                      onChange={(e) => handleUpdateProfile(idx, 'fte', parseFloat(e.target.value) || 0)}
                      disabled={disabled}
                      step="0.1"
                      min="0"
                      className="w-full px-2 py-1 text-center border border-slate-200 rounded
                                 focus:border-blue-300 focus:outline-none
                                 disabled:bg-slate-50 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <div className="px-2 py-1 text-center bg-slate-100 rounded text-slate-600">
                      {Math.round(profile.days_year || profile.fte * DAYS_PER_FTE)}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="px-2 py-1 text-center bg-blue-50 rounded text-blue-700 font-semibold">
                      {Math.round((profile.days_year || profile.fte * DAYS_PER_FTE) * durationYears)}
                    </div>
                  </td>
                  {tows.map(tow => (
                    <td key={tow.tow_id} className="px-3 py-2">
                      <input
                        type="number"
                        value={profile.tow_allocation?.[tow.tow_id] || ''}
                        onChange={(e) => handleTowAllocation(idx, tow.tow_id, e.target.value)}
                        disabled={disabled}
                        step="5"
                        min="0"
                        max="100"
                        placeholder="0"
                        className="w-full px-2 py-1 text-center border border-slate-200 rounded
                                   focus:border-blue-300 focus:outline-none text-xs
                                   disabled:bg-slate-50 disabled:cursor-not-allowed"
                      />
                    </td>
                  ))}
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleRemoveProfile(idx)}
                      disabled={disabled}
                      className="p-1 text-slate-400 hover:text-red-500 rounded
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}

            {/* Riga per aggiunta nuovo profilo */}
            {showAddRow && (
              <tr className="bg-blue-50">
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={newProfile.label}
                    onChange={(e) => setNewProfile({ ...newProfile, label: e.target.value })}
                    placeholder="Nome profilo..."
                    autoFocus
                    className="w-full px-2 py-1 border border-blue-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <select
                    value={newProfile.seniority}
                    onChange={(e) => setNewProfile({ ...newProfile, seniority: e.target.value })}
                    className={`w-full px-2 py-1.5 text-center text-xs font-semibold border rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-blue-500
                               ${getSeniorityStyle(newProfile.seniority).className}`}
                  >
                    {SENIORITY_OPTIONS.map(s => (
                      <option key={s.value} value={s.value}>{s.icon} {s.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={newProfile.fte}
                    onChange={(e) => setNewProfile({ ...newProfile, fte: parseFloat(e.target.value) || 0 })}
                    step="0.1"
                    min="0"
                    className="w-full px-2 py-1 text-center border border-blue-300 rounded
                               focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2">
                  <div className="px-2 py-1 text-center bg-blue-100 rounded text-blue-700">
                    {Math.round(newProfile.fte * DAYS_PER_FTE)}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="px-2 py-1 text-center bg-blue-100 rounded text-blue-700 font-semibold">
                    {Math.round(newProfile.fte * DAYS_PER_FTE * durationYears)}
                  </div>
                </td>
                {tows.map(tow => (
                  <td key={tow.tow_id} className="px-3 py-2 text-center text-slate-400">-</td>
                ))}
                <td className="px-4 py-2">
                  <div className="flex gap-1">
                    <button
                      onClick={handleAddProfile}
                      disabled={!newProfile.label.trim()}
                      className="p-1 text-green-600 hover:bg-green-100 rounded
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Salva profilo"
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

      {/* Footer con totali */}
      {team.length > 0 && (
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">Totale:</span>
              </div>
              <div className="px-3 py-1 bg-blue-100 rounded-lg">
                <span className="text-sm font-semibold text-blue-700">
                  {totalFte.toFixed(1)} FTE
                </span>
              </div>
              <div className="px-3 py-1 bg-slate-200 rounded-lg">
                <span className="text-sm font-semibold text-slate-700">
                  {totalDays.toLocaleString()} GG/anno
                </span>
              </div>
              <div className="px-3 py-1 bg-blue-200 rounded-lg">
                <span className="text-sm font-semibold text-blue-800">
                  {Math.round(totalDaysOverall).toLocaleString()} GG totali
                </span>
              </div>
            </div>
            <div className="text-xs text-slate-400">
              1 FTE = {DAYS_PER_FTE} GG/anno · Durata: {durationMonths} mesi ({durationYears.toFixed(1)} anni)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
