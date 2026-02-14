import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimulation } from '../../simulation/context/SimulationContext';
import { useBusinessPlan } from '../context/BusinessPlanContext';
import { useConfig } from '../../config/context/ConfigContext';
import {
  Briefcase,
  Building2,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
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
} from '../components';

export default function BusinessPlanPage() {
  const { t } = useTranslation();
  const { selectedLot } = useSimulation();
  const { config } = useConfig();
  const {
    businessPlan,
    practices,
    loading,
    error,
    saveBusinessPlan,
    savePractice,
    deletePractice,
  } = useBusinessPlan();

  const lotData = config && selectedLot ? config[selectedLot] : null;

  // Local state for editing
  const [localBP, setLocalBP] = useState(null);
  const [calcResult, setCalcResult] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [targetMargin, setTargetMargin] = useState(15);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  // Initialize local state from fetched BP
  useEffect(() => {
    if (businessPlan) {
      // Convert decimals from API to percentages for UI display
      setLocalBP({
        ...businessPlan,
        governance_pct: (businessPlan.governance_pct || 0.10) * 100,
        risk_contingency_pct: (businessPlan.risk_contingency_pct || 0.05) * 100,
        reuse_factor: (businessPlan.reuse_factor || 0) * 100,
      });
    } else if (selectedLot) {
      // Initialize empty BP (values already in percentage form)
      setLocalBP({
        duration_months: 36,
        governance_pct: 10,
        risk_contingency_pct: 5,
        reuse_factor: 0,
        team_composition: [],
        tows: [],
        volume_adjustments: { periods: [{ month_start: 1, month_end: 36, by_tow: {}, by_profile: {} }] },
        tow_assignments: {},
        profile_mappings: {},
        subcontract_config: {},
        governance_profile_mix: [],
        governance_cost_manual: null,
      });
    }
  }, [businessPlan, selectedLot]);

  // Calculate costs when BP changes
  const runCalculation = useCallback(async () => {
    if (!localBP || !lotData) return;

    try {
      // Simulate calculation locally for now
      const teamCost = calculateTeamCost(localBP);

      // Governance: calcolo basato su FTE Lutech con distribuzione profili
      const governanceCost = calculateGovernanceCost(localBP, teamCost);

      const riskCost = teamCost * (localBP.risk_contingency_pct / 100);
      const subcontractCost = 0; // TODO: calculate from config

      const totalCost = teamCost + governanceCost + riskCost + subcontractCost;

      setCalcResult({
        team: teamCost,
        governance: governanceCost,
        risk: riskCost,
        subcontract: subcontractCost,
        total: totalCost
      });

      // Generate scenarios
      const baseAmount = lotData.base_amount || 0;
      const newScenarios = generateScenarios(localBP, baseAmount, totalCost);
      setScenarios(newScenarios);

    } catch (err) {
      console.error('Calculation error:', err);
    }
  }, [localBP, lotData]);

  useEffect(() => {
    runCalculation();
  }, [runCalculation]);

  // Calculate team cost using profile mappings for real rates (supports time-varying mappings)
  const calculateTeamCost = (bp) => {
    if (!bp.team_composition || bp.team_composition.length === 0) return 0;

    const reuseFactor = 1 - (bp.reuse_factor / 100);
    const DAYS_PER_FTE = 220;
    const DEFAULT_DAILY_RATE = 400; // Fallback se non mappato
    const durationMonths = bp.duration_months || 36;
    const durationYears = durationMonths / 12;

    // Build lookup for Lutech profile rates from practices
    const lutechRates = {};
    for (const practice of practices) {
      for (const profile of (practice.profiles || [])) {
        lutechRates[`${practice.id}:${profile.id}`] = profile.daily_rate || DEFAULT_DAILY_RATE;
      }
    }

    // Volume adjustments - new period-based structure
    const adjustmentPeriods = bp.volume_adjustments?.periods || [{
      month_start: 1,
      month_end: durationMonths,
      by_tow: bp.volume_adjustments?.by_tow || {},
      by_profile: bp.volume_adjustments?.by_profile || {}
    }];

    // Calculate weighted average profile factor across periods
    const getWeightedProfileFactor = (profileId) => {
      let totalMonths = 0;
      let weightedFactor = 0;

      for (const period of adjustmentPeriods) {
        const start = period.month_start || 1;
        const end = period.month_end || durationMonths;
        const months = end - start + 1;
        const factor = period.by_profile?.[profileId] ?? 1.0;
        weightedFactor += factor * months;
        totalMonths += months;
      }

      return totalMonths > 0 ? weightedFactor / totalMonths : 1.0;
    };

    // Calculate TOW adjustment cost reduction
    const getTowCostReduction = () => {
      let totalReduction = 0;
      const tows = bp.tows || [];

      for (const period of adjustmentPeriods) {
        const start = period.month_start || 1;
        const end = period.month_end || durationMonths;
        const periodMonths = end - start + 1;
        const periodFraction = periodMonths / durationMonths;

        for (const tow of tows) {
          const factor = period.by_tow?.[tow.tow_id] ?? 1.0;
          if (factor >= 1.0) continue;

          if (tow.type === 'task') {
            // A Task: reducing tasks → reduces proportional cost
            // Assume each task has equal cost weight based on tow weight
            const numTasks = tow.num_tasks || 0;
            const reducedTasks = numTasks - Math.round(numTasks * factor);
            const towWeight = (tow.weight_pct || 0) / 100;
            // Reduction is proportional to tasks saved × tow weight × period fraction
            if (numTasks > 0) {
              totalReduction += (reducedTasks / numTasks) * towWeight * periodFraction;
            }
          } else if (tow.type === 'corpo') {
            // A Corpo: reducing months → reduces days → reduces FTE equivalent
            const towWeight = (tow.weight_pct || 0) / 100;
            const reduction = (1 - factor);
            totalReduction += reduction * towWeight * periodFraction;
          }
        }
      }

      return totalReduction; // Fraction of total cost to subtract
    };

    let totalCost = 0;

    for (const member of bp.team_composition) {
      const profileId = member.profile_id || member.label;
      const fte = parseFloat(member.fte) || 0;
      const profileFactor = getWeightedProfileFactor(profileId);
      const adjustedFte = fte * profileFactor * reuseFactor;
      const daysPerYear = adjustedFte * DAYS_PER_FTE;

      // Check if this profile has a mapping (new structure with periods)
      const mapping = bp.profile_mappings?.[profileId];

      if (mapping && mapping.length > 0) {
        // New structure: array of period mappings
        // Calculate weighted average rate across all periods
        let totalRate = 0;
        let validPeriods = 0;

        for (const periodMapping of mapping) {
          const mix = periodMapping.mix || [];
          let periodRate = 0;
          let periodPct = 0;

          for (const m of mix) {
            const rate = lutechRates[m.lutech_profile] || DEFAULT_DAILY_RATE;
            const pct = (m.pct || 0) / 100;
            periodRate += rate * pct;
            periodPct += pct;
          }

          // Normalize period rate
          if (periodPct > 0) {
            periodRate = periodRate / periodPct;
            totalRate += periodRate;
            validPeriods++;
          }
        }

        // Average rate across periods
        const avgRate = validPeriods > 0 ? totalRate / validPeriods : DEFAULT_DAILY_RATE;

        // Total cost = days per year × years × rate
        totalCost += daysPerYear * durationYears * avgRate;
      } else {
        // No mapping, use default rate
        totalCost += daysPerYear * durationYears * DEFAULT_DAILY_RATE;
      }
    }

    // Apply TOW-based cost reduction
    const towReduction = getTowCostReduction();
    totalCost = totalCost * (1 - towReduction);

    return Math.round(totalCost);
  };

  // Calculate governance cost based on FTE + Lutech profile mix
  const calculateGovernanceCost = (bp, teamCost) => {
    // Manual override
    if (bp.governance_cost_manual !== null && bp.governance_cost_manual !== undefined) {
      return bp.governance_cost_manual;
    }

    const DAYS_PER_FTE = 220;
    const durationMonths = bp.duration_months || 36;
    const durationYears = durationMonths / 12;
    const totalFte = (bp.team_composition || []).reduce((sum, m) => sum + (parseFloat(m.fte) || 0), 0);
    const governanceFte = totalFte * (bp.governance_pct / 100);

    // Se c'è un mix di profili governance, usa quello per calcolare la tariffa
    const govMix = bp.governance_profile_mix || [];
    if (govMix.length > 0) {
      const lutechRates = {};
      for (const practice of practices) {
        for (const profile of (practice.profiles || [])) {
          lutechRates[`${practice.id}:${profile.id}`] = profile.daily_rate || 400;
        }
      }

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
        return Math.round(governanceFte * DAYS_PER_FTE * durationYears * avgRate);
      }
    }

    // Fallback: usa il vecchio metodo (% su team cost)
    return Math.round(teamCost * (bp.governance_pct / 100));
  };

  // Generate 3 scenarios
  const generateScenarios = (_bp, baseAmount, currentCost) => {
    if (!baseAmount || !currentCost) return [];

    const scenarioParams = [
      { name: 'Conservativo', volAdj: 0.95, reuse: 0.05 },
      { name: 'Bilanciato', volAdj: 0.90, reuse: 0.15 },
      { name: 'Aggressivo', volAdj: 0.85, reuse: 0.30 },
    ];

    return scenarioParams.map(({ name, volAdj, reuse }) => {
      const adjustedCost = currentCost * volAdj * (1 - reuse);
      const revenue = baseAmount; // Full base, no discount for comparison
      const margin = revenue - adjustedCost;
      const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

      return {
        name,
        volume_adjustment: volAdj,
        reuse_factor: reuse,
        total_cost: adjustedCost,
        revenue,
        margin,
        margin_pct: marginPct
      };
    });
  };

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
      };

      await saveBusinessPlan(dataToSave);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
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
      duration_months: params.duration_months,
      governance_pct: params.governance_pct,
      risk_contingency_pct: params.risk_contingency_pct,
      reuse_factor: params.reuse_factor,
      governance_profile_mix: params.governance_profile_mix,
      governance_cost_manual: params.governance_cost_manual,
    }));
  };

  // Apply scenario
  const handleSelectScenario = (scenarioName) => {
    setSelectedScenario(scenarioName);
    const scenario = scenarios.find(s => s.name === scenarioName);
    if (scenario) {
      setLocalBP(prev => ({
        ...prev,
        reuse_factor: scenario.reuse_factor * 100
      }));
    }
  };

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

  const isRti = lotData.rti_enabled;
  const quotaLutech = isRti && lotData.rti_quotas?.Lutech
    ? lotData.rti_quotas.Lutech / 100
    : 1.0;

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
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg
                         font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Salva
            </button>
          </div>
        </div>

        {/* Save status */}
        {saveStatus && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            saveStatus === 'success'
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

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Configuration */}
          <div className="lg:col-span-2 space-y-6">
            {/* STEP 1: TOW Configuration - PRIMA definisci la struttura del lavoro */}
            <TowConfigTable
              tows={localBP.tows || []}
              practices={practices}
              towAssignments={localBP.tow_assignments || {}}
              onChange={handleTowsChange}
              onAssignmentChange={handleTowAssignmentChange}
            />

            {/* STEP 2: Team Composition - POI inserisci il team richiesto da Poste */}
            <TeamCompositionTable
              team={localBP.team_composition || []}
              tows={localBP.tows || []}
              durationMonths={localBP.duration_months || 36}
              onChange={handleTeamChange}
            />

            {/* STEP 3: Profile Mapping - Mappa profili Poste → profili Lutech */}
            <ProfileMappingEditor
              teamComposition={localBP.team_composition || []}
              practices={practices}
              mappings={localBP.profile_mappings || {}}
              durationMonths={localBP.duration_months || 36}
              onChange={handleProfileMappingsChange}
            />

            {/* STEP 4: Volume Adjustments - Applica rettifiche */}
            <VolumeAdjustments
              adjustments={localBP.volume_adjustments || {}}
              team={localBP.team_composition || []}
              tows={localBP.tows || []}
              durationMonths={localBP.duration_months || 36}
              onChange={handleVolumeAdjustmentsChange}
            />
          </div>

          {/* Right Column - Parameters & Results */}
          <div className="space-y-6">
            {/* STEP 0: Catalogo Profili Lutech - Definisci le risorse disponibili */}
            <PracticeCatalogManager
              practices={practices}
              onSavePractice={savePractice}
              onDeletePractice={deletePractice}
            />

            {/* STEP 5: Parameters */}
            <ParametersPanel
              values={{
                duration_months: localBP.duration_months,
                governance_pct: localBP.governance_pct,
                risk_contingency_pct: localBP.risk_contingency_pct,
                reuse_factor: localBP.reuse_factor,
                governance_profile_mix: localBP.governance_profile_mix || [],
                governance_cost_manual: localBP.governance_cost_manual ?? null,
              }}
              practices={practices}
              totalTeamFte={(localBP.team_composition || []).reduce((sum, m) => sum + (parseFloat(m.fte) || 0), 0)}
              onChange={handleParametersChange}
            />

            {/* STEP 6: Cost Breakdown - Visualizza costi calcolati */}
            <CostBreakdown
              costs={calcResult || {}}
              towBreakdown={{}}
              showTowDetail={false}
            />

            {/* STEP 7: Margin Simulator */}
            <MarginSimulator
              baseAmount={lotData.base_amount || 0}
              totalCost={calcResult?.total || 0}
              isRti={isRti}
              quotaLutech={quotaLutech}
              discount={discount}
              onDiscountChange={setDiscount}
              targetMargin={targetMargin}
              onTargetMarginChange={setTargetMargin}
              riskContingency={localBP.risk_contingency_pct || 5}
            />
          </div>
        </div>

        {/* Scenarios - Full Width */}
        <ScenarioCards
          scenarios={scenarios}
          selectedScenario={selectedScenario}
          onSelectScenario={handleSelectScenario}
        />
      </div>
    </div>
  );
}
