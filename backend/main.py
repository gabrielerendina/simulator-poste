from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from datetime import datetime
from contextlib import asynccontextmanager
import uvicorn
import numpy as np
import io
import os
import time
import zipfile
import tempfile
import shutil
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
)
import matplotlib.pyplot as plt
import matplotlib

import crud, models, schemas
from database import SessionLocal, engine
from logging_config import setup_logging, get_logger
from auth import OIDCMiddleware, OIDCConfig, get_current_user
from services.scoring_service import ScoringService
from services.business_plan_service import BusinessPlanService
from pdf_generator import generate_pdf_report
from excel_generator import generate_excel_report
from excel_business_plan import generate_business_plan_excel

# Setup structured logging
setup_logging()
logger = get_logger(__name__)


def run_migrations():
    """
    Run database migrations to add columns that may be missing in existing databases.
    This is necessary because SQLAlchemy's create_all() doesn't add new columns to existing tables.
    """
    from sqlalchemy import inspect
    
    inspector = inspect(engine)
    
    # Migration for master_data table - add rti_partners column
    if "master_data" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("master_data")]
        if "rti_partners" not in columns:
            logger.info("Migrating: Adding rti_partners column to master_data table")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE master_data ADD COLUMN rti_partners TEXT DEFAULT '[]'"))
                conn.commit()
    
    # Migration for lot_configs table - add RTI columns
    if "lot_configs" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("lot_configs")]
        with engine.connect() as conn:
            if "rti_enabled" not in columns:
                logger.info("Migrating: Adding rti_enabled column to lot_configs table")
                conn.execute(text("ALTER TABLE lot_configs ADD COLUMN rti_enabled INTEGER DEFAULT 0"))
            if "rti_companies" not in columns:
                logger.info("Migrating: Adding rti_companies column to lot_configs table")
                conn.execute(text("ALTER TABLE lot_configs ADD COLUMN rti_companies TEXT DEFAULT '[]'"))
            if "rti_quotas" not in columns:
                logger.info("Migrating: Adding rti_quotas column to lot_configs table")
                conn.execute(text("ALTER TABLE lot_configs ADD COLUMN rti_quotas TEXT DEFAULT '{}'"))
            if "is_active" not in columns:
                logger.info("Migrating: Adding is_active column to lot_configs table")
                conn.execute(text("ALTER TABLE lot_configs ADD COLUMN is_active INTEGER DEFAULT 1"))
            conn.commit()

    # Migration for business_plans table - add governance and inflation columns
    if "business_plans" in inspector.get_table_names():
        columns = [col["name"] for col in inspector.get_columns("business_plans")]
        with engine.connect() as conn:
            bp_migrations = [
                ("governance_mode", "TEXT DEFAULT 'percentage'"),
                ("governance_fte_periods", "TEXT DEFAULT '[]'"),
                ("governance_apply_reuse", "INTEGER DEFAULT 0"),
                ("inflation_pct", "REAL DEFAULT 0.0"),
                ("governance_profile_mix", "TEXT DEFAULT '[]'"),
                ("governance_cost_manual", "REAL"),
                ("margin_warning_threshold", "REAL DEFAULT 0.05"),
                ("margin_success_threshold", "REAL DEFAULT 0.15"),
            ]
            for col_name, col_def in bp_migrations:
                if col_name not in columns:
                    logger.info(f"Migrating: Adding {col_name} column to business_plans table")
                    conn.execute(text(f"ALTER TABLE business_plans ADD COLUMN {col_name} {col_def}"))
            conn.commit()

    logger.info("Database migrations completed")


# Run migrations before create_all to add missing columns
run_migrations()

models.Base.metadata.create_all(bind=engine)

matplotlib.use("Agg")


# Lifespan event handler (replaces deprecated on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle application startup and shutdown"""
    # Startup
    logger.info("Application starting up", extra={"event": "startup"})
    db = SessionLocal()
    try:
        crud.seed_initial_data(db)
        crud.seed_practices(db)
        logger.info("Database seeded successfully")
    except Exception as e:
        logger.error("Failed to seed database", exc_info=True)
        raise
    finally:
        db.close()
    logger.info("Application startup complete")

    yield

    # Shutdown (if needed in future)
    logger.info("Application shutting down")


app = FastAPI(
    title="Poste Tender Simulator API",
    lifespan=lifespan
)


# --- CORS Configuration (Environment-based) ---

def normalize_origin_url(url: str) -> str:
    """
    Normalize an origin URL to ensure it has proper protocol.
    Handles Render's fromService which may return just hostname.
    """
    if not url:
        return url
    url = url.strip()
    # If it's just a hostname (no protocol), add https://
    if not url.startswith('http://') and not url.startswith('https://'):
        return f'https://{url}'
    return url


def get_allowed_origins():
    """
    Get allowed CORS origins based on environment
    Supports development, staging, and production configurations
    """
    env = os.getenv("ENVIRONMENT", "development")

    if env == "production":
        # Production: Only allow specific production domain
        production_url = os.getenv("FRONTEND_URL")
        if not production_url:
            logger.warning("FRONTEND_URL not set in production environment")
            return []
        normalized_url = normalize_origin_url(production_url)
        logger.info(f"Production CORS: {normalized_url}")
        return [normalized_url]

    elif env == "staging":
        # Staging: Allow staging domain + localhost for testing
        staging_url = os.getenv("FRONTEND_URL", "https://staging.simulator-poste.example.com")
        normalized_url = normalize_origin_url(staging_url)
        origins = [normalized_url, "http://localhost:5173"]
        logger.info(f"Staging CORS: {origins}")
        return origins

    else:  # development
        # Development: Allow all localhost variants
        origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:80",
            "http://localhost",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        logger.info(f"Development CORS: {len(origins)} origins allowed")
        return origins


ALLOWED_ORIGINS = get_allowed_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,  # Cache preflight for 10 minutes
)

# --- OIDC Authentication Middleware ---
# Initialize OIDC configuration
oidc_config = OIDCConfig()
logger.info(f"OIDC Authentication initialized: issuer={oidc_config.issuer}, client_id={'configured' if oidc_config.client_id else 'NOT SET'}")

# Add OIDC middleware (must be added after CORS)
app.middleware("http")(OIDCMiddleware(app, oidc_config))


# --- GLOBAL EXCEPTION HANDLERS ---

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle Pydantic validation errors"""
    logger.error(
        "Validation error",
        extra={"errors": exc.errors(), "url": str(request.url)}
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation error",
            "errors": exc.errors()
        }
    )


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    """Handle database errors"""
    logger.error(
        "Database error",
        extra={"url": str(request.url)},
        exc_info=True
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Database error occurred"}
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all handler for unhandled exceptions"""
    logger.error(
        "Unhandled exception",
        extra={
            "url": str(request.url),
            "method": request.method,
            "exception_type": type(exc).__name__
        },
        exc_info=True
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )

# Middleware for payload size validation (max 100 MB for ZIP uploads)
MAX_PAYLOAD_SIZE = 100 * 1024 * 1024  # 100 MB


@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    if request.method in ["POST", "PUT", "PATCH"]:
        if "content-length" in request.headers:
            content_length = int(request.headers["content-length"])
            if content_length > MAX_PAYLOAD_SIZE:
                from fastapi.responses import JSONResponse
                return JSONResponse(
                    status_code=413,
                    content={
                        "detail": f"Request payload too large. Maximum size is {MAX_PAYLOAD_SIZE / 1024 / 1024:.0f}MB"
                    }
                )
    return await call_next(request)


# --- DB Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- HEALTH CHECK & MONITORING ENDPOINTS ---

@app.get("/health", tags=["Monitoring"])
def health_check(db: Session = Depends(get_db)):
    """
    Comprehensive health check endpoint for monitoring
    Returns detailed system health status
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0",
        "checks": {}
    }

    # Check database connectivity
    try:
        db.execute(text("SELECT 1"))
        health_status["checks"]["database"] = {
            "status": "healthy",
            "message": "Database connection OK"
        }
    except Exception as e:
        health_status["status"] = "unhealthy"
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": "Database connection failed"
        }
        logger.error("Health check failed: database", exc_info=True)

    # Check if lot configs exist
    try:
        lot_count = db.query(models.LotConfigModel).count()
        health_status["checks"]["lot_configs"] = {
            "status": "healthy" if lot_count > 0 else "warning",
            "count": lot_count,
            "message": "OK" if lot_count > 0 else "No lot configurations found"
        }
    except Exception as e:
        logger.warning(f"Health check lot_configs error: {e}")
        health_status["checks"]["lot_configs"] = {
            "status": "warning",
            "message": "Unable to check lot configurations"
        }

    # Check master data
    try:
        master_data = crud.get_master_data(db)
        health_status["checks"]["master_data"] = {
            "status": "healthy" if master_data else "warning",
            "message": "OK" if master_data else "Master data not initialized"
        }
    except Exception as e:
        health_status["checks"]["master_data"] = {
            "status": "warning",
            "message": str(e)
        }

    # Response with appropriate status code
    status_code = 200 if health_status["status"] == "healthy" else 503
    return JSONResponse(content=health_status, status_code=status_code)


@app.get("/health/ready", tags=["Monitoring"])
def readiness_check(db: Session = Depends(get_db)):
    """
    Kubernetes-style readiness probe
    Returns 200 only if app is fully ready to serve traffic
    """
    try:
        # Quick database check - just verify connection works
        db.execute(text("SELECT 1"))
        return {"status": "ready", "timestamp": datetime.utcnow().isoformat()}
    except Exception as e:
        logger.warning("Readiness check failed", extra={"error": str(e)})
        return JSONResponse(
            content={"status": "not_ready", "reason": str(e)},
            status_code=503
        )


@app.get("/health/live", tags=["Monitoring"])
def liveness_check():
    """
    Kubernetes-style liveness probe
    Returns 200 if app process is alive (lightweight check)
    """
    return {
        "status": "alive",
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/metrics", tags=["Monitoring"])
def metrics_endpoint():
    """
    Basic metrics endpoint for monitoring
    Returns system resource usage and application statistics
    """
    try:
        import psutil
        import os

        process = psutil.Process(os.getpid())

        return {
            "timestamp": datetime.utcnow().isoformat(),
            "process": {
                "memory_mb": round(process.memory_info().rss / 1024 / 1024, 2),
                "memory_percent": round(process.memory_percent(), 2),
                "cpu_percent": round(process.cpu_percent(interval=0.1), 2),
                "num_threads": process.num_threads(),
                "uptime_seconds": round(time.time() - process.create_time(), 2)
            },
            "system": {
                "cpu_count": psutil.cpu_count(),
                "memory_total_gb": round(psutil.virtual_memory().total / 1024 / 1024 / 1024, 2),
                "memory_available_gb": round(psutil.virtual_memory().available / 1024 / 1024 / 1024, 2),
                "memory_percent": round(psutil.virtual_memory().percent, 2)
            }
        }
    except ImportError:
        logger.warning("psutil not installed, metrics limited")
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "message": "Install psutil for detailed metrics"
        }
    except Exception as e:
        logger.error("Metrics endpoint failed", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve metrics")




# --- LOGIC - Using Service Layer ---
# Note: Scoring logic moved to services/scoring_service.py
# Legacy function wrappers for backward compatibility (can be removed after full migration)

def calculate_economic_score(p_base, p_offered, p_best_competitor, alpha=0.3, max_econ=40.0):
    """Legacy wrapper - delegates to ScoringService"""
    return ScoringService.calculate_economic_score(p_base, p_offered, p_best_competitor, alpha, max_econ)


def calculate_prof_score(R, C, max_res, max_points, max_certs=5, max_points_manual=False, prof_R=None, prof_C=None):
    """
    Calculate professional score for a requirement.

    Args:
        R: Number of resources
        C: Number of certifications
        max_res: Maximum expected resources (slider max)
        max_points: Maximum points achievable
        max_certs: Maximum certifications to count (slider max)
        max_points_manual: If True, scale score proportionally to max_points
        prof_R: Required resources for full score (used for proportional calc)
        prof_C: Required certs per resource for full score

    Returns:
        Score capped at max_points
    """
    # Clamp R and C to their maximums to prevent unrealistic scores
    R = min(R, max_res)
    C = min(C, max_certs)
    
    # Ensure C doesn't exceed R (can't have more certs than resources)
    if R < C:
        C = R
    
    # Logic: (2 * R) + (R * C)
    score = (2 * R) + (R * C)

    if max_points_manual:
        # Use prof_R/prof_C as theoretical max (required values for full score)
        req_R = prof_R if prof_R and prof_R > 0 else max_res
        req_C = prof_C if prof_C and prof_C > 0 else max_certs
        theoretical_max = (2 * req_R) + (req_R * req_C)
        if theoretical_max > 0:
            return min((score / theoretical_max) * max_points, max_points)
        return 0.0

    # Cap at maximum points allowed
    return min(score, max_points)


# --- API ROUTER (Business endpoints with /api prefix) ---
api_router = APIRouter(prefix="/api")


def calculate_max_points_for_req(req):
    """
    Calculate the theoretical maximum points for a given requirement configuration.
    """
    req_type = req.get("type")
    
    if req_type == "resource":
        # If max_points_manual is True, use the max_points value directly
        if req.get("max_points_manual"):
            return float(req.get("max_points", 0))
        
        # Formula: (2 * R) + (R * C)
        # We use 'max_res' and 'max_certs' from config. 
        # Fallback to 'prof_R'/'prof_C' if max not explicit, but ideally should be explicit.
        R = req.get("max_res") or req.get("prof_R", 0)
        C = req.get("max_certs") or req.get("prof_C", 0)
        
        # If user hasn't updated config yet, these might be low defaults. 
        # But we must trust the config.
        return (2 * R) + (R * C)
        
    elif req_type in ["reference", "project"]:
        # Max RAW = Σ(internal_weight × max_value) + Bonus + Attestazione + Custom Metrics
        # Note: RAW score DOES apply internal weights (peso_interno)

        # 1. Sub-reqs (criteria) - RAW max (WITH internal weights)
        criteria = req.get("criteria") or req.get("sub_reqs") or []
        # Sum of (internal_weight × max_value) for each criterion
        sub_score_max = sum(
            float(c.get("weight", 1.0)) * float(c.get("max_value", 5.0))
            for c in criteria
        )
        
        # 2. Attestazione
        att_score = float(req.get("attestazione_score", 0.0))

        # 3. Custom Metrics
        custom_max = 0.0
        if "custom_metrics" in req:
            for m in req["custom_metrics"]:
                custom_max += float(m.get("max_score", 0.0))

        # Note: bonus_val is NOT included in max_raw because it's optional (bonus_active)
        # The bonus is added to the actual raw score only when bonus_active is true
        # and then capped to this max_raw value

        return sub_score_max + att_score + custom_max
        
    return 0.0

def calculate_lot_max_raw_score(lot_cfg: schemas.LotConfig):
    """
    Calculate the total theoretical maximum raw score for the lot.
    Sum of all requirement max points + company certs max points.
    """
    total = 0.0

    # 1. Company Certs
    # Config is simple list of dicts.
    if lot_cfg.company_certs:
        for c in lot_cfg.company_certs:
             # handle both dict and object access depending on how it's loaded
             if isinstance(c, dict):
                 total += c.get("points", 0.0)
             else:
                 total += getattr(c, "points", 0.0)

    # 2. Requirements
    for req in lot_cfg.reqs:
        # Pydantic model dump or dict access
        if not isinstance(req, dict):
             req = req.dict()
        total += calculate_max_points_for_req(req)

    return total


def calculate_lot_max_tech_score(lot_cfg: schemas.LotConfig):
    """
    Calculate the total maximum weighted score (gara points) for the lot.
    Sum of all gara_weight from requirements + company certs.
    This represents the max_tech_score.
    """
    total = 0.0

    # 1. Company Certs
    if lot_cfg.company_certs:
        for c in lot_cfg.company_certs:
            if isinstance(c, dict):
                total += c.get("gara_weight", 0.0)
            else:
                total += getattr(c, "gara_weight", 0.0)

    # 2. Requirements
    for req in lot_cfg.reqs:
        if isinstance(req, dict):
            total += req.get("gara_weight", 0.0)
        else:
            total += getattr(req, "gara_weight", 0.0)

    return total


def normalize_sub_req_ids(lot_config: schemas.LotConfig) -> schemas.LotConfig:
    """
    Normalize sub_req IDs to sequential letters (a, b, c, ...).
    Fixes legacy IDs like 'SOAR_REQ_43_1' to 'a', 'SOAR_REQ_43_2' to 'b', etc.
    """
    config_dict = lot_config.model_dump()
    
    for req in config_dict.get("reqs", []):
        sub_reqs = req.get("sub_reqs") or req.get("criteria") or []
        for i, sub in enumerate(sub_reqs):
            # Convert index to letter (0='a', 1='b', etc.)
            new_id = chr(97 + i) if i < 26 else f"c{i + 1}"
            sub["id"] = new_id
        
        # Update the key used
        if "sub_reqs" in req:
            req["sub_reqs"] = sub_reqs
        elif "criteria" in req:
            req["criteria"] = sub_reqs
    
    return schemas.LotConfig.model_validate(config_dict)


@api_router.get("/config", response_model=Dict[str, schemas.LotConfig])
def get_config(db: Session = Depends(get_db)):
    configs = crud.get_lot_configs(db)
    result = {}
    for c in configs:
        lot_config = schemas.LotConfig.model_validate(c)
        lot_config = normalize_sub_req_ids(lot_config)
        result[c.name] = lot_config
    return result


@api_router.get("/master-data", response_model=schemas.MasterData)
def get_master_data(db: Session = Depends(get_db)):
    master_data = crud.get_master_data(db)
    if not master_data:
        raise HTTPException(status_code=404, detail="Master data not found")
    return master_data


@api_router.post("/master-data", response_model=schemas.MasterData)
def update_master_data(data: schemas.MasterData, db: Session = Depends(get_db)):
    return crud.update_master_data(db, data)


@api_router.post("/config/state")
def update_lot_state(
    lot_key: str, state: schemas.SimulationState, db: Session = Depends(get_db)
):
    logger.info(f"State update requested for lot: {lot_key}")
    logger.debug(f"State data: {state.dict()}")

    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        logger.warning(f"Lot not found: {lot_key}")
        raise HTTPException(status_code=404, detail="Lot not found")

    lot.state = state.dict()
    db.commit()

    logger.info(f"State saved successfully for lot: {lot_key}")
    return {"status": "success"}


@api_router.post("/config", response_model=Dict[str, schemas.LotConfig])
def update_config(
    new_config: Dict[str, schemas.LotConfig], db: Session = Depends(get_db)
):
    for lot_name, lot_data in new_config.items():
        crud.update_lot_config(db, lot_name, lot_data)

    configs = crud.get_lot_configs(db)
    return {c.name: schemas.LotConfig.model_validate(c) for c in configs}


@api_router.post("/config/add", response_model=schemas.LotConfig)
def add_lot(lot_key: str, db: Session = Depends(get_db)):
    if crud.get_lot_config(db, lot_key):
        raise HTTPException(status_code=400, detail="Gara/Lotto già esistente")

    new_lot = schemas.LotConfig(
        name=lot_key,
        base_amount=1000000.0,
        company_certs=[
            {"label": "ISO 9001", "points": 2.0},
            {"label": "ISO 27001", "points": 2.0},
        ],
        reqs=[],
    )
    db_lot = crud.create_lot_config(db, new_lot)
    return schemas.LotConfig.model_validate(db_lot)


@api_router.delete("/config/{lot_key}")
def delete_lot(lot_key: str, db: Session = Depends(get_db)):
    if not crud.delete_lot_config(db, lot_key):
        raise HTTPException(status_code=404, detail="Gara/Lotto non trovato")
    return {"status": "success", "message": f"Gara/Lotto {lot_key} eliminato"}


@api_router.get("/config/template")
def download_config_template(db: Session = Depends(get_db)):
    """
    Download Excel template for lot configuration.
    Template includes master data sheets with data validation dropdowns.
    """
    from services.excel_config_service import ExcelConfigService
    
    # Get master data
    master_data_obj = crud.get_master_data(db)
    if not master_data_obj:
        master_data = {
            "company_certs": [],
            "prof_certs": [],
            "economic_formulas": [{"id": "interp_alpha", "label": "Interpolazione (Fattore Alpha)"}],
            "rti_partners": []
        }
    else:
        master_data = {
            "company_certs": master_data_obj.company_certs or [],
            "prof_certs": master_data_obj.prof_certs or [],
            "economic_formulas": master_data_obj.economic_formulas or [
                {"id": "interp_alpha", "label": "Interpolazione (Fattore Alpha)"}
            ],
            "rti_partners": master_data_obj.rti_partners or []
        }
    
    try:
        excel_bytes = ExcelConfigService.generate_template(master_data)
        
        return StreamingResponse(
            excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": "attachment; filename=template_configurazione_lotto.xlsx"
            }
        )
    except Exception as e:
        logger.error(f"Error generating config template: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Errore nella generazione del template")


@api_router.get("/lots/{lot_key}/export")
def export_lot_config(lot_key: str, db: Session = Depends(get_db)):
    """
    Export a lot configuration to an Excel file.
    Creates a populated template with all the lot's configuration data.
    """
    from services.excel_config_service import ExcelConfigService
    
    # Get lot config from database
    lot_obj = crud.get_lot_config(db, lot_key)
    if not lot_obj:
        raise HTTPException(status_code=404, detail=f"Lotto '{lot_key}' non trovato")
    
    # Build lot_config dict from model attributes
    lot_config = {
        "name": lot_obj.name,
        "base_amount": lot_obj.base_amount,
        "max_tech_score": lot_obj.max_tech_score,
        "max_econ_score": lot_obj.max_econ_score,
        "max_raw_score": lot_obj.max_raw_score,
        "alpha": lot_obj.alpha,
        "economic_formula": lot_obj.economic_formula,
        "company_certs": lot_obj.company_certs or [],
        "reqs": lot_obj.reqs or [],
        "rti_enabled": lot_obj.rti_enabled or False,
        "rti_companies": lot_obj.rti_companies or [],
        "is_active": lot_obj.is_active if lot_obj.is_active is not None else True,
    }
    
    # Get master data for dropdowns
    master_data_obj = crud.get_master_data(db)
    if not master_data_obj:
        master_data = {
            "company_certs": [],
            "prof_certs": [],
            "economic_formulas": [{"id": "interp_alpha", "label": "Interpolazione (Fattore Alpha)"}],
            "rti_partners": []
        }
    else:
        master_data = {
            "company_certs": master_data_obj.company_certs or [],
            "prof_certs": master_data_obj.prof_certs or [],
            "economic_formulas": master_data_obj.economic_formulas or [
                {"id": "interp_alpha", "label": "Interpolazione (Fattore Alpha)"}
            ],
            "rti_partners": master_data_obj.rti_partners or []
        }
    
    try:
        excel_bytes = ExcelConfigService.export_lot_config(lot_config, master_data)
        
        # Sanitize filename
        safe_name = lot_config.get("name", lot_key).replace("/", "_").replace("\\", "_")
        filename = f"export_{safe_name}.xlsx"
        
        return StreamingResponse(
            excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    except Exception as e:
        logger.error(f"Error exporting lot config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Errore nell'esportazione della configurazione")


@api_router.post("/config/import")
async def import_config_from_excel(
    file: UploadFile = File(...),
    target_lot: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Import lot configuration from an uploaded Excel file.
    
    The Excel file should follow the template structure with sheets:
    - Lotto: lot metadata (name, base_amount, alpha, formula)
    - Cert_Aziendali: company certifications
    - Cert_Professionali: resource requirements with professional certs
    - Referenze_Progetti: reference/project requirements
    - Criteri: evaluation criteria for references/projects
    - Voci_Tabellari: tabular scoring items
    
    Args:
        file: Excel file (.xlsx) with lot configuration
        target_lot: Optional lot key to overwrite. If None, creates new lot from Excel name.
    
    Returns:
        Dict with success status, lot_key, counts, and any warnings
    """
    from services.excel_config_service import ExcelConfigService
    
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.xlsx'):
        raise HTTPException(
            status_code=400,
            detail="Il file deve essere in formato Excel (.xlsx)"
        )
    
    try:
        # Read file content
        content = await file.read()
        
        # Get master data for validation
        master_data_obj = crud.get_master_data(db)
        if not master_data_obj:
            master_data = {"company_certs": [], "prof_certs": [], "economic_formulas": [], "rti_partners": []}
        else:
            master_data = {
                "company_certs": master_data_obj.company_certs or [],
                "prof_certs": master_data_obj.prof_certs or [],
                "economic_formulas": master_data_obj.economic_formulas or [],
                "rti_partners": master_data_obj.rti_partners or []
            }
        
        # Parse Excel
        lot_config, warnings = ExcelConfigService.parse_upload(content, master_data)
        
        if lot_config is None:
            raise HTTPException(
                status_code=400,
                detail="Impossibile leggere la configurazione dal file Excel"
            )
        
        # Determine lot_key: use target_lot if provided, otherwise generate from Excel name
        if target_lot:
            # Override existing lot
            lot_key = target_lot
            existing = crud.get_lot_config(db, lot_key)
            if not existing:
                raise HTTPException(
                    status_code=404,
                    detail=f"Lotto '{lot_key}' non trovato per sovrascrittura"
                )
        else:
            # Create new lot from Excel name - use the name directly as key
            lot_name = lot_config.get("name", "Lotto_Import")
            lot_key = lot_name  # Use the exact name from Excel as the lot key
            existing = crud.get_lot_config(db, lot_key)
        
        # lot_config["name"] already has the correct name from Excel parsing
        
        # Convert dict to LotConfig schema
        lot_config_schema = schemas.LotConfig(**lot_config)
        
        # Create or update
        if existing:
            # Update existing lot
            crud.update_lot_config(db, lot_key, lot_config_schema)
            action = "aggiornato"
        else:
            # Create new lot
            crud.create_lot_config(db, lot_config_schema)
            action = "creato"
        
        # Count imported items in detail
        reqs = lot_config.get("reqs", [])
        resource_reqs = [r for r in reqs if r.get("type") == "resource"]
        ref_proj_reqs = [r for r in reqs if r.get("type") in ("reference", "project")]
        total_criteria = sum(len(r.get("sub_reqs", [])) for r in ref_proj_reqs)
        total_metrics = sum(len(r.get("custom_metrics", [])) for r in ref_proj_reqs)
        
        imported = {
            "cert_aziendali": len(lot_config.get("company_certs", [])),
            "cert_professionali": len(resource_reqs),
            "referenze_progetti": len(ref_proj_reqs),
            "criteri": total_criteria,
            "voci_tabellari": total_metrics,
            "requisiti_totali": len(reqs),
        }
        
        logger.info(f"Imported lot config '{lot_key}': {imported}, warnings: {len(warnings)}")
        
        return {
            "success": True,
            "lot_key": lot_key,
            "action": action,
            "imported": imported,
            "warnings": warnings
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error importing config from Excel: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Errore nell'importazione della configurazione")


@api_router.post("/config/{lot_key}/req/{req_id}/criteria")
def update_requirement_criteria(
    lot_key: str,
    req_id: str,
    criteria: List[schemas.SubReq],
    db: Session = Depends(get_db),
):
    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail="Lotto non trovato")

    req = next((r for r in lot.reqs if r["id"] == req_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Requisito non trovato")

    criteria_list = [c.dict() for c in criteria]
    req["criteria"] = criteria_list
    req["sub_reqs"] = criteria_list

    # This is tricky because JSON field is not tracked deeply
    db.commit()

    return {"status": "success", "message": f"Criteri aggiornati per {req_id}"}


@api_router.get("/config/{lot_key}/req/{req_id}/criteria")
def get_requirement_criteria(lot_key: str, req_id: str, db: Session = Depends(get_db)):
    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail="Lotto non trovato")

    req = next((r for r in lot.reqs if r["id"] == req_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Requisito non trovato")

    criteria = req.get("criteria") or req.get("sub_reqs", [])
    return {
        "req_id": req_id,
        "label": req.get("label"),
        "type": req.get("type"),
        "max_points": req.get("max_points"),
        "criteria": criteria,
        "bonus_label": req.get("bonus_label"),
        "bonus_val": req.get("bonus_val"),
    }


@api_router.post("/calculate")
def calculate_score(data: schemas.CalculateRequest, db: Session = Depends(get_db)):
    logger.info(
        "Score calculation requested",
        extra={
            "lot_key": data.lot_key,
            "my_discount": data.my_discount,
            "competitor_discount": data.competitor_discount
        }
    )
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        logger.warning(f"Lot not found: {data.lot_key}")
        raise HTTPException(status_code=404, detail="Lot not found")

    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    p_comp = data.base_amount * (1 - (data.competitor_discount / 100))
    p_off = data.base_amount * (1 - (data.my_discount / 100))
    econ_score = calculate_economic_score(
        data.base_amount, p_off, p_comp, lot_cfg.alpha, lot_cfg.max_econ_score
    )
    competitor_econ_score = calculate_economic_score(
        data.base_amount, p_comp, p_off, lot_cfg.alpha, lot_cfg.max_econ_score
    )

    # === 1. CALCULATE RAW SCORES ===

    # Company Certifications (raw score with RTI logic)
    # Status: "all" = full points, "partial" = partial points, "none"/missing = 0
    raw_tech_score = 0.0
    company_certs_raw_score = 0.0
    cert_config = lot_cfg.company_certs
    cert_pts_map = {c["label"]: c["points"] for c in cert_config if isinstance(c, dict)}
    cert_partial_map = {c["label"]: c.get("points_partial", 0.0) for c in cert_config if isinstance(c, dict)}
    cert_weight_map = {c["label"]: c.get("gara_weight", 0.0) for c in cert_config if isinstance(c, dict)}

    for label, status in data.company_certs_status.items():
        if status == "all":
            company_certs_raw_score += cert_pts_map.get(label, 0.0)
        elif status == "partial":
            company_certs_raw_score += cert_partial_map.get(label, 0.0)
        # "none" or missing = 0

    raw_tech_score += company_certs_raw_score

    # Requirements (raw scores)
    req_map = {r["id"]: r for r in lot_cfg.reqs}
    details = {}  # Raw scores per requirement
    max_raw_scores = {}  # Max raw scores per requirement

    for inp in data.tech_inputs:
        if inp.req_id in req_map:
            req = req_map[inp.req_id]
            pts = 0.0

            if req["type"] == "resource":
                pts = calculate_prof_score(
                    inp.r_val,
                    inp.c_val,
                    req.get("max_res", 10),
                    req["max_points"],
                    req.get("max_certs", 5),
                    req.get("max_points_manual", False),
                    req.get("prof_R", 0),
                    req.get("prof_C", 0),
                )
            elif req["type"] in ["reference", "project"]:
                sub_score_sum = 0.0
                criteria_list = req.get("criteria") or req.get("sub_reqs") or []

                # 1. Standard Criteria/Sub-reqs (RAW - WITH internal weights)
                if inp.sub_req_vals:
                    val_map = {}
                    for s in inp.sub_req_vals:
                        if isinstance(s, dict):
                            val_map[s.get("sub_id")] = s.get("val", 0)
                        else:
                            val_map[s.sub_id] = s.val
                    for sub in criteria_list:
                        val = val_map.get(sub["id"], 0)
                        weight = float(sub.get("weight", 1.0))
                        # RAW score: apply internal weights (peso_interno × value)
                        sub_score_sum += weight * float(val)

                # 2. Attestazione Cliente
                att_score = 0.0
                if inp.attestazione_active:
                    att_score = float(req.get("attestazione_score", 0.0))

                # 3. Custom Metrics
                custom_score = 0.0
                if inp.custom_metric_vals:
                    metrics_config = req.get("custom_metrics") or []
                    for metric in metrics_config:
                        m_id = metric.get("id")
                        m_val = float(inp.custom_metric_vals.get(m_id, 0.0))
                        # Clamp to metric min/max just in case
                        m_min = float(metric.get("min_score", 0.0))
                        m_max = float(metric.get("max_score", 0.0))
                        custom_score += max(m_min, min(m_max, m_val))

                # 4. Bonus (legacy)
                bonus = req.get("bonus_val", 0.0) if inp.bonus_active else 0.0

                # Calculate dynamic max points to include custom_metrics
                req_max = calculate_max_points_for_req(req)
                pts = min(sub_score_sum + att_score + custom_score + bonus, req_max)

            raw_tech_score += pts
            details[inp.req_id] = pts

    # Calculate max_raw for all requirements
    for req in lot_cfg.reqs:
        req_dict = req if isinstance(req, dict) else req.dict()
        req_id = req_dict.get("id")
        max_raw_scores[req_id] = calculate_max_points_for_req(req_dict)

    # === 2. CALCULATE WEIGHTED SCORES (WITH FORMULA) ===

    # Company Certifications - Weighted Score
    # Calculate max possible raw for company certs
    company_certs_max_raw = sum(c.get("points", 0.0) for c in cert_config if isinstance(c, dict))
    company_certs_gara_weight = sum(c.get("gara_weight", 0.0) for c in cert_config if isinstance(c, dict))

    if company_certs_max_raw > 0:
        company_certs_weighted = (company_certs_raw_score / company_certs_max_raw) * company_certs_gara_weight
    else:
        company_certs_weighted = 0.0

    # Requirements - Weighted Scores + Category Sums
    weighted_scores = {}

    # Category sums (weighted)
    category_company_certs = round(company_certs_weighted, 2)
    category_resource = 0.0  # Certificazioni Professionali
    category_reference = 0.0  # Referenze Aziendali
    category_project = 0.0  # Progetto Tecnico

    for req in lot_cfg.reqs:
        raw_score_i = details.get(req["id"], 0.0)
        req_dict = req if isinstance(req, dict) else req.dict()
        gara_weight_i = req.get("gara_weight", 0.0)
        req_type = req.get("type", "")

        # For reference/project: need to recalculate WITH weights for weighted score
        if req_type in ["reference", "project"]:
            # Find input for this requirement
            inp = next((i for i in data.tech_inputs if i.req_id == req["id"]), None)

            if inp:
                # 1. Recalculate sub-scores WITH weights
                weighted_sub_sum = 0.0
                criteria_list = req.get("criteria") or req.get("sub_reqs") or []

                if inp.sub_req_vals:
                    val_map = {}
                    for s in inp.sub_req_vals:
                        if isinstance(s, dict):
                            val_map[s.get("sub_id")] = s.get("val", 0)
                        else:
                            val_map[s.sub_id] = s.val
                    for sub in criteria_list:
                        val = val_map.get(sub["id"], 0)
                        weight = sub.get("weight", 1)
                        # WEIGHTED calculation: apply weights
                        weighted_sub_sum += weight * float(val)

                # 2. Add attestazione, custom_metrics, bonus (no weights on these)
                att_score = float(req.get("attestazione_score", 0.0)) if inp.attestazione_active else 0.0

                custom_score = 0.0
                if inp.custom_metric_vals:
                    metrics_config = req.get("custom_metrics") or []
                    for metric in metrics_config:
                        m_id = metric.get("id")
                        m_val = float(inp.custom_metric_vals.get(m_id, 0.0))
                        m_min = float(metric.get("min_score", 0.0))
                        m_max = float(metric.get("max_score", 0.0))
                        custom_score += max(m_min, min(m_max, m_val))

                bonus = req.get("bonus_val", 0.0) if inp.bonus_active else 0.0

                weighted_raw_i = weighted_sub_sum + att_score + custom_score + bonus

                # 3. Calculate max weighted raw (using actual max_value per criterion)
                # FIX: Use each criterion's actual max_value instead of hardcoded 5.0
                max_weighted_sub = sum(
                    float(c.get("weight", 1.0)) * float(c.get("max_value", 5.0))
                    for c in criteria_list
                )
                max_weighted_raw_i = max_weighted_sub + float(req.get("attestazione_score", 0.0)) + bonus

                # Add custom metrics max
                if "custom_metrics" in req:
                    for m in req["custom_metrics"]:
                        max_weighted_raw_i += float(m.get("max_score", 0.0))

                # 4. Apply gara_weight
                if max_weighted_raw_i > 0:
                    weighted_i = (weighted_raw_i / max_weighted_raw_i) * gara_weight_i
                else:
                    weighted_i = 0.0
            else:
                weighted_i = 0.0
        else:
            # For resource type: use raw score directly (no sub-weights)
            max_raw_i = calculate_max_points_for_req(req_dict)
            if max_raw_i > 0:
                weighted_i = (raw_score_i / max_raw_i) * gara_weight_i
            else:
                weighted_i = 0.0

        weighted_scores[req["id"]] = round(weighted_i, 2)

        # Add to category sum
        if req_type == "resource":
            category_resource += weighted_i
        elif req_type == "reference":
            category_reference += weighted_i
        elif req_type == "project":
            category_project += weighted_i

    # Round category sums
    category_resource = round(category_resource, 2)
    category_reference = round(category_reference, 2)
    category_project = round(category_project, 2)

    # Total technical score = sum of all categories
    tech_score = category_company_certs + category_resource + category_reference + category_project

    # === 3. AUTO-CALCULATE MAX SCORES ===
    calculated_max_tech_score = calculate_lot_max_tech_score(lot_cfg)
    calculated_max_raw_score = calculate_lot_max_raw_score(lot_cfg)
    calculated_max_econ_score = 100.0 - calculated_max_tech_score

    result = {
        "technical_score": round(tech_score, 2),
        "economic_score": round(econ_score, 2),
        "competitor_economic_score": round(competitor_econ_score, 2),
        "total_score": round(tech_score + econ_score, 2),
        "raw_technical_score": round(raw_tech_score, 2),
        "company_certs_score": round(company_certs_raw_score, 2),  # Raw score
        "max_company_certs_raw": round(company_certs_max_raw, 2),  # Max raw for company certs
        "details": details,  # RAW scores per requirement
        "max_raw_scores": max_raw_scores,  # Max RAW scores per requirement (with internal weights applied)
        "weighted_scores": weighted_scores,  # Weighted scores per requirement
        # NEW: Category sums (weighted)
        "category_company_certs": category_company_certs,
        "category_resource": category_resource,
        "category_reference": category_reference,
        "category_project": category_project,
        # NEW: Auto-calculated max scores
        "calculated_max_tech_score": round(calculated_max_tech_score, 2),
        "calculated_max_raw_score": round(calculated_max_raw_score, 2),
        "calculated_max_econ_score": round(calculated_max_econ_score, 2),
    }

    logger.info(
        "Score calculation completed",
        extra={
            "lot_key": data.lot_key,
            "total_score": result["total_score"],
            "technical_score": result["technical_score"],
            "economic_score": result["economic_score"]
        }
    )

    return result


@api_router.post("/simulate")
def simulate(data: schemas.SimulationRequest, db: Session = Depends(get_db)):
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Clamp tech score to lot maximum to prevent invalid totals
    clamped_tech_score = min(data.current_tech_score, lot_cfg.max_tech_score)

    p_base = data.base_amount
    p_best_comp = p_base * (1 - (data.competitor_discount / 100))
    results = []

    # Generate discount points from 0 to 70
    discount_points = set(range(0, 71, 2))
    # Always include competitor_discount point for accurate Best Offer display
    discount_points.add(round(data.competitor_discount))
    # Also include my_discount point
    discount_points.add(round(data.my_discount))

    for d in sorted(discount_points):
        p_hyp = p_base * (1 - d / 100)
        e_s = calculate_economic_score(
            p_base, p_hyp, p_best_comp, lot_cfg.alpha, lot_cfg.max_econ_score
        )
        results.append(
            {
                "discount": d,
                "total_score": round(clamped_tech_score + e_s, 2),
                "economic_score": round(e_s, 2),
            }
        )
    return results


@api_router.post("/monte-carlo")
def monte_carlo_simulation(
    data: schemas.MonteCarloRequest, db: Session = Depends(get_db)
):
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    comp_discounts = np.random.normal(
        data.competitor_discount_mean, data.competitor_discount_std, data.iterations
    )
    wins = 0

    my_scores = []
    competitor_scores = []

    max_tech = lot_cfg.max_tech_score
    max_econ = lot_cfg.max_econ_score

    # Use user-provided competitor tech score, or default to 90% of max
    comp_tech_mean = data.competitor_tech_score_mean if data.competitor_tech_score_mean is not None else max_tech * 0.9
    comp_tech_std = data.competitor_tech_score_std

    for c_disc in comp_discounts:
        c_disc = max(0, min(100, c_disc))
        p_comp = data.base_amount * (1 - (c_disc / 100))
        p_off = data.base_amount * (1 - (data.my_discount / 100))

        # Competitor tech score with variance around user-specified mean
        comp_tech_score = np.random.normal(loc=comp_tech_mean, scale=comp_tech_std)
        comp_tech_score = max(0, min(max_tech, comp_tech_score))

        # Determine actual best price
        p_best_actual = min(p_comp, p_off)

        # Our economic score
        econ_score = calculate_economic_score(
            data.base_amount, p_off, p_best_actual, lot_cfg.alpha, max_econ
        )
        my_total = data.current_tech_score + econ_score

        # Competitor economic score (against actual best)
        c_econ = calculate_economic_score(
            data.base_amount, p_comp, p_best_actual, lot_cfg.alpha, max_econ
        )
        comp_total = comp_tech_score + c_econ

        if my_total > comp_total:
            wins += 1

        my_scores.append(my_total)
        competitor_scores.append(comp_total)

    prob = (wins / data.iterations) * 100

    return {
        "win_probability": round(prob, 2),
        "iterations": data.iterations,
        "avg_total_score": round(float(np.mean(my_scores)), 2),
        "min_score": round(float(np.min(my_scores)), 2),
        "max_score": round(float(np.max(my_scores)), 2),
        "score_distribution": [round(s, 1) for s in my_scores[:50]],
        "competitor_avg_score": round(float(np.mean(competitor_scores)), 2),
        "competitor_min_score": round(float(np.min(competitor_scores)), 2),
        "competitor_max_score": round(float(np.max(competitor_scores)), 2),
        "competitor_threshold": round(float(np.mean(competitor_scores)), 2),
    }


@api_router.post("/optimize-discount")
def optimize_discount(data: schemas.OptimizeDiscountRequest, db: Session = Depends(get_db)):
    """
    Intelligent discount optimizer: suggests optimal discount to beat a specific competitor
    Returns 4 scenarios: Conservativo (70-80%), Bilanciato (80-90%), Aggressivo (90-95%), Max (95%+)
    """
    logger.info(f"Discount optimization requested for lot: {data.lot_key}")

    # Get lot configuration
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Calculate base prices
    p_base = data.base_amount
    p_comp = p_base * (1 - data.competitor_discount / 100)
    p_market_best = p_base * (1 - data.best_offer_discount / 100)

    # Initial competitor score (before we make our offer)
    initial_comp_econ = calculate_economic_score(
        p_base, p_comp, p_market_best, lot_cfg.alpha, lot_cfg.max_econ_score
    )
    initial_competitor_total = data.competitor_tech_score + initial_comp_econ

    logger.info(f"Optimizer: initial_competitor_total={initial_competitor_total:.2f}, my_tech={data.my_tech_score:.2f}, comp_econ={initial_comp_econ:.2f}")

    # Calculate the minimum discount needed to beat competitor
    # IMPORTANT: When our price beats the market best, competitor's score must be recalculated!
    min_discount_to_beat = None
    can_beat = False

    for test_disc in range(0, 71, 1):
        p_test = p_base * (1 - test_disc / 100)

        # Determine the actual best price (could be us, competitor, or market)
        p_actual_best = min(p_test, p_market_best)

        # Our economic score
        test_econ = calculate_economic_score(p_base, p_test, p_actual_best, lot_cfg.alpha, lot_cfg.max_econ_score)
        test_total = data.my_tech_score + test_econ

        # RECALCULATE competitor's score against the new best price
        comp_econ_updated = calculate_economic_score(p_base, p_comp, p_actual_best, lot_cfg.alpha, lot_cfg.max_econ_score)
        competitor_total_updated = data.competitor_tech_score + comp_econ_updated

        if test_total > competitor_total_updated:
            min_discount_to_beat = test_disc
            can_beat = True
            break

    if not can_beat:
        # Cannot beat competitor even with max discount - use high discounts anyway
        min_discount_to_beat = 70
        logger.info(f"WARNING: Cannot beat competitor even with 70% discount!")

    logger.info(f"Min discount to beat competitor: {min_discount_to_beat}% (can_beat={can_beat})")

    # Define 4 discount ranges that make sense
    # If can't beat: show progressive discounts to minimize loss
    # If can beat: show discounts around the threshold
    if not can_beat:
        # Ancoriamo gli scenari al best price di mercato per evitare proposte irrealistiche
        base = data.best_offer_discount
        deltas = [0, 2, 5, 8]  # step progressivi ma vicini al mercato
        scenario_names = ["Conservativo", "Bilanciato", "Aggressivo", "Max"]

        scenarios_config = []
        for name, d in zip(scenario_names, deltas):
            disc = min(70, max(0, base + d))
            scenarios_config.append({"name": name, "discount": disc})
    else:
        # Show discounts around minimum needed
        scenarios_config = [
            {"name": "Conservativo", "discount": max(min_discount_to_beat, 5)},
            {"name": "Bilanciato", "discount": max(min_discount_to_beat + 5, 15)},
            {"name": "Aggressivo", "discount": max(min_discount_to_beat + 10, 25)},
            {"name": "Max", "discount": max(min_discount_to_beat + 15, 35)},
        ]

    scenarios = []
    iterations = 200  # Monte Carlo iterations per scenario

    for scenario_cfg in scenarios_config:
        discount = scenario_cfg["discount"]

        logger.info(f"Simulating scenario: {scenario_cfg['name']}, discount={discount}%")

        # Calculate my score with this discount
        p_my = p_base * (1 - discount / 100)

        # Determine actual best price (could be us or market)
        p_actual_best_scenario = min(p_my, p_market_best)

        my_econ = calculate_economic_score(
            p_base, p_my, p_actual_best_scenario, lot_cfg.alpha, lot_cfg.max_econ_score
        )
        my_total = data.my_tech_score + my_econ

        # Competitor's score with our offer considered
        comp_econ_scenario = calculate_economic_score(
            p_base, p_comp, p_actual_best_scenario, lot_cfg.alpha, lot_cfg.max_econ_score
        )
        competitor_total_scenario = data.competitor_tech_score + comp_econ_scenario

        # Run Monte Carlo simulation to estimate win probability
        wins = 0
        for _ in range(iterations):
            # Add variance to competitor tech score
            comp_tech_var = np.random.normal(data.competitor_tech_score, 2.0)
            comp_tech_var = max(0, min(lot_cfg.max_tech_score, comp_tech_var))

            # Add variance to competitor discount (cannot exceed best_offer)
            comp_disc_var = np.random.normal(data.competitor_discount, 1.5)
            comp_disc_var = max(0, min(data.best_offer_discount, comp_disc_var))
            p_comp_var = p_base * (1 - comp_disc_var / 100)

            # Actual best in this Monte Carlo iteration (including our offer)
            p_actual_best_mc = min(p_my, p_comp_var, p_market_best)

            # Competitor economic score against actual best
            comp_econ_var = calculate_economic_score(
                p_base, p_comp_var, p_actual_best_mc, lot_cfg.alpha, lot_cfg.max_econ_score
            )
            comp_total_var = comp_tech_var + comp_econ_var

            # Our score against actual best (recalculate in case competitor beat market)
            my_econ_var = calculate_economic_score(
                p_base, p_my, p_actual_best_mc, lot_cfg.alpha, lot_cfg.max_econ_score
            )
            my_total_var = data.my_tech_score + my_econ_var

            if my_total_var > comp_total_var:
                wins += 1

        prob = (wins / iterations) * 100

        economic_impact = p_base - p_my
        delta_vs_competitor = my_total - competitor_total_scenario

        logger.info(f"  Result: prob={prob:.1f}%, my_total={my_total:.2f}, delta={delta_vs_competitor:.2f}")

        scenarios.append({
            "name": scenario_cfg["name"],
            "suggested_discount": round(discount, 2),
            "resulting_total_score": round(my_total, 2),
            "resulting_economic_score": round(my_econ, 2),
            "win_probability": round(prob, 1),
            "economic_impact": round(economic_impact, 2),
            "delta_vs_competitor": round(delta_vs_competitor, 2),
        })

    return {
        "competitor_total_score": round(initial_competitor_total, 2),
        "competitor_tech_score": round(data.competitor_tech_score, 2),
        "competitor_econ_score": round(initial_comp_econ, 2),
        "scenarios": scenarios
    }


@api_router.post("/export-pdf")
def export_pdf(data: schemas.ExportPDFRequest, db: Session = Depends(get_db)):
    """
    Export comprehensive PDF report matching Excel structure with
    professional formatting and branding.
    """
    logger.info(f"PDF export requested for lot: {data.lot_key}")

    # Get lot configuration
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Generate PDF using the comprehensive generator (same data as Excel)
    buffer = generate_pdf_report(
        lot_key=data.lot_key,
        lot_config=lot_cfg.model_dump(),
        base_amount=data.base_amount,
        my_discount=data.my_discount,
        competitor_discount=data.competitor_discount,
        technical_score=data.technical_score,
        economic_score=data.economic_score,
        total_score=data.total_score,
        details=data.details,
        weighted_scores=data.weighted_scores,
        category_scores=data.category_scores,
        max_tech_score=data.max_tech_score,
        max_econ_score=data.max_econ_score,
        alpha=data.alpha,
        win_probability=data.win_probability,
        tech_inputs_full=data.tech_inputs_full,
        rti_quotas=data.rti_quotas,
    )

    logger.info(f"PDF export completed for lot: {data.lot_key}")

    # Create safe filename
    safe_lot_key = data.lot_key.replace(' ', '_').replace('/', '_')
    filename = f"report_{safe_lot_key}.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@api_router.post("/export-excel")
def export_excel(data: schemas.ExportExcelRequest, db: Session = Depends(get_db)):
    """
    Export comprehensive Excel report with multiple sheets, formulas,
    conditional formatting, and RTI contribution analysis.
    """
    logger.info(f"Excel export requested for lot: {data.lot_key}")

    # Get lot configuration
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Generate Excel report
    buffer = generate_excel_report(
        lot_key=data.lot_key,
        lot_config=lot_cfg.model_dump(),
        base_amount=data.base_amount,
        my_discount=data.my_discount,
        competitor_discount=data.competitor_discount,
        technical_score=data.technical_score,
        economic_score=data.economic_score,
        total_score=data.total_score,
        details=data.details,
        weighted_scores=data.weighted_scores,
        category_scores=data.category_scores,
        max_tech_score=data.max_tech_score,
        max_econ_score=data.max_econ_score,
        alpha=data.alpha,
        win_probability=data.win_probability,
        tech_inputs_full=data.tech_inputs_full,
        rti_quotas=data.rti_quotas,
    )

    logger.info(f"Excel export completed for lot: {data.lot_key}")

    # Create safe filename
    safe_lot_key = data.lot_key.replace(' ', '_').replace('/', '_')
    filename = f"report_{safe_lot_key}.xlsx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# --- CERTIFICATE VERIFICATION ENDPOINTS ---

@api_router.get("/verify-certs/status")
def get_cert_verification_status():
    """
    Check if OCR dependencies are available for certificate verification.
    Returns status of pytesseract, pdf2image, Pillow, and poppler.
    """
    try:
        from services.cert_verification_service import check_ocr_available
        return check_ocr_available()
    except ImportError as e:
        return {
            "ocr_available": False,
            "error": str(e),
            "message": "OCR dependencies not installed. Run: pip install pytesseract pdf2image Pillow"
        }


@api_router.post("/verify-certs")
def verify_certificates(
    folder_path: str,
    lot_key: str = None,
    db: Session = Depends(get_db),
):
    """
    Verify all PDF certificates in a folder using OCR.
    
    Args:
        folder_path: Absolute path to the folder containing PDF certificates
        lot_key: Optional lot key to get expected cert names from Requisiti Tecnici
    
    Returns:
        Verification results with summary and per-file details
    """
    # Normalize path: strip quotes, expand user, normalize, map /Users/<user>/... -> /host_home/<rest> if exists (Docker)
    raw_path = folder_path.strip().strip("'").strip('"').strip()
    normalized_path = os.path.normpath(os.path.expanduser(raw_path)) if raw_path else ""
    if normalized_path.startswith("/Users/"):
        parts = normalized_path.split("/", 3)  # ["", "Users", "user", "rest"]
        if len(parts) >= 4:
            candidate = "/host_home/" + parts[3]
            if os.path.exists(candidate):
                normalized_path = candidate
    folder_path = normalized_path
    
    logger.info(f"Certificate verification requested for folder: {folder_path}, lot_key: {lot_key}")
    
    # Build mapping of req_id -> expected cert names from lot config
    expected_certs_map = {}
    if lot_key:
        lot_config = crud.get_lot_config(db, lot_key)
        if lot_config and lot_config.reqs:
            for req in lot_config.reqs:
                req_id = req.get("id", "")
                # Get selected_prof_certs as expected cert names
                selected_certs = req.get("selected_prof_certs", [])
                if selected_certs:
                    expected_certs_map[req_id] = selected_certs
    
    try:
        from services.cert_verification_service import CertVerificationService, OCR_AVAILABLE
        
        if not OCR_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="OCR dependencies not available. Install with: pip install pytesseract pdf2image Pillow"
            )
        
        # Load vendors and settings from database
        vendors = CertVerificationService.load_vendors_from_db(db)
        settings = CertVerificationService.load_settings_from_db(db)
        service = CertVerificationService(vendors=vendors, settings=settings)
        results = service.verify_folder(folder_path, req_filter=None)
        
        # Enrich results with expected cert names from lot config
        if expected_certs_map and results.get("results"):
            for r in results["results"]:
                req_code = r.get("req_code", "")
                if req_code and req_code in expected_certs_map:
                    r["expected_cert_names"] = expected_certs_map[req_code]
        
        logger.info(
            f"Certificate verification completed",
            extra={
                "folder": folder_path,
                "total": results.get("summary", {}).get("total", 0),
                "valid": results.get("summary", {}).get("valid", 0)
            }
        )
        
        return results
        
    except ImportError as e:
        logger.error(f"OCR import error: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"OCR dependencies not available: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Certificate verification error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Certificate verification failed: {str(e)}"
        )


@api_router.post("/verify-certs/stream")
def verify_certificates_stream(
    folder_path: str,
    lot_key: str = None,
    db: Session = Depends(get_db),
):
    """
    Stream certificate verification progress using Server-Sent Events (SSE).
    Sends progress events for each file processed, then a final 'done' event with complete results.
    """
    import json
    from pathlib import Path
    
    # Normalize path (same as regular endpoint)
    raw_path = folder_path.strip().strip("'").strip('"').strip()
    normalized_path = os.path.normpath(os.path.expanduser(raw_path)) if raw_path else ""
    if normalized_path.startswith("/Users/"):
        parts = normalized_path.split("/", 3)
        if len(parts) >= 4:
            candidate = "/host_home/" + parts[3]
            if os.path.exists(candidate):
                normalized_path = candidate
    folder_path = normalized_path
    
    # Build expected_certs_map from lot config
    expected_certs_map = {}
    if lot_key:
        lot_config = crud.get_lot_config(db, lot_key)
        if lot_config and lot_config.reqs:
            for req in lot_config.reqs:
                req_id = req.get("id", "")
                selected_certs = req.get("selected_prof_certs", [])
                if selected_certs:
                    expected_certs_map[req_id] = selected_certs
    
    # Load vendors and settings from DB before generator (captured in closure)
    from services.cert_verification_service import CertVerificationService, OCR_AVAILABLE
    vendors = CertVerificationService.load_vendors_from_db(db)
    settings = CertVerificationService.load_settings_from_db(db)
    
    def generate():
        cancelled = False
        results = []  # Initialize early for GeneratorExit handling
        try:
            if not OCR_AVAILABLE:
                yield f"data: {json.dumps({'type': 'error', 'message': 'OCR not available'})}\n\n"
                return
            
            folder = Path(folder_path)
            if not folder.exists():
                yield f"data: {json.dumps({'type': 'error', 'message': f'Folder not found: {folder_path}'})}\n\n"
                return
            
            # Find all PDFs
            pdf_files = list(folder.rglob("*.pdf")) + list(folder.rglob("*.PDF"))
            total = len(pdf_files)
            
            if total == 0:
                yield f"data: {json.dumps({'type': 'done', 'results': {'success': True, 'warning': 'No PDF files found', 'results': [], 'summary': {'total': 0}}})}\n\n"
                return
            
            # Send initial progress
            yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
            
            service = CertVerificationService(vendors=vendors, settings=settings)
            
            for i, pdf_path in enumerate(pdf_files):
                # Send progress update
                yield f"data: {json.dumps({'type': 'progress', 'current': i + 1, 'total': total, 'filename': pdf_path.name})}\n\n"
                
                # Process file
                result = service.verify_certificate(str(pdf_path))
                result_dict = result.to_dict()
                
                # Store relative path from folder root for retry support
                try:
                    relative_path = pdf_path.relative_to(folder)
                    result_dict["filename"] = str(relative_path)
                except ValueError:
                    pass  # Keep basename if relative_to fails
                
                # Enrich with expected cert names
                req_code = result_dict.get("req_code", "")
                if req_code and req_code in expected_certs_map:
                    result_dict["expected_cert_names"] = expected_certs_map[req_code]
                
                results.append(result_dict)
            
            # Build summary
            summary = {
                "total": len(results),
                "valid": sum(1 for r in results if r["status"] == "valid"),
                "expired": sum(1 for r in results if r["status"] == "expired"),
                "mismatch": sum(1 for r in results if r["status"] == "mismatch"),
                "unreadable": sum(1 for r in results if r["status"] == "unreadable"),
                "error": sum(1 for r in results if r["status"] == "error"),
                "by_requirement": {},
                "by_resource": {},
            }
            
            for r in results:
                req = r["req_code"]
                if req not in summary["by_requirement"]:
                    summary["by_requirement"][req] = {"total": 0, "valid": 0}
                summary["by_requirement"][req]["total"] += 1
                if r["status"] == "valid":
                    summary["by_requirement"][req]["valid"] += 1
                    
                res = r["resource_name"]
                if res not in summary["by_resource"]:
                    summary["by_resource"][res] = {"total": 0, "valid": 0}
                summary["by_resource"][res]["total"] += 1
                if r["status"] == "valid":
                    summary["by_resource"][res]["valid"] += 1
            
            final_result = {
                "success": True,
                "folder": folder_path,
                "results": results,
                "summary": summary
            }
            
            yield f"data: {json.dumps({'type': 'done', 'results': final_result})}\n\n"
            
        except GeneratorExit:
            # Client disconnected - this is expected behavior
            cancelled = True
            logger.info(f"SSE client disconnected during cert verification (processed {len(results)} files)")
        except Exception as e:
            logger.error(f"Streaming cert verification error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            if cancelled:
                logger.debug("SSE stream cancelled by client")
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@api_router.post("/verify-certs/single")
def verify_single_certificate(pdf_path: str, db: Session = Depends(get_db)):
    """
    Verify a single PDF certificate using OCR.
    
    Args:
        pdf_path: Absolute path to the PDF file
    
    Returns:
        Verification result with extracted data
    """
    logger.info(f"Single certificate verification requested: {pdf_path}")
    
    try:
        from services.cert_verification_service import CertVerificationService, OCR_AVAILABLE
        
        if not OCR_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="OCR dependencies not available"
            )
        
        import os
        if not os.path.exists(pdf_path):
            raise HTTPException(status_code=404, detail=f"File not found: {pdf_path}")
        
        vendors = CertVerificationService.load_vendors_from_db(db)
        settings = CertVerificationService.load_settings_from_db(db)
        service = CertVerificationService(vendors=vendors, settings=settings)
        result = service.verify_certificate(pdf_path)
        
        return result.to_dict()
        
    except ImportError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"Certificate verification error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/verify-certs/upload")
async def verify_certs_upload(
    file: UploadFile = File(...),
    req_filter: Optional[str] = None,
    lot_key: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Verify certificates from an uploaded ZIP file.
    
    The ZIP can contain PDF files directly or a folder structure with PDFs.
    Files are extracted to a temporary directory, processed, then cleaned up.
    
    Args:
        file: ZIP file containing PDF certificates
        req_filter: Optional requirement code filter
        lot_key: Optional lot key to load expected certifications
    
    Returns:
        Verification results with summary
    """
    logger.info(f"ZIP upload verification requested: {file.filename}")
    
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.zip'):
        raise HTTPException(
            status_code=400,
            detail="Il file deve essere un archivio ZIP"
        )
    
    try:
        from services.cert_verification_service import CertVerificationService, OCR_AVAILABLE
        
        if not OCR_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="OCR dependencies not available on this server"
            )
        
        # Create temporary directory for extraction
        temp_dir = tempfile.mkdtemp(prefix="cert_verify_")
        logger.info(f"Created temp directory: {temp_dir}")
        
        try:
            # Save uploaded file to temp location
            zip_path = os.path.join(temp_dir, "upload.zip")
            with open(zip_path, "wb") as f:
                content = await file.read()
                f.write(content)
            
            # Extract ZIP
            extract_dir = os.path.join(temp_dir, "extracted")
            os.makedirs(extract_dir, exist_ok=True)
            
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    # Security: check for path traversal attacks
                    for member in zip_ref.namelist():
                        member_path = os.path.realpath(os.path.join(extract_dir, member))
                        if not member_path.startswith(os.path.realpath(extract_dir)):
                            raise HTTPException(
                                status_code=400,
                                detail="ZIP file contains unsafe paths"
                            )
                    zip_ref.extractall(extract_dir)
            except zipfile.BadZipFile:
                raise HTTPException(
                    status_code=400,
                    detail="Il file ZIP non è valido o è corrotto"
                )
            
            # Remove __MACOSX folder if present (macOS artifact)
            macosx_dir = os.path.join(extract_dir, "__MACOSX")
            if os.path.exists(macosx_dir):
                shutil.rmtree(macosx_dir)
            
            # Check if there's a single folder inside, if so use that as root
            items = [f for f in os.listdir(extract_dir) if not f.startswith('.')]
            if len(items) == 1:
                single_item = os.path.join(extract_dir, items[0])
                if os.path.isdir(single_item):
                    extract_dir = single_item
            
            # Load vendors and settings from database
            vendors = CertVerificationService.load_vendors_from_db(db)
            settings = CertVerificationService.load_settings_from_db(db)
            service = CertVerificationService(vendors=vendors, settings=settings)
            
            # Build expected certs map if lot_key provided
            expected_certs_map = {}
            if lot_key:
                from models import LotConfigModel
                lot_config = db.query(LotConfigModel).filter(LotConfigModel.name == lot_key).first()
                if lot_config and lot_config.requirements_config:
                    for req in lot_config.requirements_config:
                        req_code = req.get("codice_requisito", "")
                        cert_names = req.get("certificazione", "")
                        if req_code and cert_names:
                            expected_certs_map[req_code] = [c.strip() for c in cert_names.split(",")]
            
            # Verify folder
            result = service.verify_folder(extract_dir, req_filter=req_filter)
            
            # Enrich results with expected cert names
            if expected_certs_map and result.get("results"):
                for r in result["results"]:
                    req_code = r.get("req_code", "")
                    if req_code in expected_certs_map:
                        r["expected_cert_names"] = expected_certs_map[req_code]
            
            # Add upload info to result
            result["upload_filename"] = file.filename
            
            logger.info(f"ZIP verification complete: {result.get('summary', {}).get('total', 0)} files processed")
            return result
            
        finally:
            # Always cleanup temp directory
            try:
                shutil.rmtree(temp_dir)
                logger.info(f"Cleaned up temp directory: {temp_dir}")
            except Exception as cleanup_err:
                logger.warning(f"Failed to cleanup temp directory {temp_dir}: {cleanup_err}")
    
    except HTTPException:
        raise
    except ImportError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        logger.error(f"ZIP verification error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/verify-certs/upload/stream")
async def verify_certs_upload_stream(
    file: UploadFile = File(...),
    req_filter: Optional[str] = None,
    lot_key: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Verify certificates from uploaded ZIP with streaming progress (SSE).
    
    Returns Server-Sent Events with progress updates during processing.
    """
    logger.info(f"ZIP upload streaming verification: {file.filename}")
    
    # Validate file type
    if not file.filename or not file.filename.lower().endswith('.zip'):
        raise HTTPException(
            status_code=400,
            detail="Il file deve essere un archivio ZIP"
        )
    
    try:
        from services.cert_verification_service import CertVerificationService, OCR_AVAILABLE
        
        if not OCR_AVAILABLE:
            raise HTTPException(
                status_code=503,
                detail="OCR dependencies not available"
            )
    except ImportError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    # Read file content upfront (can't read inside generator)
    file_content = await file.read()
    upload_filename = file.filename
    
    # Load DB data upfront
    vendors = CertVerificationService.load_vendors_from_db(db)
    settings = CertVerificationService.load_settings_from_db(db)
    
    expected_certs_map = {}
    if lot_key:
        from models import LotConfigModel
        lot_config = db.query(LotConfigModel).filter(LotConfigModel.name == lot_key).first()
        if lot_config and lot_config.requirements_config:
            for req in lot_config.requirements_config:
                req_code = req.get("codice_requisito", "")
                cert_names = req.get("certificazione", "")
                if req_code and cert_names:
                    expected_certs_map[req_code] = [c.strip() for c in cert_names.split(",")]
    
    import json
    from pathlib import Path
    
    def generate():
        temp_dir = None
        results = []
        cancelled = False
        
        try:
            # Create temp directory
            temp_dir = tempfile.mkdtemp(prefix="cert_verify_stream_")
            
            # Save and extract ZIP
            zip_path = os.path.join(temp_dir, "upload.zip")
            with open(zip_path, "wb") as f:
                f.write(file_content)
            
            extract_dir = os.path.join(temp_dir, "extracted")
            os.makedirs(extract_dir)
            
            try:
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    for member in zip_ref.namelist():
                        member_path = os.path.realpath(os.path.join(extract_dir, member))
                        if not member_path.startswith(os.path.realpath(extract_dir)):
                            yield f"data: {json.dumps({'type': 'error', 'message': 'ZIP contains unsafe paths'})}\n\n"
                            return
                    zip_ref.extractall(extract_dir)
            except zipfile.BadZipFile:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Invalid or corrupted ZIP file'})}\n\n"
                return
            
            # Remove macOS artifacts
            macosx_dir = os.path.join(extract_dir, "__MACOSX")
            if os.path.exists(macosx_dir):
                shutil.rmtree(macosx_dir)
            
            # Check for single root folder
            items = [f for f in os.listdir(extract_dir) if not f.startswith('.')]
            if len(items) == 1:
                single_item = os.path.join(extract_dir, items[0])
                if os.path.isdir(single_item):
                    extract_dir = single_item
            
            folder = Path(extract_dir)
            pdf_files = list(folder.rglob("*.pdf")) + list(folder.rglob("*.PDF"))
            total = len(pdf_files)
            
            if total == 0:
                yield f"data: {json.dumps({'type': 'done', 'results': {'success': True, 'warning': 'No PDF files found in ZIP', 'results': [], 'summary': {'total': 0}}})}\n\n"
                return
            
            yield f"data: {json.dumps({'type': 'start', 'total': total, 'filename': upload_filename})}\n\n"
            
            service = CertVerificationService(vendors=vendors, settings=settings)
            
            for i, pdf_path in enumerate(pdf_files):
                yield f"data: {json.dumps({'type': 'progress', 'current': i + 1, 'total': total, 'filename': pdf_path.name})}\n\n"
                
                result = service.verify_certificate(str(pdf_path))
                result_dict = result.to_dict()
                
                req_code = result_dict.get("req_code", "")
                if req_code and req_code in expected_certs_map:
                    result_dict["expected_cert_names"] = expected_certs_map[req_code]
                
                # Apply filter
                if req_filter and result_dict.get("req_code") != req_filter:
                    continue
                
                results.append(result_dict)
            
            # Build summary
            summary = {
                "total": len(results),
                "valid": sum(1 for r in results if r["status"] == "valid"),
                "expired": sum(1 for r in results if r["status"] == "expired"),
                "mismatch": sum(1 for r in results if r["status"] == "mismatch"),
                "unreadable": sum(1 for r in results if r["status"] == "unreadable"),
                "error": sum(1 for r in results if r["status"] == "error"),
                "by_requirement": {},
                "by_resource": {},
            }
            
            for r in results:
                req = r["req_code"]
                if req not in summary["by_requirement"]:
                    summary["by_requirement"][req] = {"total": 0, "valid": 0}
                summary["by_requirement"][req]["total"] += 1
                if r["status"] == "valid":
                    summary["by_requirement"][req]["valid"] += 1
                
                res = r["resource_name"]
                if res not in summary["by_resource"]:
                    summary["by_resource"][res] = {"total": 0, "valid": 0}
                summary["by_resource"][res]["total"] += 1
                if r["status"] == "valid":
                    summary["by_resource"][res]["valid"] += 1
            
            final_result = {
                "success": True,
                "upload_filename": upload_filename,
                "results": results,
                "summary": summary
            }
            
            yield f"data: {json.dumps({'type': 'done', 'results': final_result})}\n\n"
            
        except GeneratorExit:
            cancelled = True
            logger.info(f"SSE client disconnected during ZIP verification (processed {len(results)} files)")
        except Exception as e:
            logger.error(f"Streaming ZIP verification error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
        finally:
            # Cleanup temp directory
            if temp_dir:
                try:
                    shutil.rmtree(temp_dir)
                except Exception:
                    pass
            if cancelled:
                logger.debug("SSE stream cancelled by client")
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# --- VENDOR CONFIG ENDPOINTS ---

@api_router.get("/vendor-configs", response_model=List[schemas.VendorConfig])
def get_vendor_configs(
    enabled_only: bool = False, 
    skip: int = 0,
    limit: int = None,
    db: Session = Depends(get_db)
):
    """Get all vendor configurations for certificate verification with optional pagination."""
    vendors = crud.get_vendor_configs(db, enabled_only=enabled_only, skip=skip, limit=limit)
    return [
        schemas.VendorConfig(
            key=v.key,
            name=v.name,
            aliases=v.aliases or [],
            cert_patterns=v.cert_patterns or [],
            enabled=v.enabled == "1"
        )
        for v in vendors
    ]


@api_router.get("/vendor-configs/{key}", response_model=schemas.VendorConfig)
def get_vendor_config(key: str, db: Session = Depends(get_db)):
    """Get a specific vendor configuration."""
    vendor = crud.get_vendor_config(db, key.lower())
    if not vendor:
        raise HTTPException(status_code=404, detail=f"Vendor '{key}' not found")
    return schemas.VendorConfig(
        key=vendor.key,
        name=vendor.name,
        aliases=vendor.aliases or [],
        cert_patterns=vendor.cert_patterns or [],
        enabled=vendor.enabled == "1"
    )


@api_router.post("/vendor-configs", response_model=schemas.VendorConfig)
def create_vendor_config(vendor: schemas.VendorConfig, db: Session = Depends(get_db)):
    """Create a new vendor configuration."""
    existing = crud.get_vendor_config(db, vendor.key.lower())
    if existing:
        raise HTTPException(status_code=400, detail=f"Vendor '{vendor.key}' already exists")
    db_vendor = crud.create_vendor_config(db, vendor)
    return schemas.VendorConfig(
        key=db_vendor.key,
        name=db_vendor.name,
        aliases=db_vendor.aliases or [],
        cert_patterns=db_vendor.cert_patterns or [],
        enabled=db_vendor.enabled == "1"
    )


@api_router.put("/vendor-configs/{key}", response_model=schemas.VendorConfig)
def update_vendor_config(key: str, vendor_update: schemas.VendorConfigUpdate, db: Session = Depends(get_db)):
    """Update an existing vendor configuration."""
    db_vendor = crud.update_vendor_config(db, key.lower(), vendor_update)
    if not db_vendor:
        raise HTTPException(status_code=404, detail=f"Vendor '{key}' not found")
    return schemas.VendorConfig(
        key=db_vendor.key,
        name=db_vendor.name,
        aliases=db_vendor.aliases or [],
        cert_patterns=db_vendor.cert_patterns or [],
        enabled=db_vendor.enabled == "1"
    )


@api_router.delete("/vendor-configs/{key}")
def delete_vendor_config(key: str, db: Session = Depends(get_db)):
    """Delete a vendor configuration."""
    if not crud.delete_vendor_config(db, key.lower()):
        raise HTTPException(status_code=404, detail=f"Vendor '{key}' not found")
    return {"status": "success", "message": f"Vendor '{key}' deleted"}


# --- OCR SETTINGS ENDPOINTS ---

@api_router.get("/ocr-settings", response_model=List[schemas.OCRSetting])
def get_ocr_settings(db: Session = Depends(get_db)):
    """Get all OCR settings."""
    settings = crud.get_ocr_settings(db)
    return [schemas.OCRSetting(key=s.key, value=s.value, description=s.description) for s in settings]


@api_router.get("/ocr-settings/{key}", response_model=schemas.OCRSetting)
def get_ocr_setting(key: str, db: Session = Depends(get_db)):
    """Get a specific OCR setting."""
    setting = crud.get_ocr_setting(db, key)
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return schemas.OCRSetting(key=setting.key, value=setting.value, description=setting.description)


@api_router.put("/ocr-settings/{key}", response_model=schemas.OCRSetting)
def update_ocr_setting(key: str, setting: schemas.OCRSetting, db: Session = Depends(get_db)):
    """Create or update an OCR setting."""
    setting.key = key  # Ensure key matches path
    db_setting = crud.upsert_ocr_setting(db, setting)
    return schemas.OCRSetting(key=db_setting.key, value=db_setting.value, description=db_setting.description)


@api_router.delete("/ocr-settings/{key}")
def delete_ocr_setting(key: str, db: Session = Depends(get_db)):
    """Delete an OCR setting."""
    if not crud.delete_ocr_setting(db, key):
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    return {"status": "success", "message": f"Setting '{key}' deleted"}


@api_router.get("/cert-verification-config", response_model=schemas.CertVerificationConfig)
def get_cert_verification_config(db: Session = Depends(get_db)):
    """Get complete certificate verification configuration (vendors + settings)."""
    vendors = crud.get_vendor_configs(db)
    settings = crud.get_ocr_settings(db)
    
    return schemas.CertVerificationConfig(
        vendors=[
            schemas.VendorConfig(
                key=v.key,
                name=v.name,
                aliases=v.aliases or [],
                cert_patterns=v.cert_patterns or [],
                enabled=v.enabled == "1"
            )
            for v in vendors
        ],
        settings={s.key: s.value for s in settings}
    )


# --- BUSINESS PLAN ENDPOINTS ---

bp_router = APIRouter(prefix="/api/business-plan", tags=["Business Plan"])


@bp_router.get("/{lot_key}", response_model=schemas.BusinessPlanResponse)
def get_business_plan(lot_key: str, db: Session = Depends(get_db)):
    """Get business plan for a lot"""
    bp = crud.get_business_plan(db, lot_key)
    if not bp:
        raise HTTPException(status_code=404, detail=f"Business plan per '{lot_key}' non trovato")
    return bp


@bp_router.post("/{lot_key}", response_model=schemas.BusinessPlanResponse)
def create_or_update_business_plan(
    lot_key: str,
    data: schemas.BusinessPlanCreate,
    db: Session = Depends(get_db)
):
    """Create or update a business plan for a lot"""
    try:
        # Verify lot exists
        lot = crud.get_lot_config(db, lot_key)
        if not lot:
            raise HTTPException(status_code=404, detail=f"Lotto '{lot_key}' non trovato")

        existing = crud.get_business_plan(db, lot_key)
        if existing:
            bp = crud.update_business_plan(db, lot_key, data)
        else:
            bp = crud.create_business_plan(db, lot_key, data)
        return bp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving business plan for lot '{lot_key}': {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Errore nel salvataggio del Business Plan")


@bp_router.delete("/{lot_key}")
def delete_business_plan(lot_key: str, db: Session = Depends(get_db)):
    """Delete a business plan"""
    if not crud.delete_business_plan(db, lot_key):
        raise HTTPException(status_code=404, detail=f"Business plan per '{lot_key}' non trovato")
    return {"status": "success", "message": f"Business plan per '{lot_key}' eliminato"}


@bp_router.post("/{lot_key}/calculate", response_model=schemas.BusinessPlanCalculateResponse)
def calculate_business_plan(
    lot_key: str,
    calc_request: schemas.BusinessPlanCalculateRequest,
    db: Session = Depends(get_db)
):
    """Calculate costs and margin for a business plan"""
    bp = crud.get_business_plan(db, lot_key)
    if not bp:
        raise HTTPException(status_code=404, detail=f"Business plan per '{lot_key}' non trovato")

    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail=f"Lotto '{lot_key}' non trovato")

    # Calculate team cost from composition if available
    team_cost = 0.0
    tow_breakdown = {}
    lutech_breakdown = {}
    if bp.team_composition:
        # Build profile_rates from practices catalog
        # Format: {practice_id:profile_id: daily_rate}
        # Falls back to default_daily_rate if profile not found
        practices = crud.get_practices(db)
        profile_rates = {}
        for practice in practices:
            for profile in (practice.profiles or []):
                profile_id = profile.get('id', '')
                if profile_id:
                    key = f"{practice.id}:{profile_id}"
                    profile_rates[key] = float(profile.get('daily_rate', 0.0))

        team_result = BusinessPlanService.calculate_team_cost(
            team_composition=bp.team_composition,
            volume_adjustments=bp.volume_adjustments or {},
            reuse_factor=bp.reuse_factor or 0.0,
            profile_mappings=bp.profile_mappings or {},
            profile_rates=profile_rates,
            duration_months=bp.duration_months or 36,
            default_daily_rate=bp.default_daily_rate or 250.0,
            inflation_pct=bp.inflation_pct or 0.0,
        )
        team_cost = team_result["total_cost"]
        tow_breakdown = team_result["by_tow"]
        lutech_breakdown = team_result["by_lutech_profile"]
    else:
        # No team composition defined - cannot calculate costs
        team_cost = 0.0

    # Calculate overhead costs
    # Governance: supports manual override, profile mix, or percentage fallback
    governance_cost = 0.0
    if bp.governance_cost_manual is not None:
        # Manual override
        governance_cost = float(bp.governance_cost_manual)
    elif bp.governance_profile_mix and len(bp.governance_profile_mix) > 0:
        # Calculate based on governance FTE and profile mix
        total_fte = sum(float(m.get("fte", 0)) for m in (bp.team_composition or []))
        governance_pct = bp.governance_pct or 0.04
        governance_fte = total_fte * governance_pct
        duration_months = bp.duration_months or 36
        duration_years = duration_months / 12
        days_per_fte = bp.days_per_fte or 220.0

        total_pct = 0.0
        weighted_rate = 0.0
        for item in bp.governance_profile_mix:
            lutech_profile = item.get("lutech_profile", "")
            pct = float(item.get("pct", 0)) / 100
            rate = profile_rates.get(lutech_profile, bp.default_daily_rate or 250.0)
            total_pct += pct
            weighted_rate += rate * pct

        if total_pct > 0:
            avg_rate = weighted_rate / total_pct
            inflation_pct_val = bp.inflation_pct or 0.0
            if inflation_pct_val > 0:
                # Year-by-year escalation for team_mix governance
                inflated_gov_cost = 0.0
                total_years = -(-duration_months // 12)  # ceiling division without math.ceil
                for yr in range(total_years):
                    yr_start = yr * 12 + 1
                    yr_end = min((yr + 1) * 12, duration_months)
                    yr_fraction = (yr_end - yr_start + 1) / 12
                    yr_inflation = (1 + inflation_pct_val / 100) ** yr
                    inflated_gov_cost += governance_fte * days_per_fte * yr_fraction * avg_rate * yr_inflation
                governance_cost = inflated_gov_cost
            else:
                governance_cost = governance_fte * days_per_fte * duration_years * avg_rate
    else:
        # Fallback: percentage of team cost (team_cost already has inflation applied)
        governance_cost = team_cost * (bp.governance_pct or 0.04)

    # Apply reuse factor to governance if enabled
    if bp.governance_apply_reuse and (bp.reuse_factor or 0) > 0:
        reuse_factor = bp.reuse_factor or 0
        governance_cost = governance_cost * (1 - reuse_factor)

    # Risk includes governance cost (aligned with frontend calculation)
    risk_cost = (team_cost + governance_cost) * (bp.risk_contingency_pct or 0.03)

    # Subcontract
    sub_config = bp.subcontract_config or {}
    sub_quota = float(sub_config.get("quota_pct", 0.0))
    subcontract_cost = team_cost * sub_quota

    total_cost = team_cost + governance_cost + risk_cost + subcontract_cost

    # Calculate margin
    margin_result = BusinessPlanService.calculate_margin(
        base_amount=lot.base_amount,
        total_cost=total_cost,
        discount_pct=calc_request.discount_pct,
        is_rti=calc_request.is_rti,
        quota_lutech=calc_request.quota_lutech,
    )

    # Calculate savings percentage using the weighted average from service if available
    # fallback to simple calculation
    original_fte = sum(float(m.get("fte", 0)) for m in (bp.team_composition or []))
    effective_fte = original_fte
    if bp.volume_adjustments:
        global_factor = bp.volume_adjustments.get("global", 1.0)
        effective_fte = original_fte * global_factor * (1 - (bp.reuse_factor or 0.0))
    savings_pct = ((original_fte - effective_fte) / original_fte * 100) if original_fte > 0 else 0

    return schemas.BusinessPlanCalculateResponse(
        team_cost=round(team_cost, 2),
        governance_cost=round(governance_cost, 2),
        risk_cost=round(risk_cost, 2),
        subcontract_cost=round(subcontract_cost, 2),
        total_cost=round(total_cost, 2),
        total_revenue=margin_result["revenue"],
        margin=margin_result["margin"],
        margin_pct=margin_result["margin_pct"],
        tow_breakdown=tow_breakdown,
        lutech_breakdown=lutech_breakdown,
        intervals=team_result.get("intervals", []) if bp.team_composition else [],
        savings_pct=round(savings_pct, 2),
    )


@bp_router.get("/{lot_key}/scenarios")
def get_business_plan_scenarios(lot_key: str, db: Session = Depends(get_db)):
    """Generate 3 scenarios (Conservative/Balanced/Aggressive) for a business plan"""
    bp = crud.get_business_plan(db, lot_key)
    if not bp:
        raise HTTPException(status_code=404, detail=f"Business plan per '{lot_key}' non trovato")

    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail=f"Lotto '{lot_key}' non trovato")

    # Calculate team cost dynamically (same logic as calculate endpoint)
    team_cost = 0.0
    if bp.team_composition:
        practices = crud.get_practices(db)
        profile_rates = {}
        for practice in practices:
            for profile in (practice.profiles or []):
                profile_id = profile.get('id', '')
                if profile_id:
                    key = f"{practice.id}:{profile_id}"
                    profile_rates[key] = float(profile.get('daily_rate', 0.0))

        team_result = BusinessPlanService.calculate_team_cost(
            team_composition=bp.team_composition,
            volume_adjustments=bp.volume_adjustments or {},
            reuse_factor=bp.reuse_factor or 0.0,
            profile_mappings=bp.profile_mappings or {},
            profile_rates=profile_rates,
            duration_months=bp.duration_months or 36,
            default_daily_rate=bp.default_daily_rate or 250.0,
            inflation_pct=bp.inflation_pct or 0.0,
        )
        team_cost = team_result["total_cost"]

    bp_data = {
        "total_cost": team_cost,
        "reuse_factor": bp.reuse_factor or 0.0,
        "volume_adjustments": bp.volume_adjustments or {},
    }

    # Generate scenarios with full recalculation
    scenarios = BusinessPlanService.generate_scenarios(
        bp_data=bp_data,
        base_amount=lot.base_amount,
        team_composition=bp.team_composition,
        volume_adjustments=bp.volume_adjustments or {},
        profile_mappings=bp.profile_mappings or {},
        profile_rates=profile_rates if bp.team_composition else {},
        duration_months=bp.duration_months or 36,
        default_daily_rate=bp.default_daily_rate or 250.0,
        governance_pct=bp.governance_pct or 0.04,
        risk_contingency_pct=bp.risk_contingency_pct or 0.03,
        subcontract_config=bp.subcontract_config or {},
    )
    return {"scenarios": scenarios}


@bp_router.get("/{lot_key}/find-discount")
def find_discount_for_target(
    lot_key: str,
    target_margin: float = 15.0,
    db: Session = Depends(get_db)
):
    """Find the discount needed to reach a target margin"""
    bp = crud.get_business_plan(db, lot_key)
    if not bp:
        raise HTTPException(status_code=404, detail=f"Business plan per '{lot_key}' non trovato")

    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail=f"Lotto '{lot_key}' non trovato")

    # Calculate team cost dynamically
    team_cost = 0.0
    if bp.team_composition:
        practices = crud.get_practices(db)
        profile_rates = {}
        for practice in practices:
            for profile in (practice.profiles or []):
                profile_id = profile.get('id', '')
                if profile_id:
                    key = f"{practice.id}:{profile_id}"
                    profile_rates[key] = float(profile.get('daily_rate', 0.0))

        team_result = BusinessPlanService.calculate_team_cost(
            team_composition=bp.team_composition,
            volume_adjustments=bp.volume_adjustments or {},
            reuse_factor=bp.reuse_factor or 0.0,
            profile_mappings=bp.profile_mappings or {},
            profile_rates=profile_rates,
            duration_months=bp.duration_months or 36,
            default_daily_rate=bp.default_daily_rate or 250.0,
            inflation_pct=bp.inflation_pct or 0.0,
        )
        team_cost = team_result["total_cost"]

    bp_data = {
        "total_cost": team_cost,
        "governance_pct": bp.governance_pct,
        "risk_contingency_pct": bp.risk_contingency_pct,
        "subcontract_config": bp.subcontract_config or {},
    }

    cost_breakdown = BusinessPlanService.calculate_total_cost(bp_data)

    is_rti = lot.rti_enabled
    quota_lutech = lot.rti_quotas.get("Lutech", 100) / 100 if is_rti and lot.rti_quotas else 1.0

    suggested_discount = BusinessPlanService.find_discount_for_margin(
        base_amount=lot.base_amount,
        total_cost=cost_breakdown["total"],
        target_margin_pct=target_margin,
        is_rti=is_rti,
        quota_lutech=quota_lutech,
    )

    return {
        "target_margin_pct": target_margin,
        "suggested_discount_pct": suggested_discount,
        "total_cost": cost_breakdown["total"],
        "base_amount": lot.base_amount,
    }


@bp_router.post("/export-excel")
def export_business_plan_excel(data: schemas.ExportBusinessPlanRequest, db: Session = Depends(get_db)):
    """
    Export Business Plan comprehensive Excel report with multiple sheets,
    formulas, conditional formatting, and validations.
    """
    logger.info(f"Business Plan Excel export requested for lot: {data.lot_key}")

    # Generate Excel report
    try:
        buffer = generate_business_plan_excel(
            lot_key=data.lot_key,
            business_plan=data.business_plan,
            costs=data.costs,
            clean_team_cost=data.clean_team_cost,
            base_amount=data.base_amount,
            is_rti=data.is_rti,
            quota_lutech=data.quota_lutech,
            scenarios=data.scenarios,
            tow_breakdown=data.tow_breakdown,
            profile_rates=data.profile_rates,
            profile_labels=data.profile_labels,
            intervals=data.intervals,
            lutech_breakdown=data.lutech_breakdown,
        )
    except Exception as e:
        logger.error(f"Error generating Business Plan Excel: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Errore nella generazione dell'Excel")

    logger.info(f"Business Plan Excel export completed for lot: {data.lot_key}")

    # Create safe filename
    safe_lot_key = data.lot_key.replace(' ', '_').replace('/', '_')
    filename = f"business_plan_{safe_lot_key}.xlsx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@api_router.post("/business-plan-export")
def export_business_plan_excel_alias(data: schemas.ExportBusinessPlanRequest, db: Session = Depends(get_db)):
    """
    Alias for Business Plan Excel export to avoid router issues.
    """
    return export_business_plan_excel(data, db)


# --- PRACTICE ENDPOINTS ---

practice_router = APIRouter(prefix="/api/practices", tags=["Practices"])


@practice_router.get("/", response_model=List[schemas.PracticeResponse])
def get_practices(db: Session = Depends(get_db)):
    """Get all practices"""
    return crud.get_practices(db)


@practice_router.post("/", response_model=schemas.PracticeResponse)
def create_practice(data: schemas.PracticeCreate, db: Session = Depends(get_db)):
    """Create a new practice"""
    existing = crud.get_practice(db, data.id)
    if existing:
        raise HTTPException(status_code=400, detail=f"Practice '{data.id}' già esistente")
    return crud.create_practice(db, data)


@practice_router.get("/{practice_id}", response_model=schemas.PracticeResponse)
def get_practice(practice_id: str, db: Session = Depends(get_db)):
    """Get a specific practice"""
    practice = crud.get_practice(db, practice_id)
    if not practice:
        raise HTTPException(status_code=404, detail=f"Practice '{practice_id}' non trovata")
    return practice


@practice_router.put("/{practice_id}", response_model=schemas.PracticeResponse)
def update_practice(practice_id: str, data: schemas.PracticeCreate, db: Session = Depends(get_db)):
    """Update a practice"""
    practice = crud.update_practice(db, practice_id, data)
    if not practice:
        raise HTTPException(status_code=404, detail=f"Practice '{practice_id}' non trovata")
    return practice


@practice_router.delete("/{practice_id}")
def delete_practice(practice_id: str, db: Session = Depends(get_db)):
    """Delete a practice"""
    if not crud.delete_practice(db, practice_id):
        raise HTTPException(status_code=404, detail=f"Practice '{practice_id}' non trovata")
    return {"status": "success", "message": f"Practice '{practice_id}' eliminata"}


# NOTA: Gli endpoint /{practice_id}/profiles sono stati rimossi
# I profili sono gestiti come JSON dentro practices.profiles
# Usare PUT /api/practices/{practice_id} per aggiornare i profili


# Register all routers
app.include_router(api_router)
app.include_router(bp_router)
app.include_router(practice_router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
