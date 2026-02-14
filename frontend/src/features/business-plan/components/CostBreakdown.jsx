import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Users,
  Shield,
  AlertTriangle,
  Building,
  TrendingDown
} from 'lucide-react';

/**
 * CostBreakdown - Breakdown visivo dei costi
 * Mostra: team, governance, risk, subappalto con percentuali e barre
 */
export default function CostBreakdown({
  costs = {},
  towBreakdown = {},
  showTowDetail = true
}) {
  const { t } = useTranslation();

  const {
    team = 0,
    governance = 0,
    risk = 0,
    subcontract = 0,
    total = 0
  } = costs;

  // Calcola percentuali
  const breakdown = useMemo(() => {
    if (total === 0) return [];

    const items = [
      { key: 'team', label: 'Costo Team', value: team, icon: Users, color: 'blue' },
      { key: 'governance', label: 'Governance', value: governance, icon: Shield, color: 'indigo' },
      { key: 'risk', label: 'Risk Contingency', value: risk, icon: AlertTriangle, color: 'amber' },
    ];

    if (subcontract > 0) {
      items.push({ key: 'subcontract', label: 'Subappalto', value: subcontract, icon: Building, color: 'purple' });
    }

    return items.map(item => ({
      ...item,
      pct: (item.value / total) * 100
    }));
  }, [team, governance, risk, subcontract, total]);

  // Ordina TOW per costo
  const towItems = useMemo(() => {
    return Object.entries(towBreakdown)
      .map(([towId, cost]) => ({ towId, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [towBreakdown]);

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const colorMap = {
    blue: { bar: 'bg-blue-500', bg: 'bg-blue-100', text: 'text-blue-700' },
    indigo: { bar: 'bg-indigo-500', bg: 'bg-indigo-100', text: 'text-indigo-700' },
    amber: { bar: 'bg-amber-500', bg: 'bg-amber-100', text: 'text-amber-700' },
    purple: { bar: 'bg-purple-500', bg: 'bg-purple-100', text: 'text-purple-700' },
    emerald: { bar: 'bg-emerald-500', bg: 'bg-emerald-100', text: 'text-emerald-700' }
  };

  // Colori per TOW (ciclici)
  const towColors = ['blue', 'indigo', 'purple', 'emerald', 'amber'];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">
                {t('business_plan.cost_breakdown')}
              </h3>
              <p className="text-xs text-slate-500">
                {t('business_plan.cost_breakdown_desc')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Totale</div>
            <div className="text-xl font-bold text-slate-800">{formatCurrency(total)}</div>
          </div>
        </div>
      </div>

      <div className="p-5">
        {total === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <BarChart3 className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p>Nessun dato di costo disponibile</p>
            <p className="text-xs mt-1">Configura team e parametri per vedere il breakdown</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Barra totale */}
            <div className="h-8 rounded-lg overflow-hidden flex">
              {breakdown.map((item, idx) => (
                <div
                  key={item.key}
                  className={`${colorMap[item.color].bar} transition-all`}
                  style={{ width: `${item.pct}%` }}
                  title={`${item.label}: ${item.pct.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Dettaglio voci */}
            <div className="space-y-3">
              {breakdown.map(item => (
                <div key={item.key} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${colorMap[item.color].bg} flex items-center justify-center`}>
                    <item.icon className={`w-5 h-5 ${colorMap[item.color].text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      <span className="text-sm font-semibold text-slate-800">{formatCurrency(item.value)}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colorMap[item.color].bar} transition-all`}
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${colorMap[item.color].text} w-14 text-right`}>
                    {item.pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>

            {/* Breakdown per TOW */}
            {showTowDetail && towItems.length > 0 && (
              <>
                <div className="h-px bg-slate-100 my-4" />

                <div>
                  <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4" />
                    Costi per Type of Work
                  </h4>
                  <div className="space-y-2">
                    {towItems.map((item, idx) => {
                      const color = towColors[idx % towColors.length];
                      const pct = total > 0 ? (item.cost / total) * 100 : 0;
                      return (
                        <div key={item.towId} className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded ${colorMap[color].bar}`} />
                          <span className="text-sm text-slate-600 w-20 font-mono">{item.towId}</span>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${colorMap[color].bar}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-slate-700 w-24 text-right">
                            {formatCurrency(item.cost)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
