FROM python:3.12-slim

# Prevent Python from buffering stdout/stderr and writing bytecode
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8765 \
    HOST=0.0.0.0

WORKDIR /app

# Copy the server module
COPY server/ /app/server/
COPY tools/ /app/tools/

# Standard non-root user for container security
RUN useradd -u 1000 -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8765

# Run backend
CMD ["python", "-m", "server.server"]
