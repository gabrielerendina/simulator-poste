import { useState, useEffect, useMemo, useRef } from 'react';
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
  const [isFlashing, setIsFlashing] = useState(false);
  const discountInputRef = useRef(null);
  const isInitialMount = useRef(true);

  useEffect(() => {
    setLocalDiscount(discount);
  }, [discount]);

  // Effetto flash quando i dati esterni cambiano
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setIsFlashing(true);
    const timer = setTimeout(() => setIsFlashing(false), 1500);
    return () => clearTimeout(timer);
  }, [baseAmount, totalCost]);


  // Calcoli margine
  // baseAmount e gia la base Lutech (se RTI, gia moltiplicata per quota)
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

    // Revenue dopo sconto - baseAmount e gia la quota Lutech
    const revenue = baseAmount * (1 - localDiscount / 100);

    // Margine
    const margin = revenue - totalCost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;

    // Sconto per raggiungere margine target (include risk contingency)
    const targetFraction = (targetMargin + riskContingency) / 100;
    const targetRevenue = targetFraction < 1 ? totalCost / (1 - targetFraction) : 0;

    const suggestedDiscount = baseAmount > 0
      ? Math.max(0, Math.min(100, (1 - targetRevenue / baseAmount) * 100))
      : 100;

    // Break-even: margine = 0 => revenue = cost
    const breakEvenDiscount = baseAmount > 0
      ? Math.max(0, Math.min(100, (1 - totalCost / baseAmount) * 100))
      : 100;

    return {
      revenue: Math.round(revenue),
      margin: Math.round(margin),
      marginPct: marginPct.toFixed(2),
      suggestedDiscount: suggestedDiscount.toFixed(2),
      breakEvenDiscount: breakEvenDiscount.toFixed(2)
    };
  }, [baseAmount, totalCost, localDiscount, targetMargin, riskContingency]);

  const handleDiscountChange = (value) => {
    const num = parseFloat(value) || 0;
    setLocalDiscount(num);
    onDiscountChange?.(num);
  };

  const applyTargetDiscount = () => {
    const suggested = parseFloat(calculations.suggestedDiscount);
    setLocalDiscount(suggested);
    onDiscountChange?.(suggested);
    discountInputRef.current?.focus();
    discountInputRef.current?.select();
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

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(val);
  };

  const sliderMax = Math.max(50, parseFloat(localDiscount) || 0);

  return (
    <div className={`bg-white rounded-2xl border shadow-sm transition-all duration-500 ${
      isFlashing ? 'border-blue-500 shadow-md' : 'border-slate-200'
    }`}>
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

      <div className="p-5">
        {/* Layout a 2 colonne: sinistra sconto, destra cards */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Colonna sinistra: Slider Sconto */}
          <div className="lg:col-span-1 space-y-4">
            <div className="space-y-3">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                <Percent className="w-4 h-4 text-slate-400" />
                Sconto Offerto
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={discountInputRef}
                  type="number"
                  value={localDiscount}
                  onChange={(e) => handleDiscountChange(e.target.value)}
                  disabled={disabled}
                  min="0"
                  max="100"
                  step="0.5"
                  className="w-20 px-2 py-1.5 text-right text-lg font-bold border border-slate-200 rounded-lg
                             focus:border-blue-500 focus:outline-none
                             disabled:bg-slate-50 disabled:cursor-not-allowed"
                />
                <span className="text-lg font-semibold text-slate-500">%</span>
              </div>

              <input
                type="range"
                min="0"
                max={sliderMax}
                step="0.5"
                value={localDiscount}
                onChange={(e) => handleDiscountChange(e.target.value)}
                disabled={disabled}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer
                           accent-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              />

              <div className="flex justify-between text-xs text-slate-400">
                <span>0%</span>
                <span>{sliderMax}%</span>
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-xs text-amber-700 font-medium">Break-even</div>
                <div className="text-sm font-bold text-amber-800">{calculations.breakEvenDiscount}%</div>
              </div>
            </div>
          </div>

          {/* Colonna destra: 3 Cards affiancate */}
          <div className="lg:col-span-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card Margine Corrente */}
              <div className={`p-5 rounded-xl border-2 ${
                marginStatus.color === 'green'
                  ? 'border-green-500 bg-green-50'
                  : 'border-amber-500 bg-amber-50'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <marginStatus.icon className={`w-5 h-5 ${
                    marginStatus.color === 'green' ? 'text-green-600' : 'text-amber-600'
                  }`} />
                  <span className="text-sm font-semibold text-slate-700">Margine Corrente</span>
                </div>
                <div className={`text-4xl font-bold mb-4 ${
                  marginStatus.color === 'green' ? 'text-green-700' : 'text-amber-700'
                }`}>
                  {calculations.marginPct}%
                </div>
                <div className="space-y-2 pt-3 border-t border-current/20">
                  <div className="flex justify-between text-sm">
                    <span className="opacity-70">Revenue</span>
                    <span className="font-semibold">{formatCurrency(calculations.revenue)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-70">Costo</span>
                    <span className="font-semibold">{formatCurrency(totalCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="opacity-70">Margine</span>
                    <span className="font-bold">{formatCurrency(calculations.margin)}</span>
                  </div>
                </div>
              </div>

              {/* Card Margine Target */}
              <div className="p-5 rounded-xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-indigo-50">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-semibold text-slate-700">Margine Target</span>
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    value={targetMargin}
                    onChange={(e) => onTargetMarginChange?.(parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    min="0"
                    max="50"
                    step="1"
                    className="w-16 px-2 py-1 text-center text-2xl font-bold
                               border border-blue-200 rounded-lg bg-white
                               focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-2xl font-bold text-blue-700">%</span>
                </div>
                <div className="mb-3 p-2.5 bg-blue-100/50 rounded-lg text-sm text-blue-700">
                  + Risk: <strong>{riskContingency}%</strong> = Soglia <strong>{(targetMargin + riskContingency).toFixed(1)}%</strong>
                </div>
                <div className="pt-3 border-t border-blue-200">
                  <div className="text-sm text-slate-600 mb-2">Sconto suggerito per target</div>
                  <div className="flex items-center justify-between">
                    <div className="text-2xl font-bold text-blue-700">
                      {calculations.suggestedDiscount}%
                    </div>
                    <button
                      onClick={applyTargetDiscount}
                      disabled={disabled}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                                 hover:bg-blue-700 transition-colors flex items-center gap-1.5
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Applica
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Info RTI o Gara Singola */}
              {isRti ? (
                <div className="p-5 rounded-xl border-2 border-indigo-300 bg-indigo-50">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-5 h-5 text-indigo-600" />
                    <span className="text-sm font-semibold text-slate-700">RTI - Quota Lutech</span>
                  </div>
                  <div className="text-4xl font-bold text-indigo-700 mb-3">
                    {(quotaLutech * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-indigo-600 mb-3">
                    Quota Lutech sul totale gara
                  </div>
                  <div className="pt-3 border-t border-indigo-200 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-600">Base Lutech</span>
                      <span className="font-semibold text-indigo-700">{formatCurrency(baseAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-indigo-600">Costo totale</span>
                      <span className="font-semibold text-indigo-700">{formatCurrency(totalCost)}</span>
                    </div>
                    <div className="text-xs text-indigo-500 pt-1">
                      Tutti i calcoli sono sulla quota Lutech
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 rounded-xl border-2 border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="w-5 h-5 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-500">Gara Singola</span>
                  </div>
                  <div className="text-4xl font-bold text-slate-400 mb-3">100%</div>
                  <div className="text-sm text-slate-500 mb-3">
                    Calcolo su importo pieno
                  </div>
                  <div className="pt-3 border-t border-slate-200 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Base d'asta</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(baseAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Costo totale</span>
                      <span className="font-semibold text-slate-700">{formatCurrency(totalCost)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
