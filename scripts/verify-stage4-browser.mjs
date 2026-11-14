import { build } from "esbuild";
import http from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createHash } from "node:crypto";
await mkdir("output/playwright/stage4-fixtures", { recursive: true });
await sharp("public/assets/textures/concrete_layers_02/diffuse.jpg")
  .webp({ quality: 92 })
  .toFile("output/playwright/stage4-fixtures/concrete.webp");
const ktxSource =
  "https://raw.githubusercontent.com/mrdoob/three.js/c2345655c56c9de5b2cf4cf925f3c4611734f650/examples/textures/ktx2/2d_etc1s.ktx2";
const ktxResponse = await fetch(ktxSource);
if (!ktxResponse.ok) throw new Error(`KTX2 fixture HTTP ${ktxResponse.status}`);
const ktx = Buffer.from(await ktxResponse.arrayBuffer());
if (
  ktx.length < 100 ||
  ktx.subarray(0, 12).toString("hex") !== "ab4b5458203230bb0d0a1a0a"
)
  throw new Error("Invalid official KTX2 fixture");
await writeFile("output/playwright/stage4-fixtures/2d_etc1s.ktx2", ktx);
await writeFile(
  "output/playwright/stage4-fixtures/provenance.json",
  JSON.stringify(
    {
      source: ktxSource,
      sha256: createHash("sha256").update(ktx).digest("hex"),
      bytes: ktx.length,
      use: "Codec verification only, never installed in the game",
      webp: "Converted from the real Poly Haven concrete_layers_02 albedo",
    },
    null,
    2,
  ),
);

const bundle = await build({
  entryPoints: ["tests/verify-stage4-browser.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  write: false,
});
const publicDir = path.resolve("public");
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/verification-result" && req.method === "POST") {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 1000000) {
          res.writeHead(413);
          res.end();
          return;
        }
        chunks.push(chunk);
      }
      const result = JSON.parse(Buffer.concat(chunks).toString());
      await mkdir("output/playwright", { recursive: true });
      await writeFile(
        "output/playwright/stage4-browser.json",
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result));
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname.startsWith("/fixtures/")) {
      const fixture = path.basename(url.pathname);
      if (fixture === "corrupt.ktx2") {
        res.writeHead(200);
        res.end("intentional invalid container for failure-path testing");
        return;
      }
      if (!["concrete.webp", "2d_etc1s.ktx2"].includes(fixture)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": fixture.endsWith(".webp") ? "image/webp" : "image/ktx2",
      });
      res.end(await readFile(`output/playwright/stage4-fixtures/${fixture}`));
      return;
    }
    if (url.pathname === "/verify.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(bundle.outputFiles[0].text);
      return;
    }
    if (url.pathname.startsWith("/assets/")) {
      const file = path.resolve(
        publicDir,
        `.${decodeURIComponent(url.pathname)}`,
      );
      if (!file.startsWith(publicDir + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type":
          {
            ".json": "application/json",
            ".glb": "model/gltf-binary",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".js": "text/javascript",
            ".wasm": "application/wasm",
          }[path.extname(file)] ?? "application/octet-stream",
      });
      res.end(data);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      '<!doctype html><html><head><title>CRACKUP | Bay Area vista preview</title><style>body{margin:0;background:#112132;color:#e5f4ff;font:14px system-ui}nav{position:fixed;top:16px;left:16px;right:16px;display:flex;gap:8px;flex-wrap:wrap;z-index:1}button,select,input{background:#142b3d;color:#e8f9ff;border:1px solid #42687e;border-radius:5px;padding:8px}footer{position:fixed;bottom:16px;left:24px;white-space:pre-line;background:#102334dd;padding:12px;border-radius:7px}</style></head><body><script type="module" src="/verify.js"></script></body></html>',
    );
  } catch (error) {
    console.error(String(error));
    res.writeHead(404);
    res.end();
  }
});
server.listen(3199, "127.0.0.1", () =>
  console.log("Bay Area vista preview: http://127.0.0.1:3199"),
);
