import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Target,
  Users,
  PieChart,
  BarChart3,
  Lightbulb,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Shuffle,
  Zap,
} from 'lucide-react';

/**
 * TowAnalysis - Analisi Business per TOW
 *
 * Mostra:
 * 1. Margine per TOW (profittevoli vs in perdita)
 * 2. Concentrazione Senior vs Junior per TOW
 * 3. Rischi di concentrazione costi
 * 4. Proposte di ottimizzazione (juniorization)
 */
export default function TowAnalysis({
  tows = [],
  towBreakdown = {},
  teamComposition = [],
  profileMappings = {},
  practices = [],
  costs = {},
  baseAmount = 0,
  discount = 0,
  daysPerFte = 220,
  defaultDailyRate = 350,
  durationMonths = 36,
  onApplyOptimization,
}) {
  const durationYears = durationMonths / 12;
  // Calculate revenue per TOW based on weight
  const totalWeight = useMemo(() => {
    return tows.reduce((sum, t) => sum + (parseFloat(t.weight_pct) || 0), 0) || 100;
  }, [tows]);

  const revenue = baseAmount * (1 - discount / 100);

  // Build Lutech rates lookup
  const lutechRates = useMemo(() => {
    const rates = {};
    for (const practice of practices) {
      for (const profile of (practice.profiles || [])) {
        rates[`${practice.id}:${profile.id}`] = profile.daily_rate || defaultDailyRate;
      }
    }
    return rates;
  }, [practices, defaultDailyRate]);

  // Classify seniority levels
  const getSeniorityLevel = (seniority) => {
    const s = (seniority || '').toLowerCase();
    if (s.includes('senior') || s.includes('manager') || s.includes('lead') || s.includes('principal')) {
      return 'senior';
    }
    if (s.includes('junior') || s.includes('entry') || s.includes('graduate')) {
      return 'junior';
    }
    return 'mid';
  };

  // Analyze each TOW
  const towAnalysis = useMemo(() => {
    return tows.map(tow => {
      const towId = tow.tow_id;
      const weight = (parseFloat(tow.weight_pct) || 0) / totalWeight;
      const towRevenue = revenue * weight;
      const towCostData = towBreakdown[towId] || { cost: 0, days: 0 };
      const towCost = typeof towCostData === 'object' ? towCostData.cost : towCostData;

      const margin = towRevenue - towCost;
      const marginPct = towRevenue > 0 ? (margin / towRevenue) * 100 : 0;

      // Calculate FTE allocation per seniority for this TOW
      let fteSenior = 0;
      let fteMid = 0;
      let fteJunior = 0;
      let totalFte = 0;

      // Contributions to this TOW
      const contributions = [];

      for (const member of teamComposition) {
        const profileId = member.profile_id || member.label;
        const memberFte = parseFloat(member.fte) || 0;
        const towAllocation = member.tow_allocation || {};
        const allocPct = (parseFloat(towAllocation[towId]) || 0) / 100;

        if (allocPct > 0) {
          const allocatedFte = memberFte * allocPct;
          totalFte += allocatedFte;

          const level = getSeniorityLevel(member.seniority);
          if (level === 'senior') fteSenior += allocatedFte;
          else if (level === 'junior') fteJunior += allocatedFte;
          else fteMid += allocatedFte;

          // Get Lutech rate for this profile
          const mapping = profileMappings[profileId] || [];
          let avgRate = defaultDailyRate;
          if (mapping.length > 0 && mapping[0].mix) {
            const mix = mapping[0].mix;
            let totalPct = 0;
            let weightedRate = 0;
            for (const m of mix) {
              const rate = lutechRates[m.lutech_profile] || defaultDailyRate;
              const pct = (m.pct || 0) / 100;
              weightedRate += rate * pct;
              totalPct += pct;
            }
            avgRate = totalPct > 0 ? weightedRate / totalPct : defaultDailyRate;
          }

          contributions.push({
            profileId,
            label: member.label || profileId,
            seniority: member.seniority || 'mid',
            level,
            fte: allocatedFte,
            rate: avgRate,
            cost: allocatedFte * avgRate * daysPerFte * durationYears,
          });
        }
      }

      const seniorPct = totalFte > 0 ? (fteSenior / totalFte) * 100 : 0;
      const juniorPct = totalFte > 0 ? (fteJunior / totalFte) * 100 : 0;
      const midPct = totalFte > 0 ? (fteMid / totalFte) * 100 : 0;

      // Mix balance index: 0 = all junior, 100 = all senior
      const mixIndex = seniorPct;

      // Status
      let status = 'ok';
      let statusLabel = 'OK';
      let statusColor = 'green';
      if (marginPct < 0) {
        status = 'loss';
        statusLabel = 'PERDITA';
        statusColor = 'red';
      } else if (marginPct < 10) {
        status = 'warning';
        statusLabel = 'BASSO';
        statusColor = 'yellow';
      } else if (marginPct >= 20) {
        status = 'excellent';
        statusLabel = 'ALTO';
        statusColor = 'green';
      }

      return {
        towId,
        label: tow.label || towId,
        type: tow.type,
        weight: weight * 100,
        revenue: towRevenue,
        cost: towCost,
        margin,
        marginPct,
        status,
        statusLabel,
        statusColor,
        fteSenior,
        fteMid,
        fteJunior,
        totalFte,
        seniorPct,
        midPct,
        juniorPct,
        mixIndex,
        contributions,
      };
    });
  }, [tows, towBreakdown, teamComposition, profileMappings, totalWeight, revenue, lutechRates]);

  // Identify risks
  const risks = useMemo(() => {
    const identified = [];

    // 1. TOW in perdita
    const lossCount = towAnalysis.filter(t => t.marginPct < 0).length;
    if (lossCount > 0) {
      identified.push({
        type: 'loss',
        severity: 'high',
        title: `${lossCount} TOW in perdita`,
        description: 'Alcuni TOW hanno costi superiori ai ricavi allocati',
        icon: XCircle,
      });
    }

    // 2. Margini bassi
    const lowMarginCount = towAnalysis.filter(t => t.marginPct >= 0 && t.marginPct < 10).length;
    if (lowMarginCount > 0) {
      identified.push({
        type: 'low_margin',
        severity: 'medium',
        title: `${lowMarginCount} TOW con margine < 10%`,
        description: 'Margini bassi che potrebbero diventare critici',
        icon: AlertTriangle,
      });
    }

    // 3. Concentrazione costi
    const totalCost = towAnalysis.reduce((sum, t) => sum + t.cost, 0);
    const maxCost = towAnalysis.length > 0 ? Math.max(...towAnalysis.map(t => t.cost)) : 0;
    const concentration = totalCost > 0 ? (maxCost / totalCost) * 100 : 0;
    if (concentration > 50) {
      const topTow = towAnalysis.find(t => t.cost === maxCost);
      identified.push({
        type: 'concentration',
        severity: 'medium',
        title: `Alta concentrazione costi (${concentration.toFixed(0)}%)`,
        description: `Il TOW "${topTow?.label}" assorbe oltre metà dei costi`,
        icon: PieChart,
      });
    }

    // 4. Troppi senior su TOW a basso margine
    const seniorOnLowMargin = towAnalysis.filter(t => t.marginPct < 15 && t.seniorPct > 60);
    if (seniorOnLowMargin.length > 0) {
      identified.push({
        type: 'senior_allocation',
        severity: 'medium',
        title: 'Senior su TOW a basso margine',
        description: `${seniorOnLowMargin.length} TOW con >60% senior potrebbero beneficiare di juniorization`,
        icon: Users,
      });
    }

    return identified;
  }, [towAnalysis]);

  // Generate optimization proposals (juniorization)
  const optimizationProposals = useMemo(() => {
    const proposals = [];

    for (const tow of towAnalysis) {
      // Only propose juniorization for TOW with low margin and high senior %
      if (tow.marginPct < 15 && tow.seniorPct > 40) {
        // Find senior contributors that could be juniorized
        const seniorContribs = tow.contributions.filter(c => c.level === 'senior');

        for (const contrib of seniorContribs) {
          // Estimate savings: difference between senior rate and junior rate
          const seniorRate = contrib.rate;
          const juniorRate = Math.round(seniorRate * 0.6); // Junior ~ 60% of senior rate
          const savingsPerDay = seniorRate - juniorRate;
          const years = 3;
          const estimatedSavings = contrib.fte * savingsPerDay * daysPerFte * years * 0.3; // 30% conversion

          if (estimatedSavings > 10000) { // Only propose if meaningful savings
            const newMarginPct = tow.revenue > 0
              ? ((tow.margin + estimatedSavings) / tow.revenue) * 100
              : 0;

            proposals.push({
              towId: tow.towId,
              towLabel: tow.label,
              profileId: contrib.profileId,
              profileLabel: contrib.label,
              currentSeniority: contrib.seniority,
              currentFte: contrib.fte,
              currentRate: seniorRate,
              proposedRate: juniorRate,
              estimatedSavings,
              currentMargin: tow.marginPct,
              newMargin: newMarginPct,
              impact: 'medium',
              recommendation: `Considera di sostituire parte del profilo "${contrib.label}" con risorse junior (−40% tariffa)`,
            });
          }
        }
      }

      // Propose rebalancing for TOW with very high margin (could absorb more work)
      if (tow.marginPct > 25 && tow.totalFte < 2) {
        proposals.push({
          towId: tow.towId,
          towLabel: tow.label,
          type: 'capacity',
          currentMargin: tow.marginPct,
          recommendation: `Il TOW "${tow.label}" ha alto margine (${tow.marginPct.toFixed(1)}%) - considera di allocare più risorse qui`,
          impact: 'low',
        });
      }
    }

    // Sort by estimated savings
    proposals.sort((a, b) => (b.estimatedSavings || 0) - (a.estimatedSavings || 0));

    return proposals;
  }, [towAnalysis]);

  // Generate optimal resource mix proposals per TOW
  // Based on: actual effort distribution, TOW profitability, and TOW weight
  const resourceMixProposals = useMemo(() => {
    if (towAnalysis.length === 0) return [];

    // Constants for calculation
    const years = 3;

    // Build profile rate lookup from practices
    const profileRates = {};
    for (const practice of practices) {
      for (const profile of (practice.profiles || [])) {
        profileRates[`${practice.id}:${profile.id}`] = {
          rate: profile.daily_rate || defaultDailyRate,
          label: profile.label || profile.id,
          practice: practice.label || practice.id,
          level: getSeniorityLevel(profile.label || profile.id),
        };
      }
    }

    // For each TOW, analyze effort distribution and propose optimizations
    return towAnalysis.map(tow => {
      const { towId, label, weight, marginPct, totalFte, fteSenior, fteMid, fteJunior, cost, revenue, contributions } = tow;

      // Analyze contributions by cost (rate)
      const sortedContribs = [...contributions].sort((a, b) => b.rate - a.rate);
      const avgRate = totalFte > 0 ? (cost / (totalFte * daysPerFte * years)) : defaultDailyRate;

      // Find expensive profiles (rate > avg + 20%)
      const expensiveProfiles = sortedContribs.filter(c => c.rate > avgRate * 1.2);

      // Calculate concentration metrics
      const totalContribFte = contributions.reduce((sum, c) => sum + c.fte, 0);
      const expensiveFte = expensiveProfiles.reduce((sum, c) => sum + c.fte, 0);
      const expensivePct = totalContribFte > 0 ? (expensiveFte / totalContribFte) * 100 : 0;

      // Current mix percentages
      const currentMix = {
        senior: totalFte > 0 ? fteSenior / totalFte : 0,
        mid: totalFte > 0 ? fteMid / totalFte : 0,
        junior: totalFte > 0 ? fteJunior / totalFte : 0,
      };

      // Determine optimal target based on profitability AND effort distribution
      // Key insight: if expensive profiles are concentrated on low-margin TOW, that's the problem

      let targetMix = { ...currentMix }; // Start with current mix
      let proposalActions = [];
      let costReduction = 0;

      // Strategy based on TOW profitability
      if (marginPct <= 0) {
        // === LOSS-MAKING TOW ===
        // Aggressive action: reduce expensive profiles significantly

        // Propose replacing expensive profiles with cheaper alternatives
        for (const contrib of expensiveProfiles) {
          const juniorRate = contrib.rate * 0.6; // Assume junior is 60% of senior rate
          const potentialSavings = contrib.fte * (contrib.rate - juniorRate) * daysPerFte * years;

          if (potentialSavings > 5000) {
            proposalActions.push({
              type: 'replace',
              profile: contrib.label,
              currentFte: contrib.fte,
              currentRate: contrib.rate,
              proposedRate: juniorRate,
              fteToMove: Math.min(contrib.fte * 0.5, contrib.fte), // Move up to 50%
              savings: potentialSavings * 0.5, // Conservative estimate
              reason: 'TOW in perdita - sostituire con profili junior',
            });
            costReduction += potentialSavings * 0.5;
          }
        }

        // Target mix for loss TOW: minimize senior
        // Calculate actual reduction considering the minimum clamp
        const actualSeniorReduction = currentMix.senior - Math.max(0.10, currentMix.senior - Math.min(currentMix.senior, 0.3));
        targetMix = {
          senior: Math.max(0.10, currentMix.senior - Math.min(currentMix.senior, 0.3)),
          mid: currentMix.mid + (actualSeniorReduction * 0.4),
          junior: currentMix.junior + (actualSeniorReduction * 0.6),
        };

      } else if (marginPct < 15) {
        // === LOW MARGIN TOW ===
        // Moderate action: optimize expensive allocations

        // If high concentration of expensive profiles, suggest partial shift
        if (expensivePct > 50) {
          const excessExpensive = (expensivePct - 30) / 100 * totalFte;

          for (const contrib of expensiveProfiles.slice(0, 2)) {
            const moveableFte = Math.min(contrib.fte * 0.3, excessExpensive);
            if (moveableFte > 0.2) {
              const savingsPerFte = (contrib.rate - avgRate * 0.7) * daysPerFte * years;

              proposalActions.push({
                type: 'reduce',
                profile: contrib.label,
                currentFte: contrib.fte,
                fteToMove: moveableFte,
                savings: moveableFte * savingsPerFte,
                reason: `Ridurre allocazione del ${(moveableFte/contrib.fte*100).toFixed(0)}% su questo TOW`,
              });
              costReduction += moveableFte * savingsPerFte;
            }
          }
        }

        // Target mix: moderate reduction of senior
        // Calculate actual reduction considering the minimum clamp
        const desiredSeniorReduction = Math.min(currentMix.senior * 0.2, 0.15);
        const actualSeniorAfterClamp = Math.max(0.20, currentMix.senior - desiredSeniorReduction);
        const actualSeniorReductionLow = currentMix.senior - actualSeniorAfterClamp;
        targetMix = {
          senior: actualSeniorAfterClamp,
          mid: currentMix.mid + (actualSeniorReductionLow * 0.5),
          junior: currentMix.junior + (actualSeniorReductionLow * 0.5),
        };

      } else if (marginPct >= 15 && marginPct < 25) {
        // === HEALTHY MARGIN TOW ===
        // No major changes, but can suggest minor optimizations

        targetMix = {
          senior: currentMix.senior,
          mid: currentMix.mid,
          junior: currentMix.junior,
        };

      } else {
        // === HIGH MARGIN TOW (>25%) ===
        // Can absorb more expensive profiles from struggling TOWs

        // Check if this TOW has capacity for more senior resources
        if (currentMix.junior > 0.3 && weight > 20) {
          proposalActions.push({
            type: 'absorb',
            reason: `TOW profittevole (${marginPct.toFixed(0)}%) - può assorbire risorse senior da TOW in difficoltà`,
            capacity: totalFte * 0.2, // 20% of FTE can be upgraded
          });
        }

        // Slight increase in senior for quality on important TOWs
        if (weight > 25) {
          const desiredSeniorIncrease = Math.min(0.10, currentMix.junior * 0.3);
          const actualJuniorAfterClamp = Math.max(0.10, currentMix.junior - desiredSeniorIncrease);
          const actualSeniorIncreaseHigh = currentMix.junior - actualJuniorAfterClamp;
          targetMix = {
            senior: currentMix.senior + actualSeniorIncreaseHigh,
            mid: currentMix.mid,
            junior: actualJuniorAfterClamp,
          };
        } else {
          targetMix = currentMix;
        }
      }

      // Normalize targetMix to ensure it sums to 100%
      const mixSum = targetMix.senior + targetMix.mid + targetMix.junior;
      if (mixSum > 0 && Math.abs(mixSum - 1.0) > 0.001) {
        targetMix.senior = targetMix.senior / mixSum;
        targetMix.mid = targetMix.mid / mixSum;
        targetMix.junior = targetMix.junior / mixSum;
      }

      // Calculate proposed FTE from target mix
      const proposedFte = {
        senior: totalFte * targetMix.senior,
        mid: totalFte * targetMix.mid,
        junior: totalFte * targetMix.junior,
      };

      // Calculate new margin after optimization
      const newCost = cost - costReduction;
      const newMargin = revenue - newCost;
      const newMarginPct = revenue > 0 ? (newMargin / revenue) * 100 : 0;

      // FTE changes
      const fteDelta = {
        senior: proposedFte.senior - fteSenior,
        mid: proposedFte.mid - fteMid,
        junior: proposedFte.junior - fteJunior,
      };

      // Determine if proposal is meaningful
      const hasSignificantChange =
        proposalActions.length > 0 ||
        Math.abs(fteDelta.senior) > 0.3 ||
        costReduction > 10000;

      // Determine proposal type and label
      let proposalType = 'maintain';
      let proposalLabel = 'Mantenere';
      let proposalColor = 'slate';

      if (marginPct <= 0) {
        proposalType = 'critical';
        proposalLabel = 'Critico';
        proposalColor = 'red';
      } else if (costReduction > 20000) {
        proposalType = 'juniorize';
        proposalLabel = 'Juniorizzare';
        proposalColor = 'green';
      } else if (proposalActions.some(a => a.type === 'absorb')) {
        proposalType = 'absorb';
        proposalLabel = 'Può assorbire';
        proposalColor = 'blue';
      } else if (hasSignificantChange) {
        proposalType = 'rebalance';
        proposalLabel = 'Ribilanciare';
        proposalColor = 'purple';
      }

      return {
        towId,
        label,
        weight,
        currentMarginPct: marginPct,
        newMarginPct,
        totalFte,
        avgRate: Math.round(avgRate),
        expensivePct: Math.round(expensivePct),
        currentMix: {
          senior: { fte: fteSenior, pct: currentMix.senior * 100 },
          mid: { fte: fteMid, pct: currentMix.mid * 100 },
          junior: { fte: fteJunior, pct: currentMix.junior * 100 },
        },
        proposedMix: {
          senior: { fte: proposedFte.senior, pct: targetMix.senior * 100 },
          mid: { fte: proposedFte.mid, pct: targetMix.mid * 100 },
          junior: { fte: proposedFte.junior, pct: targetMix.junior * 100 },
        },
        fteDelta,
        costReduction,
        savings: costReduction,
        proposalType,
        proposalLabel,
        proposalColor,
        proposalActions,
        hasSignificantChange,
        // Additional context
        expensiveProfiles: expensiveProfiles.map(p => ({ label: p.label, fte: p.fte, rate: p.rate })),
        contributions: contributions.length,
      };
    })
    .filter(p => p.hasSignificantChange || p.currentMarginPct < 15)
    .sort((a, b) => {
      // Sort by urgency: critical first, then by savings potential
      if (a.proposalType === 'critical' && b.proposalType !== 'critical') return -1;
      if (b.proposalType === 'critical' && a.proposalType !== 'critical') return 1;
      return b.savings - a.savings;
    });
  }, [towAnalysis, practices]);

  // Calculate total potential savings from all proposals
  const totalPotentialSavings = useMemo(() => {
    return resourceMixProposals
      .filter(p => p.savings > 0)
      .reduce((sum, p) => sum + p.savings, 0);
  }, [resourceMixProposals]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const formatPercent = (val) => `${val.toFixed(1)}%`;

  return (
    <div className="space-y-6">
      {/* Section 1: Margin per TOW */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Analisi Margine per TOW</h3>
              <p className="text-xs text-slate-500">Profittabilità di ogni linea di attività</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-600">TOW</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Peso</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Sconto</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Ricavo</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Costo</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Margine</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Margine %</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {towAnalysis.map((tow, idx) => (
                <tr key={tow.towId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{tow.label}</div>
                    <div className="text-xs text-slate-400">{tow.towId}</div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatPercent(tow.weight)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${discount > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                      {formatPercent(discount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(tow.revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(tow.cost)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${tow.margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(tow.margin)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {tow.marginPct >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-red-500" />
                      )}
                      <span className={tow.marginPct >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatPercent(tow.marginPct)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
                        ${tow.statusColor === 'green' ? 'bg-green-100 text-green-700' :
                          tow.statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'}`}>
                        {tow.status === 'excellent' && <CheckCircle2 className="w-3 h-3" />}
                        {tow.status === 'warning' && <AlertTriangle className="w-3 h-3" />}
                        {tow.status === 'loss' && <XCircle className="w-3 h-3" />}
                        {tow.statusLabel}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300 font-semibold">
                <td className="px-4 py-3 text-slate-800">TOTALE</td>
                <td className="px-4 py-3 text-right text-slate-600">100%</td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold ${discount > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                    {formatPercent(discount)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(revenue)}</td>
                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(costs.total || 0)}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatCurrency(revenue - (costs.total || 0))}</td>
                <td className="px-4 py-3 text-right text-green-700">
                  {formatPercent(revenue > 0 ? ((revenue - (costs.total || 0)) / revenue) * 100 : 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Section 2: Concentrazione Senior/Junior */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Concentrazione Senior vs Junior per TOW</h3>
              <p className="text-xs text-slate-500">Mix di seniority allocato su ogni attività</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-3 text-left font-medium text-slate-600">TOW</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">FTE Totali</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Senior</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Mid</th>
                <th className="px-4 py-3 text-right font-medium text-slate-600">Junior</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600">Mix</th>
                <th className="px-4 py-3 text-center font-medium text-slate-600">Valutazione</th>
              </tr>
            </thead>
            <tbody>
              {towAnalysis.map((tow, idx) => (
                <tr key={tow.towId} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="px-4 py-3 font-medium text-slate-800">{tow.label}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{tow.totalFte.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-orange-600 font-medium">{formatPercent(tow.seniorPct)}</span>
                    <span className="text-slate-400 text-xs ml-1">({tow.fteSenior.toFixed(1)})</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-blue-600">{formatPercent(tow.midPct)}</span>
                    <span className="text-slate-400 text-xs ml-1">({tow.fteMid.toFixed(1)})</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600">{formatPercent(tow.juniorPct)}</span>
                    <span className="text-slate-400 text-xs ml-1">({tow.fteJunior.toFixed(1)})</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-orange-400"
                          style={{ width: `${tow.seniorPct}%` }}
                          title={`Senior: ${tow.seniorPct.toFixed(0)}%`}
                        />
                        <div
                          className="h-full bg-blue-400"
                          style={{ width: `${tow.midPct}%` }}
                          title={`Mid: ${tow.midPct.toFixed(0)}%`}
                        />
                        <div
                          className="h-full bg-green-400"
                          style={{ width: `${tow.juniorPct}%` }}
                          title={`Junior: ${tow.juniorPct.toFixed(0)}%`}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      {tow.seniorPct > 70 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs">
                          <AlertTriangle className="w-3 h-3" />
                          Troppi Senior
                        </span>
                      ) : tow.juniorPct > 70 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                          <AlertCircle className="w-3 h-3" />
                          Troppi Junior
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                          <CheckCircle2 className="w-3 h-3" />
                          Bilanciato
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Risks */}
      {risks.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-red-50 to-orange-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Rischi Identificati</h3>
                <p className="text-xs text-slate-500">{risks.length} potenziali criticità rilevate</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            {risks.map((risk, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-xl border ${
                  risk.severity === 'high'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-yellow-50 border-yellow-200'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  risk.severity === 'high' ? 'bg-red-100' : 'bg-yellow-100'
                }`}>
                  <risk.icon className={`w-4 h-4 ${
                    risk.severity === 'high' ? 'text-red-600' : 'text-yellow-600'
                  }`} />
                </div>
                <div>
                  <div className={`font-medium ${
                    risk.severity === 'high' ? 'text-red-800' : 'text-yellow-800'
                  }`}>{risk.title}</div>
                  <div className={`text-sm ${
                    risk.severity === 'high' ? 'text-red-600' : 'text-yellow-600'
                  }`}>{risk.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 4: Resource Mix Proposals per TOW */}
      {resourceMixProposals.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Shuffle className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Proposta Mix Risorse per TOW</h3>
                  <p className="text-xs text-slate-500">
                    Ottimizzazione basata su effort, profittabilità e peso TOW
                  </p>
                </div>
              </div>
              {totalPotentialSavings > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-lg border border-green-200">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-700">
                    Risparmio potenziale: {formatCurrency(totalPotentialSavings)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 space-y-4">
            {/* Legend */}
            <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-orange-400 rounded-full"></span> Senior
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-blue-400 rounded-full"></span> Mid
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-400 rounded-full"></span> Junior
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Critico</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-[10px] font-medium">Juniorizzare</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-medium">Può assorbire</span>
              </div>
            </div>

            {resourceMixProposals.map((proposal) => (
              <div
                key={proposal.towId}
                className={`p-4 rounded-xl border ${
                  proposal.proposalColor === 'red' ? 'bg-red-50 border-red-200' :
                  proposal.proposalColor === 'green' ? 'bg-green-50 border-green-200' :
                  proposal.proposalColor === 'blue' ? 'bg-blue-50 border-blue-200' :
                  proposal.proposalColor === 'purple' ? 'bg-purple-50 border-purple-200' :
                  'bg-slate-50 border-slate-200'
                }`}
              >
                {/* TOW Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-slate-800">{proposal.label}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      proposal.proposalColor === 'red' ? 'bg-red-100 text-red-700' :
                      proposal.proposalColor === 'green' ? 'bg-green-100 text-green-700' :
                      proposal.proposalColor === 'blue' ? 'bg-blue-100 text-blue-700' :
                      proposal.proposalColor === 'purple' ? 'bg-purple-100 text-purple-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {proposal.proposalLabel}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-500">Peso: <span className="font-medium">{formatPercent(proposal.weight)}</span></span>
                    <span className="text-slate-500">FTE: <span className="font-medium">{proposal.totalFte.toFixed(1)}</span></span>
                    <span className="text-slate-500">Rate medio: <span className="font-medium">{proposal.avgRate}€/gg</span></span>
                    {proposal.expensivePct > 30 && (
                      <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded text-[10px] font-medium">
                        {proposal.expensivePct}% costosi
                      </span>
                    )}
                  </div>
                </div>

                {/* Mix Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Current Mix */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-500 uppercase">Mix Attuale</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-slate-200 rounded-lg overflow-hidden flex">
                        <div
                          className="h-full bg-orange-400 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.currentMix.senior.pct}%` }}
                        >
                          {proposal.currentMix.senior.pct > 15 ? `${proposal.currentMix.senior.pct.toFixed(0)}%` : ''}
                        </div>
                        <div
                          className="h-full bg-blue-400 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.currentMix.mid.pct}%` }}
                        >
                          {proposal.currentMix.mid.pct > 15 ? `${proposal.currentMix.mid.pct.toFixed(0)}%` : ''}
                        </div>
                        <div
                          className="h-full bg-green-400 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.currentMix.junior.pct}%` }}
                        >
                          {proposal.currentMix.junior.pct > 15 ? `${proposal.currentMix.junior.pct.toFixed(0)}%` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>S: {proposal.currentMix.senior.fte.toFixed(1)}</span>
                      <span>M: {proposal.currentMix.mid.fte.toFixed(1)}</span>
                      <span>J: {proposal.currentMix.junior.fte.toFixed(1)}</span>
                    </div>
                    <div className={`text-sm font-medium ${proposal.currentMarginPct <= 0 ? 'text-red-600' : proposal.currentMarginPct < 15 ? 'text-orange-600' : 'text-slate-600'}`}>
                      Margine: {formatPercent(proposal.currentMarginPct)}
                      {proposal.currentMarginPct <= 0 && <span className="ml-1 text-xs">(PERDITA)</span>}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden md:flex items-center justify-center absolute left-1/2 transform -translate-x-1/2">
                    <ArrowRight className="w-5 h-5 text-slate-400" />
                  </div>

                  {/* Proposed Mix */}
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-500 uppercase">Mix Proposto</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-6 bg-slate-200 rounded-lg overflow-hidden flex">
                        <div
                          className="h-full bg-orange-500 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.proposedMix.senior.pct}%` }}
                        >
                          {proposal.proposedMix.senior.pct > 15 ? `${proposal.proposedMix.senior.pct.toFixed(0)}%` : ''}
                        </div>
                        <div
                          className="h-full bg-blue-500 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.proposedMix.mid.pct}%` }}
                        >
                          {proposal.proposedMix.mid.pct > 15 ? `${proposal.proposedMix.mid.pct.toFixed(0)}%` : ''}
                        </div>
                        <div
                          className="h-full bg-green-500 flex items-center justify-center text-[10px] text-white font-medium"
                          style={{ width: `${proposal.proposedMix.junior.pct}%` }}
                        >
                          {proposal.proposedMix.junior.pct > 15 ? `${proposal.proposedMix.junior.pct.toFixed(0)}%` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span className={proposal.fteDelta.senior < -0.1 ? 'text-red-500' : proposal.fteDelta.senior > 0.1 ? 'text-green-500' : ''}>
                        S: {proposal.proposedMix.senior.fte.toFixed(1)}
                        {Math.abs(proposal.fteDelta.senior) > 0.05 && (
                          <span className="ml-1">({proposal.fteDelta.senior > 0 ? '+' : ''}{proposal.fteDelta.senior.toFixed(1)})</span>
                        )}
                      </span>
                      <span className={proposal.fteDelta.mid < -0.1 ? 'text-red-500' : proposal.fteDelta.mid > 0.1 ? 'text-green-500' : ''}>
                        M: {proposal.proposedMix.mid.fte.toFixed(1)}
                        {Math.abs(proposal.fteDelta.mid) > 0.1 && (
                          <span className="ml-1">({proposal.fteDelta.mid > 0 ? '+' : ''}{proposal.fteDelta.mid.toFixed(1)})</span>
                        )}
                      </span>
                      <span className={proposal.fteDelta.junior < -0.1 ? 'text-red-500' : proposal.fteDelta.junior > 0.1 ? 'text-green-500' : ''}>
                        J: {proposal.proposedMix.junior.fte.toFixed(1)}
                        {Math.abs(proposal.fteDelta.junior) > 0.1 && (
                          <span className="ml-1">({proposal.fteDelta.junior > 0 ? '+' : ''}{proposal.fteDelta.junior.toFixed(1)})</span>
                        )}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-green-600">
                      Margine: {formatPercent(proposal.newMarginPct)}
                      {proposal.savings > 1000 && (
                        <span className="ml-2 text-green-500">
                          (risparmio {formatCurrency(proposal.savings)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expensive Profiles Detail */}
                {proposal.expensiveProfiles && proposal.expensiveProfiles.length > 0 && proposal.currentMarginPct < 15 && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="text-xs font-medium text-slate-500 mb-2">Profili costosi su questo TOW:</div>
                    <div className="flex flex-wrap gap-2">
                      {proposal.expensiveProfiles.slice(0, 4).map((p, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                          {p.label} <span className="text-orange-500">({p.fte.toFixed(1)} FTE @ {p.rate}€/gg)</span>
                        </span>
                      ))}
                      {proposal.expensiveProfiles.length > 4 && (
                        <span className="text-xs text-slate-400">+{proposal.expensiveProfiles.length - 4} altri</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Proposal Actions */}
                {proposal.proposalActions && proposal.proposalActions.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                    <div className="text-xs font-medium text-slate-500">Azioni suggerite:</div>
                    {proposal.proposalActions.map((action, i) => (
                      <div key={i} className={`flex items-start gap-2 text-sm p-2 rounded-lg ${
                        action.type === 'replace' ? 'bg-green-50' :
                        action.type === 'reduce' ? 'bg-yellow-50' :
                        action.type === 'absorb' ? 'bg-blue-50' : 'bg-slate-50'
                      }`}>
                        <Target className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          action.type === 'replace' ? 'text-green-600' :
                          action.type === 'reduce' ? 'text-yellow-600' :
                          action.type === 'absorb' ? 'text-blue-600' : 'text-slate-500'
                        }`} />
                        <div>
                          <span className="text-slate-700">{action.reason}</span>
                          {action.profile && (
                            <span className="ml-1 text-slate-500">
                              (<strong>{action.profile}</strong>: {action.fteToMove?.toFixed(1) || action.currentFte?.toFixed(1)} FTE)
                            </span>
                          )}
                          {action.savings > 0 && (
                            <span className="ml-2 text-green-600 font-medium">
                              → Risparmio: {formatCurrency(action.savings)}
                            </span>
                          )}
                          {action.capacity > 0 && (
                            <span className="ml-2 text-blue-600 font-medium">
                              → Capacità: +{action.capacity.toFixed(1)} FTE
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendation (fallback if no specific actions) */}
                {proposal.hasSignificantChange && (!proposal.proposalActions || proposal.proposalActions.length === 0) && (
                  <div className="mt-3 pt-3 border-t border-slate-200">
                    <div className="flex items-start gap-2 text-sm">
                      <Lightbulb className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-600">
                        {proposal.proposalType === 'critical' && (
                          <>
                            <strong className="text-red-600">Critico:</strong> TOW in perdita. Ridurre urgentemente i profili senior
                            di {Math.abs(proposal.fteDelta.senior).toFixed(1)} FTE e sostituirli con profili più economici.
                          </>
                        )}
                        {proposal.proposalType === 'juniorize' && (
                          <>
                            <strong>Juniorizzare:</strong> Ridurre i profili senior di {Math.abs(proposal.fteDelta.senior).toFixed(1)} FTE
                            e aumentare i junior di {proposal.fteDelta.junior.toFixed(1)} FTE per ottimizzare i costi.
                          </>
                        )}
                        {proposal.proposalType === 'absorb' && (
                          <>
                            <strong className="text-blue-600">Può assorbire:</strong> Questo TOW ha margine elevato ({formatPercent(proposal.currentMarginPct)})
                            e può ricevere risorse senior spostate da TOW in difficoltà.
                          </>
                        )}
                        {proposal.proposalType === 'rebalance' && (
                          <>
                            <strong>Ribilanciare:</strong> Ottimizza il mix spostando risorse tra i livelli
                            per bilanciare costi e competenze.
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Optimization Proposals */}
      {optimizationProposals.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-gradient-to-r from-green-50 to-emerald-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Proposte di Ottimizzazione</h3>
                <p className="text-xs text-slate-500">Suggerimenti per migliorare i margini (Juniorization)</p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-4">
            {optimizationProposals.slice(0, 5).map((proposal, idx) => (
              <div
                key={idx}
                className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                        {proposal.towLabel}
                      </span>
                      {proposal.estimatedSavings && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                          Risparmio: {formatCurrency(proposal.estimatedSavings)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">{proposal.recommendation}</p>
                    {proposal.currentMargin !== undefined && proposal.newMargin !== undefined && (
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Margine:</span>
                        <span className={proposal.currentMargin < 15 ? 'text-red-600' : 'text-slate-600'}>
                          {formatPercent(proposal.currentMargin)}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="text-green-600 font-medium">
                          {formatPercent(proposal.newMargin)}
                        </span>
                      </div>
                    )}
                  </div>
                  {onApplyOptimization && proposal.profileId && (
                    <button
                      onClick={() => onApplyOptimization(proposal)}
                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg
                                 hover:bg-green-700 transition-colors flex items-center gap-1"
                    >
                      <Target className="w-3 h-3" />
                      Applica
                    </button>
                  )}
                </div>
              </div>
            ))}

            {optimizationProposals.length > 5 && (
              <div className="text-center text-sm text-slate-500">
                +{optimizationProposals.length - 5} altre proposte disponibili
              </div>
            )}
          </div>
        </div>
      )}

      {/* No issues */}
      {risks.length === 0 && optimizationProposals.length === 0 && (
        <div className="bg-green-50 rounded-2xl border border-green-200 p-6 text-center">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="font-semibold text-green-800 mb-1">Configurazione Ottimale</h3>
          <p className="text-sm text-green-600">
            Non sono stati identificati rischi o opportunità di ottimizzazione significative.
          </p>
        </div>
      )}
    </div>
  );
}
