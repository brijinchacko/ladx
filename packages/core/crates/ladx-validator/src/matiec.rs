//! matiec subprocess validator. matiec is the de-facto open-source IEC
//! 61131-3 compiler. The desktop installer ships a bundled binary; the
//! cloud runs it inside a Lambda/container.
//!
//! Phase 1 ships a thin wrapper: writes the source to a temp file, runs
//! `matiec`, parses the diagnostics it prints to stderr. If the binary
//! is missing we return `ValidatorError::Unavailable` so the caller can
//! fall through to `LightValidator`.

use ladx_types::{DiagnosticSeverity, ValidatorDiagnostic, ValidatorReport};
use std::process::Command;

use crate::{Result, Validator, ValidatorError};

pub struct MatiecValidator {
    binary: String,
}

impl MatiecValidator {
    /// Pick the binary from `LADX_MATIEC_BIN` if set, else assume `matiec`
    /// is on PATH. We don't probe the filesystem here — the subprocess
    /// invocation will tell us soon enough.
    pub fn from_env() -> Self {
        let binary =
            std::env::var("LADX_MATIEC_BIN").unwrap_or_else(|_| "matiec".to_string());
        Self { binary }
    }
}

impl Validator for MatiecValidator {
    fn name(&self) -> &'static str {
        "matiec"
    }

    fn validate_st(&self, source: &str) -> Result<ValidatorReport> {
        // matiec wants a real file. Write to a temp path; we let the OS
        // garbage-collect it (we delete on success, leak on panic — fine
        // because tmp dirs get cleaned up).
        let tmpdir = std::env::temp_dir();
        let tmpfile = tmpdir.join(format!("ladx-{}.st", uuid_like()));
        std::fs::write(&tmpfile, source)?;

        let out = match Command::new(&self.binary).arg(&tmpfile).output() {
            Ok(out) => out,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                let _ = std::fs::remove_file(&tmpfile);
                return Err(ValidatorError::Unavailable(format!(
                    "matiec binary not found at '{}': {}",
                    self.binary, e
                )));
            }
            Err(e) => {
                let _ = std::fs::remove_file(&tmpfile);
                return Err(ValidatorError::Subprocess(e.to_string()));
            }
        };

        let _ = std::fs::remove_file(&tmpfile);

        let stderr = String::from_utf8_lossy(&out.stderr).to_string();
        let stdout = String::from_utf8_lossy(&out.stdout).to_string();
        let diagnostics = parse_matiec_output(&format!("{stderr}\n{stdout}"));

        let ok = out.status.success()
            && !diagnostics
                .iter()
                .any(|d| d.severity == DiagnosticSeverity::Error);

        Ok(ValidatorReport {
            ok,
            language: "ST".into(),
            backend: "matiec".into(),
            diagnostics,
        })
    }
}

/// Parses matiec's `file.st:LINE-COL..LINE-COL: error: msg` and `warning:` lines.
fn parse_matiec_output(s: &str) -> Vec<ValidatorDiagnostic> {
    let mut out = Vec::new();
    for line in s.lines() {
        let lower = line.to_lowercase();
        let severity = if lower.contains(": error:") || lower.contains(" error:") {
            DiagnosticSeverity::Error
        } else if lower.contains(": warning:") || lower.contains(" warning:") {
            DiagnosticSeverity::Warning
        } else {
            continue;
        };

        let (line_no, col) = extract_position(line).unwrap_or((0, 0));
        let message = match line.split_once(": error:").or_else(|| line.split_once(": warning:")) {
            Some((_, msg)) => msg.trim().to_string(),
            None => line.trim().to_string(),
        };
        out.push(ValidatorDiagnostic {
            severity,
            line: line_no,
            column: col,
            message,
            source: "matiec".into(),
        });
    }
    out
}

fn extract_position(line: &str) -> Option<(u32, u32)> {
    // Look for ":<digits>-<digits>..<digits>-<digits>:" style at the start.
    let mut chars = line.char_indices().peekable();
    while let Some((i, ch)) = chars.next() {
        if ch == ':' {
            let rest = &line[i + 1..];
            if let Some(end) = rest.find(':') {
                let spec = &rest[..end];
                if let Some((line_part, col_part)) = spec.split_once('-') {
                    let line_no = line_part.split('.').next()?.parse().ok()?;
                    let col = col_part.split('.').next()?.parse().ok()?;
                    return Some((line_no, col));
                }
            }
        }
    }
    None
}

fn uuid_like() -> String {
    // Avoid pulling uuid into validator just for a temp filename. ns-time
    // + pid is unique enough for tmp files on a single host.
    use std::time::SystemTime;
    let t = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("{}-{}", std::process::id(), t)
}
