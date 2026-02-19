import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings2,
  Percent,
  Plus,
  Trash2,
  Edit3,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Save,
  Shield,
  Zap,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

/**
 * ParametersPanel - Pannello per parametri generali BP
 * Gestisce: governance (con 4 modalità), risk_contingency, reuse_factor
 *
 * Governance Modes:
 * - percentage: governance come % del team
 * - fte: governance come FTE con time slices
 * - manual: costo governance inserito manualmente
 * - team_mix: governance calcolata da mix profili Lutech
 */
export default function ParametersPanel({
  values = {},
  practices = [],
  totalTeamFte = 0,
  teamCost = 0,
  durationMonths,
  daysPerFte = 220,
  onChange,
  disabled = false,
}) {
  const { t } = useTranslation();
  const [expandedPeriod, setExpandedPeriod] = useState(null);
  const [governanceExpanded, setGovernanceExpanded] = useState(true);

  const defaults = {
    governance_pct: 4,
    risk_contingency_pct: 3,
    reuse_factor: 0,
    governance_profile_mix: [],
    governance_cost_manual: null,
    governance_mode: 'percentage',
    governance_fte_periods: [],
    governance_apply_reuse: false,
    inflation_pct: 0,
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
    return practices.flatMap((practice) =>
      (practice.profiles || []).map((profile) => ({
        ...profile,
        practice_id: practice.id,
        practice_label: practice.label,
        full_id: `${practice.id}:${profile.id}`,
      }))
    );
  }, [practices]);

  // Governance FTE based on percentage
  const governanceFteFromPct = totalTeamFte * (current.governance_pct / 100);
  const durationYears = durationMonths / 12;

  // === CALCULATE GOVERNANCE COST FOR ALL MODES ===
  const governanceCalc = useMemo(() => {
    const mode = current.governance_mode;
    let baseCost = 0;
    let description = '';
    let details = {};

    if (mode === 'percentage') {
      baseCost = teamCost * (current.governance_pct / 100);
      description = `${current.governance_pct}% del costo team`;
      details = { pct: current.governance_pct, teamCost };
    } else if (mode === 'manual') {
      baseCost = current.governance_cost_manual || 0;
      description = 'Importo inserito manualmente';
      details = { manual: true };
    } else if (mode === 'fte') {
      let totalCost = 0;
      let totalFte = 0;
      let avgRate = 0;

      for (const period of current.governance_fte_periods || []) {
        const periodFte = parseFloat(period.fte) || 0;
        const periodMonths =
          (period.month_end || durationMonths) - (period.month_start || 1) + 1;
        const periodYears = periodMonths / 12;

        const mix = period.team_mix || [];
        let periodAvgRate = 0;
        let totalPct = 0;

        for (const item of mix) {
          const profile = lutechProfiles.find(
            (p) => p.full_id === item.lutech_profile
          );
          if (profile) {
            const pct = (item.pct || 0) / 100;
            totalPct += pct;
            periodAvgRate += (profile.daily_rate || 0) * pct;
          }
        }

        if (totalPct > 0) periodAvgRate = periodAvgRate / totalPct;

        totalCost += periodFte * periodAvgRate * daysPerFte * periodYears;
        totalFte += periodFte;
        avgRate += periodAvgRate * periodFte;
      }

      baseCost = totalCost;
      const avgFte =
        (current.governance_fte_periods || []).length > 0
          ? totalFte / (current.governance_fte_periods || []).length
          : 0;
      description = `${avgFte.toFixed(1)} FTE medi`;
      details = {
        totalFte,
        avgRate: totalFte > 0 ? avgRate / totalFte : 0,
        periods: (current.governance_fte_periods || []).length,
      };
    } else if (mode === 'team_mix') {
      const mix = current.governance_profile_mix || [];
      let weightedRate = 0;
      let totalPct = 0;

      for (const item of mix) {
        const profile = lutechProfiles.find(
          (p) => p.full_id === item.lutech_profile
        );
        if (profile) {
          const pct = (item.pct || 0) / 100;
          totalPct += pct;
          weightedRate += (profile.daily_rate || 0) * pct;
        }
      }

      const avgRate = totalPct > 0 ? weightedRate / totalPct : 0;
      baseCost = governanceFteFromPct * daysPerFte * durationYears * avgRate;
      description = `${governanceFteFromPct.toFixed(1)} FTE @ €${avgRate.toFixed(0)}/gg`;
      details = { fte: governanceFteFromPct, avgRate, totalPct: totalPct * 100 };
    }

    // Apply reuse factor if enabled
    let finalCost = baseCost;
    if (current.governance_apply_reuse && (current.reuse_factor || 0) > 0) {
      const reuseFactor = (current.reuse_factor || 0) / 100;
      finalCost = baseCost * (1 - reuseFactor);
    }

    return {
      baseCost,
      finalCost,
      description,
      details,
      reuseApplied: current.governance_apply_reuse && current.reuse_factor > 0,
      reuseSavings: baseCost - finalCost,
    };
  }, [
    current.governance_mode,
    current.governance_pct,
    current.governance_cost_manual,
    current.governance_fte_periods,
    current.governance_profile_mix,
    current.governance_apply_reuse,
    current.reuse_factor,
    teamCost,
    governanceFteFromPct,
    durationYears,
    daysPerFte,
    durationMonths,
    lutechProfiles,
  ]);

  // === MODE CONFIGS ===
  const governanceModes = [
    {
      value: 'percentage',
      label: 'Percentuale',
      icon: Percent,
      desc: '% del team',
    },
    {
      value: 'fte',
      label: 'FTE Slices',
      icon: Calendar,
      desc: 'Per periodo',
    },
    {
      value: 'manual',
      label: 'Manuale',
      icon: Edit3,
      desc: 'Importo fisso',
    },
    {
      value: 'team_mix',
      label: 'Mix Profili',
      icon: Settings2,
      desc: 'Da tariffa media',
    },
  ];

  // --- Handlers ---
  const handleAddFtePeriod = () => {
    const periods = current.governance_fte_periods || [];
    let lastMonth = 0;
    periods.forEach((p) => {
      if (p.month_end && p.month_end > lastMonth) lastMonth = p.month_end;
    });

    const newMonthStart = lastMonth + 1;
    const newMonthEnd = Math.min(newMonthStart + 11, durationMonths);

    const newPeriods = [
      ...periods,
      {
        month_start: newMonthStart,
        month_end: newMonthEnd,
        fte: 1.0,
        team_mix: [],
      },
    ];

    handleFieldChange('governance_fte_periods', newPeriods);
    setExpandedPeriod(newPeriods.length - 1);
  };

  const handleRemoveFtePeriod = (index) => {
    const newPeriods = (current.governance_fte_periods || []).filter(
      (_, i) => i !== index
    );
    handleFieldChange('governance_fte_periods', newPeriods);
  };

  const handleUpdateFtePeriod = (index, field, value) => {
    const periods = (current.governance_fte_periods || []).map((p, i) => {
      if (i !== index) return p;
      return { ...p, [field]: value };
    });
    handleFieldChange('governance_fte_periods', periods);
  };

  const handleAddMixToFtePeriod = (periodIndex) => {
    const periods = (current.governance_fte_periods || []).map((p, i) => {
      if (i !== periodIndex) return p;
      const mix = [...(p.team_mix || [])];
      const remaining = 100 - mix.reduce((sum, m) => sum + (m.pct || 0), 0);
      mix.push({ lutech_profile: '', pct: Math.max(0, remaining) });
      return { ...p, team_mix: mix };
    });
    handleFieldChange('governance_fte_periods', periods);
  };

  const handleRemoveMixFromFtePeriod = (periodIndex, mixIndex) => {
    const periods = (current.governance_fte_periods || []).map((p, i) => {
      if (i !== periodIndex) return p;
      return {
        ...p,
        team_mix: (p.team_mix || []).filter((_, mi) => mi !== mixIndex),
      };
    });
    handleFieldChange('governance_fte_periods', periods);
  };

  const handleUpdateFtePeriodMix = (periodIndex, mixIndex, field, value) => {
    const periods = (current.governance_fte_periods || []).map((p, i) => {
      if (i !== periodIndex) return p;
      const mix = (p.team_mix || []).map((m, mi) => {
        if (mi !== mixIndex) return m;
        return {
          ...m,
          [field]: field === 'pct' ? parseFloat(value) || 0 : value,
        };
      });
      return { ...p, team_mix: mix };
    });
    handleFieldChange('governance_fte_periods', periods);
  };

  const handleSyncFtePeriods = () => {
    const defaultPeriod = {
      month_start: 1,
      month_end: durationMonths,
      fte: governanceFteFromPct || 1,
      team_mix: current.governance_profile_mix || [],
    };
    handleFieldChange('governance_fte_periods', [defaultPeriod]);
    setExpandedPeriod(0);
  };

  const handleAddGovProfile = () => {
    const mix = [...(current.governance_profile_mix || [])];
    const remaining = 100 - mix.reduce((sum, m) => sum + (m.pct || 0), 0);
    mix.push({ lutech_profile: '', pct: Math.max(0, remaining) });
    handleFieldChange('governance_profile_mix', mix);
  };

  const handleRemoveGovProfile = (index) => {
    const mix = (current.governance_profile_mix || []).filter(
      (_, i) => i !== index
    );
    handleFieldChange('governance_profile_mix', mix);
  };

  const handleUpdateGovProfile = (index, field, value) => {
    const mix = (current.governance_profile_mix || []).map((m, i) => {
      if (i !== index) return m;
      return { ...m, [field]: field === 'pct' ? parseFloat(value) || 0 : value };
    });
    handleFieldChange('governance_profile_mix', mix);
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const getPeriodLabel = (period) => {
    const start = period.month_start || 1;
    const end = period.month_end || durationMonths;
    return `Mesi ${start}-${end}`;
  };

  const getPeriodMixInfo = (period) => {
    const mix = period.team_mix || [];
    if (mix.length === 0) return { avgRate: 0, totalPct: 0 };

    let totalPct = 0;
    let weightedRate = 0;

    for (const item of mix) {
      const profile = lutechProfiles.find((p) => p.full_id === item.lutech_profile);
      if (profile) {
        const pct = (item.pct || 0) / 100;
        totalPct += pct;
        weightedRate += (profile.daily_rate || 0) * pct;
      }
    }

    const avgRate = totalPct > 0 ? weightedRate / totalPct : 0;
    return { avgRate, totalPct: totalPct * 100 };
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <Settings2 className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {t('business_plan.parameters')}
              </h3>
              <p className="text-xs text-slate-500">
                Governance, Risk, Fattore Riuso
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {/* ═══ GOVERNANCE SECTION ═══ */}
        <div className="p-4">
          {/* Governance Header - clickable to expand/collapse */}
          <button
            onClick={() => setGovernanceExpanded(!governanceExpanded)}
            className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100 hover:border-blue-200 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-white" />
              </div>
              <div className="text-left">
                <div className="font-semibold text-blue-900">Governance</div>
                <div className="text-xs text-blue-600">
                  {governanceCalc.description}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Always show the calculated cost */}
              <div className="text-right">
                <div className="text-lg font-bold text-blue-700">
                  {formatCurrency(governanceCalc.finalCost)}
                </div>
                {governanceCalc.reuseApplied && (
                  <div className="text-[10px] text-emerald-600 font-medium">
                    -{current.reuse_factor}% riuso
                  </div>
                )}
              </div>
              {governanceExpanded ? (
                <ChevronUp className="w-5 h-5 text-blue-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-blue-400" />
              )}
            </div>
          </button>

          {/* Governance Content */}
          {governanceExpanded && (
            <div className="mt-4 space-y-4">
              {/* Mode Selector - Compact Pills */}
              <div className="flex flex-wrap gap-2">
                {governanceModes.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = current.governance_mode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() =>
                        handleFieldChange('governance_mode', mode.value)
                      }
                      disabled={disabled}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        disabled:opacity-50 disabled:cursor-not-allowed ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>

              {/* MODE: PERCENTAGE */}
              {current.governance_mode === 'percentage' && (
                <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={25}
                      step={0.5}
                      value={current.governance_pct}
                      onChange={(e) =>
                        handleChange('governance_pct', e.target.value)
                      }
                      disabled={disabled}
                      className="w-16 px-2 py-1.5 text-center text-sm font-semibold border border-slate-200 rounded-lg
                                 focus:outline-none focus:ring-2 focus:ring-blue-500
                                 disabled:bg-slate-100 disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    = {governanceFteFromPct.toFixed(2)} FTE equivalenti
                  </div>
                </div>
              )}

              {/* MODE: FTE */}
              {current.governance_mode === 'fte' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      Periodi FTE
                    </span>
                    <button
                      onClick={handleSyncFtePeriods}
                      disabled={disabled}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Sincronizza
                    </button>
                  </div>

                  {(current.governance_fte_periods || []).length === 0 && (
                    <div className="text-center py-4 text-slate-400 text-xs bg-slate-50 rounded-lg">
                      Nessun periodo. Clicca "Aggiungi" o "Sincronizza"
                    </div>
                  )}

                  {(current.governance_fte_periods || []).map((period, idx) => {
                    const isExpanded = expandedPeriod === idx;
                    const mixInfo = getPeriodMixInfo(period);
                    return (
                      <div
                        key={idx}
                        className="border border-slate-200 rounded-lg overflow-hidden bg-white"
                      >
                        <button
                          onClick={() =>
                            setExpandedPeriod(isExpanded ? null : idx)
                          }
                          className="w-full flex items-center justify-between p-2 hover:bg-slate-50"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-slate-400" />
                            <span className="text-xs font-medium text-slate-700">
                              {getPeriodLabel(period)}
                            </span>
                            <span className="text-xs text-slate-500">
                              · {period.fte || 0} FTE
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveFtePeriod(idx);
                              }}
                              disabled={disabled}
                              className="p-1 text-slate-300 hover:text-red-500"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-3">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-500">
                                  Mese Inizio
                                </label>
                                <input
                                  type="number"
                                  value={period.month_start || 1}
                                  onChange={(e) =>
                                    handleUpdateFtePeriod(
                                      idx,
                                      'month_start',
                                      parseInt(e.target.value) || 1
                                    )
                                  }
                                  disabled={disabled}
                                  min={1}
                                  max={durationMonths}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">
                                  Mese Fine
                                </label>
                                <input
                                  type="number"
                                  value={period.month_end || durationMonths}
                                  onChange={(e) =>
                                    handleUpdateFtePeriod(
                                      idx,
                                      'month_end',
                                      parseInt(e.target.value) || durationMonths
                                    )
                                  }
                                  disabled={disabled}
                                  min={1}
                                  max={durationMonths}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500">
                                  FTE
                                </label>
                                <input
                                  type="number"
                                  value={period.fte || 0}
                                  onChange={(e) =>
                                    handleUpdateFtePeriod(
                                      idx,
                                      'fte',
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  disabled={disabled}
                                  min={0}
                                  step={0.1}
                                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] text-slate-500">
                                Mix Profili
                              </label>
                              {(period.team_mix || []).map((item, mixIdx) => (
                                <div
                                  key={mixIdx}
                                  className="flex items-center gap-1"
                                >
                                  <select
                                    value={item.lutech_profile}
                                    onChange={(e) =>
                                      handleUpdateFtePeriodMix(
                                        idx,
                                        mixIdx,
                                        'lutech_profile',
                                        e.target.value
                                      )
                                    }
                                    disabled={disabled}
                                    className="flex-1 px-2 py-1 border border-slate-200 rounded text-[10px] bg-white"
                                  >
                                    <option value="">-- Profilo --</option>
                                    {practices.map((p) => (
                                      <optgroup key={p.id} label={p.label}>
                                        {(p.profiles || []).map((prof) => (
                                          <option
                                            key={`${p.id}:${prof.id}`}
                                            value={`${p.id}:${prof.id}`}
                                          >
                                            {prof.label} - €{prof.daily_rate}/gg
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    value={item.pct}
                                    onChange={(e) =>
                                      handleUpdateFtePeriodMix(
                                        idx,
                                        mixIdx,
                                        'pct',
                                        e.target.value
                                      )
                                    }
                                    disabled={disabled}
                                    min={0}
                                    max={100}
                                    step={5}
                                    className="w-12 px-1 py-1 text-center text-[10px] border border-slate-200 rounded"
                                  />
                                  <span className="text-[10px] text-slate-400">
                                    %
                                  </span>
                                  <button
                                    onClick={() =>
                                      handleRemoveMixFromFtePeriod(idx, mixIdx)
                                    }
                                    disabled={disabled}
                                    className="p-1 text-slate-300 hover:text-red-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => handleAddMixToFtePeriod(idx)}
                                disabled={disabled}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] text-blue-600 hover:bg-blue-50 rounded"
                              >
                                <Plus className="w-3 h-3" />
                                Profilo
                              </button>
                              {mixInfo.totalPct !== 100 &&
                                (period.team_mix || []).length > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                                    <AlertTriangle className="w-3 h-3" />
                                    Totale: {mixInfo.totalPct.toFixed(0)}%
                                  </div>
                                )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={handleAddFtePeriod}
                    disabled={disabled}
                    className="flex items-center justify-center gap-1 px-3 py-2 w-full text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
                  >
                    <Plus className="w-4 h-4" />
                    Aggiungi Periodo
                  </button>
                </div>
              )}

              {/* MODE: MANUAL */}
              {current.governance_mode === 'manual' && (
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
                  <DollarSign className="w-4 h-4 text-slate-400" />
                  <input
                    type="number"
                    value={current.governance_cost_manual || 0}
                    onChange={(e) =>
                      handleFieldChange(
                        'governance_cost_manual',
                        parseFloat(e.target.value) || 0
                      )
                    }
                    disabled={disabled}
                    step={1000}
                    className="flex-1 px-3 py-1.5 text-sm font-semibold text-right border border-slate-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-500">€</span>
                </div>
              )}

              {/* MODE: TEAM_MIX */}
              {current.governance_mode === 'team_mix' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      FTE Governance: {governanceFteFromPct.toFixed(2)}
                    </span>
                    <span>
                      ({current.governance_pct}% di {totalTeamFte.toFixed(1)}{' '}
                      FTE)
                    </span>
                  </div>

                  {(current.governance_profile_mix || []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={item.lutech_profile}
                        onChange={(e) =>
                          handleUpdateGovProfile(
                            idx,
                            'lutech_profile',
                            e.target.value
                          )
                        }
                        disabled={disabled}
                        className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white
                                   focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">-- Profilo --</option>
                        {practices.map((p) => (
                          <optgroup key={p.id} label={p.label}>
                            {(p.profiles || []).map((prof) => (
                              <option
                                key={`${p.id}:${prof.id}`}
                                value={`${p.id}:${prof.id}`}
                              >
                                {prof.label} - €{prof.daily_rate}/gg
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={item.pct}
                        onChange={(e) =>
                          handleUpdateGovProfile(idx, 'pct', e.target.value)
                        }
                        disabled={disabled}
                        min={0}
                        max={100}
                        step={5}
                        className="w-16 px-2 py-1.5 text-center text-xs border border-slate-200 rounded-lg
                                   focus:border-blue-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-400">%</span>
                      <button
                        onClick={() => handleRemoveGovProfile(idx)}
                        disabled={disabled}
                        className="p-1 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={handleAddGovProfile}
                    disabled={disabled}
                    className="flex items-center justify-center gap-1 px-3 py-2 w-full text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-dashed border-blue-200"
                  >
                    <Plus className="w-4 h-4" />
                    Aggiungi Profilo
                  </button>

                  {governanceCalc.details.totalPct > 0 && (
                    <div
                      className={`text-xs ${
                        Math.abs(governanceCalc.details.totalPct - 100) < 1
                          ? 'text-green-600'
                          : 'text-amber-600'
                      }`}
                    >
                      Distribuzione: {governanceCalc.details.totalPct.toFixed(0)}
                      %
                      {Math.abs(governanceCalc.details.totalPct - 100) >= 1 && (
                        <AlertTriangle className="w-3 h-3 inline ml-1" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Apply Reuse Toggle */}
              <button
                type="button"
                onClick={() =>
                  !disabled &&
                  handleFieldChange(
                    'governance_apply_reuse',
                    !current.governance_apply_reuse
                  )
                }
                disabled={disabled}
                className={`flex items-center gap-3 p-2.5 w-full rounded-lg border transition-all
                  ${
                    current.governance_apply_reuse
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                  }
                  disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div
                  className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                    current.governance_apply_reuse
                      ? 'bg-emerald-500'
                      : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      current.governance_apply_reuse
                        ? 'translate-x-4'
                        : 'translate-x-0'
                    }`}
                  />
                </div>
                <span className="text-xs text-slate-600">
                  Applica fattore riuso
                  {current.governance_apply_reuse &&
                    current.reuse_factor > 0 && (
                      <span className="ml-1 font-semibold text-emerald-600">
                        (-{current.reuse_factor}% = {formatCurrency(governanceCalc.reuseSavings)})
                      </span>
                    )}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* ═══ RISK SECTION ═══ */}
        <div className="p-4">
          <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-amber-900">
                  {t('business_plan.risk_contingency')}
                </div>
                <div className="text-xs text-amber-600">
                  Su costo team + governance
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={20}
                step={0.5}
                value={current.risk_contingency_pct}
                onChange={(e) =>
                  handleChange('risk_contingency_pct', e.target.value)
                }
                disabled={disabled}
                className="w-16 px-2 py-1.5 text-center text-sm font-semibold border border-amber-200 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-amber-500
                           disabled:bg-slate-100 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-amber-600 font-medium">%</span>
            </div>
          </div>
        </div>

        {/* ═══ REUSE FACTOR SECTION ═══ */}
        <div className="p-4">
          <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-emerald-900">
                    {t('business_plan.reuse_factor')}
                  </div>
                  <div className="text-xs text-emerald-600">
                    Efficienza da riuso asset
                  </div>
                </div>
              </div>
              <div className="px-3 py-1.5 bg-emerald-100 rounded-lg">
                <span className="text-lg font-bold text-emerald-700">
                  {current.reuse_factor}%
                </span>
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
              className="w-full h-2 bg-emerald-200 rounded-lg appearance-none cursor-pointer
                         accent-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            />

            <div className="flex justify-between text-[10px] text-emerald-500">
              <span>0%</span>
              <span>40%</span>
              <span>80%</span>
            </div>

            <div className="text-xs text-emerald-700 bg-emerald-100/50 p-2 rounded-lg">
              <strong>Costo Effettivo:</strong> Base × (1 -{' '}
              {current.reuse_factor}%) = Base ×{' '}
              {(1 - current.reuse_factor / 100).toFixed(2)}
            </div>
          </div>
        </div>

        {/* ═══ INFLAZIONE YoY SECTION ═══ */}
        <div className="p-4">
          <div className="p-3 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="font-semibold text-violet-900">
                    Inflazione YoY
                  </div>
                  <div className="text-xs text-violet-600">
                    Escalation tariffe anno su anno
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.1}
                  value={current.inflation_pct}
                  onChange={(e) =>
                    handleChange('inflation_pct', e.target.value)
                  }
                  disabled={disabled}
                  className="w-16 px-2 py-1.5 text-center text-sm font-semibold border border-violet-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-violet-500
                             disabled:bg-slate-100 disabled:cursor-not-allowed"
                />
                <span className="text-sm text-violet-600 font-medium">%</span>
              </div>
            </div>

            {current.inflation_pct > 0 && (
              <div className="text-xs text-violet-700 bg-violet-100/50 p-2 rounded-lg space-y-1">
                <div>
                  <strong>Formula:</strong> Tariffa Anno N × (1 +{' '}
                  {current.inflation_pct}%)^N
                </div>
                <div className="text-violet-500">
                  Anno 1: ×1.00 · Anno 2: ×
                  {(1 + current.inflation_pct / 100).toFixed(3)} · Anno 3: ×
                  {Math.pow(1 + current.inflation_pct / 100, 2).toFixed(3)}
                  {durationMonths > 36
                    ? ` · Anno 4: ×${Math.pow(1 + current.inflation_pct / 100, 3).toFixed(3)}`
                    : ''}
                  {durationMonths > 48
                    ? ` · Anno 5: ×${Math.pow(1 + current.inflation_pct / 100, 4).toFixed(3)}`
                    : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
