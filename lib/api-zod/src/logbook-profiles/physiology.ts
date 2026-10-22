import type { AcademicLogbookField, AcademicLogbookProfile, AcademicLogbookSection } from "../academic-logbook.js";

const allYears = [1, 2, 3];
const participation = ["Attended", "Presented"];
const marks: AcademicLogbookField[] = [
  { key: "marks", label: "Marks obtained", type: "number", required: true, min: 0, maximumField: "maximumMarks" },
  { key: "maximumMarks", label: "Maximum marks", type: "number", min: 0.01 },
];
const endDate: AcademicLogbookField = { key: "endDate", label: "End date", type: "date", required: true, notBeforeLogDate: true };
const department: AcademicLogbookField = { key: "department", label: "Department", type: "text", required: true, maxLength: 160 };

// Wording and appraisal elements come from the supplied MD Physiology logbook.
// No numerical training targets were specified by that document.
const appraisalElements = [
  ["1.1", "Has knowledge appropriate for level of training", "Scholastic aptitude and learning"],
  ["1.2", "Participation and contribution to learning activity (eg. Journal club, seminars, CME etc)", "Scholastic aptitude and learning"],
  ["1.3", "Conduct of research and other scholarly activity assigned (eg. Posters, publications etc)", "Scholastic aptitude and learning"],
  ["1.4", "Documentation of acquisitions of competence (eg. Log book)", "Scholastic aptitude and learning"],
  ["1.5", "Performance in work based assessments", "Scholastic aptitude and learning"],
  ["1.6", "Self-directed learning", "Scholastic aptitude and learning"],
  ["2.1", "Practical skills that are appropriate for the level of training", "Work related to training"],
  ["2.2", "Respect for processes and procedures in the work space", "Work related to training"],
  ["2.3", "Ability to work with other members of the team", "Work related to training"],
  ["2.4", "Participation and compliance with the quality improvement process at the work environment", "Work related to training"],
  ["2.5", "Ability to record and document work accurately and appropriate for level of training", "Work related to training"],
  ["3.1", "Responsibility and accountability", "Professional attributes"],
  ["3.2", "Contribution to growth of learning of the team", "Professional attributes"],
  ["3.3", "Conduct that is ethically appropriate and respectful at all times", "Professional attributes"],
];

function section(value: string, years = allYears, options: Partial<AcademicLogbookSection> = {}): AcademicLogbookSection {
  return { value, years, topicLabel: "Topic / title", fields: [], ...options };
}

export const physiologyLogbook: AcademicLogbookProfile = {
  id: "physiology",
  title: "Physiology logbook",
  departmentNames: ["Physiology"],
  departmentCodes: ["PSI", "PHYS", "PHYSIO", "PHY", "PHYSIOLOGY"],
  navigationCategories: [
    { id: "teaching-learning", title: "Teaching & Learning", icon: "teaching", sectionValues: [
      "Lectures attended in the department", "Lectures attended in allied departments",
      "Lectures attended in Biostatistics and Research Methodology", "PG teaching programs attended",
      "UG teaching programs conducted", "UG practical classes conducted", "Microteaching",
      "Seminars", "Journal club", "Symposium",
    ] },
    { id: "practicals-postings", title: "Practicals & Postings", icon: "practicals", sectionValues: [
      "Practical procedures / classes in the department", "District Residency Programme", "Postings in allied departments",
    ], relatedPages: [{ title: "Postings & Rotations", href: "/postings" }] },
    { id: "research-events", title: "Research & Events", icon: "research", sectionValues: [
      "Topic selection for thesis", "Papers presented / published", "Conferences, workshops and webinars",
    ], relatedPages: [{ title: "Thesis", href: "/thesis" }, { title: "Conference records", href: "/conferences" }] },
    { id: "assessments-appraisal", title: "Assessments & Appraisal", icon: "assessments", sectionValues: [
      "Formative assessment", "Test paper marks", "Internal assessment", "Student appraisal form for MD in Physiology",
    ], relatedPages: [{ title: "Assessment records & feedback", href: "/assessments" }] },
    { id: "daily-attendance", title: "Daily Record & Attendance", icon: "daily", sectionValues: [
      "Daily activity record", "Attendance",
    ] },
  ],
  sections: [
    section("Lectures attended in the department"),
    section("Practical procedures / classes in the department", allYears, { topicLabel: "Practical procedure / class", participation: ["Attended", "Performed"] }),
    section("Daily activity record", allYears, { topicLabel: "Activities", multilineTopic: true }),
    section("Lectures attended in allied departments", [1, 2], { fields: [department] }),
    section("Lectures attended in Biostatistics and Research Methodology"),
    section("Seminars", allYears, { participation }),
    section("Microteaching", allYears, { participation }),
    section("Journal club", allYears, { participation }),
    section("UG teaching programs conducted"),
    section("UG practical classes conducted"),
    section("PG teaching programs attended"),
    section("Topic selection for thesis", [1], { topicLabel: "Thesis topic" }),
    section("Symposium"),
    section("Conferences, workshops and webinars", allYears, { topicLabel: "Event / presentation title", participation,
      fields: [{ key: "eventType", label: "Event type", type: "select", options: ["Conference", "Workshop", "Webinar"], required: true },
        { key: "venue", label: "Venue / organiser", type: "text", maxLength: 160 }] }),
    section("Formative assessment", [1, 2], { fields: marks }),
    section("District Residency Programme", [2], { topicLabel: "Posting / activities", multilineTopic: true,
      fields: [{ key: "institution", label: "Institution / location", type: "text", required: true, maxLength: 160 }, endDate] }),
    section("Postings in allied departments", [3], { topicLabel: "Topics / activities", multilineTopic: true, fields: [department, endDate] }),
    section("Papers presented / published", [3], { topicLabel: "Paper title", fields: [
      { key: "paperStatus", label: "Paper status", type: "select", options: ["Presented", "Published"], required: true },
      { key: "publication", label: "Journal / event / publication reference", type: "text", maxLength: 500 },
    ] }),
    section("Test paper marks", [3], { fields: marks }),
    section("Internal assessment", [3], { fields: marks }),
    section("Attendance", [3], { topicLabel: "Attendance record", fields: [
      { key: "attendanceYear", label: "Attendance year", type: "select", options: ["First year", "Second year", "Third year"], required: true },
      endDate,
      { key: "percentage", label: "Attendance (%)", type: "number", min: 0, max: 100, required: true },
    ] }),
    section("Student appraisal form for MD in Physiology", [3], { topicLabel: "Appraisal period / title", fields: [
      ...appraisalElements.flatMap(([key, label, group]): AcademicLogbookField[] => [
        { key: `rating_${key}`, label: `${key} ${label} — rating (1–9)`, group, type: "select", options: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], required: true },
        { key: `comment_${key}`, label: `${key} Comments`, type: "textarea", maxLength: 200 },
      ]),
      { key: "additionalComments", label: "Additional comments", type: "textarea", maxLength: 1000 },
      { key: "disposition", label: "Disposition", type: "textarea", maxLength: 1000 },
      { key: "discussed", label: "Has this assessment pattern been discussed with the trainee?", type: "select", options: ["Yes", "No"], required: true },
      { key: "discussionExplanation", label: "If not, explain", type: "textarea", maxLength: 1000, requiredWhen: { field: "discussed", value: "No" } },
    ] }),
  ],
};
