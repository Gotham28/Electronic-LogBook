import { radiologyTemplate } from "./demoDepartmentTemplates/radiology";

export const DEMO_DEPARTMENT_CHANGED_EVENT = "arogya-demo-department-changed";

type DemoCatalogItem = {
  id: number;
  name: string;
  value: string;
  required: number;
  period?: "total" | "month";
  parentValue?: string | null;
};

type DemoProfileData = {
  departmentCatalog: {
    department: { id: number; name: string; code: string };
    hod: { id: number; name: string; fullName: string };
    config: {
      requiredCases: number | null;
      requiredProcedures: number | null;
      requiredAcademic: number | null;
      enabledFeatures: Record<string, boolean>;
    };
    procedures: Array<{ id: number; name: string; group: string; required: number }>;
    academics: DemoCatalogItem[];
    postings: DemoCatalogItem[];
    caseCategories: DemoCatalogItem[];
    competencyLevels: DemoCatalogItem[];
    leaveTypes: DemoCatalogItem[];
    conferenceLevels: DemoCatalogItem[];
    clinicalWorkCategories: DemoCatalogItem[];
    clinicalWorkSubtypes: DemoCatalogItem[];
    postingSchedule: Array<{ trainingYear: number; postingValue: string; months: number }>;
  };
  students: any[];
  studentProfile: any;
  postings: any[];
  logs: { cases: any[]; procedures: any[]; academics: any[]; clinicalWorks: any[] };
  professors: any[];
  hodAnalytics: any;
  leaveBalance: Record<string, unknown>;
  leaveRecords: any[];
  assessments: any[];
  thesis: any | null;
  certifications: any[];
  residents: DemoResident[];
};

type DemoResident = {
  student: any;
  studentProfile: any;
  postings: any[];
  logs: { cases: any[]; procedures: any[]; academics: any[]; clinicalWorks: any[] };
  leaveBalance: Record<string, unknown>;
  leaveRecords: any[];
};

export type DemoDepartmentProfile = {
  id: number;
  label: string;
  accent: string;
  data: DemoProfileData;
};

const hod = { id: 3, name: "Dr. Priya Sharma", fullName: "Dr. Priya Sharma" };
const professors = [
  { id: 2, fullName: "Dr. Vivek Menon", name: "Dr. Vivek Menon", email: "vivek.menon.demo@example.com", role: "professor", title: "Associate Professor" },
];

const pediatricsProfile: DemoDepartmentProfile = {
  id: 1,
  label: "Pediatrics",
  accent: "#0f766e",
  data: {
    departmentCatalog: {
      department: { id: 1, name: "General Pediatrics", code: "peds" },
      hod,
      config: {
        requiredCases: 150,
        requiredProcedures: 80,
        requiredAcademic: 60,
        enabledFeatures: {},
      },
      procedures: [
        { id: 1, name: "Lumbar Puncture", group: "Emergency / Diagnostics", required: 15 },
        { id: 2, name: "Pediatric IV Cannulation", group: "Ward Procedures", required: 40 },
        { id: 3, name: "Nebulization Technique", group: "Ward Procedures", required: 20 },
        { id: 4, name: "Intraosseous Access", group: "Emergency / Diagnostics", required: 8 },
        { id: 5, name: "Umbilical Catheterization", group: "Neonatal Procedures", required: 10 },
        { id: 6, name: "Bag and Mask Ventilation", group: "Emergency / Diagnostics", required: 12 },
      ],
      academics: [
        { id: 1, name: "Journal Club", value: "journal-club", required: 15, period: "total" },
        { id: 2, name: "Case Presentation", value: "case-presentation", required: 20, period: "total" },
      ],
      postings: [
        { id: 1, name: "General Pediatric Ward", value: "general-pediatric-ward", required: 0, period: "total" },
        { id: 2, name: "Neonatal Intensive Care Unit", value: "nicu", required: 0, period: "total" },
        { id: 3, name: "Pediatric Intensive Care Unit", value: "picu", required: 0, period: "total" },
        { id: 4, name: "Emergency Department", value: "emergency-department", required: 0, period: "total" },
      ],
      caseCategories: [],
      competencyLevels: [],
      leaveTypes: [],
      conferenceLevels: [],
      clinicalWorkCategories: [],
      clinicalWorkSubtypes: [],
      postingSchedule: [],
    },
    students: [
      {
        id: 1,
        registrationNumber: "REG-PED-2024",
        fullName: "Kavya Nair",
        name: "Kavya Nair",
        email: "kavya.nair.demo@example.com",
        batch: "2024",
        completion: 82,
        overallCompletion: 82,
        status: "approved",
        shortfallStatus: "on_track",
        department: "General Pediatrics",
        departmentId: 1,
        mentorId: 2,
        verified: { cases: 120, procedures: 75, academics: 50 },
        targets: { cases: 150, procedures: 80, academics: 60 },
      },
      {
        id: 4,
        registrationNumber: "REG-PED-2025",
        fullName: "Rohan Verma",
        name: "Rohan Verma",
        email: "rohan.verma.demo@example.com",
        batch: "2025",
        completion: 30,
        overallCompletion: 30,
        status: "approved",
        shortfallStatus: "on_track",
        department: "General Pediatrics",
        departmentId: 1,
        mentorId: 2,
        verified: { cases: 45, procedures: 20, academics: 15 },
        targets: { cases: 150, procedures: 80, academics: 60 },
      },
    ],
    studentProfile: {
      id: 1,
      user: { fullName: "Kavya Nair", name: "Kavya Nair", email: "kavya.nair.demo@example.com", role: "student" },
      enrollmentYear: 2024,
      completionStatus: "on_track",
      departmentId: 1,
      registrationNumber: "REG-PED-2024",
      dateOfJoining: "2024-07-01T00:00:00Z",
    },
    postings: [
      { id: 10, unit: "NICU", startDate: "2024-07-01", endDate: "2024-09-30", status: "completed" },
    ],
    logs: {
      cases: [
        { id: 101, date: "2024-10-15", diagnosisProvisional: "Acute Bronchiolitis (14-month-old)", status: "verified" },
        { id: 102, date: "2024-10-18", diagnosisProvisional: "Febrile Seizure Workup (2-year-old)", status: "pending" },
        { id: 103, date: "2024-10-22", diagnosisProvisional: "Neonatal Jaundice Follow-up", status: "verified" },
      ],
      procedures: [
        { id: 201, date: "2024-10-12", procedureName: "Lumbar Puncture", group: "Emergency / Diagnostics", status: "verified", remarks: "Good aseptic technique." },
        { id: 202, date: "2024-10-16", procedureName: "Pediatric IV Cannulation", group: "Ward Procedures", status: "verified" },
        { id: 203, date: "2024-10-19", procedureName: "Nebulization Technique", group: "Ward Procedures", status: "pending" },
      ],
      academics: [
        { id: 301, date: "2024-10-05", activityType: "Journal Club", topic: "RSV prophylaxis in high-risk infants", status: "verified" },
        { id: 302, date: "2024-10-14", activityType: "Case Presentation", topic: "Kawasaki Disease", status: "pending" },
      ],
      clinicalWorks: [],
    },
    professors,
    hodAnalytics: { totalStudents: 12, logsVerified: 850, logsPending: 42, studentsAtRisk: 1 },
    leaveBalance: { casual: { total: 20, used: 4 }, academic: { total: 14, used: 2 } },
    leaveRecords: [
      {
        id: 1,
        number: 1,
        appliedOn: "2024-08-10T10:00:00Z",
        createdAt: "2024-08-10T10:00:00Z",
        leaveType: "casual",
        startDate: "2024-08-15",
        endDate: "2024-08-18",
        fromDate: "2024-08-15",
        toDate: "2024-08-18",
        totalDays: 4,
        reason: "Family medical leave",
        approvedBy: "Dr. Priya Sharma",
        status: "approved",
      },
      {
        id: 2,
        number: 2,
        appliedOn: "2024-11-01T09:15:00Z",
        createdAt: "2024-11-01T09:15:00Z",
        leaveType: "academic",
        startDate: "2024-11-20",
        endDate: "2024-11-21",
        fromDate: "2024-11-20",
        toDate: "2024-11-21",
        totalDays: 2,
        reason: "Pediatrics Conference (PEDICON) Presentation",
        approvedBy: "Pending",
        status: "pending",
      },
    ],
    assessments: [
      { id: 1, date: "2024-10-05", examName: "End of Unit Pediatrics Assessment", type: "internal", marks: 85, maximum: 100, grade: "B", assessorName: "Dr. Vivek Menon" },
    ],
    thesis: null,
    certifications: [],
    residents: [],
  },
};

const catalogItems = (kind: string) => radiologyTemplate.catalog
  .map((item, index) => ({ item, id: index + 1 }))
  .filter(({ item }) => item.kind === kind)
  .map(({ item, id }) => ({
    id,
    name: item.name,
    value: "value" in item ? item.value : item.name,
    required: 0,
    period: "total" as const,
    ...( "parentValue" in item ? { parentValue: item.parentValue } : {}),
  }));

const radiologyCategories = catalogItems("clinical_work_category").filter((item, index, all) =>
  all.findIndex((candidate) => candidate.value === item.value) === index,
);
const radiologySubtypes = catalogItems("clinical_work_subtype");
const radiologyPostings = catalogItems("posting");
const radiologyAcademics = catalogItems("academic");
const radiologyCompetencies = catalogItems("competency_level");

function createEmptyDepartmentProfile({ id, label, name, code, accent, enabledFeatures, caseCategories = [], conferenceLevels = [] }: {
  id: number;
  label: string;
  name: string;
  code: string;
  accent: string;
  enabledFeatures: Record<string, boolean>;
  caseCategories?: DemoCatalogItem[];
  conferenceLevels?: DemoCatalogItem[];
}): DemoDepartmentProfile {
  return {
    id,
    label,
    accent,
    data: {
      departmentCatalog: {
        department: { id, name, code },
        hod,
        config: { requiredCases: null, requiredProcedures: null, requiredAcademic: null, enabledFeatures },
        procedures: [],
        academics: [],
        postings: [],
        caseCategories,
        competencyLevels: [],
        leaveTypes: [],
        conferenceLevels,
        clinicalWorkCategories: [],
        clinicalWorkSubtypes: [],
        postingSchedule: [],
      },
      students: [],
      studentProfile: {
        id: 1,
        user: { fullName: "Kavya Nair", name: "Kavya Nair", email: "kavya.nair.demo@example.com", role: "student" },
        enrollmentYear: null,
        completionStatus: "not_started",
        departmentId: id,
      },
      postings: [],
      logs: { cases: [], procedures: [], academics: [], clinicalWorks: [] },
      professors,
      hodAnalytics: { totalStudents: 0, logsVerified: 0, logsPending: 0, studentsAtRisk: 0 },
      leaveBalance: {},
      leaveRecords: [],
      assessments: [],
      thesis: null,
      certifications: [],
      residents: [],
    },
  };
}

const radiologyProfile = createEmptyDepartmentProfile({
  id: 2,
  label: "Radiology",
  name: "Radiology",
  code: "radiology",
  accent: "#4338ca",
  enabledFeatures: { ...radiologyTemplate.features },
});
radiologyProfile.data.departmentCatalog.clinicalWorkCategories = radiologyCategories;
radiologyProfile.data.departmentCatalog.clinicalWorkSubtypes = radiologySubtypes;
radiologyProfile.data.departmentCatalog.postings = radiologyPostings;
radiologyProfile.data.departmentCatalog.academics = radiologyAcademics;
radiologyProfile.data.departmentCatalog.competencyLevels = radiologyCompetencies;
radiologyProfile.data.departmentCatalog.postingSchedule = radiologyTemplate.postingSchedule.map((row) => ({
  trainingYear: row.trainingYear,
  postingValue: row.posting,
  months: row.months,
}));

const dermatologyProfile = createEmptyDepartmentProfile({
  id: 15,
  label: "Dermatology",
  name: "Dermatology",
  code: "dermatology",
  accent: "#9d174d",
  enabledFeatures: {
    useCaseTypeLabel: true,
    useThesisAndPublicationsLabel: true,
    splitThesisAndCertifications: true,
    awards: true,
    hideConferenceLocation: true,
    conferenceLevels: true,
    academicActivityExtras: true,
    freeTextPostingUnit: true,
    freeTextProcedures: true,
    academicsFirstInNav: true,
  },
  caseCategories: [
    { id: 1, name: "Long Case", value: "long_case", required: 0 },
    { id: 2, name: "Short Case", value: "short_case", required: 0 },
    { id: 3, name: "HD Case", value: "hd_case", required: 0 },
    { id: 4, name: "STD Case", value: "std_case", required: 0 },
  ],
  conferenceLevels: [
    { id: 1, name: "Regional", value: "regional", required: 0 },
    { id: 2, name: "State", value: "state", required: 0 },
    { id: 3, name: "National", value: "national", required: 0 },
    { id: 4, name: "International", value: "international", required: 0 },
  ],
});

export const demoDepartmentProfiles: DemoDepartmentProfile[] = [pediatricsProfile, radiologyProfile, dermatologyProfile];
const defaultFeatureFlags = new Map(demoDepartmentProfiles.map((profile) => [
  profile.id,
  { ...profile.data.departmentCatalog.config.enabledFeatures },
]));

type ResidentSeed = { id: number; joinedYear: number; caseCount: number; procedureCount: number; academicCount: number; clinicalCount: number };
const residentSeeds: ResidentSeed[] = [
  { id: 1, joinedYear: 2024, caseCount: 132, procedureCount: 70, academicCount: 50, clinicalCount: 72 },
  { id: 4, joinedYear: 2025, caseCount: 64, procedureCount: 32, academicCount: 24, clinicalCount: 42 },
  { id: 7, joinedYear: 2025, caseCount: 18, procedureCount: 10, academicCount: 7, clinicalCount: 15 },
];

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function activityDate(index: number, count: number, random: () => number): string {
  const now = new Date();
  const month = Math.floor(index * 12 / Math.max(count, 1));
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + month, 1));
  const day = Math.floor(random() * 23) + 2;
  date.setUTCDate(Math.min(day, month === 11 ? now.getUTCDate() : 28));
  return date.toISOString().slice(0, 10);
}

function activityStatus(index: number, seed: number, forcePending = false): "verified" | "pending" | "rejected" {
  if (forcePending) return "pending";
  const value = (index + seed) % 19;
  return value === 0 ? "rejected" : value === 5 ? "pending" : "verified";
}

function buildYearOfActivity(profile: DemoDepartmentProfile) {
  const catalog = profile.data.departmentCatalog;
  const features = catalog.config.enabledFeatures;
  const hasCases = !features.hideCaseLogs;
  const hasProcedures = !features.hideProcedureLogs;
  const hasClinicalWork = Boolean(features.clinicalWorks);
  const isPediatrics = profile.id === pediatricsProfile.id;
  const now = new Date();
  const residents: DemoResident[] = residentSeeds.map((seed, residentIndex) => {
    const random = seededRandom(profile.id * 1000 + seed.id);
    const name = "Demo Resident " + String(residentIndex + 1).padStart(2, "0");
    const departmentName = catalog.department.name;
    const registrationNumber = "DEMO-" + String(profile.id).padStart(2, "0") + "-" + String(residentIndex + 1).padStart(2, "0");
    const targetCases = catalog.config.requiredCases;
    const targetProcedures = catalog.config.requiredProcedures;
    const targetAcademics = catalog.config.requiredAcademic;
    const stageScale = residentIndex === 0 ? 1 : residentIndex === 1 ? 0.5 : 0.14;
    const caseCount = hasCases ? (isPediatrics ? seed.caseCount : Math.max(0, Math.round(48 * stageScale))) : 0;
    const procedureCount = hasProcedures ? (isPediatrics ? seed.procedureCount : Math.max(0, Math.round(28 * stageScale))) : 0;
    const academicCount = isPediatrics ? seed.academicCount : Math.round(24 * stageScale);
    const clinicalCount = hasClinicalWork ? seed.clinicalCount : 0;

    const cases = Array.from({ length: caseCount }, (_, index) => ({
      id: profile.id * 100000 + seed.id * 100 + index + 1,
      number: index + 1,
      date: activityDate(index, caseCount, random),
      patientUhid: "",
      patientAge: "",
      patientGender: "",
      age: "Sample",
      gender: "Sample",
      chiefComplaints: "Generic sample summary for interface preview.",
      history: "Sample entry.",
      examination: "Sample entry.",
      investigations: "",
      diagnosisProvisional: "Sample case entry " + String(index + 1).padStart(3, "0"),
      diagnosisFinal: "",
      diagnosis: "",
      differentialDiagnosis: "",
      management: "",
      category: catalog.caseCategories[index % Math.max(catalog.caseCategories.length, 1)]?.value ?? null,
      status: activityStatus(index, seed.id, residentIndex === 0 && index === caseCount - 1),
    }));

    const procedures = Array.from({ length: procedureCount }, (_, index) => {
      const item = catalog.procedures[index % Math.max(catalog.procedures.length, 1)];
      const genericName = features.freeTextProcedures ? "Sample procedure activity" : "Sample procedure entry";
      return {
        id: profile.id * 200000 + seed.id * 100 + index + 1,
        number: index + 1,
        date: activityDate(index, procedureCount, random),
        group: item?.group ?? "Sample activity",
        procedureGroup: item?.group ?? "Sample activity",
        patientUhid: "",
        procedureName: item?.name ?? genericName,
        age: "Sample",
        experience: catalog.competencyLevels[0]?.value ?? "assisted",
        verifiedCompetency: "No",
        status: activityStatus(index, seed.id + 3),
      };
    });

    const academics = Array.from({ length: academicCount }, (_, index) => {
      const activity = catalog.academics[index % Math.max(catalog.academics.length, 1)];
      return {
        id: profile.id * 300000 + seed.id * 100 + index + 1,
        number: index + 1,
        date: activityDate(index, academicCount, random),
        type: activity?.name ?? "Academic activity",
        activityType: activity?.name ?? "Academic activity",
        presentationType: "Sample presentation",
        topic: "Sample activity " + String(index + 1).padStart(2, "0"),
        description: "Generic sample activity for interface preview.",
        faculty: professors[0].name,
        status: activityStatus(index, seed.id + 7),
      };
    });

    const clinicalWorks = Array.from({ length: clinicalCount }, (_, index) => {
      const category = catalog.clinicalWorkCategories[index % Math.max(catalog.clinicalWorkCategories.length, 1)];
      const subtypes = catalog.clinicalWorkSubtypes.filter((item) => !item.parentValue || item.parentValue === category?.value);
      const subtype = subtypes.length ? subtypes[index % subtypes.length] : undefined;
      return {
        id: profile.id * 400000 + seed.id * 100 + index + 1,
        number: index + 1,
        date: activityDate(index, clinicalCount, random),
        category: category?.value ?? "Sample activity",
        categoryName: category?.name ?? "Sample activity",
        subType: subtype?.value ?? null,
        patientAge: "",
        patientSex: "",
        caseNumber: "",
        supervisorId: professors[0].id,
        supervisorName: professors[0].name,
        organSystem: null,
        clinicalFindings: "Generic sample summary for interface preview.",
        competency: catalog.competencyLevels[0]?.value ?? null,
        status: activityStatus(index, seed.id + 11),
      };
    });

    const postings = Array.from({ length: 3 }, (_, index) => {
      const posting = catalog.postings[index % Math.max(catalog.postings.length, 1)];
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index * 4, 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 0));
      const unit = posting?.name ?? (features.freeTextPostingUnit ? "Sample rotation" : "Sample posting");
      return {
        id: profile.id * 500000 + seed.id * 10 + index + 1,
        ward: unit,
        unit,
        postingValue: posting?.value,
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        supervisorId: professors[0].id,
        supervisorName: professors[0].name,
        status: "completed",
      };
    });

    const targets = [targetCases, targetProcedures, targetAcademics];
    const counts = [
      cases.filter((item) => item.status === "verified").length,
      procedures.filter((item) => item.status === "verified").length,
      academics.filter((item) => item.status === "verified").length,
    ];
    const configured = targets.map((target, index) => target === null ? null : target > 0 ? counts[index] / target : 0).filter((value): value is number => value !== null);
    const completion = configured.length ? Math.round(configured.reduce((sum, value) => sum + value, 0) / configured.length * 100) : null;
    const student: any = {
      id: seed.id,
      registrationNumber,
      fullName: name,
      name,
      email: "resident" + (residentIndex + 1) + ".demo@example.com",
      batch: String(seed.joinedYear),
      completion,
      overallCompletion: completion,
      status: "approved",
      shortfallStatus: completion === null ? "not_tracked" : completion >= 75 ? "on_track" : completion >= 40 ? "at_risk" : "behind",
      department: departmentName,
      departmentId: profile.id,
      mentorId: professors[0].id,
      verified: {
        cases: counts[0],
        procedures: counts[1],
        academics: counts[2],
        clinicalWork: clinicalWorks.filter((item) => item.status === "verified").length,
      },
      targets: { cases: targetCases, procedures: targetProcedures, academics: targetAcademics, clinicalWork: null },
    };
    const studentProfile = {
      id: seed.id,
      user: { fullName: name, name, email: student.email, role: "student" },
      enrollmentYear: seed.joinedYear,
      completionStatus: student.shortfallStatus,
      departmentId: profile.id,
      registrationNumber,
      dateOfJoining: String(seed.joinedYear) + "-07-01T00:00:00Z",
    };
    const conferenceDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const conferenceEnd = new Date(conferenceDate.getTime() + 24 * 60 * 60 * 1000);
    const leaveRecords = residentIndex === 0 ? [{
      id: profile.id * 10 + seed.id,
      number: 1,
      residentId: seed.id,
      residentName: name,
      appliedOn: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      leaveType: "academic",
      type: "academic",
      startDate: conferenceDate.toISOString().slice(0, 10),
      endDate: conferenceEnd.toISOString().slice(0, 10),
      fromDate: conferenceDate.toISOString().slice(0, 10),
      toDate: conferenceEnd.toISOString().slice(0, 10),
      totalDays: 2,
      reason: "Conference",
      approvedBy: "Pending",
      status: "pending",
    }] : [];

    cases.sort((a, b) => b.date.localeCompare(a.date));
    procedures.sort((a, b) => b.date.localeCompare(a.date));
    academics.sort((a, b) => b.date.localeCompare(a.date));
    clinicalWorks.sort((a, b) => b.date.localeCompare(a.date));

    return { student, studentProfile, postings, logs: { cases, procedures, academics, clinicalWorks }, leaveBalance: {}, leaveRecords };
  });

  profile.data.residents = residents;
  profile.data.students = residents.map(({ student }) => student);
  profile.data.studentProfile = residents[0].studentProfile;
  profile.data.postings = residents[0].postings;
  profile.data.logs = residents[0].logs;
  profile.data.leaveBalance = residents[0].leaveBalance;
  profile.data.leaveRecords = residents.flatMap(({ leaveRecords }) => leaveRecords);
  profile.data.hodAnalytics = createAnalytics(profile);
}

function createAnalytics(profile: DemoDepartmentProfile) {
  const residents = profile.data.residents;
  const allLogs = residents.flatMap(({ logs }) => [...logs.cases, ...logs.procedures, ...logs.academics, ...logs.clinicalWorks]);
  const procedureCounts = new Map<string, number>();
  residents.flatMap(({ logs }) => logs.procedures).forEach((item) => procedureCounts.set(item.procedureName, (procedureCounts.get(item.procedureName) ?? 0) + 1));
  const tracked = residents.map(({ student }) => student.completion).filter((value): value is number => value !== null);
  return {
    totalStudents: residents.length,
    avgCompletion: tracked.length ? Math.round(tracked.reduce((sum, value) => sum + value, 0) / tracked.length) : 0,
    logStats: {
      pending: allLogs.filter((item) => item.status === "pending").length,
      verified: allLogs.filter((item) => item.status === "verified").length,
      rejected: allLogs.filter((item) => item.status === "rejected").length,
    },
    topProcedures: [...procedureCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    students: residents.map(({ student }, index) => ({
      number: index + 1,
      name: student.fullName,
      department: student.department,
      registrationNumber: student.registrationNumber,
      dateOfJoining: String(residentSeeds[index].joinedYear) + "-07-01T00:00:00Z",
      status: "Active",
    })),
  };
}

function refreshDerivedData(profile: DemoDepartmentProfile) {
  const config = profile.data.departmentCatalog.config;
  for (const resident of profile.data.residents) {
    const student = resident.student;
    const counts = [
      resident.logs.cases.filter((item) => item.status === "verified").length,
      resident.logs.procedures.filter((item) => item.status === "verified").length,
      resident.logs.academics.filter((item) => item.status === "verified").length,
    ];
    const targets = [config.requiredCases, config.requiredProcedures, config.requiredAcademic];
    student.verified = {
      cases: counts[0], procedures: counts[1], academics: counts[2],
      clinicalWork: resident.logs.clinicalWorks.filter((item) => item.status === "verified").length,
    };
    const progress = targets.map((target, index) => target === null ? null : target > 0 ? counts[index] / target : 0)
      .filter((value): value is number => value !== null);
    student.completion = progress.length ? Math.round(progress.reduce((sum, value) => sum + value, 0) / progress.length * 100) : null;
    student.overallCompletion = student.completion;
    student.shortfallStatus = student.completion === null ? "not_tracked" : student.completion >= 75 ? "on_track" : student.completion >= 40 ? "at_risk" : "behind";
  }
  profile.data.students = profile.data.residents.map(({ student }) => student);
  profile.data.hodAnalytics = createAnalytics(profile);
}

demoDepartmentProfiles.forEach(buildYearOfActivity);

export const demoDepartmentOptions = [
  ...demoDepartmentProfiles.map(({ id, label }) => ({ id, label, disabled: false })),
  { id: null, label: "General Medicine — awaiting configuration", disabled: true },
];

export function getDemoDepartmentProfile(id: number | null | undefined): DemoDepartmentProfile {
  return demoDepartmentProfiles.find((profile) => profile.id === id) ?? pediatricsProfile;
}

export function getActiveDemoDepartmentId(): number {
  try {
    const user = JSON.parse(window.sessionStorage.getItem("elogbook-user") || "null");
    return user?.isDemoMode ? Number(user.departmentId) || 1 : 1;
  } catch {
    return 1;
  }
}

export function setActiveDemoDepartmentId(id: number): boolean {
  if (!demoDepartmentProfiles.some((profile) => profile.id === id)) return false;
  try {
    const user = JSON.parse(window.sessionStorage.getItem("elogbook-user") || "null");
    if (!user?.isDemoMode) return false;
    user.departmentId = id;
    user.departmentName = getDemoDepartmentProfile(id).data.departmentCatalog.department.name;
    if (user.role === "student") {
      const resident = getDemoDepartmentProfile(id).data.residents[0];
      if (resident) {
        user.name = resident.student.fullName;
        user.fullName = resident.student.fullName;
        user.email = resident.student.email;
        user.studentProfileId = resident.student.id;
      }
    }
    window.sessionStorage.setItem("elogbook-user", JSON.stringify(user));
    window.dispatchEvent(new CustomEvent(DEMO_DEPARTMENT_CHANGED_EVENT, { detail: id }));
    return true;
  } catch {
    return false;
  }
}

export function setDemoDepartmentFeature(key: string, value: boolean): boolean {
  try {
    const user = JSON.parse(window.sessionStorage.getItem("elogbook-user") || "null");
    if (!user?.isDemoMode) return false;
    const profile = getDemoDepartmentProfile(getActiveDemoDepartmentId());
    profile.data.departmentCatalog.config.enabledFeatures = {
      ...profile.data.departmentCatalog.config.enabledFeatures,
      [key]: value,
    };
    return true;
  } catch {
    return false;
  }
}

export function resetDemoDepartmentFeatures(): boolean {
  const profile = getDemoDepartmentProfile(getActiveDemoDepartmentId());
  const defaults = defaultFeatureFlags.get(profile.id);
  if (!defaults) return false;
  try {
    const user = JSON.parse(window.sessionStorage.getItem("elogbook-user") || "null");
    if (!user?.isDemoMode) return false;
    profile.data.departmentCatalog.config.enabledFeatures = { ...defaults };
    return true;
  } catch {
    return false;
  }
}

function getActiveDemoProfile() {
  return getDemoDepartmentProfile(getActiveDemoDepartmentId()).data;
}

export function getDemoResident(studentId?: number | string): DemoResident {
  const residents = getActiveDemoProfile().residents;
  const requestedId = Number(studentId);
  return residents.find(({ student }) => student.id === requestedId) ?? residents[0];
}

export const demoData = {
  get departmentCatalog() { return getActiveDemoProfile().departmentCatalog; },
  get students() { const profile = getDemoDepartmentProfile(getActiveDemoDepartmentId()); refreshDerivedData(profile); return profile.data.students; },
  get studentProfile() { return getActiveDemoProfile().studentProfile; },
  get postings() { return getActiveDemoProfile().postings; },
  get logs() { return getActiveDemoProfile().logs; },
  get professors() { return getActiveDemoProfile().professors; },
  get hodAnalytics() { const profile = getDemoDepartmentProfile(getActiveDemoDepartmentId()); refreshDerivedData(profile); return profile.data.hodAnalytics; },
  get leaveBalance() { return getActiveDemoProfile().leaveBalance; },
  get leaveRecords() { return getActiveDemoProfile().leaveRecords; },
  get assessments() { return getActiveDemoProfile().assessments; },
  get thesis() { return getActiveDemoProfile().thesis; },
  set thesis(value: any) { getActiveDemoProfile().thesis = value; },
  get certifications() { return getActiveDemoProfile().certifications; },
};
