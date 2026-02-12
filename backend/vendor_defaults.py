"""
Default vendor configurations for OCR certificate verification.
Shared between cert_verification_service.py and crud.py to avoid duplication.
"""

# Known certification vendors with their common cert patterns
DEFAULT_VENDORS = {
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
            r"saa-c\d+",
            r"dva-c\d+",
            r"soa-c\d+",
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
            r"az-\d+",
            r"ms-\d+",
            r"dp-\d+",
            r"ai-\d+",
            # Italian patterns
            r"esperto\s*architetto",
            r"soluzioni\s*azure",
            r"amministratore\s*azure",
            r"sviluppatore\s*azure",
            r"certificat[oi]\s*microsoft",
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
            r"c_\w+_\d+",
            r"e_\w+_\d+",
            r"p_\w+_\d+",
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
            r"1z0-\d+",
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
            r"certified\s*specialist",
            r"enterprise\s*core",
            r"enterprise\s*advanced",
            r"infrastructure\s*implementation",
            r"collaboration",
            r"security\s*core",
            r"data\s*center",
            r"service\s*provider",
            r"enarsi",
            r"encor",
            r"ensld",
            r"ensdwi",
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
            r"ex\d+",
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
        "aliases": ["itil"],
        "cert_patterns": [
            r"itil\s*foundation",
            r"itil\s*practitioner",
            r"itil\s*intermediate",
            r"itil\s*expert",
            r"itil\s*v\d",
        ]
    },
    "peoplecert": {
        "name": "PeopleCert - Axelos",
        "aliases": ["peoplecert", "people cert", "axelos", "prince2", "prince 2"],
        "cert_patterns": [
            r"prince2?\s*foundation",
            r"prince2?\s*practitioner",
            r"prince2?\s*agile",
            r"prince2?\s*professional",
            r"prince\s*2\s*foundation",
            r"prince\s*2\s*practitioner",
            r"project\s*management\s*(?:foundation|practitioner)",
            r"certificate\s*in\s*project\s*management",
            r"peoplecert",
            r"axelos\s*global\s*best\s*practice",
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
    "uipath": {
        "name": "UiPath",
        "aliases": ["uipath", "ui path", "uipathi", "[ui]path", "[ui]pathi"],
        "cert_patterns": [
            r"automation\s*developer",
            r"rpa\s*developer",
            r"certified\s*professional",
            r"solution\s*architect",
            r"business\s*analyst",
            r"uipath\s*certified",
            r"uipathi?\s*certified",
            r"\[ui\]path",
        ]
    },
    "appian": {
        "name": "Appian",
        "aliases": ["appian", "appian corporation"],
        "cert_patterns": [
            r"appian\s*developer",
            r"appian\s*designer",
            r"appian\s*administrator",
            r"certified\s*associate\s*developer",
            r"certified\s*senior\s*developer",
            r"low[- ]?code",
            r"bpm",
            r"process\s*automation",
        ]
    },
    "iapp": {
        "name": "IAPP",
        "aliases": ["iapp", "international association of privacy professionals"],
        "cert_patterns": [
            r"cipp",
            r"cipm",
            r"cipt",
            r"certified\s*information\s*privacy\s*professional",
            r"certified\s*information\s*privacy\s*manager",
            r"certified\s*information\s*privacy\s*technologist",
            r"information\s*privacy\s*management",
            r"fellow\s*of\s*information\s*privacy",
            r"fip",
        ]
    },
    "isaca": {
        "name": "ISACA",
        "aliases": ["isaca", "information systems audit and control association"],
        "cert_patterns": [
            r"cgeit",
            r"cisa",
            r"cism",
            r"crisc",
            r"cdpse",
            r"csx-p",
            r"certified\s*in.*governance.*enterprise\s*it",
            r"governance\s*of\s*enterprise\s*it",
            r"certified\s*information\s*systems?\s*auditor",
            r"certified\s*information\s*security\s*manager",
            r"certified\s*in\s*risk\s*and\s*information\s*systems?\s*control",
            r"certified\s*data\s*privacy\s*solutions?\s*engineer",
        ]
    },
    "theopengroup": {
        "name": "The Open Group",
        "aliases": ["the open group", "opengroup", "togaf"],
        "cert_patterns": [
            r"togaf",
            r"archimate",
            r"it4it",
            r"open\s*ca",
            r"open\s*cds",
            r"open\s*ctpp",
            r"open\s*master\s*certified\s*architect",
            r"certified\s*architect",
            r"certification\s*for\s*people",
        ]
    },
    "apmg": {
        "name": "APMG International",
        "aliases": ["apmg", "apmg international"],
        "cert_patterns": [
            r"agile\s*project\s*management",
            r"agile\s*pm",
            r"change\s*management",
            r"msP",
            r"managing\s*successful\s*programmes",
            r"mor",
            r"management\s*of\s*risk",
            r"p3o",
            r"portfolio.*programme.*project\s*offices",
            r"better\s*business\s*cases",
            r"practitioner\s*examination",
            r"foundation\s*examination",
        ]
    },
}
