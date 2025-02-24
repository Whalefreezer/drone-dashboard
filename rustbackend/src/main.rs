use axum::{
    body::Body,
    extract::State,
    http::{self, Request, StatusCode, Uri},
    response::Response,
    routing::get,
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
        .route("/api/*path", get(proxy_handler).post(proxy_handler))
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
    req: Request<Body>,
) -> Response<Body> {
    let path = req.uri().path().trim_start_matches("/api");
    let url = format!("{}{}", state.velocidrone_api, path);

    // Forward the request
    match state.client.get(&url).send().await {
        Ok(res) => {
            let status = StatusCode::from_u16(res.status().as_u16()).unwrap();
            let body = res.bytes().await.unwrap_or_default();
            
            Response::builder()
                .status(status)
                .header(http::header::CONTENT_TYPE, "application/json")
                .body(Body::from(body))
                .unwrap()
        }
        Err(_) => Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Body::empty())
            .unwrap(),
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
