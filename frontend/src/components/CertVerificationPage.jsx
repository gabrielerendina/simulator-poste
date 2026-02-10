/**
 * CertVerificationPage Component
 * 
 * Full-page view for extracting information from PDF certificates using OCR.
 * Parses filename to extract requirement code, cert name, and resource name.
 * Uses OCR to extract vendor, cert code, cert name, and validity dates.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { API_URL } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, 
  FileSearch, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Download,
  RefreshCw,
  Filter,
  RotateCcw,
  BarChart3,
  FileText,
  Clock,
  X
} from 'lucide-react';

// Status badge colors
const STATUS_COLORS = {
  valid: 'bg-green-100 text-green-800',
  expired: 'bg-yellow-100 text-yellow-800',
  mismatch: 'bg-orange-100 text-orange-800',
  unreadable: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-800',
  unprocessed: 'bg-gray-100 text-gray-500',
};

const STATUS_LABELS = {
  valid: 'status_valid',
  expired: 'status_expired',
  mismatch: 'status_mismatch',
  unreadable: 'status_unreadable',
  error: 'status_error',
  unprocessed: 'unprocessed',
};

// Labels for Excel export (keep Italian for file output)
const STATUS_LABELS_EXPORT = {
  valid: 'Estratto',
  expired: 'Scaduto',
  mismatch: 'Mismatch',
  unreadable: 'Non leggibile',
  error: 'Errore',
  unprocessed: 'Non elaborato',
};

// Default column widths
const DEFAULT_COLUMN_WIDTHS = {
  file: 200,
  requisito: 100,
  certFile: 160,
  certAttesa: 180,
  risorsa: 140,
  risorsaOcr: 140,
  vendor: 120,
  certificazione: 250,
  validita: 110,
  stato: 110,
};

// Helper to normalize dates for display
const normalizeDate = (dateStr) => {
  if (!dateStr) return null;
  // Try to parse and format as DD/MM/YYYY
  const formats = [
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/,  // DD/MM/YYYY or MM/DD/YYYY
    /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/,  // YYYY/MM/DD
  ];
  for (const fmt of formats) {
    const m = dateStr.match(fmt);
    if (m) {
      // Assume European format (DD/MM/YYYY)
      if (fmt === formats[1]) {
        return `${m[3].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[1]}`;
      }
      return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    }
  }
  return dateStr;
};

/**
 * Main CertVerificationPage component
 */
export default function CertVerificationPage() {
  const { t } = useTranslation();
  const { getAccessToken } = useAuth();
  const [folderPath, setFolderPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [ocrStatus, setOcrStatus] = useState(null);
  const [checkingOcr, setCheckingOcr] = useState(false);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [lots, setLots] = useState([]);
  const [selectedLot, setSelectedLot] = useState('');
  const [progress, setProgress] = useState({ current: 0, total: 0, filename: '' });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterReq, setFilterReq] = useState('');
  const [sortField, setSortField] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [retryingFile, setRetryingFile] = useState(null);
  
  // Refs for abort and resize handling
  const abortControllerRef = useRef(null);
  useEffect(() => {
    const fetchLots = async () => {
      try {
        const res = await axios.get(`${API_URL}/config`);
        const lotKeys = Object.keys(res.data || {});
        setLots(lotKeys);
        // Don't auto-select - keep it optional
      } catch (err) {
        console.error('Failed to fetch lots:', err);
      }
    };
    fetchLots();
  }, []);
  
  // Refs for resize handling
  const resizingRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const tableRef = useRef(null);
  
  // Fetch available lots on mount

  // Handle column resize
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingRef.current.column) return;
      e.preventDefault();
      
      const diff = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(60, resizingRef.current.startWidth + diff);
      
      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current.column]: newWidth
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current.column) {
        resizingRef.current.column = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = (e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      column: columnKey,
      startX: e.clientX,
      startWidth: columnWidths[columnKey]
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Export to Excel (CSV format)
  const exportToExcel = useCallback(() => {
    if (!results?.results?.length) return;
    
    const headers = [
      'File',
      'Requisito',
      'Cert (File)',
      'Cert Attesa',
      'Risorsa (File)',
      'Risorsa OCR',
      'Vendor',
      'Certificazione OCR',
      'Codice Cert',
      'Valido Da',
      'Valido A',
      'Stato'
    ];
    
    const rows = results.results.map(r => [
      r.filename || '',
      r.req_code || '',
      r.cert_name_from_file || '',
      (r.expected_cert_names || []).join('; '),
      r.resource_name || '',
      r.resource_name_detected || '',
      r.vendor_detected || '',
      r.cert_name_detected || '',
      r.cert_code_detected || '',
      normalizeDate(r.valid_from) || '',
      normalizeDate(r.valid_until) || '',
      STATUS_LABELS_EXPORT[r.status] || r.status || ''
    ]);
    
    // Create CSV content with BOM for Excel UTF-8 compatibility
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');
    
    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cert_verification_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results]);

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

  // Verify certificates in folder using SSE for progress
  const handleVerify = async () => {
    if (!folderPath.trim()) {
      setError(t('cert_verification.enter_path'));
      return;
    }

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();
    
    setLoading(true);
    setError(null);
    setResults(null);
    setProgress({ current: 0, total: 0, filename: '' });

    try {
      // Build query params
      const params = new URLSearchParams({ folder_path: folderPath });
      if (selectedLot) {
        params.append('lot_key', selectedLot);
      }

      // Use SSE streaming endpoint
      const token = getAccessToken();
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${API_URL}/verify-certs/stream?${params}`, {
        method: 'POST',
        headers,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              
              if (event.type === 'start') {
                setProgress({ current: 0, total: event.total, filename: '' });
              } else if (event.type === 'progress') {
                setProgress({ current: event.current, total: event.total, filename: event.filename });
              } else if (event.type === 'done') {
                setResults(event.results);
                setProgress({ current: 0, total: 0, filename: '' });
              } else if (event.type === 'error') {
                setError(event.message);
              }
            } catch (parseErr) {
              console.error('Failed to parse SSE event:', parseErr);
            }
          }
        }
      }
    } catch (err) {
      // Don't show error if aborted by user
      if (err.name === 'AbortError') {
        setError(null);
      } else {
        const errorMsg = err.message || 'Errore sconosciuto';
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Cancel ongoing OCR process
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setProgress({ current: 0, total: 0, filename: '' });
    }
  }, []);

  // Retry a single failed file
  const handleRetry = useCallback(async (filename) => {
    if (!results?.folder) return;
    
    setRetryingFile(filename);
    
    try {
      const token = getAccessToken();
      const pdfPath = `${results.folder}/${filename}`;
      
      const res = await axios.post(
        `${API_URL}/verify-certs/single`,
        null,
        {
          params: { pdf_path: pdfPath },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      
      // Update results with the new data
      setResults(prev => {
        if (!prev?.results) return prev;
        const newResults = prev.results.map(r => 
          r.filename === filename ? { ...res.data, filename } : r
        );
        
        // Recalculate summary
        const summary = {
          ...prev.summary,
          valid: newResults.filter(r => r.status === 'valid').length,
          expired: newResults.filter(r => r.status === 'expired').length,
          mismatch: newResults.filter(r => r.status === 'mismatch').length,
          unreadable: newResults.filter(r => r.status === 'unreadable').length,
          error: newResults.filter(r => r.status === 'error').length,
        };
        
        return { ...prev, results: newResults, summary };
      });
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingFile(null);
    }
  }, [results, getAccessToken]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    if (!results?.results) return [];
    
    let data = [...results.results];
    
    // Apply filters
    if (filterStatus) {
      data = data.filter(r => r.status === filterStatus);
    }
    if (filterReq) {
      data = data.filter(r => r.req_code?.toLowerCase().includes(filterReq.toLowerCase()));
    }
    
    // Apply sorting
    if (sortField) {
      data.sort((a, b) => {
        let valA = a[sortField] || '';
        let valB = b[sortField] || '';
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        if (valA < valB) return sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return data;
  }, [results, filterStatus, filterReq, sortField, sortDir]);

  // Handle column sort click
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Sort indicator
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="ml-1 text-slate-300">↕</span>;
    return <span className="ml-1 text-indigo-600">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl">
              <FileSearch className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-slate-800">
                {t('cert_verification.title')}
              </h1>
              <p className="text-sm text-slate-500">
                {t('cert_verification.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 md:p-6">
          {/* OCR Status Check */}
          <div className="mb-6">
            <button
              onClick={checkOcrStatus}
              disabled={checkingOcr}
              className="text-sm text-indigo-600 hover:text-indigo-800 underline flex items-center gap-1"
            >
              <Search className="w-4 h-4" />
              {checkingOcr ? t('cert_verification.checking') : t('cert_verification.check_ocr')}
            </button>
            {ocrStatus && (
              <div className={`mt-2 p-3 rounded-lg text-sm flex items-center gap-2 ${
                ocrStatus.ocr_available 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {ocrStatus.ocr_available ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {t('cert_verification.ocr_available')}
                    {ocrStatus.tesseract_version && (
                      <span className="ml-2 text-green-600">(Tesseract v{ocrStatus.tesseract_version})</span>
                    )}
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    {t('cert_verification.ocr_unavailable')}: {ocrStatus.error || ocrStatus.message}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Input Form */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('cert_verification.folder_label')}
              </label>
              <input
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder={t('cert_verification.folder_placeholder')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
              />
              <p className="mt-1 text-xs text-slate-500">
                {t('cert_verification.folder_hint')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('cert_verification.lot_label')}
              </label>
              <select
                value={selectedLot}
                onChange={(e) => setSelectedLot(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white transition-shadow"
              >
                <option value="">{t('cert_verification.lot_placeholder')}</option>
                {lots.map(lot => (
                  <option key={lot} value={lot}>{lot}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {t('cert_verification.lot_hint')}
              </p>
            </div>
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || !folderPath.trim()}
            className={`w-full lg:w-auto px-6 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
              loading || !folderPath.trim()
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                {t('cert_verification.processing')}
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                {t('cert_verification.verify_btn')}
              </>
            )}
          </button>

          {/* Progress Bar */}
          {loading && progress.total > 0 && (
            <div className="mt-4 space-y-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t('cert_verification.processing_label')}: {progress.current}/{progress.total}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{Math.round((progress.current / progress.total) * 100)}%</span>
                  <button
                    onClick={handleCancel}
                    className="px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    {t('cert_verification.cancel_btn')}
                  </button>
                </div>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                />
              </div>
              {progress.filename && (
                <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {progress.filename}
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
              <XCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Results */}
          {results && (
            <div className="mt-8 space-y-6">
              {/* Summary */}
              <div className="bg-gradient-to-br from-slate-50 to-indigo-50 rounded-xl p-6 border border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-indigo-600" />
                  {t('cert_verification.summary')}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center bg-white rounded-xl p-4 shadow-sm border border-slate-100">
                    <div className="text-3xl font-bold text-slate-800">{results.summary?.total || 0}</div>
                    <div className="text-sm text-slate-500 mt-1">{t('cert_verification.total')}</div>
                  </div>
                  <div className="text-center bg-white rounded-xl p-4 shadow-sm border border-green-100">
                    <div className="text-3xl font-bold text-green-600">{results.summary?.valid || 0}</div>
                    <div className="text-sm text-slate-500 mt-1">{t('cert_verification.extracted')}</div>
                  </div>
                  <div className="text-center bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
                    <div className="text-3xl font-bold text-yellow-600">{results.summary?.expired || 0}</div>
                    <div className="text-sm text-slate-500 mt-1">{t('cert_verification.expired')}</div>
                  </div>
                  <div className="text-center bg-white rounded-xl p-4 shadow-sm border border-orange-100">
                    <div className="text-3xl font-bold text-orange-600">{results.summary?.mismatch || 0}</div>
                    <div className="text-sm text-slate-500 mt-1">{t('cert_verification.mismatch')}</div>
                  </div>
                  <div className="text-center bg-white rounded-xl p-4 shadow-sm border border-red-100">
                    <div className="text-3xl font-bold text-red-600">{(results.summary?.unreadable || 0) + (results.summary?.error || 0)}</div>
                    <div className="text-sm text-slate-500 mt-1">{t('cert_verification.unreadable')}</div>
                  </div>
                </div>
              </div>

              {/* By Requirement */}
              {results.summary?.by_requirement && Object.keys(results.summary.by_requirement).length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-6 border border-indigo-100">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    {t('cert_verification.by_requirement')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {Object.entries(results.summary.by_requirement).map(([req, data]) => (
                      <div key={req} className="bg-white rounded-lg p-3 shadow-sm border border-indigo-100">
                        <div className="font-medium text-slate-800 truncate" title={req}>{req}</div>
                        <div className="text-sm text-slate-500">
                          {data.valid}/{data.total} {t('cert_verification.valid_label')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detail Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 md:px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-wrap justify-between items-center gap-4">
                  <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-600" />
                    {t('cert_verification.file_detail')} ({filteredResults.length}/{results.results?.length || 0})
                  </h3>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Filters */}
                    <div className="flex items-center gap-2">
                      <Filter className="w-4 h-4 text-slate-400" />
                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 bg-white"
                      >
                        <option value="">{t('cert_verification.all_statuses')}</option>
                        <option value="valid">{t('cert_verification.status_valid')}</option>
                        <option value="expired">{t('cert_verification.status_expired')}</option>
                        <option value="mismatch">{t('cert_verification.status_mismatch')}</option>
                        <option value="unreadable">{t('cert_verification.status_unreadable')}</option>
                        <option value="error">{t('cert_verification.status_error')}</option>
                      </select>
                    </div>
                    <input
                      type="text"
                      placeholder={t('cert_verification.filter_req_placeholder')}
                      value={filterReq}
                      onChange={(e) => setFilterReq(e.target.value)}
                      className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 w-32"
                    />
                    {(filterStatus || filterReq) && (
                      <button
                        onClick={() => { setFilterStatus(''); setFilterReq(''); }}
                        className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        {t('cert_verification.clear_filters')}
                      </button>
                    )}
                    <button
                      onClick={exportToExcel}
                      className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      {t('cert_verification.export_excel')}
                    </button>
                    <button
                      onClick={() => setColumnWidths(DEFAULT_COLUMN_WIDTHS)}
                      className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t('cert_verification.reset_columns')}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto" style={{ position: 'relative' }}>
                  <table ref={tableRef} className="divide-y divide-slate-200" style={{ minWidth: '100%', tableLayout: 'fixed' }}>
                    <thead className="bg-slate-50">
                      <tr>
                        <th style={{ width: columnWidths.file, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('filename')}>
                          {t('cert_verification.col_file')}<SortIcon field="filename" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'file')}
                          />
                        </th>
                        <th style={{ width: columnWidths.requisito, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('req_code')}>
                          {t('cert_verification.col_requisito')}<SortIcon field="req_code" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'requisito')}
                          />
                        </th>
                        <th style={{ width: columnWidths.certFile, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('cert_name_from_file')}>
                          {t('cert_verification.col_cert_file')}<SortIcon field="cert_name_from_file" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'certFile')}
                          />
                        </th>
                        <th style={{ width: columnWidths.certAttesa, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          {t('cert_verification.col_cert_expected')}
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'certAttesa')}
                          />
                        </th>
                        <th style={{ width: columnWidths.risorsa, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('resource_name')}>
                          {t('cert_verification.col_resource')}<SortIcon field="resource_name" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'risorsa')}
                          />
                        </th>
                        <th style={{ width: columnWidths.risorsaOcr, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          {t('cert_verification.col_resource_ocr')}
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'risorsaOcr')}
                          />
                        </th>
                        <th style={{ width: columnWidths.vendor, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('vendor_detected')}>
                          {t('cert_verification.col_vendor')}<SortIcon field="vendor_detected" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'vendor')}
                          />
                        </th>
                        <th style={{ width: columnWidths.certificazione, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('cert_name_detected')}>
                          {t('cert_verification.col_cert_ocr')}<SortIcon field="cert_name_detected" />
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'certificazione')}
                          />
                        </th>
                        <th style={{ width: columnWidths.validita, position: 'relative' }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                          {t('cert_verification.col_validity')}
                          <div
                            className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-indigo-500"
                            style={{ backgroundColor: 'transparent' }}
                            onMouseDown={(e) => handleResizeStart(e, 'validita')}
                          />
                        </th>
                        <th style={{ width: columnWidths.stato }} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100" onClick={() => handleSort('status')}>
                          {t('cert_verification.col_status')}<SortIcon field="status" />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {filteredResults.map((r, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                          <td style={{ width: columnWidths.file }} className="px-4 py-3 text-sm text-slate-900 overflow-hidden" title={r.filename}>
                            <div className="truncate">{r.filename}</div>
                          </td>
                          <td style={{ width: columnWidths.requisito }} className="px-4 py-3 text-sm text-slate-700 overflow-hidden">
                            <div className="truncate font-medium">{r.req_code || '-'}</div>
                          </td>
                          <td style={{ width: columnWidths.certFile }} className="px-4 py-3 text-sm text-purple-600 overflow-hidden" title={r.cert_name_from_file || ''}>
                            <div className="truncate">{r.cert_name_from_file || '-'}</div>
                          </td>
                          <td style={{ width: columnWidths.certAttesa }} className="px-4 py-3 text-sm text-indigo-600 overflow-hidden">
                            {r.expected_cert_names && r.expected_cert_names.length > 0 ? (
                              <div className="truncate" title={r.expected_cert_names.join(', ')}>
                                {r.expected_cert_names.join(', ')}
                              </div>
                            ) : '-'}
                          </td>
                          <td style={{ width: columnWidths.risorsa }} className="px-4 py-3 text-sm text-slate-700 overflow-hidden">
                            <div className="truncate">{r.resource_name || '-'}</div>
                          </td>
                          <td style={{ width: columnWidths.risorsaOcr }} className="px-4 py-3 text-sm text-indigo-600 overflow-hidden">
                            <div className="truncate" title={r.resource_name_detected || ''}>{r.resource_name_detected || '-'}</div>
                          </td>
                          <td style={{ width: columnWidths.vendor }} className="px-4 py-3 text-sm text-slate-700 overflow-hidden">
                            <div className="truncate">{r.vendor_detected || '-'}</div>
                          </td>
                          <td style={{ width: columnWidths.certificazione }} className="px-4 py-3 text-sm text-slate-700 overflow-hidden">
                            <div className="break-words">
                              {r.cert_name_detected && <div className="font-medium">{r.cert_name_detected}</div>}
                              {r.cert_code_detected && <div className="text-xs text-slate-500">{r.cert_code_detected}</div>}
                              {!r.cert_name_detected && !r.cert_code_detected && '-'}
                            </div>
                          </td>
                          <td style={{ width: columnWidths.validita }} className="px-4 py-3 text-sm text-slate-700 overflow-hidden">
                            {r.valid_from || r.valid_until ? (
                              <div className="text-xs">
                                {r.valid_from && <div className="truncate">{t('cert_verification.valid_from')}: {normalizeDate(r.valid_from)}</div>}
                                {r.valid_until && <div className="truncate">{t('cert_verification.valid_until')}: {normalizeDate(r.valid_until)}</div>}
                              </div>
                            ) : '-'}
                          </td>
                          <td style={{ width: columnWidths.stato }} className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || STATUS_COLORS.unprocessed}`}>
                                {t(`cert_verification.${STATUS_LABELS[r.status]}`) || r.status}
                              </span>
                              {(r.status === 'error' || r.status === 'unreadable') && (
                                <button
                                  onClick={() => handleRetry(r.filename)}
                                  disabled={retryingFile === r.filename}
                                  className={`text-xs px-2 py-0.5 rounded-lg transition-colors ${
                                    retryingFile === r.filename
                                      ? 'bg-slate-200 text-slate-400 cursor-wait'
                                      : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                  }`}
                                  title={t('cert_verification.retry_tooltip')}
                                >
                                  {retryingFile === r.filename ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Warning if any */}
              {results.warning && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  {results.warning}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
