"use client";

import { useState, type FormEvent } from "react";
import { assembleRequirements } from "@/lib/assemble-requirements";
import { defaultConfig, type ProjectConfig } from "@/lib/config";
import { INPUT_LIMITS, MODE_DESCRIPTIONS, MODE_LABELS, MODES } from "@/lib/constants";
import type { Templates } from "@/lib/load-templates";
import { hasErrors, validateConfig, type ValidationErrors } from "@/lib/validate-config";

type TextFieldName = "projectName" | "description" | "businessRequirements" | "acceptanceCriteria" | "stretchGoals";

type TextFieldSpec = {
  name: TextFieldName;
  label: string;
  hint?: string;
  required?: boolean;
  multiline: boolean;
  maxLength: number;
};

const TEXT_FIELDS: TextFieldSpec[] = [
  { name: "projectName", label: "Project name", required: true, multiline: false, maxLength: INPUT_LIMITS.projectName },
  { name: "description", label: "Short description (optional)", multiline: true, maxLength: INPUT_LIMITS.description },
  {
    name: "businessRequirements",
    label: "Business requirements",
    hint: "Inserted into the document exactly as written.",
    required: true,
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
  {
    name: "acceptanceCriteria",
    label: "Acceptance criteria (optional)",
    hint: "If left empty, the document lists this as an open question.",
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
  {
    name: "stretchGoals",
    label: "Stretch goals (optional)",
    hint: "Goals to attempt only after all must-have requirements are verified.",
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
];

const fieldId = (name: keyof ProjectConfig) => `field-${name}`;

export default function RequirementsBuilder({ templates }: { templates: Templates }) {
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [assemblyError, setAssemblyError] = useState("");
  const [markdown, setMarkdown] = useState("");

  const update = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateConfig(config);
    setErrors(nextErrors);
    setAssemblyError("");

    if (hasErrors(nextErrors)) {
      const firstInvalid = TEXT_FIELDS.find((field) => nextErrors[field.name]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid.name))?.focus();
      return;
    }

    try {
      setMarkdown(assembleRequirements(config, templates));
    } catch (error) {
      setAssemblyError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="layout">
      <form onSubmit={handleSubmit} noValidate aria-label="Project configuration">
        {TEXT_FIELDS.map((field) => {
          const id = fieldId(field.name);
          const error = errors[field.name];
          const describedBy = [field.hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
          const commonProps = {
            id,
            name: field.name,
            value: config[field.name],
            maxLength: field.maxLength,
            "aria-required": field.required,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy || undefined,
          };

          return (
            <div className="field" key={field.name}>
              <label htmlFor={id}>{field.label}</label>
              {field.hint && (
                <span id={`${id}-hint`} className="hint">
                  {field.hint}
                </span>
              )}
              {field.multiline ? (
                <textarea {...commonProps} onChange={(event) => update(field.name, event.target.value)} />
              ) : (
                <input type="text" {...commonProps} onChange={(event) => update(field.name, event.target.value)} />
              )}
              {error && (
                <span id={`${id}-error`} className="error">
                  {error}
                </span>
              )}
            </div>
          );
        })}

        <fieldset>
          <legend>Mode</legend>
          {MODES.map((mode) => (
            <div className="field" key={mode}>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value={mode}
                  checked={config.mode === mode}
                  onChange={() => update("mode", mode)}
                  aria-describedby={`mode-${mode}-hint`}
                />{" "}
                {MODE_LABELS[mode]}
              </label>
              <span id={`mode-${mode}-hint`} className="hint">
                {MODE_DESCRIPTIONS[mode]}
              </span>
            </div>
          ))}
        </fieldset>

        <button type="submit">Assemble Draft</button>
        {assemblyError && (
          <p role="alert" className="error">
            Assembly failed: {assemblyError}
          </p>
        )}
      </form>

      <section aria-labelledby="preview-heading">
        <h2 id="preview-heading">Preview</h2>
        <label htmlFor="markdown-preview">Assembled Markdown</label>
        <textarea
          id="markdown-preview"
          className="preview"
          readOnly
          value={markdown}
          placeholder="Complete the form and select Assemble Draft."
        />
      </section>
    </div>
  );
}
