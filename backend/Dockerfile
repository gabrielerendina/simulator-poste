# Usa un'immagine Python leggera
FROM python:3.10-slim

# Imposta la directory di lavoro
WORKDIR /app

# Copia le dipendenze e installale
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia il codice sorgente
COPY . .

# Crea un user non-root per security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Espone la porta del backend
EXPOSE 8000

# Avvia il server con workers multipli per produzione
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:8000"]
