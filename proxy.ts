import { serve } from "https://deno.land/std/http/server.ts";

const BACKEND_URL = "http://localhost:8080"; // Replace with your backend URL

async function executeCurl(url: string): Promise<Response> {
  // Build curl command array
  const curlCmd = ["curl"];
  
//   // Add headers
//   headers.forEach((value, key) => {
//     curlCmd.push("-H", `${key}: ${value}`);
//   });

//   // Add request body if present
//   if (body) {
//     curlCmd.push("-d", body.toString());
//   }

  // Add the URL
  curlCmd.push(url);

  // Execute curl command
  const process = new Deno.Command("curl", {
    args: curlCmd,
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, stderr, success } = await process.output();

  if (!success) {
    const errorMessage = new TextDecoder().decode(stderr);
    throw new Error(`Curl failed: ${errorMessage}`);
  }

  return new Response(stdout, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const path = url.pathname;
    const fullUrl = `${BACKEND_URL}${path}`;

    return await executeCurl(fullUrl);

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

// Start the server
const port = 8000;
console.log(`Server running on http://localhost:${port}`);
serve(handler, { port });