import { motion } from 'framer-motion';
import { BarChart, Card as TremorCard, DonutChart, AreaChart } from '@tremor/react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, Euro, Target, Layers } from 'lucide-react';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.4, ease: 'easeOut' },
  }),
};

const kpiData = [
  { label: 'Ricavo Offerta', value: '€ 2.450.000', trend: '+12%', color: 'bg-blue-500', icon: Euro },
  { label: 'Margine Netto', value: '18,4%', trend: '+2.1pp', color: 'bg-emerald-500', icon: TrendingUp },
  { label: 'Sconto Applicato', value: '22%', trend: '-3%', color: 'bg-amber-500', icon: Target },
  { label: 'TOW Configurati', value: '4', trend: 'canone+task', color: 'bg-indigo-500', icon: Layers },
];

const barData = [
  { tow: 'TOW_01', costo: 480000, ricavo: 560000 },
  { tow: 'TOW_02', costo: 320000, ricavo: 390000 },
  { tow: 'TOW_03', costo: 210000, ricavo: 260000 },
  { tow: 'TOW_04', costo: 150000, ricavo: 180000 },
];

const donutData = [
  { name: 'A Task', value: 45 },
  { name: 'A Corpo', value: 25 },
  { name: 'Canone', value: 20 },
  { name: 'A Consumo', value: 10 },
];

const areaData = [
  { mese: 'Gen', margine: 14.2 },
  { mese: 'Feb', margine: 15.8 },
  { mese: 'Mar', margine: 16.1 },
  { mese: 'Apr', margine: 17.4 },
  { mese: 'Mag', margine: 18.4 },
  { mese: 'Giu', margine: 19.2 },
];

export default function PilotaDashboard() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Dashboard Pilota</h2>
          <p className="text-slate-500 text-sm mt-1">
            Test integrazione shadcn/ui + Tremor v4 + Framer Motion
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">evolution branch</Badge>
          <Button size="sm">Esporta</Button>
        </div>
      </div>

      {/* KPI Cards — shadcn/ui + Framer Motion */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((kpi, i) => (
          <motion.div key={kpi.label} custom={i} initial="hidden" animate="visible" variants={fadeUp}>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription className="text-xs font-medium uppercase tracking-wide">
                    {kpi.label}
                  </CardDescription>
                  <div className={`w-7 h-7 rounded-lg ${kpi.color} flex items-center justify-center`}>
                    <kpi.icon className="w-3.5 h-3.5 text-white" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-slate-800">{kpi.value}</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">{kpi.trend}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts — Tremor v4 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          custom={4} initial="hidden" animate="visible" variants={fadeUp}
          className="lg:col-span-2"
        >
          <TremorCard>
            <h3 className="font-semibold text-slate-700 mb-4">Costo vs Ricavo per TOW</h3>
            <BarChart
              data={barData}
              index="tow"
              categories={['costo', 'ricavo']}
              colors={['blue', 'emerald']}
              valueFormatter={(v) => `€${(v / 1000).toFixed(0)}k`}
              className="h-48"
            />
          </TremorCard>
        </motion.div>

        <motion.div custom={5} initial="hidden" animate="visible" variants={fadeUp}>
          <TremorCard>
            <h3 className="font-semibold text-slate-700 mb-4">Mix TOW</h3>
            <DonutChart
              data={donutData}
              category="value"
              index="name"
              colors={['blue', 'purple', 'green', 'amber']}
              valueFormatter={(v) => `${v}%`}
              className="h-48"
            />
          </TremorCard>
        </motion.div>
      </div>

      <motion.div custom={6} initial="hidden" animate="visible" variants={fadeUp}>
        <TremorCard>
          <h3 className="font-semibold text-slate-700 mb-4">Andamento Margine</h3>
          <AreaChart
            data={areaData}
            index="mese"
            categories={['margine']}
            colors={['indigo']}
            valueFormatter={(v) => `${v}%`}
            className="h-40"
          />
        </TremorCard>
      </motion.div>
    </div>
  );
}
