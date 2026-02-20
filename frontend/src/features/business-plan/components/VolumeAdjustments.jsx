import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DAYS_PER_FTE } from '../constants';
import {
  SlidersHorizontal,
  Layers,
  User,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Hash,
  Clock,
} from 'lucide-react';

/**
 * VolumeAdjustments - Rettifica volumi per periodi temporali
 *
 * - Riduzione per profilo → riduce FTE richiesti da Poste
 * - Riduzione per TOW:
 *     - Se "a task" → riduce il numero di task dichiarati
 *     - Se "a corpo" → riduce i mesi (e quindi giorni/FTE equivalenti)
 *     - Se "a consumo" → nessuna rettifica specifica
 */
export default function VolumeAdjustments({
  adjustments = {},
  team = [],
  tows = [],
  durationMonths,
  onChange,
  disabled = false
}) {
  const { t } = useTranslation();
  const [expandedPeriod, setExpandedPeriod] = useState(0);
  const [expandedSection, setExpandedSection] = useState({});

  // Converti vecchio formato in nuovo formato se necessario
  const periods = adjustments.periods || [{
    month_start: 1,
    month_end: durationMonths,
    by_tow: adjustments.by_tow || {},
    by_profile: adjustments.by_profile || {}
  }];

  // Calcola copertura mesi
  const getCoverage = () => {
    const coveredMonths = new Set();
    periods.forEach(p => {
      const start = p.month_start || 1;
      const end = p.month_end || durationMonths;
      for (let m = start; m <= end; m++) {
        coveredMonths.add(m);
      }
    });
    return { covered: coveredMonths.size, total: durationMonths, isComplete: coveredMonths.size >= durationMonths };
  };

  const coverage = getCoverage();

  // --- Handlers ---
  const handleAddPeriod = () => {
    let lastMonth = 0;
    periods.forEach(p => {
      if (p.month_end && p.month_end > lastMonth) {
        lastMonth = p.month_end;
      }
    });

    const newMonthStart = lastMonth + 1;
    const newMonthEnd = Math.min(newMonthStart + 11, durationMonths);

    const newPeriods = [
      ...periods,
      {
        month_start: newMonthStart,
        month_end: newMonthEnd,
        by_tow: {},
        by_profile: {}
      }
    ];

    onChange?.({ periods: newPeriods });
    setExpandedPeriod(newPeriods.length - 1);
  };

  const handleRemovePeriod = (index) => {
    const newPeriods = periods.filter((_, i) => i !== index);
    onChange?.({ periods: newPeriods.length > 0 ? newPeriods : [{
      month_start: 1,
      month_end: durationMonths,
      by_tow: {},
      by_profile: {}
    }]});
  };

  const handleUpdatePeriodField = (index, field, value) => {
    const newPeriods = periods.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    );
    onChange?.({ periods: newPeriods });
  };

  const handleTowChange = (periodIndex, towId, value) => {
    const pct = parseFloat(value) || 100;
    const period = periods[periodIndex];
    const byTow = { ...(period.by_tow || {}) };

    if (pct === 100) {
      delete byTow[towId];
    } else {
      byTow[towId] = pct / 100;
    }

    handleUpdatePeriodField(periodIndex, 'by_tow', byTow);
  };

  const handleProfileChange = (periodIndex, profileId, value) => {
    const pct = parseFloat(value) || 100;
    const period = periods[periodIndex];
    const byProfile = { ...(period.by_profile || {}) };

    if (pct === 100) {
      delete byProfile[profileId];
    } else {
      byProfile[profileId] = pct / 100;
    }

    handleUpdatePeriodField(periodIndex, 'by_profile', byProfile);
  };

  const toggleSection = (periodIndex, section) => {
    const key = `${periodIndex}-${section}`;
    setExpandedSection(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Calcola effetto della rettifica per profilo
  const getProfileEffect = (member, factor) => {
    const fte = parseFloat(member.fte) || 0;
    const effectiveFte = fte * factor;
    const savedFte = fte - effectiveFte;
    return { originalFte: fte, effectiveFte, savedFte };
  };

  // Calcola effetto della rettifica per TOW
  const getTowEffect = (tow, factor) => {
    if (tow.type === 'task') {
      const numTasks = tow.num_tasks || 0;
      const effectiveTasks = Math.round(numTasks * factor);
      return {
        type: 'task',
        original: numTasks,
        effective: effectiveTasks,
        saved: numTasks - effectiveTasks,
        label: 'task'
      };
    } else if (tow.type === 'corpo' || tow.type === 'canone') {
      const months = tow.duration_months || 0;
      const effectiveMonths = +(months * factor).toFixed(1);
      const effectiveDays = Math.round(effectiveMonths / 12 * DAYS_PER_FTE);
      const originalDays = Math.round(months / 12 * DAYS_PER_FTE);
      return {
        type: tow.type,
        original: months,
        effective: effectiveMonths,
        saved: +(months - effectiveMonths).toFixed(1),
        originalDays,
        effectiveDays,
        savedDays: originalDays - effectiveDays,
        label: 'mesi'
      };
    }
    return null;
  };

  const SliderRow = ({ label, value, onChange: onSliderChange, color = 'blue', effectInfo }) => {
    const pct = value * 100;
    const isReduced = pct < 100;
    const colorClasses = {
      amber: 'accent-amber-600',
      purple: 'accent-purple-600'
    };

    return (
      <div className="py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-slate-600">{label}</span>
          <div className="flex items-center gap-2">
            {effectInfo && (
              <span className="text-xs text-slate-500">{effectInfo}</span>
            )}
            <span className={`text-sm font-semibold px-2 py-0.5 rounded
                             ${isReduced ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>
        <input
          type="range"
          min="50"
          max="100"
          step="1"
          value={pct}
          onChange={(e) => onSliderChange(e.target.value)}
          disabled={disabled}
          className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer
                     ${colorClasses[color]} disabled:opacity-50 disabled:cursor-not-allowed`}
        />
      </div>
    );
  };

  return (
    <div className="glass-card rounded-2xl">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 glass-card-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {t('business_plan.volume_adjustments')}
              </h3>
              <p className="text-xs text-slate-500">
                Rettifica FTE per profilo e volumi per TOW
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {coverage.isComplete ? (
              <div className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>{coverage.covered}/{coverage.total} mesi</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="w-4 h-4" />
                <span>{coverage.covered}/{coverage.total} mesi</span>
              </div>
            )}
            <button
              onClick={handleAddPeriod}
              disabled={disabled}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium
                         text-amber-600 hover:bg-amber-50 rounded-lg transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
              Periodo
            </button>
          </div>
        </div>
      </div>

      {/* Periodi */}
      <div className="divide-y divide-slate-100">
        {periods.map((period, periodIndex) => {
          const isExpanded = expandedPeriod === periodIndex;
          const monthCount = (period.month_end || durationMonths) - (period.month_start || 1) + 1;
          const hasAdjustments = Object.keys(period.by_tow || {}).length > 0 ||
                                 Object.keys(period.by_profile || {}).length > 0;

          return (
            <div key={periodIndex}>
              {/* Header Periodo */}
              <button
                onClick={() => setExpandedPeriod(isExpanded ? null : periodIndex)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-amber-600" />
                  <div className="text-left">
                    <div className="font-medium text-slate-700">
                      Mesi {period.month_start || 1} - {period.month_end || durationMonths}
                    </div>
                    <div className="text-xs text-slate-500">
                      {monthCount} mesi · {hasAdjustments ? 'Con rettifiche' : 'Nessuna rettifica'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasAdjustments && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-lg">
                      Ottimizzato
                    </span>
                  )}
                  {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                </div>
              </button>

              {/* Pannello espanso */}
              {isExpanded && (
                <div className="px-4 pb-4 bg-slate-50/70 space-y-3">
                  {/* Range mesi */}
                  <div className="p-3 bg-white rounded-lg border border-slate-200">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 font-medium">Periodo (mesi):</span>
                      <input
                        type="number"
                        value={period.month_start || 1}
                        onChange={(e) => handleUpdatePeriodField(periodIndex, 'month_start', parseInt(e.target.value) || 1)}
                        min={1}
                        max={durationMonths}
                        disabled={disabled}
                        className="w-16 px-2 py-1 text-center text-sm border border-slate-300 rounded-md focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-slate-500">-</span>
                      <input
                        type="number"
                        value={period.month_end || durationMonths}
                        onChange={(e) => handleUpdatePeriodField(periodIndex, 'month_end', parseInt(e.target.value) || durationMonths)}
                        min={1}
                        max={durationMonths}
                        disabled={disabled}
                        className="w-16 px-2 py-1 text-center text-sm border border-slate-300 rounded-md focus:border-amber-500 focus:outline-none"
                      />
                      <span className="text-xs text-slate-500">
                        ({monthCount} mesi)
                      </span>
                      {periods.length > 1 && (
                        <button
                          onClick={() => handleRemovePeriod(periodIndex)}
                          disabled={disabled}
                          className="ml-auto p-1 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Per Profilo - Riduce FTE */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => toggleSection(periodIndex, 'profile')}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-medium text-slate-700">Riduzione FTE per Profilo</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Object.keys(period.by_profile || {}).length > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                            {Object.keys(period.by_profile).length} modifiche
                          </span>
                        )}
                        {expandedSection[`${periodIndex}-profile`] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {expandedSection[`${periodIndex}-profile`] && (
                      <div className="p-3 pt-0 border-t border-slate-100 space-y-2">
                        {team.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            Configura il team per abilitare le rettifiche
                          </p>
                        ) : (
                          <>
                            {team.map(member => {
                              const profileId = member.profile_id || member.label;
                              const factor = period.by_profile?.[profileId] ?? 1.0;
                              const effect = getProfileEffect(member, factor);
                              const effectInfo = factor < 1.0
                                ? `${effect.originalFte.toFixed(1)} → ${effect.effectiveFte.toFixed(1)} FTE (−${effect.savedFte.toFixed(1)})`
                                : `${effect.originalFte.toFixed(1)} FTE`;
                              return (
                                <SliderRow
                                  key={profileId}
                                  label={member.label}
                                  value={factor}
                                  onChange={(v) => handleProfileChange(periodIndex, profileId, v)}
                                  color="purple"
                                  effectInfo={effectInfo}
                                />
                              );
                            })}
                            <p className="text-xs text-slate-500 mt-2 bg-purple-50 p-2 rounded">
                              La riduzione % va a ridurre gli FTE richiesti da Poste per questo profilo nel periodo.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Per TOW - Riduce task/giorni */}
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                    <button
                      onClick={() => toggleSection(periodIndex, 'tow')}
                      className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-slate-700">Riduzione per Type of Work</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {Object.keys(period.by_tow || {}).length > 0 && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                            {Object.keys(period.by_tow).length} modifiche
                          </span>
                        )}
                        {expandedSection[`${periodIndex}-tow`] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {expandedSection[`${periodIndex}-tow`] && (
                      <div className="p-3 pt-0 border-t border-slate-100 space-y-2">
                        {tows.length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">
                            Configura i TOW per abilitare le rettifiche
                          </p>
                        ) : (
                          <>
                            {tows.filter(tow => tow.type === 'task' || tow.type === 'corpo' || tow.type === 'canone').map(tow => {
                              const factor = period.by_tow?.[tow.tow_id] ?? 1.0;
                              const effect = getTowEffect(tow, factor);

                              let effectInfo = '';
                              if (effect && factor < 1.0) {
                                if (effect.type === 'task') {
                                  effectInfo = `${effect.original} → ${effect.effective} task (−${effect.saved})`;
                                } else if (effect.type === 'corpo' || effect.type === 'canone') {
                                  effectInfo = `${effect.original} → ${effect.effective} mesi (−${effect.savedDays} gg)`;
                                }
                              } else if (effect) {
                                if (effect.type === 'task') {
                                  effectInfo = `${effect.original} task`;
                                } else if (effect.type === 'corpo' || effect.type === 'canone') {
                                  effectInfo = `${effect.original} mesi (${effect.originalDays} gg)`;
                                }
                              }

                              return (
                                <div key={tow.tow_id}>
                                  <SliderRow
                                    label={
                                      <span className="flex items-center gap-1.5">
                                        {tow.type === 'task' ? (
                                          <Hash className="w-3 h-3 text-blue-500" />
                                        ) : tow.type === 'canone' ? (
                                          <Clock className="w-3 h-3 text-green-500" />
                                        ) : (
                                          <Clock className="w-3 h-3 text-purple-500" />
                                        )}
                                        <span>{tow.tow_id} - {tow.label}</span>
                                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                                          tow.type === 'task' ? 'bg-blue-100 text-blue-700' :
                                          tow.type === 'canone' ? 'bg-green-100 text-green-700' :
                                          'bg-purple-100 text-purple-700'
                                        }`}>
                                          {tow.type === 'task' ? 'A Task' : tow.type === 'canone' ? 'Canone' : 'A Corpo'}
                                        </span>
                                      </span>
                                    }
                                    value={factor}
                                    onChange={(v) => handleTowChange(periodIndex, tow.tow_id, v)}
                                    color="amber"
                                    effectInfo={effectInfo}
                                  />
                                </div>
                              );
                            })}
                            {tows.filter(tow => tow.type === 'consumo').length > 0 && (
                              <div className="text-xs text-slate-400 italic pt-1">
                                I TOW "A Consumo" non prevedono rettifiche volume.
                              </div>
                            )}
                            <div className="text-xs text-slate-500 mt-2 bg-amber-50 p-2 rounded space-y-1">
                              <div className="flex items-center gap-1">
                                <Hash className="w-3 h-3 text-blue-500" />
                                <strong>A Task:</strong> riduce il numero di task dichiarati da Poste
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-purple-500" />
                                <strong>A Corpo / Canone:</strong> riduce i mesi di lavoro → meno giorni → meno FTE (220 gg/anno)
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
