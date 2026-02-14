import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  Percent,
  Target,
  ArrowRight,
  Calculator,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';

/**
 * MarginSimulator - Simulatore interattivo sconto ↔ margine
 * Calcola margine in tempo reale al variare dello sconto
 */
export default function MarginSimulator({
  baseAmount = 0,
  totalCost = 0,
  isRti = false,
  quotaLutech = 1.0,
  discount = 0,
  onDiscountChange,
  targetMargin = 15,
  onTargetMarginChange,
  riskContingency = 0,
  disabled = false
}) {
  const { t } = useTranslation();
  const [localDiscount, setLocalDiscount] = useState(discount);

  useEffect(() => {
    setLocalDiscount(discount);
  }, [discount]);

  // Calcoli margine
  const calculations = useMemo(() => {
    if (!baseAmount || !totalCost) {
      return {
        revenue: 0,
        margin: 0,
        marginPct: 0,
        suggestedDiscount: 0,
        breakEvenDiscount: 0
      };
    }

    // Revenue dopo sconto (e quota RTI)
    const revenue = baseAmount * (1 - localDiscount / 100) * (isRti ? quotaLutech : 1);

    // Margine
    const margin = revenue - totalCost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    // Sconto per raggiungere margine target (include risk contingency)
    // margin_target_effective = target + risk_contingency
    // margin_target = (rev - cost) / rev
    // => rev = cost / (1 - margin_target)
    // => base * (1-d) * q = cost / (1 - target)
    // => (1-d) = cost / (base * q * (1 - target))
    // => d = 1 - cost / (base * q * (1 - target))
    const targetFraction = (targetMargin + riskContingency) / 100;
    const q = isRti ? quotaLutech : 1;
    const denominator = baseAmount * q * (1 - targetFraction);
    const suggestedDiscount = denominator > 0
      ? Math.max(0, Math.min(100, (1 - totalCost / denominator) * 100))
      : 0;

    // Break-even: margine = 0 => revenue = cost
    // => base * (1-d) * q = cost
    // => d = 1 - cost / (base * q)
    const breakEvenDenom = baseAmount * q;
    const breakEvenDiscount = breakEvenDenom > 0
      ? Math.max(0, Math.min(100, (1 - totalCost / breakEvenDenom) * 100))
      : 0;

    return {
      revenue: Math.round(revenue),
      margin: Math.round(margin),
      marginPct: marginPct.toFixed(2),
      suggestedDiscount: suggestedDiscount.toFixed(2),
      breakEvenDiscount: breakEvenDiscount.toFixed(2)
    };
  }, [baseAmount, totalCost, localDiscount, isRti, quotaLutech, targetMargin, riskContingency]);

  const handleDiscountChange = (value) => {
    const num = parseFloat(value) || 0;
    setLocalDiscount(num);
    onDiscountChange?.(num);
  };

  const applyTargetDiscount = () => {
    const suggested = parseFloat(calculations.suggestedDiscount);
    setLocalDiscount(suggested);
    onDiscountChange?.(suggested);
  };

  // Stato margine (colori): verde se >= target, giallo altrimenti
  const getMarginStatus = () => {
    const pct = parseFloat(calculations.marginPct);
    const effectiveTarget = targetMargin + riskContingency;

    if (pct >= effectiveTarget) {
      return { color: 'green', icon: CheckCircle2 };
    } else {
      return { color: 'amber', icon: AlertTriangle };
    }
  };

  const marginStatus = getMarginStatus();

  const colorClasses = {
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    green: 'text-green-700 bg-green-50 border-green-200'
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
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">
              {t('business_plan.margin')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('business_plan.margin_desc')}
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Slider Sconto */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <Percent className="w-4 h-4 text-slate-400" />
              Sconto Offerto
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={localDiscount}
                onChange={(e) => handleDiscountChange(e.target.value)}
                disabled={disabled}
                min="0"
                max="100"
                step="0.5"
                className="w-20 px-2 py-1 text-right font-semibold border border-slate-200 rounded-lg
                           focus:border-blue-500 focus:outline-none
                           disabled:bg-slate-50 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-slate-500">%</span>
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="50"
            step="0.5"
            value={localDiscount}
            onChange={(e) => handleDiscountChange(e.target.value)}
            disabled={disabled}
            className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer
                       accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          />

          <div className="flex justify-between text-xs text-slate-400">
            <span>0%</span>
            <span className="text-amber-500 font-medium">
              Break-even: {calculations.breakEvenDiscount}%
            </span>
            <span>50%</span>
          </div>
        </div>

        {/* Cards Grid: Margine, Target, Info RTI */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card Margine Corrente */}
          <div className={`p-4 rounded-xl border-2 ${
            marginStatus.color === 'green'
              ? 'border-green-500 bg-green-50'
              : 'border-amber-500 bg-amber-50'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <marginStatus.icon className={`w-5 h-5 ${
                marginStatus.color === 'green' ? 'text-green-600' : 'text-amber-600'
              }`} />
              <span className="text-sm font-semibold text-slate-700">Margine Corrente</span>
            </div>
            <div className={`text-3xl font-bold mb-3 ${
              marginStatus.color === 'green' ? 'text-green-700' : 'text-amber-700'
            }`}>
              {calculations.marginPct}%
            </div>
            <div className="space-y-1.5 pt-2 border-t border-current/20">
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Revenue</span>
                <span className="font-semibold">{formatCurrency(calculations.revenue)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Costo</span>
                <span className="font-semibold">{formatCurrency(totalCost)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="opacity-70">Margine €</span>
                <span className="font-semibold">{formatCurrency(calculations.margin)}</span>
              </div>
            </div>
          </div>

          {/* Card Margine Target */}
          <div className="p-4 rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-semibold text-slate-700">Margine Target</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="number"
                value={targetMargin}
                onChange={(e) => onTargetMarginChange?.(parseFloat(e.target.value) || 0)}
                disabled={disabled}
                min="0"
                max="50"
                step="1"
                className="w-16 px-2 py-1 text-center text-xl font-bold
                           border border-blue-200 rounded-lg bg-white
                           focus:border-blue-500 focus:outline-none"
              />
              <span className="text-xl font-bold text-blue-700">%</span>
            </div>
            <div className="mb-2 p-2 bg-blue-100/50 rounded text-xs text-blue-700">
              + Risk: <strong>{riskContingency}%</strong> = <strong>{(targetMargin + riskContingency).toFixed(1)}%</strong>
            </div>
            <div className="pt-2 border-t border-blue-200">
              <div className="text-xs text-slate-600 mb-1">Sconto suggerito</div>
              <div className="flex items-center justify-between">
                <div className="text-xl font-bold text-blue-700">
                  {calculations.suggestedDiscount}%
                </div>
                <button
                  onClick={applyTargetDiscount}
                  disabled={disabled}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium
                             hover:bg-blue-700 transition-colors flex items-center gap-1
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Applica
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          {/* Card Info RTI o Placeholder */}
          {isRti ? (
            <div className="p-4 rounded-xl border-2 border-indigo-300 bg-indigo-50">
              <div className="flex items-center gap-2 mb-2">
                <Calculator className="w-5 h-5 text-indigo-600" />
                <span className="text-sm font-semibold text-slate-700">Configurazione RTI</span>
              </div>
              <div className="text-3xl font-bold text-indigo-700 mb-2">
                {(quotaLutech * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-indigo-600">
                Quota Lutech sul totale gara
              </div>
              <div className="mt-3 pt-3 border-t border-indigo-200 text-xs text-indigo-700">
                I calcoli sono applicati sulla quota Lutech
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border-2 border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-semibold text-slate-500">Gara Singola</span>
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Calcolo su 100% importo base
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
