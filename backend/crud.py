"""
CRUD operations for database models
Handles creation, retrieval, and updating of lot configurations and master data
"""

from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
import json
import re
from pathlib import Path

import models, schemas
from vendor_defaults import DEFAULT_VENDORS


def validate_regex_pattern(pattern: str) -> bool:
    """Validate that a string is a valid regex pattern."""
    try:
        re.compile(pattern)
        return True
    except re.error:
        return False


def validate_regex_patterns(patterns: List[str]) -> List[str]:
    """
    Validate a list of regex patterns and return only valid ones.
    Logs invalid patterns.
    """
    valid, _ = validate_regex_patterns_detailed(patterns)
    return valid


def validate_regex_patterns_detailed(patterns: List[str]) -> Tuple[List[str], List[Dict[str, str]]]:
    """
    Validate a list of regex patterns and return both valid and invalid.
    
    Returns:
        Tuple of (valid_patterns, invalid_patterns_with_errors)
        where invalid_patterns_with_errors is a list of {"pattern": str, "error": str}
    """
    valid_patterns = []
    invalid_patterns = []
    
    for pattern in patterns:
        try:
            re.compile(pattern)
            valid_patterns.append(pattern)
        except re.error as e:
            invalid_patterns.append({"pattern": pattern, "error": str(e)})
            import logging
            logging.getLogger(__name__).warning(f"Invalid regex pattern skipped: {pattern} - {e}")
    
    return valid_patterns, invalid_patterns


def deduplicate_aliases(aliases: List[str]) -> List[str]:
    """
    De-duplicate aliases (case-insensitive) while preserving order.
    """
    seen = set()
    result = []
    for alias in aliases:
        lower_alias = alias.lower().strip()
        if lower_alias and lower_alias not in seen:
            seen.add(lower_alias)
            result.append(lower_alias)
    return result


def load_json_file(filename: str) -> Dict[str, Any]:
    """Load JSON configuration file from backend directory"""
    file_path = Path(__file__).parent / filename
    if file_path.exists():
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_json_file(filename: str, data: Dict[str, Any]) -> bool:
    """Save data to JSON configuration file in backend directory"""
    file_path = Path(__file__).parent / filename
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to save {filename}: {e}")
        return False


def seed_initial_data(db: Session) -> None:
    """
    Seed database with initial data from JSON files
    Called on application startup

    NOTE: Only seeds lots that don't already exist in database.
    This prevents overwriting user customizations and duplicate entries.
    """
    # Load lot configurations from file
    lot_configs_data = load_json_file("lot_configs.json")

    # Check and seed each lot individually (only if it doesn't exist)
    for lot_name, lot_data in lot_configs_data.items():
        # Check if this specific lot already exists
        existing_lot = db.query(models.LotConfigModel).filter_by(name=lot_name).first()

        if not existing_lot:
            # Lot doesn't exist, create it
            db_lot = models.LotConfigModel(
                name=lot_name,
                base_amount=lot_data.get("base_amount", 0.0),
                max_tech_score=lot_data.get("max_tech_score", 60.0),
                max_econ_score=lot_data.get("max_econ_score", 40.0),
                max_raw_score=lot_data.get("max_raw_score", 0.0),
                alpha=lot_data.get("alpha", 0.3),
                economic_formula=lot_data.get("economic_formula", "interp_alpha"),
                company_certs=lot_data.get("company_certs", []),
                reqs=lot_data.get("reqs", []),
                state=lot_data.get("state", {}),
            )
            db.add(db_lot)

    # Load and seed master data (always check, as it's global configuration)
    master_data_file = load_json_file("master_data.json")
    existing_master = db.query(models.MasterDataModel).filter_by(id="1").first()
    if not existing_master and master_data_file:
        db_master = models.MasterDataModel(
            id="1",
            company_certs=master_data_file.get("company_certs", []),
            prof_certs=master_data_file.get("prof_certs", []),
            requirement_labels=master_data_file.get("requirement_labels", []),
            economic_formulas=master_data_file.get("economic_formulas", []),
            rti_companies=master_data_file.get("rti_companies", ["Lutech"]),
        )
        db.add(db_master)

    db.commit()
    
    # Seed vendor configs and OCR settings
    seed_vendor_configs(db)
    seed_ocr_settings(db)


def get_lot_configs(db: Session) -> List[models.LotConfigModel]:
    """Retrieve all lot configurations"""
    return db.query(models.LotConfigModel).all()


def get_lot_config(db: Session, lot_key: str) -> Optional[models.LotConfigModel]:
    """Retrieve a specific lot configuration by key"""
    return (
        db.query(models.LotConfigModel)
        .filter(models.LotConfigModel.name == lot_key)
        .first()
    )


def create_lot_config(
    db: Session, lot_config: schemas.LotConfig
) -> models.LotConfigModel:
    """Create a new lot configuration"""
    db_lot = models.LotConfigModel(
        name=lot_config.name,
        base_amount=lot_config.base_amount,
        max_tech_score=lot_config.max_tech_score,
        max_econ_score=lot_config.max_econ_score,
        max_raw_score=lot_config.max_raw_score,
        alpha=lot_config.alpha,
        economic_formula=lot_config.economic_formula,
        company_certs=lot_config.company_certs,
        reqs=lot_config.reqs,
        state=lot_config.state or {},
    )
    db.add(db_lot)
    db.commit()
    db.refresh(db_lot)
    return db_lot


def update_lot_config(
    db: Session, lot_key: str, lot_config: schemas.LotConfig
) -> Optional[models.LotConfigModel]:
    """Update an existing lot configuration"""
    db_lot = get_lot_config(db, lot_key)
    if db_lot:
        db_lot.name = lot_config.name
        db_lot.base_amount = lot_config.base_amount
        db_lot.max_tech_score = lot_config.max_tech_score
        db_lot.max_econ_score = lot_config.max_econ_score
        db_lot.max_raw_score = lot_config.max_raw_score
        db_lot.alpha = lot_config.alpha
        db_lot.economic_formula = lot_config.economic_formula
        db_lot.company_certs = lot_config.company_certs
        db_lot.reqs = lot_config.reqs
        # NOTE: state is NOT updated here - it is saved separately via POST /config/state
        # to prevent POST /config from overwriting simulation state with stale data

        db.commit()
        db.refresh(db_lot)
    return db_lot


def delete_lot_config(db: Session, lot_key: str) -> bool:
    """Delete a lot configuration"""
    db_lot = get_lot_config(db, lot_key)
    if db_lot:
        db.delete(db_lot)
        db.commit()
        return True
    return False


def get_master_data(db: Session) -> Optional[models.MasterDataModel]:
    """Retrieve master data"""
    return db.query(models.MasterDataModel).filter_by(id="1").first()


def update_master_data(
    db: Session, master_data: schemas.MasterData
) -> models.MasterDataModel:
    """Update master data, creating if it doesn't exist. Also syncs to master_data.json."""
    db_master = get_master_data(db)
    if not db_master:
        db_master = models.MasterDataModel(id="1")
        db.add(db_master)

    db_master.company_certs = master_data.company_certs
    db_master.prof_certs = master_data.prof_certs
    db_master.requirement_labels = master_data.requirement_labels
    if master_data.economic_formulas:
        db_master.economic_formulas = master_data.economic_formulas
    db_master.rti_companies = master_data.rti_companies or ["Lutech"]

    db.commit()
    db.refresh(db_master)
    
    # Auto-sync to JSON file for backup/seed purposes
    # Preserve static fields (criteria_judgement_levels, scoring_formulas) by reading existing file first
    existing_json = load_json_file("master_data.json")
    json_data = {
        **existing_json,  # Preserve static fields
        "company_certs": db_master.company_certs or [],
        "prof_certs": db_master.prof_certs or [],
        "requirement_labels": db_master.requirement_labels or [],
        "economic_formulas": db_master.economic_formulas or [],
        "rti_companies": db_master.rti_companies or ["Lutech"]
    }
    save_json_file("master_data.json", json_data)
    
    return db_master


# ============================================================================
# Vendor Config CRUD Operations
# ============================================================================

def get_vendor_configs(
    db: Session, 
    enabled_only: bool = False,
    skip: int = 0,
    limit: Optional[int] = None
) -> List[models.VendorConfigModel]:
    """Retrieve all vendor configurations with optional pagination"""
    query = db.query(models.VendorConfigModel)
    if enabled_only:
        query = query.filter(models.VendorConfigModel.enabled == "1")
    query = query.order_by(models.VendorConfigModel.name)
    if skip > 0:
        query = query.offset(skip)
    if limit is not None and limit > 0:
        query = query.limit(limit)
    return query.all()


def get_vendor_config(db: Session, key: str) -> Optional[models.VendorConfigModel]:
    """Retrieve a specific vendor configuration by key"""
    return db.query(models.VendorConfigModel).filter(
        models.VendorConfigModel.key == key
    ).first()


def create_vendor_config(
    db: Session, vendor: schemas.VendorConfig
) -> models.VendorConfigModel:
    """Create a new vendor configuration with validation"""
    # Validate and clean inputs
    validated_patterns = validate_regex_patterns(vendor.cert_patterns or [])
    deduplicated_aliases = deduplicate_aliases(vendor.aliases or [])
    
    db_vendor = models.VendorConfigModel(
        key=vendor.key.lower(),
        name=vendor.name,
        aliases=deduplicated_aliases,
        cert_patterns=validated_patterns,
        enabled="1" if vendor.enabled else "0",
    )
    db.add(db_vendor)
    db.commit()
    db.refresh(db_vendor)
    return db_vendor


def update_vendor_config(
    db: Session, key: str, vendor_update: schemas.VendorConfigUpdate
) -> Optional[models.VendorConfigModel]:
    """Update an existing vendor configuration with validation"""
    db_vendor = get_vendor_config(db, key)
    if db_vendor:
        if vendor_update.name is not None:
            db_vendor.name = vendor_update.name
        if vendor_update.aliases is not None:
            db_vendor.aliases = deduplicate_aliases(vendor_update.aliases)
        if vendor_update.cert_patterns is not None:
            db_vendor.cert_patterns = validate_regex_patterns(vendor_update.cert_patterns)
        if vendor_update.enabled is not None:
            db_vendor.enabled = "1" if vendor_update.enabled else "0"
        db.commit()
        db.refresh(db_vendor)
    return db_vendor


def delete_vendor_config(db: Session, key: str) -> bool:
    """Delete a vendor configuration"""
    db_vendor = get_vendor_config(db, key)
    if db_vendor:
        db.delete(db_vendor)
        db.commit()
        return True
    return False


def seed_vendor_configs(db: Session) -> None:
    """
    Seed database with default vendor configurations from shared vendor_defaults module.
    Only seeds vendors that don't already exist.
    """
    for key, vendor_data in DEFAULT_VENDORS.items():
        existing = get_vendor_config(db, key)
        if not existing:
            db_vendor = models.VendorConfigModel(
                key=key,
                name=vendor_data["name"],
                aliases=vendor_data["aliases"],
                cert_patterns=vendor_data["cert_patterns"],
                enabled="1",
            )
            db.add(db_vendor)
    
    db.commit()


# ============================================================================
# OCR Settings CRUD Operations
# ============================================================================

def get_ocr_settings(db: Session) -> List[models.OCRSettingsModel]:
    """Retrieve all OCR settings"""
    return db.query(models.OCRSettingsModel).all()


def get_ocr_setting(db: Session, key: str) -> Optional[models.OCRSettingsModel]:
    """Retrieve a specific OCR setting by key"""
    return db.query(models.OCRSettingsModel).filter(
        models.OCRSettingsModel.key == key
    ).first()


def upsert_ocr_setting(
    db: Session, setting: schemas.OCRSetting
) -> models.OCRSettingsModel:
    """Create or update an OCR setting"""
    db_setting = get_ocr_setting(db, setting.key)
    if not db_setting:
        db_setting = models.OCRSettingsModel(key=setting.key)
        db.add(db_setting)
    
    db_setting.value = setting.value
    if setting.description:
        db_setting.description = setting.description
    
    db.commit()
    db.refresh(db_setting)
    return db_setting


def delete_ocr_setting(db: Session, key: str) -> bool:
    """Delete an OCR setting"""
    db_setting = get_ocr_setting(db, key)
    if db_setting:
        db.delete(db_setting)
        db.commit()
        return True
    return False


def seed_ocr_settings(db: Session) -> None:
    """Seed default OCR settings"""
    default_settings = [
        {
            "key": "date_patterns",
            "value": json.dumps([
                r"valid\s*(?:from|since|until|thru|through|to)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
                r"expir(?:es?|ation|y)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
                r"issue[d]?\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
                r"date\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
                r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
                r"(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})",
                r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4})",
                r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4})",
                r"(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})",
                r"((?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{1,2},?\s*\d{4})",
            ]),
            "description": "Regex patterns to extract dates from OCR text (JSON array)"
        },
        {
            "key": "tech_terms",
            "value": json.dumps([
                "architect", "developer", "engineer", "manager", "administrator",
                "consultant", "analyst", "specialist", "expert", "professional",
                "associate", "practitioner", "certificate", "certification", "certified",
                "solutions", "cloud", "data", "security", "network", "systems",
                "project", "program", "product", "technical", "senior", "junior",
                "lead", "principal", "staff", "full", "stack", "frontend", "backend",
                "devops", "sysops", "azure", "aws", "google", "oracle", "sap",
                "cisco", "microsoft", "redhat", "vmware", "kubernetes", "docker",
                "java", "python", "javascript", "scrum", "agile", "pmi", "pmbok",
            ]),
            "description": "Technical terms that should NOT be considered as person names (JSON array)"
        },
        {
            "key": "ocr_dpi",
            "value": "600",
            "description": "DPI resolution for PDF to image conversion"
        },
    ]
    
    for setting_data in default_settings:
        existing = get_ocr_setting(db, setting_data["key"])
        if not existing:
            db_setting = models.OCRSettingsModel(
                key=setting_data["key"],
                value=setting_data["value"],
                description=setting_data["description"],
            )
            db.add(db_setting)
    
    db.commit()
