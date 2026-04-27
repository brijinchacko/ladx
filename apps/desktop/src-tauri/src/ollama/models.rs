//! Model picker logic. Defaults bias toward Qwen2.5-Coder per the spec
//! recommendation; falls back to whatever is installed if the preferred
//! model isn't available.

use crate::ollama::client::OllamaModel;

const PREFERRED: &[&str] = &[
    "qwen2.5-coder:32b",
    "qwen2.5-coder:14b",
    "qwen2.5-coder:7b",
    "qwen2.5-coder",
    "deepseek-coder",
    "codellama",
];

pub fn pick_default<'a>(models: &'a [OllamaModel]) -> Option<&'a str> {
    for &p in PREFERRED {
        if let Some(m) = models.iter().find(|m| m.name == p || m.name.starts_with(p)) {
            return Some(&m.name);
        }
    }
    models.first().map(|m| m.name.as_str())
}
