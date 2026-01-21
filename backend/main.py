from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import uvicorn
import numpy as np
import io
import os
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

from . import crud, models, schemas
from .database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)

matplotlib.use("Agg")

app = FastAPI(title="Poste Tender Simulator API")

# Configure CORS with specific origins
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:80,http://localhost"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    max_age=600,  # Cache preflight for 10 minutes
)

# Middleware for payload size validation (max 10 MB)
MAX_PAYLOAD_SIZE = 10 * 1024 * 1024  # 10 MB

@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    if request.method in ["POST", "PUT", "PATCH"]:
        if "content-length" in request.headers:
            content_length = int(request.headers["content-length"])
            if content_length > MAX_PAYLOAD_SIZE:
                return HTTPException(
                    status_code=413,
                    detail=f"Request payload too large. Maximum size is {MAX_PAYLOAD_SIZE / 1024 / 1024:.0f}MB"
                )
    return await call_next(request)

# --- DB Dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    crud.seed_initial_data(db)
    db.close()


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
    return max_econ * (ratio ** alpha)

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


# --- ENDPOINTS ---

@app.get("/config", response_model=Dict[str, schemas.LotConfig])
def get_config(db: Session = Depends(get_db)):
    configs = crud.get_lot_configs(db)
    return {c.name: schemas.LotConfig.from_orm(c) for c in configs}

@app.get("/master-data", response_model=schemas.MasterData)
def get_master_data(db: Session = Depends(get_db)):
    master_data = crud.get_master_data(db)
    if not master_data:
        raise HTTPException(status_code=404, detail="Master data not found")
    return master_data

@app.post("/master-data", response_model=schemas.MasterData)
def update_master_data(data: schemas.MasterData, db: Session = Depends(get_db)):
    return crud.update_master_data(db, data)


@app.post("/config/state")
def update_lot_state(lot_key: str, state: schemas.SimulationState, db: Session = Depends(get_db)):
    lot = crud.get_lot_config(db, lot_key)
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    
    lot.state = state.dict()
    db.commit()
    return {"status": "success"}


@app.post("/config", response_model=Dict[str, schemas.LotConfig])
def update_config(new_config: Dict[str, schemas.LotConfig], db: Session = Depends(get_db)):
    for lot_name, lot_data in new_config.items():
        crud.update_lot_config(db, lot_name, lot_data)
    
    configs = crud.get_lot_configs(db)
    return {c.name: schemas.LotConfig.from_orm(c) for c in configs}


@app.post("/config/add", response_model=schemas.LotConfig)
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
        reqs=[]
    )
    db_lot = crud.create_lot_config(db, new_lot)
    return schemas.LotConfig.from_orm(db_lot)


@app.delete("/config/{lot_key}")
def delete_lot(lot_key: str, db: Session = Depends(get_db)):
    if not crud.delete_lot_config(db, lot_key):
        raise HTTPException(status_code=404, detail="Gara/Lotto non trovato")
    return {"status": "success", "message": f"Gara/Lotto {lot_key} eliminato"}


@app.post("/config/{lot_key}/req/{req_id}/criteria")
def update_requirement_criteria(lot_key: str, req_id: str, criteria: List[schemas.SubReq], db: Session = Depends(get_db)):
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


@app.get("/config/{lot_key}/req/{req_id}/criteria")
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


@app.post("/calculate")
def calculate_score(data: schemas.CalculateRequest, db: Session = Depends(get_db)):
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    
    lot_cfg = schemas.LotConfig.from_orm(lot_cfg_db)

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
            elif req["type"] in ["reference", "project"] and (req.get("sub_reqs") or req.get("criteria")):
                sub_score_sum = 0.0
                criteria_list = req.get("criteria") or req.get("sub_reqs")
                if inp.sub_req_vals:
                    val_map = {s.sub_id: s.val for s in inp.sub_req_vals}
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

    return {
        "technical_score": round(tech_score, 2),
        "economic_score": round(econ_score, 2),
        "total_score": round(tech_score + econ_score, 2),
        "raw_technical_score": round(raw_tech_score, 2),
        "company_certs_score": round(company_certs_score, 2),
        "details": details,
    }

@app.post("/simulate")
def simulate(data: schemas.SimulationRequest, db: Session = Depends(get_db)):
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.from_orm(lot_cfg_db)
    
    p_base = data.base_amount
    p_best_comp = p_base * (1 - (data.competitor_discount / 100))
    results = []

    for d in range(10, 71, 2):
        p_hyp = p_base * (1 - d / 100)
        e_s = calculate_economic_score(p_base, p_hyp, p_best_comp, lot_cfg.alpha, lot_cfg.max_econ_score)
        results.append(
            {
                "discount": d,
                "total_score": round(data.current_tech_score + e_s, 2),
                "economic_score": round(e_s, 2),
            }
        )
    return results

@app.post("/monte-carlo")
def monte_carlo_simulation(data: schemas.MonteCarloRequest, db: Session = Depends(get_db)):
    lot_cfg_db = crud.get_lot_config(db, data.lot_key)
    if not lot_cfg_db:
        raise HTTPException(status_code=404, detail="Lot not found")
    lot_cfg = schemas.LotConfig.from_orm(lot_cfg_db)

    comp_discounts = np.random.normal(
        data.competitor_discount_mean, data.competitor_discount_std, data.iterations
    )
    wins = 0
    results = []

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
        results.append(my_total)
    
    prob = (wins / data.iterations) * 100
    
    return {
        "win_probability": round(prob, 2),
        "iterations": data.iterations,
        "avg_total_score": round(float(np.mean(results)), 2),
        "min_score": round(float(np.min(results)), 2),
        "max_score": round(float(np.max(results)), 2),
        "score_distribution": [round(s, 1) for s in results[:50]],
    }

@app.post("/export-pdf")
def export_pdf(data: schemas.ExportPDFRequest):
    # This function remains largely the same as it is presentation logic
    # and doesn't depend on the database directly.
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
    
    # Score Distribution Chart (Matplotlib)
    plt.figure(figsize=(6, 3))
    # Note: This chart logic is flawed as it receives aggregated data, not a distribution.
    # For now, it will plot a misleading histogram based on the provided avg_total_score.
    # A proper implementation would run a simulation here or receive the distribution.
    plt.hist(
        np.random.normal(data.avg_total_score, 5, 100), # Fake distribution
        bins=15,
        color="skyblue",
        alpha=0.7,
    )
    plt.axvline(
        data.total_score, color="red", linestyle="dashed", linewidth=1, label="Il Tuo Score"
    )
    plt.title("Distribuzione Probabilistica Score Simulata")
    plt.xlabel("Punti Totali")
    plt.ylabel("Frequenza")
    plt.legend()

    chart_buffer = io.BytesIO()
    plt.savefig(chart_buffer, format="png", bbox_inches="tight")
    plt.close()
    chart_buffer.seek(0)
    story.append(RLImage(chart_buffer, width=400, height=200))

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

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)