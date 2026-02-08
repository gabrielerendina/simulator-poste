"""
PDF Report Generator for Simulator Poste
Generates professional multi-page strategic reports with branding
"""

import io
import os
from datetime import datetime
from typing import Dict, Any, List, Optional

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Wedge, Circle
import matplotlib.patches as mpatches

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image as RLImage, PageBreak, KeepTogether, Flowable
)
from reportlab.pdfgen import canvas


# Brand Colors
COLORS = {
    'primary': colors.HexColor('#003366'),      # Lutech Blue
    'secondary': colors.HexColor('#FFCC00'),    # Poste Yellow
    'success': colors.HexColor('#28a745'),      # Green
    'warning': colors.HexColor('#ffc107'),      # Yellow/Orange
    'danger': colors.HexColor('#dc3545'),       # Red
    'light': colors.HexColor('#f8f9fa'),        # Light gray
    'dark': colors.HexColor('#333333'),         # Dark text
    'muted': colors.HexColor('#6c757d'),        # Muted text
    'white': colors.white,
    'black': colors.black,
}

# Asset paths
ASSETS_DIR = os.path.join(os.path.dirname(__file__), 'assets')
LOGO_LUTECH = os.path.join(ASSETS_DIR, 'logo-lutech.png')
LOGO_POSTE = os.path.join(ASSETS_DIR, 'logo-poste.png')


class NumberedCanvas(canvas.Canvas):
    """Canvas that adds page numbers and header/footer to each page"""

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
            self.draw_header_footer(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_header_footer(self, page_count):
        page_num = self._pageNumber
        width, height = A4

        # Skip header/footer on cover page (page 1)
        if page_num == 1:
            return

        # Header line
        self.setStrokeColor(COLORS['primary'])
        self.setLineWidth(0.5)
        self.line(2*cm, height - 1.5*cm, width - 2*cm, height - 1.5*cm)

        # Header text
        self.setFont('Helvetica', 8)
        self.setFillColor(COLORS['muted'])
        self.drawString(2*cm, height - 1.3*cm, f"Report Strategico - {self.lot_name}")
        self.drawRightString(width - 2*cm, height - 1.3*cm,
                            datetime.now().strftime("%d/%m/%Y"))

        # Footer line
        self.line(2*cm, 1.5*cm, width - 2*cm, 1.5*cm)

        # Footer text
        self.drawString(2*cm, 1*cm, "Documento riservato - Lutech S.p.A.")
        self.drawRightString(width - 2*cm, 1*cm, f"Pag. {page_num}/{page_count}")


class KPIBox(Flowable):
    """Custom flowable for KPI display boxes"""

    def __init__(self, label: str, value: str, color: colors.Color,
                 width: float = 5*cm, height: float = 2.5*cm):
        Flowable.__init__(self)
        self.label = label
        self.value = value
        self.color = color
        self.box_width = width
        self.box_height = height

    def draw(self):
        # Box background
        self.canv.setFillColor(COLORS['light'])
        self.canv.roundRect(0, 0, self.box_width, self.box_height, 5, fill=1, stroke=0)

        # Left color bar
        self.canv.setFillColor(self.color)
        self.canv.rect(0, 0, 5, self.box_height, fill=1, stroke=0)

        # Value (large)
        self.canv.setFillColor(COLORS['dark'])
        self.canv.setFont('Helvetica-Bold', 20)
        self.canv.drawString(15, self.box_height - 25, self.value)

        # Label (small)
        self.canv.setFillColor(COLORS['muted'])
        self.canv.setFont('Helvetica', 9)
        self.canv.drawString(15, 10, self.label)

    def wrap(self, availWidth, availHeight):
        return (self.box_width, self.box_height)


def get_probability_color(probability: float) -> colors.Color:
    """Get color based on win probability"""
    if probability >= 60:
        return COLORS['success']
    elif probability >= 40:
        return COLORS['warning']
    else:
        return COLORS['danger']


def get_probability_label(probability: float) -> str:
    """Get label based on win probability"""
    if probability >= 60:
        return "ALTA"
    elif probability >= 40:
        return "MEDIA"
    else:
        return "BASSA"


def create_gauge_chart(value: float, max_value: float, title: str) -> io.BytesIO:
    """Create a semicircular gauge chart"""
    fig, ax = plt.subplots(figsize=(3, 2), subplot_kw={'aspect': 'equal'})

    # Calculate percentage
    pct = min(100, max(0, (value / max_value) * 100))

    # Draw background arc (gray)
    bg_wedge = Wedge(center=(0, 0), r=1, theta1=0, theta2=180,
                     facecolor='#e9ecef', edgecolor='none')
    ax.add_patch(bg_wedge)

    # Determine color based on percentage
    if pct >= 70:
        color = '#28a745'
    elif pct >= 40:
        color = '#ffc107'
    else:
        color = '#dc3545'

    # Draw value arc
    angle = 180 * (pct / 100)
    value_wedge = Wedge(center=(0, 0), r=1, theta1=0, theta2=angle,
                        facecolor=color, edgecolor='none')
    ax.add_patch(value_wedge)

    # Inner circle (white center)
    inner_circle = Circle((0, 0), 0.6, facecolor='white', edgecolor='none')
    ax.add_patch(inner_circle)

    # Value text
    ax.text(0, 0.1, f'{value:.1f}', ha='center', va='center',
            fontsize=14, fontweight='bold', color='#333333')
    ax.text(0, -0.2, f'/ {max_value:.0f}', ha='center', va='center',
            fontsize=8, color='#6c757d')

    ax.set_xlim(-1.2, 1.2)
    ax.set_ylim(-0.3, 1.2)
    ax.axis('off')
    ax.set_title(title, fontsize=10, pad=5)

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def create_monte_carlo_chart(score_distribution: np.ndarray,
                             my_score: float,
                             competitor_score: float,
                             iterations: int) -> io.BytesIO:
    """Create improved Monte Carlo distribution chart with zones"""
    fig, ax = plt.subplots(figsize=(8, 4))

    # Calculate statistics
    mean_score = np.mean(score_distribution)
    std_score = np.std(score_distribution)

    # Create histogram
    n, bins, patches = ax.hist(score_distribution, bins=25,
                                color='#6c757d', alpha=0.3, edgecolor='white')

    # Color bins based on win/loss zones
    for i, patch in enumerate(patches):
        bin_center = (bins[i] + bins[i+1]) / 2
        if bin_center >= competitor_score:
            patch.set_facecolor('#28a74580')  # Green with alpha
        elif bin_center >= competitor_score - 5:
            patch.set_facecolor('#ffc10780')  # Yellow with alpha
        else:
            patch.set_facecolor('#dc354580')  # Red with alpha

    # My score line
    ax.axvline(my_score, color='#003366', linestyle='-', linewidth=3,
               label=f'Il Tuo Score: {my_score:.1f}')

    # Competitor score line (estimated)
    ax.axvline(competitor_score, color='#dc3545', linestyle='--', linewidth=2,
               label=f'Competitor Stimato: {competitor_score:.1f}')

    # Mean line
    ax.axvline(mean_score, color='#6c757d', linestyle=':', linewidth=1.5,
               label=f'Media: {mean_score:.1f}')

    # Fill zones legend
    win_patch = mpatches.Patch(color='#28a74580', label='Zona Vittoria')
    risk_patch = mpatches.Patch(color='#ffc10780', label='Zona Rischio')
    loss_patch = mpatches.Patch(color='#dc354580', label='Zona Perdita')

    ax.set_xlabel('Punteggio Totale', fontsize=11)
    ax.set_ylabel('Frequenza', fontsize=11)
    ax.set_title(f'Distribuzione Monte Carlo ({iterations} simulazioni)',
                 fontsize=12, fontweight='bold')

    # Legend
    handles, labels = ax.get_legend_handles_labels()
    handles.extend([win_patch, risk_patch, loss_patch])
    ax.legend(handles=handles, loc='upper left', fontsize=8)

    ax.grid(alpha=0.3, linestyle='--')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def create_category_breakdown_chart(categories: Dict[str, float],
                                    max_tech_score: float) -> io.BytesIO:
    """Create horizontal bar chart for category breakdown"""
    fig, ax = plt.subplots(figsize=(7, 3))

    labels = list(categories.keys())
    values = list(categories.values())

    # Estimate max per category (rough distribution)
    total_value = sum(values)

    # Colors based on contribution
    bar_colors = ['#003366' if v > 0 else '#e9ecef' for v in values]

    y_pos = np.arange(len(labels))
    bars = ax.barh(y_pos, values, color=bar_colors, height=0.6, edgecolor='white')

    # Add value labels
    for i, (bar, val) in enumerate(zip(bars, values)):
        width = bar.get_width()
        ax.text(width + 0.5, bar.get_y() + bar.get_height()/2,
                f'{val:.1f} pt', va='center', fontsize=9, color='#333333')

    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels, fontsize=10)
    ax.set_xlabel('Punteggio Pesato', fontsize=10)
    ax.set_title('Contributo per Categoria', fontsize=11, fontweight='bold')

    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(axis='x', alpha=0.3, linestyle='--')

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def create_scenarios_chart(scenarios: List[Dict], my_discount: float) -> io.BytesIO:
    """Create chart showing discount scenarios and probabilities"""
    fig, ax1 = plt.subplots(figsize=(7, 3.5))

    discounts = [s['discount'] for s in scenarios]
    probabilities = [s['probability'] for s in scenarios]
    scores = [s['total_score'] for s in scenarios]

    # Primary axis: Probability
    color1 = '#003366'
    ax1.set_xlabel('Sconto Offerto (%)', fontsize=10)
    ax1.set_ylabel('Probabilità Vittoria (%)', color=color1, fontsize=10)
    line1, = ax1.plot(discounts, probabilities, color=color1, linewidth=2,
                      marker='o', markersize=4, label='Probabilità')
    ax1.tick_params(axis='y', labelcolor=color1)
    ax1.set_ylim(0, 100)

    # Fill area under probability curve
    ax1.fill_between(discounts, probabilities, alpha=0.1, color=color1)

    # Secondary axis: Total Score
    ax2 = ax1.twinx()
    color2 = '#28a745'
    ax2.set_ylabel('Punteggio Totale', color=color2, fontsize=10)
    line2, = ax2.plot(discounts, scores, color=color2, linewidth=2,
                      linestyle='--', marker='s', markersize=4, label='Punteggio')
    ax2.tick_params(axis='y', labelcolor=color2)

    # Current discount line
    ax1.axvline(my_discount, color='#dc3545', linestyle=':', linewidth=2,
                label=f'Sconto Attuale: {my_discount}%')

    # Legend
    lines = [line1, line2]
    labels = ['Probabilità Vittoria', 'Punteggio Totale']
    ax1.legend(lines, labels, loc='upper left', fontsize=8)

    ax1.set_title('Analisi Scenari di Sconto', fontsize=11, fontweight='bold')
    ax1.grid(alpha=0.3, linestyle='--')
    ax1.spines['top'].set_visible(False)

    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='white', edgecolor='none')
    plt.close()
    buf.seek(0)
    return buf


def generate_pdf_report(
    lot_key: str,
    base_amount: float,
    technical_score: float,
    economic_score: float,
    total_score: float,
    my_discount: float,
    competitor_discount: float,
    category_scores: Dict[str, float],
    max_tech_score: float,
    max_econ_score: float,
    score_distribution: np.ndarray,
    win_probability: float,
    optimal_discount: Optional[float] = None,
    scenarios: Optional[List[Dict]] = None,
    iterations: int = 500
) -> io.BytesIO:
    """
    Generate comprehensive PDF report

    Returns:
        BytesIO buffer containing the PDF
    """
    buffer = io.BytesIO()

    # Create document with custom canvas for headers/footers
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2*cm,
        rightMargin=2*cm,
        topMargin=2*cm,
        bottomMargin=2*cm
    )

    styles = getSampleStyleSheet()

    # Custom styles
    styles.add(ParagraphStyle(
        name='CoverTitle',
        parent=styles['Heading1'],
        fontSize=28,
        textColor=COLORS['primary'],
        alignment=TA_CENTER,
        spaceAfter=20
    ))

    styles.add(ParagraphStyle(
        name='CoverSubtitle',
        parent=styles['Heading2'],
        fontSize=18,
        textColor=COLORS['dark'],
        alignment=TA_CENTER,
        spaceAfter=30
    ))

    styles.add(ParagraphStyle(
        name='SectionTitle',
        parent=styles['Heading2'],
        fontSize=14,
        textColor=COLORS['primary'],
        spaceBefore=20,
        spaceAfter=10,
        borderWidth=0,
        borderColor=COLORS['primary'],
        borderPadding=5
    ))

    styles.add(ParagraphStyle(
        name='BodyTextJustify',
        parent=styles['Normal'],
        fontSize=10,
        alignment=TA_JUSTIFY,
        spaceAfter=10,
        leading=14
    ))

    styles.add(ParagraphStyle(
        name='VerdictHigh',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=COLORS['success'],
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10
    ))

    styles.add(ParagraphStyle(
        name='VerdictMedium',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=COLORS['warning'],
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10
    ))

    styles.add(ParagraphStyle(
        name='VerdictLow',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=COLORS['danger'],
        alignment=TA_CENTER,
        spaceBefore=10,
        spaceAfter=10
    ))

    story = []

    # =========================================================================
    # PAGE 1: COVER PAGE
    # =========================================================================

    # Logos
    logo_table_data = [[]]
    if os.path.exists(LOGO_LUTECH):
        logo_table_data[0].append(RLImage(LOGO_LUTECH, width=4*cm, height=2*cm))
    else:
        logo_table_data[0].append(Paragraph("LUTECH", styles['Heading2']))

    logo_table_data[0].append(Spacer(1, 1))

    if os.path.exists(LOGO_POSTE):
        logo_table_data[0].append(RLImage(LOGO_POSTE, width=4*cm, height=2*cm))
    else:
        logo_table_data[0].append(Paragraph("POSTE", styles['Heading2']))

    logo_table = Table(logo_table_data, colWidths=[6*cm, 5*cm, 6*cm])
    logo_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(logo_table)
    story.append(Spacer(1, 3*cm))

    # Title
    story.append(Paragraph("REPORT STRATEGICO", styles['CoverTitle']))
    story.append(Paragraph("Valutazione Gara d'Appalto", styles['CoverSubtitle']))
    story.append(Spacer(1, 1*cm))

    # Lot name in a box
    lot_box_data = [[Paragraph(f"<b>{lot_key}</b>",
                               ParagraphStyle('LotBox', fontSize=20,
                                            textColor=COLORS['white'],
                                            alignment=TA_CENTER))]]
    lot_box = Table(lot_box_data, colWidths=[12*cm])
    lot_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['primary']),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 20),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
        ('LEFTPADDING', (0, 0), (-1, -1), 20),
        ('RIGHTPADDING', (0, 0), (-1, -1), 20),
    ]))
    story.append(lot_box)
    story.append(Spacer(1, 2*cm))

    # Quick summary stats
    summary_data = [
        ['Base d\'Asta', f'€ {base_amount:,.2f}'.replace(',', '.')],
        ['Punteggio Totale', f'{total_score:.2f} / 100'],
        ['Probabilità Vittoria', f'{win_probability:.1f}%'],
    ]
    summary_table = Table(summary_data, colWidths=[8*cm, 6*cm])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('TEXTCOLOR', (0, 0), (-1, -1), COLORS['dark']),
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
                          ParagraphStyle('DateStyle', fontSize=10,
                                        textColor=COLORS['muted'],
                                        alignment=TA_CENTER)))

    # Footer
    story.append(Spacer(1, 2*cm))
    story.append(Paragraph("Documento riservato - Lutech S.p.A.",
                          ParagraphStyle('FooterStyle', fontSize=9,
                                        textColor=COLORS['muted'],
                                        alignment=TA_CENTER)))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 2: EXECUTIVE SUMMARY
    # =========================================================================

    story.append(Paragraph("Sintesi Esecutiva", styles['SectionTitle']))
    story.append(Spacer(1, 0.5*cm))

    # Verdict box
    prob_label = get_probability_label(win_probability)
    prob_color = get_probability_color(win_probability)

    if win_probability >= 60:
        verdict_style = 'VerdictHigh'
    elif win_probability >= 40:
        verdict_style = 'VerdictMedium'
    else:
        verdict_style = 'VerdictLow'

    verdict_data = [[
        Paragraph(f"Probabilità di Vittoria: <b>{prob_label}</b>",
                 styles[verdict_style])
    ]]
    verdict_table = Table(verdict_data, colWidths=[17*cm])
    verdict_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (-1, -1), 2, prob_color),
    ]))
    story.append(verdict_table)
    story.append(Spacer(1, 0.8*cm))

    # KPI Summary Table
    kpi_data = [[
        Paragraph(f"<b>{total_score:.1f}</b><br/><font size='9' color='gray'>Punteggio Totale</font>",
                 ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER)),
        Paragraph(f"<b>{win_probability:.0f}%</b><br/><font size='9' color='gray'>Probabilità Vittoria</font>",
                 ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER, textColor=prob_color)),
        Paragraph(f"<b>{my_discount:.1f}%</b><br/><font size='9' color='gray'>Sconto Offerto</font>",
                 ParagraphStyle('KPI', fontSize=18, alignment=TA_CENTER)),
    ]]
    kpi_table = Table(kpi_data, colWidths=[5.5*cm, 5.5*cm, 5.5*cm])
    kpi_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('BOX', (0, 0), (0, 0), 1, COLORS['primary']),
        ('BOX', (1, 0), (1, 0), 1, prob_color),
        ('BOX', (2, 0), (2, 0), 1, COLORS['secondary']),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 0.8*cm))

    # Summary text
    if win_probability >= 60:
        situation = "favorevole"
        recommendation = "Si consiglia di procedere con l'offerta mantenendo lo sconto proposto."
    elif win_probability >= 40:
        situation = "equilibrata"
        recommendation = "Valutare un incremento dello sconto per aumentare la competitività."
    else:
        situation = "sfidante"
        recommendation = "Considerare un significativo aumento dello sconto o il miglioramento del profilo tecnico."

    summary_text = f"""
    La simulazione per il lotto <b>{lot_key}</b> evidenzia una situazione <b>{situation}</b>.
    Con un punteggio totale di <b>{total_score:.2f}</b> punti (tecnico: {technical_score:.2f},
    economico: {economic_score:.2f}) e uno sconto del <b>{my_discount}%</b>, la probabilità
    stimata di vittoria è del <b>{win_probability:.1f}%</b> rispetto a un competitor con sconto
    medio del {competitor_discount}%.
    <br/><br/>
    <b>Raccomandazione:</b> {recommendation}
    """
    story.append(Paragraph(summary_text, styles['BodyTextJustify']))
    story.append(Spacer(1, 0.5*cm))

    # Score gauges
    tech_gauge = create_gauge_chart(technical_score, max_tech_score, "Punteggio Tecnico")
    econ_gauge = create_gauge_chart(economic_score, max_econ_score, "Punteggio Economico")

    gauge_data = [[
        RLImage(tech_gauge, width=6*cm, height=4*cm),
        RLImage(econ_gauge, width=6*cm, height=4*cm),
    ]]
    gauge_table = Table(gauge_data, colWidths=[8.5*cm, 8.5*cm])
    gauge_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(gauge_table)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 3: TECHNICAL SCORE BREAKDOWN
    # =========================================================================

    story.append(Paragraph("Analisi Punteggio Tecnico", styles['SectionTitle']))
    story.append(Spacer(1, 0.5*cm))

    # Category breakdown table
    category_labels = {
        'company_certs': 'Certificazioni Aziendali',
        'resource': 'Certificazioni Professionali',
        'reference': 'Referenze',
        'project': 'Progetti Tecnici'
    }

    breakdown_data = [['Categoria', 'Punteggio', 'Contributo %']]
    total_cat_score = sum(category_scores.values())

    for cat_key, cat_label in category_labels.items():
        score = category_scores.get(cat_key, 0)
        pct = (score / technical_score * 100) if technical_score > 0 else 0
        breakdown_data.append([cat_label, f'{score:.2f}', f'{pct:.1f}%'])

    breakdown_data.append(['TOTALE TECNICO', f'{technical_score:.2f}', '100%'])

    breakdown_table = Table(breakdown_data, colWidths=[8*cm, 4*cm, 4*cm])
    breakdown_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['primary']),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('BACKGROUND', (0, -1), (-1, -1), COLORS['light']),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('GRID', (0, 0), (-1, -1), 0.5, COLORS['muted']),
    ]))
    story.append(breakdown_table)
    story.append(Spacer(1, 0.8*cm))

    # Category chart
    chart_categories = {
        category_labels[k]: v for k, v in category_scores.items() if k in category_labels
    }
    if chart_categories:
        category_chart = create_category_breakdown_chart(chart_categories, max_tech_score)
        story.append(RLImage(category_chart, width=15*cm, height=6.5*cm))

    story.append(Spacer(1, 0.8*cm))

    # Improvement suggestions
    story.append(Paragraph("Aree di Miglioramento", styles['SectionTitle']))

    improvements = []
    tech_pct = (technical_score / max_tech_score * 100) if max_tech_score > 0 else 0

    if tech_pct < 70:
        improvements.append("• Incrementare le certificazioni aziendali per migliorare il profilo qualitativo")
    if category_scores.get('resource', 0) < category_scores.get('company_certs', 0):
        improvements.append("• Valorizzare maggiormente le certificazioni professionali del team")
    if category_scores.get('reference', 0) < 5:
        improvements.append("• Aggiungere referenze rilevanti per dimostrare esperienza nel settore")
    if category_scores.get('project', 0) < 5:
        improvements.append("• Evidenziare progetti tecnici completati con successo")

    if not improvements:
        improvements.append("• Profilo tecnico solido - mantenere gli attuali punti di forza")

    for imp in improvements:
        story.append(Paragraph(imp, styles['BodyTextJustify']))

    story.append(PageBreak())

    # =========================================================================
    # PAGE 4: ECONOMIC ANALYSIS
    # =========================================================================

    story.append(Paragraph("Analisi Economica e Competitiva", styles['SectionTitle']))
    story.append(Spacer(1, 0.5*cm))

    # Economic summary
    econ_summary = f"""
    L'offerta economica prevede uno sconto del <b>{my_discount}%</b> sulla base d'asta di
    <b>€ {base_amount:,.2f}</b>, generando un punteggio economico di <b>{economic_score:.2f}</b>
    punti su un massimo di {max_econ_score:.0f}.
    """
    story.append(Paragraph(econ_summary.replace(',', '.'), styles['BodyTextJustify']))
    story.append(Spacer(1, 0.5*cm))

    # Monte Carlo chart
    competitor_total = (technical_score * 0.9) + (max_econ_score * 0.8)  # Estimated
    mc_chart = create_monte_carlo_chart(score_distribution, total_score,
                                        competitor_total, iterations)
    story.append(RLImage(mc_chart, width=16*cm, height=8*cm))
    story.append(Spacer(1, 0.5*cm))

    # Statistics table
    story.append(Paragraph("Statistiche Simulazione", styles['SectionTitle']))

    stats_data = [
        ['Metrica', 'Valore'],
        ['Iterazioni', f'{iterations}'],
        ['Score Medio', f'{np.mean(score_distribution):.2f}'],
        ['Score Minimo', f'{np.min(score_distribution):.2f}'],
        ['Score Massimo', f'{np.max(score_distribution):.2f}'],
        ['Deviazione Standard', f'{np.std(score_distribution):.2f}'],
        ['Percentile 25°', f'{np.percentile(score_distribution, 25):.2f}'],
        ['Percentile 75°', f'{np.percentile(score_distribution, 75):.2f}'],
    ]

    stats_table = Table(stats_data, colWidths=[8*cm, 6*cm])
    stats_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), COLORS['muted']),
        ('TEXTCOLOR', (0, 0), (-1, 0), COLORS['white']),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [COLORS['white'], COLORS['light']]),
    ]))
    story.append(stats_table)

    story.append(PageBreak())

    # =========================================================================
    # PAGE 5: STRATEGIC RECOMMENDATIONS
    # =========================================================================

    story.append(Paragraph("Raccomandazioni Strategiche", styles['SectionTitle']))
    story.append(Spacer(1, 0.5*cm))

    # Optimal discount recommendation
    if optimal_discount is not None:
        opt_diff = optimal_discount - my_discount
        if abs(opt_diff) > 1:
            opt_text = f"""
            <b>Sconto Ottimale Suggerito: {optimal_discount:.1f}%</b><br/><br/>
            Rispetto allo sconto attuale del {my_discount}%, si suggerisce un
            {'aumento' if opt_diff > 0 else 'decremento'} di {abs(opt_diff):.1f} punti percentuali
            per massimizzare la probabilità di vittoria mantenendo un equilibrio economico.
            """
        else:
            opt_text = f"""
            <b>Sconto Attuale Ottimale</b><br/><br/>
            Lo sconto attuale del {my_discount}% è in linea con l'ottimizzazione suggerita.
            Non sono necessarie modifiche significative.
            """
    else:
        opt_text = f"""
        <b>Valutazione Sconto: {my_discount}%</b><br/><br/>
        Considerare l'impatto di variazioni dello sconto sulla probabilità di vittoria
        in base al contesto competitivo.
        """

    opt_box_data = [[Paragraph(opt_text, styles['BodyTextJustify'])]]
    opt_box = Table(opt_box_data, colWidths=[16*cm])
    opt_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COLORS['light']),
        ('BOX', (0, 0), (-1, -1), 2, COLORS['secondary']),
        ('TOPPADDING', (0, 0), (-1, -1), 15),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ('LEFTPADDING', (0, 0), (-1, -1), 15),
        ('RIGHTPADDING', (0, 0), (-1, -1), 15),
    ]))
    story.append(opt_box)
    story.append(Spacer(1, 0.8*cm))

    # Pros and Cons
    story.append(Paragraph("Analisi SWOT Semplificata", styles['SectionTitle']))

    # Generate dynamic pros/cons based on scores
    pros = []
    cons = []

    if technical_score >= max_tech_score * 0.7:
        pros.append("Solido profilo tecnico")
    else:
        cons.append("Profilo tecnico migliorabile")

    if economic_score >= max_econ_score * 0.7:
        pros.append("Offerta economica competitiva")
    else:
        cons.append("Margine economico limitato")

    if win_probability >= 60:
        pros.append("Alta probabilità di successo")
    elif win_probability < 40:
        cons.append("Probabilità di vittoria contenuta")

    if category_scores.get('company_certs', 0) > 5:
        pros.append("Certificazioni aziendali rilevanti")

    if category_scores.get('reference', 0) > 5:
        pros.append("Referenze consolidate")
    else:
        cons.append("Referenze da potenziare")

    # Ensure at least one item per column
    if not pros:
        pros.append("Partecipazione strategica")
    if not cons:
        cons.append("Monitorare l'evoluzione competitiva")

    swot_data = [
        [Paragraph("<b>PUNTI DI FORZA</b>",
                  ParagraphStyle('SWOTHeader', textColor=COLORS['success'],
                                alignment=TA_CENTER, fontSize=11)),
         Paragraph("<b>AREE DI ATTENZIONE</b>",
                  ParagraphStyle('SWOTHeader', textColor=COLORS['danger'],
                                alignment=TA_CENTER, fontSize=11))],
        [Paragraph('<br/>'.join([f"• {p}" for p in pros]), styles['BodyTextJustify']),
         Paragraph('<br/>'.join([f"• {c}" for c in cons]), styles['BodyTextJustify'])],
    ]

    swot_table = Table(swot_data, colWidths=[8*cm, 8*cm])
    swot_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#d4edda')),
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#f8d7da')),
        ('BACKGROUND', (0, 1), (0, 1), colors.HexColor('#d4edda30')),
        ('BACKGROUND', (1, 1), (1, 1), colors.HexColor('#f8d7da30')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('BOX', (0, 0), (0, -1), 1, COLORS['success']),
        ('BOX', (1, 0), (1, -1), 1, COLORS['danger']),
    ]))
    story.append(swot_table)
    story.append(Spacer(1, 0.8*cm))

    # Next Steps
    story.append(Paragraph("Prossimi Passi", styles['SectionTitle']))

    next_steps = [
        "1. Validare i dati tecnici inseriti con il team di prevendita",
        "2. Verificare la completezza della documentazione richiesta",
        "3. Confermare lo sconto finale con la direzione commerciale",
        "4. Preparare la documentazione di gara entro i termini previsti",
    ]

    if win_probability < 50:
        next_steps.insert(2, "2b. Valutare opzioni per migliorare il punteggio tecnico")

    for step in next_steps:
        story.append(Paragraph(step, styles['BodyTextJustify']))

    # Build PDF with custom canvas
    doc.build(story, canvasmaker=lambda *args, **kwargs:
              NumberedCanvas(*args, lot_name=lot_key, **kwargs))

    buffer.seek(0)
    return buffer
