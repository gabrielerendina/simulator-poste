"""
Pydantic schemas for request/response validation
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional


class CompanyCert(BaseModel):
    """Company certification with points value"""
    label: str
    points: float  # max_points (raw score max)
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

    model_config = ConfigDict(from_attributes=True)


class SimulationState(BaseModel):
    """State of a simulation for a specific lot"""
    my_discount: float = 0.0
    competitor_discount: float = 30.0
    tech_inputs: Dict[str, Any] = Field(default_factory=dict)
    company_certs: Dict[str, bool] = Field(default_factory=dict)


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
    selected_company_certs: List[str] = Field(default_factory=list)


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
    competitor_discount_std: float = Field(ge=0, default=3.5, description="Standard deviation must be non-negative")
    current_tech_score: float = Field(ge=0, description="Technical score must be non-negative")
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
    """Request to export PDF report"""
    lot_key: str
    base_amount: float
    technical_score: float
    economic_score: float
    total_score: float
    my_discount: float
    competitor_discount: float
    avg_total_score: float = 0.0
    details: Dict[str, float] = Field(default_factory=dict)
    weighted_scores: Dict[str, float] = Field(default_factory=dict)  # Weighted scores per requirement
    category_company_certs: float = 0.0
    category_resource: float = 0.0
    category_reference: float = 0.0
    category_project: float = 0.0
    max_tech_score: float = 60.0
    max_econ_score: float = 40.0
    max_raw_score: float = 0.0


class MasterData(BaseModel):
    """Master data shared across all lots"""
    company_certs: List[str] = Field(default_factory=list)
    prof_certs: List[str] = Field(default_factory=list)
    requirement_labels: List[str] = Field(default_factory=list)
    economic_formulas: Optional[List[Dict[str, Any]]] = None

    model_config = ConfigDict(from_attributes=True)
