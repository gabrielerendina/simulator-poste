"""
PDF Report Generator for Simulator Poste
Generates professional multi-page reports matching the Excel structure
"""

import io
import os
from datetime import datetime
from typing import Dict, Any, List, Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge, Circle

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, PageBreak, KeepTogether, Flowable
)
from reportlab.pdfgen import canvas

# ============================================================================
# CONSTANTS
# ============================================================================

COLORS = {
    'primary': colors.HexColor('#1E3A5F'),
    'primary_light': colors.HexColor('#2563EB'),
    'secondary': colors.HexColor('#FFCC00'),
    'success': colors.HexColor('#28A745'),
    'warning': colors.HexColor('#FFC107'),
    'danger': colors.HexColor('#DC3545'),
    'light': colors.HexColor('#F8F9FA'),
    'dark': colors.HexColor('#333333'),
    'muted': colors.HexColor('#6C757D'),
    'white': colors.white,
    'input_bg': colors.HexColor('#FFF9C4'),
    'formula_bg': colors.HexColor('#E3F2FD'),
    'lutech': colors.HexColor('#0066CC'),
}

PARTNER_COLORS = [
    colors.HexColor('#6366F1'),
    colors.HexColor('#8B5CF6'),
    colors.HexColor('#EC4899'),
]

ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'assets')
LOGO_LUTECH = os.path.join(ASSETS_DIR, 'logo-lutech.png')
LOGO_POSTE = os.path.join(ASSETS_DIR, 'logo-poste.png')

# Category labels
CATEGORY_LABELS = {
    'company_certs': 'Certificazioni Aziendali',
    'resource': 'Certificazioni Professionali',
    'reference': 'Referenze',
    'project': 'Progetti Tecnici',
}


# ============================================================================
# NUMBERED CANVAS FOR PAGE NUMBERS
# ============================================================================

class NumberedCanvas(canvas.Canvas):
    """Canvas with page numbers and header/footer"""

    def __init__(self, *args, **kwargs):
        self.lot_name = kwargs.pop('lot_name', 'Report')
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_header_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def _draw_header_footer(self, page_count):
        page_num = self._pageNumber
        width, height = A4

        # Skip on cover page
        if page_num == 1:
            return

        # Header line
        self.setStrokeColor(COLORS['primary'])
        self.setLineWidth(0.5)
        self.line(2*cm, height - 1.5*cm, width - 2*cm, height - 1.5*cm)

        # Header text
        self.setFont('Helvetica', 8)
        self.setFillColor(COLORS['muted'])
        self.drawString(2*cm, height - 1.3*cm, f"SIMULATORE GARA POSTE - {self.lot_name}")
        self.drawRightString(width - 2*cm, height - 1.3*cm, datetime.now().strftime("%d/%m/%Y"))

        # Footer line
        self.line(2*cm, 1.5*cm, width - 2*cm, 1.5*cm)

        # Footer text
        self.setFont('Helvetica', 7)
        self.drawString(2*cm, 1*cm, "Author: Gabriele Rendina - https://simulator-poste.2d59a3a.kyma.ondemand.com")
        self.drawRightString(width - 2*cm, 1*cm, f"Pag. {page_num}/{page_count}")


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def create_gauge_chart(value: float, max_value: float, title: str) -> io.BytesIO:
    """Create a semicircular gauge chart"""
    fig, ax = plt.subplots(figsize=(2.8, 1.8), subplot_kw={'aspect': 'equal'})

    pct = min(100, max(0, (value / max_value) * 100)) if max_value > 0 else 0

    # Background arc
    bg_wedge = Wedge(center=(0, 0), r=1, theta1=0, theta2=180,
                     facecolor='#e9ecef', edgecolor='none')
    ax.add_patch(bg_wedge)

    # Color based on percentage
    if pct >= 70:
        color = '#28a745'
    elif pct >= 40:
        color = '#ffc107'
    else:
        color = '#dc3545'

    # Value arc
    angle = 180 * (pct / 100)
    value_wedge = Wedge(center=(0, 0), r=1, theta1=0, theta2=angle,
                        facecolor=color, edgecolor='none')
    ax.add_patch(value_wedge)

    # Inner circle
    inner_circle = Circle((0, 0), 0.6, facecolor='white', edgecolor='none')
    ax.add_patch(inner_circle)

    # Value text
    ax.text(0, 0.1, f'{value:.1f}', ha='center', va='center',
            fontsize=12, fontweight='bold', color='#333333')
    ax.text(0, -0.2, f'/ {max_value:.0f}', ha='center', va='center',
            fontsize=7, color='#6c757d')

    ax.set_xlim(-1.2, 1.2)
    ax.set_ylim(-0.3, 1.2)
    ax.axis('off')
    ax.set_title(title, fontsize=9, pad=3, fontweight='bold')

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def create_score_curve_chart(base_amount: float, competitor_discount: float,
                              alpha: float, max_tech_score: float,
                              max_econ_score: float, tech_score: float) -> io.BytesIO:
    """Create discount scenario chart (curva punteggio)"""
    fig, ax = plt.subplots(figsize=(6, 3.5))

    discounts = list(range(1, 101))
    econ_scores = []
    total_scores = []

    p_best = base_amount * (1 - competitor_discount / 100)

    for d in discounts:
        p_off = base_amount * (1 - d / 100)
        p_actual_best = min(p_off, p_best)

        if p_actual_best > 0:
            ratio = p_off / p_actual_best
            if ratio <= 1:
                econ = max_econ_score * (1 - (ratio ** alpha))
            else:
                econ = 0
        else:
            econ = 0

        econ_scores.append(econ)
        total_scores.append(tech_score + econ)

    ax.plot(discounts, econ_scores, color='#FFCC00', linewidth=2, label='Score Econ.')
    ax.plot(discounts, total_scores, color='#1E3A5F', linewidth=2, label='TOTALE')

    ax.set_xlabel('Sconto %', fontsize=10)
    ax.set_ylabel('Punteggio', fontsize=10)
    ax.set_title('Curva Punteggio per Scenario Sconto', fontsize=11, fontweight='bold')
    ax.legend(loc='upper left', fontsize=8)
    ax.grid(alpha=0.3, linestyle='--')
    ax.set_xlim(0, 100)
    ax.set_ylim(0, max_tech_score + max_econ_score + 5)

    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def create_rti_pie_chart(rti_quotas: Dict[str, float]) -> io.BytesIO:
    """Create RTI quotas pie chart"""
    if not rti_quotas:
        return None

    fig, ax = plt.subplots(figsize=(4, 3))

    labels = list(rti_quotas.keys())
    sizes = list(rti_quotas.values())
    colors_list = ['#0066CC']  # Lutech
    colors_list += ['#6366F1', '#8B5CF6', '#EC4899'][:len(labels)-1]

    # Filter out zero values
    filtered = [(l, s, c) for l, s, c in zip(labels, sizes, colors_list) if s > 0]
    if not filtered:
        return None

    labels, sizes, colors_list = zip(*filtered)

    wedges, texts, autotexts = ax.pie(
        sizes, labels=labels, autopct='%1.0f%%',
        colors=colors_list, startangle=90,
        textprops={'fontsize': 8}
    )

    ax.set_title('Quote RTI', fontsize=10, fontweight='bold')

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


# ============================================================================
# PDF REPORT GENERATOR CLASS
# ============================================================================

class PDFReportGenerator:
    """Generates professional PDF reports matching the Excel structure"""

    def __init__(
        self,
        lot_key: str,
        lot_config: Dict[str, Any],
        base_amount: float,
        my_discount: float,
        competitor_discount: float,
        technical_score: float,
        economic_score: float,
        total_score: float,
        details: Dict[str, float],
        weighted_scores: Dict[str, float],
        category_scores: Dict[str, float],
        max_tech_score: float,
        max_econ_score: float,
        alpha: float,
        win_probability: float,
        tech_inputs_full: Optional[Dict[str, Any]] = None,
        rti_quotas: Optional[Dict[str, float]] = None,
    ):
        self.lot_key = lot_key
        self.lot_config = lot_config
        self.base_amount = base_amount
        self.my_discount = my_discount
        self.competitor_discount = competitor_discount
        self.technical_score = technical_score
        self.economic_score = economic_score
        self.total_score = total_score
        self.details = details or {}
        self.weighted_scores = weighted_scores or {}
        self.category_scores = category_scores or {}
        self.max_tech_score = max_tech_score
        self.max_econ_score = max_econ_score
        self.alpha = alpha
        self.win_probability = win_probability
        self.tech_inputs_full = tech_inputs_full or {}
        self.rti_quotas = rti_quotas or {}

        self.is_rti = lot_config.get('rti_enabled', False)
        self.rti_companies = ['Lutech'] + (lot_config.get('rti_companies', []) or [])

        # Calculate prices
        self.my_price = base_amount * (1 - my_discount / 100)
        self.competitor_price = base_amount * (1 - competitor_discount / 100)

        # Setup styles
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        self.styles.add(ParagraphStyle(
            name='MainTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=COLORS['primary'],
            alignment=TA_CENTER,
            spaceAfter=15
        ))

        self.styles.add(ParagraphStyle(
            name='Subtitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=COLORS['dark'],
            alignment=TA_CENTER,
            spaceAfter=25
        ))

        self.styles.add(ParagraphStyle(
            name='SectionTitle',
            parent=self.styles['Heading2'],
            fontSize=14,
            textColor=COLORS['primary'],
            spaceBefore=15,
            spaceAfter=10,
        ))

        self.styles.add(ParagraphStyle(
            name='SubSectionTitle',
            parent=self.styles['Heading3'],
            fontSize=11,
            textColor=COLORS['dark'],
            spaceBefore=10,
            spaceAfter=6,
        ))

        # Modify existing BodyText instead of adding duplicate
        self.styles['BodyText'].fontSize = 9
        self.styles['BodyText'].spaceAfter = 8
        self.styles['BodyText'].leading = 12

        self.styles.add(ParagraphStyle(
            name='SmallText',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=COLORS['muted'],
        ))

        self.styles.add(ParagraphStyle(
            name='KPIValue',
            parent=self.styles['Normal'],
            fontSize=20,
            textColor=COLORS['primary'],
            alignment=TA_CENTER,
        ))

        self.styles.add(ParagraphStyle(
            name='KPILabel',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=COLORS['muted'],
            alignment=TA_CENTER,
        ))

    def generate(self) -> io.BytesIO:
        """Generate the complete PDF report"""
        buffer = io.BytesIO()

        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=2*cm,
            rightMargin=2*cm,
            topMargin=2*cm,
            bottomMargin=2*cm
        )

        story = []

        # Build sections
        self._add_cover_page(story)
        self._add_dashboard_section(story)
        self._add_technical_section(story)
        self._add_economic_section(story)

        if self.is_rti and self.rti_quotas:
            self._add_rti_section(story)

        self._add_config_section(story)

        # Build document
        doc.build(
            story,
            canvasmaker=lambda *args, **kwargs: NumberedCanvas(*args, lot_name=self.lot_key, **kwargs)
        )

        buffer.seek(0)
        return buffer

    def _add_cover_page(self, story: List):
        """Add cover page with branding"""
        # Logos
        logo_data = [[]]

        if os.path.exists(LOGO_LUTECH):
            logo_data[0].append(RLImage(LOGO_LUTECH, width=3.5*cm, height=1.8*cm))
        else:
            logo_data[0].append(Paragraph("LUTECH", self.styles['Heading2']))

        logo_data[0].append(Spacer(1, 1))

        if os.path.exists(LOGO_POSTE):
            logo_data[0].append(RLImage(LOGO_POSTE, width=3.5*cm, height=1.8*cm))
        else:
            logo_data[0].append(Paragraph("POSTE", self.styles['Heading2']))

        logo_table = Table(logo_data, colWidths=[6*cm, 5*cm, 6*cm])
        logo_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(logo_table)
        story.append(Spacer(1, 2.5*cm))

        # Main title
        story.append(Paragraph("SIMULATORE GARA POSTE", self.styles['MainTitle']))
        story.append(Paragraph("Report Simulazione", self.styles['Subtitle']))
        story.append(Spacer(1, 1*cm))

        # Lot name box
        lot_box = Table(
            [[Paragraph(f"<b>{self.lot_key}</b>",
                       ParagraphStyle('LotBox', fontSize=18, textColor=COLORS['white'], alignment=TA_CENTER))]],
            colWidths=[12*cm]
        )
        lot_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['primary']),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 18),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 18),
        ]))
        story.append(lot_box)
        story.append(Spacer(1, 1.5*cm))

        # Quick summary
        summary_data = [
            ['Base d\'Asta', f'€ {self.base_amount:,.2f}'.replace(',', '.')],
            ['Punteggio Totale', f'{self.total_score:.2f} / 100'],
            ['Probabilità Vittoria', f'{self.win_probability:.1f}%'],
        ]
        summary_table = Table(summary_data, colWidths=[7*cm, 7*cm])
        summary_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(summary_table)
        story.append(Spacer(1, 3*cm))

        # Generation date
        date_str = datetime.now().strftime("%d %B %Y - %H:%M")
        story.append(Paragraph(f"<i>Generato il {date_str}</i>",
                              ParagraphStyle('DateStyle', fontSize=10, textColor=COLORS['muted'], alignment=TA_CENTER)))

        story.append(Spacer(1, 2*cm))

        # Footer
        story.append(Paragraph("https://simulator-poste.2d59a3a.kyma.ondemand.com",
                              ParagraphStyle('URL', fontSize=9, textColor=COLORS['primary_light'], alignment=TA_CENTER)))
        story.append(Paragraph("Author: Gabriele Rendina",
                              ParagraphStyle('Author', fontSize=8, textColor=COLORS['muted'], alignment=TA_CENTER)))

        story.append(PageBreak())

    def _add_dashboard_section(self, story: List):
        """Add Dashboard section (summary)"""
        story.append(Paragraph("Dashboard", self.styles['SectionTitle']))
        story.append(Spacer(1, 0.3*cm))

        # KPI boxes row
        kpi_data = [[
            Paragraph(f"<b>{self.total_score:.1f}</b><br/><font size='8' color='gray'>Punteggio Totale</font>",
                     ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER)),
            Paragraph(f"<b>{self.technical_score:.1f}</b><br/><font size='8' color='gray'>Score Tecnico</font>",
                     ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER)),
            Paragraph(f"<b>{self.economic_score:.1f}</b><br/><font size='8' color='gray'>Score Economico</font>",
                     ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER)),
        ]]
        kpi_table = Table(kpi_data, colWidths=[5.5*cm, 5.5*cm, 5.5*cm])
        kpi_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
            ('BOX', (0, 0), (0, 0), 1, COLORS['primary']),
            ('BOX', (1, 0), (1, 0), 1, COLORS['success']),
            ('BOX', (2, 0), (2, 0), 1, COLORS['secondary']),
        ]))
        story.append(kpi_table)
        story.append(Spacer(1, 0.5*cm))

        # Gauges
        tech_gauge = create_gauge_chart(self.technical_score, self.max_tech_score, 'Score Tecnico')
        econ_gauge = create_gauge_chart(self.economic_score, self.max_econ_score, 'Score Economico')

        gauge_table = Table(
            [[RLImage(tech_gauge, width=5.5*cm, height=3.5*cm),
              RLImage(econ_gauge, width=5.5*cm, height=3.5*cm)]],
            colWidths=[8.5*cm, 8.5*cm]
        )
        gauge_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        story.append(gauge_table)
        story.append(Spacer(1, 0.3*cm))

        # Probability box
        prob_color = COLORS['success'] if self.win_probability >= 60 else (COLORS['warning'] if self.win_probability >= 40 else COLORS['danger'])
        prob_label = "ALTA" if self.win_probability >= 60 else ("MEDIA" if self.win_probability >= 40 else "BASSA")

        prob_data = [[Paragraph(
            f"Probabilità Vittoria: <b>{prob_label} ({self.win_probability:.1f}%)</b>",
            ParagraphStyle('Prob', fontSize=12, alignment=TA_CENTER)
        )]]
        prob_table = Table(prob_data, colWidths=[16*cm])
        prob_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('BOX', (0, 0), (-1, -1), 2, prob_color),
        ]))
        story.append(prob_table)

        story.append(PageBreak())

    def _add_technical_section(self, story: List):
        """Add Technical section"""
        story.append(Paragraph("Punteggio Tecnico", self.styles['SectionTitle']))
        story.append(Spacer(1, 0.3*cm))

        # Summary row
        tech_summary = [
            ['Score Tecnico', f'{self.technical_score:.2f}'],
            ['Max Score', f'{self.max_tech_score:.2f}'],
            ['Percentuale', f'{(self.technical_score / self.max_tech_score * 100) if self.max_tech_score > 0 else 0:.1f}%'],
        ]
        tech_summary_table = Table(tech_summary, colWidths=[5*cm, 4*cm])
        tech_summary_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
        ]))
        story.append(tech_summary_table)
        story.append(Spacer(1, 0.5*cm))

        # Category breakdown
        story.append(Paragraph("Contributo per Categoria", self.styles['SubSectionTitle']))

        breakdown_data = [['Categoria', 'Punteggio', 'Contributo %']]
        total_cat = sum(self.category_scores.values()) if self.category_scores else 0

        for cat_key, cat_label in CATEGORY_LABELS.items():
            score = self.category_scores.get(cat_key, 0)
            pct = (score / self.technical_score * 100) if self.technical_score > 0 else 0
            breakdown_data.append([cat_label, f'{score:.2f}', f'{pct:.1f}%'])

        breakdown_data.append(['TOTALE TECNICO', f'{self.technical_score:.2f}', '100%'])

        breakdown_table = Table(breakdown_data, colWidths=[7*cm, 4*cm, 4*cm])
        breakdown_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, -1), (-1, -1), COLORS['light']),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
        ]))
        story.append(breakdown_table)
        story.append(Spacer(1, 0.5*cm))

        # Weighted scores table (requirements)
        if self.weighted_scores:
            story.append(Paragraph("Dettaglio Requisiti", self.styles['SubSectionTitle']))

            req_data = [['Requisito', 'Score Pesato']]
            for req, score in self.weighted_scores.items():
                req_data.append([req, f'{score:.2f}'])

            req_table = Table(req_data, colWidths=[11*cm, 4*cm])
            req_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), COLORS['muted']),
                ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('ALIGN', (1, 0), (1, -1), 'CENTER'),
                ('TOPPADDING', (0, 0), (-1, -1), 5),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#DDDDDD')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [COLORS['white'], COLORS['light']]),
            ]))
            story.append(req_table)

        story.append(PageBreak())

    def _add_economic_section(self, story: List):
        """Add Economic section"""
        story.append(Paragraph("Punteggio Economico", self.styles['SectionTitle']))
        story.append(Spacer(1, 0.3*cm))

        # Economic parameters
        econ_params = [
            ['Base d\'Asta', f'€ {self.base_amount:,.2f}'.replace(',', '.')],
            ['Sconto', f'{self.my_discount:.1f}%'],
            ['Sconto Best Offer', f'{self.competitor_discount:.1f}%'],
            ['Prezzo Offerto', f'€ {self.my_price:,.2f}'.replace(',', '.')],
            ['Prezzo Best Offer', f'€ {self.competitor_price:,.2f}'.replace(',', '.')],
            ['Score Economico', f'{self.economic_score:.2f}'],
            ['Max Score', f'{self.max_econ_score:.2f}'],
            ['Alpha', f'{self.alpha}'],
        ]

        econ_table = Table(econ_params, colWidths=[6*cm, 6*cm])
        econ_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
        ]))
        story.append(econ_table)
        story.append(Spacer(1, 0.5*cm))

        # Score curve chart
        story.append(Paragraph("Curva Punteggio", self.styles['SubSectionTitle']))

        chart_buf = create_score_curve_chart(
            self.base_amount, self.competitor_discount, self.alpha,
            self.max_tech_score, self.max_econ_score, self.technical_score
        )
        story.append(RLImage(chart_buf, width=14*cm, height=7*cm))
        story.append(Spacer(1, 0.3*cm))

        # Scenario table (sample discounts)
        story.append(Paragraph("Tabella Scenari (Sconto 1-100%)", self.styles['SubSectionTitle']))

        scenario_data = [['Sconto %', 'Ratio', 'Score Econ.', 'Peso Econ.', 'TOTALE']]

        p_best = self.base_amount * (1 - self.competitor_discount / 100)
        weight_econ = self.lot_config.get('weight_econ', 40) / 100

        # Sample discounts: 5, 10, 15, 20, 25, 30, 35, 40, 45, 50 (or current discount range)
        sample_discounts = list(range(5, 55, 5))

        for d in sample_discounts:
            p_off = self.base_amount * (1 - d / 100)
            p_actual_best = min(p_off, p_best)

            if p_actual_best > 0:
                ratio = p_off / p_actual_best
                if ratio <= 1:
                    econ = self.max_econ_score * (1 - (ratio ** self.alpha))
                else:
                    econ = 0
            else:
                ratio = 0
                econ = 0

            total = self.technical_score + econ
            weighted_econ = econ * weight_econ

            scenario_data.append([
                f'{d}%',
                f'{ratio:.4f}',
                f'{econ:.2f}',
                f'{weighted_econ:.2f}',
                f'{total:.2f}'
            ])

        scenario_table = Table(scenario_data, colWidths=[2.5*cm, 3*cm, 3*cm, 3*cm, 3*cm])
        scenario_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [COLORS['white'], COLORS['light']]),
        ]))
        story.append(scenario_table)

        story.append(PageBreak())

    def _add_rti_section(self, story: List):
        """Add RTI section"""
        story.append(Paragraph("Composizione RTI", self.styles['SectionTitle']))
        story.append(Spacer(1, 0.3*cm))

        # RTI parameters
        rti_data = [['Partner', 'Quota %', 'Ruolo']]

        for company in self.rti_companies:
            quota = self.rti_quotas.get(company, 0)
            role = 'Mandataria' if company == 'Lutech' else 'Mandante'
            rti_data.append([company, f'{quota:.0f}%', role])

        # Total row
        total_quota = sum(self.rti_quotas.values())
        rti_data.append(['TOTALE', f'{total_quota:.0f}%', ''])

        rti_table = Table(rti_data, colWidths=[6*cm, 4*cm, 4*cm])
        rti_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, -1), (-1, -1), COLORS['light']),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
        ]))
        story.append(rti_table)
        story.append(Spacer(1, 0.5*cm))

        # RTI pie chart
        pie_buf = create_rti_pie_chart(self.rti_quotas)
        if pie_buf:
            story.append(RLImage(pie_buf, width=8*cm, height=6*cm))

        story.append(PageBreak())

    def _add_config_section(self, story: List):
        """Add Config section"""
        story.append(Paragraph("Configurazione Lotto", self.styles['SectionTitle']))
        story.append(Spacer(1, 0.3*cm))

        # Lot configuration parameters
        config_data = [
            ['Parametro', 'Valore'],
            ['ID Lotto', self.lot_key],
            ['Max Score Tecnico', f'{self.max_tech_score:.2f}'],
            ['Max Score Economico', f'{self.max_econ_score:.2f}'],
            ['Alpha', f'{self.alpha}'],
            ['RTI Abilitato', 'Sì' if self.is_rti else 'No'],
        ]

        # Add requirement weights if available
        requirements = self.lot_config.get('requirements', [])
        if requirements:
            config_data.append(['', ''])
            config_data.append(['REQUISITI TECNICI', ''])
            for req in requirements:
                req_id = req.get('id', '')
                weight = req.get('weight', 0)
                config_data.append([req_id, f'Peso: {weight}'])

        config_table = Table(config_data, colWidths=[8*cm, 6*cm])
        config_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), COLORS['muted']),
            ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [COLORS['white'], COLORS['light']]),
        ]))
        story.append(config_table)

        story.append(Spacer(1, 1*cm))

        # Final footer
        story.append(Paragraph(
            "<i>Report generato automaticamente dal Simulatore Gara Poste</i>",
            ParagraphStyle('FinalFooter', fontSize=8, textColor=COLORS['muted'], alignment=TA_CENTER)
        ))


# ============================================================================
# PUBLIC FUNCTION
# ============================================================================

def generate_pdf_report(
    lot_key: str,
    lot_config: Dict[str, Any],
    base_amount: float,
    my_discount: float,
    competitor_discount: float,
    technical_score: float,
    economic_score: float,
    total_score: float,
    details: Dict[str, float],
    weighted_scores: Dict[str, float],
    category_scores: Dict[str, float],
    max_tech_score: float,
    max_econ_score: float,
    alpha: float,
    win_probability: float,
    tech_inputs_full: Optional[Dict[str, Any]] = None,
    rti_quotas: Optional[Dict[str, float]] = None,
) -> io.BytesIO:
    """
    Generate comprehensive PDF report matching the Excel structure.

    Returns:
        BytesIO buffer containing the PDF
    """
    generator = PDFReportGenerator(
        lot_key=lot_key,
        lot_config=lot_config,
        base_amount=base_amount,
        my_discount=my_discount,
        competitor_discount=competitor_discount,
        technical_score=technical_score,
        economic_score=economic_score,
        total_score=total_score,
        details=details,
        weighted_scores=weighted_scores,
        category_scores=category_scores,
        max_tech_score=max_tech_score,
        max_econ_score=max_econ_score,
        alpha=alpha,
        win_probability=win_probability,
        tech_inputs_full=tech_inputs_full,
        rti_quotas=rti_quotas,
    )

    return generator.generate()
