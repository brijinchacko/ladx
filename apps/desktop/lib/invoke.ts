// Typed wrappers around Tauri commands. Frontend code calls these, // never `fetch()` to public domains (per ADR-005 / network policy).
// Talking to Ollama on localhost is the Rust side's responsibility.

import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export const invoke = tauriInvoke;

// ----- shared shapes (mirror src-tauri/src/{ollama,licence}/*.rs) -----

export interface OllamaStatus {
  running: boolean;
  baseUrl: string;
  modelCount: number;
  error: string | null;
}

export interface OllamaModel {
  name: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
  suggested: string | null;
}

export interface ActivationRecord {
  licenceKeyLast4: string;
  machineId: string;
  productTier: string;
  expiresAt: string;
  activatedAt: string;
}

// ----- typed commands -----

export async function ping(): Promise<string> {
  return tauriInvoke<string>("ping");
}

export async function ollamaStatus(): Promise<OllamaStatus> {
  return tauriInvoke<OllamaStatus>("ollama_status");
}

export async function ollamaModels(): Promise<OllamaModelsResponse> {
  return tauriInvoke<OllamaModelsResponse>("ollama_models");
}

export async function licenceStatus(): Promise<ActivationRecord | null> {
  return tauriInvoke<ActivationRecord | null>("licence_status");
}

export async function licenceActivate(licenceKey: string): Promise<ActivationRecord> {
  return tauriInvoke<ActivationRecord>("licence_activate", { licenceKey });
}

export interface StudioSettings {
  defaultModel?: string | null;
  workspaceDir?: string | null;
  lastProject?: string | null;
  sidebarCollapsed?: boolean;
}

export async function settingsLoad(): Promise<StudioSettings> {
  return tauriInvoke<StudioSettings>("settings_load");
}

export async function settingsSave(settings: StudioSettings): Promise<void> {
  await tauriInvoke<void>("settings_save", { settings });
}

// ----- projects -----

export interface RoutineRef {
  name: string;
  language: string;
}

export interface TagRef {
  name: string;
  data_type?: string | null;
}

export interface ProjectManifest {
  routines: RoutineRef[];
  tags: TagRef[];
  udts: string[];
  aois: string[];
}

export interface ProjectRow {
  id: string;
  name: string;
  vendor: string;
  sourceFilename: string;
  sizeBytes: number;
  tagCount: number;
  routineCount: number;
  udtCount: number;
  aoiCount: number;
  parsedAt: string;
  manifest: ProjectManifest;
}

export async function pickAndParseProject(): Promise<ProjectRow | null> {
  return tauriInvoke<ProjectRow | null>("pick_and_parse_project");
}

export async function listProjects(): Promise<ProjectRow[]> {
  return tauriInvoke<ProjectRow[]>("list_projects");
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  return tauriInvoke<ProjectRow | null>("get_project", { id });
}

export async function deleteProject(id: string): Promise<void> {
  await tauriInvoke<void>("delete_project", { id });
}

// ----- validator -----

export interface ValidatorDiagnostic {
  severity: "error" | "warning" | "info";
  line: number;
  column: number;
  message: string;
  source: string;
}

export interface ValidatorReport {
  ok: boolean;
  language: string;
  backend: string;
  diagnostics: ValidatorDiagnostic[];
}

export async function validateSt(source: string): Promise<ValidatorReport> {
  return tauriInvoke<ValidatorReport>("validate_st", { source });
}

// ----- auto-fix -----

export interface AutoFixAttempt {
  source: string;
  report: ValidatorReport;
}

export interface AutoFixResult {
  ok: boolean;
  source: string;
  report: ValidatorReport;
  attempts: AutoFixAttempt[];
}

export async function autoFixSt(opts: {
  source: string;
  initialReport: ValidatorReport;
  projectId?: string;
  model?: string;
  maxAttempts?: number;
}): Promise<AutoFixResult> {
  return tauriInvoke<AutoFixResult>("auto_fix_st", {
    source: opts.source,
    initialReport: opts.initialReport,
    projectId: opts.projectId,
    model: opts.model,
    maxAttempts: opts.maxAttempts,
  });
}

// ----- conversations -----

export interface ConversationRow {
  id: string;
  projectId: string | null;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRow {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export async function ensureConversation(projectId: string | null): Promise<ConversationRow> {
  return tauriInvoke<ConversationRow>("ensure_conversation", { projectId });
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  return tauriInvoke<MessageRow[]>("list_messages", { conversationId });
}

// ----- project folders -----
//
// The thing the desktop can do that the browser cannot: a project is a real
// directory on a disk the person controls, which they can back up, put on a
// memory stick and hand to a customer. These wrap the Rust side that builds
// and files into it.

/** A project on disk: where it is, plus the manifest that marks it as ours. */
export interface ProjectFolder {
  path: string;
  format: number;
  id: string;
  name: string;
  client?: string | null;
  code?: string | null;
  created: string;
  updated: string;
  appVersion: string;
}

export interface FolderEntry {
  folder: string;
  name: string;
  bytes: number;
  path: string;
}

/**
 * What kind of thing is being saved.
 *
 * The caller says what it is and the Rust layout decides where it goes, so
 * nothing writing a file has to know the folder names. Two callers deciding
 * separately is how a project ends up with drawings in three places.
 */
export type DocumentKind =
  | "spec"
  | "drawing"
  | "dxf"
  | "pdf-drawing"
  | "ladder"
  | "export"
  | "st"
  | "scl"
  | "plcopen"
  | "neutral"
  | "hmi"
  | "panel"
  | "test"
  | "recording"
  | "commissioning"
  | "handover";

/** Ask for the folder projects should live in. Null means they cancelled. */
export async function pickWorkspace(): Promise<string | null> {
  return tauriInvoke<string | null>("pick_workspace");
}

export async function createProjectFolder(opts: {
  parent: string;
  name: string;
  client?: string | null;
  code?: string | null;
}): Promise<ProjectFolder> {
  return tauriInvoke<ProjectFolder>("create_project_folder", {
    parent: opts.parent,
    name: opts.name,
    client: opts.client ?? null,
    code: opts.code ?? null,
  });
}

export async function listProjectFolders(parent: string): Promise<ProjectFolder[]> {
  return tauriInvoke<ProjectFolder[]>("list_project_folders", { parent });
}

/** Open a project the person points at, wherever it is. */
export async function openProjectFolder(): Promise<ProjectFolder | null> {
  return tauriInvoke<ProjectFolder | null>("open_project_folder");
}

/** Returns the full path it was written to. */
export async function saveIntoProject(opts: {
  project: string;
  kind: DocumentKind | string;
  filename: string;
  contents: string;
}): Promise<string> {
  return tauriInvoke<string>("save_into_project", opts);
}

export async function readFromProject(opts: {
  project: string;
  kind: DocumentKind | string;
  filename: string;
}): Promise<string | null> {
  return tauriInvoke<string | null>("read_from_project", opts);
}

export async function listProjectFiles(project: string): Promise<FolderEntry[]> {
  return tauriInvoke<FolderEntry[]>("list_project_files", { project });
}

/** Show the folder in Explorer or Finder. */
export async function revealProject(project: string): Promise<void> {
  await tauriInvoke<void>("reveal_project", { project });
}

export async function setWorkspaceDir(dir: string): Promise<void> {
  await tauriInvoke<void>("set_workspace_dir", { dir });
}

export async function getWorkspaceDir(): Promise<string | null> {
  return tauriInvoke<string | null>("get_workspace_dir");
}

/** Null forgets it, which is what closing a project means. */
export async function setLastProject(project: string | null): Promise<void> {
  await tauriInvoke<void>("set_last_project", { project });
}

export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  await tauriInvoke<void>("set_sidebar_collapsed", { collapsed });
}
