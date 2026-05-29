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
  syncDot.textContent='☁️ 同步中…';
  const {error}=await sb.from('user_data').upsert({user_id:userId,favorites:[...favs],customs:customRecipes,cart:cart,updated_at:new Date().toISOString()});
  syncDot.textContent=error?('⚠️ 同步失败：'+error.message):'✓ 已云端同步';
  setTimeout(()=>{if(syncDot.textContent.startsWith('✓'))syncDot.textContent='';},1800);
}
async function loadData(){
  const {data,error}=await sb.from('user_data').select('favorites,customs,cart').eq('user_id',userId).maybeSingle();
  if(data){favs=new Set(data.favorites||[]);customRecipes=data.customs||[];cart=data.cart||[];}
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
  if(!email||!pw){setMsg('请输入邮箱和密码',true);return;}
  setMsg('登录中…');
  const {data,error}=await sb.auth.signInWithPassword({email,password:pw});
  if(error){setMsg('登录失败：'+error.message,true);return;}
  if(data.session)onAuthed(data.session);
});
document.getElementById('signUpBtn').addEventListener('click',async()=>{
  const email=document.getElementById('loginEmail').value.trim(),pw=document.getElementById('loginPw').value;
  if(!email||pw.length<6){setMsg('请输入邮箱，密码至少 6 位',true);return;}
  setMsg('注册中…');
  const {data,error}=await sb.auth.signUp({email,password:pw});
  if(error){setMsg('注册失败：'+error.message,true);return;}
  if(data.session){onAuthed(data.session);}
  else{setMsg('注册成功！如开启了邮箱确认，请先去邮箱点确认链接，再回来登录。',false);}
});
document.getElementById('userChip').addEventListener('click',async()=>{
  await sb.auth.signOut();userId=null;userEmail=null;favs=new Set();customRecipes=[];cart=[];
  document.getElementById('userChip').style.display='none';syncDot.textContent='';
  document.getElementById('loginPw').value='';showLogin();
});
document.getElementById('googleBtn').addEventListener('click',async()=>{
  setMsg('跳转到 Google…');
  const back=window.location.href.split('#')[0].split('?')[0];
  const {error}=await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:back}});
  if(error)setMsg('Google 登录失败：'+error.message,true);
});
// 处理 Google 跳转回来后的登录
sb.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_IN' && session && session.user.id!==userId) onAuthed(session);
});

/* ====== 渲染 ====== */
function ptagsHtml(p){let t=p.map(x=>`<span class="ptag">${pInfo[x]||x}</span>`).join('');if(p.length>=2)t+=`<span class="ptag" style="background:#fcefcf;color:#c9962e;">🍲混合</span>`;return t;}
function matchFilter(r,f){if(f==='all')return true;if(f==='fav')return favs.has(r.name);if(f==='mix')return r.p.length>=2;return r.p.includes(f);}
function makeCard(r){
  const card=document.createElement('div');card.className='card';card.dataset.name=r.name;
  const faved=favs.has(r.name);
  card.innerHTML=`
    <div class="card-top">
      <div class="name"><span class="flag">${r.flag}</span>${r.name}<span class="en">${r.en||''}</span></div>
      <div class="ptags">${ptagsHtml(r.p)}</div>
    </div>
    <div class="ing"><span class="lab">材料</span>${r.ing}</div>
    <div class="card-actions">
      <button class="act-btn act-fav ${faved?'on':''}">${faved?'♥ 已收藏':'♡ 收藏'}</button>
      <button class="act-btn act-cart">🛒 加入买菜清单</button>
      ${r.custom?'<button class="act-btn act-del">✕ 删除</button>':''}
    </div>`;
  const favBtn=card.querySelector('.act-fav');
  favBtn.addEventListener('click',()=>{
    if(favs.has(r.name))favs.delete(r.name);else favs.add(r.name);
    saveFavs();
    if(currentFilter==='fav'){render('fav');}else{const on=favs.has(r.name);favBtn.classList.toggle('on',on);favBtn.textContent=on?'♥ 已收藏':'♡ 收藏';}
  });
  const cartBtn=card.querySelector('.act-cart');
  cartBtn.addEventListener('click',()=>{addIngredientsToCart(r.ing);cartBtn.classList.add('added');cartBtn.textContent='✓ 已加入';setTimeout(()=>{cartBtn.classList.remove('added');cartBtn.textContent='🛒 加入买菜清单';},1500);});
  if(r.custom){card.querySelector('.act-del').addEventListener('click',()=>{customRecipes=customRecipes.filter(x=>x.id!==r.id);favs.delete(r.name);saveCustom();render(currentFilter);});}
  return card;
}
function render(filter){
  currentFilter=filter;list.innerHTML='';let any=false;
  if(filter==='fav'){
    const favCount=allRecipes().filter(r=>favs.has(r.name)).length;
    const b=document.createElement('div');b.className='fav-banner';
    if(favCount===0)b.innerHTML='还没有收藏～ 点菜品上的 ♡ 收藏，就会出现在这里。';
    else b.innerHTML=`你收藏了 <b>${favCount}</b> 道<br><button id="favToCart">🛒 把全部收藏的材料加入买菜清单</button>`;
    list.appendChild(b);
    const ftc=document.getElementById('favToCart');
    if(ftc)ftc.addEventListener('click',()=>{allRecipes().filter(r=>favs.has(r.name)).forEach(r=>addIngredientsToCart(r.ing));ftc.textContent='✓ 已全部加入清单';});
  }
  formatOrder.forEach(cat=>{
    const items=allRecipes().filter(r=>r.cat===cat && matchFilter(r,filter));
    if(items.length===0)return;any=true;
    const c=formats[cat];
    const label=document.createElement('div');label.className='cat-label';
    label.innerHTML=`<span class="em">${c.em}</span>${c.name}<span class="count">${items.length} 种</span>`;list.appendChild(label);
    const d=document.createElement('p');d.className='cat-desc';d.textContent=c.desc;list.appendChild(d);
    const subs=[];items.forEach(r=>{if(!subs.includes(r.sub))subs.push(r.sub);});
    subs.forEach(sub=>{const sl=document.createElement('div');sl.className='sub-label';sl.textContent=sub;list.appendChild(sl);const grid=document.createElement('div');grid.className='card-grid';items.filter(r=>r.sub===sub).forEach(r=>grid.appendChild(makeCard(r)));list.appendChild(grid);});
  });
  if(!any && filter!=='fav') list.innerHTML='<p class="empty">这个蛋白质下暂时没有菜，换一个试试 🍳</p>';
}
document.getElementById('filters').addEventListener('click',e=>{if(!e.target.classList.contains('chip'))return;document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));e.target.classList.add('active');render(e.target.dataset.filter);});

const diceResult=document.getElementById('diceResult');
document.getElementById('diceBtn').addEventListener('click',()=>{
  document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');render('all');
  const pool=allRecipes();const pick=pool[Math.floor(Math.random()*pool.length)];
  diceResult.textContent=`→ 今天就做「${pick.name}」吧！`;diceResult.classList.add('show');
  setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===pick.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},120);
});

/* ====== 买菜清单 ====== */
const cartList=document.getElementById('cartList'),cartBadge=document.getElementById('cartBadge'),cartCount=document.getElementById('cartCount');
function renderCart(){
  cartList.innerHTML='';
  if(cart.length===0)cartList.innerHTML='<li class="cart-empty">清单空空的～<br>手动添加，或在菜里点「加入买菜清单」</li>';
  else cart.forEach(item=>{const li=document.createElement('li');li.className='cart-item'+(item.done?' done':'');li.innerHTML=`<span class="cart-check${item.done?' done':''}">${item.done?'✓':''}</span><span class="cart-text">${item.text}</span><button class="cart-del">✕</button>`;li.querySelector('.cart-check').addEventListener('click',()=>{item.done=!item.done;saveCart();renderCart();});li.querySelector('.cart-del').addEventListener('click',()=>{cart=cart.filter(x=>x.id!==item.id);saveCart();renderCart();});cartList.appendChild(li);});
  const left=cart.filter(x=>!x.done).length;cartBadge.textContent=left;cartBadge.classList.toggle('show',left>0);cartCount.textContent=`还要买 ${left} 样`;
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
  aiStatus.textContent='正在生成「'+desc+'」…';
  try{
    const resp=await fetch(`${SUPABASE_URL}/functions/v1/ai-recipe`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':SUPABASE_KEY},
      body:JSON.stringify({desc})
    });
    if(!resp.ok){
      aiStatus.textContent=resp.status===401?'登录已过期，请重新登录':'AI 生成失败，请换个描述再试';
      return;
    }
    const obj=await resp.json();
    let p=(Array.isArray(obj.p)?obj.p:[]).filter(x=>PSET.includes(x));if(p.length===0)p=['tofu'];
    const rec={id:'c'+Date.now(),cat:'custom',sub:obj.type||'AI 生成',flag:'⭐',name:obj.name||desc,en:obj.en||'',p,ing:obj.ing||'',custom:true};
    customRecipes.unshift(rec);saveCustom();
    aiInput.value='';aiStatus.textContent='已加入「⭐ 我的菜谱」：'+rec.name;
    document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));document.querySelector('[data-filter="all"]').classList.add('active');
    render('all');closePanel(aiOv,aiP);
    setTimeout(()=>{const card=[...document.querySelectorAll('.card')].find(c=>c.dataset.name===rec.name);if(card){card.classList.add('flash');card.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>card.classList.remove('flash'),1400);}},150);
  }catch(e){aiStatus.textContent='网络错误，请稍后再试';}
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
