FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements
COPY requirements/backend_requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data at build time
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"

# Copy backend source
COPY backend/ ./

# Expose port
EXPOSE 8000

# Run the app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
