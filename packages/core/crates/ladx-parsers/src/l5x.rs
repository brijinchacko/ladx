//! Rockwell Studio 5000 L5X reader. Phase 1: extract Tag/Routine/UDT/AOI
//! names. Phase 2 extends to per-routine ladder/ST source extraction so
//! the chat/generator agents can reason about specific rungs.

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
    let mut saw_l5x_root = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(ParseError::Xml(e)),
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let tag = std::str::from_utf8(e.name().as_ref())?.to_string();
                match tag.as_str() {
                    "RSLogix5000Content" => saw_l5x_root = true,
                    "Controller" => {
                        for attr in e.attributes() {
                            let attr = attr?;
                            if attr.key.as_ref() == b"Name" {
                                project_name = Some(
                                    std::str::from_utf8(&attr.value)?.to_string(),
                                );
                            }
                        }
                    }
                    "Tag" => {
                        let mut name = String::new();
                        let mut data_type: Option<String> = None;
                        for attr in e.attributes() {
                            let attr = attr?;
                            let key = attr.key.as_ref();
                            let value = std::str::from_utf8(&attr.value)?.to_string();
                            if key == b"Name" {
                                name = value;
                            } else if key == b"DataType" {
                                data_type = Some(value);
                            }
                        }
                        if !name.is_empty() {
                            manifest.tags.push(TagRef { name, data_type });
                        }
                    }
                    "Routine" => {
                        let mut name = String::new();
                        let mut language = "Unknown".to_string();
                        for attr in e.attributes() {
                            let attr = attr?;
                            let key = attr.key.as_ref();
                            let value = std::str::from_utf8(&attr.value)?.to_string();
                            if key == b"Name" {
                                name = value;
                            } else if key == b"Type" {
                                language = value;
                            }
                        }
                        if !name.is_empty() {
                            manifest.routines.push(RoutineRef { name, language });
                        }
                    }
                    "DataType" => {
                        for attr in e.attributes() {
                            let attr = attr?;
                            if attr.key.as_ref() == b"Name" {
                                manifest.udts.push(
                                    std::str::from_utf8(&attr.value)?.to_string(),
                                );
                            }
                        }
                    }
                    "AddOnInstructionDefinition" => {
                        for attr in e.attributes() {
                            let attr = attr?;
                            if attr.key.as_ref() == b"Name" {
                                manifest.aois.push(
                                    std::str::from_utf8(&attr.value)?.to_string(),
                                );
                            }
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
        buf.clear();
    }

    if !saw_l5x_root {
        return Err(ParseError::Schema(
            "no <RSLogix5000Content> root — not an L5X file".into(),
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

    Ok(finalize(display_name, VendorKind::Rockwell, manifest))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0">
  <Controller Name="ConveyorBatch" ProcessorType="1756-L73">
    <DataTypes>
      <DataType Name="MotorState" />
    </DataTypes>
    <Tags>
      <Tag Name="Motor1" DataType="BOOL" />
      <Tag Name="EStop" DataType="BOOL" />
    </Tags>
    <Programs>
      <Program Name="MainProgram">
        <Routines>
          <Routine Name="MainRoutine" Type="RLL" />
          <Routine Name="StartStop" Type="ST" />
        </Routines>
      </Program>
    </Programs>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="MotorAOI" />
    </AddOnInstructionDefinitions>
  </Controller>
</RSLogix5000Content>"#;

    #[test]
    fn parses_l5x_skeleton() {
        let result = parse(SAMPLE.as_bytes(), "demo.l5x").unwrap();
        assert_eq!(result.project.name, "ConveyorBatch");
        assert_eq!(result.project.stats.tag_count, 2);
        assert_eq!(result.project.stats.routine_count, 2);
        assert_eq!(result.project.stats.udt_count, 1);
        assert_eq!(result.project.stats.aoi_count, 1);
        assert_eq!(result.manifest.tags[0].name, "Motor1");
        assert_eq!(result.manifest.tags[0].data_type.as_deref(), Some("BOOL"));
        assert_eq!(result.manifest.routines[0].language, "RLL");
        assert_eq!(result.manifest.aois[0], "MotorAOI");
    }
}
