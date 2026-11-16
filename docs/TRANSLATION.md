# 翻译与文案维护指南

> 适用版本：`v0.20.0-zh`；配套文档：[技术交接文档](TECHNICAL.md)

本指南面向负责翻译、校对和维护 `zh/zh-CN.json` 的人。项目不使用运行时 i18n 框架，而是在构建阶段把中文写回上游源码，因此每一条翻译都必须能精确定位、可重复应用。

## 1. 文件与职责

| 文件 | 是否手工编辑 | 说明 |
| --- | --- | --- |
| `zh/zh-CN.json` | 是 | 唯一翻译来源 |
| `zh/manual-patches.json` | 是 | 无法用词典表达的结构/动态文案补丁 |
| `zh/config.json` | 少量 | locale、默认语言、源码链接 |
| `zh/upstream.json` | 升级时 | 上游版本和基础镜像 |
| `zh/sync-report.md` | 否 | `sync.mjs` 自动生成 |
| `zh/glossary.json` | 已移除 | 术语表已并入本文档，避免维护两份 |

## 2. 词典状态机

每条词条只有三种状态：

| 状态 | 含义 | 是否会应用到源码 |
| --- | --- | --- |
| `todo` | 已提取，等待翻译 | 否 |
| `translated` | 已有中文译文 | 是 |
| `removed` | 上游已删除该文案 | 否，但保留记录 |

规则：

- 新提取的文案默认为 `todo`，`target` 为空。
- 翻译后填写 `target`，并把 `status` 改为 `translated`。
- 上游删除文案时，`sync.mjs` 自动改为 `removed`，不要手工删除。
- 上游恢复同一文案时，`sync.mjs` 会自动恢复为 `todo`，已有译文仍保留。
- `check.mjs --strict` 会把 `todo`、空 `target`、失效词条和重复词条视为失败。

## 3. 词条结构与 key

```json
{
  "file": "src/pages/results.tsx",
  "context": "jsx:button",
  "source": "Download",
  "occurrence": 2,
  "kind": "jsxText",
  "target": "下载",
  "status": "translated"
}
```

- `file`：相对上游根目录的路径。
- `context`：文案所在位置，常见值：
  - `jsx:h1`、`jsx:button`、`jsx:label`：JSX 文本。
  - `attr:placeholder`、`attr:title`、`attr:aria-label`、`attr:error`：JSX 属性。
  - `assignment:textContent`、`assignment:innerHTML`：`public/*.js` 中的赋值。
  - `call:alert`、`call:confirm`、`call:prompt`：浏览器对话框。
  - `html:text`、`html:title`：模板字符串中的 HTML。
- `source`：归一化后的英文原文，连续空白会折叠为一个空格。
- `occurrence`：同一文件、上下文、原文的第几次出现，从 1 开始。
- `kind`：写回方式，通常不需要手工修改。
- `target`：中文译文，不要包含首尾多余空白。

主键是 `file + context + source + occurrence`，不是行号。不要手工改 `file/context/source/occurrence`，否则会被当成新词条。

## 4. 新增文案的完整流程

```bash
# 1. 下载固定上游版本
TAG="$(jq -r .version zh/upstream.json)"
mkdir -p /tmp/upstream
curl -fsSL "https://github.com/C4illin/ConvertX/archive/refs/tags/${TAG}.tar.gz" \
  | tar -xz --strip-components=1 -C /tmp/upstream

# 2. 合并新文案
node zh/sync.mjs /tmp/upstream --version "$TAG"

# 3. 编辑 zh/zh-CN.json 中 status=todo 的条目
#    填写 target，并把 status 改为 translated

# 4. 严格检查
node zh/check.mjs /tmp/upstream --strict
node zh/apply.mjs /tmp/upstream --strict \
  --source-url "https://github.com/MaroD1M/convertx-zh"

# 5. 回归测试与构建
npm test
cd /tmp/upstream
bun install --frozen-lockfile
bun run build
```

只改文案时，至少运行 `check --strict`、`apply --strict` 和 `npm test`。涉及结构补丁或提取规则时，必须再跑 Bun 构建。

## 5. 翻译原则

### 5.1 准确优先

- 先理解界面上下文，再决定词义，不要逐词直译。
- 按钮用动词或动宾短语，例如 `Download` → `下载`，`Convert` → `转换`。
- 状态用简洁名词/形容词，例如 `Done` → `完成`，`pending` → `处理中`。
- 错误提示要说明“发生了什么”和“下一步怎么做”。

### 5.2 术语一致

- 同一英文词在不同页面尽量使用同一译法。
- 文件格式名、扩展名、产品名保持原文。
- 不要翻译代码、URL、API 字段、环境变量、命令行参数。
- 中文与英文/数字之间按中文排版习惯留空格，例如 `上传 3 个文件`。
- 标点使用中文全角；代码片段、路径、格式名内部保持原样。

### 5.3 长度与布局

- 按钮和标签尽量简短，避免中文过长导致换行或溢出。
- 不确定布局时，优先保持与英文相近的长度。
- 不要为了“完整”在按钮里加入解释性长句，说明放到提示或帮助文本。

### 5.4 不要翻译的内容

- `ConvertX`、`FFmpeg`、`LibreOffice`、`Calibre`、`Pandoc` 等产品名。
- 文件格式：`PDF`、`DOCX`、`PNG`、`MP4`、`SVG` 等。
- URL、邮箱、路径、MIME 类型、HTTP 状态码。
- 代码标识符、环境变量、API 字段、日志级别。
- 第三方工具自身输出的错误信息。

## 6. 术语表

### 6.1 保持原文

```text
ConvertX, FFmpeg, LibreOffice, Inkscape, Calibre, Pandoc,
ImageMagick, GraphicsMagick, Assimp, Potrace, VTracer, Vips,
libjxl, libheif, XeLaTeX, DjVuLibre, Dasel, Markitdown,
msgconvert, dvisvgm, pdftops, resvg, JWT, Cookie, Docker,
GitHub, API
```

### 6.2 推荐译法

| 英文 | 中文 |
| --- | --- |
| Convert | 转换 |
| Conversion | 转换 |
| Upload | 上传 |
| Download | 下载 |
| History | 历史记录 |
| Account | 账户 |
| Logout | 退出登录 |
| Login | 登录 |
| Register | 注册 |
| Email | 邮箱 |
| Password | 密码 |
| Delete | 删除 |
| Status | 状态 |
| Actions | 操作 |
| Results | 转换结果 |
| Settings | 设置 |
| Setup | 设置 |

新增术语时，先查本表；确定后补充到本表，保持全项目一致。

## 7. 手工补丁政策

只有以下情况使用 `manual-patches.json`：

- 文案由多个动态值拼接，无法作为独立字符串提取。
- 状态值来自后端枚举，需要运行时映射。
- 文案位于内联脚本或模板字符串中，提取器无法安全定位。
- 结构需要少量修改，例如页脚、`lang`、默认语言。

补丁要求：

- `find` 必须是文件中真实存在、足够唯一的字面量片段。
- `replace` 必须保留原有的变量、模板表达式、引号和标签结构。
- 每个补丁写清 `reason`，方便上游变化时判断如何修。
- 不要用宽泛的短词做 `find`，否则可能误替换多处。
- 上游改动导致 `find` 找不到时，`apply --strict` 必须失败，不能静默跳过。

## 8. 常见问题

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `check` 报“未翻译/缺失” | 新文案没有 `translated` 译文 | 翻译 `todo` 条目 |
| `check` 报“失效词条” | 词典有、源码没有 | 运行 `sync.mjs`，或确认是否误改 key |
| `check` 报“重复词条” | 同一 key 出现两次 | 合并为一条，保留正确译文 |
| `apply` 报“手工补丁缺失” | 上游改了目标代码 | 更新 `find/replace`，重跑严格检查 |
| `apply` 报“结构补丁缺失” | 上游改了 `base.tsx` 或 `env.ts` 结构 | 调整结构补丁并补测试 |
| 页面出现英文 | 该文案未被提取，或走了动态路径 | 检查是否需要新规则/手工补丁 |
| 页面出现乱码/语法错误 | 替换破坏了引号或模板表达式 | 回滚，改用更精确的补丁 |
| 中文太长导致布局问题 | 译文过长 | 缩短文案，优先保留操作含义 |

## 9. 质量检查清单

- [ ] `node zh/check.mjs /tmp/upstream --strict` 通过。
- [ ] `node zh/apply.mjs /tmp/upstream --strict` 无缺失。
- [ ] `npm test` 通过。
- [ ] Bun 构建通过。
- [ ] 新增术语已补入本文档。
- [ ] 没有翻译代码、URL、格式名或环境变量。
- [ ] 按钮/标签长度可接受。
- [ ] 手工补丁有 `reason`，且 `find` 足够精确。
- [ ] `git diff` 只包含预期的词典/补丁/文档变更。

## 10. 禁止事项

- 不要删除 `removed` 词条来“清理”词典。
- 不要手工修改 `occurrence` 来强行匹配。
- 不要用正则或模糊匹配替代精确补丁。
- 不要把英文原文直接留作 `target` 来通过检查。
- 不要绕过 `--strict` 发布。
- 不要在 `zh/sync-report.md` 中手工维护内容，它会被覆盖。
