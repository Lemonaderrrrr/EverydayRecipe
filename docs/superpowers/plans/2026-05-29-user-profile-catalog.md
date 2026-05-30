# 用户画像 + 定制快餐大全 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首次登录做口味测试 → 按画像删减内置菜 + AI 联网生成 ~15 道新菜，混排成一个无缝的个性化「快餐大全」。

**Architecture:** 纯原生 HTML/CSS/JS 四文件（index.html/styles.css/data.js/app.js）+ 新增一个 Supabase Edge Function（`ai-catalog`）。画像与生成菜存进 `user_data` 表新加的两列；客户端按画像做硬约束+辣度+上限删减内置菜，与生成菜、手动菜合并渲染。

**Tech Stack:** 原生 JS（非 module，共享全局作用域）、Supabase JS v2（CDN）、智谱 GLM（`glm-4-flash` + `web_search` 工具）经 Edge Function 代理。无测试框架，验证 = `node --check` 语法检查 + 浏览器冒烟。

**设计文档：** `docs/superpowers/specs/2026-05-29-user-profile-catalog-design.md`

---

## ⚠️ 前置依赖（需用户本人执行，AI 不代跑）

在浏览器冒烟之前，用户必须先在 Supabase SQL 编辑器执行两条 ALTER（否则 `loadData` 查询不存在的列会报错，整个 app 加载失败）：

```sql
alter table user_data add column profile jsonb;
alter table user_data add column generated jsonb;
```

`ai-catalog` Edge Function 实现后，用户还需 `supabase functions deploy ai-catalog` 并确认智谱账号可用 `web_search` 工具。

**因此：** 各任务的实现者用 `node --check` 作为硬性验证门。涉及云同步/生成的浏览器冒烟，是在用户跑完 SQL + 部署后才能完整验证——计划中标注为「用户侧冒烟」。

---

## 文件结构

| 文件 | 职责 | 本计划改动 |
|------|------|-----------|
| `supabase/functions/ai-catalog/index.ts` | **新增**：批量生成 Edge Function（智谱 GLM + 联网） | Task 3 |
| `index.html` | 结构 | Task 4：加 `#quizOverlay`；Task 6：设置面板加「重新测口味」按钮 |
| `styles.css` | 样式 | Task 4：测试页/加载态样式 |
| `data.js` | 数据 + UI 字典 | Task 4：新增测试相关 UI 键 |
| `app.js` | 逻辑 | Task 1：state+云同步；Task 2：profileFilter+渲染；Task 5：测试流程；Task 6：重测 |

---

## Task 1: 云同步加 profile / generated

**Files:**
- Modify: `app.js:47`（state 变量）、`app.js:57-69`（syncUp / loadData）

- [ ] **Step 1: 加两个 state 变量**

把 `app.js:47`：

```js
let userId=null, userEmail=null, favs=new Set(), customRecipes=[], cart=[], currentFilter='all';
```

改为：

```js
let userId=null, userEmail=null, favs=new Set(), customRecipes=[], cart=[], profile=null, generated=[], currentFilter='all';
```

- [ ] **Step 2: syncUp 带上 profile / generated**

把 `app.js` 里 `syncUp()` 的 upsert 那行（约 `app.js:60`）：

```js
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,lang:lang,updated_at:new Date().toISOString()});
```

改为：

```js
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,lang:lang,profile:profile,generated:generated,updated_at:new Date().toISOString()});
```

- [ ] **Step 3: loadData 读取 profile / generated**

把 `app.js` 里整个 `loadData()`（约 `app.js:64-69`）：

```js
async function loadData(){
  const {data,error}=await sb.from('user_data').select('favorites,customs,cart,lang').eq('user_id',userId).maybeSingle();
  if(data){favs=new Set(data.favorites||[]);customRecipes=data.customs||[];cart=data.cart||[];
    if(data.lang==='zh'||data.lang==='en'){lang=data.lang;localStorage.setItem('lang',lang);document.documentElement.lang=(lang==='en')?'en':'zh-CN';applyUI();}}
  else{favs=new Set();customRecipes=[];cart=[];await syncUp();}
}
```

改为：

```js
async function loadData(){
  const {data,error}=await sb.from('user_data').select('favorites,customs,cart,lang,profile,generated').eq('user_id',userId).maybeSingle();
  if(data){favs=new Set(data.favorites||[]);customRecipes=data.customs||[];cart=data.cart||[];profile=data.profile||null;generated=data.generated||[];
    if(data.lang==='zh'||data.lang==='en'){lang=data.lang;localStorage.setItem('lang',lang);document.documentElement.lang=(lang==='en')?'en':'zh-CN';applyUI();}}
  else{favs=new Set();customRecipes=[];cart=[];profile=null;generated=[];await syncUp();}
}
```

- [ ] **Step 4: 语法检查**

Run: `node --check app.js`
Expected: 无输出，退出码 0

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat: 云同步加入 profile 与 generated 字段"
```

---

## Task 2: profileFilter + 收藏豁免

**Files:**
- Modify: `app.js:49`（allRecipes）、`app.js:140-150`（render 中收藏相关）

- [ ] **Step 1: 加 profileFilter 与 fullRecipes，改 allRecipes**

把 `app.js:49`：

```js
function allRecipes(){return customRecipes.concat(BUILTIN);}
```

改为：

```js
const SPICY_KW=['辣','麻','泡菜','咖喱','参巴','sambal','kimchi','curry','chili','jalape'];
function isSpicy(r){const s=((r.name||'')+(r.en||'')+(r.ing||'')+(r.ing_en||'')).toLowerCase();return SPICY_KW.some(k=>s.includes(k));}
function profileFilter(listArr,prof){
  if(!prof)return listArr;
  const avoid=new Set((prof.proteins&&prof.proteins.avoid)||[]);
  const diet=new Set(prof.diet||[]);
  const noSpicy=prof.taste&&prof.taste.spicy===0;
  let out=listArr.filter(r=>{
    const p=r.p||[];
    if(p.some(x=>avoid.has(x)))return false;
    if(diet.has('vegetarian')&&!p.every(x=>x==='tofu'||x==='egg'))return false;
    if((diet.has('no_pork')||diet.has('halal'))&&p.includes('pork'))return false;
    if(diet.has('no_seafood')&&p.includes('sea'))return false;
    if(noSpicy&&isSpicy(r))return false;
    return true;
  });
  const CAP=45;
  if(out.length>CAP){const step=out.length/CAP,s=[];for(let i=0;i<CAP;i++)s.push(out[Math.floor(i*step)]);out=s;}
  return out;
}
function fullRecipes(){return customRecipes.concat(generated, BUILTIN);}
function allRecipes(){return customRecipes.concat(generated, profileFilter(BUILTIN, profile));}
```

- [ ] **Step 2: render 收藏视图用 fullRecipes（被删减的收藏仍显示）**

把 `app.js` 里 `render(filter)` 开头到分类循环之间（约 `app.js:138-158`）整体替换为：

```js
function render(filter){
  currentFilter=filter;list.innerHTML='';let any=false;
  const source=(filter==='fav')?fullRecipes():allRecipes();
  if(filter==='fav'){
    const favCount=fullRecipes().filter(r=>favs.has(r.name)).length;
    const b=document.createElement('div');b.className='fav-banner';
    if(favCount===0)b.innerHTML=tr('favEmpty');
    else b.innerHTML=`${trf('favHave',favCount)}<br><button id="favToCart">${tr('favToCart')}</button>`;
    list.appendChild(b);
    const ftc=document.getElementById('favToCart');
    if(ftc)ftc.addEventListener('click',()=>{fullRecipes().filter(r=>favs.has(r.name)).forEach(r=>addIngredientsToCart(recIng(r)));ftc.textContent=tr('favAllAdded');});
  }
  formatOrder.forEach(cat=>{
    const items=source.filter(r=>r.cat===cat && matchFilter(r,filter));
    if(items.length===0)return;any=true;
    const c=formats[cat];
    const label=document.createElement('div');label.className='cat-label';
    label.innerHTML=`<span class="em">${c.em}</span>${fmtName(c)}<span class="count">${trf('catCount',items.length)}</span>`;list.appendChild(label);
    const d=document.createElement('p');d.className='cat-desc';d.textContent=fmtDesc(c);list.appendChild(d);
    const subs=[];items.forEach(r=>{if(!subs.includes(r.sub))subs.push(r.sub);});
    subs.forEach(sub=>{const first=items.find(r=>r.sub===sub);const sl=document.createElement('div');sl.className='sub-label';sl.textContent=recSub(first);list.appendChild(sl);const grid=document.createElement('div');grid.className='card-grid';items.filter(r=>r.sub===sub).forEach(r=>grid.appendChild(makeCard(r)));list.appendChild(grid);});
  });
  if(!any && filter!=='fav') list.innerHTML=`<p class="empty">${tr('emptyList')}</p>`;
}
```

（与原版唯一差异：新增 `const source=…` 一行；分类循环里 `allRecipes()` 改成 `source`；收藏 banner 的 `allRecipes()` 改成 `fullRecipes()`。）

- [ ] **Step 3: 语法检查**

Run: `node --check app.js`
Expected: 无输出，退出码 0

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: 按画像删减内置菜，收藏视图豁免删减"
```

---

## Task 3: ai-catalog Edge Function

**Files:**
- Create: `supabase/functions/ai-catalog/index.ts`

> 注：`.ts` 是 Deno 函数，`node --check` 不适用。验证 = 人工代码核对 + （用户侧）部署后调用。结构严格仿现有 `supabase/functions/ai-recipe/index.ts`。

- [ ] **Step 1: 写 Edge Function**

创建 `supabase/functions/ai-catalog/index.ts`，内容：

```ts
// Supabase Edge Function：按用户画像批量生成定制快餐（智谱 GLM + 联网搜索）。
// verify_jwt 默认开启，未登录请求由网关 401 拦下。

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  let profile: any;
  try {
    const body = await req.json();
    profile = body?.profile;
  } catch {
    return json({ error: "请求体格式错误" }, 400);
  }
  if (!profile || typeof profile !== "object") return json({ error: "缺少画像" }, 400);

  const apiKey = Deno.env.get("ZHIPU_API_KEY");
  if (!apiKey) return json({ error: "服务端未配置 API key" }, 500);

  const cats = "burger,sandwich,wrap,rice,noodle,congee,bundump,snack,dessert";
  const likes = (profile.proteins?.like || []).join("/") || "无特别";
  const avoid = (profile.proteins?.avoid || []).join("/") || "无";
  const diet = (profile.diet || []).join("/") || "无";
  const taste = [profile.taste?.sweet && "甜", profile.taste?.sour && "酸", profile.taste?.salty && "咸鲜"].filter(Boolean).join("/") || "均衡";
  const cuisines = (profile.cuisines || []).join("/") || "不限";
  const prompt =
    `你是快餐菜谱生成器。根据用户画像生成约 15 道适合的全球快餐，可联网搜索真实菜品与趋势。\n` +
    `只输出一个 JSON 对象：{"dishes":[ ... ]}，不要任何多余文字或 markdown 代码块。\n` +
    `每道菜字段：cat(只能是这些之一：${cats})、sub(中文小分类)、sub_en(英文小分类)、name(中文菜名)、en(英文菜名)、` +
    `p(数组，从 pork,chicken,beef,sea,egg,tofu 里选适用的；纯素或主要是淀粉用 ["tofu"])、` +
    `ing(中文主要材料，顿号、分隔，6到10样)、ing_en(英文材料，逗号 , 分隔，与 ing 一一对应)。\n` +
    `用户画像：状态=${profile.mode || "efficient"}（efficient偏快手简单/explorer偏精致新颖）；` +
    `喜欢蛋白质=${likes}；严格不吃=${avoid}；饮食限制=${diet}（必须严格遵守，绝不出现违禁项）；` +
    `辣度=${profile.taste?.spicy ?? 1}（0不吃辣 3重辣）；口味=${taste}；偏好菜系=${cuisines}。\n` +
    `覆盖多个 cat 大类，菜品不重复。`;

  let aResp: Response;
  try {
    aResp = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search", web_search: { enable: true } }],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return json({ error: "无法连接 AI 服务" }, 502);
  }
  if (!aResp.ok) return json({ error: "AI 服务出错" }, 502);

  let data;
  try { data = await aResp.json(); } catch { return json({ error: "AI 返回格式异常" }, 502); }
  const text = (data?.choices?.[0]?.message?.content ?? "")
    .trim().replace(/```json/g, "").replace(/```/g, "").trim();
  let obj: any;
  try { obj = JSON.parse(text); } catch { return json({ error: "AI 返回格式异常" }, 502); }
  const dishes = Array.isArray(obj) ? obj : (Array.isArray(obj.dishes) ? obj.dishes : []);
  return json({ dishes });
});
```

- [ ] **Step 2: 人工核对**

确认：CORS / `verify_jwt` 默认开启（无显式关闭）/ 读 `ZHIPU_API_KEY` / 返回 `{dishes:[...]}` 结构。`web_search` 工具参数若与智谱最新文档不符，部署时由用户对照调整（这是已知的部署期校验点）。

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ai-catalog/index.ts
git commit -m "feat: 新增 ai-catalog Edge Function（画像批量生成+联网）"
```

---

## Task 4: 测试 UI（DOM + 样式 + 文案）

**Files:**
- Modify: `index.html`（settingsOverlay 之前插入 `#quizOverlay`）
- Modify: `styles.css`（文件末尾追加）
- Modify: `data.js`（UI 字典末尾，`aiImportDone` 之后）

- [ ] **Step 1: index.html 加测试 overlay**

在 `index.html` 的 `<div class="ov" id="settingsOverlay"></div>` 这一行**之前**插入：

```html
<div class="quiz-overlay hidden" id="quizOverlay">
  <div class="quiz-box">
    <div class="quiz-head">
      <div class="quiz-emoji">🍽️</div>
      <h2 data-i18n="quizH2">定制你的专属快餐大全</h2>
      <p data-i18n="quizIntro">花 20 秒选一选，AI 为你生成合口味的菜单</p>
    </div>
    <div class="quiz-body" id="quizBody">
      <div class="quiz-q"><div class="quiz-label" data-i18n="qMode">你的状态</div>
        <div class="quiz-opts" data-q="mode" data-single="1">
          <span class="qchip" data-val="efficient" data-i18n="qModeEff">效率优先·快手</span>
          <span class="qchip" data-val="explorer" data-i18n="qModeExp">爱探索·有空下厨</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qLike">喜欢的蛋白质</div>
        <div class="quiz-opts" data-q="like">
          <span class="qchip" data-val="pork" data-i18n="fPork">🐷 猪</span>
          <span class="qchip" data-val="chicken" data-i18n="fChicken">🐔 鸡</span>
          <span class="qchip" data-val="beef" data-i18n="fBeef">🐄 牛</span>
          <span class="qchip" data-val="sea" data-i18n="fSea">🐟 鱼虾</span>
          <span class="qchip" data-val="egg" data-i18n="fEgg">🥚 蛋</span>
          <span class="qchip" data-val="tofu" data-i18n="fTofu">🫛 豆腐素</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qAvoid">不吃的蛋白质</div>
        <div class="quiz-opts" data-q="avoid">
          <span class="qchip" data-val="pork" data-i18n="fPork">🐷 猪</span>
          <span class="qchip" data-val="chicken" data-i18n="fChicken">🐔 鸡</span>
          <span class="qchip" data-val="beef" data-i18n="fBeef">🐄 牛</span>
          <span class="qchip" data-val="sea" data-i18n="fSea">🐟 鱼虾</span>
          <span class="qchip" data-val="egg" data-i18n="fEgg">🥚 蛋</span>
          <span class="qchip" data-val="tofu" data-i18n="fTofu">🫛 豆腐素</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qSpicy">能吃多辣</div>
        <div class="quiz-opts" data-q="spicy" data-single="1">
          <span class="qchip" data-val="0" data-i18n="qSpicy0">不吃辣</span>
          <span class="qchip" data-val="1" data-i18n="qSpicy1">微辣</span>
          <span class="qchip" data-val="2" data-i18n="qSpicy2">中辣</span>
          <span class="qchip" data-val="3" data-i18n="qSpicy3">重辣</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qTaste">口味偏好</div>
        <div class="quiz-opts" data-q="taste">
          <span class="qchip" data-val="sweet" data-i18n="qSweet">偏甜</span>
          <span class="qchip" data-val="sour" data-i18n="qSour">偏酸</span>
          <span class="qchip" data-val="salty" data-i18n="qSalty">偏咸鲜</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qDiet">饮食限制</div>
        <div class="quiz-opts" data-q="diet">
          <span class="qchip" data-val="vegetarian" data-i18n="qVeg">素食</span>
          <span class="qchip" data-val="halal" data-i18n="qHalal">清真</span>
          <span class="qchip" data-val="no_pork" data-i18n="qNoPork">不吃猪肉</span>
          <span class="qchip" data-val="no_seafood" data-i18n="qNoSea">海鲜过敏</span>
        </div></div>
      <div class="quiz-q"><div class="quiz-label" data-i18n="qCuisine">想吃的菜系</div>
        <div class="quiz-opts" data-q="cuisines">
          <span class="qchip" data-val="asian" data-i18n="qAsian">东亚</span>
          <span class="qchip" data-val="sea" data-i18n="qSea2">东南亚</span>
          <span class="qchip" data-val="mideast" data-i18n="qMideast">中东</span>
          <span class="qchip" data-val="western" data-i18n="qWestern">欧美</span>
          <span class="qchip" data-val="explore" data-i18n="qExplore">都想试试</span>
        </div></div>
    </div>
    <button class="quiz-go" id="quizGo" data-i18n="quizGo">✨ 生成我的定制大全</button>
    <div class="quiz-status" id="quizStatus"></div>
  </div>
  <div class="quiz-loading hidden" id="quizLoading">
    <div class="quiz-spinner"></div>
    <div class="quiz-loading-text" data-i18n="quizLoading">正在为你定制专属快餐大全…</div>
  </div>
</div>
```

> 注：东南亚菜系 chip 用键 `qSea2`（不复用蛋白质的 `fSea`），避免文案「🐟 鱼虾」串味。

- [ ] **Step 2: styles.css 末尾追加测试页样式**

在 `styles.css` 文件末尾追加：

```css
/* ===== 画像测试 ===== */
.quiz-overlay{position:fixed;inset:0;z-index:60;background:rgba(40,28,20,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto;}
.quiz-overlay.hidden{display:none;}
.quiz-box{background:var(--paper,#fff);border-radius:20px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:26px 24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.25);}
.quiz-head{text-align:center;margin-bottom:18px;}
.quiz-emoji{font-size:2.2rem;}
.quiz-box h2{font-family:'Noto Serif SC',serif;font-weight:900;font-size:1.5rem;margin:6px 0 4px;}
.quiz-head p{color:var(--ink-soft,#7a6f66);font-size:.9rem;}
.quiz-q{margin-bottom:16px;}
.quiz-label{font-weight:700;font-size:.9rem;margin-bottom:8px;}
.quiz-opts{display:flex;flex-wrap:wrap;gap:8px;}
.qchip{border:1.5px solid var(--line,#e7ddd2);border-radius:50px;padding:6px 14px;font-size:.85rem;cursor:pointer;user-select:none;background:var(--paper,#fff);color:var(--ink,#3a2f28);transition:all .15s;}
.qchip:hover{border-color:var(--persimmon,#e06a3c);}
.qchip.on{background:var(--persimmon,#e06a3c);border-color:var(--persimmon,#e06a3c);color:#fff;}
.quiz-go{width:100%;margin-top:8px;background:var(--persimmon,#e06a3c);color:#fff;border:none;border-radius:50px;padding:13px;font-size:1rem;font-weight:700;font-family:inherit;cursor:pointer;}
.quiz-go:hover{filter:brightness(1.05);}
.quiz-status{text-align:center;color:#c0392b;font-size:.85rem;min-height:18px;margin-top:10px;}
.quiz-loading{position:absolute;inset:0;background:rgba(255,250,244,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;}
.quiz-loading.hidden{display:none;}
.quiz-spinner{width:44px;height:44px;border:4px solid var(--line,#e7ddd2);border-top-color:var(--persimmon,#e06a3c);border-radius:50%;animation:quizspin .8s linear infinite;}
@keyframes quizspin{to{transform:rotate(360deg);}}
.quiz-loading-text{font-weight:700;color:var(--ink,#3a2f28);}
```

- [ ] **Step 3: data.js 加 UI 键**

在 `data.js` 的 `UI` 字典里、`aiImportDone:{...}` 那一项**之后**（`};` 之前）插入：

```js
  quizH2:{zh:'定制你的专属快餐大全', en:'Build your personal fast-food guide'},
  quizIntro:{zh:'花 20 秒选一选，AI 为你生成合口味的菜单', en:'Spend 20s picking; AI builds a menu for your taste'},
  qMode:{zh:'你的状态', en:'Your style'},
  qModeEff:{zh:'效率优先·快手', en:'Efficiency · quick meals'},
  qModeExp:{zh:'爱探索·有空下厨', en:'Explorer · time to cook'},
  qLike:{zh:'喜欢的蛋白质', en:'Proteins you like'},
  qAvoid:{zh:'不吃的蛋白质', en:'Proteins you avoid'},
  qSpicy:{zh:'能吃多辣', en:'Spice tolerance'},
  qSpicy0:{zh:'不吃辣', en:'No spice'},
  qSpicy1:{zh:'微辣', en:'Mild'},
  qSpicy2:{zh:'中辣', en:'Medium'},
  qSpicy3:{zh:'重辣', en:'Hot'},
  qTaste:{zh:'口味偏好', en:'Flavor'},
  qSweet:{zh:'偏甜', en:'Sweet'},
  qSour:{zh:'偏酸', en:'Sour'},
  qSalty:{zh:'偏咸鲜', en:'Savory'},
  qDiet:{zh:'饮食限制', en:'Dietary limits'},
  qVeg:{zh:'素食', en:'Vegetarian'},
  qHalal:{zh:'清真', en:'Halal'},
  qNoPork:{zh:'不吃猪肉', en:'No pork'},
  qNoSea:{zh:'海鲜过敏', en:'No seafood'},
  qCuisine:{zh:'想吃的菜系', en:'Cuisines'},
  qAsian:{zh:'东亚', en:'East Asian'},
  qSea2:{zh:'东南亚', en:'Southeast Asian'},
  qMideast:{zh:'中东', en:'Middle Eastern'},
  qWestern:{zh:'欧美', en:'Western'},
  qExplore:{zh:'都想试试', en:'Surprise me'},
  quizGo:{zh:'✨ 生成我的定制大全', en:'✨ Build my guide'},
  quizLoading:{zh:'正在为你定制专属快餐大全…', en:'Building your personal guide…'},
  quizFail:{zh:'生成失败，请重试', en:'Generation failed, please retry'},
  quizExpired:{zh:'登录已过期，请重新登录', en:'Session expired, please sign in again'},
  quizEmpty:{zh:'没生成出有效菜品，请重试', en:'No valid dishes generated, please retry'},
  setRetake:{zh:'🎯 重新测口味', en:'🎯 Retake taste quiz'},
```

- [ ] **Step 4: 语法检查**

Run: `node --check data.js`
Expected: 无输出，退出码 0

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css data.js
git commit -m "feat: 画像测试页 DOM、样式与中英文案"
```

---

## Task 5: 测试流程逻辑 + 强制触发

**Files:**
- Modify: `app.js`（在「设置面板」块 `app.js:203-212` 之后、`/* ====== 菜谱码导出/导入 ====== */` 之前插入新块）
- Modify: `app.js:71-78`（onAuthed 末尾加触发）

- [ ] **Step 1: 插入测试流程逻辑块**

在 `app.js` 里 `setOv.addEventListener('click',()=>closePanel(setOv,setP));` 那段设置面板代码之后（具体在 `document.getElementById('setLogout')...showLogin();});` 这个块的 `});` 之后），`/* ====== 菜谱码导出/导入 ====== */` 注释之前，插入：

```js
/* ====== 画像测试 ====== */
const quizOverlay=document.getElementById('quizOverlay');
function readChips(q){return [...document.querySelectorAll('.quiz-opts[data-q="'+q+'"] .qchip.on')].map(c=>c.dataset.val);}
function collectProfile(){
  const t=readChips('taste');
  return {
    v:1,
    mode:readChips('mode')[0]||'efficient',
    proteins:{like:readChips('like'),avoid:readChips('avoid')},
    taste:{spicy:parseInt(readChips('spicy')[0]||'1',10),sweet:t.includes('sweet'),sour:t.includes('sour'),salty:t.includes('salty')},
    diet:readChips('diet'),
    cuisines:readChips('cuisines')
  };
}
function prefillQuiz(prof){
  document.querySelectorAll('.quiz-opts .qchip').forEach(c=>c.classList.remove('on'));
  if(!prof)return;
  const set=(q,vals)=>vals.forEach(v=>{const c=document.querySelector('.quiz-opts[data-q="'+q+'"] .qchip[data-val="'+v+'"]');if(c)c.classList.add('on');});
  set('mode',[prof.mode]);
  set('like',(prof.proteins&&prof.proteins.like)||[]);
  set('avoid',(prof.proteins&&prof.proteins.avoid)||[]);
  set('spicy',[String(prof.taste&&prof.taste.spicy!=null?prof.taste.spicy:1)]);
  const t=[];if(prof.taste){if(prof.taste.sweet)t.push('sweet');if(prof.taste.sour)t.push('sour');if(prof.taste.salty)t.push('salty');}
  set('taste',t);
  set('diet',prof.diet||[]);
  set('cuisines',prof.cuisines||[]);
}
function showQuizLoading(on){
  document.getElementById('quizLoading').classList.toggle('hidden',!on);
  document.getElementById('quizBody').style.display=on?'none':'';
  document.getElementById('quizGo').style.display=on?'none':'';
}
function showQuiz(){prefillQuiz(profile);document.getElementById('quizStatus').textContent='';showQuizLoading(false);quizOverlay.classList.remove('hidden');}
function hideQuiz(){quizOverlay.classList.add('hidden');}
document.querySelectorAll('.quiz-opts').forEach(box=>{
  const single=box.dataset.single==='1';
  box.addEventListener('click',e=>{
    const chip=e.target.closest('.qchip');if(!chip)return;
    if(single){box.querySelectorAll('.qchip').forEach(c=>c.classList.remove('on'));chip.classList.add('on');}
    else chip.classList.toggle('on');
  });
});
async function generateCatalog(prof){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw new Error('401');
  const resp=await fetch(`${SUPABASE_URL}/functions/v1/ai-catalog`,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_KEY},
    body:JSON.stringify({profile:prof})
  });
  if(!resp.ok)throw new Error(resp.status===401?'401':'fail');
  const data=await resp.json();
  const arr=Array.isArray(data.dishes)?data.dishes:[];
  const seen=new Set(),clean=[];
  arr.forEach(o=>{
    if(!o||!o.name||seen.has(o.name))return;
    if(!formatOrder.includes(o.cat))return;
    let p=(Array.isArray(o.p)?o.p:[]).filter(x=>PSET.includes(x));if(p.length===0)p=['tofu'];
    seen.add(o.name);
    clean.push({cat:o.cat,sub:o.sub||'',sub_en:o.sub_en||'',name:o.name,en:o.en||'',p,ing:o.ing||'',ing_en:o.ing_en||'',gen:true});
  });
  if(clean.length===0)throw new Error('empty');
  return clean;
}
document.getElementById('quizGo').addEventListener('click',async()=>{
  const prof=collectProfile();
  document.getElementById('quizStatus').textContent='';
  showQuizLoading(true);
  try{
    const dishes=await generateCatalog(prof);
    profile=prof;generated=dishes;persist();
    hideQuiz();
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');
    render('all');
  }catch(e){
    showQuizLoading(false);
    const msg=e.message==='401'?tr('quizExpired'):(e.message==='empty'?tr('quizEmpty'):tr('quizFail'));
    document.getElementById('quizStatus').textContent=msg;
  }
});
```

- [ ] **Step 2: onAuthed 末尾强制触发**

把 `app.js` 里 `onAuthed(session)` 函数（约 `app.js:71-78`）：

```js
async function onAuthed(session){
  userId=session.user.id;userEmail=session.user.email;
  document.getElementById('loginOverlay').classList.add('hidden');
  await loadData();
  renderCart();render('all');
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
}
```

改为（末尾加一行强制触发）：

```js
async function onAuthed(session){
  userId=session.user.id;userEmail=session.user.email;
  document.getElementById('loginOverlay').classList.add('hidden');
  await loadData();
  renderCart();render('all');
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
  if(!profile)showQuiz();
}
```

- [ ] **Step 3: 语法检查**

Run: `node --check app.js`
Expected: 无输出，退出码 0

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat: 画像测试流程、生成调用与首登强制触发"
```

---

## Task 6: 设置面板「重新测口味」

**Files:**
- Modify: `index.html`（设置面板账号区，`#setLogout` 按钮之后）
- Modify: `app.js`（设置面板事件块，`#setLogout` 监听之后）

- [ ] **Step 1: index.html 加重测按钮**

在 `index.html` 设置面板里 `<button class="ghost" id="setLogout" data-i18n="logout">退出</button>` 这一行**之后**插入：

```html
    <button class="ghost" id="setRetake" data-i18n="setRetake">🎯 重新测口味</button>
```

- [ ] **Step 2: app.js 接线**

在 `app.js` 设置面板事件块里、`#setLogout` 的 `addEventListener('click',...)` 整个 `});` 之后，插入：

```js
document.getElementById('setRetake').addEventListener('click',()=>{closePanel(setOv,setP);showQuiz();});
```

- [ ] **Step 3: 语法检查**

Run: `node --check app.js`
Expected: 无输出，退出码 0

- [ ] **Step 4: Commit**

```bash
git add index.html app.js
git commit -m "feat: 设置面板加重新测口味入口"
```

---

## 全部完成后：用户侧冒烟（需先跑 SQL + 部署）

用户执行前置 SQL 与 `supabase functions deploy ai-catalog` 后，在 GitHub Pages 上硬刷新验证：

- [ ] 新账号登录 → 自动弹测试 → 选完点生成 → 加载动画 → 看到混合大全（生成菜无 ⭐、无删除）
- [ ] 选「海鲜过敏」+「不吃猪肉」→ 大全里无含鱼虾/猪肉的菜
- [ ] 选「不吃辣」→ 泡菜炒饭/咖喱等辣味内置菜不出现
- [ ] 收藏一道菜后改画像把它删掉 → 「♥ 我的收藏」里它仍在
- [ ] 设置 →「🎯 重新测口味」→ 重选生成 → 旧生成菜被替换，收藏/购物车/手动菜仍在
- [ ] 中英切换、随机高亮、一句话加菜（⭐+删除）、菜谱码导入导出、购物车 全部仍正常
- [ ] 生成失败时（如未部署）测试页显示「生成失败，请重试」，不会把人锁死在空白

---

## 自查记录

**Spec 覆盖：** ① 数据模型 profile/generated→Task1 ② 测试 UI→Task4 ③ 生成流程→Task3+Task5 ④ 删减逻辑→Task2 ⑤ 重测→Task6 ⑥ 错误处理→Task5（401/fail/empty 三态）⑦ 后端→Task3 ⑧ i18n→Task4 ⑨ 旧功能保留→未改动 makeCard 的 custom 分支、未动一句话加菜/菜谱码。全覆盖。

**占位符：** 无 TBD/TODO；唯一外部未知（智谱 web_search 参数）已明确标为部署期校验点，非设计占位。

**类型一致：** `profile`/`generated` 在 Task1 定义，Task2/5/6 一致使用；`profileFilter(listArr,prof)`、`fullRecipes()`、`allRecipes()` 签名一致；生成菜对象字段 `{cat,sub,sub_en,name,en,p,ing,ing_en,gen}` 在 Task5 清洗与 Task2 渲染一致；UI 键 `qSea2`（东南亚）与蛋白质 `fSea`（鱼虾）区分，无串味；`readChips/collectProfile/prefillQuiz/showQuiz/generateCatalog` 均在 Task5 定义后才被 Task6/onAuthed 调用。
