import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * LotSelector - Horizontal lot selection bar with add/delete actions
 *
 * @param {Object} props
 * @param {Object} props.config - Config object with lot keys
 * @param {string} props.selectedLot - Currently selected lot key
 * @param {Function} props.onSelectLot - Callback when lot is selected
 * @param {Function} props.onAddLot - Callback to add new lot
 * @param {Function} props.onDeleteLot - Callback to delete selected lot
 */
export default function LotSelector({ config, selectedLot, onSelectLot, onAddLot, onDeleteLot }) {
  const { t } = useTranslation();

  const handleAddLot = () => {
    const name = prompt(t('config.prompt_new_lot'));
    if (name) onAddLot(name);
  };

  return (
    <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
      <div className="flex gap-2 overflow-x-auto">
        {Object.keys(config).map(lotKey => (
          <button
            key={lotKey}
            onClick={() => onSelectLot(lotKey)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              selectedLot === lotKey
                ? 'bg-slate-800 text-white shadow'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            {lotKey}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleAddLot}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
          title={t('common.add', 'AGGIUNGI')}
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDeleteLot(selectedLot)}
          className="p-2 text-slate-500 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors"
          title={t('common.delete', 'ELIMINA')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
