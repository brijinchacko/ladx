//! Rockwell Studio 5000 L5X reader. Phase 1: counts Tags, Routines, UDTs at
//! the top level — enough to populate ProjectStats. Phase 2 extends to per-
//! routine ladder/ST extraction.

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
    let mut aoi_count: u32 = 0;
    let mut saw_l5x_root = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Err(e) => return Err(ParseError::Xml(e)),
            Ok(Event::Eof) => break,
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                let name = e.name();
                let tag = std::str::from_utf8(name.as_ref())?;
                match tag {
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
                    "Tag" => tag_count += 1,
                    "Routine" => routine_count += 1,
                    "DataType" => udt_count += 1,
                    "AddOnInstructionDefinition" => aoi_count += 1,
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

    let mut project = empty_project(display_name, VendorKind::Rockwell);
    project.stats.tag_count = tag_count;
    project.stats.routine_count = routine_count;
    project.stats.udt_count = udt_count;
    project.stats.aoi_count = aoi_count;
    Ok(project)
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
      <Tag Name="Motor1" />
      <Tag Name="EStop" />
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
        let project = parse(SAMPLE.as_bytes(), "demo.l5x").unwrap();
        assert_eq!(project.name, "ConveyorBatch");
        assert_eq!(project.stats.tag_count, 2);
        assert_eq!(project.stats.routine_count, 2);
        assert_eq!(project.stats.udt_count, 1);
        assert_eq!(project.stats.aoi_count, 1);
    }
}
