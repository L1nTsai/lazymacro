/**
 * A local stand-in for the Claude and Gemini APIs, so browser tests exercise the
 * real SDKs and app without real keys or cost. It doesn't prove real AI quality;
 * that's what `pnpm eval` is for.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const stats = { parse: 0, pick: 0, dish: 0, estimate: 0, restaurant: 0, uploads: 0, deletes: 0, transcribes: 0, unknown: [] as string[] };

const item = (phrase: string, food: string, quantity: number | null, unit: string, assumptions: string[] = [], extra: object = {}) => ({
  phrase,
  food,
  brand: null,
  quantity,
  unit,
  restaurant: null,
  modifications: [],
  assumptions,
  ...extra,
});

function parseMeal(text: string) {
  const t = text.toLowerCase();
  const meal = (items: object[], extra: object = {}) => ({ when: "today", meal: null, items, ...extra });
  if (t.includes("no food here")) return { meals: [] };
  if (t.includes("breakfast was oats")) {
    return {
      meals: [
        meal([item("oats", "quick oats", 60, "g")], { meal: "breakfast" }),
        meal([item("chicken breast", "chicken breast", 150, "g", ["Cooked or raw not stated"])], { meal: "lunch" }),
      ],
    };
  }
  if (t.includes("deluxe")) return { meals: [meal([item("deluxe sandwich", "e2e deluxe sandwich", 1, "serving", [], { restaurant: "Chick-fil-A" })])] };
  if (t.includes("curry")) return { meals: [meal([item("local curry", "e2e local curry", 1, "serving")])] };
  if (t.includes("mystery")) return { meals: [meal([item("mystery snack", "e2e mystery snack", null, "serving")])] };
  if (t.includes("just milk")) return { meals: [meal([item("milk", "milk", 200, "g", ["Fat % not stated"])])] };
  return {
    meals: [
      meal([
        item("60 grams of quick oats", "quick oats", 60, "g"),
        item("300 grams of milk", "milk", 300, "g", ["Fat % not stated"]),
        item("one scoop of whey", "whey protein powder", 1, "scoop", ["Brand not stated"]),
      ]),
    ],
  };
}

function pick(user: string) {
  const prefer: Record<string, RegExp> = {
    "quick oats": /oats, regular and quick, not fortified, dry/i,
    milk: /milk, reduced fat, fluid, 2%/i,
    "whey protein powder": /whey protein powder isolate/i,
    "chicken breast": /breast, boneless, skinless, raw/i,
    rice: /^rice, white, long-grain, regular, raw/i,
    chicken: /breast, boneless, skinless, raw/i,
  };
  const picks = user.split(/\n\n/).map((block, i) => {
    const food = /\(food: (.*?)\)/.exec(block)?.[1] ?? "";
    if (food.startsWith("e2e ")) return { item: i, candidate: null };
    const lines = block.split("\n").slice(1);
    const wanted = prefer[food];
    const found = wanted ? lines.findIndex((line) => wanted.test(line.replace(/^\s*\d+\.\s*/, ""))) : 0;
    return { item: i, candidate: Math.max(0, found) };
  });
  return { picks };
}

const message = (content: object[], stop_reason = "end_turn") => ({
  id: "msg_mock",
  type: "message",
  role: "assistant",
  model: "claude-haiku-5-5",
  content,
  stop_reason,
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
});

function claude(body: { system?: string; messages: { content: string }[] }) {
  const system = body.system ?? "";
  const user = String(body.messages[0].content);
  const json = (value: unknown) => message([{ type: "text", text: JSON.stringify(value) }]);

  if (system.startsWith("You extract")) {
    stats.parse++;
    return json(parseMeal(user));
  }
  if (system.startsWith("You match")) {
    stats.pick++;
    return json(pick(user));
  }
  if (system.startsWith("You split")) {
    stats.dish++;
    return json({ parts: user.includes("curry") ? [{ food: "rice", grams: 200 }, { food: "chicken", grams: 150 }] : [] });
  }
  if (system.startsWith("Estimate")) {
    stats.estimate++;
    return json({ kcal_per_100g: 400, protein_per_100g: 10, carbs_per_100g: 50, fat_per_100g: 18, grams_per_serving: 50 });
  }
  if (system.startsWith("You look up")) {
    stats.restaurant++;
    const url = "https://www.chick-fil-a.com/menu/deluxe-sandwich";
    return message([
      { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "deluxe sandwich nutrition" } },
      { type: "web_search_tool_result", tool_use_id: "srvtoolu_1", content: [{ type: "web_search_result", url, title: "Deluxe", encrypted_content: "x", page_age: null }] },
      {
        type: "text",
        text: JSON.stringify({ found: true, name: "E2E Deluxe Sandwich", chain: "Chick-fil-A", url, kcal: 490, protein_g: 32, carbs_g: 40, fat_g: 22, serving_grams: null, adjusted: false }),
      },
    ]);
  }
  stats.unknown.push(system.slice(0, 40));
  return json({});
}

const read = (request: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });

function send(response: ServerResponse, value: unknown, headers: Record<string, string> = {}) {
  response.writeHead(200, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(value));
}

const FILE = { name: "files/mock-audio", uri: "http://localhost:3199/v1beta/files/mock-audio", mimeType: "audio/webm", state: "ACTIVE" };

createServer(async (request, response) => {
  const path = (request.url ?? "").split("?")[0];
  const body = await read(request);

  if (path === "/__stats") return send(response, stats);
  if (path === "/v1/messages") return send(response, claude(JSON.parse(body.toString())));

  if (path.includes("/upload/") && path.endsWith("/files")) {
    stats.uploads++;
    return send(response, {}, { "x-goog-upload-url": "http://localhost:3199/upload-target", "x-goog-upload-status": "active" });
  }
  if (path === "/upload-target") return send(response, { file: FILE }, { "x-goog-upload-status": "final" });
  if (path.endsWith("/files/mock-audio") && request.method === "DELETE") {
    stats.deletes++;
    return send(response, {});
  }
  if (path.endsWith("/interactions")) {
    stats.transcribes++;
    const text = "60 grams of quick oats with 300 grams of milk and one scoop of whey";
    return send(response, {
      id: "mock",
      status: "completed",
      output_text: text,
      steps: [{ type: "model_output", content: [{ type: "text", text }] }],
      outputs: [{ type: "text", text }],
    });
  }

  stats.unknown.push(`${request.method} ${path}`);
  response.writeHead(404, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: { code: 404, message: `no mock for ${path}` } }));
}).listen(3199);
