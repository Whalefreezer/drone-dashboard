import { Application, Router } from "https://deno.land/x/oak@v12.6.2/mod.ts";
import { proxy } from "https://deno.land/x/oak_proxy@v0.0.2/mod.ts";
import { parseArgs } from "jsr:@std/cli/parse-args";

// Parse command line arguments
const flags = parseArgs(Deno.args, {
  string: ["velocidrone-api"],
  boolean: ["help"],
  default: {
    "velocidrone-api": "http://localhost:8080",
    port: 3000,
  },
});

if (flags.help) {
  console.log(`
Usage: deno run --allow-net main.ts [OPTIONS]

Options:
  --velocidrone-api <url>  Set the Velocidrone API endpoint (default: http://localhost:8080)
  --port <number>          Set the server port (default: 3000)
  --help                   Show this help message

Example:
  drone-dashboard --velocidrone-api="http://localhost:8000" --port=4000
`);
  Deno.exit(0);
}

const app = new Application();
const router = new Router();

// console.log(root);


app.use(proxy("/api", {
    target: flags["velocidrone-api"],
    // prependPath: false,
    changeOrigin: true,
    pathRewrite: {
      "^/api": "",
    },
  }));


// Serve static files from the frontend/dist directory
app.use(async (ctx, next) => {
  try {
    await ctx.send({
      root: import.meta.dirname + "/static",
      index: "index.html",
    });
  } catch {
    await next();
  }
});



app.use(router.routes());
app.use(router.allowedMethods());

const port = flags.port;
console.log(`Pointing to Velocidrone API: ${flags["velocidrone-api"]}`);
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port: Number(port), hostname: "0.0.0.0" });
