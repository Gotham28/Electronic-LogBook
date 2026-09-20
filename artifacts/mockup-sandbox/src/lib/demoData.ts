export const demoData = {
  departmentCatalog: {
    department: { id: 1, name: "General Pediatrics", code: "peds" },
    hod: { id: 3, name: "Dr. Priya Sharma", fullName: "Dr. Priya Sharma" },
    config: {
      requiredCases: 150,
      requiredProcedures: 80,
      requiredAcademic: 60,
    },
    procedures: [
      { id: 1, name: "Lumbar Puncture", group: "Emergency / Diagnostics", required: 15 },
      { id: 2, name: "Pediatric IV Cannulation", group: "Ward Procedures", required: 40 },
      { id: 3, name: "Nebulization Technique", group: "Ward Procedures", required: 20 },
      { id: 4, name: "Intraosseous Access", group: "Emergency / Diagnostics", required: 8 },
      { id: 5, name: "Umbilical Catheterization", group: "Neonatal Procedures", required: 10 },
      { id: 6, name: "Bag and Mask Ventilation", group: "Emergency / Diagnostics", required: 12 }
    ],
    academics: [
      { id: 1, name: "Journal Club", kind: "academic", required: 15 },
      { id: 2, name: "Case Presentation", kind: "academic", required: 20 }
    ],
    postings: [
      { id: 1, name: "General Pediatric Ward", value: "general-pediatric-ward", required: 0, period: "total" },
      { id: 2, name: "Neonatal Intensive Care Unit", value: "nicu", required: 0, period: "total" },
      { id: 3, name: "Pediatric Intensive Care Unit", value: "picu", required: 0, period: "total" },
      { id: 4, name: "Emergency Department", value: "emergency-department", required: 0, period: "total" }
    ]
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
      { id: 101, date: "2024-10-15", diagnosisProvisional: "Acute Bronchiolitis (14-month-old)", status: "verified" },
      { id: 102, date: "2024-10-18", diagnosisProvisional: "Febrile Seizure Workup (2-year-old)", status: "pending" },
      { id: 103, date: "2024-10-22", diagnosisProvisional: "Neonatal Jaundice Follow-up", status: "verified" }
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
    { id: 2, fullName: "Dr. Vivek Menon", name: "Dr. Vivek Menon", email: "vivek.menon.demo@example.com", role: "professor", title: "Associate Professor" }
  ],
  hodAnalytics: {
    totalStudents: 12,
    logsVerified: 850,
    logsPending: 42,
    studentsAtRisk: 1
  },
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
      status: "approved"
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
      status: "pending"
    }
  ],
  assessments: [
    {
      id: 1,
      date: "2024-10-05",
      examName: "End of Unit Pediatrics Assessment",
      type: "internal",
      marks: 85,
      maximum: 100,
      grade: "B",
      assessorName: "Dr. Vivek Menon"
    }
  ]
};

export async function handleDemoRequest(method: string, path: string, body?: any) {
  await new Promise(r => setTimeout(r, 400)); // Mock network delay for realism

  if (method === "GET") {
    // In demo mode, /auth/me should just reflect back the already-stored demo session, 
    // since there's no real backend to verify against - this prevents App.tsx's 
    // session-refresh effect from overwriting a valid demo session with an empty fallback.
    if (path.match(/\/api\/auth\/me$/)) {
      const stored = window.sessionStorage.getItem("elogbook-user");
      return stored ? JSON.parse(stored) : null;
    }

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
    if (path.match(/\/api\/students\/\d+\/postings$/)) return { data: demoData.postings };
    if (path.match(/\/api\/students\/\d+\/thesis$/)) return { data: (demoData as any).thesis || null };
    if (path.match(/\/api\/students\/\d+\/certifications$/)) return (demoData as any).certifications || [];
    if (path.match(/\/api\/students\/\d+\/case-logs$/)) return demoData.logs.cases;
    if (path.match(/\/api\/students\/\d+\/procedure-logs$/)) return demoData.logs.procedures;
    if (path.match(/\/api\/students\/\d+\/academic-logs$/)) return demoData.logs.academics;
    if (path.match(/\/api\/students\/\d+\/leave-records$/)) return demoData.leaveRecords;
    if (path.match(/\/api\/students\/\d+\/leave-balance$/)) return demoData.leaveBalance;
    if (path.match(/\/api\/students\/\d+\/assessments$/)) return demoData.assessments;
    
    // Profile / Roster
    if (path.match(/\/api\/students\/\d+$/)) return demoData.studentProfile;
    if (path.includes("/admin/students/pending")) return [];
    if (path.includes("/admin/leaves/pending")) return [];
    
    return []; // Safe fallback
  }

  // Mutations (optimistic in-memory updates so UI feels responsive)
  if (method === "POST" || method === "PATCH") {
    if (path.includes("/case-logs") && body) {
      const newCaseLog = {
        id: Date.now(),
        number: demoData.logs.cases.length + 1,
        date: body.date,
        patientUhid: body.patientUhid,
        age: body.patientAge || "Unknown",
        gender: body.patientGender || "Unknown",
        chiefComplaints: body.chiefComplaints || "",
        history: body.history || "",
        examination: body.examination || "",
        investigations: body.investigations || "",
        diagnosisProvisional: body.diagnosisProvisional || "",
        diagnosisFinal: body.diagnosisFinal || "",
        diagnosis: body.diagnosisFinal || body.diagnosisProvisional || "",
        differentialDiagnosis: body.differentialDiagnosis || "",
        management: body.managementPlan || "",
        status: "pending"
      };
      demoData.logs.cases.unshift(newCaseLog as any);
      return { success: true, id: newCaseLog.id };
    }

    if (path.includes("/procedure-logs") && body) {
      const newProcedureLog = {
        id: Date.now(),
        number: demoData.logs.procedures.length + 1,
        date: body.date,
        group: body.procedureGroup,
        procedureGroup: body.procedureGroup,
        patientUhid: body.patientUhid,
        procedureName: body.procedureName,
        age: body.patientAge || "Unknown",
        experience: body.competencyLevel || "assisted",
        verifiedCompetency: "No",
        status: "pending"
      };
      demoData.logs.procedures.unshift(newProcedureLog as any);
      return { success: true, id: newProcedureLog.id };
    }

    if (path.includes("/academic-logs") && body) {
      const facultyObj = demoData.professors.find(p => p.id === Number(body.supervisorId));
      const newAcademicLog = {
        id: Date.now(),
        number: demoData.logs.academics.length + 1,
        date: body.date,
        type: body.activityType,
        activityType: body.activityType,
        presentationType: body.presentationType || "N/A",
        topic: body.topic,
        faculty: facultyObj ? facultyObj.name : "Dr. Vivek Menon",
        status: "pending"
      };
      demoData.logs.academics.unshift(newAcademicLog as any);
      return { success: true, id: newAcademicLog.id };
    }

    if (path.includes("/postings") && body) {
      const facultyObj = demoData.professors.find(p => p.id === Number(body.supervisorId));
      const newPosting = {
        id: Date.now(),
        ward: body.ward,
        unit: body.ward,
        startDate: body.startDate,
        endDate: body.endDate,
        supervisorId: body.supervisorId,
        supervisorName: facultyObj ? facultyObj.name : "Dr. Vivek Menon",
        status: "completed"
      };
      demoData.postings.unshift(newPosting as any);
      return { success: true, id: newPosting.id };
    }

    if (path.includes("/assessments") && body) {
      const newAssessment = {
        id: Date.now(),
        number: demoData.assessments.length + 1,
        examName: body.examName,
        type: body.type,
        date: body.date,
        marks: Number(body.marks),
        maximum: 100,
        assessorId: 2,
        assessorName: "Dr. Vivek Menon",
        grade: Number(body.marks) >= 85 ? "A" : Number(body.marks) >= 70 ? "B" : "C"
      };
      demoData.assessments.unshift(newAssessment as any);
      return { success: true, id: newAssessment.id };
    }
    
    if (path.includes("/leave-records") && body) {
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
      
      const newLeave = {
        id: Date.now(),
        number: demoData.leaveRecords.length + 1,
        appliedOn: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        leaveType: body.leaveType,
        startDate: body.startDate,
        endDate: body.endDate,
        fromDate: body.startDate,
        toDate: body.endDate,
        totalDays: totalDays,
        reason: body.reason,
        approvedBy: "Pending",
        status: "pending"
      };
      demoData.leaveRecords.unshift(newLeave as any);
      return { success: true, id: newLeave.id };
    }

    if (path.includes("/thesis") && body) {
      (demoData as any).thesis = {
        thesisTitle: body.thesisTitle || "",
        guideId: body.guideId || null,
        coGuideId: body.coGuideId || null,
        protocolSubmissionDate: body.protocolSubmissionDate || null,
        iecClearanceDate: body.iecClearanceDate || null,
        dataCollectionStartDate: body.dataCollectionStartDate || null,
        dataCollectionEndDate: body.dataCollectionEndDate || null,
        submissionDate: body.submissionDate || null,
      };
      return { success: true, data: (demoData as any).thesis };
    }

    if (path.includes("/certifications") && body) {
      if (!(demoData as any).certifications) (demoData as any).certifications = [];
      const newCert = {
        id: Date.now(),
        title: body.title,
        provider: body.provider,
        issueDate: body.issueDate,
        expiryDate: body.expiryDate,
        certificateUrl: body.certificateUrl,
      };
      (demoData as any).certifications.unshift(newCert);
      return { success: true, id: newCert.id };
    }

    return { success: true, id: Date.now() };
  }

  return { success: true };
}
