import { build } from "esbuild";
import http from "node:http";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

const bundle = await build({
  entryPoints: ["tests/verify-stage6-browser.ts"],
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
        "output/playwright/stage6-browser.json",
        JSON.stringify(result, null, 2),
      );
      console.log(JSON.stringify(result));
      res.writeHead(204);
      res.end();
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
      '<!doctype html><html><head><title>CRACKUP | In-engine cinematics</title><style>body{margin:0;background:#112132;color:#e5f4ff;font:14px system-ui}#studio-controls{position:fixed;bottom:12px;left:16px;right:16px;display:flex;gap:8px;flex-wrap:wrap;z-index:100}button,select,input{background:#142b3d;color:#e8f9ff;border:1px solid #42687e;border-radius:5px;padding:8px}footer{position:fixed;bottom:16px;left:24px;white-space:pre-line;background:#102334dd;padding:12px;border-radius:7px}</style></head><body><script type="module" src="/verify.js"></script></body></html>',
    );
  } catch (error) {
    console.error(String(error));
    res.writeHead(404);
    res.end();
  }
});
server.listen(3206, "127.0.0.1", () =>
  console.log("Cinematic studio: http://127.0.0.1:3206"),
);
