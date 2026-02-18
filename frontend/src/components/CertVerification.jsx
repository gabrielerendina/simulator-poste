/**
 * CertVerification Component
 * 
 * Extracts information from PDF certificates using OCR.
 * Parses filename to extract requirement code, cert name, and resource name.
 * Uses OCR to extract vendor, cert code, cert name, and validity dates.
 * 
 * Supports two input modes:
 * - Local folder path (for local/dev deployments)
 * - ZIP file upload (for remote deployments)
 */

import { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { API_URL } from '../utils/api';

// Status badge colors
const STATUS_COLORS = {
  valid: 'bg-green-100 text-green-800',
  expired: 'bg-yellow-100 text-yellow-800',
  mismatch: 'bg-orange-100 text-orange-800',
  unreadable: 'bg-gray-100 text-gray-600',
  not_downloaded: 'bg-purple-100 text-purple-800',
  too_large: 'bg-indigo-100 text-indigo-800',
  error: 'bg-red-100 text-red-800',
  unprocessed: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  valid: 'Estratto',
  expired: 'Scaduto',
  mismatch: 'Nome non corrisponde',
  unreadable: 'Non leggibile',
  not_downloaded: 'Non scaricato',
  too_large: 'File troppo grande',
  error: 'Errore',
  unprocessed: 'Non elaborato',
};

// Input mode options
const INPUT_MODES = {
  FOLDER: 'folder',
  UPLOAD: 'upload',
};

/**
 * Main CertVerification component
 */
export default function CertVerification({ onClose }) {
  const [inputMode, setInputMode] = useState(INPUT_MODES.UPLOAD); // Default to upload for remote compatibility
  const [folderPath, setFolderPath] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [reqFilter, setReqFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // { current, total, filename }
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [checkingOcr, setCheckingOcr] = useState(false);
  const fileInputRef = useRef(null);

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

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setError('Seleziona un file ZIP');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  // Clear selected file
  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Verify certificates in folder (original mode)
  const handleVerifyFolder = async () => {
    if (!folderPath.trim()) {
      setError('Inserisci il percorso della cartella');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setUploadProgress(null);

    try {
      const params = { folder_path: folderPath };
      if (reqFilter.trim()) {
        params.req_filter = reqFilter.trim();
      }

      const res = await axios.post(`${API_URL}/verify-certs`, null, { params });
      setResults(res.data);
    } catch (err) {
      console.error('[CertVerification] Error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Errore sconosciuto';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Verify certificates from ZIP upload
  const handleVerifyUpload = async () => {
    if (!selectedFile) {
      setError('Seleziona un file ZIP');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);
    setUploadProgress({ current: 0, total: 0, filename: selectedFile.name, phase: 'uploading' });

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Build query params
      const params = new URLSearchParams();
      if (reqFilter.trim()) {
        params.append('req_filter', reqFilter.trim());
      }

      const url = `${API_URL}/verify-certs/upload${params.toString() ? '?' + params.toString() : ''}`;

      const res = await axios.post(url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(prev => ({ ...prev, phase: 'uploading', percent: percentCompleted }));
        },
      });

      setResults(res.data);
      setUploadProgress(null);
    } catch (err) {
      console.error('[CertVerification] Upload error:', err);
      const errorMsg = err.response?.data?.detail || err.message || 'Errore sconosciuto';
      setError(errorMsg);
      setUploadProgress(null);
    } finally {
      setLoading(false);
    }
  };

  // Handle verify button click based on mode
  const handleVerify = () => {
    if (inputMode === INPUT_MODES.FOLDER) {
      handleVerifyFolder();
    } else {
      handleVerifyUpload();
    }
  };

  // Check if verify button should be enabled
  const canVerify = inputMode === INPUT_MODES.FOLDER 
    ? folderPath.trim() !== ''
    : selectedFile !== null;

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

          {/* Input Mode Toggle */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Modalità input
            </label>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
              <button
                onClick={() => setInputMode(INPUT_MODES.UPLOAD)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  inputMode === INPUT_MODES.UPLOAD
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📤 Upload ZIP
              </button>
              <button
                onClick={() => setInputMode(INPUT_MODES.FOLDER)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                  inputMode === INPUT_MODES.FOLDER
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                📁 Cartella locale
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              {inputMode === INPUT_MODES.UPLOAD 
                ? 'Carica un file ZIP contenente i PDF delle certificazioni'
                : 'Inserisci il percorso di una cartella locale (solo per esecuzione locale)'}
            </p>
          </div>

          {/* Input Form */}
          <div className="space-y-4 mb-6">
            {inputMode === INPUT_MODES.FOLDER ? (
              /* Folder Path Input */
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
              </div>
            ) : (
              /* ZIP Upload Input */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  File ZIP certificazioni
                </label>
                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="zip-upload"
                  />
                  <label
                    htmlFor="zip-upload"
                    className="flex-1 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-center"
                  >
                    {selectedFile ? (
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-green-600">📦</span>
                        <span className="text-gray-700 font-medium">{selectedFile.name}</span>
                        <span className="text-gray-500 text-sm">
                          ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    ) : (
                      <div className="text-gray-500">
                        <span className="text-2xl">📤</span>
                        <p className="mt-1">Clicca per selezionare un file ZIP</p>
                        <p className="text-xs mt-1">o trascina qui il file</p>
                      </div>
                    )}
                  </label>
                  {selectedFile && (
                    <button
                      onClick={clearFile}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      title="Rimuovi file"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500">
              Formato file atteso: CODICE_NOMECERTIFICAZIONE_NOMECOGNOME.pdf
            </p>

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
              disabled={loading || !canVerify}
              className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                loading || !canVerify
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
                  {uploadProgress?.phase === 'uploading' 
                    ? `Caricamento... ${uploadProgress.percent || 0}%`
                    : 'Elaborazione OCR...'}
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
              {/* Upload info */}
              {results.upload_filename && (
                <div className="text-sm text-gray-500 mb-2">
                  📦 File analizzato: <span className="font-medium">{results.upload_filename}</span>
                </div>
              )}

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-gray-800 mb-3">📊 Riepilogo</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
                    <div className="text-2xl font-bold text-orange-600">{results.summary?.mismatch || 0}</div>
                    <div className="text-sm text-gray-500">Nome errato</div>
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
                        <div className="font-medium text-gray-800">{req || '(vuoto)'}</div>
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
                      {results.results?.map((r, idx) => {
                        const displayFilename = r.filename?.split('/').pop() || r.filename;
                        return (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={r.filename}>
                            {displayFilename}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700">{r.req_code || '-'}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">
                            <div>
                              {r.resource_name || '-'}
                              {r.resource_name_detected && r.resource_name !== r.resource_name_detected && (
                                <div className="text-xs text-orange-600" title="Nome rilevato dall'OCR">
                                  OCR: {r.resource_name_detected}
                                </div>
                              )}
                            </div>
                          </td>
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
                            {r.errors && r.errors.length > 0 && (
                              <div className="text-xs text-red-500 mt-1" title={r.errors.join(', ')}>
                                {r.errors[0].substring(0, 50)}...
                              </div>
                            )}
                          </td>
                        </tr>
                      )})}
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
