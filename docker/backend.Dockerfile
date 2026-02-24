FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Set pip environment variables for better resilience
ENV PIP_DEFAULT_TIMEOUT=100 \
    PIP_RETRIES=5 \
    PIP_DISABLE_PIP_VERSION_CHECK=on

# Copy and install requirements
COPY requirements/backend_requirements.txt ./requirements.txt

# 1. Upgrade pip
# 2. Install torch (CPU version) specifically to save ~2GB of space and avoid timeouts
# 3. Install remaining requirements
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch>=2.2.0 --extra-index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# Download NLTK data at build time
RUN python -c "import nltk; nltk.download('punkt'); nltk.download('punkt_tab')"

# Copy backend source
COPY backend/ ./

# Expose port
EXPOSE 8000

# Run the app
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
