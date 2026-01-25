import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Save, Plus, Trash2, ShieldCheck, Award, Tag, Info } from 'lucide-react';
import { useToast } from '../shared/components/ui/Toast';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function MasterDataConfig({ onBack }) {
    const { t } = useTranslation();
    const { success, error: showError } = useToast();
    const [data, setData] = useState({
        company_certs: [],
        prof_certs: [],
        requirement_labels: []
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeSection, setActiveSection] = useState('company_certs');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get(`${API_URL}/master-data`);
                setData(res.data);
            } catch (error) {
                console.error("Error fetching master data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await axios.post(`${API_URL}/master-data`, data);
            success(t('master.save_success') || 'Master Data salvati con successo');
        } catch (error) {
            console.error("Error saving master data:", error);
            showError(t('common.error') || 'Errore durante il salvataggio');
        } finally {
            setSaving(false);
        }
    };

    const addItem = (section) => {
        const newItem = section === 'economic_formulas'
            ? { id: `formula_${Date.now()}`, label: "Nuova Formula", desc: "P = $P_{max} \\times ..." }
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

    if (loading) return <div className="p-10 text-center">{t('common.loading')}</div>;

    const sections = [
        { id: 'company_certs', label: t('master.company_certs'), icon: ShieldCheck, color: 'text-purple-600', bg: 'bg-purple-50' },
        { id: 'prof_certs', label: t('master.prof_certs'), icon: Award, color: 'text-blue-600', bg: 'bg-blue-50' },
        { id: 'requirement_labels', label: t('master.req_labels'), icon: Tag, color: 'text-green-600', bg: 'bg-green-50' },
        { id: 'economic_formulas', label: t('config.economic_formula'), icon: Info, color: 'text-orange-600', bg: 'bg-orange-50' },
    ];

    return (
        <div className="min-h-screen bg-slate-50 p-6 overflow-auto pb-32">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('master.title')}</h1>
                        <p className="text-slate-500">{t('master.subtitle')}</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onBack}
                            className="px-6 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                        >
                            {t('common.back')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-slate-800 text-white px-6 py-2 rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 shadow-sm text-sm font-medium disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? t('common.loading') : t('common.save')}
                        </button>
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
                                <button
                                    onClick={() => addItem(activeSection)}
                                    className="px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors flex items-center gap-2 text-sm font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    {t('master.add_item')}
                                </button>
                            </div>

                            <div className="space-y-3">
                                {data[activeSection] && data[activeSection].length > 0 ? (
                                    data[activeSection].map((item, idx) => (
                                        <div key={idx} className={`flex gap-3 items-center group p-3 rounded-lg border ${sections.find(s => s.id === activeSection)?.bg} ${sections.find(s => s.id === activeSection)?.bg.replace('bg-','border-')}`}>
                                            <div className="flex-1">
                                                {activeSection === 'economic_formulas' ? (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Etichetta</label>
                                                            <input
                                                                type="text"
                                                                value={item.label}
                                                                onChange={(e) => updateItem(activeSection, idx, 'label', e.target.value)}
                                                                className="w-full p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Descrizione Formula</label>
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
                                        <p className="text-slate-500 text-sm">Nessun elemento presente.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
