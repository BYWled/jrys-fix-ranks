<h1 align="center">koishi-plugin-jrys-fix-ranks</h1>

<p align="center">
	为 jrys-fix 的经验和累签天数添加排名功能，支持图片渲染与文本双模式输出。
</p>

<p align="center">
	<a href="https://www.npmjs.com/package/koishi-plugin-jrys-fix-ranks"><img src="https://img.shields.io/npm/v/koishi-plugin-jrys-fix-ranks?style=for-the-badge&logo=npm" alt="npm" /></a>
	<a href="https://github.com/BYWled/jrys-fix-ranks"><img src="https://img.shields.io/github/stars/BYWled/jrys-fix-ranks?style=for-the-badge&logo=github" alt="GitHub Stars" /></a>
	<a href="https://github.com/BYWled/jrys-fix-ranks/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="MIT License" /></a>
</p>

<p align="center">
	<a href="https://gitee.com/BYWled/koishi-plugin-jrys-fix-ranks"><img src="https://img.shields.io/badge/Gitee-代码镜像-C71D23?style=for-the-badge&logo=gitee&logoColor=white" alt="Gitee Mirror" /></a>
  <a href="https://gitcode.com/BYWled/koishi-plugin-jrys-fix-ranks"><img src="https://img.shields.io/badge/GitCode-代码镜像-2962FF?style=for-the-badge" alt="GitCode Mirror" /></a>
</p>

<p align="center">
	<a href="https://github.com/BYWled/jrys-fix-ranks">GitHub</a> ·
	<a href="https://gitee.com/BYWled/koishi-plugin-jrys-fix-ranks">Gitee</a> ·
  <a href="https://gitcode.com/BYWled/koishi-plugin-jrys-fix-ranks">GitCode</a>
</p>

> 版本：**2.1.0**

## ✨ 特性

- **🖼️ 图片 / 文本双模式**：
  - **图片模式**：基于 puppeteer 渲染精美排行卡片，包含段位徽章、等级进度、色彩标识等细节。
  - **文本模式**：使用字符表格排版排行榜，无需 puppeteer 也能正常使用。
- **📊 双排行榜**：
  - 经验值排行榜：按累计经验排序，显示段位、升级进度与前后等级信息。
  - 签到天数排行榜：按累计签到天数排序，同时显示当前段位。
- **🏷️ 段位系统**：
  - 在插件配置中直接定义等级列表，与 jrys-fix 使用相同的段位数据格式。
  - 显示当前段位名称、前后等级提示、距离下一级所需经验。
- **👤 昵称解析**：
  - 自动优先显示用户昵称，其次用户名，兜底显示原始 ID。
  - 支持频道隔离——仅显示当前频道内的用户排名。

## 📦 依赖

本插件需要以下服务：

- `database`：**必需** — 用于读取 jrys-fix 的签到数据和用户昵称数据。
- `puppeteer`：**可选** — 用于图片模式渲染排行卡片；未安装时自动回退到文本模式。

前置插件：

- [`koishi-plugin-jrys-fix`](https://github.com/CatKoishi/koishi-plugin-jrys-fix)：签到插件本体，提供经验与签到天数数据。

## 🎮 指令说明

以下指令名可在配置项中自定义。

- **`jrysranks`**（默认）
  - 查看经验值排行榜。
  - 显示段位名称、经验值、升级进度和前后等级信息。

- **`jrysranksign`**（默认）
  - 查看累计签到天数排行榜。
  - 显示签到天数和当前段位。

## 🔧 配置项

可以在 Koishi 控制台的插件配置页进行设置：

### 基础设置

| 配置项         | 类型    | 默认值         | 说明                                                          |
| -------------- | ------- | -------------- | ------------------------------------------------------------- |
| `limit`        | number  | `10`           | 排行榜显示的最大条目数（1-100）                               |
| `expCommand`   | string  | `jrysranks`    | 经验排行榜命令名                                              |
| `signCommand`  | string  | `jrysranksign` | 签到天数排行榜命令名                                          |
| `imageMode`    | boolean | `true`         | 是否使用图片模式渲染（需要 puppeteer）                        |
| `syncLevelSet` | boolean | `true`         | 自动从 jrys-fix 插件同步等级配置（启用后将忽略下方 levelSet） |

### 显示设置

| 配置项                  | 类型    | 默认值 | 说明                           |
| ----------------------- | ------- | ------ | ------------------------------ |
| `next_ExpDisplay`       | boolean | `true` | 是否在排行榜中显示升级所需经验 |
| `pre_next_LevelDisplay` | boolean | `true` | 是否在排行榜中显示前后等级信息 |
| `borderwidth`           | number  | `14`   | 文本模式边框宽度               |

### 等级配置

| 配置项     | 类型  | 默认值 | 说明                                            |
| ---------- | ----- | ------ | ----------------------------------------------- |
| `levelSet` | array | `[]`   | 等级配置列表，仅在 syncLevelSet 为 false 时有效 |

**注**：

- 当 `syncLevelSet` 为 `true`（默认）时，插件会自动从 `jrys-fix` 插件的配置中读取等级列表，下方 `levelSet` 配置将被忽略。
- 当 `syncLevelSet` 为 `false` 时，需要在 `levelSet` 配置项中手动添加等级列表。

`levelSet` 数组中每项包含：

- `level`：等级编号
- `levelExp`：该等级所需最低经验值
- `levelName`：等级名称
- `levelColor`：等级颜色（十六进制色值）

## 💡 常见问题

**Q：段位数据从哪里配置？**

A：有两种方式配置段位数据：

1. **自动同步**（推荐）：启用 `syncLevelSet` 选项（默认已启用），插件会自动从 `jrys-fix` 插件读取等级配置，无需额外配置。
2. **手动配置**：关闭 `syncLevelSet` 选项，在 `levelSet` 项中手动添加等级列表。每个等级包含编号、经验要求、名称和颜色。

---

**Q：排行榜为什么不显示段位？**

A：请检查以下几点：

1. 确保 `jrys-fix` 插件已正确安装并启用。
2. 如果 `syncLevelSet` 为 `true`，检查 `jrys-fix` 插件是否已配置等级列表。
3. 如果 `syncLevelSet` 为 `false`，检查 `levelSet` 配置项是否已正确填写。
4. 如果以上都无问题，排行榜将只显示经验值 / 签到天数，不显示段位信息。

---

**Q：为什么排行榜显示 "当前频道暂无数据"？**

A：插件会根据当前频道筛选用户。如果启用了 `username` 数据库（`koishi-plugin-jrys-fix` 会创建此表），则只显示当前频道内签到过的用户。

---

**Q：图片模式渲染失败怎么办？**

A：确保 `puppeteer` 服务已正确安装并启动。如果仍然失败，插件会自动回退到文本模式输出。你也可以在配置中将 `imageMode` 设为 `false` 来直接使用文本模式。

## 📝 更新日志

- **2.1.1**：
  - fix：修复了潜在的报错。

- **2.1.0**：
  - docs：完善代码注释，添加元素和渲染逻辑。
  - style：优化 html 模板结构，使其页面布局更简洁、易读、美观。

- **2.0.0**：
  - feat：新增 `syncLevelSet` 配置选项，支持自动从 jrys-fix 插件同步等级配置。
  - refactor：段位配置改为插件自身的配置项，不再依赖读取其他插件的 koishi.yml 配置，提升健壮性。
  - fix：修复 HTML 模板在某些环境下的路径引用问题。
  - docs：重写自述文件。

- **1.2.2**：
  - href：更新插件相关链接和信息。

---

**开发者**：BYWled
**仓库**：`koishi-plugin-jrys-fix-ranks`
