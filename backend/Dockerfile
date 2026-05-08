FROM python:3.11-slim

WORKDIR /app

# Copie et installation des dépendances en premier (cache Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copie du code source
COPY . .

# Exposition du port FastAPI
EXPOSE 8000

# Démarrage du serveur Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
