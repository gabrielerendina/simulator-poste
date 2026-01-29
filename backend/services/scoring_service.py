"""
Scoring Service - Business logic for technical and economic scoring
"""
from typing import Dict, List
import numpy as np


class ScoringService:
    """Service for calculating scores"""

    @staticmethod
    def calculate_economic_score(
        p_base: float,
        p_offered: float,
        p_best_competitor: float,
        alpha: float = 0.3,
        max_econ: float = 40.0
    ) -> float:
        """
        Calculate economic score with progressive discount reward.

        Uses interpolation formula with alpha exponent for progressive discounting reward.

        Args:
            p_base: Base price
            p_offered: Our offered price
            p_best_competitor: Best competitor's price
            alpha: Exponent factor (0-1) for discount curve
            max_econ: Maximum economic score achievable

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

    @staticmethod
    def calculate_professional_score(
        resources: int,
        certifications: int,
        max_resources: int,
        max_points: float,
        max_certifications: int = 5
    ) -> float:
        """
        Calculate professional score based on resources and certifications.

        Formula: score = (2 * R) + (R * C)
        where R = min(resources, max_resources)
              C = min(certifications, max_certifications)

        Args:
            resources: Number of resources
            certifications: Number of certifications
            max_resources: Maximum resources to count
            max_points: Cap score at this value
            max_certifications: Maximum certifications to count

        Returns:
            Professional score (capped at max_points)
        """
        # Limit R and C to their maximums
        R = min(resources, max_resources)
        C = min(certifications, max_certifications)

        # Ensure C doesn't exceed R
        if R < C:
            C = R

        # Calculate score: base points for resources + bonus for certifications
        # Each resource = 2 points base, each certification adds R points
        score = (2 * R) + (R * C)

        # Cap at maximum points allowed
        return min(score, max_points)
