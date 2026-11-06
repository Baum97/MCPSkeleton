FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
COPY pyproject.toml uv.lock* README.md ./
COPY src ./src
RUN uv sync --no-dev
ENV HOST=0.0.0.0 PORT=3000
EXPOSE 3000
USER nobody
CMD ["uv", "run", "--no-sync", "{{projectName}}"]
