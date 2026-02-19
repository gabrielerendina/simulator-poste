"""
SQLAlchemy database models for Poste Tender Simulator
"""

from sqlalchemy import Column, String, Float, JSON, Text, Boolean, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from datetime import datetime
from database import Base


class LotConfigModel(Base):
    """
    Database model for Lot Configuration
    Stores all tender lot configurations and their state
    """

    __tablename__ = "lot_configs"

    name = Column(String(255), primary_key=True, index=True)
    base_amount = Column(Float, default=0.0)
    max_tech_score = Column(Float, default=60.0)
    max_econ_score = Column(Float, default=40.0)
    max_raw_score = Column(Float, default=0.0)
    alpha = Column(Float, default=0.3)
    economic_formula = Column(String(50), default="interp_alpha")

    # JSON fields for complex structures
    company_certs = Column(SQLiteJSON, default=list)
    reqs = Column(SQLiteJSON, default=list)
    state = Column(SQLiteJSON, default=dict)
    
    # RTI (joint venture) configuration
    rti_enabled = Column(Boolean, default=False)
    rti_companies = Column(SQLiteJSON, default=list)  # Partner companies (excludes Lutech)
    rti_quotas = Column(SQLiteJSON, default=dict)  # Company quotas: {"Lutech": 70, "Partner1": 30, ...}
    
    # Active/closed flag for filtering
    is_active = Column(Boolean, default=True)  # True = active, False = closed


class MasterDataModel(Base):
    """
    Database model for Master Data
    Stores shared reference data across all lots
    """

    __tablename__ = "master_data"

    id = Column(String(1), primary_key=True, default="1")
    company_certs = Column(SQLiteJSON, default=list)
    prof_certs = Column(SQLiteJSON, default=list)
    requirement_labels = Column(SQLiteJSON, default=list)
    economic_formulas = Column(SQLiteJSON, default=list)
    rti_partners = Column(SQLiteJSON, default=list)  # Available RTI partner companies (excludes Lutech)


class VendorConfigModel(Base):
    """
    Database model for Certification Vendor Configuration
    Stores vendor recognition patterns for OCR certificate verification
    """

    __tablename__ = "vendor_configs"

    key = Column(String(50), primary_key=True, index=True)  # e.g., "uipath", "aws"
    name = Column(String(255), nullable=False)  # e.g., "UiPath", "Amazon Web Services"
    aliases = Column(SQLiteJSON, default=list)  # Alternative names to match in OCR
    cert_patterns = Column(SQLiteJSON, default=list)  # Regex patterns for cert names
    enabled = Column(String(1), default="1")  # "1" = enabled, "0" = disabled


class OCRSettingsModel(Base):
    """
    Database model for OCR Settings
    Stores configurable settings for certificate verification
    """

    __tablename__ = "ocr_settings"

    key = Column(String(100), primary_key=True, index=True)
    value = Column(Text, nullable=True)
    description = Column(String(500), nullable=True)


# ============================================================================
# Business Plan Models
# ============================================================================

class PracticeModel(Base):
    """
    Practice interna Lutech.
    Ogni TOW viene assegnato a una Practice che ha il proprio catalogo profili/tariffe.
    """

    __tablename__ = "practices"

    id = Column(String(50), primary_key=True, index=True)  # e.g. "data_ai"
    label = Column(String(255), nullable=False)  # e.g. "Data & AI"
    profiles = Column(SQLiteJSON, default=list)  # [{id, label, seniority, daily_rate}]
    # NOTA: I profili sono gestiti come JSON dentro practices.profiles
    # La tabella profile_catalog è stata rimossa perché duplicata


class BusinessPlanModel(Base):
    """
    Business Plan per lotto.
    Contiene tutti i parametri di configurazione e i risultati calcolati.
    """

    __tablename__ = "business_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_key = Column(String(255), ForeignKey("lot_configs.name"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Parametri generali
    duration_months = Column(Integer, default=36)
    start_year = Column(Integer, nullable=True, default=None)  # Anno inizio contratto (es. 2026)
    start_month = Column(Integer, nullable=True, default=None)  # Mese inizio contratto (1-12)
    days_per_fte = Column(Float, default=220.0)
    default_daily_rate = Column(Float, default=250.0)
    governance_pct = Column(Float, default=0.04)
    risk_contingency_pct = Column(Float, default=0.03)

    # Da capitolato Poste (JSON)
    # [{profile_id, label, fte, days_year, tow_allocation: {tow_id: pct}}]
    team_composition = Column(SQLiteJSON, default=list)

    # [{tow_id, label, type, weight_pct, activities, deliverables}]
    tows = Column(SQLiteJSON, default=list)

    # Rettifica volumi
    # {"global": 0.90, "by_tow": {"TOW_02": 0.85}, "by_profile": {"PM": 0.50}}
    volume_adjustments = Column(SQLiteJSON, default=dict)

    # Fattore riuso
    reuse_factor = Column(Float, default=0.0)

    # Assegnazione TOW → Practice
    # {"TOW_01": "practice_data", "TOW_02": "practice_dev"}
    tow_assignments = Column(SQLiteJSON, default=dict)

    # Mapping profili Poste → Lutech (supporta ottimizzazione temporale)
    # Esempio:
    # {
    #   "Senior Developer": [
    #     {
    #       "period": "Anno 1",
    #       "mix": [{"lutech_profile": "dev_sr", "pct": 0.8}, {"lutech_profile": "dev_mid", "pct": 0.2}]
    #     },
    #     {
    #       "period": "Anno 2+",
    #       "mix": [{"lutech_profile": "dev_sr", "pct": 0.6}, {"lutech_profile": "dev_mid", "pct": 0.4}]
    #     }
    #   ]
    # }
    profile_mappings = Column(SQLiteJSON, default=dict)

    # Subappalto
    # {"quota_pct": 0.15, "partner": "PartnerX", "tows": ["TOW_03"]}
    subcontract_config = Column(SQLiteJSON, default=dict)

    # Governance: Mix profili Lutech per calcolo costo governance
    # Permette di definire il mix di profili per il team di governance anziché usare solo la %
    # Formato: [{"lutech_profile": "practice:profile_id", "pct": 50}, ...]
    # Calcolo: governance_fte * avg_rate * days * years
    # dove governance_fte = total_fte * governance_pct
    # e avg_rate = weighted average delle rate in base al mix
    # Se vuoto, usa fallback: team_cost * governance_pct
    governance_profile_mix = Column(SQLiteJSON, default=list)

    # Override manuale del costo governance
    # Se impostato, sovrascrive qualsiasi calcolo automatico
    governance_cost_manual = Column(Float, nullable=True, default=None)

    # Governance mode: 'percentage' | 'fte' | 'manual' | 'team_mix'
    # - percentage: usa governance_pct
    # - fte: usa governance_fte_periods
    # - manual: usa governance_cost_manual
    # - team_mix: usa governance_profile_mix
    governance_mode = Column(String(20), default='percentage')

    # Time slices per governance FTE
    # Formato: [{"month_start": 1, "month_end": 12, "fte": 2.0, "team_mix": [...]}]
    # Permette di variare FTE governance nel tempo
    governance_fte_periods = Column(SQLiteJSON, default=list)

    # Flag: applicare fattore riuso anche alla governance
    # Default False: governance non viene ridotta dal riuso
    governance_apply_reuse = Column(Boolean, default=False)

    # Soglie margine per visualizzazione e warning
    # margin_warning_threshold: soglia sotto la quale il margine è considerato a rischio (default 5%)
    # margin_success_threshold: soglia sopra la quale il margine è considerato buono (default 15%)
    margin_warning_threshold = Column(Float, default=0.05)  # 5%
    margin_success_threshold = Column(Float, default=0.15)  # 15%
    # Inflazione annua YoY applicata alle tariffe Lutech (es. 3.0 = 3%)
    inflation_pct = Column(Float, default=0.0)

    # NOTA: I campi tow_costs, tow_prices, total_cost, total_price, margin_pct
    # sono stati rimossi perché ora calcolati dinamicamente da calculate_team_cost()
