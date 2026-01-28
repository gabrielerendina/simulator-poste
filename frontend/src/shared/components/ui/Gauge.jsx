import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { formatNumber } from '../../../utils/formatters';

/**
 * Gauge - Semi-circular gauge component for displaying scores
 *
 * @param {Object} props
 * @param {number} props.value - Current value to display
 * @param {number} props.max - Maximum value for the gauge
 * @param {string} props.color - Fill color for the gauge arc
 * @param {string} props.label - Label text below the value
 * @param {number} [props.raw] - Optional raw score to display
 * @param {number} [props.weighted] - Optional weighted score to display
 */
export default function Gauge({ value, max, color, label, raw, weighted }) {
  const data = [
    { name: 'Value', value: value },
    { name: 'Empty', value: max - value }
  ];

  // Calculate percentage for needle or just filled arc
  const percent = (value / max) * 100;

  return (
    <div className="h-40 w-full relative flex flex-col items-center justify-center">
      <ResponsiveContainer width="100%" height={160} minWidth={100}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="70%"
            startAngle={180}
            endAngle={0}
            innerRadius={60}
            outerRadius={80}
            paddingAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell key="val" fill={color} />
            <Cell key="empty" fill="#f1f5f9" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute top-[65%] text-center">
        <div className="text-3xl font-bold text-slate-800">{formatNumber(value, 2)}</div>
        <div className="text-xs text-slate-400 uppercase">{label}</div>
        {(raw !== undefined || weighted !== undefined) && (
          <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
            {raw !== undefined && <div>Raw: {formatNumber(raw, 2)}</div>}
            {weighted !== undefined && <div>Weighted: {formatNumber(weighted, 2)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
