import { Application, Router } from "https://deno.land/x/oak@v12.6.2/mod.ts";
import { proxy } from "https://deno.land/x/oak_proxy@v0.0.2/mod.ts";

const app = new Application();
const router = new Router();

// console.log(root);


app.use(proxy("/api", {
    target: "http://localhost:8000",
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

const port = 3000;
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port, hostname: "0.0.0.0" });
