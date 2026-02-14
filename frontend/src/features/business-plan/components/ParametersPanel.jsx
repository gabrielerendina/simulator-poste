import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings2, Percent, Plus, Trash2, Edit3, Lock, Unlock } from 'lucide-react';

const DAYS_PER_FTE = 220;

/**
 * ParametersPanel - Pannello per parametri generali BP
 * Gestisce: governance (con distribuzione profili Lutech), risk_contingency, reuse_factor, duration_months
 */
export default function ParametersPanel({
  values = {},
  practices = [],
  totalTeamFte = 0,
  onChange,
  disabled = false
}) {
  const { t } = useTranslation();

  const defaults = {
    duration_months: 36,
    governance_pct: 10,
    risk_contingency_pct: 5,
    reuse_factor: 0,
    governance_profile_mix: [],
    governance_cost_manual: null,
  };

  const current = { ...defaults, ...values };

  const handleChange = (field, value) => {
    const numValue = parseFloat(value) || 0;
    onChange?.({ ...current, [field]: numValue });
  };

  const handleFieldChange = (field, value) => {
    onChange?.({ ...current, [field]: value });
  };

  // Catalogo profili Lutech flat
  const lutechProfiles = useMemo(() => {
    return practices.flatMap(practice =>
      (practice.profiles || []).map(profile => ({
        ...profile,
        practice_id: practice.id,
        practice_label: practice.label,
        full_id: `${practice.id}:${profile.id}`,
      }))
    );
  }, [practices]);

  // Governance FTE
  const governanceFte = totalTeamFte * (current.governance_pct / 100);

  // Governance mix: calcola tariffa media dalla distribuzione
  const governanceMixInfo = useMemo(() => {
    const mix = current.governance_profile_mix || [];
    if (mix.length === 0 || lutechProfiles.length === 0) {
      return { avgRate: 0, totalPct: 0, isComplete: false };
    }

    let totalPct = 0;
    let weightedRate = 0;

    for (const item of mix) {
      const profile = lutechProfiles.find(p => p.full_id === item.lutech_profile);
      if (profile) {
        const pct = (item.pct || 0) / 100;
        totalPct += pct;
        weightedRate += (profile.daily_rate || 0) * pct;
      }
    }

    const avgRate = totalPct > 0 ? weightedRate / totalPct : 0;
    return {
      avgRate,
      totalPct: totalPct * 100,
      isComplete: Math.abs(totalPct - 1) < 0.01,
    };
  }, [current.governance_profile_mix, lutechProfiles]);

  // Governance cost calcolato
  const durationYears = (current.duration_months || 36) / 12;
  const calculatedGovernanceCost = governanceFte * DAYS_PER_FTE * durationYears * governanceMixInfo.avgRate;

  // Costo effettivo: manuale o calcolato
  const isManualOverride = current.governance_cost_manual !== null && current.governance_cost_manual !== undefined;
  const effectiveGovernanceCost = isManualOverride ? current.governance_cost_manual : calculatedGovernanceCost;

  // --- Governance mix handlers ---
  const handleAddGovProfile = () => {
    const mix = [...(current.governance_profile_mix || [])];
    const remaining = 100 - mix.reduce((sum, m) => sum + (m.pct || 0), 0);
    mix.push({ lutech_profile: '', pct: Math.max(0, remaining) });
    handleFieldChange('governance_profile_mix', mix);
  };

  const handleRemoveGovProfile = (index) => {
    const mix = (current.governance_profile_mix || []).filter((_, i) => i !== index);
    handleFieldChange('governance_profile_mix', mix);
  };

  const handleUpdateGovProfile = (index, field, value) => {
    const mix = (current.governance_profile_mix || []).map((m, i) => {
      if (i !== index) return m;
      return { ...m, [field]: field === 'pct' ? (parseFloat(value) || 0) : value };
    });
    handleFieldChange('governance_profile_mix', mix);
  };

  const toggleManualOverride = () => {
    if (isManualOverride) {
      handleFieldChange('governance_cost_manual', null);
    } else {
      handleFieldChange('governance_cost_manual', Math.round(calculatedGovernanceCost));
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(val);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">
              {t('business_plan.parameters')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('business_plan.parameters_desc')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Durata contratto */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            {t('business_plan.duration_months')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={12}
              max={60}
              value={current.duration_months}
              onChange={(e) => handleChange('duration_months', e.target.value)}
              disabled={disabled}
              className="w-24 px-3 py-2 text-center border border-slate-200 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                         disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-slate-500">mesi</span>
          </div>
        </div>

        <div className="h-px bg-slate-100" />

        {/* Governance % e Risk Contingency % su una riga */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              {t('business_plan.governance')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={25}
                step={0.5}
                value={current.governance_pct}
                onChange={(e) => handleChange('governance_pct', e.target.value)}
                disabled={disabled}
                className="w-20 px-3 py-2 text-center border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              {t('business_plan.risk_contingency')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={current.risk_contingency_pct}
                onChange={(e) => handleChange('risk_contingency_pct', e.target.value)}
                disabled={disabled}
                className="w-20 px-3 py-2 text-center border border-slate-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                           disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>
        </div>

        {/* Governance: FTE e distribuzione profili Lutech */}
        {totalTeamFte > 0 && (
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-700 uppercase">Governance Team</span>
              <span className="text-xs text-blue-600">
                {governanceFte.toFixed(2)} FTE ({Math.round(governanceFte * DAYS_PER_FTE)} GG/anno)
              </span>
            </div>

            {/* Mix profili governance */}
            <div className="space-y-2">
              {(current.governance_profile_mix || []).map((item, idx) => {
                const profile = lutechProfiles.find(p => p.full_id === item.lutech_profile);
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={item.lutech_profile}
                      onChange={(e) => handleUpdateGovProfile(idx, 'lutech_profile', e.target.value)}
                      disabled={disabled}
                      className="flex-1 px-2 py-1.5 border border-blue-200 rounded-md text-xs
                                 focus:border-blue-500 focus:outline-none bg-white"
                    >
                      <option value="">-- Profilo --</option>
                      {practices.map(p => (
                        <optgroup key={p.id} label={p.label}>
                          {(p.profiles || []).map(prof => (
                            <option key={`${p.id}:${prof.id}`} value={`${p.id}:${prof.id}`}>
                              {prof.label} - €{prof.daily_rate}/gg
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.pct}
                      onChange={(e) => handleUpdateGovProfile(idx, 'pct', e.target.value)}
                      disabled={disabled}
                      min={0}
                      max={100}
                      step={5}
                      className="w-16 px-2 py-1.5 text-center text-xs border border-blue-200 rounded-md
                                 focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-xs text-blue-600">%</span>
                    <button
                      onClick={() => handleRemoveGovProfile(idx)}
                      disabled={disabled}
                      className="p-1 text-blue-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              <button
                onClick={handleAddGovProfile}
                disabled={disabled}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium
                           text-blue-600 hover:bg-blue-100 rounded-md"
              >
                <Plus className="w-3 h-3" />
                Profilo
              </button>
            </div>

            {/* Risultato governance */}
            {governanceMixInfo.avgRate > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                <div className="text-xs text-blue-700">
                  <div>Tariffa media gov: <strong>€{governanceMixInfo.avgRate.toFixed(0)}/gg</strong></div>
                  <div className={governanceMixInfo.isComplete ? 'text-green-600' : 'text-amber-600'}>
                    Distribuzione: {governanceMixInfo.totalPct.toFixed(0)}%
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-blue-600">Costo Calcolato</div>
                  <div className="text-sm font-bold text-blue-700">
                    {formatCurrency(calculatedGovernanceCost)}
                  </div>
                </div>
              </div>
            )}

            {/* Manual override */}
            <div className="flex items-center gap-2 pt-2 border-t border-blue-200">
              <button
                onClick={toggleManualOverride}
                disabled={disabled}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded-md border ${
                  isManualOverride
                    ? 'bg-amber-100 border-amber-300 text-amber-700'
                    : 'bg-white border-blue-200 text-blue-600 hover:bg-blue-50'
                }`}
              >
                {isManualOverride ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {isManualOverride ? 'Manuale' : 'Override'}
              </button>
              {isManualOverride && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-amber-600">€</span>
                  <input
                    type="number"
                    value={current.governance_cost_manual}
                    onChange={(e) => handleFieldChange('governance_cost_manual', parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    step={1000}
                    className="w-28 px-2 py-1 text-xs text-right border border-amber-300 rounded-md
                               focus:border-amber-500 focus:outline-none bg-amber-50"
                  />
                </div>
              )}
              <div className="ml-auto text-xs font-semibold text-blue-800">
                = {formatCurrency(effectiveGovernanceCost)}
              </div>
            </div>
          </div>
        )}

        <div className="h-px bg-slate-100" />

        {/* Fattore Riuso */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">
              {t('business_plan.reuse_factor')}
            </label>
            <div className="flex items-center gap-1 px-2 py-1 bg-emerald-100 rounded-lg">
              <span className="text-sm font-semibold text-emerald-700">
                {current.reuse_factor}
              </span>
              <span className="text-xs text-emerald-600">%</span>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={80}
            step={1}
            value={current.reuse_factor}
            onChange={(e) => handleChange('reuse_factor', e.target.value)}
            disabled={disabled}
            className="w-full h-2 bg-emerald-100 rounded-lg appearance-none cursor-pointer
                       accent-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span>80%</span>
          </div>
          <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-lg">
            <strong>Formula:</strong> Costo Effettivo = Costo Base × (1 - {current.reuse_factor}%) = Costo Base × {(1 - current.reuse_factor / 100).toFixed(2)}
          </p>
          <p className="text-xs text-slate-400 italic">
            Efficienza da riuso asset, know-how, acceleratori interni
          </p>
        </div>

        {/* Summary */}
        <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
          <div className="flex items-center gap-2 mb-2">
            <Percent className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-slate-700">Overhead Totale</span>
          </div>
          <div className="text-2xl font-bold text-blue-700">
            {(current.governance_pct + current.risk_contingency_pct).toFixed(1)}%
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Governance + Risk Contingency
          </p>
        </div>
      </div>
    </div>
  );
}
