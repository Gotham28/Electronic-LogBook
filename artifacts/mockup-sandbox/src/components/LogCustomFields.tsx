import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { logCustomFieldVisible, type LogCustomFieldDefinition } from "@/lib/log-custom-fields";

export function LogCustomFieldInputs({
  fields,
  values,
  onChange,
  disabled = false,
}: {
  fields: LogCustomFieldDefinition[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  if (!fields.length) return null;
  return (
    <div className="space-y-4">
      {fields.map((field) => {
        if (!logCustomFieldVisible(field, values)) return null;
        const val = values[field.key] ?? "";
        const id = `custom-field-${field.key}`;
        return (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={id}>
              {field.label}
              {field.required && <span className="ml-1 text-rose-600">*</span>}
            </Label>
            {field.type === "textarea" ? (
              <Textarea
                id={id}
                value={val}
                onChange={(e) => onChange(field.key, e.target.value)}
                required={Boolean(field.required)}
                maxLength={field.maxLength ?? 4000}
                disabled={disabled}
                rows={3}
              />
            ) : field.type === "select" ? (
              <Select value={val} onValueChange={(next) => onChange(field.key, next)} disabled={disabled}>
                <SelectTrigger id={id}>
                  <SelectValue placeholder={`Select ${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {val && !(field.options ?? []).includes(val) && (
                    <SelectItem value={val}>{val}</SelectItem>
                  )}
                  {(field.options ?? []).map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={val}
                onChange={(e) => onChange(field.key, e.target.value)}
                required={Boolean(field.required)}
                min={field.type === "number" ? field.min : undefined}
                max={field.type === "number" ? field.max : undefined}
                maxLength={field.type === "text" ? (field.maxLength ?? 500) : undefined}
                disabled={disabled}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function LogCustomFieldValues({
  fields,
  values,
}: {
  fields?: LogCustomFieldDefinition[] | null;
  values?: Record<string, string> | null;
}) {
  if (!fields?.length) return null;
  const map = values ?? {};
  const visible = fields.filter((field) => logCustomFieldVisible(field, map));
  if (!visible.length) return null;
  return (
    <section aria-label="Department custom fields" className="pt-2">
      <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-teal-800">Additional fields</h4>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visible.map((field) => {
          const val = map[field.key];
          return (
            <div key={field.key} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{field.label}</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">
                {val === undefined || val === null || val === "" ? <span className="text-slate-400">Not recorded</span> : val}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
