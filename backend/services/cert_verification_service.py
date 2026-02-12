"""
Certification Verification Service
Verifies PDF certificates against lot requirements using OCR
"""

import os
import re
import logging
import unicodedata
import json
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING
from dataclasses import dataclass, asdict, field
from difflib import SequenceMatcher

# Type-only import for PIL Image (avoids runtime error if PIL not installed)
if TYPE_CHECKING:
    from PIL import Image as PILImage

try:
    import pytesseract
    from PIL import Image, ImageOps, ImageFilter
    import pdf2image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

try:
    import fitz  # PyMuPDF for embedded text extraction
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

logger = logging.getLogger(__name__)

# Import default vendors from shared module (avoids duplication with crud.py)
from vendor_defaults import DEFAULT_VENDORS
KNOWN_VENDORS = DEFAULT_VENDORS


@dataclass
class CertVerificationResult:
    """Result of verifying a single certificate PDF"""
    filename: str
    req_code: str  # Extracted from filename
    cert_name_from_file: str  # Extracted from filename
    resource_name: str  # Extracted from filename
    vendor_detected: Optional[str] = None
    vendor_confidence: float = 0.0
    cert_name_detected: Optional[str] = None
    cert_code_detected: Optional[str] = None
    resource_name_detected: Optional[str] = None  # Person name from OCR
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    status: str = "unprocessed"  # valid, expired, mismatch, unreadable, not_downloaded, error
    confidence: float = 0.0
    ocr_text_preview: Optional[str] = None
    errors: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Default settings (used as fallback if DB settings not available)
DEFAULT_DATE_PATTERNS = [
    r"valid\s*(?:from|since|until|thru|through|to)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"expir(?:es?|ation|y)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"issue[d]?\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"date\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})",  # ISO format
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4})",  # Month DD, YYYY or Month DD,YYYY
    r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})",  # DD Month YYYY
    # Italian month patterns
    r"(\d{1,2}\s+(?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{4})",  # DD mese YYYY
    r"((?:gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+\d{1,2},?\s*\d{4})",  # mese DD, YYYY or mese DD,YYYY
]

DEFAULT_TECH_TERMS = {
    'architect', 'developer', 'engineer', 'manager', 'administrator',
    'consultant', 'analyst', 'specialist', 'expert', 'professional',
    'associate', 'practitioner', 'certificate', 'certification', 'certified',
    'solutions', 'cloud', 'data', 'security', 'network', 'systems',
    'project', 'program', 'product', 'technical', 'senior', 'junior',
    'lead', 'principal', 'staff', 'full', 'stack', 'frontend', 'backend',
    'devops', 'sysops', 'azure', 'aws', 'google', 'oracle', 'sap',
    'cisco', 'microsoft', 'redhat', 'vmware', 'kubernetes', 'docker',
    'java', 'python', 'javascript', 'scrum', 'agile', 'pmi', 'pmbok',
    'itil', 'prince', 'togaf', 'cobit', 'iso', 'audit', 'governance',
    'programmatore', 'sviluppatore', 'progettista', 'responsabile',
    'coordinatore', 'direttore', 'capo', 'tecnico', 'funzionale',
}

DEFAULT_OCR_DPI = 600
DEFAULT_MAX_FILE_SIZE_MB = 20  # Skip OCR for files larger than this (fix #5)


class CertVerificationService:
    """Service to verify certification PDFs"""
    
    def __init__(
        self, 
        tesseract_cmd: Optional[str] = None, 
        vendors: Optional[Dict[str, Any]] = None,
        settings: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize the service
        
        Args:
            tesseract_cmd: Path to tesseract executable (optional)
            vendors: Optional dict of vendor configs to use instead of default KNOWN_VENDORS.
                     If None, uses the hardcoded KNOWN_VENDORS.
                     Format: {key: {name, aliases, cert_patterns}}
            settings: Optional dict of OCR settings from database.
                      Keys: date_patterns (list), tech_terms (list), ocr_dpi (int)
        """
        if not OCR_AVAILABLE:
            raise ImportError(
                "OCR dependencies not available. Install with: "
                "pip install pytesseract pdf2image Pillow"
            )
        
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        
        # Use provided vendors or fallback to hardcoded defaults
        self.vendors = vendors if vendors is not None else KNOWN_VENDORS
        
        # Load OCR settings with defaults
        self.settings = settings or {}
        self.date_patterns = self._load_setting('date_patterns', DEFAULT_DATE_PATTERNS)
        self.tech_terms = set(self._load_setting('tech_terms', list(DEFAULT_TECH_TERMS)))
        self.ocr_dpi = int(self._load_setting('ocr_dpi', DEFAULT_OCR_DPI))
        self.max_file_size_mb = float(self._load_setting('max_file_size_mb', DEFAULT_MAX_FILE_SIZE_MB))
    
    def _load_setting(self, key: str, default: Any) -> Any:
        """Load a setting from the settings dict, parsing JSON if needed."""
        value = self.settings.get(key)
        if value is None:
            return default
        
        # If value is a string, try to parse as JSON (for list/dict settings)
        if isinstance(value, str):
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        return value
    
    @staticmethod
    def load_vendors_from_db(db_session) -> Dict[str, Any]:
        """
        Load vendor configurations from database.
        
        Args:
            db_session: SQLAlchemy database session
            
        Returns:
            Dict of vendor configs in KNOWN_VENDORS format
        """
        from models import VendorConfigModel
        
        vendors = {}
        db_vendors = db_session.query(VendorConfigModel).filter(VendorConfigModel.enabled == "1").all()
        
        for v in db_vendors:
            vendors[v.key] = {
                "name": v.name,
                "aliases": v.aliases or [],
                "cert_patterns": v.cert_patterns or [],
            }
        
        return vendors if vendors else KNOWN_VENDORS  # Fallback to defaults if DB is empty
    
    @staticmethod
    def load_settings_from_db(db_session) -> Dict[str, Any]:
        """
        Load OCR settings from database.
        
        Args:
            db_session: SQLAlchemy database session
            
        Returns:
            Dict of settings {key: value}
        """
        from models import OCRSettingsModel
        
        settings = {}
        db_settings = db_session.query(OCRSettingsModel).all()
        
        for s in db_settings:
            settings[s.key] = s.value
        
        return settings
    
    def parse_filename(self, filename: str) -> Tuple[str, str, str]:
        """
        Parse filename flexibly to extract req_code, cert_name, and resource_name
        
        Uses intelligent pattern matching to handle various filename formats:
        - GOV_REQ_125_Cloud solution architect_Caruso Mario Alessio.pdf
        - REQ01_AWS_Solutions_Architect_Mario_Rossi.pdf
        - Lotto2_125_PMBOK_Vinci Pierpaolo.pdf
        - AWS_Solutions_Architect_Certificate_John_Smith.pdf
        - Any other reasonable format
        
        Args:
            filename: The PDF filename
            
        Returns:
            Tuple of (req_code, cert_name, resource_name)
        """
        # Normalize Unicode to NFC (composed form) - macOS uses NFD (decomposed)
        # e.g., 'ò' (decomposed: o + combining accent) -> 'ò' (single character)
        filename = unicodedata.normalize('NFC', filename)
        
        # Remove extension
        name = Path(filename).stem
        
        # Use configurable tech_terms from settings
        tech_terms = self.tech_terms
        
        # Normalize: keep spaces within parts, split only by underscore
        # First, let's identify segments (underscore-separated)
        parts = name.split("_")
        
        req_code = ""
        cert_name = ""
        resource_name = ""
        
        # Regex patterns for requirement codes
        req_patterns = [
            r'^(GOV[_\s]*REQ[_\s]*\d+)',  # GOV_REQ_125, GOV REQ 125
            r'^([A-Z]{2,5}[_\s]*REQ[_\s]*\d+)',  # XXX_REQ_NNN
            r'^(REQ[_\s]*[A-Z]+[_\s]*\d+)',  # REQ_VALTEC_6, REQ_ABC_123
            r'^(REQ[_\s-]*\d+)',  # REQ01, REQ_01, REQ-01
            r'^(LOTTO?[_\s]*\d+[_\s]*\d+)',  # LOTTO_2_125, LOT2_125
            r'^(\d{2,4}[_\s]+\d{2,4})',  # Numeric codes like 125_01
        ]
        
        # Try to find requirement code in the full name
        full_name_upper = name.upper().replace(" ", "_")
        for pattern in req_patterns:
            match = re.search(pattern, full_name_upper, re.IGNORECASE)
            if match:
                # Count how many parts this match spans
                matched_text = match.group(1)
                matched_parts_count = len(matched_text.split("_"))
                req_code = "_".join(parts[:matched_parts_count])
                parts = parts[matched_parts_count:]
                break
        
        # If no req_code found, check first part for code-like pattern  
        if not req_code and parts:
            first = parts[0]
            if re.search(r'\d', first) or (len(first) <= 6 and first.isupper()):
                req_code = first
                parts = parts[1:]
        
        # Find person name: look for the LAST segment that contains 2+ capitalized words
        # that are NOT technical terms
        def split_camelcase(text: str) -> list:
            """Split CamelCase into separate words: BenedettoFrancesco -> ['Benedetto', 'Francesco']
            Also handles accented characters like RodonòGabriele -> ['Rodonò', 'Gabriele']
            """
            # Insert space before each uppercase letter that follows a lowercase letter
            # Use Unicode-aware pattern to include accented lowercase letters (à, è, ì, ò, ù, etc.)
            result = re.sub(r'([a-zàèéìòùáéíóú])([A-Z])', r'\1 \2', text)
            return result.split()
        
        def is_person_name(text: str) -> bool:
            """Check if text looks like a person name (Nome Cognome or NomeCognome)"""
            # First try splitting by space
            words = text.split()
            
            # If single word, check for CamelCase pattern (e.g., BenedettoFrancesco)
            if len(words) == 1:
                camel_words = split_camelcase(words[0])
                if len(camel_words) >= 2:
                    words = camel_words
                else:
                    return False
            
            # All words should be capitalized and not be tech terms
            name_words = []
            for w in words:
                w_clean = re.sub(r'[^\w]', '', w)
                if not w_clean:
                    continue
                # Check: starts with capital, not a tech term
                if w_clean[0].isupper() and w_clean.lower() not in tech_terms:
                    name_words.append(w_clean)
                else:
                    return False  # Contains a tech term, not a person name
            return len(name_words) >= 2
        
        # Check parts from the end for person names
        for i in range(len(parts) - 1, -1, -1):
            part = parts[i]
            if is_person_name(part):
                # Expand CamelCase if present
                resource_name = " ".join(split_camelcase(part))
                parts = parts[:i]
                break
        
        # If no person name found in single part, check last 2 parts combined
        if not resource_name and len(parts) >= 2:
            last_two = parts[-2] + " " + parts[-1]
            if is_person_name(last_two):
                # Expand CamelCase in each part
                resource_name = " ".join(split_camelcase(last_two))
                parts = parts[:-2]
        
        # Everything remaining is the certification name
        if parts:
            cert_name = " ".join(parts)
        
        # Fallback: if we couldn't parse anything meaningful
        if not req_code and not cert_name and not resource_name:
            cert_name = name
        
        # Clean up
        req_code = re.sub(r'\s+', ' ', req_code).strip()
        cert_name = re.sub(r'\s+', ' ', cert_name).strip()
        resource_name = re.sub(r'\s+', ' ', resource_name).strip()
        
        logger.debug(f"Parsed '{filename}' -> req={req_code}, cert={cert_name}, person={resource_name}")
        
        return req_code, cert_name, resource_name
    
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """
        Extract text from PDF - first tries embedded text, then falls back to OCR
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Extracted text
        """
        # First, try to extract embedded text using PyMuPDF (much faster and more accurate)
        if PYMUPDF_AVAILABLE:
            try:
                embedded_text = self._extract_embedded_text(pdf_path)
                if embedded_text and len(embedded_text.strip()) > 50:
                    # Check if text contains meaningful content
                    score = self._score_ocr_text(embedded_text)
                    if score >= 5:
                        logger.debug(f"Using embedded text extraction (score={score}, length={len(embedded_text)})")
                        return embedded_text
                    else:
                        logger.debug(f"Embedded text score too low ({score}), falling back to OCR")
            except Exception as e:
                logger.debug(f"Embedded text extraction failed: {e}, falling back to OCR")
        
        # Fall back to OCR if embedded text extraction fails or is insufficient
        try:
            # Convert PDF to images using configurable DPI
            images = pdf2image.convert_from_path(pdf_path, dpi=self.ocr_dpi)
            
            text_parts = []
            for i, image in enumerate(images):
                # Try OCR with original orientation
                text = self._ocr_with_rotation(image)
                text_parts.append(text)
            
            return "\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error extracting text from PDF {pdf_path}: {e}")
            raise
    
    def _extract_embedded_text(self, pdf_path: str) -> str:
        """
        Extract embedded text from PDF using PyMuPDF (fitz)
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Extracted embedded text
        """
        text_parts = []
        with fitz.open(pdf_path) as doc:
            for page in doc:
                text = page.get_text()
                if text:
                    text_parts.append(text)
        return "\n".join(text_parts)
    
    def _preprocess_image(self, image: "PILImage.Image") -> "PILImage.Image":
        """
        Preprocess image for better OCR on certificates with colored backgrounds
        """
        # Convert to grayscale
        gray = image.convert('L')
        # Apply autocontrast to enhance contrast
        enhanced = ImageOps.autocontrast(gray, cutoff=2)
        # Apply slight sharpening
        sharpened = enhanced.filter(ImageFilter.SHARPEN)
        return sharpened
    
    def _ocr_with_rotation(self, image: "PILImage.Image") -> str:
        """
        Try OCR on image, rotating up to 3 times; test multiple Tesseract configs per rotation
        """
        rotations = [0, 90, 180, 270]
        configs = ["", "--oem 3 --psm 6", "--oem 3 --psm 4"]
        best_text = ""
        best_score = 0
        best_rotation = 0
        
        # Try with original image first
        for image_variant in [image, self._preprocess_image(image)]:
            for rotation in rotations:
                rotated = image_variant.rotate(-rotation, expand=True) if rotation > 0 else image_variant
                for cfg in configs:
                    try:
                        text = pytesseract.image_to_string(rotated, lang='eng+ita', config=cfg)
                    except Exception:
                        continue
                    score = self._score_ocr_text(text)
                    if score > best_score:
                        best_score = score
                        best_text = text
                        best_rotation = rotation
                        if score >= 15:  # Higher threshold to try both variants
                            break
                if best_score >= 15:
                    break
            if best_score >= 15:
                break
        
        # Log only once with the final result (reduced verbosity)
        if best_score == 0:
            logger.debug("Could not extract meaningful text from image at any rotation/config")
        elif best_score >= 10:
            logger.debug(f"Good OCR result at rotation {best_rotation}° (score={best_score})")
        
        return best_text
    
    def _score_ocr_text(self, text: str) -> int:
        """
        Score OCR text quality based on presence of meaningful content
        
        Args:
            text: Extracted text
            
        Returns:
            Quality score (higher is better)
        """
        if not text:
            return 0
        
        score = 0
        text_lower = text.lower()
        
        # Check for common certificate keywords
        cert_keywords = [
            'certified', 'certificate', 'certification', 'credential',
            'issued', 'valid', 'expires', 'expiration', 'date',
            'name', 'has successfully', 'completed', 'achieved',
            'professional', 'associate', 'expert', 'specialist',
            'certificato', 'certificazione', 'valido', 'scadenza',
        ]
        
        for keyword in cert_keywords:
            if keyword in text_lower:
                score += 2
        
        # Check for vendor names
        for vendor_info in self.vendors.values():
            for alias in vendor_info['aliases']:
                if alias in text_lower:
                    score += 3
                    break
        
        # Check for dates (indicates valid certificate data)
        if re.search(r'\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}', text):
            score += 2
        
        # Penalize very short text
        if len(text) < 50:
            score = max(0, score - 5)
        
        return score
    
    def detect_vendor(self, text: str) -> Tuple[Optional[str], float]:
        """
        Detect certification vendor from OCR text
        
        Args:
            text: OCR extracted text
            
        Returns:
            Tuple of (vendor_key, confidence_score)
        """
        text_lower = text.lower()
        
        best_vendor = None
        best_score = 0.0
        
        for vendor_key, vendor_info in self.vendors.items():
            score = 0.0
            
            # Check for vendor name/aliases
            for alias in vendor_info["aliases"]:
                if alias in text_lower:
                    score += 0.5
                    break
            
            # Check for certification patterns
            pattern_matches = 0
            for pattern in vendor_info["cert_patterns"]:
                if re.search(pattern, text_lower):
                    pattern_matches += 1
            
            if pattern_matches > 0:
                score += min(0.5, pattern_matches * 0.2)
            
            if score > best_score:
                best_score = score
                best_vendor = vendor_key
        
        return best_vendor, best_score
    
    def extract_cert_code(self, text: str, vendor: Optional[str]) -> Optional[str]:
        """
        Extract certification code from text based on vendor patterns
        
        Args:
            text: OCR extracted text
            vendor: Detected vendor key
            
        Returns:
            Certification code if found
        """
        if not vendor or vendor not in self.vendors:
            return None
        
        text_upper = text.upper()
        
        # Use vendor's configured cert_patterns to find codes
        # Look for patterns that look like codes (contain numbers/dashes)
        vendor_patterns = self.vendors[vendor].get("cert_patterns", [])
        
        for pattern in vendor_patterns:
            try:
                # Check if pattern contains code-like elements (digits, specific formats)
                if re.search(r'\\d|[A-Z]{2,}[-_]\\d', pattern, re.IGNORECASE):
                    match = re.search(pattern, text_upper, re.IGNORECASE)
                    if match:
                        code = match.group(0) if match.group(0) else None
                        if code and len(code) >= 4 and re.search(r'\d', code):
                            return code.upper()
            except re.error:
                # Skip invalid regex patterns
                continue
        
        # Fallback: vendor-specific code patterns (for common formats)
        fallback_patterns = {
            "aws": r"(SAA-C\d+|DVA-C\d+|SOA-C\d+|CLF-C\d+)",
            "microsoft": r"(AZ-\d+|MS-\d+|DP-\d+|AI-\d+|PL-\d+)",
            "sap": r"(C_\w+_\d+|E_\w+_\d+|P_\w+_\d+)",
            "oracle": r"(1Z0-\d+)",
            "redhat": r"(EX\d+)",
        }
        
        if vendor in fallback_patterns:
            match = re.search(fallback_patterns[vendor], text_upper)
            if match:
                return match.group(1)
        
        return None
    
    # Date pattern with context keywords for better identification
    DATE_PATTERN_GENERIC = r'(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*\d{4})'
    
    def extract_dates(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract validity dates from text
        
        Args:
            text: OCR extracted text
            
        Returns:
            Tuple of (valid_from, valid_until) as strings
        """
        text_lower = text.lower()
        valid_from = None
        valid_until = None
        
        # First, try to find dates with explicit context keywords
        # Patterns for expiry/end dates (allow newlines between keyword and date)
        expiry_patterns = [
            rf'expir(?:es?|ation|y)\s*(?:date)?\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'valid\s*(?:until|thru|through|to)\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'end(?:s|ing)?\s*(?:date)?\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
        ]
        
        # Patterns for issue/start dates
        issue_patterns = [
            rf'issue[d]?\s*(?:date|on)?\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'valid\s*(?:from|since)\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'effective\s*(?:from|date|day)?\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'start(?:s|ing)?\s*(?:date)?\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
            rf'date\s*(?:registered|of\s*issue)\s*[:\-]?\s*{self.DATE_PATTERN_GENERIC}',
        ]
        
        # Try to find expiry date with context (use re.DOTALL to match across newlines)
        for pattern in expiry_patterns:
            match = re.search(pattern, text_lower, re.IGNORECASE | re.DOTALL)
            if match:
                date_str = match.group(1)
                if self._parse_date(date_str):
                    valid_until = date_str
                    logger.debug(f"Found expiry date with context: {valid_until}")
                    break
        
        # Try to find issue date with context
        for pattern in issue_patterns:
            match = re.search(pattern, text_lower, re.IGNORECASE | re.DOTALL)
            if match:
                date_str = match.group(1)
                if self._parse_date(date_str):
                    valid_from = date_str
                    logger.debug(f"Found issue date with context: {valid_from}")
                    break
        
        # If we found both with context, return them
        if valid_from and valid_until:
            return valid_from, valid_until
        
        # Fallback: find all dates and sort chronologically
        dates_found = []
        for pattern in self.date_patterns:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            dates_found.extend(matches)
        
        # Try to parse and sort dates
        parsed_dates = []
        for date_str in dates_found[:10]:  # Limit to first 10 matches
            parsed = self._parse_date(date_str)
            if parsed:
                # Avoid duplicates
                if not any(p[1] == date_str for p in parsed_dates):
                    parsed_dates.append((parsed, date_str))
        
        parsed_dates.sort(key=lambda x: x[0])
        
        # Fill in missing dates from sorted list
        if not valid_from and not valid_until:
            if len(parsed_dates) >= 2:
                valid_from = parsed_dates[0][1]
                valid_until = parsed_dates[-1][1]
            elif len(parsed_dates) == 1:
                # Check context to determine if it's issue or expiry date
                if any(kw in text_lower for kw in ["expir", "valid until", "valid thru"]):
                    valid_until = parsed_dates[0][1]
                else:
                    valid_from = parsed_dates[0][1]
        elif not valid_from and parsed_dates:
            # We have valid_until, find valid_from from remaining dates
            for parsed, date_str in parsed_dates:
                if date_str != valid_until:
                    valid_from = date_str
                    break
        elif not valid_until and parsed_dates:
            # We have valid_from, find valid_until from remaining dates
            for parsed, date_str in reversed(parsed_dates):
                if date_str != valid_from:
                    valid_until = date_str
                    break
        
        return valid_from, valid_until
    
    # Italian month name mapping
    ITALIAN_MONTHS = {
        'gennaio': 'january', 'febbraio': 'february', 'marzo': 'march',
        'aprile': 'april', 'maggio': 'may', 'giugno': 'june',
        'luglio': 'july', 'agosto': 'august', 'settembre': 'september',
        'ottobre': 'october', 'novembre': 'november', 'dicembre': 'december'
    }
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse a date string into a date object"""
        # First, convert Italian month names to English
        date_str_normalized = date_str.strip().lower()
        for it_month, en_month in self.ITALIAN_MONTHS.items():
            if it_month in date_str_normalized:
                date_str_normalized = date_str_normalized.replace(it_month, en_month)
                break
        
        # Normalize comma without space: "January 31,2028" -> "January 31, 2028"
        date_str_normalized = re.sub(r',(\d)', r', \1', date_str_normalized)
        
        date_formats = [
            "%d/%m/%Y", "%m/%d/%Y", "%Y/%m/%d",
            "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%d",
            "%d.%m.%Y", "%m.%d.%Y", "%Y.%m.%d",
            "%d/%m/%y", "%m/%d/%y",
            "%B %d, %Y", "%d %B %Y",
            "%b %d, %Y", "%d %b %Y",
        ]
        
        for fmt in date_formats:
            try:
                return datetime.strptime(date_str_normalized, fmt).date()
            except ValueError:
                continue
        
        return None
    
    def _names_match(self, name1: str, name2: str) -> bool:
        """
        Check if two person names match (handles different orders)
        e.g., "Rossi Mario" matches "Mario Rossi"
        
        Args:
            name1: First name
            name2: Second name
            
        Returns:
            True if names match
        """
        if not name1 or not name2:
            return False
        
        # Normalize: lowercase, split into parts
        parts1 = set(p.lower().strip() for p in name1.split() if p.strip())
        parts2 = set(p.lower().strip() for p in name2.split() if p.strip())
        
        # Check if all parts match (order-agnostic)
        return parts1 == parts2
    
    def calculate_match_score(
        self, 
        cert_name_from_file: str, 
        cert_name_detected: Optional[str],
        vendor_detected: Optional[str]
    ) -> float:
        """
        Calculate how well the detected cert matches what was expected
        
        Args:
            cert_name_from_file: Certificate name from filename
            cert_name_detected: Detected certificate name from OCR
            vendor_detected: Detected vendor
            
        Returns:
            Match score between 0 and 1
        """
        if not cert_name_from_file:
            return 0.5  # Can't compare, neutral score
        
        score = 0.0
        file_name_lower = cert_name_from_file.lower().replace("-", " ").replace("_", " ")
        
        # Check if vendor name is in filename
        if vendor_detected:
            vendor_info = self.vendors.get(vendor_detected, {})
            for alias in vendor_info.get("aliases", []):
                if alias in file_name_lower:
                    score += 0.4
                    break
        
        # Check certification pattern match
        if vendor_detected and vendor_detected in self.vendors:
            for pattern in self.vendors[vendor_detected]["cert_patterns"]:
                if re.search(pattern, file_name_lower):
                    score += 0.3
                    break
        
        # Fuzzy string match
        if cert_name_detected:
            similarity = SequenceMatcher(
                None, 
                file_name_lower, 
                cert_name_detected.lower()
            ).ratio()
            score += similarity * 0.3
        
        return min(1.0, score)
    
    def verify_certificate(self, pdf_path: str) -> CertVerificationResult:
        """
        Extract information from a certificate PDF
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            CertVerificationResult with extracted details
        """
        filename = os.path.basename(pdf_path)
        req_code, cert_name, resource_name = self.parse_filename(filename)
        
        result = CertVerificationResult(
            filename=filename,
            req_code=req_code,
            cert_name_from_file=cert_name,
            resource_name=resource_name,
        )
        
        try:
            # Check if file exists and has content (cloud-synced files may be 0 bytes if not downloaded)
            file_size = os.path.getsize(pdf_path)
            if file_size == 0:
                result.status = "not_downloaded"
                result.errors.append("File non scaricato: il file è vuoto (0 bytes). Scarica il file localmente da OneDrive/SharePoint prima di verificare.")
                logger.warning(f"File {filename} has 0 bytes - likely a cloud placeholder not downloaded locally")
                return result
            
            # Check if file is too large for OCR (fix #5 - prevent timeout on huge files)
            file_size_mb = file_size / (1024 * 1024)
            if file_size_mb > self.max_file_size_mb:
                result.status = "too_large"
                result.errors.append(f"File troppo grande ({file_size_mb:.1f} MB > {self.max_file_size_mb} MB max). Ridurre dimensione o aumentare limite.")
                logger.warning(f"File {filename} is {file_size_mb:.1f} MB, exceeds max {self.max_file_size_mb} MB")
                return result
            
            # Extract text via OCR
            text = self.extract_text_from_pdf(pdf_path)
            result.ocr_text_preview = text[:500] if text else None
            
            if not text or len(text.strip()) < 30:
                result.status = "unreadable"
                result.errors.append("Could not extract sufficient text from PDF")
                return result
            
            # Detect vendor
            vendor, vendor_conf = self.detect_vendor(text)
            result.vendor_detected = self.vendors.get(vendor, {}).get("name") if vendor else None
            result.vendor_confidence = vendor_conf
            
            # Extract cert code
            result.cert_code_detected = self.extract_cert_code(text, vendor)
            
            # Try to extract certification name from text
            result.cert_name_detected = self.extract_cert_name(text, vendor)
            
            # Try to extract person name from OCR using filename resource as reference
            result.resource_name_detected = self.extract_person_name(text, resource_name)
            
            logger.debug(f"Extracted: vendor={result.vendor_detected}, code={result.cert_code_detected}, cert_name={result.cert_name_detected}, person={result.resource_name_detected}")
            logger.debug(f"OCR text first 200 chars: {text[:200] if text else 'EMPTY'}")
            logger.debug(f"OCR text FULL length: {len(text) if text else 0}")
            logger.debug(f"OCR text COMPLETE: {text if text else 'EMPTY'}")  # DEBUG FULL TEXT
            
            # Extract dates
            valid_from, valid_until = self.extract_dates(text)
            result.valid_from = valid_from
            result.valid_until = valid_until
            logger.debug(f"Dates extracted: from={valid_from}, until={valid_until}")
            
            # Determine status based on extraction success
            extraction_success = bool(result.vendor_detected or result.cert_code_detected or result.cert_name_detected)
            
            if extraction_success:
                # Check expiration if we have an end date
                if valid_until:
                    expiry = self._parse_date(valid_until)
                    if expiry and expiry < date.today():
                        result.status = "expired"
                    else:
                        result.status = "valid"
                else:
                    result.status = "valid"
                
                # Check for resource name mismatch
                if result.status == "valid" and resource_name and result.resource_name_detected:
                    if not self._names_match(resource_name, result.resource_name_detected):
                        result.status = "mismatch"
                        result.errors.append(f"Nome risorsa non corrisponde: file='{resource_name}', OCR='{result.resource_name_detected}'")
                
                # Set confidence based on how much we extracted
                extracted_fields = sum([
                    bool(result.vendor_detected),
                    bool(result.cert_code_detected),
                    bool(result.cert_name_detected),
                    bool(result.valid_from),
                    bool(result.valid_until),
                ])
                result.confidence = extracted_fields / 5.0
            else:
                result.status = "unreadable"
                result.errors.append("Could not extract certification information from PDF")
        
        except Exception as e:
            logger.error(f"Error verifying certificate {pdf_path}: {e}")
            result.status = "error"
            result.errors.append(str(e))
        
        return result
    
    def extract_cert_name(self, text: str, vendor: Optional[str] = None) -> Optional[str]:
        """
        Try to extract the certification name from the OCR text
        
        Args:
            text: OCR extracted text
            vendor: Detected vendor (if any)
            
        Returns:
            Extracted certification name or None
        """
        # Normalize text: replace newlines with spaces to handle multi-line names
        text_normalized = re.sub(r'\n+', ' ', text)
        text_normalized = re.sub(r'\s+', ' ', text_normalized)
        
        logger.debug(f"extract_cert_name: normalized text = {repr(text_normalized[:200] if text_normalized else 'EMPTY')}")
        
        # Month names for date terminators
        months = r'(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)'
        
        # Common certification title patterns - order matters, more specific first
        cert_patterns = [
            # Cisco patterns - must be before generic ones (include months as terminators for expiration dates)
            rf'Cisco\s+Certified\s+Specialist\s*[-–]\s*([A-Za-z][A-Za-z\s\-]+?)(?:\s+Issued|\s+Date|\s+Cisco|\s+Expir|\s+{months}|\s+CSCO|\s+\d{{4}}|\s*$)',
            rf'Cisco\s+Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Issued|\s+Date|\s+Cisco|\s+Expir|\s+{months}|\s+CSCO|\s+\d{{4}}|\s*$)',
            r'(CCNA|CCNP|CCIE|CCDA|CCDP)\s*[-–]?\s*([A-Za-z][A-Za-z\s\-]*?)(?:\s+Issued|\s+Date|\s+Cisco|\s*$)',
            # Microsoft patterns (English)
            r'Microsoft\s+Certified[:\s]+([A-Za-z][A-Za-z\s\-]+?(?:Expert|Associate|Fundamentals))',
            # Microsoft Italian - "Certificato Microsoft:" pattern (Italian cert names)
            r'Certificat[oi]\s+Microsoft[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-]+?)(?:\s+ID\s+della|\s+Numero|\s+Verifica|\s+Credential|\s*$)',
            # Microsoft Italian - "Certificazione Microsoft:" alternate pattern  
            r'Certificazione\s+Microsoft[:\s]+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-]+?)(?:\s+ID|\s+Numero|\s+Verifica|\s*$)',
            # ServiceNow - capture full cert name (greedy until Issued/line-end)
            r'requirements\s+for\s+(.+?)(?:\s+Issued|\s+Certification)',
            r'requirements\s+for\s+([A-Za-z][A-Za-z\s\-]+(?:Administrator|Developer|Specialist|Manager|Expert))',
            # Red Hat - allow more chars
            r'RED\s*HAT\s+CERTIFIED\s+([A-Z][A-Za-z\s\-]+)(?:\s+Red|\s+Issued)',
            r'Red\s*Hat\s+Certified\s+([A-Za-z][A-Za-z\s\-]+)(?:\s+Red|\s+Issued)',
            r'certified\s+as\s+a\s+RED\s+HAT\s+([A-Z][A-Za-z\s\-]+)',
            # AWS
            r'AWS\s+Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Validation|\s+Badge|\s+AWS|\s+Issued)',
            # Google Cloud (more variants)
            r'Google\s+Cloud\s+(?:Certified\s+)?([A-Za-z][A-Za-z\s\-]+?)(?:\s+Credential|\s+Google|\s+Issued)',
            r'Google\s+Cloud\s+([A-Za-z][A-Za-z\s\-]+?)(?:Professional|Associate)',
            # Oracle
            r'Oracle\s+Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Oracle|\s+Credential|\s+Issued)',
            # SAP
            r'SAP\s+Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+SAP|\s+Credential|\s+Issued)',
            # VMware / VCP / VCAP
            r'VMware\s+Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Professional|\s+Advanced|\s+Design|\s+VCAP|\s+VCP)',
            r'VCP[\-\s]*(?:\d{2}|[A-Z]{2,})?\s*([A-Za-z][A-Za-z\s\-]+?)(?:\s+Certification|\s+Issued)',
            # PMI/PMP / ITIL
            r'(Project\s+Management\s+Professional)',
            r'(ITIL\s+\d\s+[A-Za-z][A-Za-z\s\-]+?)(?:\s+Certificate|\s+ITIL|\s+Axelos|\s+Issued)',  # ITIL 4 Managing Professional
            r'ITIL\s+(?:v\d\s+)?([A-Za-z][A-Za-z\s\-]+?)(?:\s+Certificate|\s+ITIL|\s+Axelos|\s+Issued)',
            # PRINCE2 / PeopleCert / Axelos - full name patterns FIRST
            r'(PRINCE2®?\s+Foundation\s+Certificate(?:\s+in\s+Project\s+Management)?)',
            r'(PRINCE2®?\s+Practitioner\s+Certificate(?:\s+in\s+Project\s+Management)?)',
            r'(PRINCE2®?\s+Agile\s+(?:Foundation|Practitioner)(?:\s+Certificate)?)',
            r'PeopleCert[:\s]+([A-Za-z][A-Za-z\s\-0-9]+?)(?:\s+Certificate|\s+Issued|\s+Valid|\s*$)',
            r'Axelos[:\s]+([A-Za-z][A-Za-z\s\-0-9]+?)(?:\s+Certificate|\s+Issued|\s+Valid|\s*$)',
            # PRINCE2 fallback - only level name if full pattern didn't match
            r'(PRINCE2®?\s+(?:Foundation|Practitioner|Agile))',
            # IAPP - Privacy certifications - specific patterns first
            r'(CIPP(?:/[A-Z]{1,2})?)',  # CIPP, CIPP/E, CIPP/US, CIPP/C, etc.
            r'(CIPM)',  # Certified Information Privacy Manager
            r'(CIPT)',  # Certified Information Privacy Technologist
            r'(FIP)',   # Fellow of Information Privacy
            r'confer\s+upon.*?the\s+designation\s+of\s+([A-Z]{3,5}(?:/[A-Z]{1,2})?)',  # IAPP "confer upon X the designation of CIPM"
            r'(Certified\s+Information\s+Privacy\s+(?:Professional|Manager|Technologist))',  # Full IAPP cert name
            r'knowledge\s+of[.\s]+information\s+privacy\s+management.*(CIPM)',  # Map "information privacy management" context to CIPM
            # ISACA - Governance/Audit certifications
            r'(CGEIT)',  # Certified in Governance of Enterprise IT
            r'(CISA)',   # Certified Information Systems Auditor
            r'(CISM)',   # Certified Information Security Manager
            r'(CRISC)',  # Certified in Risk and Information Systems Control
            r'(CDPSE)',  # Certified Data Privacy Solutions Engineer
            r'qualified\s+as\s+(?:a\s+)?Certified\s+in\s+(?:the\s+)?(Governance\s+of\s+Enterprise\s+IT)',  # CGEIT full name
            r'Certified\s+in\s+(?:the\s+)?(Governance\s+of\s+Enterprise\s+IT)',
            r'Certified\s+Information\s+(Systems?\s+Auditor)',
            r'Certified\s+Information\s+(Security\s+Manager)',
            r'Certified\s+in\s+(Risk\s+and\s+Information\s+Systems?\s+Control)',
            # The Open Group - TOGAF
            r'(TOGAF\s+\d+\s+Certified)',  # TOGAF 9 Certified
            r'(TOGAF\s+\d+\s+Foundation)',
            r'(TOGAF\s+\d+\s+Practitioner)',
            r'TOGAF\s+\d+\s+Certification.*at\s+the\s+(TOGAF\s+\d+\s+Certified)\s+level',
            r'requirements\s+of\s+the\s+(TOGAF\s+\d+)\s+Certification',
            r'(ArchiMate\s+\d+\s+(?:Foundation|Practitioner|Certified))',
            # APMG - Agile/Programme Management
            r'(Agile\s+Project\s+Management\s+(?:Foundation|Practitioner))',
            r'(AgilePM\s+(?:Foundation|Practitioner))',
            r'(MSP\s+(?:Foundation|Practitioner|Advanced\s+Practitioner))',
            r'(Managing\s+Successful\s+Programmes?\s+(?:Foundation|Practitioner))',
            r'(MoR\s+(?:Foundation|Practitioner))',  # Management of Risk
            r'(Management\s+of\s+Risk\s+(?:Foundation|Practitioner))',
            r'(P3O\s+(?:Foundation|Practitioner))',
            r'(Change\s+Management\s+(?:Foundation|Practitioner))',
            r'APMG.*?(Agile\s+Project\s+Management)\s*(?:Foundation|Practitioner)',  # APMG Agile PM
            # Generic patterns
            r'Certificate\s+of\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Issued|\s+Date|\s+This)',
            r'certified\s+as\s+(?:a|an)?\s*([A-Za-z][A-Za-z\s\-]+?)(?:\s+on|\s+by|\s+Issued|\s+Date)',
            # Fallback: any "Certified <Title>" stopping before date-like text
            r'Certified\s+([A-Za-z][A-Za-z\s\-]+?)(?:\s+Issued|\s+Date|\s+Expiration|\s+Valid|\s+Certification)'
        ]
        
        for pattern in cert_patterns:
            match = re.search(pattern, text_normalized, re.IGNORECASE)
            if match:
                cert_name = match.group(1).strip() if match.group(1) else None
                logger.debug(f"extract_cert_name: pattern matched, raw cert_name = {repr(cert_name)}")
                if not cert_name:
                    continue
                    
                # Clean up: normalize whitespace
                cert_name = re.sub(r'\s+', ' ', cert_name)
                
                # Must start with uppercase letter
                if not cert_name or not cert_name[0].isupper():
                    continue
                
                # Remove trailing garbage (only words that should NEVER appear in cert names)
                garbage_words = ['Issued', 'ID', 'Credential', 'Number', 'No',
                                 'Ottenuta', 'Scadenza', 'Verific',
                                 'THE', 'WORLD', 'WORKS', 'WITH', 'Jayney', 'Howson', 'UL', 'Uf']
                for gw in garbage_words:
                    cert_name = re.sub(rf'\s+{gw}.*$', '', cert_name, flags=re.IGNORECASE)
                
                # Remove trailing dates
                cert_name = re.sub(r'\s+\d{1,2}\s+\w+\s+\d{4}.*$', '', cert_name)
                cert_name = re.sub(r'\s+\d{1,2}[/\-]\d{1,2}[/\-]\d{2,4}.*$', '', cert_name)
                
                # Trim trailing hyphens, spaces, underscores
                cert_name = cert_name.rstrip(' -_')
                
                # Validate length
                if 3 <= len(cert_name) <= 120:
                    # IAPP-specific mapping: infer cert code from context
                    if vendor == 'iapp' and cert_name.lower() in ['manager', 'professional', 'technologist']:
                        text_lower = text.lower()
                        if 'privacy management' in text_lower or 'privacy manager' in text_lower:
                            cert_name = 'CIPM'  # Certified Information Privacy Manager
                        elif 'privacy professional' in text_lower:
                            cert_name = 'CIPP'  # Certified Information Privacy Professional
                        elif 'privacy technologist' in text_lower:
                            cert_name = 'CIPT'  # Certified Information Privacy Technologist
                    return cert_name
        
        # Fallback: IAPP inference from text when no pattern matched
        if vendor == 'iapp':
            text_lower = text.lower()
            if 'privacy management' in text_lower or 'privacy manager' in text_lower:
                return 'CIPM'
            elif 'privacy professional' in text_lower:
                return 'CIPP'
            elif 'privacy technologist' in text_lower:
                return 'CIPT'
        
        return None
    
    def extract_person_name(self, text: str, reference_name: Optional[str] = None) -> Optional[str]:
        """
        Extract the person's name from OCR text.
        Uses the filename-extracted name as reference to find the name in OCR.
        
        Args:
            text: OCR extracted text
            reference_name: Person name extracted from filename (e.g., "Colaiacomo Andrea")
            
        Returns:
            Extracted person name from OCR or None
        """
        if not text:
            return None
        
        def remove_accents(s: str) -> str:
            """Remove accents for fuzzy matching (Rodonò -> Rodono)"""
            import unicodedata
            # Decompose to NFD (separate base + combining accents), then remove combining marks
            return ''.join(c for c in unicodedata.normalize('NFD', s) 
                          if unicodedata.category(c) != 'Mn')
        
        text_upper = text.upper()
        text_normalized = re.sub(r'\s+', ' ', text_upper)
        # Also create accent-free version for matching
        text_no_accents = remove_accents(text_normalized)
        
        # If we have a reference name from filename, search for it in OCR
        if reference_name and len(reference_name) >= 3:
            ref_parts = reference_name.split()
            
            if len(ref_parts) >= 2:
                # Try different orderings: "Nome Cognome" and "Cognome Nome"
                orderings = [
                    ref_parts,  # Original order
                    list(reversed(ref_parts)),  # Reversed order
                ]
                
                for ordering in orderings:
                    # Build pattern with accent-normalized parts
                    parts_no_accents = [remove_accents(p.upper()) for p in ordering]
                    search_pattern = r'\b' + r'\s+'.join(re.escape(p) for p in parts_no_accents) + r'\b'
                    match = re.search(search_pattern, text_no_accents)
                    if match:
                        # Found the name in OCR, return in title case
                        return ' '.join(p.capitalize() for p in ordering)
                
                # Try finding each part separately and check they're close together
                for ordering in orderings:
                    positions = []
                    all_found = True
                    for part in ordering:
                        part_no_accent = remove_accents(part.upper())
                        pos = text_no_accents.find(part_no_accent)
                        if pos >= 0:
                            positions.append(pos)
                        else:
                            all_found = False
                            break
                    
                    if all_found and positions:
                        # Check if parts are within reasonable distance (500 chars)
                        min_pos, max_pos = min(positions), max(positions)
                        if max_pos - min_pos < 500:
                            return ' '.join(p.capitalize() for p in ordering)
        
        # Fallback: no reference name, try to find name patterns
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        # ServiceNow-style: two consecutive ALL CAPS single-word lines
        for i, line in enumerate(lines[:10]):
            if re.match(r'^[A-Z]{2,20}$', line):
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    if re.match(r'^[A-Z]{2,20}$', next_line):
                        first = line.capitalize()
                        last = next_line.capitalize()
                        return f"{first} {last}"
        
        return None
    
    def verify_folder(
        self, 
        folder_path: str,
        req_filter: Optional[str] = None,
        max_files: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Verify all PDF certificates in a folder
        
        Args:
            folder_path: Path to the folder containing PDFs
            req_filter: Optional requirement code to filter by
            max_files: Optional maximum number of files to process (fix #9)
            
        Returns:
            Dictionary with verification results and summary
        """
        folder = Path(folder_path)
        
        if not folder.exists():
            return {
                "success": False,
                "error": f"Folder not found: {folder_path}",
                "results": [],
                "summary": {}
            }
        
        # Find all PDFs (including subfolders)
        pdf_files = list(folder.rglob("*.pdf")) + list(folder.rglob("*.PDF"))
        
        if not pdf_files:
            return {
                "success": True,
                "warning": "No PDF files found in folder",
                "results": [],
                "summary": {"total": 0}
            }
        
        # Apply max_files limit if specified (fix #9)
        truncated = False
        total_found = len(pdf_files)
        if max_files and len(pdf_files) > max_files:
            pdf_files = pdf_files[:max_files]
            truncated = True
        
        results = []
        for pdf_path in pdf_files:
            result = self.verify_certificate(str(pdf_path))
            
            # Apply filter if specified
            if req_filter and result.req_code != req_filter:
                continue
            
            # Store relative path from folder root for retry support
            result_dict = result.to_dict()
            try:
                relative_path = pdf_path.relative_to(folder)
                result_dict["filename"] = str(relative_path)
            except ValueError:
                # Fallback to basename if relative_to fails
                pass
            
            results.append(result_dict)
        
        # Calculate summary
        summary = {
            "total": len(results),
            "valid": sum(1 for r in results if r["status"] == "valid"),
            "expired": sum(1 for r in results if r["status"] == "expired"),
            "unreadable": sum(1 for r in results if r["status"] == "unreadable"),
            "error": sum(1 for r in results if r["status"] == "error"),
            "by_requirement": {},
            "by_resource": {},
        }
        
        # Group by requirement
        for r in results:
            req = r["req_code"]
            if req not in summary["by_requirement"]:
                summary["by_requirement"][req] = {"total": 0, "valid": 0}
            summary["by_requirement"][req]["total"] += 1
            if r["status"] == "valid":
                summary["by_requirement"][req]["valid"] += 1
        
        # Group by resource
        for r in results:
            res = r["resource_name"]
            if res not in summary["by_resource"]:
                summary["by_resource"][res] = {"total": 0, "valid": 0}
            summary["by_resource"][res]["total"] += 1
            if r["status"] == "valid":
                summary["by_resource"][res]["valid"] += 1
        
        result_dict = {
            "success": True,
            "folder": folder_path,
            "results": results,
            "summary": summary
        }
        
        # Add truncation info if max_files was applied (fix #9)
        if truncated:
            result_dict["warning"] = f"Risultati troncati: processati {len(pdf_files)} di {total_found} file"
            result_dict["truncated"] = True
            result_dict["total_files_found"] = total_found
        
        return result_dict


def check_ocr_available() -> Dict[str, Any]:
    """Check if OCR dependencies are available"""
    status = {
        "ocr_available": OCR_AVAILABLE,
        "pytesseract": False,
        "pdf2image": False,
        "pillow": False,
        "tesseract_path": None,
        "poppler_available": False,
    }
    
    try:
        import pytesseract
        status["pytesseract"] = True
        status["tesseract_path"] = pytesseract.pytesseract.tesseract_cmd
        # Try to get tesseract version
        try:
            version = pytesseract.get_tesseract_version()
            status["tesseract_version"] = str(version)
        except Exception:
            pass
    except ImportError:
        pass
    
    try:
        import pdf2image
        status["pdf2image"] = True
        # Check poppler
        try:
            pdf2image.pdfinfo_from_path.__wrapped__  # Just check if it's available
            status["poppler_available"] = True
        except Exception:
            pass
    except ImportError:
        pass
    
    try:
        from PIL import Image
        status["pillow"] = True
    except ImportError:
        pass
    
    return status
