# Sparkle

[English](README.md) · 简体中文

轻量的 Obsidian 灵感记录插件，将想法写入当前笔记或当天日记。需要 Obsidian 1.13.0 或更新版本。

## 功能

- 快速记录弹窗、连续记录页面、常驻侧边面板。
- 随时切换当前笔记与今日日记，复用 Daily notes 或 Periodic Notes 设置。
- Markdown 正文、精确到秒的时间、已有标签自动补全。
- 图片选择、粘贴、拖入。默认存于目标笔记同目录的 `assets/`，日记使用 `assets/{date}/`。
- 地理位置：手机授权获取当前位置，或手动输入坐标，可填写地点名称。
- 自定义记录小节标题、插入顺序和图片目录。
- 本地草稿、适配手机软键盘的布局、中英文界面。

## 项目原则

- 减少记录步骤，保持界面简洁。
- 优先复用 Obsidian 自身能力和其他插件已实现的功能。
- 功能保持简单，专注记录；查询、统计、地图及更多用法交给 Bases、DataviewJS、Map View 等工具。
- 记录使用普通 Markdown，附件保存在 vault 内。

## 使用

1. 运行 **Sparkle: 快速记录灵感** 或 **Sparkle: 连续记录**。
2. 选择 **当前笔记** 或 **今日日记**，输入内容。
3. 点击 **记录**，或按 `Ctrl / ⌘ + Enter`。

工具栏可添加图片、位置和标签，输入 `#` 可补全标签。**设置 → Sparkle** 修改后自动保存，也可点击 **恢复默认值**。日记模式需启用 Daily notes 或 Periodic Notes。

## 安装

将 `main.js`、`manifest.json` 和 `styles.css` 放入 vault 的 `.obsidian/plugins/sparkle/` 目录，然后在第三方插件中启用 Sparkle。

## 许可证

[MIT](LICENSE)。
