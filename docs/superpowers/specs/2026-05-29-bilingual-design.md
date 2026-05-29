# 中英双语系统 设计文档

**日期:** 2026-05-29
**功能:** 给「全球快餐大全」加中英文双语切换,主要面向英文用户——界面、菜谱内容(标题/子类/材料)、AI 加菜都可用英文阅读。

## 目标与受众
- 主要受众:**不懂中文的英文用户**(朋友/家人)。因此不只翻界面,菜谱材料、分类也要能用英文读懂。
- 深度:**全量双语**(界面 chrome + 菜谱内容 + AI 生成菜)。

## 关键决策
1. **切换方式:** 顶部 `中 / EN` 按钮手动切换,记住选择。
2. **语言判定优先级:** 登录用户云端 `lang` > localStorage 本地选择 > 浏览器语言自动检测(`navigator.language` 以 `zh` 开头→中文,否则→英文)> 兜底中文。
3. **菜谱内容英文来源:** 预翻译,静态存进 `data.js`(方案 A)。离线可用、切换瞬间完成、零运行成本、未登录英文用户也能看。
4. **AI 加菜:** 代理一并生成中英字段,自定义菜也双语。
5. **持久化:** 已登录云同步到 Supabase;未登录存 localStorage。

## 架构

### 语言状态与 i18n 机制(纯原生,零依赖)
- app.js 全局 `lang`(`'zh'` | `'en'`)。加载时按优先级解析一次;切换按钮更新并持久化。
- **界面文案:** data.js 里集中字典 `UI = { key: {zh, en} }`;index.html 元素加 `data-i18n="key"`(占位符用 `data-i18n-ph="key"`)。app.js 的 `applyUI()` 按 `lang` 把文案刷进 DOM。
- **菜谱内容:** 取字段函数 `L(rec, zhKey, enKey)`——`lang==='en'` 取英文字段,否则中文;**英文字段缺失自动回退中文**(绝不空白)。
- `<html lang>` 同步更新为 `zh-CN` / `en`。
- 切换语言 = `applyUI()` + 重渲染当前筛选视图。

## 数据结构改动(data.js)

### 菜谱 `BUILTIN`(~100 道)
每道补 `sub_en`、`ing_en`(`en` 标题已存在)。英文材料用 `, ` 分隔(中文用 `、`)。
```js
{cat:'burger',sub:'经典款',sub_en:'Classic',flag:'🇺🇸',
 name:'美式芝士汉堡',en:'Cheeseburger',p:['beef'],
 ing:'牛肉饼、切达芝士、生菜、番茄、洋葱、酸黄瓜、汉堡胚、番茄酱',
 ing_en:'Beef patty, cheddar, lettuce, tomato, onion, pickles, bun, ketchup'}
```
子类 `sub` 只有约 30 个不同值,用统一对照表保证一致(如「经典款」→ Classic、「异国特色」→ International)。

### 大类 `formats`
每个加 `name_en`、`desc_en`:
```js
burger:{em:'🍔',name:'汉堡',name_en:'Burgers',desc:'肉饼夹圆面包，全球都有本地版本。',desc_en:'A patty in a round bun — every cuisine has its own.'}
```

### 蛋白质 `pInfo`
由 `{pork:'🐷猪',...}` 改为双语对象:
```js
const pInfo={pork:{zh:'🐷猪',en:'🐷Pork'}, chicken:{zh:'🐔鸡',en:'🐔Chicken'},
 beef:{zh:'🐄牛',en:'🐄Beef'}, sea:{zh:'🐟鱼虾',en:'🐟Seafood'},
 egg:{zh:'🥚蛋',en:'🥚Egg'}, tofu:{zh:'🫛豆腐素',en:'🫛Tofu/Veg'}};
```

### 界面字典 `UI`
集中所有界面文案(标题、副标题、按钮、筛选标签、面板标题、占位符、状态提示、footer 等),每条 `{zh, en}`。

## Supabase 改动
`user_data` 表加一列存语言偏好:
```sql
alter table user_data add column lang text;
```
RLS 已覆盖该行,无需改策略。用户在 Supabase SQL 编辑器手动执行。

## 渲染、切换、同步(app.js)
- **顶部切换按钮**(index.html + styles.css):header 加 `中 / EN` 按钮,放在 `user-chip`/`sync-dot` 一排,样式沿用现有 chip(柿子色 accent),高亮当前语言。
- **判定与持久化:** 初次加载先按 `localStorage('lang')` → 浏览器检测 解析(不把浏览器检测结果写入 localStorage,以便区分"手动选过"与"自动猜的")。切换按钮:更新 `lang`、写 localStorage、已登录则 `persist()` 同步云端、刷新界面。
- **同步:** `loadData()` 异步取回云端行后,若 `lang` 存在则按优先级(云端最高)采用并刷新界面;`syncUp()` 的 upsert payload 增加 `lang`。
- **渲染:** `applyUI()` 刷界面文案;`makeCard()` 等用 `L()` 取菜名/子类/材料,蛋白质标签用 `pInfo[p][lang]`;动态文案(随机结果、AI 状态、买菜计数等)读 `UI` 字典。

## AI 代理双语(supabase/functions/ai-recipe/index.ts)
- prompt 增加输出 `en`(英文菜名)、`type_en`、`ing_en`(英文材料,逗号分隔)。
- 函数返回值增加这三字段;前端 `aiGenerate` 一并存进 custom recipe。

## 错误处理 / 边界
- **缺翻译回退:** 任何 `_en` 字段缺失 → 用中文,绝不空白(老的纯中文自定义菜、翻译漏填都安全)。
- **买菜清单:** 清单项是加入时那一刻的语言文本,已有清单不重翻——已知小限制,符合 YAGNI,可接受。
- **未登录:** 语言存 localStorage,照常工作;登录后云端优先。

## 测试(无框架,浏览器冒烟)
用预览 + `preview_eval` 验证:
1. 点按钮中↔英,界面文案和卡片(标题/子类/材料/蛋白质)全切换。
2. 刷新后 localStorage 记住选择。
3. 模拟 `navigator.language` 为 en/zh 时首次默认正确。
4. 故意删一个 `ing_en` 验证回退中文。
5. 登录态下切换后 `lang` 进入同步 payload。

## 不做(YAGNI)
- 不引入 i18n 框架/构建工具(保持纯静态零依赖)。
- 不做第三种语言。
- 不重翻历史买菜清单项。
- 不做 RTL / 复数 / 日期本地化等完整 i18n 特性。
