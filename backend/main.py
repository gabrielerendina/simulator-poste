from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from typing import List, Dict, Any
from datetime import datetime
from contextlib import asynccontextmanager
import uvicorn
import numpy as np
import io
import os
import time
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

# Setup structured logging
setup_logging()
logger = get_logger(__name__)

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
        logger.info(f"Production CORS: {production_url}")
        return [production_url]

    elif env == "staging":
        # Staging: Allow staging domain + localhost for testing
        staging_url = os.getenv("FRONTEND_URL", "https://staging.simulator-poste.example.com")
        origins = [staging_url, "http://localhost:5173"]
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
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,  # Cache preflight for 10 minutes
)


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

# Middleware for payload size validation (max 10 MB)
MAX_PAYLOAD_SIZE = 10 * 1024 * 1024  # 10 MB


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
            "message": f"Database error: {str(e)}"
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
        health_status["checks"]["lot_configs"] = {
            "status": "warning",
            "message": str(e)
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
        # Quick database check
        db.execute(text("SELECT 1"))

        # Check at least one lot config exists
        lot_count = db.query(models.LotConfigModel).count()
        if lot_count == 0:
            logger.warning("Readiness check: no lot configurations found")
            return JSONResponse(
                content={"status": "not_ready", "reason": "No lot configurations"},
                status_code=503
            )

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




# --- LOGIC (Copied from original, can be refactored) ---


def calculate_economic_score(
    p_base, p_offered, p_best_competitor, alpha=0.3, max_econ=40.0
):
    """
    Calculate economic score based on offered price vs base and competitor.

    Uses interpolation formula with alpha exponent for progressive discounting reward.

    Args:
        p_base: Base price
        p_offered: Our offered price
        p_best_competitor: Best competitor's price
        alpha: Exponent factor (0-1)
        max_econ: Maximum economic score

    Returns:
        Economic score (0 to max_econ)
    """
    # Price must be less than or equal to base
    if p_offered > p_base:
        return 0.0

    # Get the best price between us and competitor
    actual_best = min(p_offered, p_best_competitor)

    # Calculate denominator (spread from base to best price)
    denom = p_base - actual_best
    if denom <= 0:
        # Edge case: if actual_best >= p_base, return max score if we're within range
        if actual_best == p_base:
            return 0.0
        return max_econ

    # Calculate numerator (our discount)
    num = p_base - p_offered

    # Calculate ratio (0 to 1)
    ratio = num / denom

    # Clamp ratio to [0, 1]
    ratio = max(0.0, min(1.0, ratio))

    # Apply alpha exponent and scale to max
    return max_econ * (ratio**alpha)


def calculate_prof_score(R, C, max_res, max_points, max_certs=5):
    """
    Calculate professional score for a requirement.

    Args:
        R: Number of resources
        C: Number of certifications
        max_res: Maximum expected resources
        max_points: Maximum points achievable
        max_certs: Maximum certifications to count

    Returns:
        Score capped at max_points
    """
    # Limit R and C to their maximums
    R = min(R, max_res)
    C = min(C, max_certs)

    # Ensure C doesn't exceed R
    if R < C:
        C = R

    # Calculate score: base points for resources + bonus for certifications
    # Each resource = 2 points base, each certification adds R points
    score = (2 * R) + (R * C)

    # Cap at maximum points allowed
    return min(score, max_points)


# --- API ROUTER (Business endpoints with /api prefix) ---
api_router = APIRouter(prefix="/api")


@api_router.get("/config", response_model=Dict[str, schemas.LotConfig])
def get_config(db: Session = Depends(get_db)):
    configs = crud.get_lot_configs(db)
    return {c.name: schemas.LotConfig.model_validate(c) for c in configs}


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
    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    lot.state = state.dict()
    db.commit()
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

    p_best = data.base_amount * (1 - (data.competitor_discount / 100))
    p_off = data.base_amount * (1 - (data.my_discount / 100))
    econ_score = calculate_economic_score(
        data.base_amount, p_off, p_best, lot_cfg.alpha, lot_cfg.max_econ_score
    )

    raw_tech_score = 0.0
    company_certs_score = 0.0
    cert_config = lot_cfg.company_certs
    cert_pts_map = {c["label"]: c["points"] for c in cert_config if isinstance(c, dict)}

    for selected_label in data.selected_company_certs:
        company_certs_score += cert_pts_map.get(selected_label, 0.0)

    raw_tech_score += company_certs_score

    req_map = {r["id"]: r for r in lot_cfg.reqs}
    details = {}

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
                )
            elif req["type"] in ["reference", "project"] and (
                req.get("sub_reqs") or req.get("criteria")
            ):
                sub_score_sum = 0.0
                criteria_list = req.get("criteria") or req.get("sub_reqs")
                if inp.sub_req_vals:
                    # Handle both dict and object formats
                    val_map = {}
                    for s in inp.sub_req_vals:
                        if isinstance(s, dict):
                            val_map[s.get("sub_id")] = s.get("val", 0)
                        else:
                            val_map[s.sub_id] = s.val
                    for sub in criteria_list:
                        val = val_map.get(sub["id"], 0)
                        weight = sub.get("weight", 1)
                        sub_score_sum += weight * float(val)

                bonus = req.get("bonus_val", 0.0) if inp.bonus_active else 0.0
                pts = min(sub_score_sum + bonus, req["max_points"])

            raw_tech_score += pts
            details[inp.req_id] = pts

    if lot_cfg.max_raw_score > 0:
        tech_score = (raw_tech_score / lot_cfg.max_raw_score) * lot_cfg.max_tech_score
    else:
        tech_score = 0.0

    tech_score = min(tech_score, lot_cfg.max_tech_score)

    result = {
        "technical_score": round(tech_score, 2),
        "economic_score": round(econ_score, 2),
        "total_score": round(tech_score + econ_score, 2),
        "raw_technical_score": round(raw_tech_score, 2),
        "company_certs_score": round(company_certs_score, 2),
        "details": details,
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

    p_base = data.base_amount
    p_best_comp = p_base * (1 - (data.competitor_discount / 100))
    results = []

    for d in range(10, 71, 2):
        p_hyp = p_base * (1 - d / 100)
        e_s = calculate_economic_score(
            p_base, p_hyp, p_best_comp, lot_cfg.alpha, lot_cfg.max_econ_score
        )
        results.append(
            {
                "discount": d,
                "total_score": round(data.current_tech_score + e_s, 2),
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
    results = []

    my_scores = []
    competitor_scores = []

    for c_disc in comp_discounts:
        c_disc = max(0, min(100, c_disc))
        p_best = data.base_amount * (1 - (c_disc / 100))
        p_off = data.base_amount * (1 - (data.my_discount / 100))

        max_tech = lot_cfg.max_tech_score
        max_econ = lot_cfg.max_econ_score

        comp_tech_score = np.random.normal(loc=max_tech * 0.9, scale=5.0)
        comp_tech_score = max(0, min(max_tech, comp_tech_score))

        econ_score = calculate_economic_score(
            data.base_amount, p_off, p_best, lot_cfg.alpha, max_econ
        )
        my_total = data.current_tech_score + econ_score

        p_best_actual = min(p_best, p_off)
        c_econ = calculate_economic_score(
            data.base_amount, p_best, p_best_actual, lot_cfg.alpha, max_econ
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
    Returns 4 scenarios: Conservativo (70-80%), Bilanciato (80-90%), Aggressivo (90-95%), Sicuro (95%+)
    """
    logger.info(f"Discount optimization requested for lot: {data.lot_key}")

    # Get lot configuration
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Calculate competitor's economic score and total score
    p_base = data.base_amount
    p_comp = p_base * (1 - data.competitor_discount / 100)

    comp_econ_score = calculate_economic_score(
        p_base, p_comp, p_comp, lot_cfg.alpha, lot_cfg.max_econ_score
    )
    competitor_total = data.competitor_tech_score + comp_econ_score

    # Define target win probabilities for each scenario
    scenarios_config = [
        {"name": "Conservativo", "target_prob": 75, "min_prob": 70, "max_prob": 80},
        {"name": "Bilanciato", "target_prob": 85, "min_prob": 80, "max_prob": 90},
        {"name": "Aggressivo", "target_prob": 92, "min_prob": 90, "max_prob": 95},
        {"name": "Sicuro", "target_prob": 96, "min_prob": 95, "max_prob": 100},
    ]

    scenarios = []

    for scenario_cfg in scenarios_config:
        # Binary search for optimal discount
        left, right = 0.0, 70.0
        best_discount = None
        best_prob = 0
        iterations = 100  # Monte Carlo iterations per test

        # Try to find discount that achieves target probability
        for _ in range(15):  # Binary search iterations
            mid = (left + right) / 2

            # Run mini Monte Carlo to estimate win probability at this discount
            p_my = p_base * (1 - mid / 100)
            my_econ = calculate_economic_score(
                p_base, p_my, p_comp, lot_cfg.alpha, lot_cfg.max_econ_score
            )
            my_total = data.my_tech_score + my_econ

            # Simulate competitor variability (tech score variance)
            wins = 0
            for _ in range(iterations):
                # Add small variance to competitor tech score
                comp_tech_var = np.random.normal(data.competitor_tech_score, 2.0)
                comp_tech_var = max(0, min(lot_cfg.max_tech_score, comp_tech_var))

                # Add small variance to competitor discount
                comp_disc_var = np.random.normal(data.competitor_discount, 1.5)
                comp_disc_var = max(0, min(70, comp_disc_var))
                p_comp_var = p_base * (1 - comp_disc_var / 100)

                comp_econ_var = calculate_economic_score(
                    p_base, p_comp_var, min(p_comp_var, p_my), lot_cfg.alpha, lot_cfg.max_econ_score
                )
                comp_total_var = comp_tech_var + comp_econ_var

                if my_total > comp_total_var:
                    wins += 1

            prob = (wins / iterations) * 100

            # Check if we're in the target range
            if scenario_cfg["min_prob"] <= prob <= scenario_cfg["max_prob"]:
                best_discount = mid
                best_prob = prob
                break

            # Binary search adjustment
            if prob < scenario_cfg["target_prob"]:
                right = mid  # Need more discount (lower price)
            else:
                left = mid  # Need less discount

            best_discount = mid
            best_prob = prob

        # Calculate final metrics with best discount
        if best_discount is not None:
            p_my_final = p_base * (1 - best_discount / 100)
            my_econ_final = calculate_economic_score(
                p_base, p_my_final, p_comp, lot_cfg.alpha, lot_cfg.max_econ_score
            )
            my_total_final = data.my_tech_score + my_econ_final

            economic_impact = p_base - p_my_final
            delta_vs_competitor = my_total_final - competitor_total

            scenarios.append({
                "name": scenario_cfg["name"],
                "suggested_discount": round(best_discount, 2),
                "resulting_total_score": round(my_total_final, 2),
                "resulting_economic_score": round(my_econ_final, 2),
                "win_probability": round(best_prob, 1),
                "economic_impact": round(economic_impact, 2),
                "delta_vs_competitor": round(delta_vs_competitor, 2),
            })

    return {
        "competitor_total_score": round(competitor_total, 2),
        "competitor_tech_score": round(data.competitor_tech_score, 2),
        "competitor_econ_score": round(comp_econ_score, 2),
        "scenarios": scenarios
    }


@api_router.post("/export-pdf")
def export_pdf(data: schemas.ExportPDFRequest, db: Session = Depends(get_db)):
    """
    Export comprehensive PDF report with REAL Monte Carlo simulation results
    """
    logger.info(f"PDF export requested for lot: {data.lot_key}")

    # Get lot configuration for Monte Carlo simulation
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.model_validate(lot_cfg_db)

    # Run REAL Monte Carlo simulation (500 iterations)
    iterations = 500
    comp_discounts = np.random.normal(data.competitor_discount, 3.5, iterations)
    score_distribution = []

    for c_disc in comp_discounts:
        c_disc = max(0, min(100, c_disc))
        p_best = data.base_amount * (1 - (c_disc / 100))
        p_off = data.base_amount * (1 - (data.my_discount / 100))

        econ_score = calculate_economic_score(
            data.base_amount, p_off, p_best, lot_cfg.alpha, lot_cfg.max_econ_score
        )
        my_total = data.technical_score + econ_score
        score_distribution.append(my_total)

    score_distribution = np.array(score_distribution)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle(
        "TitleStyle", parent=styles["Heading1"], alignment=1, spaceAfter=20
    )
    story.append(Paragraph(f"Report Strategico: {data.lot_key}", title_style))
    story.append(Spacer(1, 12))

    # Executive Summary
    story.append(Paragraph("Sintesi Esecutiva", styles["Heading2"]))
    summary_text = f"La simulazione per il lotto <b>{data.lot_key}</b> evidenzia un punteggio totale di <b>{data.total_score}</b> punti, con uno sconto offerto del {data.my_discount}%."
    story.append(Paragraph(summary_text, styles["Normal"]))
    story.append(Spacer(1, 12))

    # Score Table
    table_data = [
        ["Componente", "Punteggio"],
        ["Punteggio Tecnico", f"{data.technical_score} / 60.00"],
        ["Punteggio Economico", f"{data.economic_score} / 40.00"],
        ["TOTALE", f"{data.total_score} / 100.00"],
    ]
    t = Table(table_data, colWidths=[200, 150])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.blue),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("BACKGROUND", (0, 3), (-1, 3), colors.lightgrey),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ]
        )
    )
    story.append(t)
    story.append(Spacer(1, 20))

    # Score Distribution Chart with REAL Monte Carlo data
    plt.figure(figsize=(6, 3))
    plt.hist(
        score_distribution,  # ✅ REAL DATA from Monte Carlo
        bins=15,
        color="skyblue",
        alpha=0.7,
        edgecolor='black'
    )
    plt.axvline(
        data.total_score,
        color="red",
        linestyle="dashed",
        linewidth=2,
        label="Il Tuo Score",
    )
    plt.title(f"Distribuzione Probabilistica Score (Monte Carlo {iterations} iter.)")
    plt.xlabel("Punti Totali")
    plt.ylabel("Frequenza")
    plt.legend()
    plt.grid(alpha=0.3)

    chart_buffer = io.BytesIO()
    plt.savefig(chart_buffer, format="png", dpi=150, bbox_inches="tight")
    plt.close()
    chart_buffer.seek(0)
    story.append(RLImage(chart_buffer, width=400, height=200))
    story.append(Spacer(1, 20))

    # Statistics Table with REAL data
    story.append(Paragraph("Statistiche Monte Carlo (500 iterazioni)", styles["Heading2"]))
    stats_data = [
        ["Metrica", "Valore"],
        ["Score Medio", f"{np.mean(score_distribution):.2f}"],
        ["Score Minimo", f"{np.min(score_distribution):.2f}"],
        ["Score Massimo", f"{np.max(score_distribution):.2f}"],
        ["Deviazione Standard", f"{np.std(score_distribution):.2f}"],
        ["Percentile 25°", f"{np.percentile(score_distribution, 25):.2f}"],
        ["Percentile 75°", f"{np.percentile(score_distribution, 75):.2f}"],
    ]
    t_stats = Table(stats_data, colWidths=[200, 150])
    t_stats.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
                ("GRID", (0, 0), (-1, -1), 1, colors.black),
            ]
        )
    )
    story.append(t_stats)

    logger.info(f"PDF export completed for lot: {data.lot_key}")
    doc.build(story)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=report_{data.lot_key.replace(' ', '_')}.pdf",
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


# Register API router
app.include_router(api_router)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
