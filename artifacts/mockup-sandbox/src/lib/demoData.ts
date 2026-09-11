export const demoData = {
  departmentCatalog: {
    department: { id: 1, name: "General Pediatrics", code: "peds" },
    hod: { id: 3, name: "Dr. Priya Sharma", fullName: "Dr. Priya Sharma" },
    config: {
      programDurationMonths: 36,
      requiredCases: 150,
      requiredProcedures: 80,
      requiredAcademic: 60,
      casualLeaveAllowance: 20,
      academicLeaveAllowance: 14,
    },
    procedures: [
      { id: 1, name: "Lumbar Puncture", group: "Emergency / Diagnostics", required: 15 },
      { id: 2, name: "Pediatric IV Cannulation", group: "Ward Procedures", required: 40 },
      { id: 3, name: "Nebulization Technique", group: "Ward Procedures", required: 20 }
    ],
    academics: [
      { id: 1, name: "Journal Club", kind: "academic", required: 15 },
      { id: 2, name: "Case Presentation", kind: "academic", required: 20 }
    ],
    postings: []
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
      targets: { cases: 150, procedures: 80, academics: 60 }
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
      targets: { cases: 150, procedures: 80, academics: 60 }
    }
  ],
  studentProfile: {
    id: 1,
    user: { fullName: "Kavya Nair", name: "Kavya Nair", email: "kavya.nair.demo@example.com", role: "student" },
    enrollmentYear: 2024,
    completionStatus: "on_track",
    departmentId: 1
  },
  postings: [
    { id: 10, unit: "NICU", startDate: "2024-07-01", endDate: "2024-09-30", status: "completed" }
  ],
  logs: {
    cases: [
      { id: 101, date: "2024-10-15", patientUhid: "UHID-PED-102", diagnosisProvisional: "Acute Bronchiolitis (14-month-old)", status: "verified" },
      { id: 102, date: "2024-10-18", patientUhid: "UHID-PED-144", diagnosisProvisional: "Febrile Seizure Workup (2-year-old)", status: "pending" },
      { id: 103, date: "2024-10-22", patientUhid: "UHID-PED-189", diagnosisProvisional: "Neonatal Jaundice Follow-up", status: "verified" }
    ],
    procedures: [
      { id: 201, date: "2024-10-12", procedureName: "Lumbar Puncture", group: "Emergency / Diagnostics", status: "verified", remarks: "Good aseptic technique." },
      { id: 202, date: "2024-10-16", procedureName: "Pediatric IV Cannulation", group: "Ward Procedures", status: "verified" },
      { id: 203, date: "2024-10-19", procedureName: "Nebulization Technique", group: "Ward Procedures", status: "pending" }
    ],
    academics: [
      { id: 301, date: "2024-10-05", activityType: "Journal Club", topic: "RSV prophylaxis in high-risk infants", status: "verified" },
      { id: 302, date: "2024-10-14", activityType: "Case Presentation", topic: "Kawasaki Disease", status: "pending" }
    ]
  },
  professors: [
    { id: 2, fullName: "Dr. Arjun Mehta", name: "Dr. Arjun Mehta", email: "arjun.mehta.demo@example.com", role: "professor", title: "Associate Professor" }
  ],
  hodAnalytics: {
    totalStudents: 12,
    logsVerified: 850,
    logsPending: 42,
    studentsAtRisk: 1
  }
};

export async function handleDemoRequest(method: string, path: string, body?: any) {
  await new Promise(r => setTimeout(r, 400)); // Mock network delay for realism

  if (method === "GET") {
    // Configs & Meta
    if (path.includes("/config") || path.includes("/catalog") || path.includes("/procedures")) return demoData.departmentCatalog;
    if (path.includes("/departments/") && path.includes("/professors")) return demoData.professors;
    if (path.includes("/analytics")) return demoData.hodAnalytics;
    if (path.includes("/roster")) return { students: demoData.students, professors: demoData.professors };
    
    // Professor Review Queue
    if (path.match(/\/api\/professors\/\d+\/review-queue/)) {
      return {
        faculty: demoData.professors[0],
        pendingReviews: [],
        assignedMentees: demoData.students
      };
    }
    
    // Student Sub-endpoints
    if (path.match(/\/api\/students\/\d+\/logs$/)) {
      return {
        caseLogs: demoData.logs.cases,
        procedureLogs: demoData.logs.procedures,
        academicLogs: demoData.logs.academics,
        profile: {
          department: "General Pediatrics",
          joiningYear: "2024",
          registrationNumber: "REG-PED-2024",
          dateOfJoining: "2024-07-01T00:00:00Z"
        }
      };
    }
    if (path.match(/\/api\/students\/\d+\/postings$/)) return demoData.postings;
    if (path.match(/\/api\/students\/\d+\/thesis$/)) return { data: null };
    if (path.match(/\/api\/students\/\d+\/certifications$/)) return [];
    if (path.match(/\/api\/students\/\d+\/case-logs$/)) return demoData.logs.cases;
    if (path.match(/\/api\/students\/\d+\/procedure-logs$/)) return demoData.logs.procedures;
    if (path.match(/\/api\/students\/\d+\/academic-logs$/)) return demoData.logs.academics;
    
    // Profile / Roster
    if (path.match(/\/api\/students\/\d+$/)) return demoData.studentProfile;
    if (path.includes("/admin/students/pending")) return [];
    if (path.includes("/admin/leaves/pending")) return [];
    
    return []; // Safe fallback
  }

  // Mutations (optimistic in-memory updates so UI feels responsive)
  if (method === "POST" || method === "PATCH") {
    if (path.includes("/case-logs") && body) demoData.logs.cases.unshift({ id: Math.random(), ...body, status: "pending" } as any);
    if (path.includes("/procedure-logs") && body) demoData.logs.procedures.unshift({ id: Math.random(), ...body, status: "pending" } as any);
    if (path.includes("/academic-logs") && body) demoData.logs.academics.unshift({ id: Math.random(), ...body, status: "pending" } as any);
    return { success: true, id: Math.random() };
  }

  return { success: true };
}
