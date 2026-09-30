import * as React from "react";
import { RotateCcw, Eye, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { getActiveDemoDepartmentId, getDemoDepartmentProfile, resetDemoDepartmentFeatures, setDemoDepartmentFeature } from "@/lib/demoDepartments";
import { useDepartment } from "@/lib/department-context";

const featureOptions = [
  { key: "hideCaseLogs", label: "Hide case logs" },
  { key: "hideProcedureLogs", label: "Hide procedure logs" },
  { key: "clinicalWorks", label: "Clinical work logs" },
  { key: "procedureExperience", label: "Procedure experience tracking" },
  { key: "freeTextProcedures", label: "Free-text procedures" },
  { key: "freeTextPostingUnit", label: "Free-text postings" },
  { key: "academicsFirstInNav", label: "Prioritize academics in navigation" },
  { key: "useCaseTypeLabel", label: "Use case type labels" },
  { key: "useThesisAndPublicationsLabel", label: "Use research and publications labels" },
  { key: "awards", label: "Awards and achievements" },
  { key: "hideConferenceLocation", label: "Hide conference location" },
  { key: "conferenceLevels", label: "Conference levels" },
  { key: "academicActivityExtras", label: "Academic activity details" },
  { key: "attendedConferences", label: "Conference and CME logs" },
  { key: "splitThesisAndCertifications", label: "Separate thesis and certifications" },
] as const;

type FeatureKey = (typeof featureOptions)[number]["key"];

function ResidentPreview({ features }: { features: Record<string, boolean> }) {
  const logItems = [
    ...(!features.hideCaseLogs ? ["Cases"] : []),
    ...(!features.hideProcedureLogs ? ["Procedures"] : []),
    ...(features.clinicalWorks ? ["Clinical work"] : []),
  ];
  const academics = ["Academics"];
  const navigation = [
    "Home",
    ...(features.academicsFirstInNav ? [...academics, ...logItems] : [...logItems, ...academics]),
    ...(features.attendedConferences ? ["Conferences and CME"] : []),
    ...(features.splitThesisAndCertifications
      ? [features.useThesisAndPublicationsLabel ? "Thesis and Publications" : "Thesis", "Certifications"]
      : ["Thesis and Certifications"]),
    "Assessments",
    "Postings",
    ...(features.awards ? ["Awards"] : []),
    "Leave records",
  ];
  const details = [
    ["Case form", features.useCaseTypeLabel ? "Case type" : "Case category"],
    ["Procedure entry", features.freeTextProcedures ? "Free text" : "Catalog"],
    ["Posting entry", features.freeTextPostingUnit ? "Free text" : "Catalog"],
    ["Procedure experience", features.procedureExperience ? "Competency tracking shown" : "Competency tracking hidden"],
    ["Research label", features.useThesisAndPublicationsLabel ? "Thesis and publications" : "Thesis"],
    ["Conference location", features.hideConferenceLocation ? "Hidden" : "Shown"],
    ["Conference levels", features.conferenceLevels ? "Shown" : "Hidden"],
    ["Academic details", features.academicActivityExtras ? "Additional fields shown" : "Additional fields hidden"],
    ["Conference records", features.attendedConferences ? "Enabled" : "Hidden"],
    ["Thesis and certifications", features.splitThesisAndCertifications ? "Separate pages" : "Combined page"],
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Resident workspace</p>
        <h3 className="mt-1 text-xl font-semibold text-slate-950">Navigation and forms</h3>
        <p className="mt-1 text-sm text-slate-600">This preview reflects the active demo profile as you change its features.</p>
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Navigation</p>
        <div className="flex flex-wrap gap-2">
          {navigation.map((item) => (
            <span key={item} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">{item}</span>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DemoDepartmentCustomizer() {
  const departmentData = useDepartment();
  const isMobile = useIsMobile();
  const [features, setFeatures] = React.useState<Record<string, boolean>>({ ...departmentData.config?.enabledFeatures });
  const [mobileTab, setMobileTab] = React.useState("options");

  React.useEffect(() => {
    setFeatures({ ...departmentData.config?.enabledFeatures });
  }, [departmentData.department.id, departmentData.config?.enabledFeatures]);

  const updateFeature = (key: FeatureKey, checked: boolean) => {
    const next = { ...features, [key]: checked };
    setFeatures(next);
    if (setDemoDepartmentFeature(key, checked)) void departmentData.refresh();
  };

  const reset = () => {
    if (!resetDemoDepartmentFeatures()) return;
    const defaults = getDemoDepartmentProfile(getActiveDemoDepartmentId()).data.departmentCatalog.config.enabledFeatures;
    setFeatures({ ...defaults });
    void departmentData.refresh();
  };

  const optionsPanel = (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <CardTitle className="flex items-center gap-2 text-base"><SlidersHorizontal className="h-4 w-4 text-teal-700" /> Department features</CardTitle>
        <p className="text-sm text-slate-600">Switches update this demo profile in memory.</p>
      </CardHeader>
      <CardContent className="divide-y divide-slate-100 p-0">
        {featureOptions.map(({ key, label }) => (
          <label key={key} className="flex min-h-14 items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <span className="text-sm font-medium text-slate-800">{label}</span>
            <Switch checked={Boolean(features[key])} onCheckedChange={(checked) => updateFeature(key, checked)} aria-label={label} />
          </label>
        ))}
        <div className="flex justify-end p-4">
          <Button type="button" variant="outline" size="sm" onClick={reset} className="gap-2"><RotateCcw className="h-4 w-4" /> Reset profile defaults</Button>
        </div>
      </CardContent>
    </Card>
  );

  const previewPanel = (
    <Card className="border-teal-200 bg-teal-50/40 shadow-sm">
      <CardHeader className="border-b border-teal-100 pb-4">
        <CardTitle className="flex items-center gap-2 text-base"><Eye className="h-4 w-4 text-teal-700" /> Resident preview</CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-5"><ResidentPreview features={features} /></CardContent>
    </Card>
  );

  return (
    <section aria-labelledby="demo-customize-heading" className="mb-6 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Demo only</p>
        <h2 id="demo-customize-heading" className="mt-1 text-xl font-semibold text-slate-950">Customise department</h2>
        <p className="mt-1 text-sm text-slate-600">Explore how department settings shape a resident workspace. Reset restores this department profile’s starting values.</p>
      </div>
      {isMobile ? (
        <Tabs value={mobileTab} onValueChange={setMobileTab}>
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="options">Features</TabsTrigger>
            <TabsTrigger value="preview">Resident preview</TabsTrigger>
          </TabsList>
          <TabsContent value="options" className="mt-3">{optionsPanel}</TabsContent>
          <TabsContent value="preview" className="mt-3">{previewPanel}</TabsContent>
        </Tabs>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          {optionsPanel}
          {previewPanel}
        </div>
      )}
    </section>
  );
}
