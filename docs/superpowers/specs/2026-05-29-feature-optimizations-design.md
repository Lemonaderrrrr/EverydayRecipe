# 功能优化（去国籍 / 随机高亮 / 菜谱码导入导出）设计文档

**日期:** 2026-05-29
**功能:** 四项优化合为一期 —— ① 去掉美食的国籍标记;② 随机选菜后高亮放大被选卡片;③ 用文本码导出/导入 AI 生成的菜谱;④ 新增右上角「设置」面板,把语言切换、登录登出、菜谱码导入导出都收进去。

## 目标与背景
- 现有 app 每道菜带国旗 emoji、分类描述里提到国家/地域 —— 用户希望弱化「国籍」属性,让它更像一份纯粹的快餐清单。
- 随机选菜(🎲)已有 flash 阴影 + 滚动,但不够醒目,希望放大 + 高亮并自动淡出。
- AI 生成的自定义菜目前只能本地/云端属于自己,用户希望能把自己生成的菜分享给别人、也能导入别人分享的。

## 关键决策
1. **去国籍范围:** 同时去掉 ①卡片上的国旗 emoji(内置菜)②分类描述里的国家/地域措辞。自定义菜的 `⭐` 标记保留。`r.flag` 数据字段保留不删(渲染层不再显示内置菜国旗)。
2. **随机高亮:** 滚动到视野中央 + 放大(scale)+ 柿子色高亮,约 3 秒后自动淡出。骰子与 AI 加菜共用同一个 `highlightCard()`。
3. **导入导出形态:** 复制/粘贴**文本码**(非文件)。`ERX1:` 前缀 + base64(JSON)。导入按 `name+ing` 去重、重分配 `id`。
4. **设置面板:** 右上角新增固定的「⚙️」按钮(与右下角 🛒 同一种浮动按钮 + 滑出面板风格)。面板内含三块:账号(邮箱 + 退出登录)、语言(中/EN,从头部挪入)、菜谱分享(导出/导入,即功能③)。头部移除 `lang-toggle` 与 `user-chip`,只留 `sync-dot` 同步状态。
5. **登录流程不变:** 首次进入仍强制弹出登录框(给将来的「定制 onboarding」留空间);设置里的退出登录走原有 `signOut` 逻辑,退出后照常弹回登录框。
6. **零依赖:** 全部纯原生 JS/CSS,不加任何库或构建步骤。
7. **范围:** 四项功能写成一份 spec + 一份实现计划一起做。

## 架构与改动

### 功能① 去掉国籍

**data.js — `formats` 的 `desc`/`desc_en`(去掉国家/地域措辞):**
- `wrap`: `desc:'薄饼或皮塔卷馅,包法多样。'` / `desc_en:'Flatbread or pita wraps, many styles.'`
- `rice`: `desc:'主食里的核心:炒、盖、拌、煲、抓、团。'` / `desc_en:'A staple at the center of the meal: fried, bowls, mixed, claypot, pilaf, balls.'`
- `dessert`: `desc:'米食、冰品、糕饼等甜点。'` / `desc_en:'Rice desserts, frozen treats, and pastries.'`
- 其余大类(custom/burger/sandwich/noodle/congee/bundump/snack)描述本就无国家,**不动**。

**app.js — `makeCard`(只对自定义菜显示 flag):**
```js
// 原: <div class="name"><span class="flag">${r.flag}</span>${recName(r)}<span class="en">${recAlt(r)}</span></div>
// 新: 只有 r.custom 时渲染 flag(⭐),内置菜不显示国旗
<div class="name">${r.custom?`<span class="flag">${r.flag}</span>`:''}${recName(r)}<span class="en">${recAlt(r)}</span></div>
```
`r.flag` 字段在 data.js 中保留(无需逐条删除),仅渲染层条件化。

### 功能② 随机高亮放大

**app.js — 新增共用函数,替换骰子(line ~175)和 AI 加菜(line ~227)里重复的 flash 块:**
```js
function highlightCard(name){
  const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===name);
  if(!card)return;
  card.classList.add('picked');
  card.scrollIntoView({behavior:'smooth',block:'center'});
  setTimeout(()=>card.classList.remove('picked'),3000);
}
```
- 骰子 handler:把 `setTimeout(...flash...)` 替换为 `setTimeout(()=>highlightCard(pick.name),120);`
- AI 加菜:把 `setTimeout(...flash...)` 替换为 `setTimeout(()=>highlightCard(rec.name),150);`

**styles.css — 用 `.picked` 取代旧 `.flash`(放大 + 高亮 + 平滑过渡):**
```css
.card{transition:transform .35s ease, box-shadow .35s ease;}
.card.picked{transform:scale(1.06);box-shadow:0 0 0 3px var(--persimmon,#e06a3c),0 10px 28px rgba(217,83,30,.28);position:relative;z-index:5;}
```
移除旧的 `.card.flash{...}` 与 `@keyframes flash`。

### 功能④ 设置面板(承载语言/账号/分享)

**index.html — 头部精简:**
- 删除头部里的 `<div class="lang-toggle">…</div>` 与 `<button class="user-chip" id="userChip">…</button>`(都挪进设置面板);保留 `<div class="sync-dot" id="syncDot">`。

**index.html — 新增右上角设置按钮(紧挨已有的 `#cartFab` 之后):**
```html
<button class="settings-fab" id="settingsFab" data-i18n-aria="settingsAria" aria-label="设置">⚙️</button>
```

**index.html — 新增设置面板(与 cart/AI 面板同结构,放在 `#aiPanel` 之后):**
```html
<div class="ov" id="settingsOverlay"></div>
<div class="panel" id="settingsPanel">
  <div class="p-head"><div class="p-title" data-i18n="settingsTitle">⚙️ 设置</div><button class="p-close" id="settingsClose">✕</button></div>

  <div class="set-sec">
    <div class="set-label" data-i18n="setAccount">账号</div>
    <div class="set-account"><span id="setEmail"></span></div>
    <button class="ghost" id="setLogout" data-i18n="logout">退出登录</button>
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
注意:`lang-toggle` 整块原样挪进设置面板,**保留 class `lang-toggle` 和 `data-lang` 按钮**,这样 app.js 里既有的 `.lang-toggle button` 事件绑定与 `applyUI()` 高亮逻辑无需改动。

**app.js — 设置面板开关 + 账号区:**
```js
const setOv=document.getElementById('settingsOverlay'),setP=document.getElementById('settingsPanel');
document.getElementById('settingsFab').addEventListener('click',()=>{document.getElementById('setEmail').textContent=userEmail||'';openPanel(setOv,setP);});
document.getElementById('settingsClose').addEventListener('click',()=>closePanel(setOv,setP));
setOv.addEventListener('click',()=>closePanel(setOv,setP));
```
- **退出登录** `#setLogout`:沿用原 `userChip` 的退出逻辑(`sb.auth.signOut()` + 清空 `favs/customRecipes/cart` + `syncDot.textContent=''` + 清空密码框 + `showLogin()`),并先 `closePanel(setOv,setP)`。原 `#userChip` 的 click 监听删除(元素已移除)。
- `onAuthed` 里原本 `document.getElementById('userChip').style.display='inline-flex'` 这一行删除(元素不存在);邮箱在打开设置时写入 `#setEmail`。

### 功能③ 菜谱码导出/导入(UI 在设置面板的「菜谱分享」区,见上)

**app.js — 编解码 + 导出 + 导入:**
```js
function encodeRecipes(arr){return 'ERX1:'+btoa(unescape(encodeURIComponent(JSON.stringify(arr))));}
function decodeRecipes(code){
  const m=String(code).trim();
  if(!m.startsWith('ERX1:'))throw new Error('bad');
  const json=decodeURIComponent(escape(atob(m.slice(5))));
  const arr=JSON.parse(json);
  if(!Array.isArray(arr))throw new Error('bad');
  return arr;
}
```
- **导出** `#aiExport`:`aiCode.value=encodeRecipes(customRecipes)`;若 `customRecipes` 为空给提示。`#aiCopy` 用 `navigator.clipboard.writeText`,失败兜底 `aiCode.select()`。
- **导入** `#aiDoImport`:`decodeRecipes(aiCode.value)` → 逐条校验(对象且有 `name`、`ing`) → 规范化为标准 rec 形(`cat:'custom'`,`flag:'⭐'`,`custom:true`,缺字段回退) → 按已有 `customRecipes` 的 `name+ing` 去重跳过重复 → 每条重分配 `id:'c'+Date.now()+随机` → `customRecipes.unshift(...新菜)` → `saveCustom()` → 切到「全部」并 `render('all')`。状态提示导入了几条、跳过几条。失败给中英错误提示。

**UI 字典(data.js `UI`)新增双语键:**
- 设置面板:`settingsAria`、`settingsTitle`、`setAccount`、`setLang`、`setShare`。(`logout` 键已存在,复用作「退出登录」。)
- 分享:`aiExport`、`aiCopy`、`aiDoImport`、`phCode`、`aiCopied`、`aiExportEmpty`、`aiImportBad`、`aiImportEmpty`、`aiImportDone`(带 `{n}` 占位)。

**styles.css 新增:** `.settings-fab`(固定右上角,样式对称于 `.cart-fab` 右下角)、`.set-sec`、`.set-label`、`.set-account`、`.ai-share-row`、`.ai-code`、`.ai-share-actions`、`.ai-share-status`(沿用现有 panel 风格)。

## 数据结构
- 不改 `customRecipes` 的形状(沿用 `{id,cat:'custom',sub,sub_en,flag:'⭐',name,en,p:[],ing,ing_en,custom:true}`)。
- 不动 Supabase 表结构 —— 导入后的菜照常进 `customs` 列随 `persist()` 同步。

## 错误处理 / 边界
- **导入码格式错/解码失败/JSON 解析失败:** catch 后给「菜谱码无效」中英提示,不抛出。
- **导入空/全是重复:** 提示「没有可导入的新菜谱」。
- **导出时无自定义菜:** 提示「你还没有 AI 生成的菜谱」。
- **clipboard 不可用(http/旧浏览器):** 兜底 `select()` 让用户手动复制。
- **缺字段的导入项:** name 缺失则跳过该项;ing 缺失回退空串;p 过滤非法值,空则 `['tofu']`(与 aiGenerate 一致)。

## 测试(无框架,浏览器冒烟 —— 用户执行)
1. 内置菜卡片不再显示国旗;自定义菜仍显示 ⭐。
2. 分类描述不再出现「亚洲/美洲/中东」等字样(中英都查)。
3. 点骰子:被选卡片放大+高亮+滚动到中央,约 3 秒后自动恢复。
4. AI 加菜成功后新菜同样高亮放大。
5. 头部不再有 中/EN 按钮和用户名 chip;右上角出现 ⚙️ 按钮。
6. 点 ⚙️ 打开设置面板:账号区显示当前邮箱;语言区中/EN 可切换且当前语言高亮;退出登录 → 弹回登录框。
7. 导出:设置面板里点导出 → 文本框出现 `ERX1:` 开头的码 → 复制成功提示。
8. 导入:把码粘到文本框(或清空 customs 后)→ 确认导入 → 菜谱出现、计数正确、重复被跳过。
9. 导入无效码 → 友好错误提示,不崩。
10. `node --check data.js && node --check app.js` 通过。

## 不做(YAGNI)
- 不删 data.js 里的 `r.flag` 字段(仅渲染层隐藏)。
- 不做按国家筛选 / 不动副标题、footer、子类名(本期只去分类描述 + 国旗)。
- 不做文件形式导入导出(只做文本码)。
- 不做导入冲突的复杂合并 UI(简单去重 + 跳过即可)。
- 不加任何依赖或构建步骤。
