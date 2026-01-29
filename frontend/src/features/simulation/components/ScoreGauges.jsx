import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Gauge from '../../../shared/components/ui/Gauge';

/**
 * ScoreGauges - Display technical, economic, and total scores with gauges
 *
 * @param {Object} props
 * @param {Object} props.results - Calculation results with scores
 * @param {Object} props.lotData - Lot configuration data
 * @param {Function} props.onExport - Callback for PDF export
 * @param {boolean} props.exportLoading - Export loading state
 */
export default function ScoreGauges({ results, lotData, onExport, exportLoading }) {
  const { t } = useTranslation();

  if (!results || !lotData) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="font-semibold text-slate-800">{t('dashboard.performance_score')}</h3>
        <button
          onClick={onExport}
          disabled={exportLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-all text-sm font-medium disabled:opacity-50"
        >
          {exportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {t('dashboard.export_pdf')}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Gauge
          value={results.technical_score}
          max={lotData.max_tech_score || 60}
          color="#3b82f6"
          label={t('dashboard.technical')}
        />
        <Gauge
          value={results.economic_score}
          max={lotData.max_econ_score || 40}
          color="#10b981"
          label={t('dashboard.economic')}
        />
        <Gauge
          value={results.total_score}
          max={100}
          color="#f59e0b"
          label={t('dashboard.total')}
        />
      </div>

      {/* Weighted Category Scores */}
      {(results.category_company_certs !== undefined ||
        results.category_resource !== undefined ||
        results.category_reference !== undefined ||
        results.category_project !== undefined) && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <h4 className="font-semibold text-slate-700 mb-4 text-sm">Punteggi Pesati per Categoria</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <div className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-1">Cert. Aziendali</div>
              <div className="text-2xl font-black text-purple-700">{(results.category_company_certs || 0).toFixed(2)}</div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1">Cert. Professionali</div>
              <div className="text-2xl font-black text-blue-700">{(results.category_resource || 0).toFixed(2)}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Referenze</div>
              <div className="text-2xl font-black text-emerald-700">{(results.category_reference || 0).toFixed(2)}</div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <div className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Progetto Tecnico</div>
              <div className="text-2xl font-black text-orange-700">{(results.category_project || 0).toFixed(2)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
