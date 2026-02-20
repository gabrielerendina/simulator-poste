import { Table, Euro, Calculator } from 'lucide-react';

/**
 * OfferSchemeTable - Tabella Schema di Offerta (PxQ)
 * Visualizza: TOW, Descrizione, Tipo, Quantità, Prezzo Unitario, Prezzo Totale
 */
export default function OfferSchemeTable({
    offerData = [],
    totalOffer = 0,
}) {

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('it-IT', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    };

    const formatNumber = (val) => {
        return new Intl.NumberFormat('it-IT', {
            maximumFractionDigits: 2,
        }).format(val);
    }

    return (
        <div className="glass-card rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 glass-card-header">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                        <Table className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">
                            Schema di Offerta
                        </h3>
                        <p className="text-xs text-slate-500">
                            Dettaglio prezzi unitari e totali per Type of Work (PxQ)
                        </p>
                    </div>
                </div>
            </div>

            {/* Tabella */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600 w-24">TOW ID</th>
                            <th className="px-4 py-3 text-left font-semibold text-slate-600">Descrizione</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-600 w-24">Tipo</th>
                            <th className="px-4 py-3 text-center font-semibold text-slate-600 w-28">Quantità</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-600 w-32">Prezzo Unitario</th>
                            <th className="px-4 py-3 text-right font-semibold text-slate-600 w-32">Prezzo Totale</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {offerData.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                    <div className="flex flex-col items-center gap-2">
                                        <Calculator className="w-8 h-8 text-slate-300" />
                                        <p>Nessun dato disponibile per l'offerta</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            <>
                                {offerData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-medium text-slate-700">{row.tow_id}</td>
                                        <td className="px-4 py-3 text-slate-600">{row.label}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`px-2 py-1 rounded text-xs font-medium
                        ${row.type === 'task' ? 'bg-blue-100 text-blue-700' :
                                                    row.type === 'corpo' ? 'bg-purple-100 text-purple-700' :
                                                    row.type === 'canone' ? 'bg-green-100 text-green-700' :
                                                        'bg-amber-100 text-amber-700'}`}>
                                                {row.type === 'task' ? 'Task' : row.type === 'corpo' ? 'A Corpo' : row.type === 'canone' ? 'Canone' : 'Consumo'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-700">
                                            <span>{formatNumber(row.quantity)}</span>
                                            <span className="block text-[10px] text-slate-400 font-sans">
                                              {row.type === 'task' ? 'task' : row.type === 'corpo' ? 'mesi (forfait)' : row.type === 'canone' ? 'mesi (canone)' : 'forfait'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                                            {formatCurrency(row.unit_price)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-slate-800">
                                            {formatCurrency(row.total_price)}
                                        </td>
                                    </tr>
                                ))}

                                {/* Riga Totale */}
                                <tr className="bg-slate-50 border-t-2 border-slate-200">
                                    <td colSpan={3} className="px-4 py-3 text-right font-bold text-slate-700">
                                        TOTALE OFFERTA
                                    </td>
                                    <td className="px-4 py-3 text-center font-bold text-slate-800">
                                        {/* Non ha senso sommare quantità eterogenee (mesi + task), lascio vuoto o somma se richiesto esplicitamente */}
                                        -
                                    </td>
                                    <td className="px-4 py-3"></td>
                                    <td className="px-4 py-3 text-right font-bold text-emerald-700 text-base">
                                        {formatCurrency(totalOffer)}
                                    </td>
                                </tr>
                            </>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
