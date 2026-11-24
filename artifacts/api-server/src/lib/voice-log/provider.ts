import {
  type VoiceLogType,
  type VoiceLogCaseFields,
  type VoiceLogProcedureFields,
  type VoiceLogExtractResponse,
  isBuiltInProcedureField,
} from "@workspace/api-zod";
import { detectAudioFileType } from "./audio.js";
import { VoiceLogError } from "./errors.js";
import {
  type VoiceLogDepartmentContext,
  type DepartmentCaseContext,
  type DepartmentProcedureContext,
} from "./context.js";

export { VoiceLogError };

export interface ExtractVoiceLogOptions {
  bytes: Buffer;
  logType: VoiceLogType;
  departmentContext: VoiceLogDepartmentContext;
  fetchImpl?: typeof fetch;
}

function getTodayKolkata(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function sanitizeTextPII(text: string): { sanitized: string; hadRedactions: boolean } {
  let hadRedactions = false;

  // Phone numbers (e.g. +91 9876543210, 98765-43210, etc.)
  const phoneRegex = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g;
  const sanitizedPhones = text.replace(phoneRegex, (match) => {
    // Avoid redacting short standalone numbers or dates
    if (match.replace(/\D/g, "").length >= 10) {
      hadRedactions = true;
      return "[REDACTED]";
    }
    return match;
  });

  // Email addresses
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const sanitizedEmails = sanitizedPhones.replace(emailRegex, () => {
    hadRedactions = true;
    return "[REDACTED]";
  });

  return { sanitized: sanitizedEmails, hadRedactions };
}

function computeMissingRequired(
  logType: VoiceLogType,
  fields: VoiceLogCaseFields | VoiceLogProcedureFields,
  ctx: DepartmentCaseContext | DepartmentProcedureContext
): string[] {
  const missing: string[] = [];

  if (logType === "case") {
    const caseFields = fields as VoiceLogCaseFields;
    if (!caseFields.date) missing.push("date");
    if (!caseFields.age) missing.push("age");
    if (!caseFields.gender) missing.push("gender");
    if (!caseFields.category) missing.push("category");
    if (!caseFields.diagnosis) missing.push("diagnosis");
  } else {
    const procFields = fields as VoiceLogProcedureFields;
    const procCtx = ctx as DepartmentProcedureContext;

    if (!procFields.date) missing.push("date");
    if (!procFields.procedureName) missing.push("procedureName");
    if (!procCtx.freeTextProcedures && !procFields.group) missing.push("group");

    if (procCtx.dynamicProcedureFields) {
      for (const field of procCtx.procedureFields) {
        if (!field.isRequired) continue;
        switch (field.id) {
          case "patientAge":
            if (!procFields.age && !missing.includes("age")) missing.push("age");
            break;
          case "sex":
            if (!procFields.sex && !missing.includes("sex")) missing.push("sex");
            break;
          case "patientUhid":
            if (!procFields.patientUhid && !missing.includes("patientUhid")) missing.push("patientUhid");
            break;
          case "diagnosis":
            if (!procFields.diagnosis && !missing.includes("diagnosis")) missing.push("diagnosis");
            break;
          case "setting":
            if (!procFields.setting && !missing.includes("setting")) missing.push("setting");
            break;
          case "competencyLevel":
            if (!procFields.experience && !missing.includes("experience")) missing.push("experience");
            break;
          default:
            if (!procFields.customFields?.[field.id] && !missing.includes(field.id)) {
              missing.push(field.id);
            }
            break;
        }
      }
    } else {
      const matched = procCtx.procedures.find(
        (p) =>
          p.name.trim().toLowerCase() === procFields.procedureName?.trim().toLowerCase() &&
          (!procFields.group || p.group.trim().toLowerCase() === procFields.group?.trim().toLowerCase())
      );
      const reqList = matched?.requiredLogFields ?? [];

      if (reqList.includes("patientAge") && !procFields.age && !missing.includes("age")) missing.push("age");
      if (reqList.includes("sex") && !procFields.sex && !missing.includes("sex")) missing.push("sex");
      if (reqList.includes("patientUhid") && !procFields.patientUhid && !missing.includes("patientUhid")) missing.push("patientUhid");
      if (reqList.includes("diagnosis") && !procFields.diagnosis && !missing.includes("diagnosis")) missing.push("diagnosis");
      if (reqList.includes("setting") && !procFields.setting && !missing.includes("setting")) missing.push("setting");
      if (reqList.includes("competencyLevel") && !procFields.experience && !missing.includes("experience")) missing.push("experience");

      if (procCtx.procedureExperience && procCtx.competencyLevels.length > 0 && !procFields.experience && !missing.includes("experience")) {
        missing.push("experience");
      }
    }
  }

  return missing;
}

function buildExtractionSchema(logType: VoiceLogType, ctx: VoiceLogDepartmentContext) {
  if (logType === "case") {
    const caseCtx = ctx.case;
    const categoryEnum =
      caseCtx.caseCategories.length > 0 && !caseCtx.microbiologyCaseFields
        ? caseCtx.caseCategories.map((c) => c.value)
        : undefined;

    const caseProperties: Record<string, unknown> = {
      date: { type: ["string", "null"], description: "Encounter date in YYYY-MM-DD format" },
      patientUhid: { type: ["string", "null"], description: "De-identified IP/OP or patient UHID number if spoken" },
      age: { type: ["string", "null"], description: "Patient age with unit (e.g. '8 years', '3 months')" },
      gender: { type: ["string", "null"], enum: ["Male", "Female", "Other", null] },
      category: categoryEnum
        ? { type: ["string", "null"], enum: [...categoryEnum, null] }
        : { type: ["string", "null"] },
      sampleProcessing: { type: ["string", "null"] },
      medicalSummary: { type: ["string", "null"] },
      chiefComplaints: { type: ["string", "null"] },
      history: { type: ["string", "null"] },
      examination: { type: ["string", "null"] },
      investigations: { type: ["string", "null"] },
      diagnosis: { type: ["string", "null"] },
      differentialDiagnosis: { type: ["string", "null"] },
      management: { type: ["string", "null"] },
      outcome: { type: ["string", "null"] },
      learningPoints: { type: ["string", "null"] },
    };

    const caseRequired = Object.keys(caseProperties);

    return {
      type: "object",
      properties: {
        sanitizedTranscript: {
          type: "string",
          description: "Transcript with patient names, phone numbers, and addresses redacted with [REDACTED]",
        },
        fields: {
          type: "object",
          properties: caseProperties,
          required: caseRequired,
          additionalProperties: false,
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["sanitizedTranscript", "fields", "warnings"],
      additionalProperties: false,
    };
  } else {
    const procCtx = ctx.procedure;
    const customProps: Record<string, unknown> = {};
    if (procCtx.dynamicProcedureFields && procCtx.procedureFields.length > 0) {
      for (const field of procCtx.procedureFields) {
        if (isBuiltInProcedureField(field.id)) continue;
        if ((field.type === "select" || field.type === "radio") && field.options && field.options.length > 0) {
          customProps[field.id] = { type: ["string", "null"], enum: [...field.options, null] };
        } else {
          customProps[field.id] = { type: ["string", "null"] };
        }
      }
    }

    const procedureProperties: Record<string, unknown> = {
      date: { type: ["string", "null"], description: "Procedure date in YYYY-MM-DD format" },
      group: { type: ["string", "null"], description: "Procedure category or group name" },
      procedureName: { type: ["string", "null"], description: "Exact name of the procedure performed" },
      patientUhid: { type: ["string", "null"], description: "De-identified IP/OP or patient UHID number if spoken" },
      diagnosis: { type: ["string", "null"], description: "Diagnosis or clinical indication" },
      sex: { type: ["string", "null"], enum: ["Male", "Female", "Other", null] },
      age: { type: ["string", "null"], description: "Patient age with unit" },
      setting: { type: ["string", "null"], enum: ["Ward", "Casualty", "OT", "NICU", null] },
      experience: { type: ["string", "null"], description: "Role level or competency level (e.g. O, A, PS, PI)" },
      customFields: {
        type: "object",
        properties: customProps,
        required: Object.keys(customProps),
        additionalProperties: false,
      },
    };

    const procedureRequired = Object.keys(procedureProperties);

    return {
      type: "object",
      properties: {
        sanitizedTranscript: {
          type: "string",
          description: "Transcript with patient names, phone numbers, and addresses redacted with [REDACTED]",
        },
        fields: {
          type: "object",
          properties: procedureProperties,
          required: procedureRequired,
          additionalProperties: false,
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["sanitizedTranscript", "fields", "warnings"],
      additionalProperties: false,
    };
  }
}

export async function extractVoiceLog(options: ExtractVoiceLogOptions): Promise<VoiceLogExtractResponse> {
  const { bytes, logType, departmentContext, fetchImpl = fetch } = options;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new VoiceLogError("VOICE_LOG_UNAVAILABLE");
  }

  const detected = detectAudioFileType(bytes);
  if (!detected) {
    throw new VoiceLogError("VOICE_LOG_INVALID_AUDIO");
  }

  // Stage 1: STT Transcription
  const sttModel = process.env.VOICE_LOG_STT_MODEL || "gpt-transcribe";
  const formData = new FormData();
  const fileBlob = new Blob([new Uint8Array(bytes)], { type: detected.mimeType });
  formData.append("file", fileBlob, `recording.${detected.ext}`);
  formData.append("model", sttModel);
  formData.append("response_format", "json");
  if (departmentContext.sttGlossary) {
    formData.append("prompt", departmentContext.sttGlossary);
  }

  let sttResponse: Response;
  try {
    sttResponse = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VoiceLogError("VOICE_LOG_UNAVAILABLE");
  }

  if (!sttResponse.ok) {
    throw new VoiceLogError("VOICE_LOG_UNAVAILABLE");
  }

  let sttData: any;
  try {
    sttData = await sttResponse.json();
  } catch {
    throw new VoiceLogError("VOICE_LOG_INVALID_OUTPUT");
  }

  const rawTranscript = typeof sttData?.text === "string" ? sttData.text.trim() : "";

  // If transcript is empty/whitespace: return immediately WITHOUT calling Stage 2
  if (!rawTranscript) {
    const warnings = ["No speech was detected in the recording. Please try speaking closer to the microphone."];
    if (logType === "case") {
      const emptyCase: VoiceLogCaseFields = {
        date: null,
        patientUhid: null,
        age: null,
        gender: null,
        category: null,
        sampleProcessing: null,
        medicalSummary: null,
        chiefComplaints: null,
        history: null,
        examination: null,
        investigations: null,
        diagnosis: null,
        differentialDiagnosis: null,
        management: null,
        outcome: null,
        learningPoints: null,
      };
      return {
        logType: "case",
        transcript: "",
        fields: emptyCase,
        missingRequired: computeMissingRequired("case", emptyCase, departmentContext.case),
        warnings,
      };
    } else {
      const emptyProc: VoiceLogProcedureFields = {
        date: null,
        group: null,
        procedureName: null,
        patientUhid: null,
        diagnosis: null,
        sex: null,
        age: null,
        setting: null,
        experience: null,
        customFields: {},
      };
      return {
        logType: "procedure",
        transcript: "",
        fields: emptyProc,
        missingRequired: computeMissingRequired("procedure", emptyProc, departmentContext.procedure),
        warnings,
      };
    }
  }

  // Stage 2: GPT-6 Structured Extraction
  const todayKolkata = getTodayKolkata();
  const specificInstructions: string[] = [];

  if (logType === "case") {
    const caseCtx = departmentContext.case;
    if (caseCtx.microbiologyCaseFields) {
      specificInstructions.push(
        "Department mode is Microbiology. Map the sample/specimen (e.g. Blood, Urine, Pus, Sputum, CSF) to 'category'. Map lab processing (gram stain, culture, colony, biochemical, AST) to 'sampleProcessing'. Map provisional diagnosis to 'diagnosis'. Keep complaints, history, and examination null."
      );
    } else if (caseCtx.medicalSummaryCaseFields) {
      specificInstructions.push(
        "Department mode uses a unified medical summary. Map the clinical story and history to 'medicalSummary'. Leave chiefComplaints, history, and examination null."
      );
    }
    if (caseCtx.caseCategories.length > 0) {
      specificInstructions.push(
        `Allowed case categories: ${caseCtx.caseCategories.map((c) => c.value).join(", ")}. Match to an allowed category if applicable.`
      );
    }
  } else {
    const procCtx = departmentContext.procedure;
    if (procCtx.freeTextProcedures) {
      specificInstructions.push("Procedures can be entered as free text.");
    } else {
      specificInstructions.push(
        `Allowed department procedures: ${procCtx.procedures.map((p) => `[${p.group}] ${p.name}`).join("; ")}. You MUST match strictly to one of these allowed procedures or return null if no match.`
      );
    }
    if (procCtx.competencyLevels.length > 0) {
      specificInstructions.push(
        `Allowed competency levels: ${procCtx.competencyLevels.map((c) => c.value).join(", ")} (or O, A, PS, PI).`
      );
    }
  }

  const instructions = [
    "You are an expert clinical logbook structured extraction assistant for medical postgraduate residents.",
    `Current date in Asia/Kolkata is ${todayKolkata}. Use this date to resolve relative date references (e.g. 'today' -> '${todayKolkata}', 'yesterday' -> 1 day prior). Dates must be YYYY-MM-DD.`,
    "PII RULES: Redact spoken patient names, personal telephone numbers, email addresses, or residential street addresses by replacing them with [REDACTED] in sanitizedTranscript. Never include patient names or contact information in any field. Append a notice in warnings whenever personal patient information was redacted.",
    "Allow hospital patient record numbers (IP number, OP number, UHID) ONLY inside patientUhid.",
    "ZERO HALLUCINATION: Return null for any field not explicitly spoken or clearly implied. Never invent diagnoses, dates, outcomes, or procedures.",
    ...specificInstructions,
  ].join("\n\n");

  const extractionModel = process.env.VOICE_LOG_MODEL || "gpt-6-luna";
  const extractionSchema = buildExtractionSchema(logType, departmentContext);

  const requestBody = {
    model: extractionModel,
    store: false,
    reasoning: { effort: "none" },
    max_output_tokens: 1500,
    instructions,
    input: [
      {
        role: "user",
        content: rawTranscript,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "voice_log_extraction",
        strict: true,
        schema: extractionSchema,
      },
    },
  };

  let extractResponse: Response;
  try {
    extractResponse = await fetchImpl("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new VoiceLogError("VOICE_LOG_UNAVAILABLE");
  }

  if (!extractResponse.ok) {
    throw new VoiceLogError("VOICE_LOG_UNAVAILABLE");
  }

  let extractPayload: any;
  try {
    extractPayload = await extractResponse.json();
  } catch {
    throw new VoiceLogError("VOICE_LOG_INVALID_OUTPUT");
  }

  // Safe parsing of Responses API output
  let outputText: string | undefined;
  if (Array.isArray(extractPayload?.output)) {
    for (const item of extractPayload.output) {
      if (item?.type === "message" && Array.isArray(item?.content)) {
        for (const part of item.content) {
          if (part?.type === "output_text" && typeof part?.text === "string") {
            outputText = part.text;
            break;
          }
        }
      }
      if (outputText) break;
    }
  }

  if (!outputText && extractPayload?.choices?.[0]?.message?.content) {
    outputText = extractPayload.choices[0].message.content;
  }

  if (!outputText) {
    throw new VoiceLogError("VOICE_LOG_INVALID_OUTPUT");
  }

  let parsedOutput: {
    sanitizedTranscript?: string;
    fields?: Record<string, unknown>;
    warnings?: string[];
  };
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    throw new VoiceLogError("VOICE_LOG_INVALID_OUTPUT");
  }

  const warnings: string[] = Array.isArray(parsedOutput.warnings)
    ? parsedOutput.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const rawSanitized = typeof parsedOutput.sanitizedTranscript === "string" && parsedOutput.sanitizedTranscript.trim()
    ? parsedOutput.sanitizedTranscript
    : rawTranscript;

  const { sanitized: finalTranscript, hadRedactions } = sanitizeTextPII(rawSanitized);
  if (hadRedactions && !warnings.some((w) => w.toLowerCase().includes("redact"))) {
    warnings.push("Personal patient identifying details were redacted from the transcript.");
  }

  const rawFields = parsedOutput.fields && typeof parsedOutput.fields === "object" ? parsedOutput.fields : {};

  // Post-validation and normalization
  if (logType === "case") {
    const caseCtx = departmentContext.case;
    const cleanString = (val: unknown): string | null =>
      typeof val === "string" && val.trim() ? val.trim() : null;

    let patientUhid = cleanString(rawFields.patientUhid);
    if (caseCtx.hideUhid && patientUhid) {
      patientUhid = null;
      warnings.push("Patient ID / UHID is hidden for this department and was not recorded.");
    }

    let gender = cleanString(rawFields.gender);
    if (gender) {
      const match = ["Male", "Female", "Other"].find((g) => g.toLowerCase() === gender?.toLowerCase());
      if (match) {
        gender = match;
      } else {
        warnings.push(`Unrecognized gender "${gender}" was cleared.`);
        gender = null;
      }
    }

    let category = cleanString(rawFields.category);
    if (category && caseCtx.caseCategories.length > 0 && !caseCtx.microbiologyCaseFields) {
      const matchedCat = caseCtx.caseCategories.find(
        (c) => c.value.toLowerCase() === category?.toLowerCase() || c.name.toLowerCase() === category?.toLowerCase()
      );
      if (matchedCat) {
        category = matchedCat.value;
      } else {
        warnings.push(`Category "${category}" is not configured for this department and was cleared.`);
        category = null;
      }
    }

    const fields: VoiceLogCaseFields = {
      date: cleanString(rawFields.date),
      patientUhid,
      age: cleanString(rawFields.age),
      gender: gender as "Male" | "Female" | "Other" | null,
      category,
      sampleProcessing: cleanString(rawFields.sampleProcessing),
      medicalSummary: cleanString(rawFields.medicalSummary),
      chiefComplaints: cleanString(rawFields.chiefComplaints),
      history: cleanString(rawFields.history),
      examination: cleanString(rawFields.examination),
      investigations: cleanString(rawFields.investigations),
      diagnosis: cleanString(rawFields.diagnosis),
      differentialDiagnosis: cleanString(rawFields.differentialDiagnosis),
      management: cleanString(rawFields.management),
      outcome: cleanString(rawFields.outcome),
      learningPoints: cleanString(rawFields.learningPoints),
    };

    const missingRequired = computeMissingRequired("case", fields, caseCtx);

    return {
      logType: "case",
      transcript: finalTranscript,
      fields,
      missingRequired,
      warnings,
    };
  } else {
    const procCtx = departmentContext.procedure;
    const cleanString = (val: unknown): string | null =>
      typeof val === "string" && val.trim() ? val.trim() : null;

    let patientUhid = cleanString(rawFields.patientUhid);
    if (procCtx.hideUhid && patientUhid) {
      patientUhid = null;
      warnings.push("Patient ID / UHID is hidden for this department and was not recorded.");
    }

    let sex = cleanString(rawFields.sex);
    if (sex) {
      const match = ["Male", "Female", "Other"].find((s) => s.toLowerCase() === sex?.toLowerCase());
      if (match) {
        sex = match;
      } else {
        warnings.push(`Unrecognized sex "${sex}" was cleared.`);
        sex = null;
      }
    }

    let setting = cleanString(rawFields.setting);
    if (setting) {
      const match = ["Ward", "Casualty", "OT", "NICU"].find((s) => s.toLowerCase() === setting?.toLowerCase());
      if (match) {
        setting = match;
      } else {
        warnings.push(`Unrecognized setting "${setting}" was cleared.`);
        setting = null;
      }
    }

    let procedureName = cleanString(rawFields.procedureName);
    let group = cleanString(rawFields.group);

    if (!procCtx.freeTextProcedures && procedureName) {
      const matched = procCtx.procedures.find(
        (p) =>
          p.name.toLowerCase() === procedureName?.toLowerCase() ||
          p.name.toLowerCase().includes(procedureName!.toLowerCase())
      );
      if (matched) {
        procedureName = matched.name;
        group = matched.group;
      } else {
        warnings.push(`Procedure "${procedureName}" does not match configured department procedures.`);
        procedureName = null;
        group = null;
      }
    }

    let experience = cleanString(rawFields.experience);
    if (experience && procCtx.competencyLevels.length > 0) {
      const matched = procCtx.competencyLevels.find(
        (c) => c.value.toLowerCase() === experience?.toLowerCase() || c.name.toLowerCase() === experience?.toLowerCase()
      );
      if (matched) {
        experience = matched.value;
      } else if (["O", "A", "PS", "PI"].includes(experience.toUpperCase())) {
        experience = experience.toUpperCase();
      } else {
        warnings.push(`Competency level "${experience}" is not configured for this department.`);
        experience = null;
      }
    }

    const customFields: Record<string, string> = {};
    if (procCtx.dynamicProcedureFields && rawFields.customFields && typeof rawFields.customFields === "object") {
      const rawCustom = rawFields.customFields as Record<string, unknown>;
      for (const field of procCtx.procedureFields) {
        if (isBuiltInProcedureField(field.id)) continue;
        const rawVal = rawCustom[field.id];
        if (typeof rawVal === "string" && rawVal.trim()) {
          const trimmed = rawVal.trim();
          if ((field.type === "select" || field.type === "radio") && field.options && field.options.length > 0) {
            const matchedOpt = field.options.find((o) => o.toLowerCase() === trimmed.toLowerCase());
            if (matchedOpt) {
              customFields[field.id] = matchedOpt;
            } else {
              warnings.push(`Option "${trimmed}" for ${field.label} is invalid and was cleared.`);
            }
          } else {
            customFields[field.id] = trimmed;
          }
        }
      }
    }

    const fields: VoiceLogProcedureFields = {
      date: cleanString(rawFields.date),
      group,
      procedureName,
      patientUhid,
      diagnosis: cleanString(rawFields.diagnosis),
      sex: sex as "Male" | "Female" | "Other" | null,
      age: cleanString(rawFields.age),
      setting: setting as "Ward" | "Casualty" | "OT" | "NICU" | null,
      experience,
      customFields,
    };

    const missingRequired = computeMissingRequired("procedure", fields, procCtx);

    return {
      logType: "procedure",
      transcript: finalTranscript,
      fields,
      missingRequired,
      warnings,
    };
  }
}
