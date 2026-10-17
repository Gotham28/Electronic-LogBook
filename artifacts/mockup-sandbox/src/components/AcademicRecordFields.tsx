import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { academicFieldVisible, type AcademicLogbookSection } from "@/lib/academic-logbook";

export function AcademicRecordFields({ section, values, onChange, disabled }: {
  section: AcademicLogbookSection;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const prefix = React.useId();
  let group = "";
  return <div className="space-y-4">
    {section.fields.filter((field) => academicFieldVisible(field, values)).map((field) => {
      const showGroup = !!field.group && field.group !== group;
      if (field.group) group = field.group;
      const id = `${prefix}-${field.key}`;
      const change = (value: string) => onChange({ ...values, [field.key]: value });
      return <div key={field.key} className="space-y-2">
        {showGroup && <h3 className="border-t border-slate-200 pt-4 text-sm font-semibold text-slate-900">{field.group}</h3>}
        <Label htmlFor={id}>{field.label}{(field.required || field.requiredWhen) ? " *" : " (optional)"}</Label>
        {field.type === "select" ? (
          <Select value={values[field.key] || ""} onValueChange={change} disabled={disabled}>
            <SelectTrigger id={id}><SelectValue placeholder="Select an option" /></SelectTrigger>
            <SelectContent>{field.options?.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
        ) : field.type === "textarea" ? (
          <Textarea id={id} value={values[field.key] || ""} onChange={(event) => change(event.target.value)}
            maxLength={field.maxLength ?? 2000} disabled={disabled} />
        ) : (
          <Input id={id} type={field.type} value={values[field.key] || ""} onChange={(event) => change(event.target.value)}
            min={field.min} max={field.max} step={field.type === "number" ? "any" : undefined}
            maxLength={field.maxLength ?? 2000} disabled={disabled} />
        )}
      </div>;
    })}
  </div>;
}
