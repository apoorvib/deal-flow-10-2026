FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so this layer stays cached when only code changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

RUN groupadd --system app && useradd --system --gid app --no-create-home app
COPY --chown=app:app . .
USER app

EXPOSE 8000

# One worker keeps memory predictable under the 512M cgroup limit.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
