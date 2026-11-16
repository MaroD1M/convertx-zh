# ConvertX 中文版技术交接文档

> 适用版本：`v0.19.0-zh`；最后更新：2026-11-01
> 目标读者：后续维护者、接手发布/排障的人，以及不熟悉本项目但了解基本 Docker/Git 的使用者。

## 0. 一分钟结论

- 本项目是 [C4illin/ConvertX](https://github.com/C4illin/ConvertX) 的第三方简体中文汉化版，不是上游官方项目。
- 汉化在**构建阶段**完成：下载固定版本的上游源码，应用词典和补丁，再用官方镜像作为运行时底座。
- 不维护完整 fork，不修改上游仓库，不依赖上游合并 PR。
- 发布物是 `ghcr.io/marod1m/convertx-zh` 多架构镜像，以及 GitHub Release 中的对应源码归档。
- 当前固定上游版本为 `v0.19.0`，词典 93 条，自动化检查和工作流均已通过。
- 最需要关注的三件事：上游页面结构变化、手工补丁失效、GHCR/Release 权限与密钥配置。

## 1. 项目规划

### 1.1 背景与目标

ConvertX 是一个自托管的文件格式转换工具，功能完整但界面为英文。本项目希望在不影响上游转换能力的前提下，提供一个可直接部署的简体中文版本。

目标按优先级排列：

1. **可用**：镜像能启动，登录、上传、转换、下载、历史记录等主流程正常。
2. **可维护**：上游升级后能自动发现新增文案，人工翻译后重新发布。
3. **可追溯**：任何镜像都能对应到明确的源码、词典和补丁版本。
4. **可回滚**：发布失败或新版本有问题时，能快速回到上一个镜像/提交。
5. **合规**：遵守 AGPL-3.0，提供对应源码和修改说明。

### 1.2 范围

包含：

- 上游内置界面的静态文案、按钮、表单、提示、状态显示。
- 默认语言、`<html lang>`、页脚来源标识等结构汉化。
- 构建、测试、发布、上游同步的自动化。
- 面向普通用户的部署文档和面向维护者的交接文档。

不包含：

- 第三方转换工具自身输出的日志、错误和帮助文本。
- 文件格式名、扩展名、技术名词的翻译。
- 运行时多语言切换器。
- 上游后端 API 字段、数据库结构变更。
- 对上游功能的二次开发。

### 1.3 核心设计决策

| 决策 | 原因 | 代价 |
| --- | --- | --- |
| 使用源码词典，不直接改编译后的 HTML | 可审查、可复用、能跟进上游；构建时仍能精确定位 | 上游结构变化时需要维护提取规则 |
| 基于官方镜像，只替换前端/程序产物 | 保留 LibreOffice、FFmpeg 等复杂依赖，镜像更可靠 | 依赖官方基础镜像的标签和架构 |
| 不维护完整 fork | 减少同步成本，避免长期分叉 | 上游大改时需要人工适配 |
| 不自动调用大模型翻译 | 质量、术语一致性、可复现性和审查成本不可控 | 新文案需要人工翻译 |
| 中文单语，不做语言切换 | 降低复杂度和测试面 | 用户不能在同一界面切换英文 |
| 手工补丁使用精确文本匹配 | 能处理动态拼接和状态映射 | 上游改动会使补丁失效，必须显式报错 |
| 严格模式作为 CI 门禁 | 防止“漏翻但构建成功” | 上游升级会阻塞，直到补全翻译/补丁 |

### 1.4 版本与发布策略

- 上游版本记录在 `zh/upstream.json`，基础镜像也在这里固定。
- 镜像标签：
  - `latest`：最近一次成功发布，适合快速体验。
  - `v0.19.0`：对应上游版本，适合一般部署。
  - `sha-<commit>`：对应本仓库提交，适合精确回滚。
- Release 标签：`v0.19.0-zh`，附件为 `convertx-zh-v0.19.0-source.tar.gz`。
- 生产部署建议固定 `v0.19.0` 或 `sha-...`，不要长期依赖 `latest`。

### 1.5 安全与合规

- 项目以 AGPL-3.0 发布，修改说明见 `NOTICE.md`。
- 镜像和 Release 必须同时提供对应源码，不能只发二进制。
- 运行时必须设置 `JWT_SECRET`；不要使用示例值。
- 默认关闭注册和匿名访问；公网部署必须使用 HTTPS。
- 仓库中不应提交 `.env`、`data/`、`node_modules/`、私钥或访问令牌。
- 当前审计未发现敏感信息入库；GitHub Actions Secrets/Variables 为空。

## 2. 系统架构

### 2.1 组件图

```text
GitHub Actions
  ├─ Sync upstream ──> 下载上游 tarball ──> sync.mjs ──> 更新词典/报告 ──> 开 PR
  ├─ Localization check ──> npm test ──> check.mjs ──> apply.mjs ──> bun build
  └─ Publish image ──> apply.mjs ──> docker buildx ──> GHCR
                                      └─ 打包对应源码 ──> GitHub Release

运行时容器
  官方 ConvertX 镜像（运行用户、依赖、入口）
    └─ 替换 /app/public、/app/dist 或 /app/convertx
         └─ 已应用中文词典、结构补丁、手工补丁
```

### 2.2 数据流

1. `zh/upstream.json` 固定上游版本和基础镜像。
2. `sync.mjs` 下载对应 tarball，调用提取器扫描 `src/` 和 `public/`。
3. 提取结果与 `zh/zh-CN.json` 合并：新文案标记 `todo`，消失的文案标记 `removed`。
4. 人工填写 `target`，把状态改为 `translated`。
5. `check.mjs` 严格校验覆盖率；`apply.mjs` 把译文写回源码副本。
6. Docker 构建只复制编译产物和 `public/` 到官方镜像。
7. 发布镜像、源码归档和 Release。

### 2.3 关键文件与职责

| 路径 | 职责 |
| --- | --- |
| `zh/zh-CN.json` | 唯一人工翻译来源，条目含 `file/context/source/occurrence/target/status` |
| `zh/manual-patches.json` | 动态文案、状态映射、模板字符串等精确文本补丁 |
| `zh/config.json` | locale、默认语言、页脚源码链接 |
| `zh/upstream.json` | 固定上游版本、仓库、基础镜像 |
| `zh/lib/extract.mjs` | 从 TSX/TS/JS 和 `public/*.js` 提取候选文案 |
| `zh/lib/apply.mjs` | 应用词典、结构补丁、手工补丁，生成报告 |
| `zh/lib/dictionary.mjs` | 词典合并、校验、报告格式化 |
| `zh/lib/files.mjs` | 文件遍历、JSON 读写 |
| `zh/lib/keys.mjs` | 稳定词典主键 |
| `zh/lib/cli.mjs` | 轻量 CLI 参数解析 |
| `zh/apply.mjs` / `check.mjs` / `extract.mjs` / `sync.mjs` | CLI 入口 |
| `zh/Dockerfile` | 构建上游产物并覆盖到官方镜像 |
| `.github/workflows/*.yml` | 同步、检查、发布三条流水线 |
| `tests/localization.test.mjs` | 提取、应用、词典、补丁的核心回归测试 |
| `compose.yaml` / `.env.example` | 面向用户的部署配置 |

### 2.4 词典数据模型

```json
{
  "file": "src/pages/root.tsx",
  "context": "jsx:h1",
  "source": "Results",
  "occurrence": 1,
  "kind": "jsxText",
  "target": "转换结果",
  "status": "translated"
}
```

- `file`：相对上游源码根目录的 POSIX 路径。
- `context`：文案所在位置，例如 `jsx:h1`、`attr:placeholder`、`assignment:textContent`。
- `source`：归一化后的英文原文。
- `occurrence`：同一文件/上下文/原文的第几次出现，从 1 开始。
- `kind`：决定写回时如何保留引号和空白。
- `target`：中文译文；`todo` 状态下为空。
- `status`：`todo`、`translated`、`removed` 三种。

主键是 `file + context + source + occurrence`，不使用行号。这样上游插入空行或调整无关代码时，已有翻译不会全部失效。

### 2.5 手工补丁模型

`zh/manual-patches.json` 的每一项包含：

- `file`：目标文件相对路径。
- `find`：必须能在文件中匹配到的原文片段。
- `replace`：替换后的内容。
- `reason`：为什么必须手工处理，供后续维护者理解。

补丁按顺序执行，`find` 必须在文件中存在，否则 `apply.mjs --strict` 报“手工补丁缺失”。补丁不是正则，不会被解释为表达式；匹配和替换都是字面量。

### 2.6 为什么以官方镜像为底座

ConvertX 依赖 LibreOffice、FFmpeg、ImageMagick、Calibre 等大量外部工具。自行从零构建运行环境会显著增加镜像体积、系统依赖和跨架构风险。当前做法只替换应用前端和程序本体，最大程度复用官方镜像已经验证过的运行环境。

## 3. 已完成内容

### 3.1 功能与交付

- 简体中文词典：93 条，覆盖当前上游界面。
- 结构汉化：`<html lang="zh-CN">`、默认 `LANGUAGE=zh`、页脚来源标识。
- 动态文案：上传进度、文件状态、历史任务状态、删除确认/结果提示。
- 部署配置：`compose.yaml`、`.env.example`、`docker run` 示例、Nginx 示例。
- 法律与来源说明：`LICENSE`、`NOTICE.md`、Release 源码归档。
- 文档：根 README、本技术交接文档、翻译维护指南。

### 3.2 自动化

| 工作流 | 触发 | 作用 |
| --- | --- | --- |
| `sync-upstream.yml` | 每天 03:17 UTC、手动 | 检查上游 Release，更新词典，开/更新同步 PR |
| `pr-check.yml` | PR、push main | `npm test`、严格覆盖率检查、严格应用补丁、Bun 构建 |
| `docker-publish.yml` | push main 且改动 `zh/**` 或自身、手动 | 多架构镜像、GHCR 推送、源码 Release |

`sync-upstream.yml` 使用 `SYNC_TOKEN`（若配置）或默认 `GITHUB_TOKEN`。默认 token 创建的 PR 不会触发新的 `pull_request` 工作流，这是 GitHub 的限制，不是项目 bug。

### 3.3 当前交付物

- 仓库：<https://github.com/MaroD1M/convertx-zh>
- 镜像：`ghcr.io/marod1m/convertx-zh:latest`、`:v0.19.0`、`:sha-8bc72ef`
- 多架构索引 digest：`sha256:7eb4922565d917f50bd0566134a553be8cf748574682eba5609d4b221ad19059`
- Release：<https://github.com/MaroD1M/convertx-zh/releases/tag/v0.19.0-zh>
- 源码归档：`convertx-zh-v0.19.0-source.tar.gz`

### 3.4 验证记录

在本地和 CI 中已执行：

```bash
npm ci --no-audit --no-fund
npm test
node zh/check.mjs /tmp/upstream --strict
node zh/apply.mjs /tmp/upstream --strict --source-url "https://github.com/MaroD1M/convertx-zh"
cd /tmp/upstream && bun install --frozen-lockfile && bun run build
```

结果：

- `npm test`：5/5 通过。
- 覆盖率检查：93 条，缺失 0、失效 0、重复 0。
- 应用检查：93 条全部应用，手工补丁全部匹配。
- 生产模式启动后 `/setup` 返回 `lang="zh-CN"`、设置、欢迎等中文内容。
- 镜像层检查确认中文页脚、状态映射和脚本已写入。

## 4. 未完成方案与已知缺口

| 项目 | 状态 | 原因/说明 | 建议 |
| --- | --- | --- | --- |
| 运行时中英文切换 | 未做 | 上游并非完整 i18n，强行切换成本高 | 保持中文单语，文档写清 |
| 第三方工具日志翻译 | 未做 | 日志来自外部程序，格式不稳定 | 不纳入范围 |
| 自动 LLM 翻译 | 有意未做 | 质量、术语一致性和审查不可控 | 继续人工翻译 |
| 同步 PR 自动触发检查 | 未配置 | 默认 token 不触发新工作流 | 配置 `SYNC_TOKEN` |
| 基础镜像可用性预检 | 未做 | 上游可能未发布对应 tag 的镜像 | 发布前检查 GHCR tag |
| 容器冒烟测试 | 未做 | 当前 CI 只构建，不启动容器 | 增加 `docker run` + `/setup` 检查 |
| 镜像漏洞扫描 | 未做 | 未接入 Trivy/Grype | 在发布流程中加扫描 |
| 镜像签名 | 未做 | 未接入 cosign/Sigstore | 增加 keyless 签名 |
| Branch protection | 未配置 | 当前仅靠工作流 | 对 `main` 开启必需检查 |
| 多上游版本并行发布 | 未做 | 当前只固定一个版本 | 需要时改为 tag 矩阵 |
| 文档变更刷新 Release 归档 | 未做 | 发布工作流只监听 `zh/**` | 把 README/compose/NOTICE 加入 paths 或单独刷新 |
| 依赖/action 自动升级 | 未做 | Actions 未 SHA 固定 | 接入 Dependabot，逐步固定 SHA |
| 术语表强制校验 | 未做 | 已从独立 JSON 移入翻译指南 | 如需要，在测试中增加术语断言 |
| 失败通知 | 未做 | 仅依赖 GitHub 通知 | 可选加 Issue/邮件通知 |

## 5. 未来路线图

### P0：稳定性与可回滚（建议优先）

1. **发布前预检基础镜像**：确认 `ghcr.io/c4illin/convertx:<tag>` 存在且支持 amd64/arm64。
2. **容器冒烟测试**：在 `pr-check` 或发布前启动构建产物，检查 `/setup` 返回中文和 200。
3. **固定生产版本**：文档继续强调使用 `v0.19.0` 或 `sha-`，不推荐 `latest`。
4. **备份/回滚演练**：验证 `data/` 备份恢复和上一版镜像回滚。

验收标准：任一新版本发布前，四项均有记录或自动化证据。

### P1：质量与安全

1. 接入 Trivy 镜像扫描，至少报告 HIGH/CRITICAL。
2. 接入 cosign keyless 签名，并在 Release 说明中给出验证命令。
3. 配置 `SYNC_TOKEN`，让同步 PR 自动触发 `Localization check`。
4. 为 `main` 开启分支保护，要求 `Localization check` 通过。
5. 增加容器启动测试，验证 `JWT_SECRET` 缺失时按预期失败。
6. 用 Dependabot 管理 npm 和 GitHub Actions 版本。

验收标准：PR 页面能看到检查、扫描、签名结果；失败时不能合并。

### P2：长期维护

1. 把发布工作流扩展为版本矩阵，支持同时维护多个上游版本。
2. 增加术语一致性测试，防止“转换/转化”“账户/账号”等混用。
3. 为翻译 PR 增加截图或关键页面快照，降低人工审查成本。
4. 把文档变更也纳入 Release 归档刷新，保证归档与仓库一致。
5. 评估上游官方 i18n 能力；若上游支持完整多语言，可逐步减少补丁层。
6. 建立季度维护节奏：升级基础镜像、重建镜像、检查 Actions 弃用警告。

## 6. 运维与发布手册

### 6.1 正常发布流程

1. 确认 `main` 干净，`Localization check` 通过。
2. 如需升级上游：
   ```bash
   node zh/sync.mjs /tmp/upstream --version vX.Y.Z
   # 人工填写 todo 条目的 target，并改为 translated
   node zh/check.mjs /tmp/upstream --strict
   node zh/apply.mjs /tmp/upstream --strict
   npm test
   ```
3. 提交 `zh/` 变更并推送 `main`。
4. `Publish image` 自动构建多架构镜像、推送 GHCR、创建/更新 Release。
5. 检查 Actions 日志、GHCR 标签、Release 附件和镜像 digest。
6. 用固定版本标签做一次实际部署验证。

### 6.2 回滚

- 应用回滚：把 Compose 镜像改成上一个 `sha-<commit>` 或上一个上游版本标签，`docker compose up -d`。
- 数据回滚：停止容器，恢复 `data/` 备份，再启动。
- 代码回滚：`git revert` 有问题的提交，推送后重新发布；不要强推 `main`。
- 如果新镜像不可用，GHCR 上的旧 digest 通常仍保留，可直接按 digest 部署。

### 6.3 密钥与权限

需要关注：

- `JWT_SECRET`：运行时必填，只放在部署环境的 `.env`，不入库。
- `SYNC_TOKEN`：可选；fine-grained PAT，至少 Contents 和 Pull Requests 写权限。
- `GITHUB_TOKEN`：工作流自动提供；发布镜像需要 `packages: write`。
- GHCR 包可见性：需要在 GitHub 包设置中确认是 public，否则匿名拉取失败。
- Actions 设置：允许创建 PR（`can_approve_pull_request_reviews`）。

### 6.4 常见故障排查

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `docker pull` 401/403 | GHCR 包不是 public，或未登录 | 检查包可见性；私有包先 `docker login ghcr.io` |
| 容器启动即退出 | 未设置 `JWT_SECRET` | 在 `.env` 设置随机密钥 |
| 登录后立刻掉线 | 远程 HTTP 访问，Cookie 无法写入 | 使用 HTTPS；仅可信网络才设 `HTTP_ALLOWED=true` |
| 页面仍是英文 | 镜像不是本仓库版本，或浏览器缓存 | 确认镜像名/标签；强制刷新 |
| `/setup` 打不开 | 已初始化过、反向代理路径错误、容器未启动 | 查日志；检查 `WEBROOT` 和代理前缀 |
| 新上游同步 PR 检查不触发 | 使用了默认 `GITHUB_TOKEN` | 配置 `SYNC_TOKEN` |
| `apply --strict` 报手工补丁缺失 | 上游改动了目标代码 | 更新 `manual-patches.json` 的 `find` |
| `check --strict` 报未翻译 | 上游新增文案 | 翻译 `todo` 条目并改状态 |
| 构建失败提示基础镜像不存在 | 上游未发布对应镜像 tag | 改 `upstream.json` 的 `baseImage` 或等待上游 |
| Release 归档缺文件 | 发布工作流未覆盖该变更 | 手动重跑 `Publish image` |

### 6.5 监控与备份

- 最小监控：容器存活、HTTP 200、磁盘空间、`data/` 可写。
- 备份：定期打包 `data/`，至少保留最近两份；升级前手动备份一次。
- 日志：`docker compose logs -f --tail=200`；注意日志可能包含文件名等隐私信息。
- 自动清理：`AUTO_DELETE_EVERY_N_HOURS` 控制临时文件保留时间，按磁盘容量调整。

## 7. 开发与测试

### 7.1 本地环境

- Node.js 22（与 CI 一致）。
- Bun 1.4.2（仅用于构建上游前端）。
- 可选 Docker（本机没有也能通过 GitHub Actions 发布）。
- `jq`、`curl`、`tar` 用于下载上游。

### 7.2 常用命令

```bash
npm ci --no-audit --no-fund
npm test

TAG="$(jq -r .version zh/upstream.json)"
mkdir -p /tmp/upstream
curl -fsSL "https://github.com/C4illin/ConvertX/archive/refs/tags/${TAG}.tar.gz" \
  | tar -xz --strip-components=1 -C /tmp/upstream

node zh/check.mjs /tmp/upstream --strict
node zh/apply.mjs /tmp/upstream --strict \
  --source-url "https://github.com/MaroD1M/convertx-zh"

cd /tmp/upstream
bun install --frozen-lockfile
bun run build
```

### 7.3 测试策略

`tests/localization.test.mjs` 覆盖：

1. 从 TSX、JSX 文本、属性、`public/*.js` 中提取文案。
2. 跳过 URL、CSS、模板表达式等非文案。
3. 词典同步：新增、恢复、移除、保留译文。
4. 应用补丁后源码内容正确，且报告无缺失。
5. 严格校验能发现缺失、失效和重复词条。

当前 5 个测试全部通过。新增提取规则或修改补丁格式时，必须同时补测试。

### 7.4 修改文案/补丁的流程

1. 更新词典或手工补丁。
2. 运行 `check --strict` 和 `apply --strict`。
3. 运行 `npm test`。
4. 在 `/tmp/upstream` 中执行 Bun 构建。
5. 如涉及运行时文案，启动实际镜像检查关键页面。
6. 提交前确认 `git diff` 只包含预期文件。

## 8. 接手指南

### 8.1 第一天

1. 阅读根 `README.md` 的部署部分，按 Compose 启动一次。
2. 阅读本文件第 2、3 节，理解“词典 + 补丁 + 官方镜像”的结构。
3. 运行 `npm ci && npm test`，确认本地环境。
4. 下载固定上游源码，跑一遍 `check` 和 `apply`。
5. 检查 Actions 最近运行记录、GHCR 包可见性、Release 附件。

### 8.2 发布前检查清单

- [ ] `main` 工作区干净，最新提交已推送。
- [ ] `npm test` 通过。
- [ ] `check --strict` 0 缺失、0 失效、0 重复。
- [ ] `apply --strict` 无手工补丁/结构补丁缺失。
- [ ] Bun 构建通过。
- [ ] 上游基础镜像存在且支持双架构。
- [ ] Compose 使用固定版本标签，不是 `latest`。
- [ ] `JWT_SECRET` 已设置，`data/` 已备份。
- [ ] 发布后检查镜像 digest、Release 附件和实际页面。

### 8.3 权限与账号

- 需要仓库写权限才能推送 `main` 和创建 Release。
- 需要 GHCR 写权限才能发布镜像。
- 需要 Actions 权限才能修改工作流和 Secrets。
- 接手时确认原维护者是否仍持有这些权限，避免发布中断。
- 不要共享个人 token；优先使用 fine-grained PAT，并设置过期时间。

### 8.4 需要避免的操作

- 不要把 `.env`、`data/`、日志或 token 提交到仓库。
- 不要直接用 `latest` 做长期生产部署。
- 不要在上游源码目录直接运行 `apply.mjs`；它只能操作临时副本。
- 不要删除 `removed` 词条来“清理”词典，否则上游恢复文案时会丢失译文。
- 不要绕过 `--strict` 发布；漏翻或补丁失效会静默进入镜像。
- 不要强推 `main`。

## 9. 风险登记

| 风险 | 影响 | 概率 | 缓解 |
| --- | --- | --- | --- |
| 上游页面结构大改 | 提取遗漏或补丁失效 | 中 | 严格检查、手工补丁、发布前冒烟测试 |
| 上游基础镜像 tag 不存在 | 构建失败 | 中 | 发布前预检，保留上一个可用 tag |
| 官方镜像停止维护 | 无法继续基于它构建 | 低 | 评估自建运行环境，保留回滚版本 |
| GHCR 权限/可见性变化 | 用户无法拉取 | 低 | 发布后匿名拉取验证，文档说明登录方式 |
| 同步 PR 不触发检查 | 未检查的翻译被合并 | 中 | 配置 `SYNC_TOKEN`，开启分支保护 |
| 翻译术语不一致 | 体验下降 | 中 | 术语表、人工审查、后续术语测试 |
| 依赖/action 过期 | 构建警告或失败 | 高 | Dependabot、季度维护 |
| 镜像漏洞 | 安全风险 | 中 | 定期重建、漏洞扫描、最小权限运行 |

## 10. 决策记录（ADR 摘要）

1. **ADR-001：使用源码词典而非编译后替换。** 原因：可审查、可复用、可跟进上游；后果：需要维护提取器和补丁。
2. **ADR-002：基于官方镜像构建。** 原因：复用复杂转换依赖，降低跨架构风险；后果：受上游镜像标签和生命周期影响。
3. **ADR-003：不做自动 LLM 翻译。** 原因：质量、术语一致性和可复现性不可控；后果：新文案需要人工处理。
4. **ADR-004：中文单语。** 原因：上游不是完整 i18n 应用，运行时切换成本高；后果：不提供界面语言切换。
5. **ADR-005：独立仓库而非长期 fork。** 原因：减少同步负担，避免分叉；后果：上游大改时需要人工适配。

## 11. 相关文档

- 部署与用户说明：[`../README.md`](../README.md)
- 翻译与词典维护：[`TRANSLATION.md`](TRANSLATION.md)
- 修改说明：[`../NOTICE.md`](../NOTICE.md)
- 许可证：[`../LICENSE`](../LICENSE)
