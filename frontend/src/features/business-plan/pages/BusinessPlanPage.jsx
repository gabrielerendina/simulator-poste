import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { bpSaveTrigger } from '../../../utils/bpSaveTrigger';
import { useSimulation } from '../../simulation/context/SimulationContext';
import { useBusinessPlan } from '../context/BusinessPlanContext';
import { useConfig } from '../../config/context/ConfigContext';
import { useToast } from '../../../shared/hooks/useToast';
import axios from 'axios';
import { API_URL } from '../../../utils/api';
import {
  Briefcase,
  Building2,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  MailCheck,
  Users,
  BarChart3,
  Calendar,
  FileDown,
} from 'lucide-react';

import {
  ParametersPanel,
  TeamCompositionTable,
  TowConfigTable,
  ProfileMappingEditor,
  PracticeCatalogManager,
  MarginSimulator,
  VolumeAdjustments,
  CostBreakdown,
  ScenarioCards,
  ProfitAndLoss,
  SubcontractPanel,
  OfferSchemeTable,
  TowAnalysis,
} from '../components';



import { DEFAULT_DAILY_RATE, DAYS_PER_FTE, SCENARIO_PARAMS } from '../constants';

export default function BusinessPlanPage() {
  const { t } = useTranslation();
  const { selectedLot, myDiscount } = useSimulation();
  const { config } = useConfig();
  const toast = useToast();
  const {
    businessPlan,
    practices,
    loading,
    error,
    saveBusinessPlan,
    savePractice,
    deletePractice,
    registerSaveTrigger,
  } = useBusinessPlan();

  const lotData = config && selectedLot ? config[selectedLot] : null;

  // Local state for editing
  const [localBP, setLocalBP] = useState(null);
  const [calcResult, setCalcResult] = useState(null);
  const [cleanTeamCost, setCleanTeamCost] = useState(0);
  const [towBreakdown, setTowBreakdown] = useState({});
  const [lutechProfileBreakdown, setLutechProfileBreakdown] = useState({});
  const [intervals, setIntervals] = useState([]);
  const [teamMixRate, setTeamMixRate] = useState(0);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [discount, setDiscount] = useState(() => myDiscount ?? 0);
  const [targetMargin, setTargetMargin] = useState(15);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [excelExportLoading, setExcelExportLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('poste');

  // Build Lutech rates lookup from practices
  const buildLutechRates = useCallback(() => {
    const rates = {};
    const fallbackRate = localBP?.default_daily_rate || DEFAULT_DAILY_RATE;
    for (const practice of practices) {
      for (const profile of (practice.profiles || [])) {
        rates[`${practice.id}:${profile.id}`] = profile.daily_rate || fallbackRate;
      }
    }
    return rates;
  }, [practices, localBP]);

  const buildLutechLabels = useCallback(() => {
    const labels = {};
    for (const practice of practices) {
      for (const profile of (practice.profiles || [])) {
        labels[`${practice.id}:${profile.id}`] = {
          profile: profile.label || profile.id,
          practice: practice.label || practice.id
        };
      }
    }
    return labels;
  }, [practices]);

  // Sync discount with sidebar myDiscount only when lot changes (not on every myDiscount tweak)
  useEffect(() => {
    setDiscount(myDiscount ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLot]);

  // Initialize local state from fetched BP
  useEffect(() => {
    if (businessPlan) {
      // Convert decimals from API to percentages for UI display
      setLocalBP({
        ...businessPlan,
        governance_pct: (businessPlan.governance_pct || 0.04) * 100,
        risk_contingency_pct: (businessPlan.risk_contingency_pct || 0.03) * 100,
        reuse_factor: (businessPlan.reuse_factor || 0) * 100,
        days_per_fte: businessPlan.days_per_fte || DAYS_PER_FTE,
        default_daily_rate: businessPlan.default_daily_rate || DEFAULT_DAILY_RATE,
        governance_mode: businessPlan.governance_mode || 'percentage',
        governance_fte_periods: businessPlan.governance_fte_periods || [],
        governance_apply_reuse: businessPlan.governance_apply_reuse || false,
      });
    } else if (selectedLot) {
      // Initialize empty BP (values already in percentage form)
      const defaultDuration = 36;
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1; // JavaScript months are 0-indexed
      setLocalBP({
        duration_months: defaultDuration,
        start_year: currentYear,
        start_month: currentMonth,
        days_per_fte: DAYS_PER_FTE,
        default_daily_rate: DEFAULT_DAILY_RATE,
        governance_pct: 4,
        risk_contingency_pct: 3,
        reuse_factor: 0,
        team_composition: [],
        tows: [],
        volume_adjustments: { periods: [{ month_start: 1, month_end: defaultDuration, by_tow: {}, by_profile: {} }] },
        tow_assignments: {},
        profile_mappings: {},
        subcontract_config: {},
        governance_profile_mix: [],
        governance_cost_manual: null,
        governance_mode: 'percentage',
        governance_fte_periods: [],
        governance_apply_reuse: false,
      });
    }
  }, [businessPlan, selectedLot]);

  /**
   * Calculate team cost with explicit parameters.
   * Returns { total, byTow } where byTow is a {towId: cost} map.
   *
   * @param {object} bp - business plan data
   * @param {object} overrides - optional overrides for reuse_factor and volume_adjustments
   */
  const calculateTeamCost = useCallback((bp, overrides = {}) => {
    if (!bp.team_composition || bp.team_composition.length === 0) {
      return { total: 0, byTow: {} };
    }

    const reusePct = overrides.reuse_factor ?? bp.reuse_factor ?? 0;
    const reuseFactor = 1 - (reusePct / 100);
    const durationMonths = bp.duration_months || 36;
    const daysPerFte = bp.days_per_fte || DAYS_PER_FTE;
    const defaultRate = bp.default_daily_rate || DEFAULT_DAILY_RATE;

    const lutechRates = buildLutechRates();
    const lutechLabels = buildLutechLabels(); // Map for Lutech profile labels from practices

    // Volume adjustments - use overrides if provided
    const volAdj = overrides.volume_adjustments ?? bp.volume_adjustments;
    const adjustmentPeriods = volAdj?.periods || [{
      month_start: 1,
      month_end: durationMonths,
      by_tow: volAdj?.by_tow || {},
      by_profile: volAdj?.by_profile || {},
    }];

    // Help: get adjustment period for a specific month
    const getAdjustmentPeriodAtMonth = (month) => {
      for (const p of adjustmentPeriods) {
        if (month >= (p.month_start || 1) && month <= (p.month_end || durationMonths)) {
          return p;
        }
      }
      return adjustmentPeriods[0];
    };

    // Helper: get factor for a profile in a specific month
    const getProfileFactorAtMonth = (profileId, month) => {
      for (const p of adjustmentPeriods) {
        if (month >= (p.month_start || 1) && month <= (p.month_end || durationMonths)) {
          return p.by_profile?.[profileId] ?? 1.0;
        }
      }
      return 1.0;
    };

    // Helper: get average rate for a profile in a specific month
    const getProfileRateAtMonth = (profileId, month) => {
      const mapping = bp.profile_mappings?.[profileId] || [];
      for (const periodMapping of mapping) {
        if (month >= (periodMapping.month_start || 1) && month <= (periodMapping.month_end || durationMonths)) {
          const mix = periodMapping.mix || [];
          let periodRate = 0;
          let periodPct = 0;
          for (const m of mix) {
            const rate = lutechRates[m.lutech_profile] || defaultRate;
            const pct = (m.pct || 0) / 100;
            periodRate += rate * pct;
            periodPct += pct;
          }
          return periodPct > 0 ? periodRate / periodPct : defaultRate;
        }
      }
      return defaultRate;
    };

    // Helper: get Lutech mix for a profile in a specific month
    const getLutechMixAtMonth = (profileId, month) => {
      const mapping = bp.profile_mappings?.[profileId] || [];
      for (const periodMapping of mapping) {
        if (month >= (periodMapping.month_start || 1) && month <= (periodMapping.month_end || durationMonths)) {
          return periodMapping.mix || [];
        }
      }
      return null;
    };

    let totalCost = 0;
    const byTow = {}; // { id: { cost, label, days, daysBase, contributions: [] } }
    const byLutechProfile = {};  // { full_id: { label, cost, days, daysBase, rate, contributions: [] } }
    const intervals = []; // for Excel parity
    let totalDays = 0;

    const towMap = (lotData?.tows || []).reduce((acc, t) => ({ ...acc, [t.tow_id]: t.label }), {});

    for (const member of bp.team_composition) {
      const profileId = member.profile_id || member.label;
      const fte = parseFloat(member.fte) || 0;
      const mapping = bp.profile_mappings?.[profileId] || [];

      // Boundaries for this member
      const boundaries = new Set([1, durationMonths + 1]);
      for (const p of adjustmentPeriods) {
        boundaries.add(p.month_start || 1);
        boundaries.add((p.month_end || durationMonths) + 1);
      }
      for (const pm of mapping) {
        boundaries.add(pm.month_start || 1);
        boundaries.add((pm.month_end || durationMonths) + 1);
      }
      const sorted = Array.from(boundaries).filter(b => b >= 1 && b <= durationMonths + 1).sort((a, b) => a - b);

      const triplets = []; // To collect granular profile intervals for TOW distribution

      for (let i = 0; i < sorted.length - 1; i++) {
        const start = sorted[i];
        const end = sorted[i + 1] - 1;
        const months = sorted[i + 1] - sorted[i];
        const years = months / 12;

        const factor = getProfileFactorAtMonth(profileId, start);
        const rate = getProfileRateAtMonth(profileId, start);
        const mix = getLutechMixAtMonth(profileId, start);

        // TOW Reduction for this member in this interval
        const adjustmentPeriod = getAdjustmentPeriodAtMonth(start);
        const towAllocation = member.tow_allocation || {};
        let towFactorSum = 0;
        let totalAllocatedPct = 0;
        for (const [towId, pct] of Object.entries(towAllocation)) {
          const towPct = parseFloat(pct) || 0;
          if (towPct > 0) {
            const tFactor = adjustmentPeriod.by_tow?.[towId] ?? 1.0;
            towFactorSum += (towPct / 100) * tFactor;
            totalAllocatedPct += (towPct / 100);
          }
        }
        const finalTowFactor = totalAllocatedPct > 0 ? (towFactorSum / totalAllocatedPct) : 1.0;

        const intervalRawDays = fte * daysPerFte * years; // Raw GG before any factor
        const intervalBaseDays = intervalRawDays * factor; // After profile factor
        const intervalDays = intervalBaseDays * (reuseFactor * finalTowFactor); // Effective GG
        const intervalCost = intervalDays * rate;

        // Record interval for Excel
        intervals.push({
          member: member.label,
          start_month: start,
          end_month: end,
          fte_base: fte,
          fte_factor: factor * reuseFactor * finalTowFactor,
          rate: rate,
          cost: intervalCost,
          days: intervalDays
        });

        // Accumulate per Lutech profile
        if (mix && mix.length > 0) {
          for (const m of mix) {
            if (!m.lutech_profile) continue;
            const pct = (m.pct || 0) / 100;
            const lRate = lutechRates[m.lutech_profile] || defaultRate;

            // WYSIWYG Rounding: round effective days at the most granular level
            const lDaysRaw = intervalRawDays * pct;
            const lDaysBase = intervalBaseDays * pct;
            const lDaysEff = Math.round(intervalDays * pct * 100) / 100;
            const lCost = lDaysEff * lRate;

            if (!byLutechProfile[m.lutech_profile]) {
              const info = lutechLabels[m.lutech_profile];
              const parts = m.lutech_profile.split(':');
              byLutechProfile[m.lutech_profile] = {
                label: info?.profile || (parts.length > 1 ? parts[1] : m.lutech_profile),
                practice: info?.practice || (parts[0] || ''),
                cost: 0,
                days: 0,
                daysBase: 0,
                daysRaw: 0,
                rate: lRate,
                contributions: []
              };
            }
            byLutechProfile[m.lutech_profile].cost += lCost;
            byLutechProfile[m.lutech_profile].days += lDaysEff;
            byLutechProfile[m.lutech_profile].daysBase += lDaysBase;
            byLutechProfile[m.lutech_profile].daysRaw += lDaysRaw;
            byLutechProfile[m.lutech_profile].contributions.push({
              memberLabel: member.label,
              months: `${start}-${end}`,
              days: lDaysEff,
              daysBase: lDaysBase,
              daysRaw: lDaysRaw,
              rate: lRate,
              cost: lCost,
              profileFactor: factor,
              efficiencyFactor: reuseFactor * finalTowFactor,
              reductions: {
                tow: finalTowFactor < 1 ? (1 - finalTowFactor) * 100 : 0,
                reuse: reuseFactor < 1 ? (1 - reuseFactor) * 100 : 0,
                profile: factor < 1 ? (1 - factor) * 100 : 0,
              }
            });

            // Prepare for TOW distribution
            triplets.push({
              member: member.label,
              lutech_profile: m.lutech_profile,
              daysRaw: lDaysRaw,
              daysBase: lDaysBase,
              daysEff: lDaysEff,
              cost: lCost,
              rate: lRate,
              factor,
              reuseFactor,
              finalTowFactor,
              start,
              end
            });
          }
        } else {
          const defaultKey = '__default__';
          const defaultLRate = defaultRate;
          const lDaysRaw = intervalRawDays;
          const lDaysBase = intervalBaseDays;
          const lDaysEff = Math.round(intervalDays * 100) / 100;
          const lCost = lDaysEff * defaultLRate;

          if (!byLutechProfile[defaultKey]) {
            byLutechProfile[defaultKey] = {
              label: 'Non mappato',
              practice: '',
              cost: 0,
              days: 0,
              daysBase: 0,
              daysRaw: 0,
              rate: defaultLRate,
              contributions: []
            };
          }
          byLutechProfile[defaultKey].cost += lCost;
          byLutechProfile[defaultKey].days += lDaysEff;
          byLutechProfile[defaultKey].daysBase += lDaysBase;
          byLutechProfile[defaultKey].daysRaw += lDaysRaw;
          byLutechProfile[defaultKey].contributions.push({
            memberLabel: member.label,
            months: `${start}-${end}`,
            days: lDaysEff,
            daysBase: lDaysBase,
            daysRaw: lDaysRaw,
            profileFactor: factor,
            efficiencyFactor: reuseFactor * finalTowFactor,
            rate: defaultLRate,
            cost: lCost,
            reductions: {
              tow: finalTowFactor < 1 ? (1 - finalTowFactor) * 100 : 0,
              reuse: reuseFactor < 1 ? (1 - reuseFactor) * 100 : 0,
              profile: factor < 1 ? (1 - factor) * 100 : 0,
            }
          });

          triplets.push({
            member: member.label,
            lutech_profile: defaultKey,
            daysRaw: lDaysRaw,
            daysBase: lDaysBase,
            daysEff: lDaysEff,
            cost: lCost,
            rate: defaultLRate,
            factor,
            reuseFactor,
            finalTowFactor,
            start,
            end
          });
        }
      }

      // Distribute collected triplets to TOWs for logical parity and WYSIWYG audit
      const towAllocation = member.tow_allocation || {};
      const allocatedPcts = Object.entries(towAllocation).filter(([, pct]) => (parseFloat(pct) || 0) > 0);
      const sumAllocatedPcts = allocatedPcts.reduce((sum, [, pct]) => sum + (parseFloat(pct) || 0), 0);

      const activeAllocations = sumAllocatedPcts > 0 ? allocatedPcts : [['__no_tow__', 100]];
      const finalSum = sumAllocatedPcts > 0 ? sumAllocatedPcts : 100;

      for (const [towId, pct] of activeAllocations) {
        const towPct = parseFloat(pct) || 0;
        const ratio = towPct / finalSum;

        if (!byTow[towId]) {
          byTow[towId] = {
            cost: 0,
            days: 0,
            daysBase: 0,
            daysRaw: 0,
            label: towMap[towId] || towId,
            contributions: []
          };
        }

        for (const t of triplets) {
          const tRaw = t.daysRaw * ratio;
          const tBase = t.daysBase * ratio;
          const tEff = Math.round(t.daysEff * ratio * 100) / 100;
          const tCost = tEff * t.rate;

          byTow[towId].cost += tCost;
          byTow[towId].days += tEff;
          byTow[towId].daysBase += tBase;
          byTow[towId].daysRaw += tRaw;
          byTow[towId].contributions.push({
            memberLabel: t.member,
            profileLabel: byLutechProfile[t.lutech_profile]?.label || t.lutech_profile,
            months: `${t.start}-${t.end}`,
            days: tEff,
            daysBase: tBase,
            daysRaw: tRaw,
            cost: tCost,
            rate: t.rate,
            allocationPct: towPct,
            profileFactor: t.factor,
            efficiencyFactor: t.reuseFactor * t.finalTowFactor,
            reductions: {
              tow: t.finalTowFactor < 1 ? (1 - t.finalTowFactor) * 100 : 0,
              reuse: t.reuseFactor < 1 ? (1 - t.reuseFactor) * 100 : 0,
              profile: t.factor < 1 ? (1 - t.factor) * 100 : 0,
            }
          });

          totalCost += tCost;
          totalDays += tEff;
        }
      }
    }

    // Finalize rounding to 2 decimals for Euro values (Cent precision)
    for (const towId of Object.keys(byTow)) {
      byTow[towId].cost = Math.round(byTow[towId].cost * 100) / 100;
      byTow[towId].days = Math.round(byTow[towId].days * 10000) / 10000;
      byTow[towId].daysBase = Math.round(byTow[towId].daysBase * 10000) / 10000;
      byTow[towId].daysRaw = Math.round(byTow[towId].daysRaw * 10000) / 10000;
    }
    for (const key of Object.keys(byLutechProfile)) {
      byLutechProfile[key].cost = Math.round(byLutechProfile[key].cost * 100) / 100;
      byLutechProfile[key].days = Math.round(byLutechProfile[key].days * 10000) / 10000;
      byLutechProfile[key].daysBase = Math.round(byLutechProfile[key].daysBase * 10000) / 10000;
      byLutechProfile[key].daysRaw = Math.round(byLutechProfile[key].daysRaw * 10000) / 10000;
    }

    const teamMixRate = totalDays > 0 ? (totalCost / totalDays) : 0;

    return {
      total: Math.round(totalCost * 100) / 100,
      byTow,
      byLutechProfile,
      teamMixRate,
      intervals
    };
  }, [buildLutechRates, buildLutechLabels, lotData?.tows]);

  // Calculate governance cost based on governance_mode
  const calculateGovernanceCost = useCallback((bp, teamCost) => {
    const mode = bp.governance_mode || 'percentage';
    const durationMonths = bp.duration_months || 36;
    const durationYears = durationMonths / 12;
    const daysPerFte = bp.days_per_fte || DAYS_PER_FTE;

    let baseCost = 0;
    let meta = {};

    // MODE: manual
    if (mode === 'manual') {
      const val = bp.governance_cost_manual;
      if (val !== null && val !== undefined) {
        baseCost = val;
        meta = { method: 'manuale' };
      }
    }
    // MODE: fte — somma costi per time slice
    else if (mode === 'fte' && (bp.governance_fte_periods || []).length > 0) {
      const lutechRates = buildLutechRates();
      let totalCost = 0;

      for (const period of bp.governance_fte_periods) {
        const periodFte = parseFloat(period.fte) || 0;
        const periodMonths = (period.month_end || durationMonths) - (period.month_start || 1) + 1;
        const periodYears = periodMonths / 12;
        const mix = period.team_mix || [];

        let periodAvgRate = 0;
        let totalPct = 0;
        for (const item of mix) {
          const rate = lutechRates[item.lutech_profile] || 0;
          const pct = (item.pct || 0) / 100;
          totalPct += pct;
          periodAvgRate += rate * pct;
        }
        if (totalPct > 0) periodAvgRate = periodAvgRate / totalPct;

        totalCost += periodFte * (periodAvgRate || 0) * daysPerFte * periodYears;
      }

      baseCost = totalCost;
      meta = { method: 'fte', periods: bp.governance_fte_periods.length };
    }
    // MODE: team_mix — governance FTE * tariffa media profili
    else if (mode === 'team_mix') {
      const totalFte = (bp.team_composition || []).reduce((sum, m) => sum + (parseFloat(m.fte) || 0), 0);
      const governanceFte = totalFte * ((bp.governance_pct || 0) / 100);
      const govMix = bp.governance_profile_mix || [];

      if (govMix.length > 0) {
        const lutechRates = buildLutechRates();
        let totalPct = 0;
        let weightedRate = 0;

        for (const item of govMix) {
          const rate = lutechRates[item.lutech_profile] || 0;
          const pct = (item.pct || 0) / 100;
          totalPct += pct;
          weightedRate += rate * pct;
        }

        if (totalPct > 0) {
          const avgRate = weightedRate / totalPct;
          baseCost = governanceFte * daysPerFte * durationYears * avgRate;
          meta = { method: 'mix_profili', fte: governanceFte, daysPerFte, years: durationYears, avgRate };
        }
      }
    }

    // MODE: percentage (default/fallback)
    if (baseCost === 0 && Object.keys(meta).length === 0) {
      baseCost = teamCost * ((bp.governance_pct || 0) / 100);
      meta = { method: 'percentuale_team', pct: bp.governance_pct };
    }

    // Apply reuse factor if enabled
    let finalCost = baseCost;
    if (bp.governance_apply_reuse && (bp.reuse_factor || 0) > 0) {
      const reuseFactor = (bp.reuse_factor || 0) / 100; // Convert from percentage
      finalCost = baseCost * (1 - reuseFactor);
      meta.reuse_applied = true;
      meta.reuse_factor = bp.reuse_factor;
      meta.base_cost = baseCost;
    }

    return {
      value: Math.round(finalCost * 100) / 100,
      meta
    };
  }, [buildLutechRates]);

  // Generate scenarios with real recalculation and suggested discount
  // effectiveBase is already Lutech's share (baseAmount * quotaLutech)
  const generateScenarios = useCallback((bp, effectiveBase, currentCost) => {
    if (!effectiveBase || !currentCost) return [];

    return SCENARIO_PARAMS.map(({ name, reuse, profileReduction }) => {
      const neutralVolAdj = { periods: [{ month_start: 1, month_end: bp.duration_months || 36, by_tow: {}, by_profile: {} }] };

      const team = bp.team_composition || [];
      for (const member of team) {
        const pid = member.profile_id || member.label;
        neutralVolAdj.periods[0].by_profile[pid] = profileReduction;
      }

      const scenarioResult = calculateTeamCost(bp, {
        reuse_factor: reuse,
        volume_adjustments: neutralVolAdj,
      });

      const scenarioCost = scenarioResult.total;
      const govResult = calculateGovernanceCost(bp, scenarioCost);
      const govCost = govResult.value;
      const riskCost = (scenarioCost + govCost) * ((bp.risk_contingency_pct || 3) / 100);
      const towSplit = bp.subcontract_config?.tow_split || {};
      const subPct = Object.values(towSplit).reduce((sum, pct) => sum + (parseFloat(pct) || 0), 0);
      const subCost = scenarioCost * (subPct / 100);
      const totalScenarioCost = scenarioCost + govCost + riskCost + subCost;

      const revenue = effectiveBase;
      const margin = revenue - totalScenarioCost;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

      // Find discount that achieves the target margin
      const target = targetMargin / 100;
      const denom = effectiveBase * (1 - target);
      const suggestedDiscount = denom > 0
        ? Math.max(0, Math.min(100, (1 - totalScenarioCost / denom) * 100))
        : 0;

      return {
        name,
        volume_adjustment: profileReduction,
        reuse_factor: reuse / 100,
        total_cost: totalScenarioCost,
        team_cost: scenarioCost,
        revenue,
        margin,
        margin_pct: marginPct,
        suggested_discount: parseFloat(suggestedDiscount.toFixed(2)),
      };
    });
  }, [calculateTeamCost, calculateGovernanceCost, targetMargin]);

  // Calculate costs when BP changes
  const runCalculation = useCallback(() => {
    if (!localBP || !lotData) return;

    try {
      // Optimized team cost with TOW breakdown
      const teamResult = calculateTeamCost(localBP);
      const teamCost = teamResult.total;

      // Clean team cost (no optimizations)
      const cleanResult = calculateTeamCost(localBP, {
        reuse_factor: 0,
        volume_adjustments: { periods: [{ month_start: 1, month_end: localBP.duration_months || 36, by_tow: {}, by_profile: {} }] },
      });

      // Governance
      const govResult = calculateGovernanceCost(localBP, teamCost);
      const governanceCost = govResult.value;

      // Risk (calcolato su team + governance)
      const riskPct = localBP.risk_contingency_pct || 0;
      const riskCost = Math.round((teamCost + governanceCost) * (riskPct / 100) * 100) / 100;

      // Subcontract
      const towSplit = localBP.subcontract_config?.tow_split || {};
      const subQuotaPct = Object.values(towSplit).reduce((sum, pct) => sum + (parseFloat(pct) || 0), 0);
      const subcontractCost = Math.round(teamCost * (subQuotaPct / 100) * 100) / 100;
      const subAvgRate = localBP.subcontract_config?.avg_daily_rate ?? teamMixRate;
      const subPartner = localBP.subcontract_config?.partner || 'Non specificato';

      const totalCostRaw = teamCost + governanceCost + riskCost + subcontractCost;
      const totalCost = Math.round(totalCostRaw * 100) / 100;

      setCalcResult({
        team: teamCost,
        governance: governanceCost,
        risk: riskCost,
        subcontract: subcontractCost,
        total: totalCost,
        explanation: {
          governance: govResult.meta,
          risk: { pct: riskPct, base: teamCost + governanceCost },
          subcontract: {
            pct: subQuotaPct,
            avg_daily_rate: subAvgRate,
            partner: subPartner
          }
        }
      });

      setCleanTeamCost(cleanResult.total);
      setTowBreakdown(teamResult.byTow);
      setLutechProfileBreakdown(teamResult.byLutechProfile || {});
      setIntervals(teamResult.intervals || []);
      setTeamMixRate(teamResult.teamMixRate || 0);

      // Generate scenarios using effective base (already Lutech's share)
      const rawBase = lotData.base_amount || 0;
      const isRtiCalc = lotData.rti_enabled || false;
      const qLutechCalc = isRtiCalc && lotData.rti_quotas?.Lutech
        ? lotData.rti_quotas.Lutech / 100 : 1.0;
      const effectiveBase = rawBase * qLutechCalc;
      const newScenarios = generateScenarios(localBP, effectiveBase, totalCost);
      setScenarios(newScenarios);

    } catch (err) {
      console.error('Calculation error:', err);
      toast.error(`Errore nel calcolo: ${err.message || 'Errore sconosciuto'}`);
    }
  }, [localBP, lotData, calculateTeamCost, calculateGovernanceCost, generateScenarios, teamMixRate, toast]);

  useEffect(() => {
    runCalculation();
  }, [runCalculation]);

  // Ref to always hold the latest handleSave (for registerSaveTrigger)
  const handleSaveRef = useRef(null);

  // Handle save
  const handleSave = async () => {
    if (!localBP) return;

    setSaving(true);
    setSaveStatus(null);

    try {
      // Convert percentages to decimals for API
      const dataToSave = {
        ...localBP,
        governance_pct: localBP.governance_pct / 100,
        risk_contingency_pct: localBP.risk_contingency_pct / 100,
        reuse_factor: localBP.reuse_factor / 100,
        days_per_fte: localBP.days_per_fte,
        default_daily_rate: localBP.default_daily_rate,
      };

      await saveBusinessPlan(dataToSave);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Errore sconosciuto';
      toast.error(`Errore nel salvataggio: ${errorMsg}`);
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // Keep ref updated and register with singleton so App.jsx top-bar Salva triggers BP save
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });
  useEffect(() => {
    bpSaveTrigger.fn = () => handleSaveRef.current?.();
    return () => { bpSaveTrigger.fn = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExcelExport = async () => {
    if (!localBP || !lotData || !calcResult) return;

    setExcelExportLoading(true);
    try {
      const res = await axios.post(`${API_URL}/business-plan-export`, {
        lot_key: selectedLot,
        business_plan: {
          ...localBP,
          governance_pct: localBP.governance_pct / 100,
          risk_contingency_pct: localBP.risk_contingency_pct / 100,
          reuse_factor: localBP.reuse_factor / 100,
        },
        costs: calcResult,
        clean_team_cost: cleanTeamCost,
        base_amount: lotData.base_amount || 0,
        is_rti: isRti,
        quota_lutech: quotaLutech,
        scenarios: scenarios,
        tow_breakdown: towBreakdown,
        lutech_breakdown: lutechProfileBreakdown,
        profile_rates: buildLutechRates(),
        profile_labels: buildLutechLabels(),
        intervals: intervals,
      }, { responseType: 'blob' });

      const url = window.URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `business_plan_${selectedLot.replace(/\s+/g, '_')}.xlsx`);
      document.body.appendChild(link);
      link.click();

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (err) {
      console.error("Excel Export Error", err);
      toast.error(`Errore nell'export Excel: ${err.message || 'Errore sconosciuto'}`);
      setSaveStatus('error');
    } finally {
      setExcelExportLoading(false);
    }
  };

  // Update handlers
  const handleTeamChange = (team) => {
    setLocalBP(prev => ({ ...prev, team_composition: team }));
  };

  const handleTowsChange = (tows) => {
    setLocalBP(prev => ({ ...prev, tows }));
  };

  const handleTowAssignmentChange = (assignments) => {
    setLocalBP(prev => ({ ...prev, tow_assignments: assignments }));
  };

  const handleVolumeAdjustmentsChange = (adjustments) => {
    setLocalBP(prev => ({ ...prev, volume_adjustments: adjustments }));
  };

  const handleProfileMappingsChange = (mappings) => {
    setLocalBP(prev => ({ ...prev, profile_mappings: mappings }));
  };

  const handleParametersChange = (params) => {
    setLocalBP(prev => ({
      ...prev,
      ...params
    }));
  };

  const handleDurationChange = (months) => {
    const newDuration = parseFloat(months) || 36;
    setLocalBP(prev => {
      // Update duration_months and adjust volume_adjustments if needed
      const volumeAdj = prev.volume_adjustments || {};
      const periods = volumeAdj.periods || [];
      const oldDuration = prev.duration_months || 36;

      // Update all periods, removing those that start after new duration
      let updatedPeriods = periods
        .map(period => {
          // Se il periodo inizia dopo la nuova durata, scartalo
          if ((period.month_start || 1) > newDuration) {
            return null;
          }

          // Se il periodo finiva con la vecchia durata, estendilo alla nuova
          if (period.month_end === oldDuration) {
            return { ...period, month_end: newDuration };
          }

          // Se il periodo eccede la nuova durata, clampalo
          if (period.month_end > newDuration) {
            return { ...period, month_end: newDuration };
          }

          return period;
        })
        .filter(Boolean); // Rimuovi periodi null

      // Se non ci sono più periodi validi, crea un periodo default
      if (updatedPeriods.length === 0) {
        updatedPeriods = [{
          month_start: 1,
          month_end: newDuration,
          by_tow: {},
          by_profile: {}
        }];
      }

      return {
        ...prev,
        duration_months: newDuration,
        volume_adjustments: {
          ...volumeAdj,
          periods: updatedPeriods
        }
      };
    });
  };

  const handleDaysPerFteChange = (days) => {
    setLocalBP(prev => ({ ...prev, days_per_fte: parseFloat(days) || DAYS_PER_FTE }));
  };

  const handleDefaultRateChange = (rate) => {
    setLocalBP(prev => ({ ...prev, default_daily_rate: parseFloat(rate) || DEFAULT_DAILY_RATE }));
  };

  const handleStartYearChange = (year) => {
    setLocalBP(prev => ({ ...prev, start_year: parseInt(year) || null }));
  };

  const handleStartMonthChange = (month) => {
    setLocalBP(prev => ({ ...prev, start_month: parseInt(month) || null }));
  };

  // Calcola data fine e anni interessati
  const getContractPeriodInfo = () => {
    if (!localBP?.start_year || !localBP?.start_month || !localBP?.duration_months) {
      return null;
    }

    const startYear = localBP.start_year;
    const startMonth = localBP.start_month;
    const durationMonths = localBP.duration_months;

    // Calcola data fine
    const totalMonths = startMonth + durationMonths - 1;
    const endYear = startYear + Math.floor((totalMonths - 1) / 12);
    const endMonth = ((totalMonths - 1) % 12) + 1;

    // Calcola anni interessati
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }

    return {
      startYear,
      startMonth,
      endYear,
      endMonth,
      years,
      yearsCount: years.length
    };
  };

  const handleSubcontractChange = (subConfig) => {
    setLocalBP(prev => ({ ...prev, subcontract_config: subConfig }));
  };

  // Apply optimization proposal (juniorization)
  const handleApplyOptimization = (proposal) => {
    if (!proposal?.profileId) return;

    const profileId = proposal.profileId;
    const currentMappings = { ...(localBP.profile_mappings || {}) };
    const profileMapping = currentMappings[profileId] || [];

    if (profileMapping.length === 0) {
      // No mapping exists, cannot apply optimization
      return;
    }

    // Build a lookup of Lutech profile seniority from practices
    const lutechSeniority = {};
    (practices || []).forEach(practice => {
      (practice.profiles || []).forEach(profile => {
        const fullId = `${practice.id}:${profile.id}`;
        lutechSeniority[fullId] = profile.seniority || 'mid';
      });
    });

    // Update each period in the mapping
    const updatedMapping = profileMapping.map(period => {
      const currentMix = period.mix || [];
      if (currentMix.length === 0) return period;

      // Find senior and junior profiles in the mix
      let seniorProfiles = [];
      let juniorProfiles = [];

      currentMix.forEach(m => {
        const seniority = lutechSeniority[m.lutech_profile] || 'mid';
        if (seniority === 'sr' || seniority === 'senior' || seniority === 'expert') {
          seniorProfiles.push(m);
        } else if (seniority === 'jr' || seniority === 'junior') {
          juniorProfiles.push(m);
        }
      });

      // If no senior or no junior profiles, cannot optimize
      if (seniorProfiles.length === 0 || juniorProfiles.length === 0) {
        // Try mid profiles as target for junior replacement
        const midProfiles = currentMix.filter(m => {
          const s = lutechSeniority[m.lutech_profile] || 'mid';
          return s === 'mid';
        });
        if (seniorProfiles.length === 0 || midProfiles.length === 0) {
          return period;
        }
        juniorProfiles = midProfiles;
      }

      // Calculate transfer amount (30% of total senior pct)
      const totalSeniorPct = seniorProfiles.reduce((sum, m) => sum + (m.pct || 0), 0);
      const transferPct = Math.min(totalSeniorPct * 0.3, totalSeniorPct); // Transfer 30%

      if (transferPct < 1) return period; // Too small to matter

      // Create new mix with adjusted percentages
      const newMix = currentMix.map(m => {
        const seniority = lutechSeniority[m.lutech_profile] || 'mid';
        const isSenior = seniority === 'sr' || seniority === 'senior' || seniority === 'expert';
        const isJunior = seniority === 'jr' || seniority === 'junior' || seniority === 'mid';

        if (isSenior && seniorProfiles.length > 0) {
          // Reduce senior by their proportion of transfer
          const proportion = (m.pct || 0) / totalSeniorPct;
          const reduction = transferPct * proportion;
          return { ...m, pct: Math.max(0, (m.pct || 0) - reduction) };
        } else if (isJunior && juniorProfiles.some(j => j.lutech_profile === m.lutech_profile)) {
          // Increase junior by their proportion
          const totalJuniorPct = juniorProfiles.reduce((sum, j) => sum + (j.pct || 0), 0);
          const proportion = totalJuniorPct > 0 ? (m.pct || 0) / totalJuniorPct : 1 / juniorProfiles.length;
          const increase = transferPct * proportion;
          return { ...m, pct: (m.pct || 0) + increase };
        }
        return m;
      });

      // Normalize to 100% and round
      const total = newMix.reduce((sum, m) => sum + (m.pct || 0), 0);
      const normalizedMix = newMix.map(m => ({
        ...m,
        pct: Math.round((m.pct || 0) * 100 / total)
      }));

      // Adjust for rounding errors
      const normalizedTotal = normalizedMix.reduce((sum, m) => sum + m.pct, 0);
      if (normalizedTotal !== 100 && normalizedMix.length > 0) {
        normalizedMix[0].pct += (100 - normalizedTotal);
      }

      return { ...period, mix: normalizedMix };
    });

    currentMappings[profileId] = updatedMapping;
    setLocalBP(prev => ({ ...prev, profile_mappings: currentMappings }));
  };

  // Apply scenario
  const handleSelectScenario = (scenarioName) => {
    setSelectedScenario(scenarioName);
    const scenario = scenarios.find(s => s.name === scenarioName);
    if (scenario) {
      setLocalBP(prev => ({
        ...prev,
        reuse_factor: scenario.reuse_factor * 100,
      }));
      // Apply suggested discount
      if (scenario.suggested_discount > 0) {
        setDiscount(scenario.suggested_discount);
      }
    }
  };

  const isRti = lotData?.rti_enabled || false;
  const quotaLutech = isRti && lotData?.rti_quotas?.Lutech
    ? lotData.rti_quotas.Lutech / 100
    : 1.0;

  // Base d'asta effettiva per Lutech: se RTI, e gia la quota Lutech
  const effectiveBaseAmount = (lotData?.base_amount || 0) * quotaLutech;

  // Calculate Offer Scheme Data (PxQ)
  const calculateOfferData = useCallback(() => {
    if (!calcResult || !localBP || !lotData) return { data: [], total: 0 };

    // Revenue Target (Base d'asta effettiva - Sconto)
    const effectiveBase = (lotData.base_amount || 0) * (isRti && lotData.rti_quotas?.Lutech ? lotData.rti_quotas.Lutech / 100 : 1.0);
    const revenue = effectiveBase * (1 - discount / 100);

    // TOW Breakdown logic:
    // Dobbiamo ripartire la Revenue totale sui TOW.
    // Usiamo il 'byTow' breakdown del costo del team come driver principale.
    // Ma ci sono anche costi Governance, Risk e Subappalto che non sono nel 'byTow'.
    // Strategia: Spalmare Gov e Risk proporzionalmente sul Team Cost dei TOW.
    // Subappalto: Se specifico per TOW, va aggiunto al TOW specifico.

    // 1. Recupera breakdown costi team per TOW
    const teamByTow = towBreakdown || {};

    // 2. Recupera split subappalto
    const subSplit = localBP.subcontract_config?.tow_split || {};

    // 3. Calcola "Costo Pieno" per ogni TOW (Team + Sub + Quota Gov + Quota Risk)
    // Gov è % sul Team, Risk è % su (Team + Gov)
    // CostoPieno_Tow = TeamCost_Tow * (1 + Gov% + (1+Gov%)*Risk%) + SubCost_Tow
    //                = TeamCost_Tow * (1 + Gov% + Risk% + Gov%*Risk%) + SubCost_Tow

    const govPct = localBP.governance_pct / 100;
    const riskPct = localBP.risk_contingency_pct / 100;
    const overheadFactor = 1 + govPct + riskPct + (govPct * riskPct);

    const fullCostByTow = {};
    let totalFullCost = 0;

    const tows = localBP.tows || [];

    for (const tow of tows) {
      const towId = tow.tow_id;
      const teamC = teamByTow[towId]?.cost || 0;

      // Subappalto per questo TOW
      const subPct = subSplit[towId] || 0;
      const subC = calcResult.team * (subPct / 100); // Sub calcolato su base team totale ma attribuito a questo tow

      const towFullCost = (teamC * overheadFactor) + subC;
      fullCostByTow[towId] = towFullCost;
      totalFullCost += towFullCost;
    }

    // 4. Ripartisci Revenue su base Costo Pieno
    const offerData = [];
    let checkTotal = 0;

    for (const tow of tows) {
      const towId = tow.tow_id;
      const fullCost = fullCostByTow[towId] || 0;

      // Share di revenue
      const share = totalFullCost > 0 ? fullCost / totalFullCost : 0;
      const totalPrice = revenue * share;

      // Quantità
      let quantity = 0;
      if (tow.type === 'task') {
        quantity = parseInt(tow.num_tasks) || 0;
      } else if (tow.type === 'corpo') {
        quantity = parseInt(tow.duration_months) || parseInt(localBP.duration_months) || 36;
      } else {
        quantity = 1; // Consumo default
      }

      // Prezzo unitario
      const unitPrice = quantity > 0 ? totalPrice / quantity : 0;

      offerData.push({
        tow_id: towId,
        label: tow.label,
        type: tow.type,
        quantity: quantity,
        unit_price: unitPrice,
        total_price: totalPrice
      });

      checkTotal += totalPrice;
    }

    return { data: offerData, total: checkTotal };

  }, [calcResult, localBP, lotData, discount, towBreakdown, isRti]);

  // Loading state
  if (!selectedLot || !lotData) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-6">
              <Briefcase className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-700 mb-2">
              {t('business_plan.title')}
            </h2>
            <p className="text-slate-500 max-w-md">
              {t('business_plan.no_lot_selected')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !localBP) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-64 bg-slate-200 rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const offerScheme = calculateOfferData();

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <Briefcase className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {t('business_plan.title')}
              </h1>
              <p className="text-sm text-slate-500">
                {t('business_plan.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-semibold rounded-lg border border-slate-200">
              {selectedLot}
            </span>
            {isRti && (
              <span className="inline-flex items-center gap-1 px-2 py-1.5 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200">
                <Building2 className="w-3 h-3" />
                RTI {quotaLutech * 100}%
              </span>
            )}
            <button
              onClick={handleExcelExport}
              disabled={excelExportLoading || !calcResult}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg
                         font-medium text-sm hover:bg-green-700 transition-colors shadow-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {excelExportLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
              Export Excel
            </button>
            {/* Save status indicator (no separate save button — use global top-bar Salva) */}
            {saving && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvataggio...
              </div>
            )}
          </div>
        </div>

        {/* Save status */}
        {saveStatus && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${saveStatus === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
            {saveStatus === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">
              {saveStatus === 'success' ? 'Business Plan salvato con successo' : 'Errore nel salvataggio'}
            </span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white rounded-t-xl">
          {[
            { id: 'poste', label: 'Poste', icon: MailCheck, desc: 'Requisiti e volumi' },
            { id: 'lutech', label: 'Lutech', icon: Users, desc: 'Team, costi e parametri' },
            { id: 'analisi', label: 'Analisi', icon: BarChart3, desc: 'P&L, margine, scenari' },
            { id: 'offerta', label: 'Offerta', icon: FileDown, desc: 'Schema PxQ' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium
                         transition-colors border-b-2 ${activeTab === tab.id
                  ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              <span className="hidden md:inline text-xs opacity-60">— {tab.desc}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-6">

          {/* ═══ TAB 1: POSTE ═══ */}
          {activeTab === 'poste' && (
            <div className="space-y-6">
              {/* Configurazione TOW */}
              <TowConfigTable
                tows={localBP.tows || []}
                practices={practices}
                towAssignments={localBP.tow_assignments || {}}
                onChange={handleTowsChange}
                onAssignmentChange={handleTowAssignmentChange}
                volumeAdjustments={localBP.volume_adjustments || {}}
                durationMonths={localBP.duration_months}
              />

              {/* Composizione Team (requisiti Poste) */}
              <TeamCompositionTable
                team={localBP.team_composition || []}
                tows={localBP.tows || []}
                durationMonths={localBP.duration_months}
                daysPerFte={localBP.days_per_fte || DAYS_PER_FTE}
                onChange={handleTeamChange}
                volumeAdjustments={localBP.volume_adjustments || {}}
                reuseFactor={localBP.reuse_factor || 0}
              />

              {/* Parametri Poste: Durata + Rettifica Volumi */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                <div className="p-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800">Parametri Poste</h3>
                      <p className="text-xs text-slate-500">Durata, giorni/anno FTE, tariffa default e rettifica volumi</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* Data Inizio Contratto */}
                  <div className="pb-4 border-b border-slate-100">
                    <label className="text-sm font-medium text-slate-700 mb-3 block">Data Inizio Contratto</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Anno */}
                      <div className="space-y-2">
                        <label className="text-xs text-slate-500">Anno</label>
                        <input
                          type="number"
                          min={2020}
                          max={2040}
                          value={localBP.start_year || ''}
                          onChange={(e) => handleStartYearChange(e.target.value)}
                          placeholder="es. 2026"
                          className="w-full px-3 py-2 text-center border border-slate-200 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* Mese */}
                      <div className="space-y-2">
                        <label className="text-xs text-slate-500">Mese</label>
                        <select
                          value={localBP.start_month || ''}
                          onChange={(e) => handleStartMonthChange(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleziona...</option>
                          <option value="1">Gennaio</option>
                          <option value="2">Febbraio</option>
                          <option value="3">Marzo</option>
                          <option value="4">Aprile</option>
                          <option value="5">Maggio</option>
                          <option value="6">Giugno</option>
                          <option value="7">Luglio</option>
                          <option value="8">Agosto</option>
                          <option value="9">Settembre</option>
                          <option value="10">Ottobre</option>
                          <option value="11">Novembre</option>
                          <option value="12">Dicembre</option>
                        </select>
                      </div>

                      {/* Info calcolate */}
                      {(() => {
                        const periodInfo = getContractPeriodInfo();
                        if (!periodInfo) return null;

                        const monthNames = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

                        return (
                          <div className="space-y-2">
                            <label className="text-xs text-slate-500">Periodo Contratto</label>
                            <div className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg border border-blue-200 text-sm font-medium">
                              {monthNames[periodInfo.startMonth - 1]} {periodInfo.startYear} → {monthNames[periodInfo.endMonth - 1]} {periodInfo.endYear}
                            </div>
                            <div className="text-xs text-slate-500">
                              {periodInfo.yearsCount} ann{periodInfo.yearsCount > 1 ? 'i' : 'o'} interessat{periodInfo.yearsCount > 1 ? 'i' : 'o'}: {periodInfo.years.join(', ')}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Parametri base (griglia orizzontale) */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Durata (mesi) */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Durata Contratto</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={12}
                          max={60}
                          value={localBP.duration_months || 36}
                          onChange={(e) => handleDurationChange(e.target.value)}
                          className="w-20 px-3 py-2 text-center border border-slate-200 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-sm text-slate-500">mesi</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        ({((localBP.duration_months || 36) / 12).toFixed(1)} anni)
                      </div>
                    </div>

                    {/* Giorni anno FTE */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Giorni/anno FTE</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={180}
                          max={260}
                          value={localBP.days_per_fte || DAYS_PER_FTE}
                          onChange={(e) => handleDaysPerFteChange(e.target.value)}
                          className="w-20 px-3 py-2 text-center border border-slate-200 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-sm text-slate-500">gg</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        (giorni lavorativi/anno)
                      </div>
                    </div>

                    {/* Tariffa giornaliera default */}
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-700">Tariffa Default</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          step={10}
                          value={localBP.default_daily_rate || DEFAULT_DAILY_RATE}
                          onChange={(e) => handleDefaultRateChange(e.target.value)}
                          className="w-24 px-3 py-2 text-right border border-slate-200 rounded-lg
                                     focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <span className="text-sm text-slate-500">€/gg</span>
                      </div>
                      <div className="text-xs text-slate-400">
                        (tariffa giornaliera)
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100" />

                  {/* Rettifica Volumi */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Rettifica Volumi</label>
                    <VolumeAdjustments
                      adjustments={localBP.volume_adjustments || {}}
                      team={localBP.team_composition || []}
                      tows={localBP.tows || []}
                      durationMonths={localBP.duration_months}
                      onChange={handleVolumeAdjustmentsChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ TAB 2: LUTECH ═══ */}
          {activeTab === 'lutech' && (
            <div className="space-y-6">
              {/* Catalogo Profili Lutech */}
              <PracticeCatalogManager
                practices={practices}
                onSavePractice={savePractice}
                onDeletePractice={deletePractice}
              />

              {/* Profile Mapping */}
              <ProfileMappingEditor
                teamComposition={localBP.team_composition || []}
                practices={practices}
                mappings={localBP.profile_mappings || {}}
                durationMonths={localBP.duration_months}
                daysPerFte={localBP.days_per_fte || DAYS_PER_FTE}
                onChange={handleProfileMappingsChange}
                volumeAdjustments={localBP.volume_adjustments || {}}
                reuseFactor={localBP.reuse_factor || 0}
              />

              {/* Subappalto */}
              <SubcontractPanel
                config={localBP.subcontract_config || {}}
                tows={localBP.tows || []}
                teamCost={calcResult?.team || 0}
                teamMixRate={teamMixRate}
                defaultDailyRate={localBP.default_daily_rate || DEFAULT_DAILY_RATE}
                onChange={handleSubcontractChange}
              />

              {/* Parametri Generali */}
              <ParametersPanel
                values={{
                  governance_pct: localBP.governance_pct,
                  risk_contingency_pct: localBP.risk_contingency_pct,
                  reuse_factor: localBP.reuse_factor,
                  governance_profile_mix: localBP.governance_profile_mix || [],
                  governance_cost_manual: localBP.governance_cost_manual ?? null,
                  governance_mode: localBP.governance_mode || 'percentage',
                  governance_fte_periods: localBP.governance_fte_periods || [],
                  governance_apply_reuse: localBP.governance_apply_reuse || false,
                }}
                practices={practices}
                totalTeamFte={(localBP.team_composition || []).reduce((sum, m) => sum + (parseFloat(m.fte) || 0), 0)}
                teamCost={cleanTeamCost || 0}
                durationMonths={localBP.duration_months}
                daysPerFte={localBP.days_per_fte || DAYS_PER_FTE}
                onChange={handleParametersChange}
              />

              {/* Breakdown Costi */}
              <CostBreakdown
                costs={calcResult || {}}
                towBreakdown={towBreakdown}
                lutechProfileBreakdown={lutechProfileBreakdown}
                teamMixRate={teamMixRate}
                showTowDetail={Object.keys(towBreakdown).length > 0}
                durationMonths={localBP.duration_months}
                startYear={localBP.start_year}
                startMonth={localBP.start_month}
              />
            </div>
          )}

          {/* ═══ TAB 3: ANALISI ═══ */}
          {activeTab === 'analisi' && (
            <div className="space-y-6">
              {/* Analisi TOW e Proposte di Ottimizzazione */}
              <TowAnalysis
                tows={localBP.tows || []}
                towBreakdown={towBreakdown}
                teamComposition={localBP.team_composition || []}
                profileMappings={localBP.profile_mappings || {}}
                practices={practices}
                costs={calcResult || {}}
                baseAmount={effectiveBaseAmount}
                discount={discount}
                daysPerFte={localBP.days_per_fte || DAYS_PER_FTE}
                defaultDailyRate={localBP.default_daily_rate || DEFAULT_DAILY_RATE}
                durationMonths={localBP.duration_months || 36}
                onApplyOptimization={handleApplyOptimization}
              />

              {/* Conto Economico di Commessa */}
              <ProfitAndLoss
                baseAmount={effectiveBaseAmount}
                discount={discount}
                isRti={isRti}
                quotaLutech={quotaLutech}
                fullBaseAmount={lotData.base_amount || 0}
                costs={calcResult || {}}
                cleanTeamCost={cleanTeamCost}
                targetMargin={targetMargin}
                riskContingency={localBP.risk_contingency_pct || 3}
              />

              {/* Margine */}
              <MarginSimulator
                baseAmount={effectiveBaseAmount}
                totalCost={calcResult?.total || 0}
                isRti={isRti}
                quotaLutech={quotaLutech}
                discount={discount}
                onDiscountChange={setDiscount}
                targetMargin={targetMargin}
                onTargetMarginChange={setTargetMargin}
                riskContingency={localBP.risk_contingency_pct || 3}
              />

              {/* Scenari */}
              <ScenarioCards
                scenarios={scenarios}
                selectedScenario={selectedScenario}
                onSelectScenario={handleSelectScenario}
                targetMargin={targetMargin}
              />
            </div>
          )}

          {/* ═══ TAB 4: OFFERTA ═══ */}
          {activeTab === 'offerta' && (
            <div className="space-y-6">
              <OfferSchemeTable
                offerData={offerScheme.data}
                totalOffer={offerScheme.total}
              />

              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800">
                <strong>Nota:</strong> I prezzi unitari sono calcolati ripartendo l'importo totale dell'offerta (Revenue)
                in proporzione al costo pieno di ogni TOW (Team + Governance + Risk + Subappalto).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
