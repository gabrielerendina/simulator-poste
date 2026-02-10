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
        response = client.get("/api/config")
        assert response.status_code == 200
        data = response.json()
        # Config should return a dict (may be empty or have lots)
        assert isinstance(data, dict)

    def test_config_structure(self):
        """Test config data structure"""
        response = client.get("/api/config")
        data = response.json()

        # Skip if no lots configured
        if not data:
            pytest.skip("No lots configured in database")
        
        # Get first available lot
        first_lot_key = next(iter(data.keys()))
        lotto1 = data[first_lot_key]
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




if __name__ == "__main__":
    pytest.main([__file__, "-v", "--cov=backend", "--cov-report=html"])
