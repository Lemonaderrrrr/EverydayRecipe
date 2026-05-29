// Supabase Edge Function：AI 一句话加菜代理（接智谱 GLM）。
// verify_jwt 默认开启，未登录请求由网关 401 拦下，函数内无需再校验 JWT。

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

  let desc = "";
  try {
    const body = await req.json();
    desc = typeof body?.desc === "string" ? body.desc.trim() : "";
  } catch {
    return json({ error: "请求体格式错误" }, 400);
  }
  if (!desc) return json({ error: "缺少描述" }, 400);

  const apiKey = Deno.env.get("ZHIPU_API_KEY");
  if (!apiKey) return json({ error: "服务端未配置 API key" }, 500);

  const prompt =
    `根据这句话描述一道菜，只输出一个 JSON 对象，不要任何多余文字或 markdown 代码块。` +
    `字段：name(中文菜名), en(英文菜名), type(中文小分类，如 炸物/盖饭/汤面/卷类/甜品/小吃), type_en(对应英文小分类), ` +
    `p(数组，从这些蛋白质里选适用的：pork,chicken,beef,sea,egg,tofu；纯素或主要是淀粉就用 ["tofu"]), ` +
    `ing(中文主要材料，用顿号、分隔，6到10样), ing_en(对应英文材料，用逗号 , 分隔，与 ing 一一对应)。描述：${desc}`;

  let aResp: Response;
  try {
    aResp = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-4-flash",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    return json({ error: "无法连接 AI 服务" }, 502);
  }

  if (!aResp.ok) return json({ error: "AI 服务出错" }, 502);

  let data;
  try {
    data = await aResp.json();
  } catch {
    return json({ error: "AI 返回格式异常" }, 502);
  }
  const text = (data?.choices?.[0]?.message?.content ?? "")
    .trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

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
});
