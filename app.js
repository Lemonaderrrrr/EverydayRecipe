/* 应用逻辑：Supabase 登录/同步、渲染、筛选、收藏、买菜清单、AI 加菜。 */
/* ====== Supabase ====== */
const SUPABASE_URL='https://dmrxlnvgwjqiwkjgsgcp.supabase.co';
const SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcnhsbnZnd2pxaXdramdzZ2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwMTcxMzAsImV4cCI6MjA5NTU5MzEzMH0.yWl1Sfn9P5KnDjZVFn0XUS3-24OFiSGsueokYd-3BIA';
const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

/* ====== 数据 ====== */
const list=document.getElementById('list');

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
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>{el.setAttribute('aria-label',tr(el.dataset.i18nAria));});
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
function recName(r){return lang==='en'?(r.en||r.name):r.name;}      // 卡片主标题
function recAlt(r){return lang==='en'?r.name:(r.en||'');}            // 副标题（另一语言）
function recIng(r){return lang==='en'?(r.ing_en||r.ing):r.ing;}     // 材料（缺英文回退中文）
function recSub(r){return lang==='en'?(r.sub_en||r.sub):r.sub;}     // 子类
function fmtName(c){return lang==='en'?(c.name_en||c.name):c.name;}
function fmtDesc(c){return lang==='en'?(c.desc_en||c.desc):c.desc;}
function ptagLabel(x){const e=pInfo[x];return e?(e[lang]||e.zh):x;}

/* ====== 用户态 + 云同步 ====== */
let userId=null, userEmail=null, favs=new Set(), customRecipes=[], cart=[], currentFilter='all';
const syncDot=document.getElementById('syncDot');
function allRecipes(){return customRecipes.concat(BUILTIN);}

let _t;
function persist(){ if(!userId)return; clearTimeout(_t); _t=setTimeout(syncUp,500); }
function saveFavs(){persist();}
function saveCustom(){persist();}
function saveCart(){persist();}

async function syncUp(){
  if(!userId)return;
  syncDot.textContent=tr('syncing');
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,lang:lang,updated_at:new Date().toISOString()});
  syncDot.textContent=error?(tr('syncFail')+error.message):tr('synced');
  setTimeout(()=>{if(syncDot.textContent.startsWith('✓'))syncDot.textContent='';},1800);
}
async function loadData(){
  const {data,error}=await sb.from('user_data').select('favorites,customs,cart,lang').eq('user_id',userId).maybeSingle();
  if(data){favs=new Set(data.favorites||[]);customRecipes=data.customs||[];cart=data.cart||[];
    if(data.lang==='zh'||data.lang==='en'){lang=data.lang;localStorage.setItem('lang',lang);document.documentElement.lang=(lang==='en')?'en':'zh-CN';applyUI();}}
  else{favs=new Set();customRecipes=[];cart=[];await syncUp();}
}

async function onAuthed(session){
  userId=session.user.id;userEmail=session.user.email;
  document.getElementById('userName').textContent=userEmail;
  document.getElementById('userChip').style.display='inline-flex';
  document.getElementById('loginOverlay').classList.add('hidden');
  await loadData();
  renderCart();render('all');
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
  document.querySelector('[data-filter="all"]').classList.add('active');
}
function showLogin(){document.getElementById('loginOverlay').classList.remove('hidden');setTimeout(()=>document.getElementById('loginEmail').focus(),50);}
function setMsg(t,err){const m=document.getElementById('loginMsg');m.textContent=t;m.classList.toggle('err',!!err);}

document.getElementById('signInBtn').addEventListener('click',async()=>{
  const email=document.getElementById('loginEmail').value.trim(),pw=document.getElementById('loginPw').value;
  if(!email||!pw){setMsg(tr('needEmailPw'),true);return;}
  setMsg(tr('signingIn'));
  const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
  if(error){setMsg(tr('signInFail')+error.message,true);return;}
  if(data.session)onAuthed(data.session);
});
document.getElementById('signUpBtn').addEventListener('click',async()=>{
  const email=document.getElementById('loginEmail').value.trim(),pw=document.getElementById('loginPw').value;
  if(!email||pw.length<6){setMsg(tr('needPw6'),true);return;}
  setMsg(tr('signingUp'));
  const {data,error}=await sb.auth.signUp({email,password:pw});
  if(error){setMsg(tr('signUpFail')+error.message,true);return;}
  if(data.session){onAuthed(data.session);}
  else{setMsg(tr('signUpOk'),false);}
});
document.getElementById('userChip').addEventListener('click',async()=>{
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  document.getElementById('userChip').style.display='none';syncDot.textContent='';
  document.getElementById('loginPw').value='';showLogin();
});
document.getElementById('googleBtn').addEventListener('click',async()=>{
  setMsg(tr('googleRedirect'));
  const back=window.location.href.split('#')[0].split('?')[0];
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:back}});
  if(error)setMsg(tr('googleFail')+error.message,true);
});
// 处理 Google 跳转回来后的登录
sb.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_IN' && session && session.user.id!==userId) onAuthed(session);
});

/* ====== 渲染 ====== */
function ptagsHtml(p){let t=p.map(x=>`<span class="ptag">${ptagLabel(x)}</span>`).join('');if(p.length>=2)t+=`<span class="ptag" style="background:#fcefcf;color:#c9962e;">${tr('mix')}</span>`;return t;}
function matchFilter(r,f){if(f==='all')return true;if(f==='fav')return favs.has(r.name);if(f==='mix')return r.p.length>=2;return r.p.includes(f);}
function makeCard(r){
  const card=document.createElement('div');card.className='card';card.dataset.name=r.name;
  const faved=favs.has(r.name);
  card.innerHTML=`
    <div class="card-top">
      <div class="name">${r.custom?`<span class="flag">${r.flag}</span>`:''}${recName(r)}<span class="en">${recAlt(r)}</span></div>
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
document.getElementById('filters').addEventListener('click',e=>{if(!e.target.classList.contains('chip'))return;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));e.target.classList.add('active');render(e.target.dataset.filter);});

const diceResult=document.getElementById('diceResult');
document.getElementById('diceBtn').addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');render('all');
  const pool=allRecipes();const pick=pool[Math.floor(Math.random()*pool.length)];
  diceResult.textContent=trf('diceResult',recName(pick));diceResult.classList.add('show');
  setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===pick.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},120);
});

/* ====== 买菜清单 ====== */
const cartList=document.getElementById('cartList'),cartBadge=document.getElementById('cartBadge'),cartCount=document.getElementById('cartCount');
function renderCart(){
  cartList.innerHTML='';
  if(cart.length===0)cartList.innerHTML=`<li class="cart-empty">${tr('cartEmpty')}</li>`;
  else cart.forEach(item=>{const li=document.createElement('li');li.className='cart-item'+(item.done?' done':'');li.innerHTML=`<span class="cart-check${item.done?' done':''}">${item.done?'✓':''}</span><span class="cart-text">${item.text}</span><button class="cart-del">✕</button>`;li.querySelector('.cart-check').addEventListener('click',()=>{item.done=!item.done;saveCart();renderCart();});li.querySelector('.cart-del').addEventListener('click',()=>{cart=cart.filter(x=>x.id!==item.id);saveCart();renderCart();});cartList.appendChild(li);});
  const left=cart.filter(x=>!x.done).length;cartBadge.textContent=left;cartBadge.classList.toggle('show',left>0);cartCount.textContent=trf('cartLeft',left);
}
function addCartItem(text){const t=text.trim();if(!t)return;if(cart.some(x=>x.text===t&&!x.done))return;cart.push({id:Date.now()+Math.random(),text:t,done:false});}
function addIngredientsToCart(ingStr){ingStr.split(/[、,]/).forEach(part=>{let n=part.replace(/（.*?）/g,'').trim();n=n.replace(/或.*$/,'').trim();if(n)addCartItem(n);});saveCart();renderCart();}
document.getElementById('cartAdd').addEventListener('click',()=>{const inp=document.getElementById('cartInput');addCartItem(inp.value);inp.value='';saveCart();renderCart();inp.focus();});
document.getElementById('cartInput').addEventListener('keydown',e=>{if(e.key==='Enter'){addCartItem(e.target.value);e.target.value='';saveCart();renderCart();}});
document.getElementById('cartClear').addEventListener('click',()=>{cart=cart.filter(x=>!x.done);saveCart();renderCart();});

/* ====== 面板开关 ====== */
function openPanel(ov,p){ov.classList.add('open');p.classList.add('open');}
function closePanel(ov,p){ov.classList.remove('open');p.classList.remove('open');}
const cartOv=document.getElementById('cartOverlay'),cartP=document.getElementById('cartPanel');
document.getElementById('cartFab').addEventListener('click',()=>openPanel(cartOv,cartP));
document.getElementById('cartClose').addEventListener('click',()=>closePanel(cartOv,cartP));
cartOv.addEventListener('click',()=>closePanel(cartOv,cartP));
const aiOv=document.getElementById('aiOverlay'),aiP=document.getElementById('aiPanel'),aiInput=document.getElementById('aiInput'),aiStatus=document.getElementById('aiStatus');
document.getElementById('aiOpen').addEventListener('click',()=>{if(!userId){showLogin();return;}openPanel(aiOv,aiP);setTimeout(()=>aiInput.focus(),50);});
document.getElementById('aiClose').addEventListener('click',()=>closePanel(aiOv,aiP));
aiOv.addEventListener('click',()=>closePanel(aiOv,aiP));

/* ====== AI 一句话加菜 ====== */
async function aiGenerate(){
  const desc=aiInput.value.trim();if(!desc)return;
  const {data:{session}}=await sb.auth.getSession();
  if(!session){showLogin();return;}
  aiStatus.textContent=trf('aiGenerating',desc);
  try{
    const resp=await fetch(`${SUPABASE_URL}/functions/v1/ai-recipe`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_KEY},
      body:JSON.stringify({desc})
    });
    if(!resp.ok){
      aiStatus.textContent=resp.status===401?tr('aiExpired'):tr('aiFail');
      return;
    }
    const obj=await resp.json();
    let p=(Array.isArray(obj.p)?obj.p:[]).filter(x=>PSET.includes(x));if(p.length===0)p=['tofu'];
    const rec={id:'c'+Date.now(),cat:'custom',sub:obj.type||'AI 生成',sub_en:obj.type_en||'AI generated',flag:'⭐',name:obj.name||desc,en:obj.en||'',p,ing:obj.ing||'',ing_en:obj.ing_en||'',custom:true};
    customRecipes.unshift(rec);saveCustom();
    aiInput.value='';aiStatus.textContent=trf('aiAdded',recName(rec));
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');
    render('all');closePanel(aiOv,aiP);
    setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===rec.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},150);
  }catch(e){aiStatus.textContent=tr('aiNetErr');}
}
document.getElementById('aiGo').addEventListener('click',aiGenerate);
aiInput.addEventListener('keydown',e=>{if(e.key==='Enter')aiGenerate();});

/* ====== 启动 ====== */
(async function init(){
  document.documentElement.lang=(lang==='en')?'en':'zh-CN';
  applyUI();
  const {data:{session}}=await sb.auth.getSession();
  if(session&&session.user){onAuthed(session);}else{showLogin();}
})();
