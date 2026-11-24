import { db, departmentCatalogTable, procedureTypesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveConfigDepartmentId } from "../department-config-source.js";
import { getDepartmentFeatures } from "../department-features.js";
import { resolveProcedureFieldDefinitions, type ProcedureFieldDefinition } from "@workspace/api-zod";

export interface DepartmentCaseContext {
  caseCategories: Array<{ value: string; name: string }>;
  medicalSummaryCaseFields: boolean;
  microbiologyCaseFields: boolean;
  hideUhid: boolean;
}

export interface DepartmentProcedureContext {
  freeTextProcedures: boolean;
  dynamicProcedureFields: boolean;
  procedureFields: ProcedureFieldDefinition[];
  procedures: Array<{ group: string; name: string; requiredLogFields: string[] }>;
  competencyLevels: Array<{ value: string; name: string }>;
  procedureClinicalDetails: boolean;
  procedureExperience: boolean;
  hideProcedureAge: boolean;
  hideUhid: boolean;
}

export interface VoiceLogDepartmentContext {
  departmentId: number;
  configSourceId: number;
  case: DepartmentCaseContext;
  procedure: DepartmentProcedureContext;
  sttGlossary: string;
}

export async function loadVoiceLogDepartmentContext(departmentId: number): Promise<VoiceLogDepartmentContext> {
  const configSourceId = await resolveConfigDepartmentId(departmentId);
  const { features, procedureLogFields } = await getDepartmentFeatures(departmentId);

  const [catalogItems, procedureRows] = await Promise.all([
    db
      .select({
        kind: departmentCatalogTable.kind,
        name: departmentCatalogTable.name,
        value: departmentCatalogTable.value,
      })
      .from(departmentCatalogTable)
      .where(eq(departmentCatalogTable.departmentId, configSourceId)),
    db
      .select({
        group: procedureTypesTable.group,
        name: procedureTypesTable.name,
        requiredLogFields: procedureTypesTable.requiredLogFields,
      })
      .from(procedureTypesTable)
      .where(eq(procedureTypesTable.departmentId, configSourceId)),
  ]);

  const caseCategories = catalogItems
    .filter((item) => item.kind === "case_category")
    .map((item) => ({ value: item.value, name: item.name }));

  const competencyLevels = catalogItems
    .filter((item) => item.kind === "competency_level")
    .map((item) => ({ value: item.value, name: item.name }));

  const dynamicProcedureFields = Boolean(features.dynamicProcedureFields);
  const procedureFields = resolveProcedureFieldDefinitions(procedureLogFields, dynamicProcedureFields);

  const procedures = procedureRows.map((p) => ({
    group: p.group,
    name: p.name,
    requiredLogFields: Array.isArray(p.requiredLogFields) ? p.requiredLogFields : [],
  }));

  const recordDetailsEnabled =
    dynamicProcedureFields ||
    Boolean(features.procedureClinicalDetails) ||
    procedures.some((p) => p.requiredLogFields && p.requiredLogFields.length > 0);

  const caseContext: DepartmentCaseContext = {
    caseCategories,
    medicalSummaryCaseFields: Boolean(features.medicalSummaryCaseFields),
    microbiologyCaseFields: Boolean(features.microbiologyCaseFields),
    hideUhid: Boolean(features.hideUhid),
  };

  const procedureContext: DepartmentProcedureContext = {
    freeTextProcedures: Boolean(features.freeTextProcedures),
    dynamicProcedureFields,
    procedureFields,
    procedures,
    competencyLevels,
    procedureClinicalDetails: Boolean(features.procedureClinicalDetails),
    procedureExperience: features.procedureExperience !== false,
    hideProcedureAge: dynamicProcedureFields
      ? !procedureFields.some((f) => f.id === "patientAge")
      : Boolean(features.hideProcedureAge),
    hideUhid: !recordDetailsEnabled,
  };

  // Build deduplicated sttGlossary (max ~600 chars)
  const defaultAbbreviations = ["UHID", "IP", "OP", "LSCS", "NICU", "OT", "CBC", "ABG", "AST", "KOH"];
  const terms = new Set<string>();

  for (const abbr of defaultAbbreviations) {
    terms.add(abbr);
  }

  for (const cat of caseCategories) {
    if (cat.name) terms.add(cat.name);
    if (cat.value && cat.value !== cat.name) terms.add(cat.value);
  }

  for (const proc of procedures) {
    if (proc.name) terms.add(proc.name);
    if (proc.group) terms.add(proc.group);
  }

  for (const comp of competencyLevels) {
    if (comp.name) terms.add(comp.name);
  }

  const seenUpper = new Set<string>();
  const uniqueTerms: string[] = [];
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const upper = trimmed.toUpperCase();
    if (!seenUpper.has(upper)) {
      seenUpper.add(upper);
      uniqueTerms.push(trimmed);
    }
  }

  let glossary = "";
  for (const term of uniqueTerms) {
    const candidate = glossary ? `${glossary}, ${term}` : term;
    if (candidate.length > 600) {
      break;
    }
    glossary = candidate;
  }

  return {
    departmentId,
    configSourceId,
    case: caseContext,
    procedure: procedureContext,
    sttGlossary: glossary,
  };
}
