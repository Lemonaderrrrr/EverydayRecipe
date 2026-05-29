# EverydayRecipe / 全球快餐大全

一个全球快餐浏览网页应用，中文界面，部署在 GitHub Pages，用 Supabase 做登录和云同步。**原生 HTML/CSS/JS，无框架、无构建步骤、无 package.json。**

## 文件结构（4 个文件，需一起部署到仓库根目录）
- `index.html` —— 只有 HTML 结构。头部引入 Supabase CDN + `styles.css`；body 结尾按顺序加载 `data.js` → `app.js`。
- `styles.css` —— 全部样式。
- `data.js` —— 菜谱数据与分类定义（`BUILTIN`、`formats`、`formatOrder`、`pInfo`、`PSET`）。加菜/改分类只动这里。
- `app.js` —— 全部逻辑（Supabase 登录/同步、渲染、筛选、收藏、买菜清单、AI 加菜）。
- 注意：`data.js`、`app.js` 是普通脚本（非 module），靠共享的全局作用域互相访问；加载顺序必须 **supabase → data.js → app.js**，别改成 type="module"，否则顶层 const 不再共享。
- 本地用 `file://` 直接打开可能加载不了同目录 js，请用 GitHub Pages 网址，或本地跑 `python -m http.server` 再开 localhost。

## 技术栈
- 纯原生 HTML / CSS / JavaScript，无框架。
- Supabase（通过 CDN 引入 `@supabase/supabase-js@2`）负责：邮箱密码登录、Google OAuth 登录、云端数据同步。
- AI「一句话加菜谱」通过 `fetch` 调用 `https://api.anthropic.com/v1/messages`（model: `claude-sonnet-4-20250514`）。
- 字体用 Google Fonts（Noto Serif SC / Noto Sans SC）。

## 数据模型（都在 index.html 的 `<script>` 里）
- `BUILTIN`：内置菜谱数组，约 100+ 道。每项字段：
  `{ cat, sub, flag, name, en, p:[蛋白质数组], ing:'材料，用、分隔' }`
- `formats`：一级大类定义（custom/burger/sandwich/wrap/rice/noodle/congee/bundump/snack/dessert），含 emoji、名称、描述。`formatOrder` 控制顺序。
- 蛋白质集合 `PSET = ['pork','chicken','beef','sea','egg','tofu']`，`p` 长度≥2 视为「混合」。
- 每个用户的可变数据：`favs`(收藏，Set)、`customRecipes`(AI 生成的菜)、`cart`(买菜清单)。
  这三样合并存到 Supabase 表 `user_data`（按 user_id 一行），通过 `syncUp()` / `loadData()` 同步，`persist()` 做防抖上传。

## Supabase 配置（已在后台做好）
- 表 `public.user_data(user_id uuid pk, favorites jsonb, customs jsonb, cart jsonb, updated_at)`，已开启 RLS，三条策略限制「只能读写自己的行」。
- Auth：邮箱登录已开、Confirm email 已关；Google OAuth 已配（Google Cloud 的 redirect URI 指向 `https://<project>.supabase.co/auth/v1/callback`）。
- URL Configuration 的 Site URL / Redirect URLs 指向 GitHub Pages 网址。
- 项目 URL 和 anon public key 直接写在 index.html 顶部常量里（anon key 可公开，安全）。

## 主要功能
- 按蛋白质筛选 + 「♥ 我的收藏」视图（收藏可一键全加入买菜清单）。
- 「🎲 随机选一道」。
- 买菜清单（加/勾/删、自动去掉分量和「或」后缀），云同步。
- 每张卡片可收藏、加入买菜清单；自定义菜可删除。
- 桌面三列 / 平板两列 / 手机单列的响应式网格。

## 已知约束 / 注意
- **AI 加菜只在能直连 Anthropic API 的环境（如 Claude 预览）有效**；部署到 GitHub Pages 后浏览器无法直接调用，会报「网络不可用」。要在线上用需自建后端代理。
- 部署文件名必须是 `index.html` 放仓库根目录，否则 GitHub Pages 只显示 README。
- 改完后浏览器要硬刷新（Ctrl+Shift+R）清缓存。

## 约定
- 界面文案全部中文。
- 刻意保持零依赖、零构建（纯静态 + CDN）。要引入构建工具/打包器/框架前先问我。
- 已拆成 index.html / styles.css / data.js / app.js 四个文件；保持这个结构，别合并回单文件，也别改成 ES module。

## 可能的下一步（待办池）
- 加「导出/导入 JSON」做无后端的数据备份/搬家。
- 给 AI 加菜配一个后端代理（如 Supabase Edge Function / Cloudflare Worker），让线上也能用。
- 宽屏可选四列；卡片悬停效果。
- 菜谱数据已抽到 data.js（可考虑进一步改成独立 JSON 文件按需加载）。
- 加「按国家/地区」第二维筛选。
