//! Shared stream parsers. SSE for OpenRouter, NDJSON for Ollama.

use futures_util::{Stream, StreamExt};
use std::pin::Pin;

use crate::{InferenceError, Result};

/// Parse a `text/event-stream` response into individual SSE `data:` payloads.
/// Strips `data: ` prefix and skips empty lines and comments.
pub fn sse_chunks(
    resp: reqwest::Response,
) -> Pin<Box<dyn Stream<Item = Result<String>> + Send>> {
    let byte_stream = resp.bytes_stream();
    let mut buffer = String::new();

    Box::pin(async_stream::stream! {
        let mut byte_stream = byte_stream;
        while let Some(bytes) = byte_stream.next().await {
            let bytes = match bytes {
                Ok(b) => b,
                Err(e) => {
                    yield Err(InferenceError::Http(e));
                    return;
                }
            };
            let chunk = match std::str::from_utf8(&bytes) {
                Ok(s) => s,
                Err(e) => {
                    yield Err(InferenceError::Stream(format!("invalid utf-8: {e}")));
                    return;
                }
            };
            buffer.push_str(chunk);
            while let Some(idx) = buffer.find('\n') {
                let line = buffer[..idx].trim_end_matches('\r').to_string();
                buffer.drain(..=idx);
                if line.is_empty() || line.starts_with(':') {
                    continue;
                }
                if let Some(payload) = line.strip_prefix("data: ") {
                    yield Ok(payload.to_string());
                }
            }
        }
    })
}

/// Parse an NDJSON response into one line per JSON object.
pub fn ndjson_lines(
    resp: reqwest::Response,
) -> Pin<Box<dyn Stream<Item = Result<String>> + Send>> {
    let byte_stream = resp.bytes_stream();
    let mut buffer = String::new();

    Box::pin(async_stream::stream! {
        let mut byte_stream = byte_stream;
        while let Some(bytes) = byte_stream.next().await {
            let bytes = match bytes {
                Ok(b) => b,
                Err(e) => {
                    yield Err(InferenceError::Http(e));
                    return;
                }
            };
            let chunk = match std::str::from_utf8(&bytes) {
                Ok(s) => s,
                Err(e) => {
                    yield Err(InferenceError::Stream(format!("invalid utf-8: {e}")));
                    return;
                }
            };
            buffer.push_str(chunk);
            while let Some(idx) = buffer.find('\n') {
                let line = buffer[..idx].trim_end_matches('\r').to_string();
                buffer.drain(..=idx);
                if line.is_empty() {
                    continue;
                }
                yield Ok(line);
            }
        }
    })
}
