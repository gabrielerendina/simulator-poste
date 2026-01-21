"""
CRUD operations for database models
Handles creation, retrieval, and updating of lot configurations and master data
"""

from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import json
from pathlib import Path

from . import models, schemas


def load_json_file(filename: str) -> Dict[str, Any]:
    """Load JSON configuration file from backend directory"""
    file_path = Path(__file__).parent / filename
    if file_path.exists():
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def seed_initial_data(db: Session) -> None:
    """
    Seed database with initial data from JSON files
    Called on application startup
    """
    # Load lot configurations from JSON file
    lot_configs_data = load_json_file("lot_configs.json")
    
    # Seed lot configurations if they don't exist
    for lot_name, lot_data in lot_configs_data.items():
        existing = db.query(models.LotConfigModel).filter_by(name=lot_name).first()
        if not existing:
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
                state=lot_data.get("state", {})
            )
            db.add(db_lot)
    
    # Load and seed master data
    master_data_file = load_json_file("master_data.json")
    existing_master = db.query(models.MasterDataModel).filter_by(id="1").first()
    if not existing_master and master_data_file:
        db_master = models.MasterDataModel(
            id="1",
            company_certs=master_data_file.get("company_certs", []),
            prof_certs=master_data_file.get("prof_certs", []),
            requirement_labels=master_data_file.get("requirement_labels", []),
            economic_formulas=master_data_file.get("economic_formulas", [])
        )
        db.add(db_master)
    
    db.commit()


def get_lot_configs(db: Session) -> List[models.LotConfigModel]:
    """Retrieve all lot configurations"""
    return db.query(models.LotConfigModel).all()


def get_lot_config(db: Session, lot_key: str) -> Optional[models.LotConfigModel]:
    """Retrieve a specific lot configuration by key"""
    return db.query(models.LotConfigModel).filter(models.LotConfigModel.name == lot_key).first()


def create_lot_config(db: Session, lot_config: schemas.LotConfig) -> models.LotConfigModel:
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
        state=lot_config.state or {}
    )
    db.add(db_lot)
    db.commit()
    db.refresh(db_lot)
    return db_lot


def update_lot_config(db: Session, lot_key: str, lot_config: schemas.LotConfig) -> Optional[models.LotConfigModel]:
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
        if lot_config.state:
            db_lot.state = lot_config.state
        
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


def update_master_data(db: Session, master_data: schemas.MasterData) -> models.MasterDataModel:
    """Update master data, creating if it doesn't exist"""
    db_master = get_master_data(db)
    if not db_master:
        db_master = models.MasterDataModel(id="1")
        db.add(db_master)
    
    db_master.company_certs = master_data.company_certs
    db_master.prof_certs = master_data.prof_certs
    db_master.requirement_labels = master_data.requirement_labels
    if master_data.economic_formulas:
        db_master.economic_formulas = master_data.economic_formulas
    
    db.commit()
    db.refresh(db_master)
    return db_master
