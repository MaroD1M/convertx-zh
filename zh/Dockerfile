# syntax=docker/dockerfile:1.7
# 固定上游基础镜像，避免构建结果随 upstream:latest 漂移。
# 上游版本由 zh/upstream.json 记录；升级时先改版本，再跑 check/apply。
ARG BASE_IMAGE=ghcr.io/c4illin/convertx:v0.20.0

# 使用 Bun 构建上游前端。这里只负责产出静态资源和二进制，
# 最终运行环境仍沿用官方镜像，减少系统依赖差异。
FROM oven/bun:1.4.4 AS build
WORKDIR /src
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
# v0.20 起上游使用 build:bin 产出单文件二进制；旧版本回退到 build。
RUN if grep -q '"build:bin"' package.json; then \
      bun run build:bin; \
    else \
      bun run build; \
    fi
# 兼容两种上游产物布局：dist/ 或单文件 convertx。
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
# 页脚和 OCI 标签共用该地址；派生仓库应通过构建参数覆盖。
ARG SOURCE_URL=https://github.com/MaroD1M/convertx-zh
LABEL org.opencontainers.image.title="ConvertX 中文版"
LABEL org.opencontainers.image.description="C4illin/ConvertX 的第三方简体中文汉化版"
LABEL org.opencontainers.image.source="${SOURCE_URL}"

# 只替换前端资源和程序本体，保留官方镜像中的运行用户、依赖和入口。
COPY --from=build /out/ /tmp/out/
RUN rm -rf /app/public /app/dist /app/convertx && \
    cp -a /tmp/out/public /app/public && \
    if [ -f /tmp/out/convertx ]; then \
      cp /tmp/out/convertx /app/convertx && chmod +x /app/convertx; \
    else \
      cp -a /tmp/out/dist /app/dist; \
    fi && \
    rm -rf /tmp/out
