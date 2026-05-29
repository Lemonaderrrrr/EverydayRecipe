# 功能优化（去国籍 / 随机高亮 / 菜谱码 / 设置面板）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「全球快餐大全」加四项优化：去掉美食国籍、随机选菜高亮放大、AI 菜谱文本码导入导出、右上角设置面板收纳语言/账号/分享。

**Architecture:** 纯原生 HTML/CSS/JS，零依赖零构建，保持 index.html / styles.css / data.js / app.js 四文件结构。设置面板复用现有 `.panel` 滑出组件与 `openPanel/closePanel`。i18n 复用既有 `UI` 字典 + `data-i18n*` 机制。

**Tech Stack:** Vanilla HTML/CSS/JS、Supabase JS（CDN）。无测试框架——验证靠 `node --check` 语法检查 + 浏览器冒烟（冒烟由用户在 GitHub Pages 或 `python -m http.server` 上跑）。

**关键约定（必须遵守）：**
- 提交信息**不要**带 `Co-Authored-By: Claude` trailer（仓库 `.claude/settings.local.json` 已设 `includeCoAuthoredBy:false`）。
- 保持四文件结构，不合并、不改 ES module，加载顺序 supabase CDN → data.js → app.js 不变。
- 不加任何依赖或构建工具。
- 界面文案中英双语，新文案两版都要写。
- data.js、app.js 是普通脚本，共享全局作用域。

**重要：本项目无单元测试框架。** 每个任务的「测试」= 用 `node --check <file>` 验证 JS 语法（CSS/HTML 无此步），外加给用户的浏览器冒烟清单（用户执行，AI 不假装跑浏览器）。`node --check` 只能查 .js；data.js / app.js 顶层有 `const supabase`/`document` 等浏览器全局引用，但 `node --check` **只做语法解析不执行**，所以能安全通过。

---

## 文件结构（本期会改动的文件与职责）

- `index.html` —— 头部移除 `lang-toggle` 与 `user-chip`；新增右上角 `#settingsFab` 按钮与 `#settingsPanel` 设置面板（含账号/语言/分享三块）。
- `styles.css` —— 新增 `.settings-fab`、设置面板分区样式（`.set-sec/.set-label/.set-account`）、分享样式（`.ai-share-row/.ai-code/.ai-share-actions/.ai-share-status`）；功能②把 `.flash` 动画换成 `.picked`（放大+高亮+过渡）。
- `data.js` —— 功能①改写 `formats` 里 3 条带国家的 `desc/desc_en`；`UI` 字典新增设置与分享相关双语键。
- `app.js` —— 功能①`makeCard` 国旗条件化；功能②新增 `highlightCard()` 并替换两处调用；功能④设置面板开关 + 退出登录迁移 + 移除 `userChip` 引用；功能③`encodeRecipes/decodeRecipes` + 导出/复制/导入处理。

任务顺序：Task 1（去国籍）→ Task 2（随机高亮）→ Task 3（设置面板骨架）→ Task 4（菜谱码导入导出，依赖 Task 3 的面板 DOM）。

---

## Task 1: 功能① 去掉美食国籍

**Files:**
- Modify: `data.js`（`formats` 的 wrap/rice/dessert 三行 `desc/desc_en`）
- Modify: `app.js`（`makeCard`，约 line 125）

- [ ] **Step 1: 改写 data.js 三条带国家的分类描述**

`data.js` 里把这三行整行替换（注意中文用全角标点 `，：、`，old_string 必须逐字匹配）：

替换 wrap 行：
```
  wrap:{em:'🌯',name:'卷类',name_en:'Wraps',desc:'薄饼或皮塔卷馅，美洲、中东、亚洲各有风格。',desc_en:'Flatbread or pita wraps — American, Middle Eastern, Asian styles.'},
```
改为：
```
  wrap:{em:'🌯',name:'卷类',name_en:'Wraps',desc:'薄饼或皮塔卷馅，包法多样。',desc_en:'Flatbread or pita wraps, many styles.'},
```

替换 rice 行：
```
  rice:{em:'🍚',name:'饭类',name_en:'Rice',desc:'亚洲餐桌的核心：炒、盖、拌、煲、抓、团。',desc_en:'The heart of the Asian table: fried, bowls, mixed, claypot, pilaf, balls.'},
```
改为：
```
  rice:{em:'🍚',name:'饭类',name_en:'Rice',desc:'主食里的核心：炒、盖、拌、煲、抓、团。',desc_en:'A staple at the center of the meal: fried, bowls, mixed, claypot, pilaf, balls.'},
```

替换 dessert 行：
```
  dessert:{em:'🍰',name:'甜品',name_en:'Desserts',desc:'亚洲甜点：米食、冰品、糕饼。',desc_en:'Asian sweets: rice desserts, frozen treats, pastries.'},
```
改为：
```
  dessert:{em:'🍰',name:'甜品',name_en:'Desserts',desc:'米食、冰品、糕饼等甜点。',desc_en:'Rice desserts, frozen treats, and pastries.'},
```

- [ ] **Step 2: makeCard 让国旗只在自定义菜显示**

`app.js` 的 `makeCard` 里这一行（约 line 125）：
```
      <div class="name"><span class="flag">${r.flag}</span>${recName(r)}<span class="en">${recAlt(r)}</span></div>
```
改为（内置菜不显示国旗，自定义菜保留 `⭐`；用嵌套模板字符串，与同函数 line 132 的删除按钮写法一致）：
```
      <div class="name">${r.custom?`<span class="flag">${r.flag}</span>`:''}${recName(r)}<span class="en">${recAlt(r)}</span></div>
```

- [ ] **Step 3: 语法检查**

Run: `node --check data.js && node --check app.js`
Expected: 无输出、退出码 0（语法正确）。

- [ ] **Step 4: Commit**

```bash
git add data.js app.js
git commit -m "feat: 去掉内置菜国旗与分类描述中的国家措辞"
```

- [ ] **Step 5: 浏览器冒烟（用户执行）**

让用户硬刷新后确认：内置菜卡片不再显示国旗 emoji；自定义（AI）菜仍显示 `⭐`；分类描述里不再出现「亚洲/美洲/中东」（中英都看）。

---

## Task 2: 功能② 随机选菜高亮放大

**Files:**
- Modify: `styles.css`（line 64-65 的 `.flash`/`@keyframes flash`）
- Modify: `app.js`（新增 `highlightCard`；替换骰子 line ~175 与 AI 加菜 line ~227 两处调用）

- [ ] **Step 1: styles.css 用 `.picked` 取代 `.flash`**

把 `styles.css` 这两行（约 line 64-65）：
```
  .card.flash{animation:flash 1.4s ease;}
  @keyframes flash{0%{box-shadow:0 0 0 4px rgba(217,83,30,.45);}100%{box-shadow:0 2px 8px rgba(70,45,20,.04);}}
```
替换为（给卡片加过渡 + 选中态放大并高亮）：
```
  .card{transition:transform .35s ease, box-shadow .35s ease;}
  .card.picked{transform:scale(1.06);box-shadow:0 0 0 3px var(--persimmon,#e06a3c),0 10px 28px rgba(217,83,30,.28);position:relative;z-index:5;}
```

- [ ] **Step 2: app.js 新增 highlightCard 函数**

在 `app.js` 的 `render` 函数结束之后、骰子代码之前（即 `const diceResult=document.getElementById('diceResult');` 这一行之前）插入：
```js
function highlightCard(name){
  const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===name);
  if(!card)return;
  card.classList.add('picked');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>card.classList.remove('picked'),3000);
}
```

- [ ] **Step 3: 替换骰子处理里的旧 flash 块**

`app.js` 骰子 handler 里这一行（约 line 175）：
```js
  setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===pick.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},120);
```
替换为：
```js
  setTimeout(()=>highlightCard(pick.name),120);
```

- [ ] **Step 4: 替换 AI 加菜里的旧 flash 块**

`app.js` `aiGenerate` 里这一行（约 line 227）：
```js
    setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===rec.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},150);
```
替换为：
```js
    setTimeout(()=>highlightCard(rec.name),150);
```

- [ ] **Step 5: 语法检查**

Run: `node --check app.js`
Expected: 无输出、退出码 0。

- [ ] **Step 6: Commit**

```bash
git add styles.css app.js
git commit -m "feat: 随机选菜/AI 加菜高亮放大被选卡片并自动淡出"
```

- [ ] **Step 7: 浏览器冒烟（用户执行）**

点「🎲 随机选一道」：被选卡片放大 + 柿子色描边高亮 + 平滑滚动到视野中央，约 3 秒后自动恢复原样。AI 加菜成功后新菜同样高亮放大。

---

## Task 3: 功能④ 设置面板骨架（语言 + 账号）

**Files:**
- Modify: `index.html`（删头部 `lang-toggle`+`user-chip`；加 `#settingsFab`、`#settingsPanel`）
- Modify: `styles.css`（新增 `.settings-fab` 及设置面板分区样式）
- Modify: `data.js`（`UI` 新增 5 个设置键）
- Modify: `app.js`（设置面板开关 + 退出登录迁移 + 移除 `userChip` 引用）

- [ ] **Step 1: index.html 头部移除语言切换与用户 chip**

删除 `index.html` 头部这两行（保留它们下面的 `sync-dot` 行）：
```html
    <div class="lang-toggle"><button data-lang="zh">中</button><button data-lang="en">EN</button></div>
    <button class="user-chip" id="userChip" style="display:none">👤 <span id="userName"></span> · <span data-i18n="logout">退出</span></button>
```

- [ ] **Step 2: index.html 新增右上角设置按钮**

在 `index.html` 的 `#cartFab` 这一行之后：
```html
<button class="cart-fab" id="cartFab" data-i18n-aria="cartAria" aria-label="买菜清单">🛒<span class="cart-badge" id="cartBadge">0</span></button>
```
紧接着新增：
```html
<button class="settings-fab" id="settingsFab" data-i18n-aria="settingsAria" aria-label="设置">⚙️</button>
```

- [ ] **Step 3: index.html 新增设置面板**

在 `#aiPanel` 这个 `</div>` 之后（即 `<script src="data.js"></script>` 之前）插入。注意 `lang-toggle` 整块原样搬进来，class 和 `data-lang` 不变，这样 app.js 既有的事件绑定与高亮逻辑无需改：
```html
<div class="ov" id="settingsOverlay"></div>
<div class="panel" id="settingsPanel">
  <div class="p-head"><div class="p-title" data-i18n="settingsTitle">⚙️ 设置</div><button class="p-close" id="settingsClose">✕</button></div>

  <div class="set-sec">
    <div class="set-label" data-i18n="setAccount">账号</div>
    <div class="set-account"><span id="setEmail"></span></div>
    <button class="ghost" id="setLogout" data-i18n="logout">退出</button>
  </div>

  <div class="set-sec">
    <div class="set-label" data-i18n="setLang">语言</div>
    <div class="lang-toggle"><button data-lang="zh">中</button><button data-lang="en">EN</button></div>
  </div>

  <div class="set-sec">
    <div class="set-label" data-i18n="setShare">菜谱分享</div>
    <div class="ai-share-row">
      <button class="ghost" id="aiExport" data-i18n="aiExport">导出我的菜谱</button>
    </div>
    <textarea class="ai-code" id="aiCode" data-i18n-ph="phCode" placeholder="菜谱码会显示在这里 / 把别人的码粘贴到这里" rows="3"></textarea>
    <div class="ai-share-actions">
      <button class="ghost" id="aiCopy" data-i18n="aiCopy">复制</button>
      <button class="primary" id="aiDoImport" data-i18n="aiDoImport">确认导入</button>
    </div>
    <div class="ai-share-status" id="aiShareStatus"></div>
  </div>
</div>
```
（`#aiExport`/`#aiCopy`/`#aiDoImport`/`#aiCode`/`#aiShareStatus` 的 JS 行为在 Task 4 接线；本任务它们只是静态元素，点击暂无反应。）

- [ ] **Step 4: styles.css 新增设置按钮与面板分区样式**

在 `styles.css` 的 `.cart-fab:active{...}` 这一行（约 line 93）之后插入：
```css
  .settings-fab{position:fixed;right:18px;top:18px;z-index:40;width:46px;height:46px;border-radius:50%;border:1.5px solid var(--line);cursor:pointer;background:var(--paper);color:var(--ink-soft);font-size:1.2rem;box-shadow:0 4px 14px rgba(70,45,20,.18);transition:transform .18s, color .2s, border-color .2s;display:grid;place-items:center;}
  .settings-fab:hover{transform:scale(1.08);color:var(--persimmon);border-color:var(--persimmon);}
  .settings-fab:active{transform:scale(.95);}
  .set-sec{padding:16px 20px;border-bottom:1px solid var(--line);}
  .set-label{font-size:.78rem;color:var(--ink-soft);font-weight:700;letter-spacing:.04em;margin-bottom:10px;}
  .set-account{font-size:.92rem;color:var(--ink);margin-bottom:10px;word-break:break-all;}
  .ai-share-row{display:flex;gap:8px;margin-bottom:8px;}
  .ai-code{width:100%;box-sizing:border-box;font-family:inherit;font-size:.82rem;padding:10px 12px;border:1.5px solid var(--line);border-radius:12px;background:var(--bg);color:var(--ink);outline:none;resize:vertical;}
  .ai-code:focus{border-color:var(--persimmon);}
  .ai-share-actions{display:flex;gap:8px;margin-top:8px;}
  .ai-share-status{font-size:.8rem;color:var(--ink-soft);margin-top:8px;min-height:18px;}
```

- [ ] **Step 5: data.js 新增设置相关双语键**

`data.js` 的 `UI` 字典里，在 `cartAria` 那一行（约 line 206）之后、结尾 `};` 之前插入：
```js
  settingsAria:{zh:'设置', en:'Settings'},
  settingsTitle:{zh:'⚙️ 设置', en:'⚙️ Settings'},
  setAccount:{zh:'账号', en:'Account'},
  setLang:{zh:'语言', en:'Language'},
  setShare:{zh:'菜谱分享', en:'Share recipes'},
```
（`logout` 键已存在，设置面板的退出按钮复用它。）

- [ ] **Step 6: app.js 移除 onAuthed 里的 userChip/userName 行**

`app.js` 的 `onAuthed` 函数里删除这两行（约 line 73-74）：
```js
  document.getElementById('userName').textContent=userEmail;
  document.getElementById('userChip').style.display='inline-flex';
```
（保留 `userId`/`userEmail` 赋值、`loginOverlay` 隐藏、`loadData`、`render` 等其余行。邮箱改为打开设置时写入 `#setEmail`，见 Step 8。）

- [ ] **Step 7: app.js 移除旧的 userChip 退出监听**

删除 `app.js` 这一整块（约 line 101-105）：
```js
document.getElementById('userChip').addEventListener('click',async()=>{
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  document.getElementById('userChip').style.display='none';syncDot.textContent='';
  document.getElementById('loginPw').value='';showLogin();
});
```

- [ ] **Step 8: app.js 新增设置面板开关与退出登录**

在 `app.js` 的 AI 面板开关块（`aiOv.addEventListener('click',()=>closePanel(aiOv,aiP));` 这一行，约 line 202）之后插入：
```js
/* ====== 设置面板 ====== */
const setOv=document.getElementById('settingsOverlay'),setP=document.getElementById('settingsPanel');
document.getElementById('settingsFab').addEventListener('click',()=>{document.getElementById('setEmail').textContent=userEmail||'';openPanel(setOv,setP);});
document.getElementById('settingsClose').addEventListener('click',()=>closePanel(setOv,setP));
setOv.addEventListener('click',()=>closePanel(setOv,setP));
document.getElementById('setLogout').addEventListener('click',async()=>{
  closePanel(setOv,setP);
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  syncDot.textContent='';document.getElementById('loginPw').value='';showLogin();
});
```
（`openPanel`/`closePanel` 在约 line 193-194 已定义；`syncDot` 在约 line 48 已定义为全局 const，可直接用。）

- [ ] **Step 9: 语法检查**

Run: `node --check data.js && node --check app.js`
Expected: 无输出、退出码 0。

- [ ] **Step 10: Commit**

```bash
git add index.html styles.css data.js app.js
git commit -m "feat: 新增右上角设置面板，收纳语言切换与账号/退出登录"
```

- [ ] **Step 11: 浏览器冒烟（用户执行）**

硬刷新后：头部不再有 中/EN 按钮和用户名 chip；右上角出现 ⚙️。点 ⚙️ 打开设置面板：账号区显示当前登录邮箱；语言区中/EN 可切换且当前语言高亮、切换后整页文案随之变化；点「退出」面板关闭并弹回登录框。

---

## Task 4: 功能③ 菜谱码导出/导入

**Files:**
- Modify: `data.js`（`UI` 新增分享相关双语键）
- Modify: `app.js`（`encodeRecipes/decodeRecipes` + 导出/复制/导入接线）

- [ ] **Step 1: data.js 新增分享相关双语键**

`data.js` 的 `UI` 字典里，在 Task 3 加的 `setShare` 那一行之后、结尾 `};` 之前插入：
```js
  aiExport:{zh:'导出我的菜谱', en:'Export my recipes'},
  aiCopy:{zh:'复制', en:'Copy'},
  aiDoImport:{zh:'确认导入', en:'Import'},
  phCode:{zh:'菜谱码会显示在这里 / 把别人的码粘贴到这里', en:'Code appears here / paste a shared code here'},
  aiCopied:{zh:'✓ 已复制到剪贴板', en:'✓ Copied to clipboard'},
  aiExportEmpty:{zh:'你还没有 AI 生成的菜谱', en:'You have no AI recipes yet'},
  aiImportBad:{zh:'菜谱码无效，请检查后重试', en:'Invalid code, please check and retry'},
  aiImportEmpty:{zh:'没有可导入的新菜谱', en:'No new recipes to import'},
  aiImportDone:{zh:'✓ 导入了 {n} 道菜', en:'✓ Imported {n} recipes'},
```

- [ ] **Step 2: app.js 新增编解码 + 分享接线**

在 `app.js` Task 3 新增的设置面板块（`#setLogout` 监听）之后插入：
```js
/* ====== 菜谱码导出/导入 ====== */
function encodeRecipes(arr){return 'ERX1:'+btoa(unescape(encodeURIComponent(JSON.stringify(arr))));}
function decodeRecipes(code){
  const m=String(code).trim();
  if(!m.startsWith('ERX1:'))throw new Error('bad');
  const arr=JSON.parse(decodeURIComponent(escape(atob(m.slice(5)))));
  if(!Array.isArray(arr))throw new Error('bad');
  return arr;
}
const aiCode=document.getElementById('aiCode'),aiShareStatus=document.getElementById('aiShareStatus');
document.getElementById('aiExport').addEventListener('click',()=>{
  if(customRecipes.length===0){aiShareStatus.textContent=tr('aiExportEmpty');return;}
  aiCode.value=encodeRecipes(customRecipes);aiShareStatus.textContent='';aiCode.focus();aiCode.select();
});
document.getElementById('aiCopy').addEventListener('click',async()=>{
  if(!aiCode.value)return;
  try{await navigator.clipboard.writeText(aiCode.value);}catch(e){aiCode.focus();aiCode.select();}
  aiShareStatus.textContent=tr('aiCopied');
});
document.getElementById('aiDoImport').addEventListener('click',()=>{
  let arr;
  try{arr=decodeRecipes(aiCode.value);}catch(e){aiShareStatus.textContent=tr('aiImportBad');return;}
  let added=0;
  arr.forEach(o=>{
    if(!o||typeof o!=='object'||!o.name)return;
    const ing=o.ing||'';
    if(customRecipes.some(x=>x.name===o.name&&x.ing===ing))return;
    let p=(Array.isArray(o.p)?o.p:[]).filter(x=>PSET.includes(x));if(p.length===0)p=['tofu'];
    customRecipes.unshift({id:'c'+Date.now()+Math.floor(Math.random()*1000),cat:'custom',sub:o.sub||'AI 生成',sub_en:o.sub_en||'AI generated',flag:'⭐',name:o.name,en:o.en||'',p,ing,ing_en:o.ing_en||'',custom:true});
    added++;
  });
  if(added===0){aiShareStatus.textContent=tr('aiImportEmpty');return;}
  saveCustom();
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');
  render('all');
  aiShareStatus.textContent=trf('aiImportDone',added);
  aiCode.value='';
});
```
说明：导入逐条校验为对象且有 `name`；按 `name+ing` 去重；蛋白质过滤非法值、空则回退 `['tofu']`（与 `aiGenerate` 一致）；每条重分配新 `id`。`saveCustom` 已在 app.js 中定义并负责本地存储 + 触发 `persist()` 云同步。

- [ ] **Step 3: 语法检查**

Run: `node --check data.js && node --check app.js`
Expected: 无输出、退出码 0。

- [ ] **Step 4: Commit**

```bash
git add data.js app.js
git commit -m "feat: 设置面板支持 AI 菜谱文本码导出与导入"
```

- [ ] **Step 5: 浏览器冒烟（用户执行）**

1. 先用 AI 加菜生成至少一道自定义菜。
2. 打开 ⚙️ 设置 → 菜谱分享 → 点「导出我的菜谱」：文本框出现以 `ERX1:` 开头的码；点「复制」提示已复制。
3. 把该码原样留在文本框（或换一台设备/账号粘贴），点「确认导入」：提示导入了 N 道；重复的菜被跳过（再点一次「确认导入」应提示「没有可导入的新菜谱」）。
4. 把文本框清空、随便输几个字符再点「确认导入」：提示「菜谱码无效」，页面不报错。

---

## Self-Review 记录

**Spec 覆盖：**
- 功能① 去国旗 + 改 3 条分类描述 → Task 1 ✅（footer「几十个国家」按 spec YAGNI 不动）。
- 功能② highlightCard + .picked + 两处替换 → Task 2 ✅。
- 功能④ 设置面板（账号/语言/分享）+ 头部精简 + 退出迁移 → Task 3 ✅。
- 功能③ 文本码编解码 + 导出/复制/导入 + 去重 + UI 键 → Task 4 ✅。

**占位符扫描：** 无 TBD/TODO；每个改动都给了完整代码与精确位置。

**类型/命名一致性：**
- `highlightCard(name)` 在 Task 2 定义并在同任务两处调用，名称一致。
- 设置面板元素 id（`settingsFab/settingsOverlay/settingsPanel/settingsClose/setEmail/setLogout/aiExport/aiCopy/aiDoImport/aiCode/aiShareStatus`）在 Task 3 的 HTML 与 Task 3/Task 4 的 JS 中一致。
- UI 键（`settingsAria/settingsTitle/setAccount/setLang/setShare`、`aiExport/aiCopy/aiDoImport/phCode/aiCopied/aiExportEmpty/aiImportBad/aiImportEmpty/aiImportDone`）在 data.js 定义、在 HTML 的 `data-i18n*` 与 app.js 的 `tr()/trf()` 中引用，一致。
- `encodeRecipes/decodeRecipes` 前缀同为 `ERX1:`。
- 导入构造的 rec 形与 `aiGenerate` 的 rec 形一致（`cat/sub/sub_en/flag/name/en/p/ing/ing_en/custom/id`）。
