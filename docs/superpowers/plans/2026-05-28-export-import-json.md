# 导出 / 导入 JSON 备份 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 EverydayRecipe 加一个无后端的数据备份/搬家功能——把收藏、自定义菜、买菜清单导出成 `.json`，并能从该文件合并导入。

**Architecture:** 入口是用户名 chip 改成的下拉菜单（导出备份 / 导入备份 / 退出登录）。导出用浏览器原生 `Blob` + `<a download>`；导入用隐藏 `<input type=file>` + `FileReader`，解析后按规则合并（收藏按名、自定义菜按 id、清单按文字去重），再 `persist()` 推到 Supabase 并重渲染。新增一个轻量 `showToast` 做反馈。

**Tech Stack:** 纯原生 HTML / CSS / JavaScript（非 module，全局作用域共享），无构建、无依赖。Supabase 仅用于同步，不参与本功能的核心逻辑。

---

## 项目特殊说明（务必先读）

- **没有测试框架**：本项目零构建、无 `package.json`、无测试运行器。每个任务的「验证」步骤是**手动浏览器测试**，不是自动化测试。
- **本地起服务**：`file://` 直接打开会加载不了同目录 js。在仓库根目录跑 `python -m http.server 8000`，浏览器开 `http://localhost:8000`。改完代码要硬刷新（Ctrl+Shift+R）。
- **登录依赖**：导出/导入只在登录后可用（菜单只在登录后显示）。验证时需用邮箱登录一个 Supabase 账号。
- **脚本顺序不可改**：`supabase → data.js → app.js`，都不是 module，别改成 `type="module"`。
- **文案全中文**，保持 4 文件结构（逻辑进 `app.js`、样式进 `styles.css`、结构进 `index.html`）。
- 工作目录为 worktree：`C:\Users\Leonz\OneDrive\桌面\Personal\Projects\EverydayRecipe\.claude\worktrees\laughing-yonath-1fd6d3`。所有相对路径基于此。
- 提交不带 `Co-Authored-By` 署名（项目已设 `includeCoAuthoredBy:false`）。

## 文件结构（本功能会改的文件）

- `index.html` —— 把 `#userChip` 包进下拉菜单容器；新增菜单项、隐藏文件 input、toast 容器。
- `styles.css` —— 下拉菜单样式 + toast 样式。
- `app.js` —— `showToast`、菜单开合、导出函数、导入+合并函数；退出登录逻辑从 chip 迁到菜单项。

每个任务都是自包含的小改动，做完手动验证再提交。

---

## Task 1: 轻量 toast（showToast）

先做 toast，因为后面导出/导入/报错都要用它。

**Files:**
- Modify: `index.html`（在 `</body>` 前加 toast 容器）
- Modify: `styles.css`（文件末尾加样式）
- Modify: `app.js`（文件末尾加函数）

- [ ] **Step 1: 在 index.html 加 toast 容器**

在 `index.html` 里 `<button class="cart-fab" ...>` 那一行之前（约 63 行），加一行：

```html
<div class="toast" id="toast" role="status" aria-live="polite"></div>
```

- [ ] **Step 2: 在 styles.css 末尾加 toast 样式**

```css
/* ====== 轻量 toast ====== */
.toast{
  position:fixed; left:50%; bottom:88px; transform:translateX(-50%) translateY(12px);
  max-width:86vw; padding:12px 18px; border-radius:12px;
  background:rgba(30,28,26,.94); color:#fff; font-size:14px; line-height:1.5;
  box-shadow:0 8px 28px rgba(0,0,0,.28); z-index:2000;
  opacity:0; pointer-events:none; transition:opacity .25s, transform .25s; text-align:center;
}
.toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
```

- [ ] **Step 3: 在 app.js 末尾加 showToast 函数**

```javascript
/* ====== 轻量 toast ====== */
let _toastT;
function showToast(msg){
  const el=document.getElementById('toast');
  if(!el)return;
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastT);
  _toastT=setTimeout(()=>el.classList.remove('show'),2600);
}
```

- [ ] **Step 4: 手动验证**

起本地服务 `python -m http.server 8000`，开 `http://localhost:8000`，硬刷新。打开浏览器控制台（F12 → Console），输入：

```javascript
showToast('测试提示 ✓')
```

期望：页面底部中间淡入一条深色提示条，约 2.6 秒后淡出。

- [ ] **Step 5: 提交**

```bash
git add index.html styles.css app.js
git commit -m "feat: 新增轻量 toast 提示"
```

---

## Task 2: 用户名下拉菜单（含退出迁移）

把当前「点 chip 直接退出」改成「点 chip 展开菜单」，菜单含三项：导出备份、导入备份、退出登录。本任务先把菜单壳和退出迁移做好；导出/导入两项的具体逻辑在 Task 3、4 接上（本任务里它们先只关闭菜单）。

**当前代码参考：**
- `index.html:36` 是 `<button class="user-chip" id="userChip" style="display:none">👤 <span id="userName"></span> · 退出</button>`
- `app.js:64-68` 是 chip 的点击退出逻辑：

```javascript
document.getElementById('userChip').addEventListener('click',async()=>{
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  document.getElementById('userChip').style.display='none';syncDot.textContent='';
  document.getElementById('loginPw').value='';showLogin();
});
```

- `app.js:37` 用 `document.getElementById('userChip').style.display='inline-flex';` 显示 chip（登录后）。

**Files:**
- Modify: `index.html:36`
- Modify: `styles.css`（末尾加菜单样式）
- Modify: `app.js:64-68`（替换退出逻辑为菜单逻辑）

- [ ] **Step 1: 改 index.html 的 chip 为菜单结构**

把 `index.html:36` 整行替换为：

```html
    <div class="user-menu" id="userMenu" style="display:none">
      <button class="user-chip" id="userChip">👤 <span id="userName"></span> <span class="chip-caret">▾</span></button>
      <div class="user-dropdown" id="userDropdown" hidden>
        <button class="udd-item" id="exportBtn">⬇ 导出备份</button>
        <button class="udd-item" id="importBtn">⬆ 导入备份</button>
        <button class="udd-item udd-danger" id="signOutBtn">退出登录</button>
      </div>
    </div>
    <input type="file" id="importFile" accept="application/json,.json" hidden>
```

注意：原来 chip 自带 `style="display:none"`，现在改成由外层 `#userMenu` 控制显隐；chip 文案去掉「· 退出」，加一个 `▾` 箭头。

- [ ] **Step 2: 改 app.js 里显示 chip 的那行（约 37 行）**

把：

```javascript
  document.getElementById('userChip').style.display='inline-flex';
```

改为：

```javascript
  document.getElementById('userMenu').style.display='inline-flex';
```

- [ ] **Step 3: 替换 app.js:64-68 的退出逻辑为菜单逻辑**

把 Task 2 开头列出的 `userChip` 点击监听整段（约 64-68 行）替换为：

```javascript
const userDropdown=document.getElementById('userDropdown');
function closeUserMenu(){userDropdown.hidden=true;}
function toggleUserMenu(){userDropdown.hidden=!userDropdown.hidden;}
document.getElementById('userChip').addEventListener('click',(e)=>{e.stopPropagation();toggleUserMenu();});
document.addEventListener('click',(e)=>{if(!e.target.closest('#userMenu'))closeUserMenu();});
document.getElementById('signOutBtn').addEventListener('click',async()=>{
  closeUserMenu();
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  document.getElementById('userMenu').style.display='none';syncDot.textContent='';
  document.getElementById('loginPw').value='';showLogin();
});
document.getElementById('exportBtn').addEventListener('click',()=>{closeUserMenu();/* Task 3 接上导出 */});
document.getElementById('importBtn').addEventListener('click',()=>{closeUserMenu();/* Task 4 接上导入 */});
```

- [ ] **Step 4: 在 styles.css 末尾加菜单样式**

```css
/* ====== 用户名下拉菜单 ====== */
.user-menu{ position:relative; display:inline-flex; }
.chip-caret{ font-size:.85em; opacity:.7; margin-left:2px; }
.user-dropdown{
  position:absolute; top:calc(100% + 8px); right:0; min-width:160px;
  background:#fff; border:1px solid rgba(0,0,0,.08); border-radius:12px;
  box-shadow:0 10px 30px rgba(0,0,0,.16); padding:6px; z-index:1500;
  display:flex; flex-direction:column;
}
.user-dropdown[hidden]{ display:none; }
.udd-item{
  text-align:left; background:none; border:none; cursor:pointer;
  padding:10px 12px; border-radius:8px; font-size:14px; color:#2a2724;
}
.udd-item:hover{ background:rgba(0,0,0,.05); }
.udd-danger{ color:#b3261e; }
```

- [ ] **Step 5: 手动验证**

硬刷新并登录。期望：
1. 右上角显示 `👤 邮箱 ▾`。
2. 点它弹出下拉菜单：导出备份 / 导入备份 / 退出登录。
3. 点菜单外任意处，菜单收起。
4. 点「退出登录」→ 回到登录框，chip 消失。
5. 点「导出备份」「导入备份」目前只收起菜单（逻辑后续接上），不报错。控制台无报错。

- [ ] **Step 6: 提交**

```bash
git add index.html styles.css app.js
git commit -m "feat: 用户名 chip 改为下拉菜单，退出收进菜单"
```

---

## Task 3: 导出备份

**Files:**
- Modify: `app.js`（末尾加 `exportBackup`；并把 Task 2 里 `exportBtn` 的占位回调换成调用它）

- [ ] **Step 1: 在 app.js 末尾加 exportBackup 函数**

```javascript
/* ====== 导出 / 导入备份 ====== */
function exportBackup(){
  const payload={
    app:'EverydayRecipe',
    version:1,
    exportedAt:new Date().toISOString(),
    favorites:[...favs],
    customs:customRecipes,
    cart:cart
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const d=new Date();
  const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const a=document.createElement('a');
  a.href=url; a.download=`everydayrecipe-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast('已导出备份文件 ⬇');
}
```

- [ ] **Step 2: 把 Task 2 里 exportBtn 的占位回调接上**

在 `app.js` 中找到（Task 2 写入的）：

```javascript
document.getElementById('exportBtn').addEventListener('click',()=>{closeUserMenu();/* Task 3 接上导出 */});
```

替换为：

```javascript
document.getElementById('exportBtn').addEventListener('click',()=>{closeUserMenu();exportBackup();});
```

- [ ] **Step 3: 手动验证**

硬刷新、登录。先随便收藏一两道菜、往买菜清单加一两样（让数据非空）。打开用户菜单 → 点「导出备份」。期望：
1. 浏览器下载一个 `everydayrecipe-backup-2026-05-28.json`（日期为当天）。
2. 底部弹 toast「已导出备份文件 ⬇」。
3. 打开下载的文件，确认结构为 `{app:"EverydayRecipe",version:1,exportedAt,favorites:[...],customs:[...],cart:[...]}`，且 `favorites` 含刚收藏的菜名、`cart` 含刚加的项。

- [ ] **Step 4: 提交**

```bash
git add app.js
git commit -m "feat: 导出备份为 JSON 文件"
```

---

## Task 4: 导入备份（合并）

合并规则：收藏按菜名去重并集；自定义菜按 `id` 去重追加；清单按 `text` 去重（沿用 `addCartItem`，新项 `done=false`）。导入后 `persist()` 推 Supabase、重渲染、toast 报告新增数量。非法文件不动任何数据。

**当前代码参考：**
- `app.js:149` `function addCartItem(text){const t=text.trim();if(!t)return;if(cart.some(x=>x.text===t&&!x.done))return;cart.push({id:Date.now()+Math.random(),text:t,done:false});}`
- `saveFavs/saveCustom/saveCart` 都只是调 `persist()`（`app.js:16-19`）。
- `render(filter)`（`app.js:108`）重渲染列表，`renderCart()`（`app.js:143`）重渲染清单与角标。
- `currentFilter`（`app.js:11`）是当前筛选。

**Files:**
- Modify: `app.js`（末尾加 `importBackup`；接上 `importBtn` 与隐藏 `#importFile` 的 change）

- [ ] **Step 1: 在 app.js 末尾加 importBackup 函数**

```javascript
function importBackup(file){
  const reader=new FileReader();
  reader.onload=()=>{
    let data;
    try{ data=JSON.parse(reader.result); }
    catch(e){ showToast('文件格式不对，导入失败'); return; }
    if(!data || typeof data!=='object' ||
       !(Array.isArray(data.favorites)||Array.isArray(data.customs)||Array.isArray(data.cart))){
      showToast('文件格式不对，导入失败'); return;
    }
    let addedF=0, addedC=0, addedK=0;
    // 收藏：按菜名并集
    (Array.isArray(data.favorites)?data.favorites:[]).forEach(n=>{
      if(typeof n==='string' && !favs.has(n)){ favs.add(n); addedF++; }
    });
    // 自定义菜：按 id 去重追加
    const ids=new Set(customRecipes.map(c=>c.id));
    (Array.isArray(data.customs)?data.customs:[]).forEach(c=>{
      if(c && c.id!=null && !ids.has(c.id)){ customRecipes.push(c); ids.add(c.id); addedC++; }
    });
    // 清单：按 text 去重（沿用 addCartItem），新项 done=false
    (Array.isArray(data.cart)?data.cart:[]).forEach(it=>{
      if(it && typeof it.text==='string'){
        const before=cart.length;
        addCartItem(it.text);
        if(cart.length>before) addedK++;
      }
    });
    persist();
    render(currentFilter);
    renderCart();
    showToast(`已导入：收藏 +${addedF}，自定义菜 +${addedC}，清单 +${addedK}`);
  };
  reader.onerror=()=>showToast('文件读取失败');
  reader.readAsText(file);
}
```

- [ ] **Step 2: 接上 importBtn 与隐藏文件 input**

在 `app.js` 中找到（Task 2 写入的）：

```javascript
document.getElementById('importBtn').addEventListener('click',()=>{closeUserMenu();/* Task 4 接上导入 */});
```

替换为：

```javascript
document.getElementById('importBtn').addEventListener('click',()=>{
  closeUserMenu();
  const inp=document.getElementById('importFile');
  inp.value=''; // 允许重复选同一文件
  inp.click();
});
document.getElementById('importFile').addEventListener('change',(e)=>{
  const f=e.target.files&&e.target.files[0];
  if(f) importBackup(f);
});
```

- [ ] **Step 3: 手动验证（合并正确性）**

硬刷新、登录。准备：先 Task 3 导出一份当前数据作为 `backup.json`。然后：

1. **重复导入不翻倍**：直接导入刚导出的 `backup.json`。期望 toast 显示「收藏 +0，自定义菜 +0，清单 +0」（全是已有的，去重生效），数据没变多。
2. **新增能合并**：手动编辑 `backup.json`，在 `favorites` 加一个不存在的菜名（如 `"测试收藏菜"`）、在 `cart` 加 `{"id":1,"text":"测试买的","done":false}`。再导入。期望 toast「收藏 +1，自定义菜 +0，清单 +1」；切到「♥ 我的收藏」能看到计数+1；打开买菜清单能看到「测试买的」。
3. **非法文件不破坏数据**：随便选一个非 JSON 文件（如一张图片）或内容为 `hello` 的 txt 改名成 `.json` 导入。期望 toast「文件格式不对，导入失败」，且收藏/清单数据一条没变。
4. 控制台全程无报错。导入后稍等，右上角同步点出现「✓ 已云端同步」（说明 persist 生效）。

- [ ] **Step 4: 提交**

```bash
git add app.js
git commit -m "feat: 导入备份并按规则合并收藏/自定义菜/买菜清单"
```

---

## 自检清单（实现完成后过一遍）

- [ ] spec 的 5 块（入口菜单 / 导出 / 导入合并 / 错误处理 / 落点）都有对应 Task。
- [ ] 收藏按名、自定义菜按 id、清单按 text 三条去重规则都实现且验证过。
- [ ] 非法/空文件不修改任何状态（验证过）。
- [ ] 退出登录从 chip 迁到菜单项后仍正常工作。
- [ ] 文案全中文；未引入任何依赖；未改成 ES module；4 文件结构未变。
- [ ] 提交不含 Co-Authored-By。
