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
