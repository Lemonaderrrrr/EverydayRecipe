// Supabase Edge Function：AI 一句话加菜代理。
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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "服务端未配置 API key" }, 500);

  const prompt =
    `根据这句话描述一道菜，只输出一个 JSON 对象，不要任何多余文字或 markdown 代码块。` +
    `字段：name(中文菜名), en(英文或拼音名), type(中文小分类，如 炸物/盖饭/汤面/卷类/甜品/小吃), ` +
    `p(数组，从这些蛋白质里选适用的：pork,chicken,beef,sea,egg,tofu；纯素或主要是淀粉就用 ["tofu"]), ` +
    `ing(中文主要材料，用顿号、分隔，6到10样)。描述：${desc}`;

  let aResp: Response;
  try {
    aResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return json({ error: "无法连接 AI 服务" }, 502);
  }

  if (!aResp.ok) return json({ error: "AI 服务出错" }, 502);

  const data = await aResp.json();
  const text = (data.content || [])
    .map((b: { text?: string }) => b.text || "")
    .join("")
    .trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  let obj: { name?: string; en?: string; type?: string; p?: string[]; ing?: string };
  try {
    obj = JSON.parse(text);
  } catch {
    return json({ error: "AI 返回格式异常" }, 502);
  }

  return json({
    name: obj.name ?? "",
    en: obj.en ?? "",
    type: obj.type ?? "",
    p: Array.isArray(obj.p) ? obj.p : [],
    ing: obj.ing ?? "",
  });
});
