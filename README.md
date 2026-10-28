# ConvertX 中文版

[C4illin/ConvertX](https://github.com/C4illin/ConvertX) 的第三方简体中文汉化版。汉化在构建阶段通过源码词典替换完成，并自动跟进上游版本。

- 镜像：`ghcr.io/marod1m/convertx-zh`
- 源码：<https://github.com/MaroD1M/convertx-zh>
- 支持架构：`linux/amd64`、`linux/arm64`
- 许可证：AGPL-3.0

> 非官方项目，与上游作者无隶属关系。当前界面为中文单语版本。

## 特性

- 内置界面完整汉化，包括上传、转换、历史记录、账户和错误提示。
- 以官方 `ghcr.io/c4illin/convertx:<版本>` 为基础，只替换编译产物，保留 LibreOffice、FFmpeg 等转换依赖。
- GitHub Actions 自动检查上游新版本、提取新增文案并创建翻译 PR。
- 发布多架构镜像，并在 Release 中附带对应源码归档。

## 快速开始：Docker Compose（推荐）

### 1. 准备目录和配置

```bash
mkdir convertx-zh
cd convertx-zh

curl -fsSLO https://raw.githubusercontent.com/MaroD1M/convertx-zh/main/compose.yaml
curl -fsSLO https://raw.githubusercontent.com/MaroD1M/convertx-zh/main/.env.example
cp .env.example .env

# 生成随机 JWT 密钥，把输出填入 .env 的 JWT_SECRET
openssl rand -hex 32
```

编辑 `.env`，至少修改：

```dotenv
JWT_SECRET=上一步生成的随机字符串
PUID=1000   # 改成 `id -u` 的输出
PGID=1000   # 改成 `id -g` 的输出
TZ=Asia/Shanghai
```

### 2. 启动

```bash
docker compose up -d
docker compose logs -f
```

浏览器打开 <http://localhost:3000>，首次访问会进入初始化页面，创建管理员账户。

### 3. 更新

```bash
docker compose pull
docker compose up -d
```

### 4. 停止与备份

```bash
# 停止容器，数据保留在 ./data
docker compose down

# 备份数据
tar -czf "convertx-zh-data-$(date +%F).tar.gz" data
```

## Compose 配置说明

仓库根目录的 `compose.yaml` 默认配置：

```yaml
services:
  convertx-zh:
    image: ghcr.io/marod1m/convertx-zh:latest
    container_name: convertx-zh
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      JWT_SECRET: ${JWT_SECRET:?Please set JWT_SECRET in .env}
      PUID: ${PUID:-1000}
      PGID: ${PGID:-1000}
      UMASK: ${UMASK:-002}
      TZ: ${TZ:-Asia/Shanghai}
      ACCOUNT_REGISTRATION: ${ACCOUNT_REGISTRATION:-false}
      HTTP_ALLOWED: ${HTTP_ALLOWED:-false}
      ALLOW_UNAUTHENTICATED: ${ALLOW_UNAUTHENTICATED:-false}
      AUTO_DELETE_EVERY_N_HOURS: ${AUTO_DELETE_EVERY_N_HOURS:-24}
      LANGUAGE: ${LANGUAGE:-zh}
      # WEBROOT: /convertx
```

关键变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 无，必须设置 | JWT 签名密钥，建议 `openssl rand -hex 32` |
| `PUID` / `PGID` | `1000` / `1000` | 运行用户，应与宿主机 `id -u` / `id -g` 一致 |
| `UMASK` | `002` | 文件创建掩码 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `LANGUAGE` | `zh` | 日期格式语言；不切换界面语言 |
| `ACCOUNT_REGISTRATION` | `false` | 是否允许新用户注册；首个管理员账户不受影响 |
| `HTTP_ALLOWED` | `false` | 是否允许非 HTTPS 连接；仅本地或可信网络可设为 `true` |
| `ALLOW_UNAUTHENTICATED` | `false` | 是否允许匿名使用；仅限可信内网 |
| `AUTO_DELETE_EVERY_N_HOURS` | `24` | 每 N 小时清理 N 小时前的文件，`0` 表示禁用 |
| `WEBROOT` | 空 | 子路径部署，例如 `/convertx` |

> 安全提示：不要把 `ALLOW_UNAUTHENTICATED=true` 或 `ACCOUNT_REGISTRATION=true` 的服务直接暴露到公网。通过公网访问时请使用 HTTPS；如果使用纯 HTTP 远程访问，登录 Cookie 可能无法写入，此时才需要设置 `HTTP_ALLOWED=true`。

## 使用 docker run

不使用 Compose 时：

```bash
docker run -d \
  --name convertx-zh \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -e TZ=Asia/Shanghai \
  -e ACCOUNT_REGISTRATION=false \
  -e HTTP_ALLOWED=false \
  ghcr.io/marod1m/convertx-zh:latest
```

## 镜像标签

- `latest`：最近一次构建
- `v0.19.0`：对应上游版本
- `sha-<commit>`：对应本仓库提交

建议生产环境固定到上游版本标签或 digest：

```bash
docker pull ghcr.io/marod1m/convertx-zh:v0.19.0
```

如果 GHCR 包不是公开状态，需要在 GitHub Packages 页面把 `convertx-zh` 的可见性改为 **Public**。

## 反向代理

推荐让反向代理终止 HTTPS，再转发到 `127.0.0.1:3000`，并保持 `HTTP_ALLOWED=false`。

Caddy 示例：

```caddyfile
convertx.example.com {
  reverse_proxy 127.0.0.1:3000
}
```

Nginx 示例：

```nginx
server {
  listen 443 ssl;
  server_name convertx.example.com;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

部署到子路径时，设置 `WEBROOT=/convertx`，并让反向代理保留该前缀。

## 工作方式

```text
上游 tarball (固定 tag)
        │
        ├── zh/zh-CN.json         界面文案词典
        ├── zh/manual-patches.json 动态文案与状态显示补丁
        └── zh/lib/apply.mjs      应用词典、结构补丁、手工补丁
        │
        ▼
   构建镜像（amd64 / arm64）
```

- 汉化发生在构建阶段，不修改上游仓库，也不依赖上游接受 PR。
- 运行时镜像以官方 `ghcr.io/c4illin/convertx:<tag>` 为基础，只替换编译产物和 `public/`，避免重复安装 LibreOffice、FFmpeg 等依赖。
- 同时兼容上游 v0.19 的 `dist/` 运行方式和后续版本的编译二进制方式。
- 页脚会显示“非官方简体中文汉化版 · 源码”，链接到本仓库。

## 本地开发

```bash
npm ci

# 下载固定版本的上游源码
TAG="$(jq -r .version zh/upstream.json)"
mkdir -p /tmp/upstream
curl -fsSL "https://github.com/C4illin/ConvertX/archive/refs/tags/${TAG}.tar.gz" \
  | tar -xz --strip-components=1 -C /tmp/upstream

# 检查词典是否覆盖全部文案
node zh/check.mjs /tmp/upstream --strict

# 应用翻译，--strict 会在手工补丁失效时失败
node zh/apply.mjs /tmp/upstream --strict \
  --source-url "https://github.com/MaroD1M/convertx-zh"

# 类型检查与构建
cd /tmp/upstream
bun install --frozen-lockfile
bun run build
```

### 翻译新文案

1. 运行 `node zh/sync.mjs /tmp/upstream --version "$TAG"`。
2. 在 `zh/zh-CN.json` 中找到 `"status": "todo"` 的条目，填写 `target` 并改为 `"status": "translated"`。
3. 运行 `node zh/check.mjs /tmp/upstream --strict` 和 `npm test`。
4. 如上游改动导致手工补丁失效，`apply.mjs --strict` 会报告“手工补丁缺失”，需要更新 `zh/manual-patches.json`。

词典以 `文件 + 上下文 + 出现序号` 为键，不依赖行号，因此上游小范围改动不会造成整份词典失效。

## 自动同步

`.github/workflows/sync-upstream.yml` 每天检查上游最新 Release：

1. 发现新版本后下载 tarball；
2. 运行 `zh/sync.mjs`，新增文案以 `todo` 状态写入；
3. 自动创建或更新 PR，并在 PR 中附上待翻译列表和检查结果；
4. 人工翻译并提交后，`Localization check` 会检查覆盖率和类型构建；
5. 合并到 `main` 后，`Publish image` 构建并推送多架构镜像，同时发布对应源码归档。

注意：用默认 `GITHUB_TOKEN` 创建的 PR 不会触发新的 `pull_request` 工作流。若希望自动触发检查，请添加仓库 Secret `SYNC_TOKEN`（fine-grained PAT，至少包含 Contents 和 Pull Requests 的写权限）；未配置时会回退到 `GITHUB_TOKEN`。

还需在仓库 **Settings → Actions → General → Workflow permissions** 中允许 GitHub Actions 创建 Pull Request，并给工作流写权限。

## 目录结构

```text
compose.yaml           推荐部署配置
.env.example           环境变量模板
zh/
  upstream.json        固定上游版本与基础镜像
  config.json          locale、默认语言、源码链接
  zh-CN.json           翻译词典
  glossary.json        术语表
  manual-patches.json  动态文案/状态显示补丁
  lib/                 提取、应用、同步、检查逻辑
  Dockerfile           基于官方镜像的运行时覆盖
.github/workflows/
  sync-upstream.yml    跟进上游并开 PR
  pr-check.yml         词典覆盖率 + 类型检查
  docker-publish.yml   多架构镜像与源码归档
tests/                 提取/应用/词典逻辑测试
```

## 已知限制

- 只汉化上游内置界面，不翻译第三方转换工具自身输出的日志和错误。
- 文件格式名称、扩展名、技术名词保持原样。
- 上游若大幅调整页面结构，自动提取可能产生误提取或遗漏，需要人工调整提取规则或手工补丁。
- 镜像依赖官方基础镜像；上游基础镜像不可用时，需要临时改用其他基础镜像。

## 许可与对应源码

本项目以 AGPL-3.0 发布，见 `LICENSE`。构建产物对应源码：

- 本仓库（覆盖层与构建脚本）；
- `zh/upstream.json` 中固定的上游源码；
- Releases 中附带的 `convertx-zh-<版本>-source.tar.gz`。

修改说明见 `NOTICE.md`。
