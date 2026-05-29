# AI 加菜后端代理 设计文档

**日期:** 2026-05-29
**目标:** 给「✨ 一句话加菜谱」配一个后端代理，让部署到 GitHub Pages 的线上站点也能用 AI，同时把 Anthropic API key 藏在服务端、并把调用限制为已登录用户。

## 背景与问题

当前 `app.js` 的 `aiGenerate()`（约第 168–184 行）在浏览器里直接 `fetch("https://api.anthropic.com/v1/messages")`，没有任何 API key、也没有 CORS 许可。这只在 Claude 预览这类能直连 Anthropic 的环境下有效；部署到 GitHub Pages 后，浏览器无法直接调用，必然失败。

要让线上可用，必须有一个服务端代理：它持有 Anthropic key、替前端转发请求，并挡住未授权调用。

## 决策记录

- **托管平台:** Supabase Edge Function（方案 A）。复用项目已有的 Supabase，登录验证、密钥管理、CORS 都在同一后台完成；无需新开账号或手写 JWT 校验。（备选 Cloudflare Worker / Vercel 均需新服务 + 手写 Supabase JWT 验证，已否决。）
- **防滥用门槛:** 仅限登录用户。函数默认开启 `verify_jwt`，没有合法 Supabase token 直接 401。（不加每日频率限制——当前为个人项目，YAGNI；如未来需要再加。）
- **API key:** 用户当前**尚无** Anthropic API key。本设计先完成代码与部署步骤，真实端到端联调待用户拿到 key 并部署后进行。

## 架构与数据流

新增一个名为 `ai-recipe` 的 Supabase Edge Function，是唯一持有 Anthropic key 的地方。

```
浏览器 (app.js)                Edge Function (ai-recipe)         Anthropic
  │                                  │                              │
  │ POST /functions/v1/ai-recipe     │                              │
  │  Authorization: Bearer <登录token>│                              │
  │  apikey: <anon key>              │                              │
  │  { "desc": "韩式甜辣炸鸡" }        │                              │
  ├─────────────────────────────────>│                              │
  │                          ① 验证 JWT（默认开启）                   │
  │                          ② 校验 desc                            │
  │                          ③ 用服务端 key 调 Anthropic             │
  │                                  ├─────────────────────────────>│
  │                                  │<─────────────────────────────┤
  │                          ④ 去围栏 + JSON.parse                   │
  │<─────────────────────────────────┤                              │
  │  { name, en, type, p[], ing }    │                              │
  │ 前端照旧组装 rec 并云同步          │                              │
```

**职责边界:**
- **函数** = 「描述 → 菜谱字段」：JWT 验证、调 Anthropic、解析出干净 JSON。
- **前端** = 「字段 → 我的菜谱对象 + 云同步」：PSET 过滤、组装 `rec`、`saveCustom`、render/flash。现有数据模型组装逻辑全部保留在前端。

## 组件 1：Edge Function `ai-recipe`

**文件:** `supabase/functions/ai-recipe/index.ts`（Deno / TypeScript）。这是独立的后端文件，不影响前端 4 文件（index.html / styles.css / data.js / app.js）的零构建、零依赖、纯静态结构。

**请求契约**（前端 → 函数）:
```
POST /functions/v1/ai-recipe
Authorization: Bearer <Supabase access_token>
apikey: <Supabase anon key>
Content-Type: application/json

{ "desc": "韩式甜辣炸鸡" }
```

**响应契约**（函数 → 前端，已解析好的 5 个字段）:
```json
{ "name": "韩式甜辣炸鸡", "en": "Yangnyeom Chicken", "type": "炸物", "p": ["chicken"], "ing": "鸡腿肉、土豆淀粉、韩式辣酱、蜂蜜、蒜、酱油、芝麻、葱" }
```

**函数内部流程:**
1. 若 `req.method === 'OPTIONS'`，返回 204 + CORS 头（处理预检）。
2. JWT 由 Supabase 网关默认 `verify_jwt` 验证；非法 token 在到达函数前即被 401 拒绝。
3. 解析 body，校验 `desc` 为非空字符串；否则返回 400 `{ error: '缺少描述' }`。
4. 用环境变量 `ANTHROPIC_API_KEY` 调 `https://api.anthropic.com/v1/messages`：
   - `model: "claude-sonnet-4-20250514"`（沿用现有模型，可改一行升级）
   - `max_tokens: 1000`
   - prompt 与现状一致（原样从 app.js 第 172 行搬来）：要求只输出一个 JSON 对象，字段 `name / en / type / p[] / ing`。
5. 若 Anthropic 响应非 2xx，返回 502 `{ error: 'AI 服务出错' }`。
6. 取 `data.content` 拼接文本，去掉 ```json / ``` 围栏，`JSON.parse`：
   - 解析失败 → 502 `{ error: 'AI 返回格式异常' }`。
   - 成功 → 200 `{ name, en, type, p, ing }`（原样透传 Anthropic 给的字段，PSET 过滤交给前端）。
7. 所有响应（含错误）都带 CORS 头。

**CORS 头:**
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: authorization, apikey, content-type
Access-Control-Allow-Methods: POST, OPTIONS
```
（使用 Bearer token 而非 cookie，故 `*` 安全。）

**密钥与配置:**
- `ANTHROPIC_API_KEY` 只存在 Supabase secrets（`supabase secrets set`），公开仓库与前端代码中均不出现。

## 组件 2：前端改动

**修改 `app.js` 的 `aiGenerate()`（第 168–184 行）:**
- 调用前 `const { data:{ session } } = await sb.auth.getSession()`；无 `session` 则 `showLogin()` 并返回。
- `fetch` 目标改为 `${SUPABASE_URL}/functions/v1/ai-recipe`：
  - headers: `Authorization: 'Bearer ' + session.access_token`、`apikey: SUPABASE_KEY`、`Content-Type: application/json`
  - body: `JSON.stringify({ desc })`
- **删除前端的 prompt 字符串**（已搬到函数）。
- 拿到响应后 `const obj = await resp.json()`，沿用现有逻辑：
  - `let p=(Array.isArray(obj.p)?obj.p:[]).filter(x=>PSET.includes(x)); if(p.length===0)p=['tofu'];`
  - 组装 `rec`（`id:'c'+Date.now()`, `cat:'custom'`, `sub:obj.type||'AI 生成'`, `flag:'⭐'`, `name`, `en`, `p`, `ing`, `custom:true`）
  - `customRecipes.unshift(rec); saveCustom();` → 切到「全部」→ `render('all')` → 关闭面板 → flash 高亮。这些全部不变。

**修改 `index.html`:**
- 第 78 行那条「部署到 GitHub Pages 后此功能会失效…」的过时说明，改为：「AI 加菜已通过后端代理支持线上使用。」

## 错误处理

**函数侧:** 400（desc 缺失）、401（默认 JWT 失败，由网关返回）、502（Anthropic 报错或返回无法解析）；每种都带 CORS 头，使前端能读到错误体而非被浏览器拦成 CORS 错误。

**前端侧**（替换现有「网络不可用…请在 Claude 预览里使用」文案）:
- 无 session → `showLogin()`。
- `resp.status === 401` → aiStatus 显示「登录已过期，请重新登录」。
- 其它非 2xx（含 400/502）→「AI 生成失败，请换个描述再试」。
- `fetch` 抛异常（网络）→ catch → 「网络错误，请稍后再试」。

## 测试策略（无测试框架，手动浏览器验证）

部署前可验证：
- 前端 fetch 接线正确（目标 URL、headers、body 结构）。
- 未登录时点 AI 入口被 `showLogin()` 挡住。
- 各错误分支的提示文案正确（可临时 mock 不同 `resp.status`）。

部署后端到端验证（需用户拿到 Anthropic key 并部署）:
1. `supabase functions deploy ai-recipe --project-ref dmrxlnvgwjqiwkjgsgcp`
2. `supabase secrets set ANTHROPIC_API_KEY=...`
3. 登录后输入「韩式甜辣炸鸡」→ 确认生成并加入「⭐ 我的菜谱」、云同步。
4. 退出登录后直接 curl 该函数 → 确认返回 401。

## 文件清单

- **新增:** `supabase/functions/ai-recipe/index.ts` —— Edge Function 本体。
- **修改:** `app.js` —— `aiGenerate()` 改为调代理 + 错误分支；删除前端 prompt。
- **修改:** `index.html` —— 第 78 行说明文案更新。

## 约束遵守

- 前端 4 文件结构不变、不合并、不改 ES module；仍零构建、零依赖、纯静态 + CDN。
- 新增的 `supabase/` 后端目录是独立部署物，不进入前端加载链。
- 界面文案全部中文。

## 非目标（YAGNI）

- 每用户每日调用频率限制（个人项目暂不需要）。
- 流式响应、多轮对话。
- 在 Claude 预览之外的本地 `file://` 直连兜底（不再需要，统一走代理）。
