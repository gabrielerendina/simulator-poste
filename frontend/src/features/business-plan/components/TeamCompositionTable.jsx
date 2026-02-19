import { useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Trash2, Upload, Calculator, Save, X, GraduationCap, TrendingDown, ChevronDown, ChevronUp, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { DAYS_PER_FTE } from '../constants';

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
  durationMonths,
  daysPerFte = 220,
  onChange,
  disabled = false,
  volumeAdjustments = {},
  reuseFactor = 0,
}) {
  const { t } = useTranslation();
  const [showAddRow, setShowAddRow] = useState(false);
  const [newProfile, setNewProfile] = useState({
    profile_id: '',
    label: '',
    seniority: 'mid',
    fte: 1,
    days_year: daysPerFte,
    tow_allocation: {}
  });
  const [expandedRows, setExpandedRows] = useState(new Set());

  const toggleRow = (profileId) => {
    const next = new Set(expandedRows);
    if (next.has(profileId)) {
      next.delete(profileId);
    } else {
      next.add(profileId);
    }
    setExpandedRows(next);
  };

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

  // Compute weighted profile adjustment factor per profile across all periods
  const adjustedFteMap = useMemo(() => {
    const periods = volumeAdjustments?.periods || [{
      month_start: 1,
      month_end: durationMonths,
      by_tow: volumeAdjustments?.by_tow || {},
      by_profile: volumeAdjustments?.by_profile || {},
    }];
    const reuseMultiplier = 1 - ((reuseFactor || 0) / 100);

    const result = {};
    for (const member of team) {
      const profileId = member.profile_id || member.label;
      const fte = parseFloat(member.fte) || 0;
      const towAllocation = member.tow_allocation || {};

      let totalMonths = 0;
      let weightedFte = 0;
      const periodDetails = [];

      for (const period of periods) {
        const start = period.month_start || 1;
        const end = period.month_end || durationMonths;
        const months = end - start + 1;

        // Factors
        const pFactor = period.by_profile?.[profileId] ?? 1.0;

        // Member-specific TOW factor
        let towFactor = 0;
        let totalAllocatedPct = 0;
        const towBreakdown = [];
        for (const [towId, pct] of Object.entries(towAllocation)) {
          const tPct = parseFloat(pct) || 0;
          if (tPct > 0) {
            const tFactor = period.by_tow?.[towId] ?? 1.0;
            towFactor += (tPct / 100) * tFactor;
            totalAllocatedPct += (tPct / 100);
            if (tFactor < 1.0) {
              towBreakdown.push({ towId, factor: tFactor, pct: tPct });
            }
          }
        }
        const finalTowFactor = totalAllocatedPct > 0 ? (towFactor / totalAllocatedPct) : 1.0;

        const effectiveFte = fte * pFactor * reuseMultiplier * finalTowFactor;
        weightedFte += effectiveFte * months;
        totalMonths += months;

        periodDetails.push({
          start, end, pFactor, finalTowFactor, reuseMultiplier,
          effectiveFte: Math.round(effectiveFte * 100) / 100,
          towBreakdown
        });
      }

      const avgFte = totalMonths > 0 ? weightedFte / totalMonths : fte;
      result[profileId] = {
        adjustedFte: Math.round(avgFte * 100) / 100,
        delta: Math.round((avgFte - fte) * 100) / 100,
        periodDetails,
      };
    }
    return result;
  }, [team, volumeAdjustments, reuseFactor, durationMonths]);

  const hasAnyAdjustment = Object.values(adjustedFteMap).some(v => v.delta !== 0);

  // Validazione allocazioni TOW per profilo
  const allocationValidation = useMemo(() => {
    const result = {};
    for (const profile of team) {
      const profileId = profile.profile_id || profile.label;
      const allocation = profile.tow_allocation || {};
      const total = Object.values(allocation).reduce((sum, pct) => sum + (parseFloat(pct) || 0), 0);
      const isValid = Math.abs(total - 100) < 0.1;
      result[profileId] = { total, isValid };
    }
    return result;
  }, [team]);

  const hasInvalidAllocations = Object.values(allocationValidation).some(v => !v.isValid);
  const invalidProfiles = team.filter(p => {
    const profileId = p.profile_id || p.label;
    return !allocationValidation[profileId]?.isValid;
  });

  // Calcoli totali
  const durationYears = durationMonths / 12;
  const totalFte = team.reduce((sum, p) => sum + (parseFloat(p.fte) || 0), 0);
  const totalAdjustedFte = Object.values(adjustedFteMap).reduce((sum, v) => sum + v.adjustedFte, 0);
  const totalDays = team.reduce((sum, p) => sum + (parseFloat(p.days_year) || 0), 0);
  const totalDaysOverall = totalDays * durationYears;
  const savingsPct = totalFte > 0 ? ((totalFte - totalAdjustedFte) / totalFte * 100) : 0;

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 glass-card-header">
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
              <th className="px-4 py-3 w-8"></th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Profilo</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">Seniority</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-24">FTE</th>
              {hasAnyAdjustment && (
                <>
                  <th className="px-4 py-3 text-center font-semibold text-emerald-700 w-24" title="FTE dopo rettifica volumi e riuso">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      FTE Eff.
                    </div>
                  </th>
                  <th className="px-3 py-3 text-center font-semibold text-slate-500 w-16">Δ</th>
                </>
              )}
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">GG/Anno</th>
              <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">GG Totale</th>
              {tows.map(tow => (
                <th key={tow.tow_id} className="px-3 py-3 text-center font-semibold text-slate-600 w-20">
                  <div className="truncate" title={tow.label}>
                    {tow.tow_id}
                  </div>
                </th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-slate-600 w-20">Tot %</th>
              <th className="px-4 py-3 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {team.length === 0 && !showAddRow ? (
              <tr>
                <td colSpan={(hasAnyAdjustment ? 8 : 6) + tows.length + 1} className="px-4 py-8 text-center text-slate-500">
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
              team.map((profile, idx) => {
                const profileId = profile.profile_id || profile.label;
                const isExpanded = expandedRows.has(profileId);
                const adj = adjustedFteMap[profileId];

                return (
                  <Fragment key={idx}>
                    <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50/50' : ''}`}>
                      <td className="px-2 py-2 text-center text-slate-400">
                        <button
                          onClick={() => toggleRow(profileId)}
                          className="p-1 hover:bg-slate-200 rounded-md transition-colors"
                          title={isExpanded ? "Comprimi dettagli" : "Espandi dettagli fasi"}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </td>
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
                      {hasAnyAdjustment && (() => {
                        const isReduced = adj && adj.delta < 0;
                        const fte = parseFloat(profile.fte) || 0;
                        // Build per-period tooltip
                        const tooltip = adj?.periodDetails?.map(p => {
                          const lines = [`Mese ${p.start}-${p.end}: ${fte.toFixed(1)} → ${p.effectiveFte.toFixed(1)} FTE`];
                          if (p.pFactor < 1.0) lines.push(`  • Rettifica Profilo: ${Math.round(p.pFactor * 100)}%`);
                          if (p.reuseMultiplier < 1.0) lines.push(`  • Riuso: ${Math.round(p.reuseMultiplier * 100)}%`);
                          if (p.finalTowFactor < 1.0) {
                            lines.push(`  • Riduzione TOW: ${Math.round(p.finalTowFactor * 100)}%`);
                            p.towBreakdown.forEach(tb => {
                              lines.push(`    - ${tb.towId}: ${Math.round(tb.factor * 100)}% (all. ${tb.pct}%)`);
                            });
                          }
                          return lines.join('\n');
                        }).join('\n\n');
                        return (
                          <>
                            <td className="px-4 py-2">
                              <div
                                title={tooltip}
                                className={`px-2 py-1 text-center rounded font-semibold cursor-help ${isReduced
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600'
                                  }`}
                              >
                                {adj ? adj.adjustedFte.toFixed(1) : fte.toFixed(1)}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              {isReduced ? (
                                <div className="px-1.5 py-0.5 text-center text-xs font-bold rounded-md bg-red-50 text-red-600 border border-red-200">
                                  {adj.delta.toFixed(1)}
                                </div>
                              ) : (
                                <div className="px-1.5 py-0.5 text-center text-xs text-slate-400">—</div>
                              )}
                            </td>
                          </>
                        );
                      })()}
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
                      <td className="px-3 py-2">
                        {(() => {
                          const validation = allocationValidation[profileId];
                          if (!validation) return null;
                          const isValid = validation.isValid;
                          const total = validation.total;
                          return (
                            <div className={`px-2 py-1 text-center rounded-lg text-xs font-bold flex items-center justify-center gap-1
                                          ${isValid
                                            ? 'bg-green-100 text-green-700 border border-green-300'
                                            : 'bg-red-100 text-red-700 border border-red-300'}`}
                              title={isValid ? 'Allocazione corretta' : `Allocazione non valida: ${total.toFixed(1)}% (deve essere 100%)`}
                            >
                              {isValid ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                              {total.toFixed(0)}%
                            </div>
                          );
                        })()}
                      </td>
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

                    {/* Dettaglio Espanso (Time Slices) */}
                    {isExpanded && adj && adj.periodDetails && (
                      <tr className="bg-slate-50/80">
                        <td colSpan={(hasAnyAdjustment ? 9 : 7) + tows.length + 1} className="px-8 py-3 bg-slate-50/50">
                          <div className="border-l-2 border-blue-200 pl-6 space-y-2">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                              <Calendar className="w-3 h-3" />
                              Dettaglio Fasi e Riduzioni (Time Slices)
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {adj.periodDetails.map((p, pIdx) => (
                                <div key={pIdx} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-xs">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">Mesi {p.start} - {p.end}</span>
                                    <span className="font-bold text-slate-700">{p.effectiveFte.toFixed(2)} FTE eff.</span>
                                  </div>
                                  <div className="space-y-1 text-slate-500">
                                    <div className="flex justify-between items-center opacity-70">
                                      <span>FTE Base:</span>
                                      <span className="font-medium">{parseFloat(profile.fte).toFixed(1)}</span>
                                    </div>
                                    {p.pFactor < 1.0 && (
                                      <div className="flex justify-between items-center text-emerald-600">
                                        <span>Fattore Profilo:</span>
                                        <span className="font-medium">-{Math.round((1 - p.pFactor) * 100)}%</span>
                                      </div>
                                    )}
                                    {p.reuseMultiplier < 1.0 && (
                                      <div className="flex justify-between items-center text-blue-600">
                                        <span>Fattore Riuso:</span>
                                        <span className="font-medium">-{Math.round((1 - p.reuseMultiplier) * 100)}%</span>
                                      </div>
                                    )}
                                    {p.finalTowFactor < 1.0 && (
                                      <div className="flex flex-col gap-1 pt-1 border-t border-slate-50 mt-1">
                                        <div className="flex justify-between items-center text-amber-600 font-medium">
                                          <span>Riduzione TOW:</span>
                                          <span>-{Math.round((1 - p.finalTowFactor) * 100)}%</span>
                                        </div>
                                        {p.towBreakdown.map(tb => (
                                          <div key={tb.towId} className="flex justify-between items-center pl-2 text-[10px] opacity-80">
                                            <span>{tb.towId} ({tb.pct}%):</span>
                                            <span>-{Math.round((1 - tb.factor) * 100)}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}

            {/* Riga per aggiunta nuovo profilo */}
            {showAddRow && (
              <tr className="bg-blue-50">
                <td className="px-4 py-2"></td>
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
                <td className="px-3 py-2 text-center text-slate-400">-</td>
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
        <>
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
                {hasAnyAdjustment && (
                  <>
                    <span className="text-slate-400">→</span>
                    <div className="px-3 py-1 bg-emerald-100 rounded-lg border border-emerald-200">
                      <span className="text-sm font-semibold text-emerald-700">
                        {totalAdjustedFte.toFixed(1)} FTE eff.
                      </span>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-xs font-bold ${savingsPct > 0
                      ? 'bg-red-50 text-red-600 border border-red-200'
                      : 'bg-slate-100 text-slate-500'
                      }`}>
                      {savingsPct > 0 ? `−${savingsPct.toFixed(1)}%` : '—'}
                    </div>
                  </>
                )}
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

          {/* Warning se ci sono allocazioni TOW non valide */}
          {hasInvalidAllocations && (
            <div className="px-4 py-2 bg-red-50 border-t border-red-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-red-700 mb-1">
                    Allocazione TOW non valida per {invalidProfiles.length} profil{invalidProfiles.length > 1 ? 'i' : 'o'}:
                  </p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {invalidProfiles.map(p => {
                      const profileId = p.profile_id || p.label;
                      const validation = allocationValidation[profileId];
                      return (
                        <li key={profileId}>
                          <strong>{p.label}</strong>: {validation.total.toFixed(1)}% (deve essere 100%)
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-red-600 mt-1 italic">
                    La somma delle percentuali di allocazione ai TOW deve essere esattamente 100% per ogni profilo.
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
