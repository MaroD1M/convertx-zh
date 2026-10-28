# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=ghcr.io/c4illin/convertx:v0.19.0

FROM oven/bun:1.4.2 AS build
WORKDIR /src
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN if grep -q '"build:bin"' package.json; then \
      bun run build && bun run build:bin; \
    else \
      bun run build; \
    fi
RUN mkdir -p /out && \
    cp -a public /out/public && \
    if [ -f dist/convertx ]; then \
      cp dist/convertx /out/convertx; \
    elif [ -f convertx ]; then \
      cp convertx /out/convertx; \
    else \
      cp -a dist /out/dist; \
    fi

FROM ${BASE_IMAGE}
ARG SOURCE_URL=https://github.com/MaroD1M/convertx-zh
LABEL org.opencontainers.image.title="ConvertX 中文版"
LABEL org.opencontainers.image.description="C4illin/ConvertX 的第三方简体中文汉化版"
LABEL org.opencontainers.image.source="${SOURCE_URL}"

COPY --from=build /out/ /tmp/out/
RUN rm -rf /app/public /app/dist /app/convertx && \
    cp -a /tmp/out/public /app/public && \
    if [ -f /tmp/out/convertx ]; then \
      cp /tmp/out/convertx /app/convertx && chmod +x /app/convertx; \
    else \
      cp -a /tmp/out/dist /app/dist; \
    fi && \
    rm -rf /tmp/out
