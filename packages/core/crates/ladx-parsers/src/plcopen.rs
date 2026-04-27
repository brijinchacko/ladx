//! PLCopen TC6 XML reader. Counts top-level project entities so the project
//! list shows accurate stats. Phase 1 minimum; deeper extraction (per-routine
//! ladder, ST source) lands in Phase 2.

use ladx_types::{Project, VendorKind};
use quick_xml::events::Event;
use quick_xml::reader::Reader;

use crate::{ParseError, Result, empty_project};

pub fn parse(bytes: &[u8], filename: &str) -> Result<Project> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);

    let mut buf = Vec::new();
    let mut project_name: Option<String> = None;
    let mut tag_count: u32 = 0;
    let mut routine_count: u32 = 0;
    let mut udt_count: u32 = 0;
    let mut saw_project_root = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(ParseError::Xml(e)),
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                let tag = std::str::from_utf8(name.as_ref())?;
                match tag {
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
                    "pou" | "POU" => routine_count += 1,
                    "dataType" | "DataType" => udt_count += 1,
                    "variable" | "Variable" => tag_count += 1,
                    _ => {}
                }
            }
            _ => {}
        }
        buf.clear();
    }

    if !saw_project_root {
        return Err(ParseError::Schema(
            "no <project> root element — not a PLCopen TC6 file".into(),
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

    let mut project = empty_project(display_name, VendorKind::Codesys);
    project.stats.tag_count = tag_count;
    project.stats.routine_count = routine_count;
    project.stats.udt_count = udt_count;
    Ok(project)
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
    <variable name="Motor1" />
    <variable name="Motor2" />
    <variable name="EStop" />
  </instances>
</project>"#;

    #[test]
    fn parses_plcopen_skeleton() {
        let project = parse(SAMPLE.as_bytes(), "demo.xml").unwrap();
        assert_eq!(project.name, "DemoConveyor");
        assert_eq!(project.stats.routine_count, 2);
        assert_eq!(project.stats.udt_count, 2);
        assert_eq!(project.stats.tag_count, 3);
    }

    #[test]
    fn rejects_non_plcopen_xml() {
        let xml = "<other></other>";
        let err = parse(xml.as_bytes(), "x.xml").unwrap_err();
        assert!(matches!(err, ParseError::Schema(_)));
    }
}
