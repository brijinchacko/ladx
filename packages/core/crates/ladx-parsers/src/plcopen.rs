//! PLCopen TC6 XML reader. Walks the document, collecting POU names,
//! variable names, and DataType names. Phase 1 minimum; deeper extraction
//! (per-routine ladder/ST source) lands in Phase 2.

use ladx_types::{ParseResult, ProjectManifest, RoutineRef, TagRef, VendorKind};
use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::{ParseError, Result, finalize};

pub fn parse(bytes: &[u8], filename: &str) -> Result<ParseResult> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut project_name: Option<String> = None;
    let mut manifest = ProjectManifest::default();
    let mut saw_project_root = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(ParseError::Xml(e)),
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag = std::str::from_utf8(e.name().as_ref())?.to_string();
                match tag.as_str() {
                    "project" | "Project" => {
                        saw_project_root = true;
                        for attr in e.attributes() {
                            let attr = attr?;
                            if attr.key.as_ref() == b"name"
                                || attr.key.as_ref() == b"projectName"
                            {
                                project_name = Some(
                                    std::str::from_utf8(&attr.value)?.to_string(),
                                );
                            }
                        }
                    }
                    "pou" | "POU" => {
                        let mut name = String::new();
                        let mut language = "Unknown".to_string();
                        for attr in e.attributes() {
                            let attr = attr?;
                            let key = attr.key.as_ref();
                            let value = std::str::from_utf8(&attr.value)?.to_string();
                            if key == b"name" {
                                name = value;
                            } else if key == b"pouType" {
                                language = value;
                            }
                        }
                        if !name.is_empty() {
                            manifest.routines.push(RoutineRef { name, language });
                        }
                    }
                    "dataType" | "DataType" => {
                        for attr in e.attributes() {
                            let attr = attr?;
                            if attr.key.as_ref() == b"name" {
                                manifest.udts.push(
                                    std::str::from_utf8(&attr.value)?.to_string(),
                                );
                            }
                        }
                    }
                    "variable" | "Variable" => {
                        let mut name = String::new();
                        let mut data_type: Option<String> = None;
                        for attr in e.attributes() {
                            let attr = attr?;
                            let key = attr.key.as_ref();
                            let value = std::str::from_utf8(&attr.value)?.to_string();
                            if key == b"name" {
                                name = value;
                            } else if key == b"type" || key == b"dataType" {
                                data_type = Some(value);
                            }
                        }
                        if !name.is_empty() {
                            manifest.tags.push(TagRef { name, data_type });
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
        buf.clear();
    }

    if !saw_project_root {
        return Err(ParseError::Schema(
            "no <project> root element, not a PLCopen TC6 file".into(),
        ));
    }

    let display_name = project_name
        .or_else(|| {
            std::path::Path::new(filename)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "Untitled".into());

    Ok(finalize(display_name, VendorKind::Codesys, manifest))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.plcopen.org/xml/tc6_0201" name="DemoConveyor">
  <types>
    <dataTypes>
      <dataType name="MotorState" />
      <dataType name="ConveyorState" />
    </dataTypes>
    <pous>
      <pou name="MainRoutine" pouType="program" />
      <pou name="StartStop" pouType="functionBlock" />
    </pous>
  </types>
  <instances>
    <variable name="Motor1" type="BOOL" />
    <variable name="Motor2" type="BOOL" />
    <variable name="EStop" type="BOOL" />
  </instances>
</project>"#;

    #[test]
    fn parses_plcopen_skeleton() {
        let result = parse(SAMPLE.as_bytes(), "demo.xml").unwrap();
        assert_eq!(result.project.name, "DemoConveyor");
        assert_eq!(result.project.stats.routine_count, 2);
        assert_eq!(result.project.stats.udt_count, 2);
        assert_eq!(result.project.stats.tag_count, 3);
        assert_eq!(result.manifest.routines[0].name, "MainRoutine");
        assert_eq!(result.manifest.routines[0].language, "program");
        assert_eq!(result.manifest.tags[0].name, "Motor1");
        assert_eq!(result.manifest.tags[0].data_type.as_deref(), Some("BOOL"));
    }

    #[test]
    fn rejects_non_plcopen_xml() {
        let xml = "<other></other>";
        let err = parse(xml.as_bytes(), "x.xml").unwrap_err();
        assert!(matches!(err, ParseError::Schema(_)));
    }
}
