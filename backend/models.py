"""
SQLAlchemy database models for Poste Tender Simulator
"""

from sqlalchemy import Column, String, Float, JSON, Text
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
from .database import Base


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
