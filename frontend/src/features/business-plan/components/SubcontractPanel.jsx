import { Building, Percent, Users, Euro, AlertCircle, CheckCircle } from 'lucide-react';
import { useMemo } from 'react';

/**
 * SubcontractPanel - Configurazione subappalto per TOW
 *
 * Permette di specificare una % di subappalto per ogni TOW (max 20% totale)
 */
export default function SubcontractPanel({
  config = {},
  tows = [],
  teamCost = 0,
  teamMixRate = 0,
  onChange,
  disabled = false
}) {

  const towSplit = useMemo(() => config.tow_split || {}, [config.tow_split]);
  const partner = config.partner || '';
  const avgDailyRate = config.avg_daily_rate ?? teamMixRate;

  // Quota totale = somma degli split per TOW
  const totalQuotaPct = useMemo(
    () => Object.values(towSplit).reduce((sum, val) => sum + (parseFloat(val) || 0), 0),
    [towSplit]
  );

  const handleChange = (field, value) => {
    onChange?.({ ...config, [field]: value });
  };

  const handleSplitChange = (towId, value) => {
    const newSplit = {
      ...towSplit,
      [towId]: parseFloat(value) || 0
    };
    // Rimuovi entry a 0
    if (!newSplit[towId]) {
      delete newSplit[towId];
    }
    handleChange('tow_split', newSplit);
  };

  const subcontractCost = Math.round(teamCost * (totalQuotaPct / 100));
  const isOverLimit = totalQuotaPct > 20;
  const hasSubcontract = totalQuotaPct > 0;

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isOverLimit ? 'bg-red-100' : hasSubcontract ? 'bg-purple-100' : 'bg-slate-100'
            }`}>
              <Building className={`w-5 h-5 ${
                isOverLimit ? 'text-red-600' : hasSubcontract ? 'text-purple-600' : 'text-slate-400'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800">Subappalto</h3>
              <p className="text-xs text-slate-500">
                Configura la quota di lavoro in subappalto (max 20%)
              </p>
            </div>
          </div>

          {/* Badge quota */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all ${
            isOverLimit
              ? 'bg-red-100 text-red-700'
              : hasSubcontract
                ? 'bg-purple-100 text-purple-700'
                : 'bg-slate-100 text-slate-500'
          }`}>
            {isOverLimit ? (
              <AlertCircle className="w-4 h-4" />
            ) : hasSubcontract ? (
              <CheckCircle className="w-4 h-4" />
            ) : (
              <Percent className="w-4 h-4" />
            )}
            <span className="text-sm font-bold">{totalQuotaPct.toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Barra di progresso visiva */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-600">Quota Totale</span>
            <span className={`font-semibold ${isOverLimit ? 'text-red-600' : 'text-slate-500'}`}>
              {totalQuotaPct.toFixed(1)}% / 20%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOverLimit ? 'bg-red-500' : 'bg-purple-500'
              }`}
              style={{ width: `${Math.min(100, (totalQuotaPct / 20) * 100)}%` }}
            />
          </div>
        </div>

        {/* Distribuzione per TOW */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Percent className="w-4 h-4 text-slate-400" />
            Distribuzione per TOW
          </div>

          {tows.length === 0 ? (
            <div className="text-sm text-slate-400 italic p-3 bg-slate-50 rounded-lg text-center">
              Configura prima i TOW nel tab Poste
            </div>
          ) : (
            <div className="bg-slate-50 rounded-xl p-3 space-y-2">
              {tows.map(tow => {
                const splitValue = towSplit[tow.tow_id] || 0;
                const hasValue = splitValue > 0;
                return (
                  <div
                    key={tow.tow_id}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-colors ${
                      hasValue ? 'bg-purple-50' : 'bg-white'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${hasValue ? 'bg-purple-500' : 'bg-slate-300'}`} />
                    <span className={`flex-1 text-sm font-medium ${hasValue ? 'text-purple-700' : 'text-slate-600'}`}>
                      {tow.label || tow.tow_id}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        value={splitValue || ''}
                        onChange={e => handleSplitChange(tow.tow_id, e.target.value)}
                        disabled={disabled}
                        min="0"
                        max="20"
                        step="1"
                        placeholder="0"
                        className={`w-16 px-2 py-1.5 text-center text-sm font-semibold border rounded-lg
                                   focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-200
                                   disabled:bg-slate-100 disabled:cursor-not-allowed transition-colors ${
                                     hasValue ? 'border-purple-300 bg-white' : 'border-slate-200 bg-white'
                                   }`}
                      />
                      <span className="text-xs font-medium text-slate-400 w-4">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sezione Dati Partner - visibile solo se c'è subappalto */}
        {hasSubcontract && (
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Users className="w-4 h-4 text-slate-400" />
              Dati Partner
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome Partner */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Nome Partner
                </label>
                <input
                  type="text"
                  value={partner}
                  onChange={(e) => handleChange('partner', e.target.value)}
                  disabled={disabled}
                  placeholder="Es: Acme S.r.l."
                  className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                             disabled:bg-slate-50 disabled:cursor-not-allowed
                             placeholder:text-slate-300"
                />
              </div>

              {/* Costo medio €/giorno */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Euro className="w-3 h-3" />
                  Costo Medio Giornaliero
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={avgDailyRate || ''}
                    onChange={(e) => handleChange('avg_daily_rate', parseFloat(e.target.value) || 0)}
                    disabled={disabled}
                    min="0"
                    step="10"
                    placeholder={teamMixRate > 0 ? teamMixRate.toFixed(0) : "250"}
                    className="w-full px-3 py-2.5 pr-12 text-sm text-right border border-slate-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500
                               disabled:bg-slate-50 disabled:cursor-not-allowed
                               placeholder:text-slate-300"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">
                    €/gg
                  </span>
                </div>
                {teamMixRate > 0 && !config.avg_daily_rate && (
                  <div className="text-[10px] text-slate-400">
                    Default: {formatCurrency(teamMixRate)}/gg (nostro pay mix)
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Riepilogo Costo - visibile solo se c'è subappalto */}
        {hasSubcontract && (
          <div className={`p-4 rounded-xl border-2 transition-colors ${
            isOverLimit
              ? 'bg-red-50 border-red-200'
              : 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200'
          }`}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className={`text-xs font-medium uppercase tracking-wider ${
                  isOverLimit ? 'text-red-600' : 'text-purple-600'
                }`}>
                  Costo Subappalto Stimato
                </div>
                <div className={`text-[10px] ${isOverLimit ? 'text-red-500' : 'text-purple-500'}`}>
                  {totalQuotaPct.toFixed(1)}% del Costo Team ({formatCurrency(teamCost)})
                </div>
              </div>
              <div className={`text-2xl font-bold tracking-tight ${
                isOverLimit ? 'text-red-700' : 'text-purple-700'
              }`}>
                {formatCurrency(subcontractCost)}
              </div>
            </div>

            {isOverLimit && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-100 px-3 py-2 rounded-lg">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>La quota totale supera il limite massimo del 20%</span>
              </div>
            )}
          </div>
        )}

        {/* Stato vuoto */}
        {!hasSubcontract && tows.length > 0 && (
          <div className="text-center py-4 text-slate-400 text-sm">
            Imposta una % su almeno un TOW per attivare il subappalto
          </div>
        )}
      </div>
    </div>
  );
}
