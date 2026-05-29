# 🍜 全球快餐大全 · EverydayRecipe

> 每天不知道吃啥？随机选一道，按蛋白质筛选，收藏、加购物清单、云端跨设备同步。
> Can't decide what to eat today? Roll the dice, filter by protein, favorite dishes, build a shopping list — all synced across devices.

**在线体验 / Live demo:** https://lemonaderrrrr.github.io/EverydayRecipe/

---

## ✨ 功能 / Features

- **9 大类菜谱** —— 汉堡、三明治、卷、饭、面/粉、粥/汤饭、包/饺/点心、串/小吃、甜品，覆盖几十个国家，内置 100+ 道。
- **按蛋白质筛选** —— 🐷猪 / 🐔鸡 / 🐄牛 / 🐟鱼虾 / 🥚蛋 / 🫛豆腐素，以及「🍲混合」。
- **🎲 随机选一道** —— 选择困难症救星。
- **♥ 收藏** —— 收藏喜欢的菜，可一键把全部收藏的材料加入买菜清单。
- **🛒 买菜清单** —— 加 / 勾 / 删，自动拆分菜谱材料、去掉分量与「或」后缀。
- **✨ AI 一句话加菜** —— 一句话描述，自动生成菜名、材料和蛋白质标签（见下方说明）。
- **☁️ 云同步** —— 邮箱 / Google 登录，收藏、自定义菜谱、买菜清单跨设备同步。
- **📱 响应式** —— 手机单列 / 平板两列 / 桌面三列。

> **EN:** 9 categories spanning dozens of countries (100+ built-in dishes), protein filters, a "roll the dice" picker, favorites, an auto-built shopping list, one-sentence AI recipe generation, and cloud sync via email / Google login. Fully responsive.

## 🛠 技术栈 / Tech stack

- 纯原生 **HTML / CSS / JavaScript**，无框架、无构建步骤、无 `package.json`。
- [Supabase](https://supabase.com/)（通过 CDN 引入 `@supabase/supabase-js@2`）—— 邮箱密码登录、Google OAuth、云端数据同步。
- AI 加菜通过 `fetch` 调用 Anthropic Messages API。
- 字体：Google Fonts（Noto Serif SC / Noto Sans SC）。

## 📁 项目结构 / Project structure

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构。头部引入 Supabase CDN + `styles.css`；结尾按 `data.js` → `app.js` 顺序加载脚本。 |
| `styles.css` | 全部样式。 |
| `data.js` | 菜谱数据与分类定义（`BUILTIN` / `formats` / `formatOrder` / `pInfo` / `PSET`）。加菜只动这里。 |
| `app.js` | 全部逻辑（登录/同步、渲染、筛选、收藏、买菜清单、AI 加菜）。 |

> ⚠️ `data.js` / `app.js` 是普通脚本（非 ES module），靠共享全局作用域互访，**加载顺序必须** supabase → `data.js` → `app.js`。

## 🚀 本地运行 / Local development

直接用 `file://` 打开 `index.html` 可能加载不了同目录的 js，请起一个本地服务器：

```bash
python -m http.server 8000
# 然后打开 http://localhost:8000
```

## ☁️ 部署 / Deployment

部署在 **GitHub Pages**（分支 `main`，根目录）。入口文件必须是仓库根目录的 `index.html`。

Supabase 需在后台准备：
- 表 `public.user_data(user_id uuid pk, favorites jsonb, customs jsonb, cart jsonb, updated_at)`，开启 RLS 并配置「只能读写自己行」的策略。
- Auth 开启邮箱登录、配置 Google OAuth；URL Configuration 指向线上地址。
- 项目 URL 与 **anon public key** 写在 `index.html` 顶部常量里（anon key 可公开）。

更多细节见 [`CLAUDE.md`](CLAUDE.md)。

## 🤖 关于 AI 加菜 / About the AI feature

「✨ 一句话加菜谱」需要浏览器能直连 Anthropic API，**仅在能直连的环境（如 Claude 预览）有效**；部署到 GitHub Pages 后浏览器无法直接调用，会提示「网络不可用」。线上启用需自建后端代理（如 Supabase Edge Function / Cloudflare Worker）。登录、收藏、买菜清单的云同步在 GitHub Pages 上正常工作。

## 📄 许可证 / License

[MIT](LICENSE) © 2026 Lemonaderrrrr
