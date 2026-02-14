"""
Business Plan Service
Calcoli di costo, margine e scenari per gare Poste.
"""

from typing import Dict, Any, List, Optional, TYPE_CHECKING
import logging

logger = logging.getLogger(__name__)


class BusinessPlanService:
    """
    Servizio di calcolo per il Business Plan.
    Implementa la formula a 5 step dal design document.
    """

    DAYS_PER_FTE = 220

    @staticmethod
    def apply_volume_adjustments(
        team_composition: List[Dict[str, Any]],
        volume_adjustments: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """
        STEP 1: Applica rettifiche volumi (global, per TOW, per profilo).
        
        Args:
            team_composition: Lista profili dal capitolato [{profile_id, label, fte, ...}]
            volume_adjustments: {"global": 0.90, "by_tow": {...}, "by_profile": {...}}
        
        Returns:
            Team composition con FTE rettificati
        """
        global_factor = volume_adjustments.get("global", 1.0)
        by_tow = volume_adjustments.get("by_tow", {})
        by_profile = volume_adjustments.get("by_profile", {})

        adjusted = []
        for member in team_composition:
            profile_id = member.get("profile_id", member.get("label", ""))
            fte = float(member.get("fte", 0))

            # Apply global factor
            fte_adj = fte * global_factor

            # Apply profile factor
            profile_factor = by_profile.get(profile_id, 1.0)
            fte_adj *= profile_factor

            # TOW-level adjustments would apply to tow_allocation
            # For now, handled at the aggregate level
            adjusted_member = {**member, "fte_adjusted": round(fte_adj, 4)}
            adjusted.append(adjusted_member)

        return adjusted

    @staticmethod
    def apply_reuse_factor(effort: float, reuse_factor: float) -> float:
        """
        STEP 2: Applica fattore riuso.
        
        Args:
            effort: FTE o GG dopo rettifica
            reuse_factor: 0.0 - 1.0 (percentuale di efficienza)
        
        Returns:
            Effort effettivo dopo riuso
        """
        return effort * (1 - reuse_factor)

    @staticmethod
    def _get_mix_for_year(profile_mapping: List[Dict[str, Any]], year: int) -> Optional[List[Dict[str, Any]]]:
        """
        Trova il mix di profili corretto per un dato anno da una mappatura time-varying.
        """
        if not profile_mapping:
            return None

        # Caso 1: Mapping semplice, non time-varying (formato vecchio/semplificato)
        # [{"lutech_profile": "dev_sr", "pct": 1.0}]
        if "period" not in profile_mapping[0]:
            return profile_mapping

        # Caso 2: Mapping time-varying
        best_match = None
        for item in profile_mapping:
            period_label = item.get("period", "").strip()
            # Match esatto "Anno X"
            if period_label == f"Anno {year}":
                return item.get("mix")
            
            # Match generico "Anno X+"
            if period_label.endswith("+"):
                try:
                    start_year = int(period_label.replace("Anno", "").replace("+", "").strip())
                    if year >= start_year:
                        best_match = item.get("mix")
                except ValueError:
                    continue
        
        # Se nessun match esatto, ritorna l'ultimo "X+" valido o None
        return best_match


    @staticmethod
    def calculate_team_cost(
        team_composition: List[Dict[str, Any]],
        volume_adjustments: Dict[str, Any],
        reuse_factor: float,
        profile_mappings: Dict[str, List[Dict[str, Any]]],
        profile_rates: Dict[str, float],
        duration_months: int,
    ) -> Dict[str, Any]:
        """
        Calcola il costo del team basato su un mix di profili (anche time-varying).
        """
        if not duration_months or duration_months <= 0:
            raise ValueError("La durata del contratto (duration_months) deve essere positiva.")

        num_years = (duration_months - 1) // 12 + 1
        
        result = {
            "total_fte_original": 0.0,
            "total_fte_adjusted": 0.0,
            "total_days": 0.0,
            "total_cost": 0.0,
            "by_profile": {},
        }
        
        # Pre-calcola fattori di rettifica
        global_factor = volume_adjustments.get("global", 1.0)
        by_profile_factors = volume_adjustments.get("by_profile", {})

        for member in team_composition:
            poste_profile_id = member.get("profile_id", member.get("label", "unknown"))
            fte_original = float(member.get("fte", 0))

            profile_factor = by_profile_factors.get(poste_profile_id, 1.0)
            fte_adjusted_pre_reuse = fte_original * global_factor * profile_factor
            fte_effective = BusinessPlanService.apply_reuse_factor(fte_adjusted_pre_reuse, reuse_factor)
            
            days_per_year_effective = fte_effective * BusinessPlanService.DAYS_PER_FTE

            total_cost_for_member = 0.0
            profile_mapping = profile_mappings.get(poste_profile_id)

            if not profile_mapping:
                # Se non c'è mapping, usa una tariffa di default (o lancia errore?)
                # Qui usiamo la tariffa del profilo Poste se esiste, altrimenti default
                rate = profile_rates.get(poste_profile_id, 350.0)
                total_cost_for_member = days_per_year_effective * num_years * rate
            else:
                for year in range(1, num_years + 1):
                    yearly_cost = 0
                    # Trova il mix di profili Lutech per l'anno corrente
                    mix_for_year = BusinessPlanService._get_mix_for_year(profile_mapping, year)

                    if not mix_for_year:
                        # Fallback se non trova un mix per l'anno (es. "Anno 3" non definito)
                        # Usiamo l'ultimo mix disponibile
                        mix_for_year = profile_mapping[-1].get("mix") if "period" in profile_mapping[-1] else profile_mapping

                    for lutech_mix_item in mix_for_year:
                        lutech_profile_id = lutech_mix_item.get("lutech_profile")
                        mix_pct = lutech_mix_item.get("pct", 0.0)
                        
                        rate = profile_rates.get(lutech_profile_id, 400.0) # Tariffa di default se non trovata
                        
                        # Calcola il costo per questo slice di profilo Lutech per l'anno corrente
                        yearly_cost += days_per_year_effective * mix_pct * rate
                    
                    total_cost_for_member += yearly_cost

            # Aggiorna i totali
            result["total_fte_original"] += fte_original
            result["total_fte_adjusted"] += fte_effective
            result["total_days"] += days_per_year_effective * num_years
            result["total_cost"] += total_cost_for_member
            result["by_profile"][poste_profile_id] = {
                "fte_original": fte_original,
                "fte_adjusted": round(fte_effective, 2),
                "days": round(days_per_year_effective * num_years, 0),
                "cost": round(total_cost_for_member, 2),
            }

        # Arrotonda totali finali
        for key in ["total_fte_original", "total_fte_adjusted", "total_days", "total_cost"]:
            result[key] = round(result[key], 2)
        
        return result

    @staticmethod
    def calculate_tow_cost(
        bp_data: Dict[str, Any],
        tow_id: str,
    ) -> float:
        """
        STEP 3-4: Calcola costo singolo TOW.
        Stub - da implementare con catalogo profili/tariffe.
        """
        # TODO: Implement with actual profile catalog and mappings
        logger.info(f"calculate_tow_cost called for TOW: {tow_id} (stub)")
        return 0.0

    @staticmethod
    def calculate_total_cost(bp_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        STEP 5: Calcola costi totali con breakdown.
        
        Returns:
            {"team": ..., "governance": ..., "risk": ..., "subcontract": ..., "total": ...}
        """
        team_cost = float(bp_data.get("total_cost", 0.0))
        governance_pct = float(bp_data.get("governance_pct", 0.10))
        risk_pct = float(bp_data.get("risk_contingency_pct", 0.05))

        governance_cost = team_cost * governance_pct
        risk_cost = team_cost * risk_pct

        # Subcontract
        sub_config = bp_data.get("subcontract_config", {})
        sub_quota = float(sub_config.get("quota_pct", 0.0))
        subcontract_cost = team_cost * sub_quota

        total = team_cost + governance_cost + risk_cost + subcontract_cost

        return {
            "team": round(team_cost, 2),
            "governance": round(governance_cost, 2),
            "risk": round(risk_cost, 2),
            "subcontract": round(subcontract_cost, 2),
            "total": round(total, 2),
        }

    @staticmethod
    def calculate_margin(
        base_amount: float,
        total_cost: float,
        discount_pct: float = 0.0,
        is_rti: bool = False,
        quota_lutech: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Calcola margine (singolo o RTI).
        
        Args:
            base_amount: Importo base a base d'asta
            total_cost: Costo totale calcolato
            discount_pct: Sconto percentuale offerto
            is_rti: Se RTI
            quota_lutech: Quota Lutech (0.0-1.0) se RTI
        
        Returns:
            {"revenue": ..., "cost": ..., "margin": ..., "margin_pct": ...}
        """
        revenue = base_amount * (1 - discount_pct / 100)

        if is_rti:
            revenue = revenue * quota_lutech

        margin = revenue - total_cost
        margin_pct = (margin / revenue * 100) if revenue > 0 else 0.0

        return {
            "revenue": round(revenue, 2),
            "cost": round(total_cost, 2),
            "margin": round(margin, 2),
            "margin_pct": round(margin_pct, 2),
        }

    @staticmethod
    def find_discount_for_margin(
        base_amount: float,
        total_cost: float,
        target_margin_pct: float,
        is_rti: bool = False,
        quota_lutech: float = 1.0,
    ) -> float:
        """
        Trova lo sconto necessario per raggiungere un margine target.
        
        margin = (revenue - cost) / revenue
        target = (base*(1-d)*q - cost) / (base*(1-d)*q)
        => target * base*(1-d)*q = base*(1-d)*q - cost
        => cost = base*(1-d)*q * (1 - target)
        => (1-d) = cost / (base * q * (1 - target))
        => d = 1 - cost / (base * q * (1 - target))
        """
        target = target_margin_pct / 100
        q = quota_lutech if is_rti else 1.0
        denominator = base_amount * q * (1 - target)

        if denominator <= 0:
            return 0.0

        discount = 1 - (total_cost / denominator)
        return round(max(0, min(100, discount * 100)), 2)

    @staticmethod
    def generate_scenarios(bp_data: Dict[str, Any], base_amount: float) -> List[Dict[str, Any]]:
        """
        Genera 3 scenari: Conservative/Balanced/Aggressive.
        Stub - da implementare con calcoli effettivi.
        """
        total_cost = float(bp_data.get("total_cost", 0.0))
        
        scenarios = []
        for name, reuse, vol_adj in [
            ("Conservativo", 0.05, 0.95),
            ("Bilanciato", 0.15, 0.90),
            ("Aggressivo", 0.30, 0.85),
        ]:
            adjusted_cost = total_cost * vol_adj * (1 - reuse)
            margin_result = BusinessPlanService.calculate_margin(
                base_amount, adjusted_cost, discount_pct=0
            )
            scenarios.append({
                "name": name,
                "reuse_factor": reuse,
                "volume_adjustment": vol_adj,
                "total_cost": round(adjusted_cost, 2),
                **margin_result,
            })

        return scenarios
