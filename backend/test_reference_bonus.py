"""
Test to verify reference scoring with attestazione bonus
"""
import sys
from main import calculate_score
from schemas import CalculateRequest, TechInput
from database import SessionLocal
import crud

def test_reference_bonus():
    db = SessionLocal()
    
    # Test for Lotto 2
    lot_key = "Lotto 2"
    base_amount = 1000000.0
    
    print("=" * 80)
    print("TEST: Reference Bonus Calculation")
    print("=" * 80)
    
    # Test VAL_REQ_24 (first reference) with and without bonus
    print("\n--- VAL_REQ_24 (Ref. Service Transition) ---")
    
    # Without bonus
    tech_inputs_no_bonus = [
        TechInput(
            req_id="VAL_REQ_24",
            sub_req_vals=[
                {"sub_id": "a", "val": 5},
                {"sub_id": "b", "val": 5},
                {"sub_id": "c", "val": 5}
            ],
            bonus_active=False  # Legacy bonus OFF
        )
    ]
    
    req_no_bonus = CalculateRequest(
        lot_key=lot_key,
        base_amount=base_amount,
        competitor_discount=30.0,
        my_discount=10.0,
        tech_inputs=tech_inputs_no_bonus,
        selected_company_certs=[]
    )
    
    result_no_bonus = calculate_score(req_no_bonus, db)
    score_no_bonus = result_no_bonus["details"]["VAL_REQ_24"]
    print(f"Without bonus: {score_no_bonus} points")
    print(f"Expected: 15 (5+5+5)")
    
    # With bonus
    tech_inputs_with_bonus = [
        TechInput(
            req_id="VAL_REQ_24",
            sub_req_vals=[
                {"sub_id": "a", "val": 5},
                {"sub_id": "b", "val": 5},
                {"sub_id": "c", "val": 5}
            ],
            bonus_active=True  # Legacy bonus ON
        )
    ]
    
    req_with_bonus = CalculateRequest(
        lot_key=lot_key,
        base_amount=base_amount,
        competitor_discount=30.0,
        my_discount=10.0,
        tech_inputs=tech_inputs_with_bonus,
        selected_company_certs=[]
    )
    
    result_with_bonus = calculate_score(req_with_bonus, db)
    score_with_bonus = result_with_bonus["details"]["VAL_REQ_24"]
    print(f"With bonus: {score_with_bonus} points")
    print(f"Expected: 18 (15 + 3 bonus, capped at max_points=18)")
    
    # Test VAL_REQ_25 (second reference) with and without bonus
    print("\n--- VAL_REQ_25 (Ref. Secure DevOps) ---")
    
    # Without bonus
    tech_inputs_no_bonus_2 = [
        TechInput(
            req_id="VAL_REQ_25",
            sub_req_vals=[
                {"sub_id": "a", "val": 5},
                {"sub_id": "b", "val": 5},
                {"sub_id": "c", "val": 5},
                {"sub_id": "d", "val": 5}
            ],
            bonus_active=False  # Legacy bonus OFF
        )
    ]
    
    req_no_bonus_2 = CalculateRequest(
        lot_key=lot_key,
        base_amount=base_amount,
        competitor_discount=30.0,
        my_discount=10.0,
        tech_inputs=tech_inputs_no_bonus_2,
        selected_company_certs=[]
    )
    
    result_no_bonus_2 = calculate_score(req_no_bonus_2, db)
    score_no_bonus_2 = result_no_bonus_2["details"]["VAL_REQ_25"]
    print(f"Without bonus: {score_no_bonus_2} points")
    print(f"Expected: 20 (5+5+5+5)")
    
    # With bonus
    tech_inputs_with_bonus_2 = [
        TechInput(
            req_id="VAL_REQ_25",
            sub_req_vals=[
                {"sub_id": "a", "val": 5},
                {"sub_id": "b", "val": 5},
                {"sub_id": "c", "val": 5},
                {"sub_id": "d", "val": 5}
            ],
            bonus_active=True  # Legacy bonus ON
        )
    ]
    
    req_with_bonus_2 = CalculateRequest(
        lot_key=lot_key,
        base_amount=base_amount,
        competitor_discount=30.0,
        my_discount=10.0,
        tech_inputs=tech_inputs_with_bonus_2,
        selected_company_certs=[]
    )
    
    result_with_bonus_2 = calculate_score(req_with_bonus_2, db)
    score_with_bonus_2 = result_with_bonus_2["details"]["VAL_REQ_25"]
    print(f"With bonus: {score_with_bonus_2} points")
    print(f"Expected: 23 (20 + 3 bonus, max_points=23)")
    
    print("\n" + "=" * 80)
    print("VERIFICATION")
    print("=" * 80)
    
    success = True
    
    if score_no_bonus != 15:
        print(f"❌ VAL_REQ_24 without bonus FAILED: expected 15, got {score_no_bonus}")
        success = False
    else:
        print(f"✅ VAL_REQ_24 without bonus: {score_no_bonus}")
    
    if score_with_bonus != 18:
        print(f"❌ VAL_REQ_24 with bonus FAILED: expected 18, got {score_with_bonus}")
        success = False
    else:
        print(f"✅ VAL_REQ_24 with bonus: {score_with_bonus}")
    
    if score_no_bonus_2 != 20:
        print(f"❌ VAL_REQ_25 without bonus FAILED: expected 20, got {score_no_bonus_2}")
        success = False
    else:
        print(f"✅ VAL_REQ_25 without bonus: {score_no_bonus_2}")
    
    if score_with_bonus_2 != 23:
        print(f"❌ VAL_REQ_25 with bonus FAILED: expected 23, got {score_with_bonus_2}")
        success = False
    else:
        print(f"✅ VAL_REQ_25 with bonus: {score_with_bonus_2}")
    
    if success:
        print("\n🎉 All tests PASSED! Backend calculates correctly.")
    else:
        print("\n⚠️  Some tests FAILED! Backend has calculation issues.")
    
    db.close()

if __name__ == "__main__":
    test_reference_bonus()
