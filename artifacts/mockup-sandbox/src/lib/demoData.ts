import { demoData, getDemoResident } from './demoDepartments';
import { playDemoSound } from './demoSounds';

function requestedStudentId(path: string): number | undefined {
  const match = path.match(/\/api\/students\/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function countsByStatus(items: any[]) {
  return {
    verified: items.filter((item) => item.status === "verified").length,
    pending: items.filter((item) => item.status === "pending").length,
  };
}

function buildProgress(studentId?: number) {
  const resident = getDemoResident(studentId);
  const catalog = demoData.departmentCatalog;
  const cases = resident.logs.cases;
  const procedures = resident.logs.procedures;
  const academics = resident.logs.academics;
  const clinicalWorks = resident.logs.clinicalWorks;
  const caseValues = catalog.caseCategories.length
    ? catalog.caseCategories.map((category) => ({ value: category.value, ...countsByStatus(cases.filter((item) => item.category === category.value)) }))
    : [{ value: null, ...countsByStatus(cases) }];
  const procedureNames = new Map<string, { group: string; name: string; items: any[] }>();
  procedures.forEach((item) => {
    const key = String(item.group) + "::" + String(item.procedureName);
    const value: { group: string; name: string; items: any[] } = procedureNames.get(key) ?? { group: item.group, name: item.procedureName, items: [] };
    value.items.push(item);
    procedureNames.set(key, value);
  });
  const academicNames = new Map<string, any[]>();
  academics.forEach((item) => academicNames.set(item.activityType, [...(academicNames.get(item.activityType) ?? []), item]));
  const clinicalNames = new Map<string, any[]>();
  clinicalWorks.forEach((item) => clinicalNames.set(item.category, [...(clinicalNames.get(item.category) ?? []), item]));
  return {
    caseCategories: caseValues,
    procedures: [...procedureNames.values()].map(({ group, name, items }) => ({
      group,
      name,
      ...countsByStatus(items),
      byCompetency: [{ level: String(items[0]?.experience ?? "assisted"), ...countsByStatus(items) }],
    })),
    academics: [...academicNames.entries()].map(([value, items]) => ({ value, ...countsByStatus(items) })),
    clinicalWorks: [...clinicalNames.entries()].map(([value, items]) => ({ value, ...countsByStatus(items) })),
  };
}

function buildReviewQueue() {
  const user = JSON.parse(window.sessionStorage.getItem("elogbook-user") || "null");
  const pendingReviews = demoData.students.flatMap((student: any) => {
    const resident = getDemoResident(student.id);
    const common = { studentId: student.id, studentName: student.fullName, registrationNumber: student.registrationNumber, department: student.department };
    return [
      ...resident.logs.cases.filter((item) => item.status === "pending").map((item) => ({
        ...common, id: "case-" + item.id, dbId: item.id, logType: "case", type: "Case Log",
        title: item.diagnosisProvisional, date: item.date, patientInfo: "Sample record",
        detail: item.chiefComplaints, diagnosis: item.diagnosisProvisional, status: item.status,
      })),
      ...resident.logs.procedures.filter((item) => item.status === "pending").map((item) => ({
        ...common, id: "procedure-" + item.id, dbId: item.id, logType: "procedure", type: "Procedure",
        title: item.procedureName, date: item.date, patientInfo: "Sample record", detail: item.procedureGroup, status: item.status,
      })),
      ...resident.logs.academics.filter((item) => item.status === "pending").map((item) => ({
        ...common, id: "academic-" + item.id, dbId: item.id, logType: "academic", type: "Academic",
        title: item.activityType + ": " + item.topic, date: item.date, detail: item.presentationType, status: item.status,
      })),
      ...resident.logs.clinicalWorks.filter((item) => item.status === "pending").map((item) => ({
        ...common, id: "clinical_work-" + item.id, dbId: item.id, logType: "clinical_work", type: "Clinical Work",
        title: item.categoryName, date: item.date, patientInfo: "Sample record", detail: item.clinicalFindings, status: item.status,
      })),
    ];
  });
  const assignedMentees = demoData.students.map((student: any) => {
    const logs = getDemoResident(student.id).logs;
    return {
      id: student.id,
      name: student.fullName,
      registrationNumber: student.registrationNumber,
      department: student.department,
      overallCompletion: student.overallCompletion,
      shortfallStatus: student.shortfallStatus,
      logCounts: {
        cases: logs.cases.filter((item) => item.status === "verified").length,
        procs: logs.procedures.filter((item) => item.status === "verified").length,
        acad: logs.academics.filter((item) => item.status === "verified").length,
        clinical: logs.clinicalWorks.filter((item) => item.status === "verified").length,
      },
    };
  });
  return {
    faculty: { name: demoData.professors[0]?.name, role: user?.role === "hod" ? "hod" : "professor" },
    pendingReviews,
    assignedMentees,
  };
}

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
      return buildReviewQueue();
    }
    
    // Student Sub-endpoints
    if (path.match(/\/api\/students\/\d+\/logs$/)) {
      const resident = getDemoResident(requestedStudentId(path));
      return {
        caseLogs: resident.logs.cases,
        procedureLogs: resident.logs.procedures,
        academicLogs: resident.logs.academics,
        clinicalWorkLogs: resident.logs.clinicalWorks,
        profile: {
          department: demoData.departmentCatalog.department.name,
          joiningYear: resident.studentProfile.enrollmentYear ? String(resident.studentProfile.enrollmentYear) : "",
          registrationNumber: resident.studentProfile.registrationNumber || "",
          dateOfJoining: resident.studentProfile.dateOfJoining || ""
        }
      };
    }
    if (path.match(/\/api\/students\/\d+\/progress$/)) return buildProgress(requestedStudentId(path));
    if (path.match(/\/api\/students\/\d+\/postings$/)) return { data: getDemoResident(requestedStudentId(path)).postings };
    if (path.match(/\/api\/students\/\d+\/thesis$/)) return { data: (demoData as any).thesis || null };
    if (path.match(/\/api\/students\/\d+\/certifications$/)) return (demoData as any).certifications || [];
    if (path.match(/\/api\/students\/\d+\/case-logs$/)) return getDemoResident(requestedStudentId(path)).logs.cases;
    if (path.match(/\/api\/students\/\d+\/procedure-logs$/)) return getDemoResident(requestedStudentId(path)).logs.procedures;
    if (path.match(/\/api\/students\/\d+\/academic-logs$/)) return getDemoResident(requestedStudentId(path)).logs.academics;
    if (path.match(/\/api\/students\/\d+\/clinical-works$/)) return getDemoResident(requestedStudentId(path)).logs.clinicalWorks;
    if (path.match(/\/api\/students\/\d+\/leave-records$/)) return getDemoResident(requestedStudentId(path)).leaveRecords;
    if (path.match(/\/api\/students\/\d+\/leave-balance$/)) return demoData.leaveBalance;
    if (path.match(/\/api\/students\/\d+\/assessments$/)) return demoData.assessments;
    
    // Profile / Roster
    if (path.match(/\/api\/students\/\d+$/)) return getDemoResident(requestedStudentId(path)).studentProfile;
    if (path.includes("/admin/students/pending")) return [];
    if (path.includes("/admin/leaves/pending")) return demoData.leaveRecords.filter((leave: any) => leave.status === "pending").map((leave: any) => ({
      id: String(leave.id), number: String(leave.number), residentName: leave.residentName,
      type: leave.type, fromDate: leave.fromDate, toDate: leave.toDate,
      reason: leave.reason, status: leave.status, totalDays: leave.totalDays,
    }));
    
    return []; // Safe fallback
  }

  // Mutations (optimistic in-memory updates so UI feels responsive)
  if (method === "POST" || method === "PATCH") {
    const reviewMatch = path.match(/\/api\/logs\/(case|procedure|academic|clinical_work|clinical-work)\/(\d+)\/review$/);
    if (method === "PATCH" && reviewMatch && body) {
      const logKey = reviewMatch[1] === "case" ? "cases"
        : reviewMatch[1] === "procedure" ? "procedures"
        : reviewMatch[1] === "academic" ? "academics" : "clinicalWorks";
      const dbId = Number(reviewMatch[2]);
      const item = demoData.students
        .map((student: any) => getDemoResident(student.id).logs[logKey].find((entry: any) => entry.id === dbId))
        .find(Boolean);
      if (item) {
        item.status = body.status === "rejected" ? "rejected" : "verified";
        item.reviewComments = body.comments || "";
        if (item.status === "verified") playDemoSound("success");
      }
      return { success: true, id: dbId };
    }

    if (path.includes("/clinical-works") && body) {
      const resident = getDemoResident(requestedStudentId(path));
      const newClinicalWork = {
        id: Date.now(),
        number: resident.logs.clinicalWorks.length + 1,
        date: body.date,
        category: body.category,
        subType: body.subType || null,
        patientAge: body.patientAge || "",
        patientSex: body.patientSex || "",
        caseNumber: body.caseNumber || "",
        supervisorId: Number(body.supervisorId),
        supervisorName: demoData.professors.find((professor) => professor.id === Number(body.supervisorId))?.name || "Dr. Vivek Menon",
        organSystem: body.organSystem || null,
        clinicalFindings: body.clinicalFindings || null,
        competency: body.competency || null,
        status: "pending",
      };
      resident.logs.clinicalWorks.unshift(newClinicalWork);
      playDemoSound("success");
      return { success: true, id: newClinicalWork.id };
    }

    if (path.includes("/case-logs") && body) {
      const resident = getDemoResident(requestedStudentId(path));
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
      resident.logs.cases.unshift(newCaseLog as any);
      playDemoSound("success");
      return { success: true, id: newCaseLog.id };
    }

    if (path.includes("/procedure-logs") && body) {
      const resident = getDemoResident(requestedStudentId(path));
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
      resident.logs.procedures.unshift(newProcedureLog as any);
      playDemoSound("success");
      return { success: true, id: newProcedureLog.id };
    }

    if (path.includes("/academic-logs") && body) {
      const resident = getDemoResident(requestedStudentId(path));
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
      resident.logs.academics.unshift(newAcademicLog as any);
      playDemoSound("success");
      return { success: true, id: newAcademicLog.id };
    }

    if (path.includes("/postings") && body) {
      const resident = getDemoResident(requestedStudentId(path));
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
      resident.postings.unshift(newPosting as any);
      playDemoSound("success");
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
      const resident = getDemoResident(requestedStudentId(path));
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
      resident.leaveRecords.unshift(newLeave as any);
      playDemoSound("success");
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

