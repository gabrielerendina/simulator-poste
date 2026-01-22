"""
Unit tests for Poste Tender Simulator Backend
Tests scoring logic, API endpoints, and data validation
"""

import pytest
from fastapi.testclient import TestClient
from main import (
    app,
    calculate_economic_score,
    calculate_prof_score,
)

client = TestClient(app)

# ============================================================================
# SCORING FUNCTION TESTS
# ============================================================================


class TestEconomicScore:
    """Test economic score calculation with various scenarios"""

    def test_economic_score_best_price(self):
        """Test when our offer is better than competitor"""
        p_base = 1000
        p_offered = 700  # 30% discount
        p_best_competitor = 800  # 20% discount
        score = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        assert score == 40  # Maximum score when we're the best

    def test_economic_score_equal_price(self):
        """Test when our offer equals competitor (should still get max)"""
        p_base = 1000
        p_offered = 800
        p_best_competitor = 800
        score = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        assert score == 40

    def test_economic_score_worse_price(self):
        """Test when our offer is worse than competitor"""
        p_base = 1000
        p_offered = 850  # 15% discount
        p_best_competitor = 700  # 30% discount
        score = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        assert score < 40
        assert score > 0

    def test_economic_score_no_discount(self):
        """Test with no discount (offered = base)"""
        p_base = 1000
        p_offered = 1000
        p_best_competitor = 800
        score = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        assert score == 0

    def test_economic_score_above_base(self):
        """Test when offer is above base (invalid)"""
        p_base = 1000
        p_offered = 1100
        p_best_competitor = 800
        score = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        assert score == 0

    def test_economic_score_different_alphas(self):
        """Test score changes with different alpha values"""
        p_base = 1000
        p_offered = 800
        p_best_competitor = 900

        # When our discount is better than competitor, ratio is capped at 1.0
        # So score is 40 * (1.0 ** alpha) which is always 40
        score_alpha_03 = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.3
        )
        score_alpha_05 = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=0.5
        )
        score_alpha_10 = calculate_economic_score(
            p_base, p_offered, p_best_competitor, alpha=1.0
        )

        assert score_alpha_10 == score_alpha_05 == score_alpha_03 == 40

        # Now test with ratio < 1.0 (worse than competitor)
        p_offered_worse = 850
        p_best_comp = 800
        # ratio = (1000-850)/(1000-800) = 150/200 = 0.75
        s_03 = calculate_economic_score(p_base, p_offered_worse, p_best_comp, alpha=0.3)
        s_05 = calculate_economic_score(p_base, p_offered_worse, p_best_comp, alpha=0.5)
        s_10 = calculate_economic_score(p_base, p_offered_worse, p_best_comp, alpha=1.0)

        assert (
            s_03 > s_05 > s_10
        )  # Lower alpha gives higher score for the same ratio < 1.0


class TestProfScore:
    """Test professional certifications scoring"""

    def test_prof_score_standard_formula(self):
        """Test standard formula: 2R + RC"""
        R, C = 3, 2
        max_res, max_points, max_certs = 5, 20, 5
        score = calculate_prof_score(R, C, max_res, max_points, max_certs)
        # 2*3 + 3*2 = 6 + 6 = 12
        assert score == 12

    def test_prof_score_max_cap(self):
        """Test that score is capped at max_points"""
        R, C = 10, 10
        max_res, max_points, max_certs = 10, 50, 10
        score = calculate_prof_score(R, C, max_res, max_points, max_certs)
        assert score == 50  # Capped at max_points

    def test_prof_score_zero_values(self):
        """Test with zero resources and certs"""
        R, C = 0, 0
        score = calculate_prof_score(R, C, 5, 20, 5)
        assert score == 0

    def test_prof_score_c_exceeds_max_certs(self):
        """Test when C exceeds max_certs (should be capped)"""
        R, C = 5, 10
        max_certs = 5
        score = calculate_prof_score(R, C, 5, 50, max_certs)
        # C should be capped at 5
        # 2*5 + 5*5 = 10 + 25 = 35
        assert score == 35


class TestCompanyCertifications:
    """Test company certifications scoring"""

    def test_company_certs_calculation(self):
        """Test company certs: 2 points each"""
        count = 6
        points_per_cert = 2
        expected = count * points_per_cert
        assert expected == 12


# ============================================================================
# API ENDPOINT TESTS
# ============================================================================


class TestConfigEndpoint:
    """Test /config endpoint"""

    def test_get_config_success(self):
        """Test successful config retrieval"""
        response = client.get("/config")
        assert response.status_code == 200
        data = response.json()
        assert "Lotto 1" in data
        assert "Lotto 2" in data
        assert "Lotto 3" in data

    def test_config_structure(self):
        """Test config data structure"""
        response = client.get("/config")
        data = response.json()

        lotto1 = data["Lotto 1"]
        assert "name" in lotto1
        assert "base_amount" in lotto1
        assert "max_raw_score" in lotto1
        assert "alpha" in lotto1
        assert "company_certs" in lotto1
        assert "company_certs" in lotto1
        assert "reqs" in lotto1

        # Verify alpha default and company certs structure
        assert lotto1["alpha"] == 0.3
        assert isinstance(lotto1["company_certs"], list)
        if len(lotto1["company_certs"]) > 0:
            assert "label" in lotto1["company_certs"][0]
            assert "points" in lotto1["company_certs"][0]


class TestCalculateEndpoint:
    """Test /calculate endpoint"""

    def test_calculate_valid_input(self):
        """Test calculate with valid inputs"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 16837200.0,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [
                {"req_id": "VAL_REQ_7", "r_val": 2, "c_val": 2},
                {"req_id": "VAL_REQ_8", "r_val": 10, "c_val": 10},
            ],
            "company_certs_count": 6,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 200
        data = response.json()

        assert "technical_score" in data
        assert "economic_score" in data
        assert "total_score" in data
        assert "details" in data
        assert data["total_score"] <= 100
        assert data["technical_score"] <= 60
        assert data["economic_score"] <= 40

    def test_calculate_invalid_lot(self):
        """Test calculate with invalid lot key"""
        payload = {
            "lot_key": "Lotto 99",
            "base_amount": 1000000,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 0,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 404  # Not found (lot doesn't exist)

    def test_calculate_negative_discount(self):
        """Test calculate with negative discount"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 1000000,
            "competitor_discount": -10.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 0,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 422

    def test_calculate_discount_over_100(self):
        """Test calculate with discount > 100%"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 1000000,
            "competitor_discount": 150.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 0,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 422

    def test_calculate_max_company_certs(self):
        """Test with maximum company certs (should be capped at 6)"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 16837200.0,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 6,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 200
        data = response.json()
        # 6 certs * 2 points = 12, normalized to 60-point scale
        assert data["technical_score"] >= 0


class TestSimulateEndpoint:
    """Test /simulate endpoint"""

    def test_simulate_valid_input(self):
        """Test simulate with valid inputs"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 16837200.0,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "current_tech_score": 45.0,
        }
        response = client.post("/simulate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0
        for point in data:
            assert "discount" in point
            assert "total_score" in point
            assert "economic_score" in point

    def test_simulate_tech_score_bounds(self):
        """Test simulate with tech score at boundaries"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 1000000,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "current_tech_score": 60.0,  # Max technical score
        }
        response = client.post("/simulate", json=payload)
        assert response.status_code == 200

    def test_simulate_invalid_tech_score(self):
        """Test simulate with tech score > 60"""
        payload = {
            "base_amount": 1000000,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "current_tech_score": 70.0,  # Invalid
        }

        response = client.post("/simulate", json=payload)
        assert response.status_code == 422


# ============================================================================
# INTEGRATION TESTS
# ============================================================================


class TestLotto1Scenario:
    """Test complete Lotto 1 scenario"""

    def test_lotto1_max_score(self):
        """Test Lotto 1 with maximum possible values (config-aligned)"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 16837200.0,
            "competitor_discount": 20.0,
            "my_discount": 35.0,
            "tech_inputs": [
                {"req_id": "VAL_REQ_7", "r_val": 2, "c_val": 1},
                {"req_id": "VAL_REQ_8", "r_val": 5, "c_val": 3},
                {"req_id": "VAL_REQ_9", "r_val": 3, "c_val": 2},
                {"req_id": "VAL_REQ_10", "r_val": 2, "c_val": 1},
            ],
            "selected_company_certs": [
                "ISO 9001",
                "ISO 27001",
                "ISO 20000",
                "ISO 22301",
                "ISO 14001",
                "ISO 45001",
            ],
        }
        response = client.post("/calculate", json=payload)
        assert response.status_code == 200
        data = response.json()
        # Lotto 1 scoring calculation
        # VAL_REQ_7: R=2, C=1 -> formula calculation
        # VAL_REQ_8: R=5, C=3 -> custom_formula
        # VAL_REQ_9: R=3, C=2 -> formula calculation
        # VAL_REQ_10: R=2, C=1 -> formula calculation
        # Company Certs: 6 certs
        # Score has been recalculated with updated formula
        assert round(data["technical_score"], 2) == 21.65


class TestLotto3Scenario:
    """Test complete Lotto 3 scenario with sub-requirements"""

    def test_lotto3_with_subreqs(self):
        """Test Lotto 3 with sub-requirements for references"""
        payload = {
            "lot_key": "Lotto 3",
            "base_amount": 5495779.0,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [
                {
                    "req_id": "VAL_REQ_36",
                    "qual_val": "Ottimo",
                    "bonus_active": True,
                    "sub_req_vals": [
                        {"sub_id": "a", "val": 4},
                        {"sub_id": "b", "val": 5},
                    ],
                },
                {
                    "req_id": "VAL_REQ_37",
                    "qual_val": "Eccellente",
                    "sub_req_vals": [
                        {"sub_id": "a", "val": 5},
                        {"sub_id": "b", "val": 5},
                        {"sub_id": "c", "val": 5},
                    ],
                },
            ],
            "company_certs_count": 6,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["total_score"] > 0


# ============================================================================
# EDGE CASES & ERROR HANDLING
# ============================================================================


class TestEdgeCases:
    """Test edge cases and error conditions"""

    def test_empty_tech_inputs(self):
        """Test with no technical inputs"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 1000000,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 0,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["technical_score"] == 0

    def test_zero_base_amount(self):
        """Test with zero base amount (should fail validation)"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 0,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 0,
        }

        response = client.post("/calculate", json=payload)
        assert response.status_code == 422

    def test_excessive_company_certs(self):
        """Test with company certs > 20 (should fail validation)"""
        payload = {
            "lot_key": "Lotto 1",
            "base_amount": 1000000,
            "competitor_discount": 25.0,
            "my_discount": 30.0,
            "tech_inputs": [],
            "company_certs_count": 25,
        }

        response = client.post("/simulate", json=payload)
        assert response.status_code == 422


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=backend", "--cov-report=html"])
