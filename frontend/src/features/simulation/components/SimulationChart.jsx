import { useState, useRef } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, Cell, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2 } from 'lucide-react';

/**
 * SimulationChart - Display 4 key points: Competitor vs LUTECH, Economic vs Total
 *
 * @param {Object} props
 * @param {Array} props.simulationData - Simulation data points
 * @param {Object} props.monteCarlo - Monte Carlo analysis results
 * @param {Object} props.results - Current calculation results
 * @param {number} props.myDiscount - Current discount percentage
 * @param {number} props.competitorDiscount - Competitor discount percentage
 */
export default function SimulationChart({ simulationData, monteCarlo, results, myDiscount, competitorDiscount }) {
  const { t } = useTranslation();
  const chartRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!simulationData || simulationData.length === 0 || !results) {
    return null;
  }

  // Calculate competitor economic score from simulation data
  const competitorPoint = simulationData.find(p => Math.abs(p.discount - competitorDiscount) < 0.1);
  const competitorEconScore = competitorPoint?.economic_score || 0;

  // Calculate competitor total score (economic + estimated technical)
  const competitorTotalScore = monteCarlo?.competitor_threshold || competitorEconScore;

  // Prepare 4 scatter points
  const scatterData = [
    // Competitor points (black)
    { discount: competitorDiscount, score: competitorEconScore, label: 'Competitor Econ.', color: '#000000', type: 'competitor' },
    { discount: competitorDiscount, score: competitorTotalScore, label: 'Competitor Tot.', color: '#000000', type: 'competitor' },

    // LUTECH points (red)
    { discount: myDiscount, score: results.economic_score, label: 'LUTECH Econ.', color: '#ef4444', type: 'lutech' },
    { discount: myDiscount, score: results.total_score, label: 'LUTECH TOT.', color: '#ef4444', type: 'lutech' }
  ];

  const toggleFullscreen = () => {
    const element = chartRef.current;
    if (!element) return;

    if (!isFullscreen) {
      if (element.requestFullscreen) {
        element.requestFullscreen();
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
      setIsFullscreen(false);
    }
  };

  // Listen for fullscreen changes
  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', () => {
      setIsFullscreen(!!document.fullscreenElement);
    });
    document.addEventListener('webkitfullscreenchange', () => {
      setIsFullscreen(!!document.webkitFullscreenElement);
    });
    document.addEventListener('mozfullscreenchange', () => {
      setIsFullscreen(!!document.mozFullScreenElement);
    });
    document.addEventListener('msfullscreenchange', () => {
      setIsFullscreen(!!document.msFullscreenElement);
    });
  }

  const chartHeight = isFullscreen ? window.innerHeight - 100 : 400;

  return (
    <div ref={chartRef} className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${isFullscreen ? 'fixed inset-0 z-50 flex flex-col' : ''}`}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-slate-800">{t('dashboard.bid_to_win')}</h3>
        <div className="flex gap-4 items-center">
          {/* Legend items */}
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-black rounded-full"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Competitor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-red-400 rounded-full"></div>
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">LUTECH</span>
          </div>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title={isFullscreen ? "Esci da fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-slate-600" /> : <Maximize2 className="w-4 h-4 text-slate-600" />}
          </button>
        </div>
      </div>

      <div className={`w-full ${isFullscreen ? 'flex-1' : ''}`} style={{ height: isFullscreen ? chartHeight : '400px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 100, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />

            <XAxis
              type="number"
              dataKey="discount"
              domain={[0, Math.max(myDiscount, competitorDiscount) + 10]}
              tick={{ fontSize: 11, fill: '#475569' }}
              label={{
                value: 'Sconto (%)',
                position: 'insideBottom',
                offset: -10,
                fontSize: 12,
                fill: '#1e293b',
                fontWeight: 600
              }}
              tickLine={{ stroke: '#cbd5e1' }}
              axisLine={{ stroke: '#cbd5e1' }}
            />

            <YAxis
              type="number"
              dataKey="score"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#475569' }}
              label={{
                value: 'Punteggio',
                angle: -90,
                position: 'insideLeft',
                fontSize: 12,
                fill: '#1e293b',
                fontWeight: 600,
                offset: 5
              }}
              tickLine={{ stroke: '#cbd5e1' }}
              axisLine={{ stroke: '#cbd5e1' }}
            />

            <ZAxis range={[400, 400]} />

            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                      <p className="text-xs font-bold text-slate-800 mb-1">{data.label}</p>
                      <p className="text-xs text-slate-600">Sconto: {data.discount.toFixed(2)}%</p>
                      <p className="text-xs text-slate-600">Punteggio: {data.score.toFixed(2)}</p>
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Safe Zone Reference Line */}
            {monteCarlo?.optimal_discount && (
              <ReferenceLine
                x={monteCarlo.optimal_discount}
                stroke="#10b981"
                strokeWidth={1}
                strokeDasharray="3 3"
                label={{ position: 'top', value: 'Safe Zone', fill: '#10b981', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            <Scatter name="Points" data={scatterData} fill="#8884d8">
              {scatterData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-xs text-slate-500 mt-4 text-center">
        {t('dashboard.chart_description')}
      </p>
    </div>
  );
}
