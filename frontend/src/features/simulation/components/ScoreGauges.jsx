import { Download, Loader2, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Gauge from '../../../shared/components/ui/Gauge';

/**
 * ScoreGauges - Display technical, economic, and total scores with gauges
 *
 * @param {Object} props
 * @param {Object} props.results - Calculation results with scores
 * @param {Object} props.lotData - Lot configuration data
 * @param {Object} props.techInputs - Technical inputs with assigned_company and cert_company_counts
 * @param {Function} props.onExport - Callback for PDF export
 * @param {boolean} props.exportLoading - Export loading state
 */
export default function ScoreGauges({ results, lotData, techInputs, onExport, exportLoading }) {
  const { t } = useTranslation();

  if (!results || !lotData) {
    return null;
  }

  // RTI companies: Lutech always present, partners added if rti_enabled
  const rtiCompanies = lotData?.rti_enabled 
    ? ['Lutech', ...(lotData.rti_companies || [])] 
    : ['Lutech'];
  const hasMultipleCompanies = rtiCompanies.length > 1;

  // Calculate per-company contributions
  const companyContributions = {};
  if (hasMultipleCompanies && techInputs && lotData.reqs) {
    // Initialize company totals
    rtiCompanies.forEach(company => {
      companyContributions[company] = {
        resource: 0,
        reference: 0,
        project: 0,
        total: 0
      };
    });

    // Iterate through requirements and attribute scores
    lotData.reqs.forEach(req => {
      const input = techInputs[req.id] || {};
      const weightedScore = results?.weighted_scores?.[req.id] || 0;
      const garaWeight = req.gara_weight || 0;

      if (req.type === 'reference' || req.type === 'project') {
        // Attribute MAX gara_weight (not calculated score) to assigned_company
        // This represents the potential/responsibility, not the evaluation
        const assignedCompany = input.assigned_company || 'Lutech';
        if (companyContributions[assignedCompany]) {
          companyContributions[assignedCompany][req.type] += garaWeight;
          companyContributions[assignedCompany].total += garaWeight;
        }
      } else if (req.type === 'resource') {
        // Split among cert_company_counts (how many certs each company contributes)
        const certCompanyCounts = input.cert_company_counts || {};
        const companyWeights = {};
        let totalCerts = 0;

        // Sum up cert counts per company across all certs
        Object.entries(certCompanyCounts).forEach(([, compCounts]) => {
          if (compCounts && typeof compCounts === 'object') {
            Object.entries(compCounts).forEach(([company, certCount]) => {
              if (rtiCompanies.includes(company) && certCount > 0) {
                companyWeights[company] = (companyWeights[company] || 0) + certCount;
                totalCerts += certCount;
              }
            });
          }
        });

        // Distribute score proportionally
        if (totalCerts > 0) {
          Object.entries(companyWeights).forEach(([company, count]) => {
            const proportion = count / totalCerts;
            const contribution = weightedScore * proportion;
            if (companyContributions[company]) {
              companyContributions[company].resource += contribution;
              companyContributions[company].total += contribution;
            }
          });
        }
      }
    });
  }

  // Calculate total attributable score (excludes company certs which are shared)
  const totalAttributable = Object.values(companyContributions).reduce((sum, c) => sum + c.total, 0);

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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Gauge
          value={results.technical_score}
          max={results?.calculated_max_tech_score || lotData.max_tech_score || 60}
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
          <div className="grid grid-cols-2 gap-3">
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

      {/* RTI Company Contributions */}
      {hasMultipleCompanies && totalAttributable > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h4 className="font-semibold text-slate-700 text-sm">{t('dashboard.rti_contributions')}</h4>
          </div>
          
          {/* Shared RTI Score (Company Certs) */}
          {(results.category_company_certs || 0) > 0 && (
            <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-3 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-purple-700">{t('dashboard.shared_rti_certs')}</span>
                <span className="text-lg font-black text-purple-700">{(results.category_company_certs || 0).toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-purple-600 mt-1">{t('dashboard.shared_rti_desc')}</div>
            </div>
          )}

          {/* Per-Company Breakdown */}
          <div className="space-y-2">
            {rtiCompanies.map(company => {
              const contrib = companyContributions[company] || { total: 0, resource: 0, reference: 0, project: 0 };
              const percentage = totalAttributable > 0 ? (contrib.total / totalAttributable * 100) : 0;
              
              return (
                <div key={company} className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-slate-800">{company}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-indigo-700">{contrib.total.toFixed(2)}</span>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-full">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Category breakdown for this company */}
                  <div className="flex gap-4 text-[10px]">
                    {contrib.resource > 0 && (
                      <span className="text-blue-600">
                        <span className="font-semibold">Cert.Prof:</span> {contrib.resource.toFixed(2)}
                      </span>
                    )}
                    {contrib.reference > 0 && (
                      <span className="text-emerald-600">
                        <span className="font-semibold">Ref:</span> {contrib.reference.toFixed(2)}
                      </span>
                    )}
                    {contrib.project > 0 && (
                      <span className="text-orange-600">
                        <span className="font-semibold">Prog:</span> {contrib.project.toFixed(2)}
                      </span>
                    )}
                    {contrib.total === 0 && (
                      <span className="text-slate-400 italic">{t('dashboard.no_contribution')}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Attributable */}
          <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-600">{t('dashboard.total_attributable')}</span>
            <span className="text-lg font-black text-slate-800">{totalAttributable.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
