import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Calculator,
  Calendar,
  TrendingDown,
  RefreshCw,
  Info,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

/**
 * ProfileMappingEditor - Mappatura Profili Poste → Profili Lutech (Time-Varying)
 *
 * Per ogni profilo Poste, permette di:
 * - Definire periodi temporali (es. "Anno 1", "Anno 2+")
 * - Per ogni periodo, mappare su 1 o più profili Lutech con relative percentuali
 * - Calcolare il costo del mix per ogni periodo
 */
export default function ProfileMappingEditor({
  teamComposition = [],    // Profili da capitolato Poste
  practices = [],          // Practice Lutech con catalogo profili
  mappings = {},           // Mappature esistenti (nuova struttura time-varying)
  durationMonths = 36,     // Durata totale del contratto in mesi
  onChange,
  disabled = false,
  volumeAdjustments = {},
  reuseFactor = 0,
}) {
  const { t } = useTranslation();
  const [expandedProfile, setExpandedProfile] = useState(null);

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

  const calculatePeriodMixCost = useCallback((mix) => {
    if (!mix || mix.length === 0) return { totalPct: 0, mixRate: 0, isComplete: false };

    let totalPct = 0;
    let weightedCost = 0;

    for (const m of mix) {
      const lutechProfile = lutechProfiles.find(p => p.full_id === m.lutech_profile);
      if (lutechProfile) {
        const pct = m.pct / 100;
        totalPct += pct;
        weightedCost += (lutechProfile.daily_rate || 0) * pct;
      }
    }

    const isComplete = Math.abs(totalPct - 1) < 0.01;
    const mixRate = totalPct > 0 ? weightedCost / totalPct : 0;

    return { totalPct: totalPct * 100, mixRate, isComplete };
  }, [lutechProfiles]);

  const getOverallMappingStatus = (posteProfileId) => {
    const periodMappings = mappings[posteProfileId] || [];
    if (periodMappings.length === 0) {
      return { status: 'unmapped', rates: [], coveredMonths: 0, totalMonths: durationMonths };
    }

    const rates = [];
    let allPeriodsComplete = true;
    let coveredMonthsSet = new Set();

    for (const periodMapping of periodMappings) {
      const { mixRate, isComplete } = calculatePeriodMixCost(periodMapping.mix);
      rates.push(mixRate);
      if (!isComplete) {
        allPeriodsComplete = false;
      }

      // Calcola i mesi coperti dal periodo
      const start = periodMapping.month_start || 1;
      const end = periodMapping.month_end || durationMonths;
      for (let m = start; m <= end; m++) {
        coveredMonthsSet.add(m);
      }
    }

    const coveredMonths = coveredMonthsSet.size;
    const isFullyCovered = coveredMonths >= durationMonths;

    if (!allPeriodsComplete || !isFullyCovered) {
      return { status: 'incomplete', rates, coveredMonths, totalMonths: durationMonths };
    }
    return { status: 'complete', rates, coveredMonths, totalMonths: durationMonths };
  };

  // --- Handlers ---
  const handleAddPeriod = (posteProfileId) => {
    const currentPeriods = mappings[posteProfileId] || [];

    // 1. Cerca buchi (gaps) nella timeline
    const coveredMonths = new Array(durationMonths + 1).fill(false);
    coveredMonths[0] = true; // Index 0 non usato
    currentPeriods.forEach(p => {
      const start = p.month_start || 1;
      const end = p.month_end || durationMonths;
      for (let m = start; m <= end; m++) {
        if (m <= durationMonths) coveredMonths[m] = true;
      }
    });

    let newMonthStart = 1;
    let newMonthEnd = durationMonths;

    const firstGap = coveredMonths.findIndex((v, i) => i > 0 && !v);
    if (firstGap !== -1) {
      newMonthStart = firstGap;
      const nextFilled = coveredMonths.slice(firstGap).findIndex(v => v);
      newMonthEnd = nextFilled !== -1 ? firstGap + nextFilled - 1 : durationMonths;
    } else {
      // Nessun gap, aggiungi alla fine (se c'è spazio)
      const lastMonth = Math.max(0, ...currentPeriods.map(p => p.month_end || 0));
      if (lastMonth >= durationMonths) return; // Già pieno
      newMonthStart = lastMonth + 1;
      newMonthEnd = durationMonths;
    }

    onChange?.({
      ...mappings,
      [posteProfileId]: [
        ...currentPeriods,
        {
          month_start: newMonthStart,
          month_end: newMonthEnd,
          mix: currentPeriods.length > 0
            ? JSON.parse(JSON.stringify(currentPeriods[currentPeriods.length - 1].mix))
            : [{ lutech_profile: '', pct: 100 }]
        }
      ].sort((a, b) => a.month_start - b.month_start)
    });
  };

  const handleSplitPeriod = (posteProfileId, periodIndex, splitAtMonth) => {
    const currentPeriods = mappings[posteProfileId] || [];
    const periodToSplit = currentPeriods[periodIndex];
    if (!periodToSplit) return;

    if (splitAtMonth <= periodToSplit.month_start || splitAtMonth > periodToSplit.month_end) return;

    const newPeriods = [...currentPeriods];
    const originalEnd = periodToSplit.month_end;

    // Accorcia il periodo attuale
    newPeriods[periodIndex] = {
      ...periodToSplit,
      month_end: splitAtMonth - 1
    };

    // Aggiungi la seconda parte
    newPeriods.push({
      ...periodToSplit,
      month_start: splitAtMonth,
      month_end: originalEnd
    });

    onChange?.({
      ...mappings,
      [posteProfileId]: newPeriods.sort((a, b) => a.month_start - b.month_start)
    });
  };

  const handleRemovePeriod = (posteProfileId, periodIndex) => {
    const currentPeriods = mappings[posteProfileId] || [];
    const updatedPeriods = currentPeriods.filter((_, i) => i !== periodIndex);
    if (updatedPeriods.length === 0) {
      const newMappings = { ...mappings };
      delete newMappings[posteProfileId];
      onChange?.(newMappings);
    } else {
      onChange?.({ ...mappings, [posteProfileId]: updatedPeriods });
    }
  };

  const handleUpdatePeriodField = (posteProfileId, periodIndex, field, value) => {
    const updatedPeriods = (mappings[posteProfileId] || []).map((p, i) =>
      i === periodIndex ? { ...p, [field]: value } : p
    );
    onChange?.({ ...mappings, [posteProfileId]: updatedPeriods });
  };

  const handleAddLutechProfile = (posteProfileId, periodIndex) => {
    const currentPeriods = mappings[posteProfileId] || [];
    const period = currentPeriods[periodIndex];
    const remaining = 100 - (period.mix || []).reduce((sum, m) => sum + m.pct, 0);

    const updatedMix = [
      ...(period.mix || []),
      { lutech_profile: '', pct: Math.max(0, remaining) }
    ];
    handleUpdatePeriodField(posteProfileId, periodIndex, 'mix', updatedMix);
  };

  const handleRemoveLutechProfile = (posteProfileId, periodIndex, mixIndex) => {
    const period = (mappings[posteProfileId] || [])[periodIndex];
    const updatedMix = (period.mix || []).filter((_, i) => i !== mixIndex);
    handleUpdatePeriodField(posteProfileId, periodIndex, 'mix', updatedMix);
  };

  const handleUpdateLutechProfile = (posteProfileId, periodIndex, mixIndex, field, value) => {
    const period = (mappings[posteProfileId] || [])[periodIndex];
    const updatedMix = (period.mix || []).map((m, i) => {
      if (i !== mixIndex) return m;
      let newValues = { [field]: field === 'pct' ? (parseFloat(value) || 0) : value };
      if (field === 'lutech_profile') {
        const profile = lutechProfiles.find(p => p.full_id === value);
        newValues.practice_id = profile?.practice_id || '';
      }
      return { ...m, ...newValues };
    });
    handleUpdatePeriodField(posteProfileId, periodIndex, 'mix', updatedMix);
  };

  const handleAutoDistribute = (posteProfileId, periodIndex) => {
    const period = (mappings[posteProfileId] || [])[periodIndex];
    const mix = period.mix || [];
    if (mix.length === 0) return;

    const pctEach = Math.floor(100 / mix.length);
    const remainder = 100 - (pctEach * mix.length);

    const updatedMix = mix.map((m, i) => ({
      ...m,
      pct: pctEach + (i === 0 ? remainder : 0)
    }));
    handleUpdatePeriodField(posteProfileId, periodIndex, 'mix', updatedMix);
  };

  const handleSyncWithVolumeAdjustments = (posteProfileId) => {
    const adjPeriods = volumeAdjustments?.periods || [];
    if (adjPeriods.length === 0) return;

    const currentMappings = mappings[posteProfileId] || [];
    const newMappings = [];

    // Sort adj periods just in case
    const sortedAdj = [...adjPeriods].sort((a, b) => (a.month_start || 1) - (b.month_start || 1));

    for (const adjP of sortedAdj) {
      const adjStart = adjP.month_start || 1;
      const adjEnd = adjP.month_end || durationMonths;

      // Find the mix from an existing mapping that overlaps with the start of this adjustment period
      let baseMix = [{ lutech_profile: '', pct: 100 }];
      const overlappingMapping = currentMappings.find(m =>
        adjStart >= (m.month_start || 1) && adjStart <= (m.month_end || durationMonths)
      );

      if (overlappingMapping) {
        baseMix = JSON.parse(JSON.stringify(overlappingMapping.mix));
      } else if (currentMappings.length > 0) {
        // Find the closest mapping period
        const closest = [...currentMappings].sort((a, b) =>
          Math.abs((a.month_start || 1) - adjStart) - Math.abs((b.month_start || 1) - adjStart)
        )[0];
        baseMix = JSON.parse(JSON.stringify(closest.mix));
      }

      newMappings.push({
        month_start: adjStart,
        month_end: adjEnd,
        mix: baseMix
      });
    }

    onChange?.({
      ...mappings,
      [posteProfileId]: newMappings
    });
  };

  const formatCurrency = (val) => `€${val.toFixed(0)}`;

  // Compute per-profile adjusted FTE from volume adjustments (Integrated: Profile + Reuse + TOW)
  const profileAdjustments = useMemo(() => {
    const periods = volumeAdjustments?.periods || [{
      month_start: 1,
      month_end: durationMonths,
      by_tow: volumeAdjustments?.by_tow || {},
      by_profile: volumeAdjustments?.by_profile || {},
    }];
    const reuseMultiplier = 1 - ((reuseFactor || 0) / 100);

    const result = {};
    for (const member of teamComposition) {
      const profileId = member.profile_id || member.label;
      const fte = parseFloat(member.fte) || 0;
      const towAllocation = member.tow_allocation || {};

      let totalMonths = 0;
      let weightedFte = 0;
      for (const period of periods) {
        const start = period.month_start || 1;
        const end = period.month_end || durationMonths;
        const months = end - start + 1;

        const pFactor = period.by_profile?.[profileId] ?? 1.0;

        let towFactor = 0;
        let totalAllocatedPct = 0;
        for (const [towId, pct] of Object.entries(towAllocation)) {
          const tPct = parseFloat(pct) || 0;
          if (tPct > 0) {
            const tFactor = period.by_tow?.[towId] ?? 1.0;
            towFactor += (tPct / 100) * tFactor;
            totalAllocatedPct += (tPct / 100);
          }
        }
        const finalTowFactor = totalAllocatedPct > 0 ? (towFactor / totalAllocatedPct) : 1.0;

        const effectiveFte = fte * pFactor * reuseMultiplier * finalTowFactor;
        weightedFte += effectiveFte * months;
        totalMonths += months;
      }
      const avgFte = totalMonths > 0 ? weightedFte / totalMonths : fte;
      result[profileId] = {
        adjustedFte: Math.round(avgFte * 100) / 100,
        delta: Math.round((avgFte - fte) * 100) / 100,
        periods,
      };
    }
    return result;
  }, [teamComposition, volumeAdjustments, reuseFactor, durationMonths]);

  // Helper: get the integrated factor for a profile in a specific month range
  const getProfileFteForPeriod = (profileId, monthStart, monthEnd) => {
    const adj = profileAdjustments[profileId];
    if (!adj) return null;
    const member = teamComposition.find(m => (m.profile_id || m.label) === profileId);
    if (!member) return null;
    const fte = parseFloat(member.fte) || 0;
    const towAllocation = member.tow_allocation || {};
    const reuseMultiplier = 1 - ((reuseFactor || 0) / 100);

    // Weighted factors across overlapping rettifica periods
    let totalMonths = 0;
    let weightedEffort = 0;
    for (const period of adj.periods) {
      const pStart = period.month_start || 1;
      const pEnd = period.month_end || durationMonths;
      const overlapStart = Math.max(monthStart, pStart);
      const overlapEnd = Math.min(monthEnd, pEnd);
      if (overlapStart > overlapEnd) continue;
      const months = overlapEnd - overlapStart + 1;

      const pFactor = period.by_profile?.[profileId] ?? 1.0;

      let towFactor = 0;
      let totalAllocatedPct = 0;
      for (const [towId, pct] of Object.entries(towAllocation)) {
        const tPct = parseFloat(pct) || 0;
        if (tPct > 0) {
          const tFactor = period.by_tow?.[towId] ?? 1.0;
          towFactor += (tPct / 100) * tFactor;
          totalAllocatedPct += (tPct / 100);
        }
      }
      const finalTowFactor = totalAllocatedPct > 0 ? (towFactor / totalAllocatedPct) : 1.0;

      weightedEffort += (pFactor * finalTowFactor) * months;
      totalMonths += months;
    }
    const combinedFactor = totalMonths > 0 ? weightedEffort / totalMonths : 1.0;
    const effectiveFte = fte * combinedFactor * reuseMultiplier;
    return { effectiveFte: Math.round(effectiveFte * 100) / 100, factor: combinedFactor * reuseMultiplier };
  };

  // Calcola tariffa media complessiva pesata per FTE
  const overallTeamMixRate = useMemo(() => {
    if (teamComposition.length === 0) return { avgRate: 0, totalFte: 0, totalDaysYear: 0, hasMappings: false };

    let totalWeightedRate = 0;
    let totalFte = 0;
    let mappedFte = 0;

    for (const member of teamComposition) {
      const profileId = member.profile_id || member.label;
      const fte = parseFloat(member.fte) || 0;
      totalFte += fte;

      const periodMappings = mappings[profileId] || [];
      if (periodMappings.length === 0) continue;

      // Media delle tariffe dei periodi per questo profilo
      let profileRate = 0;
      let validPeriods = 0;

      for (const pm of periodMappings) {
        const { mixRate } = calculatePeriodMixCost(pm.mix);
        if (mixRate > 0) {
          profileRate += mixRate;
          validPeriods++;
        }
      }

      if (validPeriods > 0) {
        profileRate = profileRate / validPeriods;
        totalWeightedRate += profileRate * fte;
        mappedFte += fte;
      }
    }

    const avgRate = mappedFte > 0 ? totalWeightedRate / mappedFte : 0;
    return {
      avgRate,
      totalFte,
      mappedFte,
      totalDaysYear: Math.round(totalFte * 220),
      hasMappings: mappedFte > 0,
    };
  }, [teamComposition, mappings, calculatePeriodMixCost]);

  if (teamComposition.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-slate-500">
        <ArrowRightLeft className="w-10 h-10 text-slate-300 mb-3 mx-auto" />
        <p className="font-medium">Nessun profilo da mappare</p>
        <p className="text-sm">Inserisci prima la composizione team da capitolato Poste</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
          <ArrowRightLeft className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h3 className="font-semibold text-slate-800">{t('business_plan.profile_mapping')}</h3>
          <p className="text-xs text-slate-500">{t('business_plan.profile_mapping_desc_time_varying')}</p>
        </div>
      </div>

      {/* Profili Poste */}
      <div className="divide-y divide-slate-100">
        {teamComposition.map((posteProfile) => {
          const profileId = posteProfile.profile_id || posteProfile.label;
          const isExpanded = expandedProfile === profileId;
          const periodMappings = mappings[profileId] || [];
          const overallStatus = getOverallMappingStatus(profileId);

          return (
            <div key={profileId}>
              {/* Riga profilo Poste */}
              <button
                onClick={() => setExpandedProfile(isExpanded ? null : profileId)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div>
                  <div>
                    <div className="font-medium text-slate-800">{posteProfile.label}</div>
                    <div className="text-sm text-slate-500 flex items-center gap-2">
                      <span>{posteProfile.fte} FTE · {Math.round(posteProfile.fte * 220)} GG/anno</span>
                      {(() => {
                        const adj = profileAdjustments[profileId];
                        if (adj && adj.delta < 0) {
                          return (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded border border-emerald-200">
                              <TrendingDown className="w-3 h-3" />
                              → {adj.adjustedFte.toFixed(1)} FTE eff.
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {overallStatus.status === 'unmapped' ? (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">Da mappare</span>
                  ) : overallStatus.status === 'complete' ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 mr-2 bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-100">
                        <ArrowRightLeft className="w-3 h-3" />
                        <span className="text-xs font-bold">{periodMappings.length} periodi</span>
                      </div>
                      <span className="text-xs text-green-600 font-medium">
                        {overallStatus.coveredMonths}/{overallStatus.totalMonths} mesi
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {overallStatus.rates.length > 1 ? `${formatCurrency(Math.min(...overallStatus.rates))}-${formatCurrency(Math.max(...overallStatus.rates))}` : formatCurrency(overallStatus.rates[0])}/gg
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-amber-600">
                        {overallStatus.coveredMonths}/{overallStatus.totalMonths} mesi · Incompleto
                      </span>
                    </div>
                  )}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>

              {/* Pannello espanso */}
              {isExpanded && (
                <div className="px-0 pb-4 bg-slate-50/70 border-y border-slate-100">
                  {/* Header con Azioni */}
                  <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-slate-700">
                        Definizione periodi di mapping per {posteProfile.label}
                      </h4>
                      <div className="group relative">
                        <Info className="w-4 h-4 text-slate-400 cursor-help" />
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-slate-800 text-white text-[10px] rounded shadow-xl z-20">
                          Ogni riga definisce un periodo temporale e come il profilo Poste viene mappato su Lutech in quell'intervallo.
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {volumeAdjustments?.periods?.length > 0 && (
                        <button
                          onClick={() => handleSyncWithVolumeAdjustments(profileId)}
                          disabled={disabled}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-indigo-600 border border-indigo-200 
                                 hover:bg-indigo-50 rounded-lg text-xs font-semibold transition-all shadow-sm"
                          title="Sincronizza i periodi di mapping con le fasi della Rettifica Volumi"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Sincronizza con Rettifica
                        </button>
                      )}
                      <button
                        onClick={() => handleAddPeriod(profileId)}
                        disabled={disabled}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white 
                                 hover:bg-indigo-700 rounded-lg text-xs font-semibold transition-all shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Aggiungi Periodo
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-6">
                    {periodMappings.map((periodMapping, periodIndex) => {
                      const mixInfo = calculatePeriodMixCost(periodMapping.mix);
                      return (
                        <div key={periodIndex} className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm space-y-4">
                          {/* Header Periodo */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Durata:</span>
                                <input
                                  type="number"
                                  value={periodMapping.month_start || 1}
                                  onChange={(e) => handleUpdatePeriodField(profileId, periodIndex, 'month_start', parseInt(e.target.value) || 1)}
                                  min={1}
                                  max={durationMonths}
                                  className="w-12 bg-transparent text-center text-sm font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 rounded"
                                />
                                <span className="text-slate-400">→</span>
                                <input
                                  type="number"
                                  value={periodMapping.month_end || durationMonths}
                                  onChange={(e) => handleUpdatePeriodField(profileId, periodIndex, 'month_end', parseInt(e.target.value) || durationMonths)}
                                  min={1}
                                  max={durationMonths}
                                  className="w-12 bg-transparent text-center text-sm font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-500 rounded"
                                />
                                <span className="text-[10px] text-slate-400 ml-1">
                                  ({(periodMapping.month_end || durationMonths) - (periodMapping.month_start || 1) + 1} mesi)
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  const split = prompt("Inserisci il mese in cui dividere questo periodo:", (periodMapping.month_start || 1) + 1);
                                  if (split) handleSplitPeriod(profileId, periodIndex, parseInt(split));
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Dividi manualmente questo periodo"
                                disabled={disabled}
                              >
                                <ArrowRightLeft className="w-4 h-4 rotate-90" />
                              </button>
                              <button
                                onClick={() => handleRemovePeriod(profileId, periodIndex)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                disabled={disabled}
                                title="Elimina periodo"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Dettaglio FTE Effettivo per questo periodo */}
                          {(() => {
                            const adj = volumeAdjustments;
                            const periodFte = getProfileFteForPeriod(
                              profileId,
                              periodMapping.month_start || 1,
                              periodMapping.month_end || durationMonths
                            );

                            if (periodFte && periodFte.factor < 1.0) {
                              const pStart = periodMapping.month_start || 1;
                              const pEnd = periodMapping.month_end || durationMonths;

                              // Trova boundary di rettifica che cadono DENTRO questo periodo di mapping
                              const boundariesInside = (adj.periods || [])
                                .map(p => p.month_start)
                                .filter(b => b > pStart && b <= pEnd)
                                .sort((a, b) => a - b);

                              const isUniform = boundariesInside.length === 0;

                              return (
                                <div className={`p-3 rounded-lg text-xs flex flex-col gap-2 border ${!isUniform ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                  <div className="flex items-center gap-3">
                                    <TrendingDown className="w-4 h-4" />
                                    <div className="flex-1">
                                      <div className="font-semibold">
                                        FTE eff. {!isUniform && 'medio'} in questo periodo: {periodFte.effectiveFte.toFixed(1)}
                                        <span className="ml-1 opacity-70">(riduzione totale {Math.round((1 - periodFte.factor) * 100)}%)</span>
                                      </div>
                                      {!isUniform && (
                                        <div className="text-[10px] mt-1 opacity-80 italic flex items-center gap-1">
                                          <AlertCircle className="w-3 h-3" />
                                          Attenzione: il periodo attraversa diverse fasi di rettifica.
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  {!isUniform && (
                                    <div className="flex flex-wrap gap-2 mt-1 pl-7">
                                      {boundariesInside.map(b => (
                                        <button
                                          key={b}
                                          onClick={() => handleSplitPeriod(profileId, periodIndex, b)}
                                          className="px-2 py-1 bg-white border border-amber-300 hover:bg-amber-100 rounded text-[10px] font-bold transition-colors"
                                        >
                                          Dividi al mese {b}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Mix di profili */}
                          <div className="space-y-3">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Composizione Mix Lutech</div>
                            {(periodMapping.mix || []).map((mixItem, mixIndex) => (
                              <div key={mixIndex} className="flex items-center gap-3">
                                <select
                                  value={mixItem.lutech_profile}
                                  onChange={(e) => handleUpdateLutechProfile(profileId, periodIndex, mixIndex, 'lutech_profile', e.target.value)}
                                  disabled={disabled}
                                  className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 shadow-sm"
                                >
                                  <option value="">-- Seleziona profilo Lutech --</option>
                                  {practices.map(p => (
                                    <optgroup key={p.id} label={p.label}>
                                      {(p.profiles || []).map(prof => (
                                        <option key={prof.full_id || `${p.id}:${prof.id}`} value={prof.full_id || `${p.id}:${prof.id}`}>
                                          {prof.label} - {formatCurrency(prof.daily_rate)}/gg
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                <div className="flex items-center gap-2 group">
                                  <input
                                    type="number"
                                    value={mixItem.pct}
                                    onChange={(e) => handleUpdateLutechProfile(profileId, periodIndex, mixIndex, 'pct', e.target.value)}
                                    className="w-20 px-3 py-2 text-center border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:border-teal-500 focus:outline-none shadow-sm"
                                    min="0" max="100" step="5"
                                  />
                                  <span className="text-sm font-bold text-slate-400">%</span>
                                </div>
                                <button
                                  onClick={() => handleRemoveLutechProfile(profileId, periodIndex, mixIndex)}
                                  className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                  disabled={disabled || (periodMapping.mix || []).length === 1}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Footer Periodo: Azioni e Media */}
                          <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleAddLutechProfile(profileId, periodIndex)}
                                disabled={disabled}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-teal-600 hover:bg-teal-50 rounded-lg transition-colors border border-transparent hover:border-teal-100"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                Aggiungi Profilo
                              </button>
                              {(periodMapping.mix || []).length > 1 && (
                                <button
                                  onClick={() => handleAutoDistribute(profileId, periodIndex)}
                                  disabled={disabled}
                                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
                                >
                                  <Calculator className="w-3.5 h-3.5" />
                                  Distribuisci
                                </button>
                              )}
                            </div>
                            <div className={`px-4 py-2 rounded-xl border flex flex-col items-end
                                           ${mixInfo.isComplete ? 'bg-teal-50 border-teal-100 text-teal-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                              <span className="text-[10px] uppercase font-black opacity-60">Tariffa Media Periodo</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-lg font-black tracking-tight">{formatCurrency(mixInfo.mixRate)}</span>
                                <span className="text-xs font-bold opacity-70">/gg</span>
                              </div>
                              {!mixInfo.isComplete && <div className="text-[10px] font-bold mt-1">Si richiede il 100% (attuale {mixInfo.totalPct.toFixed(0)}%)</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Globale */}
      {overallTeamMixRate.hasMappings && (
        <div className="p-6 bg-gradient-to-br from-slate-50 to-indigo-50/30 border-t border-slate-200 rounded-b-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
                <Calculator className="w-7 h-7 text-white" />
              </div>
              <div>
                <div className="text-lg font-bold text-slate-800 tracking-tight">Tariffa Media Team Mix</div>
                <div className="text-sm text-slate-500 flex items-center gap-2">
                  <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                    {overallTeamMixRate.mappedFte.toFixed(1)}/{overallTeamMixRate.totalFte.toFixed(1)} FTE mappati
                  </span>
                  <span>pesata per la composizione Poste</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-100 self-end md:self-auto">
              <div className="text-right">
                <div className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Costo medio €/giorno</div>
                <div className="flex items-baseline justify-end gap-1">
                  <div className="text-4xl font-black text-slate-900 tracking-tighter">
                    {formatCurrency(overallTeamMixRate.avgRate)}
                  </div>
                  <div className="text-sm font-bold text-slate-400">/GG</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}