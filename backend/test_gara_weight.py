"""
Test new gara_weight scoring logic
"""
import sys
from main import calculate_score
from schemas import CalculateRequest, TechInput
from database import SessionLocal

def test_gara_weight_scoring():
    db = SessionLocal()
    
    print("=" * 80)
    print("TEST: Gara Weight Scoring")
    print("=" * 80)
    
    # Test Lotto 2 with simple values
    lot_key = "Lotto 2"
    
    # Example: VAL_REQ_20 (Resource)
    # max_points = 15, gara_weight = 9.68
    # If raw = 10, then weighted = (10/15) * 9.68 = 6.45
    
    tech_inputs = [
        TechInput(
            req_id="VAL_REQ_20",
            r_val=5,  # Will give raw score based on formula
            c_val=0
        )
    ]
    
    req = CalculateRequest(
        lot_key=lot_key,
        base_amount=1000000.0,
        competitor_discount=30.0,
        my_discount=10.0,
        tech_inputs=tech_inputs,
        selected_company_certs=[]
    )
    
    result = calculate_score(req, db)
    
    print(f"\nLot: {lot_key}")
    print(f"Requirement: VAL_REQ_20 (r_val=5, c_val=0)")
    print(f"")
    print(f"Raw Score: {result['details'].get('VAL_REQ_20', 0)}")
    print(f"Weighted Score: {result['weighted_scores'].get('VAL_REQ_20', 0)}")
    print(f"")
    print(f"Expected calculation:")
    print(f"  raw = 2*5 + 5*0 = 10")
    print(f"  weighted = (10 / 15) * 9.68 = 6.45")
    print(f"")
    print(f"Total Technical Score: {result['technical_score']}")
    print(f"(Should equal weighted score since only one requirement)")
    
    # Verify
    raw_val = result['details'].get('VAL_REQ_20', 0)
    weighted_val = result['weighted_scores'].get('VAL_REQ_20', 0)
    expected_weighted = round((raw_val / 15) * 9.68, 2)
    
    print("\n" + "=" * 80)
    if abs(weighted_val - expected_weighted) < 0.01:
        print(f"✅ Test PASSED! Weighted score {weighted_val} matches expected {expected_weighted}")
    else:
        print(f"❌ Test FAILED! Weighted score {weighted_val} != expected {expected_weighted}")
    print("=" * 80)
    
    db.close()

if __name__ == "__main__":
    test_gara_weight_scoring()
