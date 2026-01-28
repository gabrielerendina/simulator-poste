import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';

/**
 * SimulationChart - Display economic score simulation with current position and safe zone
 *
 * @param {Object} props
 * @param {Array} props.simulationData - Simulation data points
 * @param {Object} props.monteCarlo - Monte Carlo analysis results
 * @param {Object} props.results - Current calculation results
 * @param {number} props.myDiscount - Current discount percentage
 */
export default function SimulationChart({ simulationData, monteCarlo, results, myDiscount }) {
  const { t } = useTranslation();

  if (!simulationData || simulationData.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-slate-800">{t('dashboard.bid_to_win')}</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Safe Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Tu</span>
          </div>
        </div>
      </div>

      <div className="w-full" style={{ height: '320px' }}>
        <ResponsiveContainer width="100%" height={320} minWidth={100}>
          <AreaChart data={simulationData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="discount"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              label={{ value: 'Sconto %', position: 'insideBottom', offset: -5, fontSize: 10 }}
            />
            <YAxis domain={['auto', 40]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <Tooltip
              formatter={(value) => [`${value} Punti Economici`, 'Economic Score']}
              labelFormatter={(label) => `Sconto: ${label}%`}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '11px' }}
            />

            {/* Optimal Discount Zone Shading */}
            {monteCarlo?.optimal_discount && (
              <ReferenceLine
                segment={[{ x: monteCarlo.optimal_discount, y: 0 }, { x: 70, y: 0 }]}
                stroke="transparent"
              />
            )}

            <Area
              type="monotone"
              dataKey="economic_score"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorTotal)"
              name={t('dashboard.economic')}
            />

            {/* Current Economic Position Line */}
            <ReferenceLine
              y={results?.economic_score || 0}
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="3 3"
              label={{ position: 'right', value: 'Tua Posizione', fill: '#ef4444', fontSize: 10, fontWeight: 'bold' }}
            />

            {/* Competitor Threshold Line */}
            <ReferenceLine
              y={monteCarlo?.competitor_threshold || 95}
              stroke="#f97316"
              strokeDasharray="4 4"
              label={{ position: 'right', value: t('dashboard.threshold_win'), fill: '#f97316', fontSize: 10, fontWeight: 'bold' }}
            />

            {/* Safe Zone Marker */}
            {monteCarlo?.optimal_discount && (
              <ReferenceLine
                x={monteCarlo.optimal_discount}
                stroke="#10b981"
                strokeWidth={1}
                label={{ position: 'top', value: 'Safe Zone Start', fill: '#10b981', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* Marker for Current Position */}
            <ReferenceLine x={myDiscount} stroke="#ef4444" strokeWidth={2} label={{ position: 'top', value: 'TU', fill: '#ef4444', fontSize: 11, fontWeight: 'bold' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex flex-col gap-1 items-center">
        <p className="text-[10px] text-slate-400 text-center leading-relaxed">
          {t('dashboard.chart_description')}
        </p>
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
          Safe Zone: {t('dashboard.win_prob')} {">"} 90%
        </p>
      </div>
    </div>
  );
}
