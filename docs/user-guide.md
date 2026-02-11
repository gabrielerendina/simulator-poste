# Guida Utente - Simulator Poste

Guida completa all'utilizzo del sistema di simulazione gare d'appalto.

---

## 📋 Indice

1. [Panoramica](#1-panoramica)
2. [Primo Avvio](#2-primo-avvio)
3. [Interfaccia Principale](#3-interfaccia-principale)
4. [Configurazione Gara](#4-configurazione-gara)
5. [Valutazione Tecnica](#5-valutazione-tecnica)
6. [Simulazione Economica](#6-simulazione-economica)
7. [Analisi Strategica](#7-analisi-strategica)
8. [Export Report PDF](#8-export-report-pdf)
9. [FAQ](#9-faq)

---

## 1. Panoramica

Simulator Poste è uno strumento per simulare e ottimizzare le offerte nelle gare d'appalto pubbliche. Permette di:

- **Configurare** i parametri di una gara (importo base, requisiti, pesi)
- **Valutare** la propria offerta tecnica inserendo certificazioni e referenze
- **Simulare** diversi scenari economici (sconti) e vedere l'impatto sul punteggio
- **Analizzare** la probabilità di vittoria contro i concorrenti con Monte Carlo
- **Ottimizzare** lo sconto per massimizzare le chances di aggiudicazione
- **Esportare** report PDF professionali per presentazioni e decisioni

### Flusso di Lavoro Tipico

```text
1. Seleziona/Configura Gara → 2. Inserisci Offerta Tecnica → 3. Simula Sconto → 4. Analizza Competitor → 5. Export PDF
```

---

## 2. Primo Avvio

### Accesso all'Applicazione

1. Apri il browser e naviga all'URL dell'applicazione
2. Se richiesto, effettua il login con le credenziali aziendali (SSO)
3. Verrai reindirizzato alla dashboard principale

### Selezione della Gara

Al primo avvio viene mostrata la gara predefinita. Per cambiare:

1. Nella **Sidebar** a sinistra, trova il menu a tendina "Gara/Lotto"
2. Seleziona la gara desiderata dall'elenco
3. L'interfaccia si aggiornerà con i dati della gara selezionata

---

## 3. Interfaccia Principale

L'interfaccia è divisa in tre aree principali:

### 3.1 Sidebar (Sinistra)

- **Logo Aziendale**: In alto
- **Selettore Gara/Lotto**: Menu a tendina per cambiare gara
- **Controlli Sconto**:
  - Sconto Competitore (migliore offerta di mercato)
  - Sconto Proprio (la tua offerta)
- **Riepilogo Punteggi**: Totale, Tecnico, Economico

### 3.2 Area Centrale

Contiene 3 tab principali:

| Tab | Descrizione |
| --- | --- |
| **Dashboard** | Gauge punteggi, grafico simulazione, analisi strategica |
| **Valutazione Tecnica** | Input per certificazioni e requisiti |
| **Configurazione** | Modifica parametri gara (admin) |

### 3.3 Navigazione Tab

Clicca sui tab in alto per navigare tra le sezioni:

- 📊 **Dashboard** - Visualizza risultati
- ⚙️ **Valutazione** - Inserisci dati tecnici
- 🔧 **Config** - Configura gara

---

## 4. Configurazione Gara

> **Nota:** La configurazione è tipicamente gestita da un amministratore. Gli utenti normali possono saltare questa sezione.

### 4.1 Accesso alla Configurazione

1. Clicca sul tab **Configurazione**
2. Seleziona il lotto da configurare dal selettore in alto

### 4.2 Parametri Base

| Campo | Descrizione |
| --- | --- |
| **Nome Lotto** | Identificativo della gara |
| **Importo Base** | Valore economico della gara in € |
| **Max Punteggio Tecnico** | Calcolato automaticamente dalla somma dei pesi gara |
| **Max Punteggio Economico** | 100 - Max Punteggio Tecnico |

### 4.3 Certificazioni Aziendali

Configura le certificazioni ISO richieste:

1. Clicca **+ Aggiungi Certificazione**
2. Seleziona dall'elenco (es. ISO 9001)
3. Imposta:
   - **Punti (Raw)**: Valore grezzo della certificazione
   - **Peso Gara**: Contributo al punteggio finale

### 4.4 Requisiti Tecnici

Tre tipologie di requisiti:

#### Certificazioni Professionali (type: `resource`)

Per requisiti basati su risorse certificate:

1. Clicca **+ Aggiungi Certificazione Professionale**
2. Configura:
   - **R (Risorse)**: Numero massimo di risorse richieste
   - **C (Certificazioni)**: Numero massimo di certificazioni per risorsa
   - **Peso Gara**: Contributo al punteggio finale
   - **Certificazioni Selezionate**: Quali certificazioni contano

Il punteggio massimo viene calcolato automaticamente con formula: `(2 × R) + (R × C)`

#### Referenze Aziendali (type: `reference`)

Per requisiti basati su progetti passati:

1. Clicca **+ Aggiungi Referenza**
2. Configura:
   - **Criteri**: Aggiungi criteri di valutazione
   - **Peso Interno**: Importanza relativa del criterio
   - **Max Valore**: Punteggio massimo (0-5)
   - **Attestazione Cliente**: Punti extra se presente
   - **Voci Tabellari**: Metriche personalizzate (es. volumi)

#### Progetti Tecnici (type: `project`)

Identico alle referenze, usato per valutare proposte progettuali.

### 4.5 Formula Economica

Configura i parametri della formula di scoring economico:

- **Coefficiente Alpha (α)**: Esponente per curva sconto (default: 0.3)
  - α basso (0.2): Premia anche piccoli sconti
  - α alto (0.5): Premia fortemente sconti aggressivi
- **Formula**: Seleziona "Interpolazione con Alpha"

### 4.6 Salvataggio

Le modifiche vengono salvate automaticamente al cambio di tab o lotto. Per salvare esplicitamente, clicca il pulsante **Salva** in fondo pagina (se presente).

---

## 5. Valutazione Tecnica

### 5.1 Accesso

1. Clicca sul tab **Valutazione Tecnica**
2. Le sezioni si espandono/comprimono cliccando sull'intestazione

### 5.2 Certificazioni Aziendali

Indica quali certificazioni possiede l'azienda:

1. Espandi la sezione **Certificazioni Aziendali**
2. Clicca sulle certificazioni possedute (diventano blu)
3. Il punteggio si aggiorna automaticamente a destra

### 5.3 Certificazioni Professionali

Per ogni requisito di tipo "resource":

1. **R (Risorse)**: Usa lo slider per indicare quante risorse proponi
2. **C (Certificazioni)**: Per ogni certificazione configurata:
   - Usa i pulsanti +/- per indicare quante risorse la possiedono
   - Il totale C viene calcolato automaticamente

> **Attenzione:** C non può superare R (non puoi avere più certificazioni che risorse).

**Formula Punteggio:**

```text
Punteggio = (2 × R) + (R × C)
```

**Esempio:**

- R = 4 risorse
- C = 3 certificazioni totali
- Punteggio = (2 × 4) + (4 × 3) = 8 + 12 = 20 punti

### 5.4 Referenze e Progetti

Per ogni requisito di tipo "reference" o "project":

1. Espandi il requisito
2. Per ogni **criterio**, seleziona il giudizio:
   - 0 = Assente/Inadeguato
   - 2 = Parzialmente adeguato
   - 3 = Adeguato
   - 4 = Più che adeguato
   - 5 = Ottimo

3. **Attestazione Cliente** (se presente):
   - Spunta la checkbox se disponi dell'attestazione
   - Aggiunge i punti configurati

4. **Voci Tabellari** (se presenti):
   - Usa i pulsanti +/- per regolare il valore
   - Rispetta il range min-max indicato

### 5.5 Visualizzazione Punteggi

Per ogni sezione vengono mostrati:

- **Raw**: Punteggio grezzo (somma dei valori)
- **Pesato**: Punteggio finale (dopo applicazione peso gara)

La dashboard si aggiorna in tempo reale.

---

## 6. Simulazione Economica

### 6.1 Controlli nella Sidebar

#### Sconto Competitore (Migliore Offerta)

Indica lo sconto della migliore offerta di mercato:

1. Usa lo slider o digita il valore nel campo
2. Questo rappresenta il benchmark di mercato

#### Sconto Proprio

Imposta il tuo sconto:

1. Usa lo slider per regolare (0-100%)
2. Il prezzo risultante viene mostrato sotto
3. Se il tuo prezzo è il migliore, appare il badge 🏆 **Miglior Prezzo**

### 6.2 Grafico Simulazione

Nella Dashboard, il grafico mostra:

- **Asse X**: Percentuale di sconto (10-70%)
- **Asse Y**: Punteggio totale
- **Linea Blu**: Il tuo punteggio al variare dello sconto
- **Punto Arancione**: Posizione attuale
- **Linea Rossa Tratteggiata**: Soglia competitore

**Interpretazione:**

- Quando sei sopra la linea rossa → stai vincendo
- Quando sei sotto → stai perdendo

---

## 7. Analisi Strategica

### 7.1 Competitor da Battere

Nella sezione superiore della Dashboard:

1. **Punteggio Tecnico Competitore**: Imposta la stima (slider)
2. **Sconto Economico Competitore**: Sconto specifico del competitor

Questi valori alimentano l'ottimizzatore.

### 7.2 Scenario Corrente

Mostra la tua posizione attuale:

| Metrica | Descrizione |
| --- | --- |
| Sconto | Il tuo sconto attuale |
| Punteggio Totale | Tech + Econ |
| Probabilità Vittoria | % basata su Monte Carlo |
| Delta vs Competitor | Differenza punteggi |
| Valore Offerta | Importo in € |

### 7.3 Scenari Suggeriti

L'ottimizzatore propone 4 scenari:

| Scenario | Strategia |
| --- | --- |
| **Conservativo** | Minimo sconto per battere il competitor |
| **Bilanciato** | Margine di sicurezza moderato |
| **Aggressivo** | Alta probabilità, margine ridotto |
| **Max** | Massima probabilità possibile |

Per ogni scenario:

- Sconto suggerito
- Punteggio risultante
- Probabilità di vittoria
- Delta vs competitor
- Valore offerta in €

### 7.4 Calcolatore Impatto Sconto

Mostra l'impatto di ogni punto percentuale di sconto:

- Sconto corrente → punti economici
- Best offer → punti economici
- Differenza punti
- Tip: Quanto vale +1% di sconto

---

## 8. Export Report PDF

### 8.1 Generazione Report

1. Vai alla **Dashboard**
2. Clicca il pulsante **📄 Export PDF** (in alto a destra nelle gauge)
3. Attendi la generazione (indicatore di loading)
4. Il download parte automaticamente

### 8.2 Contenuto del Report

Il PDF include:

1. **Intestazione**
   - Logo aziendale
   - Nome gara/lotto
   - Data generazione

2. **Riepilogo Punteggi**
   - Gauge grafico per Tecnico/Economico/Totale
   - Confronto con competitor

3. **Dettaglio per Categoria**
   - Certificazioni Aziendali
   - Certificazioni Professionali
   - Referenze/Progetti

4. **Analisi Monte Carlo**
   - Istogramma distribuzione punteggi
   - Probabilità di vittoria
   - Range min/max

5. **Raccomandazioni Strategiche**
   - Sconto consigliato
   - Scenari alternativi

### 8.3 Nome File

Il file viene salvato come:

```text
Report_Strategico_{NomeGara}.pdf
```

---

## 9. FAQ

### Come si calcola il punteggio tecnico?

1. Per ogni requisito si calcola il **punteggio raw** (grezzo)
2. Si applica la formula: `Pesato = (Raw / MaxRaw) × PesoGara`
3. Si sommano tutti i punteggi pesati

### Cosa significa Alpha (α) nella formula economica?

Alpha controlla quanto rapidamente cresce il punteggio con lo sconto:

- **α = 0.3 (default)**: Crescita morbida, premia anche piccoli sconti
- **α = 0.5**: Crescita più ripida, premia sconti aggressivi
- **α = 0.2**: Crescita lenta, quasi lineare

### Come funziona Monte Carlo?

La simulazione ripete 500 volte:

1. Genera uno sconto competitor casuale (distribuzione normale)
2. Genera un punteggio tecnico competitor casuale
3. Calcola chi vince
4. Conta le vittorie

La probabilità è: `Vittorie / Iterazioni × 100`

### Perché il mio punteggio tecnico è diverso dal raw?

Il punteggio raw è la somma dei punti grezzi.
Il punteggio pesato applica la proporzione rispetto al peso gara.

**Esempio:**

- Raw: 28/35 punti
- Peso gara: 10 punti
- Pesato: (28/35) × 10 = 8 punti

### Cosa succede se C > R?

Non è possibile: le certificazioni non possono superare le risorse.
Il sistema clampera automaticamente C = R.

### Come aggiungo una nuova gara?

1. Vai in **Configurazione**
2. Clicca **+ Aggiungi Gara/Lotto**
3. Inserisci il nome
4. Configura parametri, certificazioni e requisiti
5. Le modifiche vengono salvate automaticamente

### Il sistema salva i miei dati?

Sì, lo stato della simulazione viene salvato automaticamente:

- Sconti impostati
- Valori tecnici inseriti
- Certificazioni selezionate

Al prossimo accesso ritroverai tutto come lo avevi lasciato.

### Come posso cambiare lingua?

Attualmente l'applicazione supporta solo l'italiano.
Per aggiungere altre lingue, contattare l'amministratore.

---

## Supporto

Per problemi o richieste:

- **Email**: `support@lutech.it`
- **Documentazione Tecnica**: [docs/technical.md](technical.md)
- **API Reference**: [docs/api.md](api.md)
