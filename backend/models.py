"""
SQLAlchemy database models for Poste Tender Simulator
"""

from sqlalchemy import Column, String, Float, JSON, Text
from sqlalchemy.dialects.sqlite import JSON as SQLiteJSON
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
    rti_companies = Column(SQLiteJSON, default=list)  # RTI partner companies for assignments


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
