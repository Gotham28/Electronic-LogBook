import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { setup, accounts as a } from "./support.js";
import { engine } from "./database.js";
import { resetVoiceLogLimits } from "../src/lib/voice-log/rate-limit.js";

let runtime: Awaited<ReturnType<typeof setup>>;
const baseFetch = globalThis.fetch;

// Configurable mock handlers for OpenAI endpoints
let mockSttText = "Patient UHID 12345, 4-year-old male with fever and cough for 3 days. Diagnosis: Viral pneumonia.";
let mockSttStatus = 200;
let mockResponsesStatus = 200;
let mockResponsesOutput: any = null;
let lastSttRequest: { url: string; headers: Headers; bodyText?: string } | null = null;
let lastResponsesRequest: { url: string; headers: Headers; bodyJson: any } | null = null;
let responsesCallCount = 0;

before(async () => {
  process.env.OPENAI_API_KEY = "test-mock-openai-key";
  process.env.VOICE_LOG_STT_MODEL = "gpt-transcribe";
  process.env.VOICE_LOG_MODEL = "gpt-6-luna";

  globalThis.fetch = async (url: string | URL | Request, options?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr === "https://api.openai.com/v1/audio/transcriptions") {
      const headers = new Headers(options?.headers);
      lastSttRequest = { url: urlStr, headers };
      if (mockSttStatus !== 200) {
        return new Response(JSON.stringify({ error: "STT error" }), {
          status: mockSttStatus,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ text: mockSttText }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr === "https://api.openai.com/v1/responses") {
      responsesCallCount++;
      const headers = new Headers(options?.headers);
      const bodyJson = options?.body ? JSON.parse(options.body as string) : null;
      lastResponsesRequest = { url: urlStr, headers, bodyJson };

      if (mockResponsesStatus !== 200) {
        return new Response(JSON.stringify({ error: "Responses error" }), {
          status: mockResponsesStatus,
          headers: { "Content-Type": "application/json" },
        });
      }

      const defaultOutput = {
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  sanitizedTranscript: mockSttText,
                  fields: {
                    date: "2026-11-24",
                    patientUhid: "12345",
                    age: "4 years",
                    gender: "Male",
                    category: null,
                    sampleProcessing: null,
                    medicalSummary: null,
                    chiefComplaints: "fever and cough for 3 days",
                    history: null,
                    examination: null,
                    investigations: null,
                    diagnosis: "Viral pneumonia",
                    differentialDiagnosis: null,
                    management: null,
                    outcome: null,
                    learningPoints: null,
                  },
                  warnings: [],
                }),
              },
            ],
          },
        ],
      };

      return new Response(JSON.stringify(mockResponsesOutput ?? defaultOutput), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return baseFetch(url, options);
  };

  runtime = await setup();
});

after(async () => {
  globalThis.fetch = baseFetch;
  if (runtime) {
    await new Promise<void>((done) => runtime.server.close(() => done()));
  }
  await engine.close();
});

beforeEach(() => {
  resetVoiceLogLimits();
  process.env.OPENAI_API_KEY = "test-mock-openai-key";
  mockSttText = "Patient UHID 12345, 4-year-old male with fever and cough for 3 days. Diagnosis: Viral pneumonia.";
  mockSttStatus = 200;
  mockResponsesStatus = 200;
  mockResponsesOutput = null;
  lastSttRequest = null;
  lastResponsesRequest = null;
  responsesCallCount = 0;
});

// Helper audio buffers
const WEBM_AUDIO = (size = 512) =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(size - 4, 0x42)]);
const WAV_AUDIO = (size = 512) =>
  Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4, 0), Buffer.from("WAVE"), Buffer.alloc(size - 12, 0x20)]);
const NON_AUDIO = (size = 512) => Buffer.alloc(size, 0x5a); // 0x5a 'Z' - no audio magic header
const SMALL_AUDIO = () => Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x02]); // 6 bytes (< 128)
const LARGE_AUDIO = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(10 * 1024 * 1024 + 1024, 0x42)]); // > 10 MB

async function callVoiceLog(
  studentId: number | string,
  who: keyof typeof a | undefined,
  logType: string | undefined,
  buffer: Buffer,
  contentType = "audio/webm"
) {
  const query = logType !== undefined ? `?logType=${logType}` : "";
  const token = who ? a[who]?.token : undefined;
  const headers: Record<string, string> = {
    "Content-Type": contentType,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${runtime.base}/api/students/${studentId}/voice-log/extract${query}`, {
    method: "POST",
    headers,
    body: new Uint8Array(buffer),
  });
  let body: any;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

test("AGENTS.md §11 evidence standard: 401, 403, 200, 404/403 authorization cases", async () => {
  const student0 = a.student0;
  const student1 = a.student1; // Student in different department (Pediatrics vs Dermatology)
  const student20 = a.student20; // Student in same department (Pediatrics), different owner
  const faculty0 = a.faculty0; // Professor in same department
  const NONEXISTENT_STUDENT_ID = 999999;

  // 1. Unauthenticated request -> 401
  const unauthenticated = await callVoiceLog(student0.studentId!, undefined, "case", WEBM_AUDIO());
  console.log("Voice Log unauthenticated ->", unauthenticated.status, JSON.stringify(unauthenticated.body));
  assert.equal(unauthenticated.status, 401, "Unauthenticated request must return 401");

  // 2a. Authenticated, wrong owner (different student, same department) -> 403
  const wrongOwnerSameDept = await callVoiceLog(student0.studentId!, "student20", "case", WEBM_AUDIO());
  console.log("Voice Log wrong-owner (same dept student) ->", wrongOwnerSameDept.status, JSON.stringify(wrongOwnerSameDept.body));
  assert.equal(wrongOwnerSameDept.status, 403, "Wrong owner student must return 403");

  // 2b. Authenticated, wrong owner (different student, different department) -> 403
  const wrongOwnerDiffDept = await callVoiceLog(student0.studentId!, "student1", "case", WEBM_AUDIO());
  console.log("Voice Log wrong-owner (diff dept student) ->", wrongOwnerDiffDept.status, JSON.stringify(wrongOwnerDiffDept.body));
  assert.equal(wrongOwnerDiffDept.status, 403, "Cross-department student must return 403");

  // 2c. Authenticated, wrong role (faculty cannot POST extraction for student) -> 403
  const wrongRoleFaculty = await callVoiceLog(student0.studentId!, "faculty0", "case", WEBM_AUDIO());
  console.log("Voice Log wrong-role (faculty) ->", wrongRoleFaculty.status, JSON.stringify(wrongRoleFaculty.body));
  assert.equal(wrongRoleFaculty.status, 403, "Faculty caller on student voice-log extraction must return 403");

  // 3. Authenticated, correct owner -> 200
  const correctOwner = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Voice Log correct-owner ->", correctOwner.status, JSON.stringify({ logType: correctOwner.body?.logType, hasFields: !!correctOwner.body?.fields }));
  assert.equal(correctOwner.status, 200, "Owning student must receive 200");
  assert.equal(correctOwner.body.logType, "case");
  assert.ok(correctOwner.body.fields);
  assert.equal(correctOwner.body.fields.patientUhid, "12345");
  assert.equal(correctOwner.body.fields.gender, "Male");

  // 4. Authenticated, nonexistent student ID -> 403 (SEC-1b enumeration collapse: prevents student ID enumeration)
  const nonexistent = await callVoiceLog(NONEXISTENT_STUDENT_ID, "student0", "case", WEBM_AUDIO());
  console.log("Voice Log nonexistent studentId ->", nonexistent.status, JSON.stringify(nonexistent.body));
  assert.equal(nonexistent.status, 403, "SEC-1b: Nonexistent student must return 403 to prevent enumeration");
  assert.deepEqual(nonexistent.body, { message: "Student is outside your access scope" });
});

test("Validation & Resilience: logType, audio magic bytes, size limits, and rate limits", async () => {
  const student0 = a.student0;

  // Invalid logType -> 400
  const invalidLogType = await callVoiceLog(student0.studentId!, "student0", "invalid_type", WEBM_AUDIO());
  console.log("Validation: invalid logType ->", invalidLogType.status, JSON.stringify(invalidLogType.body));
  assert.equal(invalidLogType.status, 400);

  // Missing logType -> 400
  const missingLogType = await callVoiceLog(student0.studentId!, "student0", undefined, WEBM_AUDIO());
  console.log("Validation: missing logType ->", missingLogType.status, JSON.stringify(missingLogType.body));
  assert.equal(missingLogType.status, 400);

  // Unsupported audio format (PNG/text magic bytes) -> 400
  const nonAudio = await callVoiceLog(student0.studentId!, "student0", "case", NON_AUDIO());
  console.log("Validation: non-audio bytes ->", nonAudio.status, JSON.stringify(nonAudio.body));
  assert.equal(nonAudio.status, 400);

  // Audio too small (< 128 bytes) -> 400
  const smallAudio = await callVoiceLog(student0.studentId!, "student0", "case", SMALL_AUDIO());
  console.log("Validation: small audio (<128B) ->", smallAudio.status, JSON.stringify(smallAudio.body));
  assert.equal(smallAudio.status, 400);

  // Audio too large (> 10 MB) -> 413
  const largeAudio = await callVoiceLog(student0.studentId!, "student0", "case", LARGE_AUDIO());
  console.log("Validation: large audio (>10MB) ->", largeAudio.status, JSON.stringify(largeAudio.body));
  assert.equal(largeAudio.status, 413, "Audio recording exceeding 10 MB limit must return 413");
  assert.equal(largeAudio.body.message, "Audio recording exceeds the 10 MB limit.");

  // Valid WAV audio magic bytes with application/octet-stream content-type -> 200
  const wavAudio = await callVoiceLog(student0.studentId!, "student0", "case", WAV_AUDIO(), "application/octet-stream");
  assert.equal(wavAudio.status, 200, "application/octet-stream raw audio must be accepted");

  // Rate Limiting: 6 requests allowed in rolling window, 7th fails with 429
  resetVoiceLogLimits();
  for (let i = 0; i < 6; i++) {
    const res = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
    assert.equal(res.status, 200, `Request ${i + 1} within burst limit should succeed`);
  }
  const rateLimited = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Rate limiter: 7th call in burst window ->", rateLimited.status, JSON.stringify(rateLimited.body));
  assert.equal(rateLimited.status, 429, "7th request in rolling window must be rejected with 429");
  assert.ok(rateLimited.body.message.includes("rate limit"));

  // Resetting limits allows request to proceed
  resetVoiceLogLimits();
  const afterReset = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  assert.equal(afterReset.status, 200, "Request after rate limit reset must succeed");
});

test("Stage 1 Short-circuit on empty speech: skips Stage 2 GPT-6 call", async () => {
  const student0 = a.student0;

  // Configure STT mock to return empty transcript
  mockSttText = "   \n  "; // whitespace only

  const emptySpeechRes = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Empty speech response ->", emptySpeechRes.status, JSON.stringify({
    warnings: emptySpeechRes.body?.warnings,
    missingRequired: emptySpeechRes.body?.missingRequired,
  }));

  assert.equal(emptySpeechRes.status, 200);
  assert.equal(emptySpeechRes.body.transcript, "");
  assert.equal(responsesCallCount, 0, "Stage 2 Responses API must NOT be called when speech is empty");
  assert.ok(emptySpeechRes.body.warnings.some((w: string) => w.includes("No speech was detected")));
  assert.ok(emptySpeechRes.body.missingRequired.length > 0, "Deterministic missingRequired fields must be returned");
});

test("GPT-6 Structured Extraction contract and Responses API payload verification", async () => {
  const student0 = a.student0;

  mockSttText = "Patient UHID 998877, 10-year-old female admitted in PICU with status epilepticus. Managed with IV Lorazepam.";

  const res = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  assert.equal(res.status, 200);

  // Verify Stage 1 STT contract
  assert.ok(lastSttRequest);
  assert.equal(lastSttRequest.headers.get("authorization"), "Bearer test-mock-openai-key");

  // Verify Stage 2 Responses API contract
  assert.ok(lastResponsesRequest);
  assert.equal(lastResponsesRequest.headers.get("authorization"), "Bearer test-mock-openai-key");
  const payload = lastResponsesRequest.bodyJson;
  assert.equal(payload.model, "gpt-6-luna");
  assert.equal(payload.store, false, "Must send store: false");
  assert.deepEqual(payload.reasoning, { effort: "none" }, "Must send reasoning: { effort: 'none' }");
  assert.equal(payload.max_output_tokens, 1500);
  assert.equal(payload.temperature, undefined, "Must NOT send temperature");
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true, "Must use strict JSON schema");
  assert.equal(payload.text.format.name, "voice_log_extraction");

  // Verify instructions include Asian/Kolkata date and privacy rules
  assert.ok(payload.instructions.includes("Asia/Kolkata"));
  assert.ok(payload.instructions.includes("ZERO HALLUCINATION"));
  assert.ok(payload.instructions.includes("patientUhid"));
});

test("Procedure extraction: enum post-validation, dynamic fields, and server-side missingRequired", async () => {
  const student0 = a.student0;

  mockSttText = "Lumbar puncture performed on 6-year-old child in casualty. Patient ID 445566.";

  mockResponsesOutput = {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              sanitizedTranscript: mockSttText,
              fields: {
                date: "2026-11-24",
                group: "Emergency",
                procedureName: "Lumbar Puncture",
                patientUhid: "445566",
                diagnosis: "Meningitis",
                sex: "InvalidSexValue", // Out of enum!
                age: "6 years",
                setting: "InvalidSettingValue", // Out of enum!
                experience: "InvalidExperienceValue", // Out of enum!
                customFields: {
                  indication: "Suspected meningitis",
                },
              },
              warnings: [],
            }),
          },
        ],
      },
    ],
  };

  const res = await callVoiceLog(student0.studentId!, "student0", "procedure", WEBM_AUDIO());
  console.log("Procedure extraction response ->", res.status, JSON.stringify({
    fields: res.body?.fields,
    warnings: res.body?.warnings,
    missingRequired: res.body?.missingRequired,
  }));

  assert.equal(res.status, 200);
  assert.equal(res.body.logType, "procedure");
  // Out-of-enum values must be cleared and warnings appended
  assert.equal(res.body.fields.sex, null, "Out-of-enum sex must be cleared to null");
  assert.equal(res.body.fields.setting, null, "Out-of-enum setting must be cleared to null");
  assert.ok(res.body.warnings.some((w: string) => w.includes("Unrecognized sex")));
  assert.ok(res.body.warnings.some((w: string) => w.includes("Unrecognized setting")));
  // Deterministic server-computed missingRequired
  assert.ok(Array.isArray(res.body.missingRequired));
});

test("Error mapping: 503 unavailable and 502 malformed output", async () => {
  const student0 = a.student0;

  // Missing OPENAI_API_KEY -> 503
  delete process.env.OPENAI_API_KEY;
  const noKey = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Error mapping: missing API key ->", noKey.status, JSON.stringify(noKey.body));
  assert.equal(noKey.status, 503);
  process.env.OPENAI_API_KEY = "test-mock-openai-key";

  // STT service returns 500 -> 503
  mockSttStatus = 500;
  const sttDown = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Error mapping: STT service 500 ->", sttDown.status, JSON.stringify(sttDown.body));
  assert.equal(sttDown.status, 503);
  mockSttStatus = 200;

  // GPT-6 service returns 500 -> 503
  mockResponsesStatus = 500;
  const gptDown = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Error mapping: GPT service 500 ->", gptDown.status, JSON.stringify(gptDown.body));
  assert.equal(gptDown.status, 503);
  mockResponsesStatus = 200;

  // GPT-6 returns invalid/unparseable JSON in output_text -> 502
  mockResponsesOutput = {
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: "{ malformed json: not valid ...",
          },
        ],
      },
    ],
  };
  const malformedOutput = await callVoiceLog(student0.studentId!, "student0", "case", WEBM_AUDIO());
  console.log("Error mapping: malformed output_text ->", malformedOutput.status, JSON.stringify(malformedOutput.body));
  assert.equal(malformedOutput.status, 502);
});
