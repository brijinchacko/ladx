//! Milliseconds, as Siemens writes a duration.
//!
//! The IR carries a timer preset as a number of milliseconds, which is what
//! Rockwell stores and what the simulator counts in. Siemens does not accept a
//! bare number where a duration belongs: `PT := 3000` is a type error in SCL,
//! because PT is a TIME and TIME is written `T#3s`.
//!
//! This is exactly the class of difference the conversion rules are about. It
//! is not a formatting preference. A generated block that says `PT := 3000`
//! does not compile, and one that guesses the unit wrong compiles and runs the
//! machine on the wrong timing.

/// A duration in milliseconds as an S7 TIME literal.
///
/// Written in the largest units that divide exactly, because `T#1m30s` is what
/// an engineer would have typed and `T#90000ms` is what a converter would.
/// Both are legal; only one is readable in a review.
pub fn time_literal(ms: i64) -> String {
    if ms == 0 {
        return "T#0ms".into();
    }

    let negative = ms < 0;
    let mut left = ms.abs();

    let days = left / 86_400_000;
    left %= 86_400_000;
    let hours = left / 3_600_000;
    left %= 3_600_000;
    let minutes = left / 60_000;
    left %= 60_000;
    let seconds = left / 1_000;
    let millis = left % 1_000;

    let mut out = String::from("T#");
    if negative {
        out = "T#-".into();
    }
    if days > 0 {
        out.push_str(&format!("{days}d"));
    }
    if hours > 0 {
        out.push_str(&format!("{hours}h"));
    }
    if minutes > 0 {
        out.push_str(&format!("{minutes}m"));
    }
    if seconds > 0 {
        out.push_str(&format!("{seconds}s"));
    }
    if millis > 0 {
        out.push_str(&format!("{millis}ms"));
    }
    out
}

/// The IR's preset for a duration, when the source gave one.
///
/// A fractional millisecond is rounded and the caller is expected to say so:
/// S7 TIME has millisecond resolution, so anything finer cannot survive and
/// pretending otherwise would hide a real change in behaviour.
pub fn from_operand_ms(value: f64) -> (i64, bool) {
    let rounded = value.round();
    ((rounded as i64), (value - rounded).abs() > f64::EPSILON)
}

/// An S7 TIME literal back to milliseconds. The inverse of [`time_literal`],
/// needed to read SCL rather than only write it.
///
/// Returns `None` rather than a guess: a preset read wrongly runs the machine
/// on the wrong timing, and a timer that silently became 5ms instead of 5s is
/// worse than one that failed to import.
pub fn parse_iec_duration(text: &str) -> Option<i64> {
    let t = text.trim();
    let body = t
        .strip_prefix("T#")
        .or_else(|| t.strip_prefix("t#"))
        .or_else(|| t.strip_prefix("TIME#"))
        .or_else(|| t.strip_prefix("time#"))?;
    let (body, sign) = match body.strip_prefix('-') {
        Some(rest) => (rest, -1),
        None => (body, 1),
    };
    if body.is_empty() {
        return None;
    }

    let mut total: i64 = 0;
    let mut digits = String::new();
    let mut unit = String::new();
    let mut saw_any = false;

    // Units must appear largest first and each at most once, which is what
    // makes T#1m30s unambiguous. Anything else is not a literal this reader
    // will translate.
    let order = ["d", "h", "m", "s", "ms"];
    let mut last_rank: Option<usize> = None;

    let flush = |digits: &mut String,
                 unit: &mut String,
                 total: &mut i64,
                 last_rank: &mut Option<usize>|
     -> Option<()> {
        if digits.is_empty() || unit.is_empty() {
            return None;
        }
        let rank = order.iter().position(|u| *u == unit.as_str())?;
        if last_rank.is_some_and(|r| rank <= r) {
            return None; // repeated or out of order
        }
        let n: i64 = digits.parse().ok()?;
        let ms = match unit.as_str() {
            "d" => n.checked_mul(86_400_000)?,
            "h" => n.checked_mul(3_600_000)?,
            "m" => n.checked_mul(60_000)?,
            "s" => n.checked_mul(1_000)?,
            "ms" => n,
            _ => return None,
        };
        *total = total.checked_add(ms)?;
        *last_rank = Some(rank);
        digits.clear();
        unit.clear();
        Some(())
    };

    for c in body.chars() {
        if c.is_ascii_digit() {
            if !unit.is_empty() {
                flush(&mut digits, &mut unit, &mut total, &mut last_rank)?;
            }
            digits.push(c);
            saw_any = true;
        } else if c.is_ascii_alphabetic() {
            unit.push(c.to_ascii_lowercase());
        } else {
            return None;
        }
    }
    flush(&mut digits, &mut unit, &mut total, &mut last_rank)?;
    saw_any.then_some(total * sign)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn whole_seconds_read_as_seconds() {
        assert_eq!(time_literal(3_000), "T#3s");
        assert_eq!(time_literal(5_000), "T#5s");
    }

    #[test]
    fn sub_second_stays_in_milliseconds() {
        assert_eq!(time_literal(500), "T#500ms");
        assert_eq!(time_literal(1), "T#1ms");
    }

    /// The readable form, not merely a legal one.
    #[test]
    fn larger_durations_use_the_units_a_person_would_write() {
        assert_eq!(time_literal(90_000), "T#1m30s");
        assert_eq!(time_literal(30_000), "T#30s");
        assert_eq!(time_literal(3_600_000), "T#1h");
        assert_eq!(time_literal(3_661_500), "T#1h1m1s500ms");
    }

    #[test]
    fn zero_is_written_rather_than_left_empty() {
        assert_eq!(time_literal(0), "T#0ms");
    }

    #[test]
    fn a_day_is_a_day() {
        assert_eq!(time_literal(86_400_000), "T#1d");
        assert_eq!(time_literal(90_000_000), "T#1d1h");
    }

    /// A negative preset is nonsense in a timer, but it is not this function's
    /// place to refuse it: it renders what it was given so the caller can
    /// report it rather than being handed something that silently became
    /// positive.
    #[test]
    fn a_negative_duration_stays_negative() {
        assert_eq!(time_literal(-5_000), "T#-5s");
    }

    /// The pair has to round-trip, or a program converted out and back is not
    /// the program that went in.
    #[test]
    fn every_duration_survives_being_written_and_read_back() {
        for ms in [0, 1, 500, 3_000, 5_000, 30_000, 90_000, 3_600_000, 3_661_500, 86_400_000] {
            assert_eq!(parse_iec_duration(&time_literal(ms)), Some(ms), "{ms}");
        }
        assert_eq!(parse_iec_duration(&time_literal(-5_000)), Some(-5_000));
    }

    #[test]
    fn the_forms_a_person_types_are_accepted() {
        assert_eq!(parse_iec_duration("T#5S"), Some(5_000));
        assert_eq!(parse_iec_duration("t#250ms"), Some(250));
        assert_eq!(parse_iec_duration("TIME#1m"), Some(60_000));
        assert_eq!(parse_iec_duration("  T#2s  "), Some(2_000));
    }

    /// A preset read wrongly runs the machine on the wrong timing, so anything
    /// unclear is refused rather than guessed.
    #[test]
    fn anything_it_cannot_read_is_refused_rather_than_guessed() {
        assert_eq!(parse_iec_duration("5000"), None, "a bare number has no unit");
        assert_eq!(parse_iec_duration("T#"), None);
        assert_eq!(parse_iec_duration("T#5x"), None, "unknown unit");
        assert_eq!(parse_iec_duration("T#5s3s"), None, "a repeated unit is ambiguous");
        assert_eq!(parse_iec_duration("T#5s1m"), None, "out of order is not a literal");
        assert_eq!(parse_iec_duration("T#1.5s"), None, "TIME has no fractional part");
        assert_eq!(parse_iec_duration(""), None);
    }

    #[test]
    fn a_fraction_of_a_millisecond_is_reported_as_lost() {
        let (ms, lost) = from_operand_ms(1500.0);
        assert_eq!(ms, 1500);
        assert!(!lost);

        let (ms, lost) = from_operand_ms(1500.4);
        assert_eq!(ms, 1500);
        assert!(lost, "S7 TIME cannot hold it, so somebody has to be told");
    }
}
