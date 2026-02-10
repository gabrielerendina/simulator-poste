/**
 * CertVerification Component
 * 
 * Extracts information from PDF certificates using OCR.
 * Parses filename to extract requirement code, cert name, and resource name.
 * Uses OCR to extract vendor, cert code, cert name, and validity dates.
 */

import { useState, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';

// Status badge colors
const STATUS_COLORS = {
  valid: 'bg-green-100 text-green-800',
  expired: 'bg-yellow-100 text-yellow-800',
  unreadable: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-800',
  unprocessed: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  valid: 'Estratto',
  expired: 'Scaduto',
  unreadable: 'Non leggibile',
  error: 'Errore',
  unprocessed: 'Non elaborato',
};

/**
 * Main CertVerification component
 */
export default function CertVerification({ onClose }) {
  const [folderPath, setFolderPath] = useState('');
  const [reqFilter, setReqFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [checkingOcr, setCheckingOcr] = useState(false);

  // Check OCR availability
  const checkOcrStatus = useCallback(async () => {
    setCheckingOcr(true);
    try {
      const res = await axios.get(`${API_URL}/verify-certs/status`);
      setOcrStatus(res.data);
    } catch (err) {
      setOcrStatus({ ocr_available: false, error: err.response?.data?.detail || err.message });
    } finally {
      setCheckingOcr(false);
    }
  }, []);

  // Verify certificates in folder
  const handleVerify = async () => {
    if (!folderPath.trim()) {
      setError('Inserisci il percorso della cartella');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const params = { folder_path: folderPath };
      if (reqFilter.trim()) {
        params.req_filter = reqFilter.trim();
      }

      console.log('[CertVerification] Sending request to:', `${API_URL}/verify-certs`, params);
      const res = await axios.post(`${API_URL}/verify-certs`, null, { params });
      console.log('[CertVerification] Response:', res.data);
      setResults(res.data);
    } catch (err) {
      console.error('[CertVerification] Error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Errore sconosciuto';
      console.error('[CertVerification] Error message:', errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">
            🔍 Verifica Certificazioni
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* OCR Status Check */}
          <div className="mb-6">
            <button
              onClick={checkOcrStatus}
              disabled={checkingOcr}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {checkingOcr ? 'Controllo...' : 'Verifica disponibilità OCR'}
            </button>
            {ocrStatus && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${
                ocrStatus.ocr_available 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-700'
              }`}>
                {ocrStatus.ocr_available ? (
                  <>
                    ✅ OCR disponibile
                    {ocrStatus.tesseract_version && (
                      <span className="ml-2">(Tesseract v{ocrStatus.tesseract_version})</span>
                    )}
                  </>
                ) : (
                  <>
                    ❌ OCR non disponibile: {ocrStatus.error || ocrStatus.message}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Input Form */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Percorso cartella certificazioni
              </label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/Users/.../certificazioni"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Formato file atteso: CODICE_NOMECERTIFICAZIONE_NOMECOGNOME.pdf
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Filtra per requisito (opzionale)
              </label>
              <input
                type="text"
                value={reqFilter}
                onChange={(e) => setReqFilter(e.target.value)}
                placeholder="es. REQ01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              onClick={handleVerify}
              disabled={loading || !folderPath.trim()}
              className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                loading || !folderPath.trim()
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Elaborazione OCR...
                </span>
              ) : (
                '🔍 Verifica Certificazioni'
              )}
            </button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              ❌ {error}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-800 mb-3">📊 Riepilogo</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-800">{results.summary?.total || 0}</div>
                    <div className="text-sm text-gray-500">Totale</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{results.summary?.valid || 0}</div>
                    <div className="text-sm text-gray-500">Estratti</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">{results.summary?.expired || 0}</div>
                    <div className="text-sm text-gray-500">Scaduti</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{(results.summary?.unreadable || 0) + (results.summary?.error || 0)}</div>
                    <div className="text-sm text-gray-500">Non leggibili</div>
                  </div>
                </div>
              </div>

              {/* By Requirement */}
              {results.summary?.by_requirement && Object.keys(results.summary.by_requirement).length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-800 mb-3">📋 Per Requisito</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(results.summary.by_requirement).map(([req, data]) => (
                      <div key={req} className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="font-medium text-gray-800">{req}</div>
                        <div className="text-sm text-gray-500">
                          {data.valid}/{data.total} validi
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detail Table */}
              <div>
                <h3 className="text-lg font-medium text-gray-800 mb-3">📄 Dettaglio File</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requisito</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Risorsa</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Certificazione</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validità</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {results.results?.map((r, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={r.filename}>
                            {r.filename}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.req_code || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.resource_name || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.vendor_detected || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div className="max-w-xs">
                              {r.cert_name_detected && <div className="font-medium">{r.cert_name_detected}</div>}
                              {r.cert_code_detected && <div className="text-xs text-gray-500">{r.cert_code_detected}</div>}
                              {!r.cert_name_detected && !r.cert_code_detected && '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {r.valid_from || r.valid_until ? (
                              <div className="text-xs">
                                {r.valid_from && <div>Da: {r.valid_from}</div>}
                                {r.valid_until && <div>A: {r.valid_until}</div>}
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || STATUS_COLORS.unprocessed}`}>
                              {STATUS_LABELS[r.status] || r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Warning if no results */}
              {results.warning && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                  ⚠️ {results.warning}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
