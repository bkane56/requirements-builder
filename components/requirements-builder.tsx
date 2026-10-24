"use client";

import { useState, type FormEvent } from "react";
import { assembleRequirements } from "@/lib/assemble-requirements";
import { defaultConfig, type ProjectConfig } from "@/lib/config";
import {
  API_MODULES,
  APP_TYPE_LABELS,
  APP_TYPES,
  BACKEND_FRAMEWORK_LABELS,
  DEFAULT_PACKAGE_MANAGERS,
  FRONTEND_LABELS,
  INPUT_LIMITS,
  LANGUAGE_LABELS,
  LANGUAGES,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  MODES,
  OPTIONAL_MODULE_LABELS,
  OPTIONAL_MODULES,
  RUNTIME_LABELS,
  type OptionalModule,
} from "@/lib/constants";
import type { Templates } from "@/lib/load-templates";
import {
  allowedBackendFrameworks,
  allowedFrontends,
  allowedRuntimes,
  isApiChoiceFixed,
  normalizeSelections,
} from "@/lib/selection-rules";
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

// Document order, used to move focus to the first invalid control.
const ERROR_FOCUS_ORDER: (keyof ProjectConfig)[] = [
  ...TEXT_FIELDS.map((field) => field.name),
  "exposesApi",
  "runtime",
  "backendFramework",
  "frontend",
  "modules",
  "coverage",
];

const NON_API_MODULES = OPTIONAL_MODULES.filter((key) => !API_MODULES.includes(key));

const fieldId = (name: keyof ProjectConfig) => `field-${name}`;

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function ErrorText({ name, error }: { name: keyof ProjectConfig; error?: string }) {
  return error ? (
    <span id={`${fieldId(name)}-error`} className="error">
      {error}
    </span>
  ) : null;
}

type SelectFieldProps<T extends string> = {
  name: keyof ProjectConfig;
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  error?: string;
  hint?: string;
  onChange: (value: T) => void;
};

function SelectField<T extends string>({ name, label, value, options, labels, error, hint, onChange }: SelectFieldProps<T>) {
  const id = fieldId(name);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && (
        <span id={`${id}-hint`} className="hint">
          {hint}
        </span>
      )}
      <select
        id={id}
        name={name}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(hint && `${id}-hint`, error && `${id}-error`)}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
      <ErrorText name={name} error={error} />
    </div>
  );
}

export default function RequirementsBuilder({ templates }: { templates: Templates }) {
  const [config, setConfig] = useState<ProjectConfig>(defaultConfig);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [assemblyError, setAssemblyError] = useState("");
  const [markdown, setMarkdown] = useState("");

  const update = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  // Selection changes can invalidate dependent choices, so they always pass through normalizeSelections.
  const updateSelection = (patch: Partial<ProjectConfig>) =>
    setConfig((current) => normalizeSelections({ ...current, ...patch }));

  const updateModule = (key: OptionalModule, checked: boolean) =>
    setConfig((current) => normalizeSelections({ ...current, modules: { ...current.modules, [key]: checked } }));

  const updateCoverage = (patch: Partial<ProjectConfig["coverage"]>) =>
    setConfig((current) => ({ ...current, coverage: { ...current.coverage, ...patch } }));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateConfig(config);
    setErrors(nextErrors);
    setAssemblyError("");

    if (hasErrors(nextErrors)) {
      const firstInvalid = ERROR_FOCUS_ORDER.find((key) => nextErrors[key]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    try {
      setMarkdown(assembleRequirements(config, templates));
    } catch (error) {
      setAssemblyError(error instanceof Error ? error.message : String(error));
    }
  }

  const runtimes = allowedRuntimes(config);
  const backendFrameworks = allowedBackendFrameworks(config);
  const packageManager = DEFAULT_PACKAGE_MANAGERS[config.language];

  return (
    <div className="layout">
      <form onSubmit={handleSubmit} noValidate aria-label="Project configuration">
        {TEXT_FIELDS.map((field) => {
          const id = fieldId(field.name);
          const error = errors[field.name];
          const commonProps = {
            id,
            name: field.name,
            value: config[field.name],
            maxLength: field.maxLength,
            "aria-required": field.required,
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy(field.hint && `${id}-hint`, error && `${id}-error`),
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
              <ErrorText name={field.name} error={error} />
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

        <fieldset>
          <legend>Technology</legend>
          <SelectField
            name="appType"
            label="Application type"
            value={config.appType}
            options={APP_TYPES}
            labels={APP_TYPE_LABELS}
            onChange={(appType) => updateSelection({ appType })}
          />
          <SelectField
            name="language"
            label="Primary language"
            value={config.language}
            options={LANGUAGES}
            labels={LANGUAGE_LABELS}
            hint={
              packageManager
                ? `Package manager: ${packageManager} (fixed default; selection is not yet supported).`
                : "No language conventions are included for Other."
            }
            onChange={(language) => updateSelection({ language })}
          />

          {isApiChoiceFixed(config) ? (
            <p className="hint">
              {APP_TYPE_LABELS[config.appType]} projects {config.exposesApi ? "always include" : "do not include"} an
              HTTP API.
            </p>
          ) : (
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  id={fieldId("exposesApi")}
                  checked={config.exposesApi}
                  aria-invalid={errors.exposesApi ? true : undefined}
                  aria-describedby={describedBy(errors.exposesApi && `${fieldId("exposesApi")}-error`)}
                  onChange={(event) => updateSelection({ exposesApi: event.target.checked })}
                />{" "}
                Includes an HTTP API
              </label>
              <ErrorText name="exposesApi" error={errors.exposesApi} />
            </div>
          )}

          {runtimes.length > 1 && (
            <SelectField
              name="runtime"
              label="Runtime"
              value={config.runtime}
              options={runtimes}
              labels={RUNTIME_LABELS}
              error={errors.runtime}
              onChange={(runtime) => updateSelection({ runtime })}
            />
          )}
          {backendFrameworks.length > 1 && (
            <SelectField
              name="backendFramework"
              label="Backend framework"
              value={config.backendFramework}
              options={backendFrameworks}
              labels={BACKEND_FRAMEWORK_LABELS}
              error={errors.backendFramework}
              onChange={(backendFramework) => updateSelection({ backendFramework })}
            />
          )}
          {config.appType === "web-app" && (
            <SelectField
              name="frontend"
              label="Frontend framework"
              value={config.frontend}
              options={allowedFrontends(config)}
              labels={FRONTEND_LABELS}
              error={errors.frontend}
              onChange={(frontend) => updateSelection({ frontend })}
            />
          )}
        </fieldset>

        {config.exposesApi && (
          <fieldset
            id={fieldId("modules")}
            tabIndex={-1}
            aria-describedby={describedBy(errors.modules && `${fieldId("modules")}-error`)}
          >
            <legend>API documentation</legend>
            {API_MODULES.map((key) => (
              <div className="field" key={key}>
                <label>
                  <input
                    type="checkbox"
                    checked={config.modules[key]}
                    onChange={(event) => updateModule(key, event.target.checked)}
                  />{" "}
                  {OPTIONAL_MODULE_LABELS[key]}
                </label>
              </div>
            ))}
            <ErrorText name="modules" error={errors.modules} />
          </fieldset>
        )}

        <fieldset>
          <legend>Testing and quality</legend>
          <p className="hint">Unit tests and local build verification are always included.</p>
          {NON_API_MODULES.map((key) => (
            <div className="field" key={key}>
              <label>
                <input
                  type="checkbox"
                  checked={config.modules[key]}
                  onChange={(event) => updateModule(key, event.target.checked)}
                />{" "}
                {OPTIONAL_MODULE_LABELS[key]}
              </label>
            </div>
          ))}

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={config.coverage.enabled}
                onChange={(event) => updateCoverage({ enabled: event.target.checked })}
              />{" "}
              Code coverage targets
            </label>
          </div>
          {config.coverage.enabled && (
            <>
              <div className="field">
                <label htmlFor={fieldId("coverage")}>Line coverage target (%)</label>
                <input
                  type="number"
                  id={fieldId("coverage")}
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isNaN(config.coverage.linePercent) ? "" : config.coverage.linePercent}
                  aria-invalid={errors.coverage ? true : undefined}
                  aria-describedby={describedBy(errors.coverage && `${fieldId("coverage")}-error`)}
                  onChange={(event) => updateCoverage({ linePercent: event.target.valueAsNumber })}
                />
              </div>
              <div className="field">
                <label htmlFor="field-coverage-branch">Branch coverage target (%)</label>
                <input
                  type="number"
                  id="field-coverage-branch"
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isNaN(config.coverage.branchPercent) ? "" : config.coverage.branchPercent}
                  aria-invalid={errors.coverage ? true : undefined}
                  aria-describedby={describedBy(errors.coverage && `${fieldId("coverage")}-error`)}
                  onChange={(event) => updateCoverage({ branchPercent: event.target.valueAsNumber })}
                />
              </div>
              <ErrorText name="coverage" error={errors.coverage} />
            </>
          )}
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
