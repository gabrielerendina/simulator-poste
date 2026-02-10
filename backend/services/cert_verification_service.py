"""
Certification Verification Service
Verifies PDF certificates against lot requirements using OCR
"""

import os
import re
import logging
from pathlib import Path
from datetime import datetime, date
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher

try:
    import pytesseract
    from PIL import Image
    import pdf2image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False

logger = logging.getLogger(__name__)

# Known certification vendors with their common cert patterns
KNOWN_VENDORS = {
    "aws": {
        "name": "Amazon Web Services",
        "aliases": ["amazon", "aws", "amazon web services"],
        "cert_patterns": [
            r"solutions?\s*architect",
            r"developer\s*associate",
            r"sysops\s*administrator",
            r"devops\s*engineer",
            r"cloud\s*practitioner",
            r"database\s*specialty",
            r"security\s*specialty",
            r"saa-c\d+",  # Solutions Architect code
            r"dva-c\d+",  # Developer Associate code
            r"soa-c\d+",  # SysOps code
        ]
    },
    "microsoft": {
        "name": "Microsoft",
        "aliases": ["microsoft", "azure", "ms"],
        "cert_patterns": [
            r"azure\s*administrator",
            r"azure\s*developer",
            r"azure\s*solutions?\s*architect",
            r"azure\s*devops\s*engineer",
            r"azure\s*security\s*engineer",
            r"azure\s*data\s*engineer",
            r"az-\d+",  # Azure cert codes (AZ-104, AZ-204, etc.)
            r"ms-\d+",  # MS cert codes
            r"dp-\d+",  # Data Platform codes
            r"ai-\d+",  # AI cert codes
        ]
    },
    "sap": {
        "name": "SAP",
        "aliases": ["sap", "sap se"],
        "cert_patterns": [
            r"s/4hana",
            r"abap",
            r"fiori",
            r"btp",
            r"business\s*technology\s*platform",
            r"hana",
            r"successfactors",
            r"ariba",
            r"c_\w+_\d+",  # SAP cert codes (C_TS4CO_2021, etc.)
            r"e_\w+_\d+",  # SAP Enterprise codes
            r"p_\w+_\d+",  # SAP Professional codes
        ]
    },
    "oracle": {
        "name": "Oracle",
        "aliases": ["oracle", "oci"],
        "cert_patterns": [
            r"oracle\s*cloud\s*infrastructure",
            r"java\s*(se|ee)",
            r"database\s*administrator",
            r"sql\s*expert",
            r"1z0-\d+",  # Oracle cert codes
        ]
    },
    "cisco": {
        "name": "Cisco",
        "aliases": ["cisco", "cisco systems"],
        "cert_patterns": [
            r"ccna",
            r"ccnp",
            r"ccie",
            r"ccde",
            r"devnet",
            r"network\s*associate",
            r"network\s*professional",
        ]
    },
    "redhat": {
        "name": "Red Hat",
        "aliases": ["red hat", "redhat", "rh"],
        "cert_patterns": [
            r"rhcsa",
            r"rhce",
            r"rhca",
            r"openshift",
            r"ansible",
            r"system\s*administrator",
            r"ex\d+",  # Red Hat exam codes
        ]
    },
    "google": {
        "name": "Google Cloud",
        "aliases": ["google", "gcp", "google cloud"],
        "cert_patterns": [
            r"cloud\s*architect",
            r"cloud\s*engineer",
            r"data\s*engineer",
            r"machine\s*learning\s*engineer",
            r"associate\s*cloud\s*engineer",
        ]
    },
    "pmi": {
        "name": "Project Management Institute",
        "aliases": ["pmi", "project management institute"],
        "cert_patterns": [
            r"pmp",
            r"capm",
            r"pgmp",
            r"pmi-acp",
            r"pmi-rmp",
            r"project\s*management\s*professional",
        ]
    },
    "itil": {
        "name": "ITIL",
        "aliases": ["itil", "axelos"],
        "cert_patterns": [
            r"itil\s*foundation",
            r"itil\s*practitioner",
            r"itil\s*intermediate",
            r"itil\s*expert",
            r"itil\s*v\d",
        ]
    },
    "scrum": {
        "name": "Scrum Alliance / Scrum.org",
        "aliases": ["scrum", "scrum alliance", "scrum.org"],
        "cert_patterns": [
            r"csm",
            r"cspo",
            r"psm",
            r"pspo",
            r"scrum\s*master",
            r"product\s*owner",
        ]
    },
    "servicenow": {
        "name": "ServiceNow",
        "aliases": ["servicenow", "service now", "service-now"],
        "cert_patterns": [
            r"certified\s*system\s*administrator",
            r"certified\s*application\s*developer",
            r"certified\s*implementation\s*specialist",
            r"csa",
            r"cad",
            r"cis",
            r"itsm",
            r"hrsd",
            r"csm",
            r"now\s*platform",
        ]
    },
}

# Date patterns to extract validity dates
DATE_PATTERNS = [
    r"valid\s*(?:from|since|until|thru|through|to)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"expir(?:es?|ation|y)\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"issue[d]?\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"date\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})",
    r"(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})",  # ISO format
    r"((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4})",  # Month DD, YYYY
    r"(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})",  # DD Month YYYY
]


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
    status: str = "unprocessed"  # valid, expired, mismatch, unreadable, error
    confidence: float = 0.0
    ocr_text_preview: Optional[str] = None
    errors: List[str] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class CertVerificationService:
    """Service to verify certification PDFs"""
    
    def __init__(self, tesseract_cmd: Optional[str] = None):
        """
        Initialize the service
        
        Args:
            tesseract_cmd: Path to tesseract executable (optional)
        """
        if not OCR_AVAILABLE:
            raise ImportError(
                "OCR dependencies not available. Install with: "
                "pip install pytesseract pdf2image Pillow"
            )
        
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
    
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
        # Remove extension
        name = Path(filename).stem
        
        # Technical terms that are NOT person names
        tech_terms = {
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
        def is_person_name(text: str) -> bool:
            """Check if text looks like a person name (Nome Cognome)"""
            words = text.split()
            if len(words) < 2:
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
                resource_name = part
                parts = parts[:i]
                break
        
        # If no person name found in single part, check last 2 parts combined
        if not resource_name and len(parts) >= 2:
            last_two = parts[-2] + " " + parts[-1]
            if is_person_name(last_two):
                resource_name = last_two.strip()
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
        Extract text from PDF using OCR
        Tries rotating images if initial OCR doesn't extract useful text
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            Extracted text
        """
        try:
            # Convert PDF to images
            images = pdf2image.convert_from_path(pdf_path, dpi=200)
            
            text_parts = []
            for i, image in enumerate(images):
                # Try OCR with original orientation
                text = self._ocr_with_rotation(image)
                text_parts.append(text)
            
            return "\n".join(text_parts)
        
        except Exception as e:
            logger.error(f"Error extracting text from PDF {pdf_path}: {e}")
            raise
    
    def _ocr_with_rotation(self, image: Image.Image) -> str:
        """
        Try OCR on image, rotating up to 3 times; test multiple Tesseract configs per rotation
        """
        rotations = [0, 90, 180, 270]
        configs = ["", "--oem 3 --psm 6", "--oem 3 --psm 4"]
        best_text = ""
        best_score = 0
        
        for rotation in rotations:
            rotated = image.rotate(-rotation, expand=True) if rotation > 0 else image
            for cfg in configs:
                try:
                    text = pytesseract.image_to_string(rotated, lang='eng+ita', config=cfg)
                except Exception:
                    continue
                score = self._score_ocr_text(text)
                if score > best_score:
                    best_score = score
                    best_text = text
                    if score >= 10:
                        logger.debug(f"Good OCR result at rotation {rotation}° config '{cfg}'")
                        break
            if best_score >= 10:
                break
        
        if best_score == 0:
            logger.warning("Could not extract meaningful text from image at any rotation/config")
        
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
        for vendor_info in KNOWN_VENDORS.values():
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
        
        for vendor_key, vendor_info in KNOWN_VENDORS.items():
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
        Extract certification code from text based on vendor
        
        Args:
            text: OCR extracted text
            vendor: Detected vendor key
            
        Returns:
            Certification code if found
        """
        if not vendor or vendor not in KNOWN_VENDORS:
            return None
        
        text_upper = text.upper()
        
        # Vendor-specific code patterns
        code_patterns = {
            "aws": r"(SAA-C\d+|DVA-C\d+|SOA-C\d+|CLF-C\d+)",
            "microsoft": r"(AZ-\d+|MS-\d+|DP-\d+|AI-\d+|PL-\d+)",
            "sap": r"(C_\w+_\d+|E_\w+_\d+|P_\w+_\d+)",
            "oracle": r"(1Z0-\d+)",
            "redhat": r"(EX\d+)",
        }
        
        if vendor in code_patterns:
            match = re.search(code_patterns[vendor], text_upper)
            if match:
                return match.group(1)
        
        return None
    
    def extract_dates(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Extract validity dates from text
        
        Args:
            text: OCR extracted text
            
        Returns:
            Tuple of (valid_from, valid_until) as strings
        """
        text_lower = text.lower()
        dates_found = []
        
        for pattern in DATE_PATTERNS:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            dates_found.extend(matches)
        
        # Try to parse and sort dates
        parsed_dates = []
        for date_str in dates_found[:10]:  # Limit to first 10 matches
            parsed = self._parse_date(date_str)
            if parsed:
                parsed_dates.append((parsed, date_str))
        
        parsed_dates.sort(key=lambda x: x[0])
        
        valid_from = None
        valid_until = None
        
        if len(parsed_dates) >= 2:
            valid_from = parsed_dates[0][1]
            valid_until = parsed_dates[-1][1]
        elif len(parsed_dates) == 1:
            # Check context to determine if it's issue or expiry date
            if any(kw in text_lower for kw in ["expir", "valid until", "valid thru"]):
                valid_until = parsed_dates[0][1]
            else:
                valid_from = parsed_dates[0][1]
        
        return valid_from, valid_until
    
    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse a date string into a date object"""
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
                return datetime.strptime(date_str.strip(), fmt).date()
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
            vendor_info = KNOWN_VENDORS.get(vendor_detected, {})
            for alias in vendor_info.get("aliases", []):
                if alias in file_name_lower:
                    score += 0.4
                    break
        
        # Check certification pattern match
        if vendor_detected and vendor_detected in KNOWN_VENDORS:
            for pattern in KNOWN_VENDORS[vendor_detected]["cert_patterns"]:
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
            # Extract text via OCR
            text = self.extract_text_from_pdf(pdf_path)
            result.ocr_text_preview = text[:500] if text else None
            
            if not text or len(text.strip()) < 30:
                result.status = "unreadable"
                result.errors.append("Could not extract sufficient text from PDF")
                return result
            
            # Detect vendor
            vendor, vendor_conf = self.detect_vendor(text)
            result.vendor_detected = KNOWN_VENDORS[vendor]["name"] if vendor else None
            result.vendor_confidence = vendor_conf
            
            # Extract cert code
            result.cert_code_detected = self.extract_cert_code(text, vendor)
            
            # Try to extract certification name from text
            result.cert_name_detected = self.extract_cert_name(text, vendor)
            
            # Try to extract person name from OCR using filename resource as reference
            result.resource_name_detected = self.extract_person_name(text, resource_name)
            
            logger.debug(f"Extracted: vendor={result.vendor_detected}, code={result.cert_code_detected}, cert_name={result.cert_name_detected}, person={result.resource_name_detected}")
            logger.debug(f"OCR text first 200 chars: {text[:200] if text else 'EMPTY'}")
            
            # Extract dates
            valid_from, valid_until = self.extract_dates(text)
            result.valid_from = valid_from
            result.valid_until = valid_until
            
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
        
        # Common certification title patterns - order matters, more specific first
        cert_patterns = [
            # Microsoft patterns (English)
            r'Microsoft\s+Certified[:\s]+([A-Za-z][A-Za-z\s\-]+?(?:Expert|Associate|Fundamentals))',
            # Microsoft Italian - capture everything after colon until end or linebreak chars
            r'Certificazione\s+Microsoft[:\s]+([A-Za-z][A-Za-z\s\-]+(?:Expert|Associate|Fundamentals))',
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
            r'ITIL\s+(?:v\d\s+)?([A-Za-z][A-Za-z\s\-]+?)(?:\s+ITIL|\s+Axelos|\s+Issued)',
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
                    return cert_name
        
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
        
        text_upper = text.upper()
        text_normalized = re.sub(r'\s+', ' ', text_upper)
        
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
                    # Build pattern to find all parts in sequence (with flexibility)
                    # Each part can be separated by spaces/newlines
                    search_pattern = r'\b' + r'\s+'.join(re.escape(p.upper()) for p in ordering) + r'\b'
                    match = re.search(search_pattern, text_normalized)
                    if match:
                        # Found the name in OCR, return in title case
                        return ' '.join(p.capitalize() for p in ordering)
                
                # Try finding each part separately and check they're close together
                for ordering in orderings:
                    positions = []
                    all_found = True
                    for part in ordering:
                        part_upper = part.upper()
                        pos = text_upper.find(part_upper)
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
        req_filter: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Verify all PDF certificates in a folder
        
        Args:
            folder_path: Path to the folder containing PDFs
            req_filter: Optional requirement code to filter by
            
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
        
        results = []
        for pdf_path in pdf_files:
            result = self.verify_certificate(str(pdf_path))
            
            # Apply filter if specified
            if req_filter and result.req_code != req_filter:
                continue
            
            results.append(result.to_dict())
        
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
        
        return {
            "success": True,
            "folder": folder_path,
            "results": results,
            "summary": summary
        }


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
