# 中英双语系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「全球快餐大全」加中英文双语切换:界面、菜谱内容(标题/子类/材料)、分类、AI 加菜都可中/英显示。

**Architecture:** 纯原生零依赖 i18n。data.js 集中界面字典 `UI` 与双语数据字段;index.html 用 `data-i18n` 声明式标注静态文案;app.js 维护全局 `lang`,`applyUI()` 刷界面、取字段函数 `recName/recIng/...`(英文缺失回退中文)刷卡片。语言偏好优先级:云端 > localStorage > 浏览器检测 > 中文兜底。

**Tech Stack:** 原生 HTML/CSS/JS(非 module,共享全局作用域,加载序 supabase→data.js→app.js)、Supabase(登录+同步+Edge Function)、智谱 GLM。

**测试说明:** 本项目无单元测试框架(零构建纯静态)。每个任务用本地预览(`python -m http.server`,见 `.claude/launch.json` 或手动起)+ 浏览器冒烟验证,验证手法包括用 preview_eval 改 `lang`/`localStorage`/`navigator.language` 并检查 DOM。

---

## File Structure

- **data.js** — 加 `UI` 字典(全部界面文案 {zh,en});`pInfo` 改双语对象;`formats` 每项加 `name_en`/`desc_en`;`BUILTIN` 每道加 `sub_en`/`ing_en`。
- **index.html** — 静态文案加 `data-i18n`/`data-i18n-html`/`data-i18n-ph`;header 加 `中/EN` 切换按钮;`userChip` 的「退出」包进 `<span data-i18n="logout">`。
- **styles.css** — `.lang-toggle` 按钮样式。
- **app.js** — i18n 核心(`lang`、`resolveLang`、`applyUI`、`tr`/`trf`、取字段函数、`setLang`、切换按钮事件、init 调用);渲染函数改用取字段函数与字典;`syncUp`/`loadData`/`persist` 带上 `lang`;`aiGenerate` 存 `sub_en`/`ing_en`。
- **supabase/functions/ai-recipe/index.ts** — prompt 与返回值加英文字段。
- **Supabase(用户手动)** — `alter table user_data add column lang text;`

---

## Task 1: i18n 基础设施 + 静态界面双语 + 切换按钮

建立 `lang` 状态、界面字典、`applyUI()`、切换按钮与持久化。完成后:界面 chrome 与登录框可中/英切换,刷新后 localStorage 记住,首次按浏览器语言。卡片内容此阶段仍中文(下个任务处理)。

**Files:**
- Modify: `data.js`(文件末尾 `PSET` 之后追加 `UI` 字典)
- Modify: `index.html`(加 data-i18n 属性、切换按钮、包裹「退出」、给可变文案元素加 id)
- Modify: `styles.css`(加 `.lang-toggle` 样式)
- Modify: `app.js`(加 i18n 核心与 init 调用)

- [ ] **Step 1: 在 data.js 末尾追加 UI 字典**

在 `data.js` 最后(`const PSET=[...]` 之后)追加:

```js
/* 界面文案字典：{key:{zh,en}}。{n} 为占位符，由 trf() 替换。 */
const UI = {
  pageTitle:{zh:'全球快餐大全 · 云同步', en:'World Fast Food · Cloud Sync'},
  loginH2:{zh:'登录 / 注册', en:'Sign in / Sign up'},
  loginIntro:{zh:'用邮箱登录，收藏和菜谱会云端同步到所有设备', en:'Sign in with email; favorites and recipes sync to all your devices'},
  phEmail:{zh:'邮箱', en:'Email'},
  phPw:{zh:'密码（至少 6 位）', en:'Password (min 6 chars)'},
  signIn:{zh:'登录', en:'Sign in'},
  signUp:{zh:'注册新账号', en:'Create account'},
  or:{zh:'或', en:'or'},
  google:{zh:'用 Google 登录', en:'Sign in with Google'},
  loginNote:{zh:'数据云端同步，多设备共享', en:'Cloud sync across your devices'},
  kicker:{zh:'汉堡·三明治·卷·饭·面·粥·点心·小吃·甜品', en:'Burgers · Sandwiches · Wraps · Rice · Noodles · Congee · Dim Sum · Snacks · Desserts'},
  h1:{zh:'全球<span class="accent">快餐</span>大全', en:'World <span class="accent">Fast Food</span>'},
  subtitle:{zh:'9 大类 × 子类细分 · 蛋白质筛选 · 收藏 · AI 加菜 · 云同步', en:'9 categories × subtypes · protein filter · favorites · AI recipes · cloud sync'},
  logout:{zh:'退出', en:'Sign out'},
  dice:{zh:'🎲 今天吃啥？随机选一道', en:'🎲 What to eat? Pick one'},
  aiOpen:{zh:'✨ 一句话加菜谱', en:'✨ Add a recipe in one line'},
  filtLabel:{zh:'按蛋白质筛选 · 或看收藏', en:'Filter by protein · or view favorites'},
  fAll:{zh:'全部', en:'All'},
  fFav:{zh:'♥ 我的收藏', en:'♥ Favorites'},
  fPork:{zh:'🐷 猪', en:'🐷 Pork'},
  fChicken:{zh:'🐔 鸡', en:'🐔 Chicken'},
  fBeef:{zh:'🐄 牛', en:'🐄 Beef'},
  fSea:{zh:'🐟 鱼虾', en:'🐟 Seafood'},
  fEgg:{zh:'🥚 蛋', en:'🥚 Egg'},
  fTofu:{zh:'🫛 豆腐素', en:'🫛 Tofu/Veg'},
  fMix:{zh:'🍲 混合', en:'🍲 Mixed'},
  footer:{zh:'9 大类 · 几十个国家 · ♥ 收藏 · ✨ AI 加菜 · ☁️ 跨设备同步', en:'9 categories · dozens of countries · ♥ favorites · ✨ AI recipes · ☁️ cross-device sync'},
  cartTitle:{zh:'🛒 买菜备忘录', en:'🛒 Shopping list'},
  phCart:{zh:'加一样要买的东西…', en:'Add something to buy…'},
  cartClear:{zh:'清除已买', en:'Clear done'},
  aiTitle:{zh:'✨ 一句话加菜谱', en:'✨ Add a recipe in one line'},
  phAi:{zh:'一句话描述，例：韩式甜辣炸鸡', en:'Describe a dish, e.g. Korean sweet-spicy fried chicken'},
  aiStatusDefault:{zh:'输入一道菜的描述，AI 会自动生成材料和蛋白质标签，加入「⭐ 我的菜谱」并云端同步。', en:'Describe a dish; AI generates ingredients and protein tags, adds it to ⭐ My Recipes and syncs.'},
  aiNote:{zh:'注：AI 加菜已通过 Supabase 后端代理支持线上使用（需登录）。生成的菜谱会加入「⭐ 我的菜谱」并云端同步。', en:'Note: AI add-recipe works online via a Supabase proxy (login required). New recipes go to ⭐ My Recipes and sync.'},
  // 动态文案（app.js 用）
  syncing:{zh:'☁️ 同步中…', en:'☁️ Syncing…'},
  syncFail:{zh:'⚠️ 同步失败：', en:'⚠️ Sync failed: '},
  synced:{zh:'✓ 已云端同步', en:'✓ Synced'},
  needEmailPw:{zh:'请输入邮箱和密码', en:'Enter email and password'},
  signingIn:{zh:'登录中…', en:'Signing in…'},
  signInFail:{zh:'登录失败：', en:'Sign-in failed: '},
  needPw6:{zh:'请输入邮箱，密码至少 6 位', en:'Enter email; password ≥ 6 chars'},
  signingUp:{zh:'注册中…', en:'Signing up…'},
  signUpFail:{zh:'注册失败：', en:'Sign-up failed: '},
  signUpOk:{zh:'注册成功！如开启了邮箱确认，请先去邮箱点确认链接，再回来登录。', en:'Signed up! If email confirmation is on, confirm via the email link, then sign in.'},
  googleRedirect:{zh:'跳转到 Google…', en:'Redirecting to Google…'},
  googleFail:{zh:'Google 登录失败：', en:'Google sign-in failed: '},
  favEmpty:{zh:'还没有收藏～ 点菜品上的 ♡ 收藏，就会出现在这里。', en:'No favorites yet — tap ♡ on a dish and it shows up here.'},
  favHave:{zh:'你收藏了 <b>{n}</b> 道', en:'You have <b>{n}</b> favorites'},
  favToCart:{zh:'🛒 把全部收藏的材料加入买菜清单', en:'🛒 Add all favorite ingredients to list'},
  favAllAdded:{zh:'✓ 已全部加入清单', en:'✓ All added to list'},
  catCount:{zh:'{n} 种', en:'{n} kinds'},
  emptyList:{zh:'这个蛋白质下暂时没有菜，换一个试试 🍳', en:'No dishes for this protein — try another 🍳'},
  diceResult:{zh:'→ 今天就做「{n}」吧！', en:'→ Let\'s make "{n}" today!'},
  ingLabel:{zh:'材料', en:'Ingredients'},
  favOn:{zh:'♥ 已收藏', en:'♥ Saved'},
  favOff:{zh:'♡ 收藏', en:'♡ Save'},
  addCart:{zh:'🛒 加入买菜清单', en:'🛒 Add to list'},
  added:{zh:'✓ 已加入', en:'✓ Added'},
  del:{zh:'✕ 删除', en:'✕ Delete'},
  mix:{zh:'🍲混合', en:'🍲Mixed'},
  cartEmpty:{zh:'清单空空的～<br>手动添加，或在菜里点「加入买菜清单」', en:'Your list is empty —<br>add manually, or tap "Add to list" on a dish'},
  cartLeft:{zh:'还要买 {n} 样', en:'{n} left to buy'},
  aiGenerating:{zh:'正在生成「{n}」…', en:'Generating "{n}"…'},
  aiExpired:{zh:'登录已过期，请重新登录', en:'Session expired, please sign in again'},
  aiFail:{zh:'AI 生成失败，请换个描述再试', en:'Generation failed, try another description'},
  aiAdded:{zh:'已加入「⭐ 我的菜谱」：{n}', en:'Added to ⭐ My Recipes: {n}'},
  aiNetErr:{zh:'网络错误，请稍后再试', en:'Network error, try again later'},
};
```

- [ ] **Step 2: 给 index.html 静态文案加 data-i18n 标注**

逐元素加属性。`data-i18n`→textContent;`data-i18n-html`→innerHTML(含标签);`data-i18n-ph`→placeholder。替换后关键行如下:

登录框(15-27 行附近):
```html
    <h2 data-i18n="loginH2">登录 / 注册</h2>
    <p data-i18n="loginIntro">用邮箱登录，收藏和菜谱会云端同步到所有设备</p>
    <input id="loginEmail" type="email" data-i18n-ph="phEmail" placeholder="邮箱" autocomplete="username">
    <input id="loginPw" type="password" data-i18n-ph="phPw" placeholder="密码（至少 6 位）" autocomplete="current-password">
    <button class="primary" id="signInBtn" data-i18n="signIn">登录</button>
    <button class="ghost" id="signUpBtn" data-i18n="signUp">注册新账号</button>
    <div class="or-line"><span data-i18n="or">或</span></div>
    <button class="ghost google" id="googleBtn" data-i18n="google">用 Google 登录</button>
    <p class="login-note" id="loginMsg" data-i18n="loginNote">数据云端同步，多设备共享</p>
```

header(31-43 行):
```html
    <div class="kicker" data-i18n="kicker">汉堡·三明治·卷·饭·面·粥·点心·小吃·甜品</div>
    <h1 data-i18n-html="h1">全球<span class="accent">快餐</span>大全</h1>
    <p class="subtitle" data-i18n="subtitle">9 大类 × 子类细分 · 蛋白质筛选 · 收藏 · AI 加菜 · 云同步</p>
    <div class="header-rule"></div>
    <div class="lang-toggle"><button data-lang="zh">中</button><button data-lang="en">EN</button></div>
    <button class="user-chip" id="userChip" style="display:none">👤 <span id="userName"></span> · <span data-i18n="logout">退出</span></button>
    <div class="sync-dot" id="syncDot"></div>
    <div class="dice-zone">
      <button class="dice-btn" id="diceBtn" data-i18n="dice">🎲 今天吃啥？随机选一道</button>
      <button class="ai-add-btn" id="aiOpen" data-i18n="aiOpen">✨ 一句话加菜谱</button>
      <div class="dice-result" id="diceResult"></div>
    </div>
```

筛选 nav(45-56 行):给 `filt-label` 与每个 chip 加 `data-i18n`(chip 文本对应 fAll/fFav/fPork/fChicken/fBeef/fSea/fEgg/fTofu/fMix),保留各自 `data-filter`:
```html
    <span class="filt-label" data-i18n="filtLabel">按蛋白质筛选 · 或看收藏</span>
    <span class="chip active" data-filter="all" data-i18n="fAll">全部</span>
    <span class="chip fav-chip" data-filter="fav" data-i18n="fFav">♥ 我的收藏</span>
    <span class="chip" data-filter="pork" data-i18n="fPork">🐷 猪</span>
    <span class="chip" data-filter="chicken" data-i18n="fChicken">🐔 鸡</span>
    <span class="chip" data-filter="beef" data-i18n="fBeef">🐄 牛</span>
    <span class="chip" data-filter="sea" data-i18n="fSea">🐟 鱼虾</span>
    <span class="chip" data-filter="egg" data-i18n="fEgg">🥚 蛋</span>
    <span class="chip" data-filter="tofu" data-i18n="fTofu">🫛 豆腐素</span>
    <span class="chip" data-filter="mix" data-i18n="fMix">🍲 混合</span>
```

footer / 买菜面板 / AI 面板(60、66-79 行):
```html
  <footer data-i18n="footer">9 大类 · 几十个国家 · ♥ 收藏 · ✨ AI 加菜 · ☁️ 跨设备同步</footer>
```
```html
  <div class="p-head"><div class="p-title" data-i18n="cartTitle">🛒 买菜备忘录</div><button class="p-close" id="cartClose">✕</button></div>
  <div class="p-add-row"><input class="p-input" id="cartInput" type="text" data-i18n-ph="phCart" placeholder="加一样要买的东西…" autocomplete="off"><button class="p-go" id="cartAdd">＋</button></div>
  <ul class="cart-list" id="cartList"></ul>
  <div class="cart-foot"><span class="cart-count" id="cartCount">还要买 0 样</span><button class="cart-clear" id="cartClear" data-i18n="cartClear">清除已买</button></div>
```
```html
  <div class="p-head"><div class="p-title" data-i18n="aiTitle">✨ 一句话加菜谱</div><button class="p-close" id="aiClose">✕</button></div>
  <div class="p-add-row"><input class="p-input" id="aiInput" type="text" data-i18n-ph="phAi" placeholder="一句话描述，例：韩式甜辣炸鸡" autocomplete="off"><button class="p-go" id="aiGo">→</button></div>
  <div class="ai-status" id="aiStatus" data-i18n="aiStatusDefault">输入一道菜的描述，AI 会自动生成材料和蛋白质标签，加入「⭐ 我的菜谱」并云端同步。</div>
  <div class="ai-note" data-i18n="aiNote">注：AI 加菜已通过 Supabase 后端代理支持线上使用（需登录）。生成的菜谱会加入「⭐ 我的菜谱」并云端同步。</div>
```
注意:`loginMsg` 同时有 `data-i18n="loginNote"`,但 app.js 的 `setMsg()` 会动态改它的内容——这是预期的(动态消息覆盖默认提示),不冲突。

- [ ] **Step 3: 在 styles.css 加切换按钮样式**

找到 `.user-chip` 规则附近,追加(配色沿用变量 `--persimmon` accent;若变量名不同,用 styles.css 里实际的强调色变量):
```css
.lang-toggle{display:inline-flex;gap:0;border:1px solid var(--persimmon,#e06a3c);border-radius:999px;overflow:hidden;margin:6px auto 0;}
.lang-toggle button{border:none;background:transparent;color:var(--persimmon,#e06a3c);font:inherit;font-size:13px;padding:3px 12px;cursor:pointer;}
.lang-toggle button.on{background:var(--persimmon,#e06a3c);color:#fff;}
```

- [ ] **Step 4: 在 app.js 顶部加 i18n 核心**

在 `const list=document.getElementById('list');`(第 8 行)之后插入:
```js
/* ====== i18n ====== */
function resolveLang(){
  const saved=localStorage.getItem('lang');
  if(saved==='zh'||saved==='en')return saved;
  return (navigator.language||'zh').toLowerCase().startsWith('zh')?'zh':'en';
}
let lang=resolveLang();
function tr(key){const e=UI[key];return e?(e[lang]||e.zh):key;}
function trf(key,n){return tr(key).replace('{n}',n);}
function applyUI(){
  document.title=tr('pageTitle');
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=tr(el.dataset.i18n);});
  document.querySelectorAll('[data-i18n-html]').forEach(el=>{el.innerHTML=tr(el.dataset.i18nHtml);});
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{el.placeholder=tr(el.dataset.i18nPh);});
  document.querySelectorAll('.lang-toggle button').forEach(b=>b.classList.toggle('on',b.dataset.lang===lang));
}
function setLang(l){
  if(l!==lang){lang=l;localStorage.setItem('lang',l);}
  document.documentElement.lang=(l==='en')?'en':'zh-CN';
  applyUI();
  if(document.getElementById('list').children.length)render(currentFilter);
  renderCart();
  if(typeof userId!=='undefined'&&userId)persist();
}
document.querySelectorAll('.lang-toggle button').forEach(b=>{
  b.addEventListener('click',()=>setLang(b.dataset.lang));
});
```
注意:`setLang` 里 `render`/`renderCart`/`currentFilter`/`userId`/`persist` 在文件后面定义,但因为是函数调用且事件触发时它们已存在,运行时安全;`persist()` 的真正使用在 Task 4 才生效(此任务里 syncUp 还没带 lang,调用无害)。

- [ ] **Step 5: 在 init 里启用语言**

把文件末尾 init(197-200 行)改为先设语言:
```js
/* ====== 启动 ====== */
(async function init(){
  document.documentElement.lang=(lang==='en')?'en':'zh-CN';
  applyUI();
  const {data:{session}}=await sb.auth.getSession();
  if(session&&session.user){onAuthed(session);}else{showLogin();}
})();
```

- [ ] **Step 6: 浏览器冒烟验证(静态界面)**

起本地服务 `python -m http.server 8765`(在仓库根目录),打开 `http://localhost:8765`。验证:
1. 登录框显示中文(默认浏览器中文环境)。
2. 控制台执行 `localStorage.setItem('lang','en');location.reload();`——登录框应变英文(Sign in / Sign up 等)。
3. 控制台执行 `localStorage.removeItem('lang');location.reload();`——回到按浏览器语言(中文)。
4. 登录后,点 header 的 `中/EN` 按钮,界面 chrome(标题/副标题/筛选 chip/footer/面板标题/占位符)整体切换;当前语言按钮高亮。
预期:界面文案全部切换,无报错。卡片内容此阶段仍为中文(下个任务处理)——属正常。

- [ ] **Step 7: Commit**

```bash
git add data.js index.html styles.css app.js
git commit -m "feat(i18n): 界面文案双语字典 + 中/EN 切换按钮 + 语言判定与本地持久化"
```

---

## Task 2: 菜谱内容双语渲染(取字段函数 + pInfo/formats 双语 + 渲染改造)

加取字段函数与 pInfo/formats 双语数据,改造所有渲染使其按 `lang` 显示。完成后:EN 模式下凡有英文字段的都显示英文;`BUILTIN` 的 `ing_en`/`sub_en` 尚未填(下个任务),此时自动回退中文,不空白。

**Files:**
- Modify: `data.js`(`pInfo` 改双语;`formats` 加 `name_en`/`desc_en`)
- Modify: `app.js`(加取字段函数;改 `ptagsHtml`/`makeCard`/`render`/`dice`/`renderCart`/`addIngredientsToCart`/各动态文案)

- [ ] **Step 1: data.js 把 pInfo 改双语对象**

把第 129 行 `const pInfo={pork:'🐷猪',...}` 改为:
```js
const pInfo={
  pork:{zh:'🐷猪',en:'🐷Pork'}, chicken:{zh:'🐔鸡',en:'🐔Chicken'},
  beef:{zh:'🐄牛',en:'🐄Beef'}, sea:{zh:'🐟鱼虾',en:'🐟Seafood'},
  egg:{zh:'🥚蛋',en:'🥚Egg'}, tofu:{zh:'🫛豆腐素',en:'🫛Tofu/Veg'}
};
```

- [ ] **Step 2: data.js 给 formats 每项加英文**

把 `formats`(116-127 行)整体替换为:
```js
const formats = {
  custom:{em:'⭐',name:'我的菜谱',name_en:'My Recipes',desc:'你用 AI 一句话生成、云端同步的菜。',desc_en:'Recipes you generate with AI, synced to the cloud.'},
  burger:{em:'🍔',name:'汉堡',name_en:'Burgers',desc:'肉饼夹圆面包，全球都有本地版本。',desc_en:'A patty in a round bun — every cuisine has its own.'},
  sandwich:{em:'🥪',name:'三明治',name_en:'Sandwiches',desc:'面包夹料，分冷食、热压、长面包潜艇。',desc_en:'Filled bread — cold, pressed, or long subs.'},
  wrap:{em:'🌯',name:'卷类',name_en:'Wraps',desc:'薄饼或皮塔卷馅，美洲、中东、亚洲各有风格。',desc_en:'Flatbread or pita wraps — American, Middle Eastern, Asian styles.'},
  rice:{em:'🍚',name:'饭类',name_en:'Rice',desc:'亚洲餐桌的核心：炒、盖、拌、煲、抓、团。',desc_en:'The heart of the Asian table: fried, bowls, mixed, claypot, pilaf, balls.'},
  noodle:{em:'🍜',name:'面·粉',name_en:'Noodles',desc:'汤的、拌的、炒的，米麦皆有。',desc_en:'In soup, tossed, or fried — wheat and rice.'},
  congee:{em:'🥘',name:'粥·汤饭',name_en:'Congee & Soup Rice',desc:'熬煮或汤泡的米食，暖胃好消化。',desc_en:'Simmered or soup-soaked rice — warm and easy on the stomach.'},
  bundump:{em:'🥟',name:'包·饺·点心',name_en:'Buns, Dumplings & Dim Sum',desc:'面皮包馅：蒸包夹饼、饺子、蒸炸点心。',desc_en:'Filled dough: steamed buns, dumplings, dim sum.'},
  snack:{em:'🍢',name:'串·小吃',name_en:'Skewers & Snacks',desc:'街边手持：烤串、油炸、铁板煎烙。',desc_en:'Street eats: skewers, deep-fried, griddled.'},
  dessert:{em:'🍰',name:'甜品',name_en:'Desserts',desc:'亚洲甜点：米食、冰品、糕饼。',desc_en:'Asian sweets: rice desserts, frozen treats, pastries.'},
};
```

- [ ] **Step 2.5: 验证 data.js 无语法错误**

浏览器打开页面,控制台无 `Uncaught SyntaxError`。或 `node -e "require('./data.js')"` 会因 const 重复全局报错,不可靠;以浏览器加载为准。

- [ ] **Step 3: app.js 加取字段函数**

在 i18n 核心(Task 1 加的块)末尾追加:
```js
function recName(r){return lang==='en'?(r.en||r.name):r.name;}      // 卡片主标题
function recAlt(r){return lang==='en'?r.name:(r.en||'');}            // 副标题（另一语言）
function recIng(r){return lang==='en'?(r.ing_en||r.ing):r.ing;}     // 材料（缺英文回退中文）
function recSub(r){return lang==='en'?(r.sub_en||r.sub):r.sub;}     // 子类
function fmtName(c){return lang==='en'?(c.name_en||c.name):c.name;}
function fmtDesc(c){return lang==='en'?(c.desc_en||c.desc):c.desc;}
function ptagLabel(x){const e=pInfo[x];return e?(e[lang]||e.zh):x;}
```

- [ ] **Step 4: app.js 改 ptagsHtml(第 81 行)**

```js
function ptagsHtml(p){let t=p.map(x=>`<span class="ptag">${ptagLabel(x)}</span>`).join('');if(p.length>=2)t+=`<span class="ptag" style="background:#fcefcf;color:#c9962e;">${tr('mix')}</span>`;return t;}
```

- [ ] **Step 5: app.js 改 makeCard(83-107 行)**

`card.dataset.name` 与 `favs` 仍用 `r.name`(中文,作为稳定身份);仅显示用取字段函数。替换 innerHTML 与按钮文案/重置文案:
```js
function makeCard(r){
  const card=document.createElement('div');card.className='card';card.dataset.name=r.name;
  const faved=favs.has(r.name);
  card.innerHTML=`
    <div class="card-top">
      <div class="name"><span class="flag">${r.flag}</span>${recName(r)}<span class="en">${recAlt(r)}</span></div>
      <div class="ptags">${ptagsHtml(r.p)}</div>
    </div>
    <div class="ing"><span class="lab">${tr('ingLabel')}</span>${recIng(r)}</div>
    <div class="card-actions">
      <button class="act-btn act-fav ${faved?'on':''}">${faved?tr('favOn'):tr('favOff')}</button>
      <button class="act-btn act-cart">${tr('addCart')}</button>
      ${r.custom?`<button class="act-btn act-del">${tr('del')}</button>`:''}
    </div>`;
  const favBtn=card.querySelector('.act-fav');
  favBtn.addEventListener('click',()=>{
    if(favs.has(r.name))favs.delete(r.name);else favs.add(r.name);
    saveFavs();
    if(currentFilter==='fav'){render('fav');}else{const on=favs.has(r.name);favBtn.classList.toggle('on',on);favBtn.textContent=on?tr('favOn'):tr('favOff');}
  });
  const cartBtn=card.querySelector('.act-cart');
  cartBtn.addEventListener('click',()=>{addIngredientsToCart(recIng(r));cartBtn.classList.add('added');cartBtn.textContent=tr('added');setTimeout(()=>{cartBtn.classList.remove('added');cartBtn.textContent=tr('addCart');},1500);});
  if(r.custom){card.querySelector('.act-del').addEventListener('click',()=>{customRecipes=customRecipes.filter(x=>x.id!==r.id);favs.delete(r.name);saveCustom();render(currentFilter);});}
  return card;
}
```

- [ ] **Step 6: app.js 改 render(108-130 行)**

```js
function render(filter){
  currentFilter=filter;list.innerHTML='';let any=false;
  if(filter==='fav'){
    const favCount=allRecipes().filter(r=>favs.has(r.name)).length;
    const b=document.createElement('div');b.className='fav-banner';
    if(favCount===0)b.innerHTML=tr('favEmpty');
    else b.innerHTML=`${trf('favHave',favCount)}<br><button id="favToCart">${tr('favToCart')}</button>`;
    list.appendChild(b);
    const ftc=document.getElementById('favToCart');
    if(ftc)ftc.addEventListener('click',()=>{allRecipes().filter(r=>favs.has(r.name)).forEach(r=>addIngredientsToCart(recIng(r)));ftc.textContent=tr('favAllAdded');});
  }
  formatOrder.forEach(cat=>{
    const items=allRecipes().filter(r=>r.cat===cat && matchFilter(r,filter));
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
说明:分组仍按 `r.sub`(中文,稳定 key);子标题显示用 `recSub(first)`(同组共享 sub_en)。

- [ ] **Step 7: app.js 改骰子文案(137 行)**

```js
  diceResult.textContent=trf('diceResult',recName(pick));diceResult.classList.add('show');
```

- [ ] **Step 8: app.js 改 renderCart 空清单与计数(145、147 行)**

```js
  if(cart.length===0)cartList.innerHTML=`<li class="cart-empty">${tr('cartEmpty')}</li>`;
```
```js
  const left=cart.filter(x=>!x.done).length;cartBadge.textContent=left;cartBadge.classList.toggle('show',left>0);cartCount.textContent=trf('cartLeft',left);
```

- [ ] **Step 9: app.js 同步态文案(23、25 行)与登录消息(49-73 行)、AI 文案(172-191 行)改用字典**

`syncUp`:
```js
  syncDot.textContent=tr('syncing');
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,updated_at:new Date().toISOString()});
  syncDot.textContent=error?(tr('syncFail')+error.message):tr('synced');
```
登录处理器各 `setMsg(...)` 改为字典:`需要邮箱密码`→`setMsg(tr('needEmailPw'),true)`;`登录中…`→`setMsg(tr('signingIn'))`;`登录失败：`→`setMsg(tr('signInFail')+error.message,true)`;`请输入邮箱，密码至少 6 位`→`setMsg(tr('needPw6'),true)`;`注册中…`→`setMsg(tr('signingUp'))`;`注册失败：`→`setMsg(tr('signUpFail')+error.message,true)`;注册成功提示→`setMsg(tr('signUpOk'),false)`;`跳转到 Google…`→`setMsg(tr('googleRedirect'))`;`Google 登录失败：`→`setMsg(tr('googleFail')+error.message,true)`。
`aiGenerate` 文案:`正在生成「desc」…`→`aiStatus.textContent=trf('aiGenerating',desc)`;401/其它→`aiStatus.textContent=resp.status===401?tr('aiExpired'):tr('aiFail')`;成功→`aiStatus.textContent=trf('aiAdded',rec.name)`;catch→`aiStatus.textContent=tr('aiNetErr')`。

- [ ] **Step 10: 浏览器冒烟验证(内容渲染)**

硬刷新后登录。验证:
1. 点 `EN`:卡片主标题变英文(如 Cheeseburger),副标题显示中文菜名;分类名/描述、蛋白质标签、`材料`标签、按钮(Save/Add to list/Delete)、骰子结果、收藏横幅、买菜计数全英文。
2. `BUILTIN` 的材料此时仍中文(因 ing_en 未填)——这是预期回退,不应空白。
3. 点 `中`:全部切回中文。
4. 控制台 `preview_eval`/手动检查无报错。

- [ ] **Step 11: Commit**

```bash
git add data.js app.js
git commit -m "feat(i18n): 取字段函数 + pInfo/formats 双语 + 卡片与动态文案按语言渲染"
```

---

## Task 3: 填充全部 BUILTIN 的 sub_en 与 ing_en(数据)

给 `data.js` 中 `BUILTIN` 每道菜补 `sub_en`、`ing_en`。纯数据任务。完成后 EN 模式内置菜全英文。

**Files:**
- Modify: `data.js`(`BUILTIN` 数组每个对象加两字段)

- [ ] **Step 1: 按对照表给每道菜加 sub_en**

`sub` 是有限集合,用此对照表(逐字一致,放在 sub 之后):

| 中文 sub | sub_en |
|---|---|
| 经典款 | Classic |
| 异国特色 | International |
| 冷三明治 | Cold sandwiches |
| 热压三明治 | Pressed & grilled |
| 长面包·潜艇 | Subs & hoagies |
| 美洲卷 | American wraps |
| 中东·旋转烤肉卷 | Middle Eastern (rotisserie) |
| 亚洲卷 | Asian rolls |
| 炒饭 | Fried rice |
| 盖饭·丼 | Rice bowls (donburi) |
| 拌饭 | Mixed rice |
| 煲仔·焖饭 | Claypot & braised rice |
| 手抓饭·香饭 | Pilaf & spiced rice |
| 饭团·饭卷 | Rice balls & rolls |
| 汤面 | Noodle soups |
| 拌面·炒面 | Tossed & fried noodles |
| 粥 | Congee |
| 汤饭·泡饭 | Soup rice |
| 蒸包·夹饼 | Buns & bao |
| 饺子 | Dumplings |
| 蒸炸点心 | Dim sum (steamed & fried) |
| 烧烤串 | Skewers & grills |
| 油炸·煎烙小吃 | Fried & griddled snacks |
| 米食甜点 | Rice desserts |
| 冰品 | Frozen treats |
| 糕饼 | Cakes & pastries |

- [ ] **Step 2: 给每道菜加 ing_en**

规则:把 `ing` 里以 `、` 分隔的每个中文材料译成常见英文名,用 `, `(逗号空格)连接,**保持原顺序与项数**;括号注释(如「（瓦煲焦底）」「（不炸）」)译成英文括注;「或」译为 `or`。示例:
```js
// 美式芝士汉堡 ing:'牛肉饼、切达芝士、生菜、番茄、洋葱、酸黄瓜、汉堡胚、番茄酱'
ing_en:'Beef patty, cheddar, lettuce, tomato, onion, pickles, bun, ketchup'
// 越南法包 ing:'法棍、烤猪肉、腌萝卜胡萝卜、黄瓜、香菜、辣椒、蛋黄酱'
ing_en:'Baguette, roast pork, pickled daikon & carrot, cucumber, cilantro, chili, mayo'
// 广式煲仔饭 ing:'米饭、腊肠、腊肉或鸡、青菜、酱油、葱（瓦煲焦底）'
ing_en:'Rice, Chinese sausage, cured pork or chicken, greens, soy sauce, scallion (crispy claypot bottom)'
```
对全部 ~100 道菜执行。常见食材统一译法:米饭=Rice、鸡蛋/蛋=egg、葱=scallion、蒜=garlic、洋葱=onion、生菜=lettuce、番茄=tomato、黄瓜=cucumber、酱油=soy sauce、麻油=sesame oil、芝士=cheese、蛋黄酱=mayo、辣椒=chili、香菜=cilantro、海苔=nori、米粉=rice noodles、面=noodles。

- [ ] **Step 3: 浏览器冒烟验证(数据完整)**

硬刷新,登录,切 `EN`。控制台执行检查每道菜都已补字段:
```js
BUILTIN.filter(r=>!r.sub_en||!r.ing_en).map(r=>r.name)
```
预期返回 `[]`(空数组)。逐类目测若干卡片:材料应为英文逗号分隔,无中文残留、无空白。切 `中` 材料恢复中文。

- [ ] **Step 4: Commit**

```bash
git add data.js
git commit -m "feat(i18n): 补全所有内置菜谱的 sub_en 与 ing_en 英文数据"
```

---

## Task 4: 语言偏好云同步

把 `lang` 纳入 Supabase 同步:已登录用户切换语言后云端记住,换设备生效。

**Files:**
- Modify: `app.js`(`syncUp` upsert 带 lang;`loadData` select 与采用 lang)
- 外部(用户手动): `alter table user_data add column lang text;`

- [ ] **Step 1: syncUp upsert 带上 lang(第 24 行)**

```js
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,lang:lang,updated_at:new Date().toISOString()});
```

- [ ] **Step 2: loadData 读取并采用云端 lang(28-32 行)**

```js
async function loadData(){
  const {data,error}=await sb.from('user_data').select('favorites,customs,cart,lang').eq('user_id',userId).maybeSingle();
  if(data){
    favs=new Set(data.favorites||[]);customRecipes=data.customs||[];cart=data.cart||[];
    if(data.lang==='zh'||data.lang==='en'){lang=data.lang;localStorage.setItem('lang',lang);document.documentElement.lang=(lang==='en')?'en':'zh-CN';applyUI();}
  }
  else{favs=new Set();customRecipes=[];cart=[];await syncUp();}
}
```
说明:`onAuthed` 在 `loadData` 之后才 `render('all')`,所以这里改 `lang` 后界面会随后续渲染生效;`applyUI()` 立即刷新已存在的 chrome。

- [ ] **Step 3: 用户手动加列(部署前提)**

在 Supabase 控制台 SQL 编辑器执行(本步骤由用户完成,实现者在验证前提醒):
```sql
alter table user_data add column lang text;
```
RLS 策略基于 `user_id`,新列自动受保护,无需改策略。

- [ ] **Step 4: 浏览器冒烟验证(同步)**

加好列后:登录 → 切 `EN` → 等 `syncDot` 显示 `✓ 已云端同步`/`✓ Synced`。控制台:
```js
(async()=>{const{data}=await sb.from('user_data').select('lang').eq('user_id',userId).maybeSingle();console.log(data);})()
```
预期 `{lang:'en'}`。再 `localStorage.removeItem('lang');location.reload();` 重新登录后应仍是英文(云端采用)。

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(i18n): 语言偏好纳入 Supabase 云同步（user_data.lang）"
```

---

## Task 5: AI 加菜双语

让 AI 代理一并生成英文字段,自定义菜也双语。

**Files:**
- Modify: `supabase/functions/ai-recipe/index.ts`(prompt + 返回值加 en/type_en/ing_en)
- Modify: `app.js`(`aiGenerate` 把英文字段存入 custom recipe)
- 外部(用户手动):重新部署函数

- [ ] **Step 1: 改 Edge Function prompt 与返回字段**

`supabase/functions/ai-recipe/index.ts` 中 `prompt` 增加英文字段要求,`return json({...})` 增加三个英文字段。prompt 改为:
```ts
  const prompt =
    `根据这句话描述一道菜，只输出一个 JSON 对象，不要任何多余文字或 markdown 代码块。` +
    `字段：name(中文菜名), en(英文菜名), type(中文小分类，如 炸物/盖饭/汤面/卷类/甜品/小吃), type_en(对应英文小分类), ` +
    `p(数组，从这些蛋白质里选适用的：pork,chicken,beef,sea,egg,tofu；纯素或主要是淀粉就用 ["tofu"]), ` +
    `ing(中文主要材料，用顿号、分隔，6到10样), ing_en(对应英文材料，用逗号 , 分隔，与 ing 一一对应)。描述：${desc}`;
```
`obj` 类型与返回值:
```ts
  let obj: { name?: string; en?: string; type?: string; type_en?: string; p?: string[]; ing?: string; ing_en?: string };
  try {
    obj = JSON.parse(text);
  } catch {
    return json({ error: "AI 返回格式异常" }, 502);
  }

  return json({
    name: obj.name ?? "",
    en: obj.en ?? "",
    type: obj.type ?? "",
    type_en: obj.type_en ?? "",
    p: Array.isArray(obj.p) ? obj.p : [],
    ing: obj.ing ?? "",
    ing_en: obj.ing_en ?? "",
  });
```

- [ ] **Step 2: app.js aiGenerate 存英文字段(第 185 行)**

```js
    const rec={id:'c'+Date.now(),cat:'custom',sub:obj.type||'AI 生成',sub_en:obj.type_en||'AI generated',flag:'⭐',name:obj.name||desc,en:obj.en||'',p,ing:obj.ing||'',ing_en:obj.ing_en||'',custom:true};
```

- [ ] **Step 3: 用户手动重新部署函数(验证前提)**

实现者提醒用户在仓库根目录执行:
```
supabase functions deploy ai-recipe --project-ref dmrxlnvgwjqiwkjgsgcp
```

- [ ] **Step 4: 浏览器冒烟验证(AI 双语)**

部署后,硬刷新,登录,开「✨ 一句话加菜谱」,输入「韩式甜辣炸鸡」。验证:
1. 中文模式下卡片显示中文名与中文材料。
2. 切 `EN`:该自定义菜显示英文名、英文小分类、英文材料(不回退中文)。
3. 旧的纯中文自定义菜(若有)在 EN 模式回退中文,不空白。

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/ai-recipe/index.ts app.js
git commit -m "feat(i18n): AI 加菜代理一并生成中英字段，自定义菜双语"
```

---

## 收尾

全部任务完成后,用 superpowers:finishing-a-development-branch 收尾(推送 + PR)。提醒用户:Task 4 的 `alter table` 与 Task 5 的函数重新部署需其手动执行;CLAUDE.md「可能的下一步」可勾掉/更新双语相关项(可选)。
