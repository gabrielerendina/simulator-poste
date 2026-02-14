"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, Field, ConfigDict, field_validator
from typing import List, Dict, Any, Optional, Union
from datetime import datetime


class CompanyCert(BaseModel):
    """Company certification with points value"""
    label: str
    points: float  # max_points (raw score when ALL have the cert)
    points_partial: float = 0.0  # points when at least one (but not all) RTI members have the cert
    gara_weight: float = 0.0  # weight for weighted score calculation


class SubReq(BaseModel):
    """Sub-requirement or criteria for evaluation"""
    id: str
    label: str
    weight: float = 1.0


class Requirement(BaseModel):
    """Requirement in a lot configuration"""
    id: str
    label: str
    type: str  # "resource", "reference", "project"
    max_points: float  # max raw score for this requirement
    gara_weight: float = 0.0  # weight for weighted score calculation (gara points)
    prof_R: Optional[int] = None
    prof_C: Optional[int] = None
    max_res: Optional[int] = None
    max_certs: Optional[int] = None
    bonus_label: Optional[str] = None
    bonus_val: Optional[float] = 0.0
    sub_reqs: Optional[List[Dict[str, Any]]] = None
    criteria: Optional[List[Dict[str, Any]]] = None
    selected_prof_certs: Optional[List[str]] = Field(default_factory=list)
    attestazione_label: Optional[str] = None
    attestazione_score: Optional[float] = 0.0
    custom_metrics: Optional[List[Dict[str, Any]]] = None  # [{id, label, min, max}]

    model_config = ConfigDict(from_attributes=True)


class LotConfig(BaseModel):
    """Configuration for a tender lot"""
    name: str
    base_amount: float
    max_tech_score: float = 60.0
    max_econ_score: float = 40.0
    max_raw_score: float = 0.0
    alpha: float = 0.3
    economic_formula: str = "interp_alpha"
    company_certs: List[Dict[str, Any]] = Field(default_factory=list)
    reqs: List[Dict[str, Any]] = Field(default_factory=list)
    state: Optional[Dict[str, Any]] = Field(default_factory=dict)
    rti_enabled: bool = False  # Whether this lot is an RTI (joint venture)
    rti_companies: List[str] = Field(default_factory=list)  # RTI partner companies (excludes Lutech)
    rti_quotas: Dict[str, float] = Field(default_factory=dict)  # Company quotas: {"Lutech": 70, "Partner1": 30, ...}
    is_active: bool = True  # Whether lot is active (True) or closed (False)

    model_config = ConfigDict(from_attributes=True)


class SimulationState(BaseModel):
    """State of a simulation for a specific lot"""
    my_discount: float = 0.0
    competitor_discount: float = 30.0
    competitor_tech_score: float = 60.0
    competitor_econ_discount: float = 30.0
    tech_inputs: Dict[str, Any] = Field(default_factory=dict)
    company_certs: Dict[str, Any] = Field(default_factory=dict)  # label -> "all"|"partial"|"none" or legacy bool

    @field_validator('company_certs', mode='before')
    @classmethod
    def convert_legacy_certs(cls, v):
        """Convert legacy boolean format to new string format"""
        if not v:
            return {}
        result = {}
        for label, value in v.items():
            if isinstance(value, bool):
                # Convert old boolean to new string: True -> "all", False -> "none"
                result[label] = "all" if value else "none"
            elif isinstance(value, str):
                result[label] = value
            else:
                result[label] = "none"
        return result


class TechInput(BaseModel):
    """Technical input for a requirement"""
    req_id: str
    r_val: Optional[int] = 0
    c_val: Optional[int] = 0
    sub_req_vals: Optional[List[Dict[str, Any]]] = None
    bonus_active: Optional[bool] = False
    attestazione_active: Optional[bool] = False
    custom_metric_vals: Optional[Dict[str, float]] = None # {metric_id: value}


class CalculateRequest(BaseModel):
    """Request to calculate scores"""
    lot_key: str
    base_amount: float = Field(gt=0, description="Base amount must be greater than 0")
    competitor_discount: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    my_discount: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    tech_inputs: List[TechInput]
    company_certs_status: Dict[str, Any] = Field(default_factory=dict)  # label -> "all"|"partial"|"none" or legacy bool

    @field_validator('company_certs_status', mode='before')
    @classmethod
    def convert_legacy_certs_status(cls, v):
        """Convert legacy boolean format to new string format"""
        if not v:
            return {}
        result = {}
        for label, value in v.items():
            if isinstance(value, bool):
                # Convert old boolean to new string: True -> "all", False -> "none"
                result[label] = "all" if value else "none"
            elif isinstance(value, str):
                result[label] = value
            else:
                result[label] = "none"
        return result


class SimulationRequest(BaseModel):
    """Request to run simulation"""
    lot_key: str
    base_amount: float = Field(gt=0, description="Base amount must be greater than 0")
    competitor_discount: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    my_discount: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    current_tech_score: float = Field(ge=0, description="Technical score must be non-negative")


class MonteCarloRequest(BaseModel):
    """Request to run Monte Carlo simulation"""
    lot_key: str
    base_amount: float = Field(gt=0, description="Base amount must be greater than 0")
    my_discount: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    competitor_discount_mean: float = Field(ge=0, le=100, description="Discount must be between 0 and 100")
    competitor_discount_std: float = Field(ge=0, default=3.5, description="Standard deviation of competitor discount (default: 3.5% based on typical market variance)")
    current_tech_score: float = Field(ge=0, description="Technical score must be non-negative")
    competitor_tech_score_mean: Optional[float] = Field(default=None, ge=0, description="Competitor tech score mean (if None, uses 90% of max)")
    competitor_tech_score_std: float = Field(default=3.0, ge=0, description="Standard deviation of competitor tech score (default: 3.0 points based on typical variance)")
    iterations: int = Field(ge=1, le=10000, default=500, description="Iterations must be between 1 and 10000")


class OptimizeDiscountRequest(BaseModel):
    """Request to optimize discount against specific competitor"""
    lot_key: str
    base_amount: float = Field(gt=0, description="Base amount must be greater than 0")
    my_tech_score: float = Field(ge=0, description="My technical score")
    competitor_tech_score: float = Field(ge=0, description="Competitor technical score")
    competitor_discount: float = Field(ge=0, le=100, description="Competitor discount %")
    best_offer_discount: float = Field(ge=0, le=100, description="Best offer discount % from market")


class ExportPDFRequest(BaseModel):
    """Request to export PDF report - mirrors ExportExcelRequest for consistency"""
    lot_key: str
    base_amount: float
    technical_score: float
    economic_score: float
    total_score: float
    my_discount: float
    competitor_discount: float
    alpha: float = 0.3
    win_probability: float = 50.0
    details: Dict[str, float] = Field(default_factory=dict)
    weighted_scores: Dict[str, float] = Field(default_factory=dict)
    category_scores: Dict[str, float] = Field(default_factory=dict)  # {company_certs, resource, reference, project}
    max_tech_score: float = 60.0
    max_econ_score: float = 40.0
    tech_inputs_full: Dict[str, Any] = Field(default_factory=dict)
    rti_quotas: Dict[str, float] = Field(default_factory=dict)  # Company quotas for RTI


class ExportExcelRequest(BaseModel):
    """Request to export Excel report"""
    lot_key: str
    base_amount: float
    technical_score: float
    economic_score: float
    total_score: float
    my_discount: float
    competitor_discount: float
    alpha: float = 0.3
    win_probability: float = 50.0
    details: Dict[str, float] = Field(default_factory=dict)
    weighted_scores: Dict[str, float] = Field(default_factory=dict)
    category_scores: Dict[str, float] = Field(default_factory=dict)  # {company_certs, resource, reference, project}
    max_tech_score: float = 60.0
    max_econ_score: float = 40.0
    tech_inputs_full: Dict[str, Any] = Field(default_factory=dict)  # Full tech inputs with cert_company_counts, assigned_company
    rti_quotas: Dict[str, float] = Field(default_factory=dict)  # Company quotas for RTI


class MasterData(BaseModel):
    """Master data shared across all lots"""
    company_certs: List[str] = Field(default_factory=list)
    prof_certs: List[str] = Field(default_factory=list)
    requirement_labels: List[str] = Field(default_factory=list)
    economic_formulas: Optional[List[Dict[str, Any]]] = None
    rti_partners: List[str] = Field(default_factory=list)  # Available RTI partner companies (excludes Lutech)

    model_config = ConfigDict(from_attributes=True)


class VendorConfig(BaseModel):
    """Configuration for a certification vendor"""
    key: str = Field(..., description="Unique identifier e.g. 'uipath', 'aws'")
    name: str = Field(..., description="Display name e.g. 'UiPath', 'Amazon Web Services'")
    aliases: List[str] = Field(default_factory=list, description="Alternative names for OCR matching")
    cert_patterns: List[str] = Field(default_factory=list, description="Regex patterns for cert names")
    enabled: bool = Field(default=True, description="Whether this vendor is active")

    model_config = ConfigDict(from_attributes=True)


class VendorConfigUpdate(BaseModel):
    """Update schema for vendor config (all fields optional)"""
    name: Optional[str] = None
    aliases: Optional[List[str]] = None
    cert_patterns: Optional[List[str]] = None
    enabled: Optional[bool] = None


class OCRSetting(BaseModel):
    """OCR configuration setting"""
    key: str = Field(..., description="Setting key")
    value: Optional[str] = Field(None, description="Setting value (JSON string for complex values)")
    description: Optional[str] = Field(None, description="Human readable description")

    model_config = ConfigDict(from_attributes=True)


class CertVerificationConfig(BaseModel):
    """Full certification verification configuration"""
    vendors: List[VendorConfig] = Field(default_factory=list)
    settings: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# Business Plan Schemas
# ============================================================================

class LutechProfileMix(BaseModel):
    """Mappatura di un singolo profilo Lutech con la sua percentuale nel mix."""
    lutech_profile: str = Field(..., description="ID del profilo Lutech")
    pct: float = Field(..., ge=0.0, le=100.0, description="Percentuale nel mix (0-100)")


class TimeVaryingMix(BaseModel):
    """Definisce un mix di profili Lutech per un dato periodo di tempo."""
    month_start: int = Field(default=1, description="Mese iniziale del periodo (1-based)")
    month_end: int = Field(default=36, description="Mese finale del periodo (1-based)")
    mix: List[LutechProfileMix] = Field(..., description="Lista dei profili Lutech nel mix")


class PracticeProfile(BaseModel):
    """Profilo all'interno di una Practice"""
    id: str
    label: str
    seniority: Optional[str] = None  # Opzionale per retrocompatibilità
    daily_rate: float = 0.0


class PracticeCreate(BaseModel):
    """Schema per creare una Practice"""
    id: str = Field(..., description="Identificativo univoco (es. 'data_ai')")
    label: str = Field(..., description="Nome visualizzato (es. 'Data & AI')")
    profiles: List[PracticeProfile] = Field(default_factory=list)


class PracticeResponse(BaseModel):
    """Schema di risposta per Practice"""
    id: str
    label: str
    profiles: List[Dict[str, Any]] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class ProfileCatalogCreate(BaseModel):
    """Schema per creare un profilo nel catalogo"""
    id: str
    label: str
    seniority: Optional[str] = None  # Opzionale
    daily_rate: float = 0.0
    practice_id: Optional[str] = None


class ProfileCatalogResponse(BaseModel):
    """Schema di risposta per profilo catalogo"""
    id: str
    label: str
    seniority: Optional[str] = None
    daily_rate: float
    practice_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class VolumeAdjustmentPeriod(BaseModel):
    """Rettifiche volumi per un periodo specifico"""
    month_start: int = Field(default=1, description="Mese iniziale (1-based)")
    month_end: int = Field(default=36, description="Mese finale (1-based)")
    by_tow: Dict[str, float] = Field(default_factory=dict)
    by_profile: Dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(populate_by_name=True)


class VolumeAdjustments(BaseModel):
    """Rettifiche volumi - supporta sia formato legacy che nuovo formato con periodi"""
    # Legacy format (per retrocompatibilità)
    by_tow: Optional[Dict[str, float]] = None
    by_profile: Optional[Dict[str, float]] = None

    # New format con periodi
    periods: Optional[List[VolumeAdjustmentPeriod]] = None

    model_config = ConfigDict(populate_by_name=True)


class SubcontractConfig(BaseModel):
    """Configurazione subappalto"""
    quota_pct: float = Field(default=0.0, ge=0.0, le=0.20)
    partner: Optional[str] = None
    tows: List[str] = Field(default_factory=list)


class BusinessPlanCreate(BaseModel):
    """Schema per creare/aggiornare un Business Plan"""
    duration_months: int = 36
    governance_pct: float = Field(default=0.10, ge=0.0, le=1.0)  # Decimali 0-1 (frontend invia /100)
    risk_contingency_pct: float = Field(default=0.05, ge=0.0, le=1.0)  # Decimali 0-1 (frontend invia /100)
    team_composition: List[Dict[str, Any]] = Field(default_factory=list)
    tows: List[Dict[str, Any]] = Field(default_factory=list)
    volume_adjustments: Dict[str, Any] = Field(default_factory=dict)
    reuse_factor: float = Field(default=0.0, ge=0.0, le=1.0)  # Decimali 0-1 (frontend invia /100)
    tow_assignments: Dict[str, str] = Field(default_factory=dict)
    profile_mappings: Dict[str, List[TimeVaryingMix]] = Field(default_factory=dict)
    subcontract_config: Dict[str, Any] = Field(default_factory=dict)


class BusinessPlanResponse(BaseModel):
    """Schema di risposta per Business Plan"""
    id: int
    lot_key: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    duration_months: int = 36
    governance_pct: float = 0.10
    risk_contingency_pct: float = 0.05
    team_composition: List[Dict[str, Any]] = Field(default_factory=list)
    tows: List[Dict[str, Any]] = Field(default_factory=list)
    volume_adjustments: Dict[str, Any] = Field(default_factory=dict)
    reuse_factor: float = 0.0
    tow_assignments: Dict[str, str] = Field(default_factory=dict)
    profile_mappings: Dict[str, List[TimeVaryingMix]] = Field(default_factory=dict)
    subcontract_config: Dict[str, Any] = Field(default_factory=dict)
    tow_costs: Dict[str, float] = Field(default_factory=dict)
    tow_prices: Dict[str, float] = Field(default_factory=dict)
    total_cost: float = 0.0
    total_price: float = 0.0
    margin_pct: float = 0.0

    model_config = ConfigDict(from_attributes=True)


class BusinessPlanCalculateRequest(BaseModel):
    """Richiesta di calcolo costi/margine per un BP"""
    discount_pct: float = Field(default=0.0, ge=0.0, le=100.0)
    is_rti: bool = False
    quota_lutech: float = Field(default=1.0, ge=0.0, le=1.0)


class BusinessPlanCalculateResponse(BaseModel):
    """Risposta calcolo Business Plan"""
    team_cost: float = 0.0
    governance_cost: float = 0.0
    risk_cost: float = 0.0
    subcontract_cost: float = 0.0
    total_cost: float = 0.0
    total_revenue: float = 0.0
    margin: float = 0.0
    margin_pct: float = 0.0
    tow_breakdown: Dict[str, Any] = Field(default_factory=dict)
    savings_pct: float = 0.0
