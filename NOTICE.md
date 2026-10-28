# NOTICE

本项目是 [C4illin/ConvertX](https://github.com/C4illin/ConvertX) 的第三方简体中文汉化版本，与上游项目及其作者没有隶属或背书关系。

- 上游项目：ConvertX
- 上游作者：C4illin 及贡献者
- 上游许可：GNU Affero General Public License v3.0（AGPL-3.0）
- 本仓库许可：AGPL-3.0，见 `LICENSE`

## 修改说明

构建镜像时，本仓库会对固定版本的上游源码应用以下修改：

1. 将 `src/` 与 `public/` 中的界面文案替换为简体中文。
2. 将页面 `<html lang>` 设置为 `zh-CN`，并把默认 `LANGUAGE` 设置为 `zh`。
3. 在页脚添加指向本仓库的“非官方简体中文汉化版 · 源码”链接。
4. 在结果页和历史记录页显示中文状态文本，底层状态值不变。
5. 汉化历史记录页内联脚本中的确认、提示信息，以及上传组件的动态文案。

具体替换内容以构建时的 `zh/zh-CN.json`、`zh/manual-patches.json` 和 `zh/lib/apply.mjs` 为准。

## 对应源码

每个发布版本都会在 Releases 中附带 `convertx-zh-<上游版本>-source.tar.gz`，其中包含：

- 已应用汉化补丁的上游源码；
- 本仓库的 `zh/` 覆盖层；
- `LICENSE`、`NOTICE.md` 和本说明对应的 README。

镜像标签与源码对应关系记录在 `zh/upstream.json` 与 GitHub Release 中。
