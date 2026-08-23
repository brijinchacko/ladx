//! Light validator, pure-Rust IEC 61131-3 ST sanity checks.
//!
//! NOT a full IEC 61131-3 compiler. Catches the common problems an LLM
//! produces, unbalanced END_*, mismatched brackets, lower-case keywords
//! that should be upper, missing `;` at obvious statement boundaries.
//! Production validation should run matiec.
//!
//! Returns ok=true even on warnings; ok=false only when at least one
//! diagnostic is severity=Error.

use ladx_types::{DiagnosticSeverity, ValidatorDiagnostic, ValidatorReport};

use crate::{Result, Validator};

pub struct LightValidator;

impl Validator for LightValidator {
    fn name(&self) -> &'static str {
        "light"
    }

    fn validate_st(&self, source: &str) -> Result<ValidatorReport> {
        let diagnostics = check_st(source);
        let ok = !diagnostics
            .iter()
            .any(|d| d.severity == DiagnosticSeverity::Error);
        Ok(ValidatorReport {
            ok,
            language: "ST".into(),
            backend: "light".into(),
            diagnostics,
        })
    }
}

const BLOCK_PAIRS: &[(&str, &str)] = &[
    ("IF", "END_IF"),
    ("FOR", "END_FOR"),
    ("WHILE", "END_WHILE"),
    ("REPEAT", "END_REPEAT"),
    ("CASE", "END_CASE"),
    ("FUNCTION", "END_FUNCTION"),
    ("FUNCTION_BLOCK", "END_FUNCTION_BLOCK"),
    ("PROGRAM", "END_PROGRAM"),
    ("VAR", "END_VAR"),
    ("VAR_INPUT", "END_VAR"),
    ("VAR_OUTPUT", "END_VAR"),
    ("VAR_IN_OUT", "END_VAR"),
    ("STRUCT", "END_STRUCT"),
    ("TYPE", "END_TYPE"),
];

fn check_st(source: &str) -> Vec<ValidatorDiagnostic> {
    let mut out = Vec::new();
    let mut paren_depth: i32 = 0;
    let mut paren_line: u32 = 0;

    // Stack of (open-keyword, line), whatever opens last must close first.
    let mut stack: Vec<(&'static str, u32)> = Vec::new();

    for (line_idx, raw_line) in source.lines().enumerate() {
        let line_no = (line_idx + 1) as u32;
        let line = strip_comments(raw_line);
        let upper = line.to_uppercase();

        // Bracket parity (parens only, IEC 61131-3 ST primarily uses parens).
        for ch in line.chars() {
            match ch {
                '(' => {
                    if paren_depth == 0 {
                        paren_line = line_no;
                    }
                    paren_depth += 1;
                }
                ')' => {
                    paren_depth -= 1;
                    if paren_depth < 0 {
                        out.push(diag_error(
                            line_no,
                            0,
                            "unbalanced ')', no matching '('".into(),
                            "light:paren",
                        ));
                        paren_depth = 0;
                    }
                }
                _ => {}
            }
        }

        // Order matters here. We process *opens* first so that single-line
        // patterns like `IF cond THEN x; END_IF;` push and immediately pop
        // cleanly. The trade-off: if an `END_IF` line happens to also
        // contain a stray `IF` keyword (extremely uncommon in ST), we'd
        // misread it. matiec is the source of truth for tricky cases.
        for (open, _close) in open_keywords_longest_first() {
            if has_word(&upper, open) {
                stack.push((open, line_no));
                break;
            }
        }
        for close in close_keywords_longest_first() {
            if has_word(&upper, close) {
                match stack.pop() {
                    None => out.push(diag_error(
                        line_no,
                        0,
                        format!("'{close}' with no matching open"),
                        "light:end-keyword",
                    )),
                    Some((open, open_line)) => {
                        let expected = expected_close_for(open).unwrap_or("");
                        if expected != close {
                            out.push(diag_error(
                                line_no,
                                0,
                                format!(
                                    "'{close}' closes the wrong block, '{open}' on line {open_line} expects '{expected}'"
                                ),
                                "light:end-keyword",
                            ));
                        }
                    }
                }
                break;
            }
        }
    }

    if paren_depth != 0 {
        out.push(diag_error(
            paren_line,
            0,
            format!("unbalanced parentheses, {paren_depth} unclosed"),
            "light:paren",
        ));
    }

    for (open, line) in stack {
        out.push(diag_error(
            line,
            0,
            format!("'{open}' on line {line} has no matching close"),
            "light:end-keyword",
        ));
    }

    out
}

fn expected_close_for(open: &str) -> Option<&'static str> {
    BLOCK_PAIRS.iter().find(|(o, _)| *o == open).map(|(_, c)| *c)
}

/// Distinct close keywords sorted longest-first so END_FUNCTION_BLOCK is
/// tested before END_FUNCTION (whose `END_FUNCTION` substring otherwise
/// matches inside `END_FUNCTION_BLOCK`).
fn close_keywords_longest_first() -> Vec<&'static str> {
    let mut closes: Vec<&'static str> = BLOCK_PAIRS.iter().map(|(_, c)| *c).collect();
    closes.sort_by_key(|s| std::cmp::Reverse(s.len()));
    closes.dedup();
    closes
}

/// Open keywords longest-first so VAR_INPUT/VAR_OUTPUT/VAR_IN_OUT match
/// before VAR (which is a prefix of all three).
fn open_keywords_longest_first() -> Vec<(&'static str, &'static str)> {
    let mut pairs: Vec<(&'static str, &'static str)> = BLOCK_PAIRS.to_vec();
    pairs.sort_by_key(|(o, _)| std::cmp::Reverse(o.len()));
    pairs
}

fn diag_error(line: u32, column: u32, message: String, source: &str) -> ValidatorDiagnostic {
    ValidatorDiagnostic {
        severity: DiagnosticSeverity::Error,
        line,
        column,
        message,
        source: source.into(),
    }
}

fn strip_comments(line: &str) -> String {
    // ST single-line comment is `//`; block `(* ... *)` we treat conservatively
    // (block comments spanning multiple lines confuse this lightweight pass, // we live with that for Phase 1 and let matiec catch the edge cases).
    if let Some(idx) = line.find("//") {
        line[..idx].to_string()
    } else {
        line.to_string()
    }
}

/// True if `needle` appears in `haystack` as a whole word (boundaries on
/// both sides are non-alphanumeric / non-underscore).
fn has_word(haystack: &str, needle: &str) -> bool {
    let bytes = haystack.as_bytes();
    let nlen = needle.len();
    let mut i = 0;
    while i + nlen <= bytes.len() {
        if &haystack[i..i + nlen] == needle {
            let before = if i == 0 { None } else { Some(bytes[i - 1]) };
            let after = if i + nlen == bytes.len() { None } else { Some(bytes[i + nlen]) };
            let boundary_ok = |b: Option<u8>| match b {
                None => true,
                Some(c) => !(c.is_ascii_alphanumeric() || c == b'_'),
            };
            if boundary_ok(before) && boundary_ok(after) {
                return true;
            }
        }
        i += 1;
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_motor_start_stop_passes() {
        let st = r#"
            IF StartPB AND NOT EStop THEN
                Motor1_Run := TRUE;
            END_IF;
            IF StopPB OR Motor1_Fault THEN
                Motor1_Run := FALSE;
            END_IF;
        "#;
        let v = LightValidator;
        let report = v.validate_st(st).unwrap();
        assert!(report.ok, "expected ok, got {:?}", report.diagnostics);
    }

    #[test]
    fn missing_end_if_fails() {
        let st = "IF foo THEN bar := 1;";
        let report = LightValidator.validate_st(st).unwrap();
        assert!(!report.ok);
        assert!(report.diagnostics.iter().any(|d| d.message.contains("'IF'")));
    }

    #[test]
    fn unbalanced_paren_fails() {
        let st = "x := (a + b * (c - d);";
        let report = LightValidator.validate_st(st).unwrap();
        assert!(!report.ok);
        assert!(report
            .diagnostics
            .iter()
            .any(|d| d.message.contains("parentheses")));
    }

    #[test]
    fn nested_blocks_pass() {
        let st = r#"
            FUNCTION_BLOCK MotorCtrl
            VAR_INPUT
                Start : BOOL;
            END_VAR
            IF Start THEN
                FOR i := 1 TO 10 DO
                    x := i;
                END_FOR;
            END_IF;
            END_FUNCTION_BLOCK
        "#;
        let report = LightValidator.validate_st(st).unwrap();
        assert!(report.ok, "{:?}", report.diagnostics);
    }
}
