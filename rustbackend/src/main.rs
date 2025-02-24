use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{self, Request, StatusCode, Uri},
    response::Response,
    routing::{get, post, put, delete, patch},
    Router,
};
use clap::Parser;
use include_dir::{include_dir, Dir};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;

static STATIC_DIR: Dir = include_dir!("static");

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    /// Velocidrone API endpoint
    #[arg(long, default_value = "http://localhost:8080")]
    velocidrone_api: String,

    /// Server port
    #[arg(long, default_value_t = 3000)]
    port: u16,
}

#[derive(Clone)]
struct AppState {
    velocidrone_api: String,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() {
    // Initialize logging
    tracing_subscriber::fmt::init();

    // Parse command line arguments
    let args = Args::parse();

    // Create app state
    let state = AppState {
        velocidrone_api: args.velocidrone_api.clone(),
        client: reqwest::Client::new(),
    };

    // Create router with CORS enabled
    let app = Router::new()
        .route("/api/*path", 
            get(proxy_handler)
            .post(proxy_handler)
            .put(proxy_handler)
            .delete(proxy_handler)
            .patch(proxy_handler))
        .fallback(static_handler)
        .layer(CorsLayer::permissive())
        .with_state(state);

    // Bind to address
    let addr = SocketAddr::from(([0, 0, 0, 0], args.port));
    println!("Pointing to Velocidrone API: {}", args.velocidrone_api);
    println!("Server running on http://localhost:{}", args.port);

    // Start server
    axum::serve(tokio::net::TcpListener::bind(addr).await.unwrap(), app)
        .await
        .unwrap();
}

async fn proxy_handler(
    State(state): State<AppState>,
    method: http::Method,
    uri: Uri,
    headers: http::HeaderMap,
    body: Bytes,
) -> Response<Body> {
    let path = uri.path().trim_start_matches("/api");
    let mut url = format!("{}{}", state.velocidrone_api, path);

    // Add query parameters if present
    if let Some(query) = uri.query() {
        url = format!("{}?{}", url, query);
    }

    // Create a new request with the same method
    let mut proxy_req = state.client.request(
        reqwest::Method::from_bytes(method.as_str().as_bytes()).unwrap(),
        &url
    );

    // Forward headers
    for (name, value) in headers {
        // Skip headers that reqwest will set
        if let Some(name) = name {
            if !["host", "content-length"].contains(&name.as_str()) {
                if let Ok(v) = reqwest::header::HeaderValue::from_bytes(value.as_bytes()) {
                    proxy_req = proxy_req.header(name.as_str(), v);
                }
            }
        }
    }

    // Only add body if it's not empty
    if !body.is_empty() {
        proxy_req = proxy_req.body(body);
    }

    // Send the request
    match proxy_req.send().await {
        Ok(res) => {
            let status = StatusCode::from_u16(res.status().as_u16()).unwrap();
            let mut builder = Response::builder().status(status);
            
            // Forward response headers
            if let Some(headers) = builder.headers_mut() {
                for (key, value) in res.headers() {
                    if let Ok(name) = http::HeaderName::from_bytes(key.as_ref()) {
                        if let Ok(val) = http::HeaderValue::from_bytes(value.as_bytes()) {
                            headers.insert(name, val);
                        }
                    }
                }
            }

            // Get and forward response body
            let body = res.bytes().await.unwrap_or_default();
            builder.body(Body::from(body)).unwrap()
        }
        Err(e) => {
            eprintln!("Proxy error: {}", e);
            Response::builder()
                .status(StatusCode::BAD_GATEWAY)
                .body(Body::empty())
                .unwrap()
        }
    }
}

async fn static_handler(uri: Uri) -> Response<Body> {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match STATIC_DIR.get_file(path) {
        Some(file) => {
            let mime_type = mime_guess::from_path(path).first_or_text_plain();
            Response::builder()
                .status(StatusCode::OK)
                .header(http::header::CONTENT_TYPE, mime_type.as_ref())
                .body(Body::from(file.contents()))
                .unwrap()
        }
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::empty())
            .unwrap(),
    }
}
