# 用户画像 + 定制快餐大全 设计文档

> 状态：设计已与用户对齐，待用户复审后转 writing-plans。
> 日期：2026-05-29

## 目标

首次登录做一次口味测试判断用户画像 → 生成一个**无缝的个性化「快餐大全」**，让用户以为全部菜品都是 AI 为他定制的。实际是**半生成**：

- 按画像**删减**现有内置菜（用户感知不到有内置库）
- AI **联网生成** ~15 道符合画像的新菜
- 两者**混排、不标任何区分**

## 核心决策（已与用户确认）

| 决策点 | 结论 |
|--------|------|
| 定制大全产出 | AI 生成一批新菜（不是纯筛选） |
| 是否联网 | AI + 联网搜索（智谱 `web_search` 工具） |
| 画像维度 | 5 维：工作/生活状态、蛋白质偏好/忌口、口味、饮食限制、菜系兴趣 |
| 与内置菜共存 | 全部混起来不做区分，内置菜也按画像删减，营造「全是定制」错觉 |
| 生成时机 | 测一次→生成一次→存云端，之后只读；重测才重新生成 |
| 测试触发 | 首次登录后强制做一次（profile 为空即触发） |
| 生成数量 | 约 15 道 |
| 旧功能（一句话加菜 + 菜谱码） | 保留不动，并存；手动菜仍带 ⭐ 可删 |
| 生成引擎 | 方案 A：新建 `ai-catalog` Edge Function，一次出一批 |

## 1. 数据模型

`user_data` 表新增 2 列（用户需在 Supabase SQL 编辑器执行）：

```sql
alter table user_data add column profile jsonb;
alter table user_data add column generated jsonb;
```

已有列 `favorites / customs / cart / lang` 不变。

### profile 结构

```js
{
  v: 1,                                  // 版本号，便于将来迁移
  mode: 'efficient' | 'explorer',        // 工作/生活状态：效率型 vs 探索型
  proteins: {
    like:  [...],                        // 取自 PSET 的子集
    avoid: [...]                         // 忌口蛋白质（硬约束）
  },
  taste: {
    spicy: 0 | 1 | 2 | 3,                // 辣度：不吃/微/中/重
    sweet: bool, sour: bool, salty: bool
  },
  diet: [...],                           // 'vegetarian'|'halal'|'no_pork'|'no_seafood'（硬约束，可空）
  cuisines: [...]                        // 'asian'|'sea'|'mideast'|'western'|'explore'
}
```

### generated 结构

数组，每项字段与 BUILTIN 同构，外加内部标记 `gen:true`：

```js
{ cat, sub, sub_en, name, en, p:[...], ing, ing_en, gen:true }
```

**关键**：不带 `custom:true`、不带 `flag`。这样 `makeCard()` 会把它当内置菜渲染——无 ⭐、无删除按钮，与内置菜外观完全一致。

## 2. 测试 UI

- 登录后 `loadData()` 完成时，若 `profile` 为空 → 弹全屏测试 overlay（复用 `login-overlay` 的全屏遮罩风格，独立 DOM 块 `#quizOverlay`）。
- 5 组选择题，每组用现有 `.chip` 样式：
  1. **状态**（单选）：效率型学生党/上班族 · 有时间探索的美食家/居家型
  2. **蛋白质**：喜欢哪些（多选 PSET）/ 不吃哪些（多选 PSET）
  3. **口味**：辣度（不吃辣/微辣/中辣/重辣 单选）+ 偏甜/偏酸/偏咸（多选）
  4. **饮食限制**（多选）：素食 · 清真 · 不吃猪肉 · 海鲜过敏 · 无
  5. **菜系兴趣**（多选）：亚洲 · 东南亚 · 中东 · 欧美 · 想多探索
- 底部按钮「✨ 生成我的定制大全」。
- 点击后切换到加载态：「正在为你定制专属快餐大全…」+ 动画，盖住整页直到生成完成或失败。

## 3. 生成流程

1. 收集 5 题答案 → 组装 `profile` 对象。
2. 写入 `profile` 并 `syncUp()`。
3. `POST {profile}` 给 `${SUPABASE_URL}/functions/v1/ai-catalog`，带 `Authorization: Bearer <access_token>` 和 `apikey`。
4. Edge Function 调智谱 GLM（挂 `web_search` 工具联网），提示词要求：
   - 返回**一个 JSON 数组**，约 15 道。
   - 每道字段：`cat`（必须属于 formatOrder：burger/sandwich/wrap/rice/noodle/congee/bundump/snack/dessert）、`sub`、`sub_en`、`name`、`en`、`p`（数组，取自 pork/chicken/beef/sea/egg/tofu）、`ing`（中文材料顿号分隔）、`ing_en`。
   - 严格遵守画像中的硬约束（avoid 蛋白质、diet 限制）。
   - 按 mode/taste/cuisines 调整风格（效率型→快手简单；探索型→更精致新颖）。
5. 前端逐道校验清洗：`cat` 合法、`p` 用 `PSET` 过滤（空则回退 `['tofu']`）、按 `name` 去重、丢弃缺 `name` 的项；给每项打 `gen:true`。
6. 存入 `generated` 列，`syncUp()`。
7. 关闭测试 overlay，`render('all')`。

## 4. 删减逻辑

新增 `profileFilter(list, profile)`：

- **硬约束（必删）**：
  - `proteins.avoid` 里的蛋白质 → 删含该蛋白质的菜
  - `diet` 含 `vegetarian` → 只留 `p ⊆ ['tofu','egg']`（蛋奶素）
  - `diet` 含 `no_pork` 或 `halal` → 删 `p` 含 `pork`
  - `diet` 含 `no_seafood` → 删 `p` 含 `sea`
- **软偏好（打分控量）**：按 `taste`/`cuisines`/`mode` 给剩余内置菜打分，保留高分约 40 道，删掉明显不合口味的，让目录像「为你精选」。
- profile 为空时返回全量（向后兼容 / 万一无画像）。

`allRecipes()` 改为：

```js
function allRecipes(){ return customsManual.concat(generated, profileFilter(BUILTIN, profile)); }
```

- `customsManual` = 现有手动 customs（带 ⭐，一句话加菜/菜谱码导入的），保持可删。
- **收藏视图（fav filter）不走删减**：收藏的菜始终显示，避免被收藏却被删的菜消失。

## 5. 渲染

`makeCard()` 无需改动：

- 内置菜、generated 菜：无 `custom`/`flag` → 渲染为普通卡片（无 ⭐、无删除）。
- 手动 customs：有 `custom:true`+`flag:'⭐'` → 带 ⭐ 和删除按钮。

## 6. 重测（设置面板）

设置面板新增「🎯 重新测口味」按钮 → 重新弹测试 overlay → 完成后：

- **替换** `generated`（旧生成菜整批丢弃）
- 更新 `profile`
- 收藏 / 购物车 / 手动菜全部保留

## 7. 错误处理

- 生成失败 / 超时 / 返回脏数据 / 0 道有效 → 测试页显示「生成失败，请重试」+ 重试按钮；**不写入空 generated**（避免把用户锁在空大全）。
- 401 → 提示登录过期，回登录页。
- 离线 / fetch 异常 → 「网络错误，稍后再试」。
- 向后兼容：老用户（已有数据、无 profile）登录后照常触发强制测试。

## 8. 后端

新增 `supabase/functions/ai-catalog/index.ts`：

- 仿现有 `ai-recipe`：`verify_jwt` 默认开启（靠网关挡未登录）、同款 CORS、读 `Deno.env.get("ZHIPU_API_KEY")`（已配）。
- 接收 `{profile}`，组装提示词，调智谱 `https://open.bigmodel.cn/api/paas/v4/chat/completions`，挂 `web_search` 工具（具体参数实现时对照智谱最新文档确认，预期形如 `tools:[{type:'web_search', web_search:{enable:true}}]`）。
- 解析模型返回的 JSON 数组并回传。

**用户需执行的部署动作**（实现完成后）：
- Supabase SQL：`alter table user_data add column profile jsonb;` 和 `add column generated jsonb;`
- 确认智谱账号已开通/可用 web_search 工具
- `supabase functions deploy ai-catalog`

## 9. i18n

新增一批中英 UI 键：测试 5 题的标题与选项、加载文案、生成失败/重试、重测按钮等。沿用现有 `UI={key:{zh,en}}` + `data-i18n` 机制。

## 10. 测试 / 验证

无测试框架，验证 = `node --check data.js && node --check app.js` + 浏览器冒烟：

- 新用户：登录 → 强制测试 → 加载 → 看到混合大全
- 重测：替换生成菜，画像更新
- 忌口/饮食限制的菜不出现在大全
- 收藏视图不受删减影响
- 旧功能仍正常：一句话加菜（⭐+删除）、菜谱码导入导出、购物车、中英切换、随机高亮

## 文件改动清单（预估）

- **新增** `supabase/functions/ai-catalog/index.ts` —— 批量生成 Edge Function
- **改** `index.html` —— 新增 `#quizOverlay` 测试/加载 DOM；设置面板加「重新测口味」按钮
- **改** `styles.css` —— 测试页/加载态样式（尽量复用现有 chip/overlay）
- **改** `data.js` —— 新增测试/加载相关 UI 字典键
- **改** `app.js` —— 画像状态、测试流程、生成调用、`profileFilter`、`allRecipes` 改造、重测、云同步加 profile/generated
