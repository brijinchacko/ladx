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
