import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRightLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Users,
  Calculator,
  AlertCircle,
  CheckCircle2,
  Calendar,
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

  const calculatePeriodMixCost = (mix) => {
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
  };

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

    // Calcola l'ultimo mese coperto dai periodi esistenti
    let lastMonth = 0;
    currentPeriods.forEach(p => {
      if (p.month_end && p.month_end > lastMonth) {
        lastMonth = p.month_end;
      }
    });

    // Il nuovo periodo inizia dal mese successivo
    const newMonthStart = lastMonth + 1;
    const newMonthEnd = Math.min(newMonthStart + 11, durationMonths); // Default 12 mesi o fino alla fine

    onChange?.({
      ...mappings,
      [posteProfileId]: [
        ...currentPeriods,
        {
          month_start: newMonthStart,
          month_end: newMonthEnd,
          mix: [{ lutech_profile: '', pct: 100 }]
        }
      ]
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

  const formatCurrency = (val) => `€${val.toFixed(0)}`;

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
        const { mixRate, isComplete } = calculatePeriodMixCost(pm.mix);
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
  }, [teamComposition, mappings, lutechProfiles]);

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
                    <div className="text-sm text-slate-500">{posteProfile.fte} FTE · {Math.round(posteProfile.fte * 220)} GG/anno</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {overallStatus.status === 'unmapped' ? (
                    <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-lg">Da mappare</span>
                  ) : overallStatus.status === 'complete' ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="text-xs text-green-600 font-medium">
                        {overallStatus.coveredMonths}/{overallStatus.totalMonths} mesi
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {overallStatus.rates.length > 1 ? `${formatCurrency(Math.min(...overallStatus.rates))}-${formatCurrency(Math.max(...overallStatus.rates))}` : formatCurrency(overallStatus.rates[0])}/gg
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
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
                <div className="px-4 pb-4 bg-slate-50/70 space-y-3">
                  {periodMappings.map((periodMapping, periodIndex) => {
                    const mixInfo = calculatePeriodMixCost(periodMapping.mix);
                    return (
                      <div key={periodIndex} className="p-3 bg-white rounded-lg border border-slate-200">
                        {/* Header Periodo */}
                        <div className="flex items-center justify-between mb-2">
                           <div className="flex items-center gap-3">
                             <Calendar className="w-4 h-4 text-slate-500" />
                             <span className="text-xs text-slate-500 font-medium">Mesi:</span>
                             <input
                                type="number"
                                value={periodMapping.month_start || 1}
                                onChange={(e) => handleUpdatePeriodField(profileId, periodIndex, 'month_start', parseInt(e.target.value) || 1)}
                                min={1}
                                max={durationMonths}
                                className="w-16 px-2 py-1 text-center text-sm border border-slate-300 rounded-md focus:border-teal-500 focus:outline-none"
                             />
                             <span className="text-slate-500">-</span>
                             <input
                                type="number"
                                value={periodMapping.month_end || durationMonths}
                                onChange={(e) => handleUpdatePeriodField(profileId, periodIndex, 'month_end', parseInt(e.target.value) || durationMonths)}
                                min={1}
                                max={durationMonths}
                                className="w-16 px-2 py-1 text-center text-sm border border-slate-300 rounded-md focus:border-teal-500 focus:outline-none"
                             />
                             <span className="text-xs text-slate-500">
                               ({(periodMapping.month_end || durationMonths) - (periodMapping.month_start || 1) + 1} mesi)
                             </span>
                           </div>
                           <button
                             onClick={() => handleRemovePeriod(profileId, periodIndex)}
                             className="p-1 text-slate-400 hover:text-red-500"
                             disabled={disabled}
                           >
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                        
                        {/* Mix di profili per il periodo */}
                        <div className="space-y-2 pl-6">
                          {(periodMapping.mix || []).map((mixItem, mixIndex) => (
                             <div key={mixIndex} className="flex items-center gap-3">
                                <select
                                  value={mixItem.lutech_profile}
                                  onChange={(e) => handleUpdateLutechProfile(profileId, periodIndex, mixIndex, 'lutech_profile', e.target.value)}
                                  disabled={disabled}
                                  className="flex-1 px-3 py-1.5 border border-slate-200 rounded-md text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                >
                                  <option value="">-- Seleziona profilo Lutech --</option>
                                  {practices.map(p => <optgroup key={p.id} label={p.label}>
                                    {(p.profiles || []).map(prof => <option key={prof.full_id || `${p.id}:${prof.id}`} value={prof.full_id || `${p.id}:${prof.id}`}>{prof.label} - {formatCurrency(prof.daily_rate)}/gg</option>)}
                                  </optgroup>)}
                                </select>
                                <input
                                  type="number"
                                  value={mixItem.pct}
                                  onChange={(e) => handleUpdateLutechProfile(profileId, periodIndex, mixIndex, 'pct', e.target.value)}
                                  className="w-20 px-2 py-1.5 text-center border border-slate-200 rounded-md text-sm focus:border-teal-500 focus:outline-none"
                                  min="0" max="100" step="5"
                                />
                                <span className="text-sm text-slate-500">%</span>
                                <button onClick={() => handleRemoveLutechProfile(profileId, periodIndex, mixIndex)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                             </div>
                          ))}
                          {/* Azioni Mix */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button onClick={() => handleAddLutechProfile(profileId, periodIndex)} className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-teal-600 hover:bg-teal-50 rounded-md"><Plus className="w-3 h-3" />Aggiungi Profilo</button>
                            {(periodMapping.mix || []).length > 1 && <button onClick={() => handleAutoDistribute(profileId, periodIndex)} className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md"><Calculator className="w-3 h-3" />Distribuisci</button>}
                          </div>
                          {/* Riepilogo Costo Periodo */}
                          <div className={`p-2 rounded-md text-sm ${mixInfo.isComplete ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'}`}>
                             <div className="flex justify-between items-center">
                               <span>{mixInfo.isComplete ? 'Mapping periodo completo' : `Mappato ${mixInfo.totalPct.toFixed(0)}%`}</span>
                               <span className="font-bold">{formatCurrency(mixInfo.mixRate)}/gg</span>
                             </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Add Period Button */}
                  <div className="mt-2">
                    <button onClick={() => handleAddPeriod(profileId)} className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-dashed border-slate-300">
                      <Plus className="w-4 h-4" /> Aggiungi Periodo
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer: Tariffa Media Complessiva Team Mix */}
      {overallTeamMixRate.hasMappings && (
        <div className="px-4 py-3 bg-gradient-to-r from-teal-50 to-blue-50 border-t border-teal-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calculator className="w-5 h-5 text-teal-600" />
              <div>
                <div className="text-sm font-semibold text-slate-700">Tariffa Media Team Mix</div>
                <div className="text-xs text-slate-500">
                  Pesata per FTE · {overallTeamMixRate.mappedFte.toFixed(1)}/{overallTeamMixRate.totalFte.toFixed(1)} FTE mappati
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-teal-700">
                {formatCurrency(overallTeamMixRate.avgRate)}<span className="text-sm font-normal text-slate-500">/gg</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}