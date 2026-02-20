import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Plus, Trash2, ShieldCheck, Award, Info, Settings, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Search, Save, AlertCircle, Check, Building2 } from 'lucide-react';
import { API_URL } from '../utils/api';
import { useConfig } from '../features/config/context/ConfigContext';
import { logger } from '../utils/logger';

export default function MasterDataConfig() {
    const { t } = useTranslation();
    const { refetch: refetchConfig } = useConfig();
    const [data, setData] = useState({
        company_certs: [],
        prof_certs: [],
        requirement_labels: [],
        rti_partners: []
    });
    const [vendors, setVendors] = useState([]);
    const [expandedVendor, setExpandedVendor] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeSection, setActiveSection] = useState('company_certs');
    const [vendorSearch, setVendorSearch] = useState('');
    const [toast, setToast] = useState(null); // {type: 'success'|'error', message: string}
    const [showAddVendor, setShowAddVendor] = useState(false);
    const [newVendor, setNewVendor] = useState({ key: '', name: '' });
    
    // Refs for controlled inputs (fix #11)
    const aliasInputRefs = useRef({});
    const patternInputRefs = useRef({});

    const showToast = (type, message) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 3000);
    };

    // Auto-save master data when it changes (debounced)
    const saveTimeoutRef = useRef(null);
    const saveMasterData = useCallback(async (newData) => {
        try {
            await axios.post(`${API_URL}/master-data`, newData);
            showToast('success', t('master.saved'));
            // Refresh ConfigContext so other components (TechEvaluator) get updated masterData
            if (refetchConfig) refetchConfig();
        } catch (error) {
            logger.error('Error saving master data', error);
            showToast('error', `${t('master.error_prefix')}: ${error.response?.data?.detail || error.message}`);
        }
    }, [refetchConfig]);

    useEffect(() => {
        // Skip initial load
        if (loading) return;
        
        // Debounce save
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        saveTimeoutRef.current = setTimeout(() => {
            saveMasterData(data);
        }, 500);
        
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [data, loading, saveMasterData]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [masterRes, vendorRes] = await Promise.all([
                    axios.get(`${API_URL}/master-data`),
                    axios.get(`${API_URL}/vendor-configs`).catch(() => ({ data: [] }))
                ]);
                // De-duplicate arrays on load to clean up any existing duplicates
                const cleanedData = {
                    ...masterRes.data,
                    company_certs: masterRes.data.company_certs ? [...new Set(masterRes.data.company_certs)] : [],
                    prof_certs: masterRes.data.prof_certs ? [...new Set(masterRes.data.prof_certs)] : [],
                    requirement_labels: masterRes.data.requirement_labels ? [...new Set(masterRes.data.requirement_labels)] : [],
                    rti_partners: masterRes.data.rti_partners ? [...new Set(masterRes.data.rti_partners)] : [],
                };
                setData(cleanedData);
                setVendors(vendorRes.data || []);
            } catch (error) {
                logger.error('Error fetching master data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const addItem = (section) => {
        const newItem = section === 'economic_formulas'
            ? { id: `formula_${Date.now()}`, label: t('master.new_formula'), desc: "P = $P_{max} \\times ..." }
            : "";
        setData(prev => ({
            ...prev,
            [section]: [...prev[section], newItem]
        }));
    };

    const updateItem = (section, idx, fieldOrVal, val) => {
        const newList = [...data[section]];
        if (section === 'economic_formulas') {
            newList[idx] = { ...newList[idx], [fieldOrVal]: val };
        } else {
            newList[idx] = fieldOrVal;
        }
        setData(prev => ({
            ...prev,
            [section]: newList
        }));
    };

    const deleteItem = (section, idx) => {
        const newList = [...data[section]];
        newList.splice(idx, 1);
        setData(prev => ({
            ...prev,
            [section]: newList
        }));
    };

    // Vendor management functions
    const toggleVendorEnabled = async (vendorKey) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor) return;
        
        try {
            await axios.put(`${API_URL}/vendor-configs/${vendorKey}`, {
                enabled: !vendor.enabled
            });
            setVendors(prev => prev.map(v => 
                v.key === vendorKey ? { ...v, enabled: !v.enabled } : v
            ));
            showToast('success', `${vendor.name} ${!vendor.enabled ? 'abilitato' : 'disabilitato'}`);
        } catch (error) {
            logger.error('Error toggling vendor', error);
            showToast('error', `${t('master.error_prefix')}: ${error.response?.data?.detail || error.message}`);
        }
    };

    const updateVendorField = async (vendorKey, field, value) => {
        try {
            await axios.put(`${API_URL}/vendor-configs/${vendorKey}`, {
                [field]: value
            });
            setVendors(prev => prev.map(v => 
                v.key === vendorKey ? { ...v, [field]: value } : v
            ));
            showToast('success', t('master.saved'));
        } catch (error) {
            logger.error('Error updating vendor', error);
            showToast('error', `${t('master.error_prefix')}: ${error.response?.data?.detail || error.message}`);
        }
    };

    const addVendorAlias = (vendorKey, alias) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor || !alias.trim()) return;
        const newAliases = [...(vendor.aliases || []), alias.trim().toLowerCase()];
        updateVendorField(vendorKey, 'aliases', newAliases);
    };

    const removeVendorAlias = (vendorKey, aliasIdx) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor) return;
        const newAliases = vendor.aliases.filter((_, i) => i !== aliasIdx);
        updateVendorField(vendorKey, 'aliases', newAliases);
    };

    const addVendorPattern = (vendorKey, pattern) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor || !pattern.trim()) return;
        
        // Validate regex pattern before adding (fix #4)
        try {
            new RegExp(pattern.trim());
        } catch (e) {
            showToast('error', `Pattern regex non valido: ${e.message}`);
            return;
        }
        
        const newPatterns = [...(vendor.cert_patterns || []), pattern.trim()];
        updateVendorField(vendorKey, 'cert_patterns', newPatterns);
    };

    const removeVendorPattern = (vendorKey, patternIdx) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor) return;
        const newPatterns = vendor.cert_patterns.filter((_, i) => i !== patternIdx);
        updateVendorField(vendorKey, 'cert_patterns', newPatterns);
    };

    // Create new vendor (fix #5)
    const createVendor = async () => {
        if (!newVendor.key.trim() || !newVendor.name.trim()) {
            showToast('error', 'Inserisci chiave e nome del vendor');
            return;
        }
        
        // Validate key format (fix #8): only lowercase, numbers, underscores
        const normalizedKey = newVendor.key.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        if (normalizedKey.length < 2) {
            showToast('error', 'La chiave deve contenere almeno 2 caratteri alfanumerici');
            return;
        }
        if (vendors.some(v => v.key === normalizedKey)) {
            showToast('error', `Vendor con chiave "${normalizedKey}" già esistente`);
            return;
        }
        
        try {
            const response = await axios.post(`${API_URL}/vendor-configs`, {
                key: normalizedKey,
                name: newVendor.name,
                aliases: [normalizedKey],
                cert_patterns: [],
                enabled: true
            });
            setVendors(prev => [...prev, response.data]);
            setNewVendor({ key: '', name: '' });
            setShowAddVendor(false);
            showToast('success', `Vendor "${newVendor.name}" creato`);
        } catch (error) {
            logger.error('Error creating vendor', error);
            showToast('error', `${t('master.error_prefix')}: ${error.response?.data?.detail || error.message}`);
        }
    };

    // Delete vendor (fix #6)
    const deleteVendor = async (vendorKey) => {
        const vendor = vendors.find(v => v.key === vendorKey);
        if (!vendor) return;
        
        if (!window.confirm(`Eliminare il vendor "${vendor.name}"? Questa azione non può essere annullata.`)) {
            return;
        }
        
        try {
            await axios.delete(`${API_URL}/vendor-configs/${vendorKey}`);
            setVendors(prev => prev.filter(v => v.key !== vendorKey));
            setExpandedVendor(null);
            
            // Clean up refs for deleted vendor (fix #11)
            delete aliasInputRefs.current[vendorKey];
            delete patternInputRefs.current[vendorKey];
            
            showToast('success', `Vendor "${vendor.name}" eliminato`);
        } catch (error) {
            logger.error('Error deleting vendor', error);
            showToast('error', `${t('master.error_prefix')}: ${error.response?.data?.detail || error.message}`);
        }
    };

    // Filter vendors by search (fix #18)
    const filteredVendors = vendors.filter(v => 
        !vendorSearch || 
        v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        v.key.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        v.aliases?.some(a => a.includes(vendorSearch.toLowerCase()))
    );

    if (loading) return <div className="p-10 text-center">{t('common.loading')}</div>;

    const sections = [
        { id: 'company_certs', label: t('master.company_certs'), icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        { id: 'prof_certs', label: t('master.prof_certs'), icon: Award, color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'rti_partners', label: t('master.rti_partners'), icon: Building2, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { id: 'economic_formulas', label: t('config.economic_formula'), icon: Info, color: 'text-orange-600', bg: 'bg-orange-50' },
        { id: 'ocr_settings', label: t('master.ocr_settings'), icon: Settings, color: 'text-purple-600', bg: 'bg-purple-50' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-6 overflow-auto pb-32">
            {/* Toast notification (fix #15) */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all ${
                    toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}>
                    {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    <span className="text-sm font-medium">{toast.message}</span>
                </div>
            )}
            
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('master.title')}</h1>
                        <p className="text-slate-500">{t('master.subtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Sidebar Tabs */}
                    <div className="md:col-span-1 space-y-1">
                        {sections.map(s => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${activeSection === s.id
                                    ? `${s.bg.replace('bg-', 'border-')} ${s.bg} font-semibold ${s.color}`
                                    : 'border-transparent text-slate-600 hover:bg-slate-100'}`}
                            >
                                <s.icon className={`w-5 h-5 ${activeSection === s.id ? s.color : 'text-slate-400'}`} />
                                <span className="text-sm">{s.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="md:col-span-3">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-semibold text-slate-800">
                                    {sections.find(s => s.id === activeSection)?.label}
                                </h2>
                                {activeSection !== 'ocr_settings' && (
                                    <button
                                        onClick={() => addItem(activeSection)}
                                        className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        {t('master.add_item')}
                                    </button>
                                )}
                            </div>

                            {/* OCR Settings Section */}
                            {activeSection === 'ocr_settings' ? (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-600 mb-4">
                                        {t('master.ocr_settings_desc')}
                                    </p>
                                    
                                    {/* Search and Add buttons (fix #5, #18) */}
                                    <div className="flex gap-2 mb-4">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder={t('master.search_vendor')}
                                                value={vendorSearch}
                                                onChange={(e) => setVendorSearch(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setShowAddVendor(!showAddVendor)}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 text-sm font-medium"
                                        >
                                            <Plus className="w-4 h-4" />
                                            {t('master.new_vendor')}
                                        </button>
                                    </div>
                                    
                                    {/* Add Vendor Form (fix #5) */}
                                    {showAddVendor && (
                                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg mb-4">
                                            <h4 className="font-medium text-purple-800 mb-3">Nuovo Vendor</h4>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 uppercase">Chiave (es: "uipath")</label>
                                                    <input
                                                        type="text"
                                                        value={newVendor.key}
                                                        onChange={(e) => setNewVendor(prev => ({ ...prev, key: e.target.value }))}
                                                        placeholder="vendor_key"
                                                        className="w-full mt-1 p-2 border border-slate-200 rounded text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-600 uppercase">Nome (es: "UiPath")</label>
                                                    <input
                                                        type="text"
                                                        value={newVendor.name}
                                                        onChange={(e) => setNewVendor(prev => ({ ...prev, name: e.target.value }))}
                                                        placeholder="Nome Vendor"
                                                        className="w-full mt-1 p-2 border border-slate-200 rounded text-sm"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-3">
                                                <button
                                                    onClick={createVendor}
                                                    className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                                                >
                                                    Crea Vendor
                                                </button>
                                                <button
                                                    onClick={() => { setShowAddVendor(false); setNewVendor({ key: '', name: '' }); }}
                                                    className="px-4 py-2 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
                                                >
                                                    Annulla
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {filteredVendors.length > 0 ? (
                                        filteredVendors.map((vendor) => (
                                            <div key={vendor.key} className="border border-purple-200 rounded-lg bg-purple-50/50 overflow-hidden">
                                                {/* Vendor Header */}
                                                <div 
                                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-purple-100/50 transition-colors"
                                                    onClick={() => setExpandedVendor(expandedVendor === vendor.key ? null : vendor.key)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); toggleVendorEnabled(vendor.key); }}
                                                            className={`transition-colors ${vendor.enabled ? 'text-purple-600' : 'text-slate-400'}`}
                                                            title={vendor.enabled ? 'Disabilita' : 'Abilita'}
                                                        >
                                                            {vendor.enabled ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                                                        </button>
                                                        <div>
                                                            <span className={`font-semibold ${vendor.enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                                                                {vendor.name}
                                                            </span>
                                                            <span className="text-xs text-slate-500 ml-2">({vendor.key})</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded">
                                                            {vendor.aliases?.length || 0} alias
                                                        </span>
                                                        <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
                                                            {vendor.cert_patterns?.length || 0} pattern
                                                        </span>
                                                        {expandedVendor === vendor.key ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                                    </div>
                                                </div>
                                                
                                                {/* Expanded Content */}
                                                {expandedVendor === vendor.key && (
                                                    <div className="border-t border-purple-200 p-4 bg-white space-y-4">
                                                        {/* Aliases */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                                                                Alias (nomi alternativi per riconoscimento)
                                                            </label>
                                                            <div className="flex flex-wrap gap-2 mb-2">
                                                                {vendor.aliases?.map((alias, idx) => (
                                                                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                                                                        {alias}
                                                                        <button
                                                                            onClick={() => removeVendorAlias(vendor.key, idx)}
                                                                            className="hover:text-red-600"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    ref={el => aliasInputRefs.current[vendor.key] = el}
                                                                    type="text"
                                                                    placeholder="Nuovo alias..."
                                                                    className="flex-1 p-2 border border-slate-200 rounded text-sm"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                                                            addVendorAlias(vendor.key, e.target.value);
                                                                            e.target.value = '';
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        const input = aliasInputRefs.current[vendor.key];
                                                                        if (input && input.value.trim()) {
                                                                            addVendorAlias(vendor.key, input.value);
                                                                            input.value = '';
                                                                        }
                                                                    }}
                                                                    className="px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Cert Patterns */}
                                                        <div>
                                                            <label className="block text-xs font-bold text-slate-600 uppercase mb-2">
                                                                Pattern Certificazioni (regex per riconoscimento)
                                                            </label>
                                                            <div className="space-y-1 mb-2">
                                                                {vendor.cert_patterns?.map((pattern, idx) => (
                                                                    <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded">
                                                                        <code className="flex-1 text-xs font-mono text-blue-700">{pattern}</code>
                                                                        <button
                                                                            onClick={() => removeVendorPattern(vendor.key, idx)}
                                                                            className="text-slate-400 hover:text-red-600"
                                                                        >
                                                                            <Trash2 className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    ref={el => patternInputRefs.current[vendor.key] = el}
                                                                    type="text"
                                                                    placeholder="Nuovo pattern regex..."
                                                                    className="flex-1 p-2 border border-slate-200 rounded text-sm font-mono"
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && e.target.value.trim()) {
                                                                            addVendorPattern(vendor.key, e.target.value);
                                                                            e.target.value = '';
                                                                        }
                                                                    }}
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        const input = patternInputRefs.current[vendor.key];
                                                                        if (input && input.value.trim()) {
                                                                            addVendorPattern(vendor.key, input.value);
                                                                            input.value = '';
                                                                        }
                                                                    }}
                                                                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                                                                >
                                                                    <Plus className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Delete Vendor (fix #6) */}
                                                        <div className="pt-4 border-t border-slate-200">
                                                            <button
                                                                onClick={() => deleteVendor(vendor.key)}
                                                                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded text-sm hover:bg-red-100 flex items-center gap-2"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                                Elimina Vendor
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-12 border-2 border-dashed border-purple-200 rounded-xl">
                                            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Settings className="w-6 h-6 text-purple-400" />
                                            </div>
                                            <p className="text-slate-500 text-sm">
                                                {vendorSearch ? 'Nessun vendor trovato' : 'Nessun vendor configurato'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Original sections content */
                                <div className="space-y-3">
                                {data[activeSection] && data[activeSection].length > 0 ? (
                                    data[activeSection].map((item, idx) => (
                                        <div key={idx} className={`flex gap-3 items-center group p-3 rounded-lg border ${sections.find(s => s.id === activeSection)?.bg} ${sections.find(s => s.id === activeSection)?.bg.replace('bg-', 'border-')}`}>
                                            <div className="flex-1">
                                                {activeSection === 'economic_formulas' ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">{t('master.label')}</label>
                                                            <input
                                                                type="text"
                                                                value={item.label}
                                                                onChange={(e) => updateItem(activeSection, idx, 'label', e.target.value)}
                                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">{t('master.formula_description')}</label>
                                                            <input
                                                                type="text"
                                                                value={item.desc}
                                                                onChange={(e) => updateItem(activeSection, idx, 'desc', e.target.value)}
                                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
                                                            />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <input
                                                        type="text"
                                                        value={item}
                                                        onChange={(e) => updateItem(activeSection, idx, e.target.value)}
                                                        className="w-full p-2 bg-white/50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                        placeholder={t('master.item_placeholder')}
                                                    />
                                                )}
                                            </div>
                                            <button
                                                onClick={() => deleteItem(activeSection, idx)}
                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-100 rounded-lg transition-colors"
                                                title={t('common.delete')}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl">
                                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Info className="w-6 h-6 text-slate-400" />
                                        </div>
                                        <p className="text-slate-500 text-sm">{t('master.no_items')}</p>
                                    </div>
                                )}
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
