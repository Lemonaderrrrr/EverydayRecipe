# 导出 / 导入 JSON 备份 —— 设计文档

> 日期：2026-05-28 · 待办池 A 项 · 状态：已批准设计

## 目标

给 EverydayRecipe 加一个**无后端的数据备份/搬家**功能：把用户的收藏、自定义菜、买菜清单导出成一个 `.json` 文件，并能从该文件导入（合并）回来。即使不依赖 Supabase 账号，也能手动备份和跨账号迁移数据。

保持现有约束：纯原生 HTML/CSS/JS、零构建、零依赖、文案全中文、4 文件结构（逻辑进 `app.js`、样式进 `styles.css`、结构进 `index.html`），脚本仍为非 module。

## 范围

备份/恢复的是用户的三份可变数据：

- `favs`：收藏（`Set<string>`，存的是菜名）
- `customRecipes`：AI/手动生成的自定义菜数组
- `cart`：买菜清单数组

**不**备份内置 `BUILTIN` 菜谱（它是代码的一部分，不属于用户数据）。

## 交互入口：用户名下拉菜单

当前 `index.html:36` 的 `#userChip` 是一个按钮，点击直接退出登录。本功能把它改成一个可展开的小菜单：

```
👤 用户名 ▾
 ├─ ⬇ 导出备份
 ├─ ⬆ 导入备份
 └─ 退出登录
```

- 点击 chip 切换菜单展开/收起；点菜单外区域收起。
- 「退出登录」收进菜单内（不再在 chip 上直接触发），避免误触退出。
- 菜单仅在登录后可见（chip 本身 `display:none` 直到登录）。因此该功能绑定登录状态，符合「备份的是会云端同步的那三份数据」。

## 导出机制

点「导出备份」：

1. 组装备份对象：

   ```json
   {
     "app": "EverydayRecipe",
     "version": 1,
     "exportedAt": "<ISO 时间戳>",
     "favorites": ["菜名1", "菜名2"],
     "customs": [ { "id": "...", "cat": "custom", "sub": "...", "flag": "⭐", "name": "...", "en": "...", "p": ["..."], "ing": "...", "custom": true } ],
     "cart": [ { "id": 123, "text": "...", "done": false } ]
   }
   ```

2. `JSON.stringify` → `Blob(['...'], {type:'application/json'})` → `URL.createObjectURL` → 触发一个临时 `<a download>` 点击 → `URL.revokeObjectURL`。
3. 文件名：`everydayrecipe-backup-YYYY-MM-DD.json`（日期取本地当天）。

## 导入机制（合并）

点「导入备份」：

1. 触发一个隐藏的 `<input type="file" accept="application/json,.json">`（复用单个隐藏 input，每次 `click()` 前清空 `value`）。
2. 选文件后用 `FileReader.readAsText` 读取 → `JSON.parse`。
3. **校验**：必须是对象，且 `app === 'EverydayRecipe'`（或退一步：含 `favorites`/`customs`/`cart` 任一数组字段）。不合法 → toast「文件格式不对」，不动任何数据，直接返回。
4. **合并**（永不丢失已有数据）：

   | 数据 | 合并规则 | 理由 |
   | --- | --- | --- |
   | `favorites` | Set 并集，按菜名去重 | 收藏本就是名字集合 |
   | `customs` | 按 `id` 去重后追加；`id` 已存在则跳过 | 不覆盖已有自定义菜 |
   | `cart` | 按 `text` 去重（沿用现有 `addCartItem` 逻辑），新项 `done=false` | 与手动加购物清单一致 |

   合并时统计每类新增了几条。

5. 合并后：`saveFavs()`/`saveCustom()`/`saveCart()`（或直接置位后调 `persist()`）推到 Supabase；重渲染列表 `render()` 与购物车角标；提示「已导入：收藏 +N，自定义菜 +M，清单 +K」。

   > 现有代码没有通用 toast（只有 `#diceResult` 那一处文字），所以本功能要新增一个轻量 toast：一个固定定位的 `<div>`，`app.js` 里 `showToast(msg)` 显示后 2~3 秒淡出。导出成功、导入成功、格式错误都用它。

## 错误处理

- 文件读取失败 / 非合法 JSON / 不是本 app 备份 → toast「文件格式不对」，不修改任何状态。
- 备份里某字段缺失或类型不对（如 `favorites` 不是数组）→ 该字段当空处理，其余字段照常合并。
- 导入是纯增量合并，无破坏性操作，无需二次确认。

## 落点（文件改动）

- `index.html`：把 `#userChip` 包进一个菜单容器，新增下拉菜单的三个菜单项 + 一个隐藏的文件 `<input>`。
- `styles.css`：下拉菜单的样式（定位在 chip 下方、收起/展开、菜单项 hover）+ `showToast` 的样式。
- `app.js`：菜单开合逻辑、导出函数、导入+合并函数、新增 `showToast(msg)` 轻量提示。
- 退出登录逻辑从 chip 的点击迁移到菜单项的点击。

## 非目标 / 明确不做

- 不做「覆盖式」导入（只合并）。
- 不做导入预览/diff。
- 不备份内置菜谱或 UI 设置。
- 不引入任何库（如文件保存库），全部用浏览器原生 API。
