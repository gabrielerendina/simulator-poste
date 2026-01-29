import { Plus, Trash2, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * CompanyCertsEditor - Editor for company certifications with points
 *
 * @param {Object} props
 * @param {Array} props.companyCerts - Array of company certifications
 * @param {Array} props.knownCerts - Available certification options from master data
 * @param {Function} props.onAdd - Callback to add new certification
 * @param {Function} props.onUpdate - Callback to update certification label
 * @param {Function} props.onUpdatePoints - Callback to update certification points
 * @param {Function} props.onDelete - Callback to delete certification
 */
export default function CompanyCertsEditor({
  companyCerts,
  knownCerts,
  onAdd,
  onUpdate,
  onUpdatePoints,
  onDelete
}) {
  const { t } = useTranslation();

  const totalPoints = companyCerts?.reduce((sum, c) => sum + (c.points || 0), 0) || 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
      <div className="flex items-center gap-2 mb-6">
        <Building2 className="w-5 h-5 text-purple-600" />
        <h2 className="text-lg font-semibold text-slate-800">{t('dashboard.company_certs')}</h2>
        <button
          onClick={onAdd}
          className="ml-auto px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('config.add_cert')}
        </button>
      </div>

      <div className="space-y-3">
        {companyCerts && companyCerts.length > 0 ? (
          companyCerts.map((cert, idx) => (
            <div key={idx} className="flex gap-4 items-center bg-purple-50 p-3 rounded-lg border border-purple-200 group">
              <div className="flex-1">
                <label className="block text-xs font-bold text-purple-600 uppercase mb-1 tracking-wider">
                  Certificazione
                </label>
                <select
                  value={cert.label}
                  onChange={(e) => onUpdate(idx, e.target.value)}
                  className="w-full p-2 border border-purple-200 bg-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm text-slate-800"
                >
                  <option value="" disabled>{t('master.item_placeholder', 'Seleziona...')}</option>
                  {knownCerts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-purple-600 uppercase mb-1 tracking-wider">
                  Punti
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={cert.points}
                  onChange={(e) => onUpdatePoints(idx, Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-24 p-2 border border-purple-200 bg-white rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-bold text-center text-purple-700 text-base"
                />
              </div>

              <button
                onClick={() => onDelete(idx)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-lg transition-all opacity-0 group-hover:opacity-100 self-end mb-1"
                title="Elimina"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        ) : (
          <div className="text-center py-10 border-2 border-dashed border-purple-200 rounded-xl bg-purple-50/50">
            <div className="text-sm text-purple-700 font-medium">Nessuna certificazione aggiunta</div>
            <div className="text-xs text-purple-500 mt-1">Clicca su "Aggiungi Certificazione" per iniziare</div>
          </div>
        )}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200">
        <div className="flex justify-between items-center bg-purple-50 px-5 py-3 rounded-lg border border-purple-200">
          <div className="text-sm font-semibold text-purple-800">Totale Punti Cert.</div>
          <div className="text-right">
            <div className="text-3xl font-black text-purple-700">{totalPoints.toFixed(1)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
