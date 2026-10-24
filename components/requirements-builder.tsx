"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { assembleRequirements } from "@/lib/assemble-requirements";
import { configsMatch, defaultConfig, type ProjectConfig } from "@/lib/config";
import {
  DOWNLOAD_COUNT_STORAGE_KEY,
  downloadFilename,
  parseStoredDownloadCount,
} from "@/lib/download-filename";
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
import { UI_TEXT } from "@/lib/ui-text";
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
  { name: "projectName", label: UI_TEXT.fields.projectName, required: true, multiline: false, maxLength: INPUT_LIMITS.projectName },
  { name: "description", label: UI_TEXT.fields.description, multiline: true, maxLength: INPUT_LIMITS.description },
  {
    name: "businessRequirements",
    label: UI_TEXT.fields.businessRequirements,
    hint: UI_TEXT.fields.businessRequirementsHint,
    required: true,
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
  {
    name: "acceptanceCriteria",
    label: UI_TEXT.fields.acceptanceCriteria,
    hint: UI_TEXT.fields.acceptanceCriteriaHint,
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
  {
    name: "stretchGoals",
    label: UI_TEXT.fields.stretchGoals,
    hint: UI_TEXT.fields.stretchGoalsHint,
    multiline: true,
    maxLength: INPUT_LIMITS.longText,
  },
];

// Document order, used to move focus to the first invalid control.
const ERROR_FOCUS_ORDER: (keyof ValidationErrors)[] = [
  ...TEXT_FIELDS.map((field) => field.name),
  "exposesApi",
  "runtime",
  "backendFramework",
  "frontend",
  "modules",
  "linePercent",
  "branchPercent",
];

const NON_API_MODULES = OPTIONAL_MODULES.filter((key) => !API_MODULES.includes(key));

type CopyStatus = "idle" | "copied" | "failed";

type AssembledSnapshot = {
  config: ProjectConfig;
  markdown: string;
};

type PendingAction = {
  kind: "replace" | "restore";
  config: ProjectConfig;
  markdown: string;
  next?: string;
};

const fieldId = (name: keyof ValidationErrors | keyof ProjectConfig) => `field-${name}`;

function describedBy(...ids: (string | false | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

function ErrorText({ name, error }: { name: keyof ValidationErrors; error?: string }) {
  return error ? (
    <span id={`${fieldId(name)}-error`} className="error">
      {error}
    </span>
  ) : null;
}

type SelectFieldProps<T extends string> = {
  name: Exclude<keyof ProjectConfig, "coverage">;
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
  const [assembled, setAssembled] = useState<AssembledSnapshot | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copyGeneration = useRef(0);
  const keepEditsRef = useRef<HTMLButtonElement>(null);
  const downloadCount = useRef(0);

  const update = <K extends keyof ProjectConfig>(key: K, value: ProjectConfig[K]) =>
    setConfig((current) => ({ ...current, [key]: value }));

  // Selection changes can invalidate dependent choices, so they always pass through normalizeSelections.
  const updateSelection = (patch: Partial<ProjectConfig>) =>
    setConfig((current) => normalizeSelections({ ...current, ...patch }));

  const updateModule = (key: OptionalModule, checked: boolean) =>
    setConfig((current) => normalizeSelections({ ...current, modules: { ...current.modules, [key]: checked } }));

  const updateCoverage = (patch: Partial<ProjectConfig["coverage"]>) =>
    setConfig((current) => ({ ...current, coverage: { ...current.coverage, ...patch } }));

  function applyAssembly(nextConfig: ProjectConfig, nextMarkdown: string) {
    setMarkdown(nextMarkdown);
    setAssembled({ config: nextConfig, markdown: nextMarkdown });
    setPending(null);
    copyGeneration.current += 1;
    setCopyStatus("idle");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateConfig(config);
    setErrors(nextErrors);
    setAssemblyError("");

    if (hasErrors(nextErrors)) {
      setPending(null);
      const firstInvalid = ERROR_FOCUS_ORDER.find((key) => nextErrors[key]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    let next: string;
    try {
      next = assembleRequirements(config, templates);
    } catch (error) {
      setPending(null);
      setAssemblyError(error instanceof Error ? error.message : String(error));
      return;
    }

    if (assembled && markdown !== assembled.markdown && next !== markdown) {
      setPending({ kind: "replace", config, markdown, next });
      return;
    }

    applyAssembly(config, next);
  }

  function confirmPending() {
    if (!activePending) return;
    if (activePending.kind === "replace" && activePending.next !== undefined) {
      applyAssembly(activePending.config, activePending.next);
      return;
    }
    if (activePending.kind === "restore" && assembled) {
      setMarkdown(assembled.markdown);
      setPending(null);
      copyGeneration.current += 1;
      setCopyStatus("idle");
    }
  }

  async function copyMarkdown() {
    if (!markdown) return;
    const text = markdown;
    const generation = copyGeneration.current;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable.");
      }
      await navigator.clipboard.writeText(text);
      if (copyGeneration.current === generation) setCopyStatus("copied");
    } catch {
      if (copyGeneration.current === generation) setCopyStatus("failed");
    }
  }

  function loadDownloadCount(): number {
    try {
      return parseStoredDownloadCount(sessionStorage.getItem(DOWNLOAD_COUNT_STORAGE_KEY));
    } catch {
      return downloadCount.current;
    }
  }

  function storeDownloadCount(count: number) {
    downloadCount.current = count;
    try {
      sessionStorage.setItem(DOWNLOAD_COUNT_STORAGE_KEY, String(count));
    } catch {
      // The in-memory count remains the fallback for this page view.
    }
  }

  function downloadMarkdown() {
    if (!markdown) return;
    const count = loadDownloadCount();
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadFilename(count);
    document.body.appendChild(link);
    try {
      link.click();
    } catch {
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }
    link.remove();
    // Revoke on the next turn so the browser can start the download first.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    storeDownloadCount(count + 1);
  }

  const runtimes = allowedRuntimes(config);
  const backendFrameworks = allowedBackendFrameworks(config);
  const packageManager = DEFAULT_PACKAGE_MANAGERS[config.language];
  const hasDocument = markdown.length > 0;
  const edited = assembled !== null && markdown !== assembled.markdown;
  const stale = assembled !== null && !configsMatch(config, assembled.config);
  const activePending =
    pending && configsMatch(config, pending.config) && markdown === pending.markdown ? pending : null;
  const canRestore = edited;

  useEffect(() => {
    if (!edited) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // An empty value asks the browser for its generic leave prompt, not a custom message.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [edited]);

  useEffect(() => {
    if (activePending) keepEditsRef.current?.focus();
  }, [activePending]);

  return (
    <div className="layout">
      <section className="configuration" aria-labelledby="configuration-heading">
        <h2 id="configuration-heading">{UI_TEXT.configurationHeading}</h2>
        <form onSubmit={handleSubmit} noValidate aria-label={UI_TEXT.configurationFormLabel}>
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
          <legend>{UI_TEXT.legends.mode}</legend>
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
          <legend>{UI_TEXT.legends.technology}</legend>
          <SelectField
            name="appType"
            label={UI_TEXT.fields.applicationType}
            value={config.appType}
            options={APP_TYPES}
            labels={APP_TYPE_LABELS}
            onChange={(appType) => updateSelection({ appType })}
          />
          <SelectField
            name="language"
            label={UI_TEXT.fields.primaryLanguage}
            value={config.language}
            options={LANGUAGES}
            labels={LANGUAGE_LABELS}
            hint={
              packageManager
                ? UI_TEXT.hints.packageManager(packageManager)
                : UI_TEXT.hints.noLanguageConventions
            }
            onChange={(language) => updateSelection({ language })}
          />

          {isApiChoiceFixed(config) ? (
            <p className="hint">
              {UI_TEXT.hints.fixedHttpApi(APP_TYPE_LABELS[config.appType], config.exposesApi)}
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
                {UI_TEXT.fields.includesHttpApi}
              </label>
              <ErrorText name="exposesApi" error={errors.exposesApi} />
            </div>
          )}

          {runtimes.length > 1 && (
            <SelectField
              name="runtime"
              label={UI_TEXT.fields.runtime}
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
              label={UI_TEXT.fields.backendFramework}
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
              label={UI_TEXT.fields.frontendFramework}
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
            <legend>{UI_TEXT.legends.apiDocumentation}</legend>
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
          <legend>{UI_TEXT.legends.testing}</legend>
          <p className="hint">{UI_TEXT.hints.testingAlwaysIncluded}</p>
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
              {UI_TEXT.fields.codeCoverage}
            </label>
          </div>
          {config.coverage.enabled && (
            <>
              <div className="field">
                <label htmlFor={fieldId("linePercent")}>{UI_TEXT.fields.lineCoverage}</label>
                <input
                  type="number"
                  id={fieldId("linePercent")}
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isNaN(config.coverage.linePercent) ? "" : config.coverage.linePercent}
                  aria-invalid={errors.linePercent ? true : undefined}
                  aria-describedby={describedBy(errors.linePercent && `${fieldId("linePercent")}-error`)}
                  onChange={(event) => updateCoverage({ linePercent: event.target.valueAsNumber })}
                />
                <ErrorText name="linePercent" error={errors.linePercent} />
              </div>
              <div className="field">
                <label htmlFor={fieldId("branchPercent")}>{UI_TEXT.fields.branchCoverage}</label>
                <input
                  type="number"
                  id={fieldId("branchPercent")}
                  min={0}
                  max={100}
                  step={1}
                  value={Number.isNaN(config.coverage.branchPercent) ? "" : config.coverage.branchPercent}
                  aria-invalid={errors.branchPercent ? true : undefined}
                  aria-describedby={describedBy(errors.branchPercent && `${fieldId("branchPercent")}-error`)}
                  onChange={(event) => updateCoverage({ branchPercent: event.target.valueAsNumber })}
                />
                <ErrorText name="branchPercent" error={errors.branchPercent} />
              </div>
            </>
          )}
        </fieldset>

        <button type="submit">{assembled ? UI_TEXT.buttons.reassemble : UI_TEXT.buttons.assembleDraft}</button>
        {assemblyError && (
          <p role="alert" className="error">
            {UI_TEXT.assemblyFailed(assemblyError)}
          </p>
        )}
        </form>
      </section>

      <section className="output" aria-labelledby="preview-heading">
        <h2 id="preview-heading">{UI_TEXT.previewHeading}</h2>
        <p id="preview-note" className="hint">
          {UI_TEXT.hints.preview}
        </p>
        {stale && (
          <p id="stale-notice" role="status" className="notice">
            {UI_TEXT.notices.stale}
          </p>
        )}
        {edited && (
          <p id="edited-notice" role="status" className="notice">
            {UI_TEXT.notices.edited}
          </p>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={copyMarkdown} disabled={!hasDocument}>
            {UI_TEXT.buttons.copyMarkdown}
          </button>
          <button type="button" className="secondary" onClick={downloadMarkdown} disabled={!hasDocument}>
            {UI_TEXT.buttons.downloadMarkdown}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              if (!canRestore) return;
              setPending({ kind: "restore", config, markdown });
            }}
            disabled={!canRestore}
          >
            {UI_TEXT.buttons.restoreGeneratedDraft}
          </button>
        </div>
        {copyStatus === "copied" && <p role="status" className="status">{UI_TEXT.copy.success}</p>}
        {copyStatus === "failed" && (
          <p role="alert" className="error">{UI_TEXT.copy.failure}</p>
        )}
        {activePending && (
          <div
            className="confirm"
            role="region"
            aria-labelledby="confirm-heading"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setPending(null);
              }
            }}
          >
            <h3 id="confirm-heading">
              {activePending.kind === "replace" ? UI_TEXT.confirm.replaceHeading : UI_TEXT.confirm.restoreHeading}
            </h3>
            <p>
              {activePending.kind === "replace" ? UI_TEXT.confirm.replaceBody : UI_TEXT.confirm.restoreBody}
            </p>
            {activePending.kind === "restore" && stale && <p>{UI_TEXT.confirm.restoreStale}</p>}
            <div className="actions">
              <button type="button" className="secondary" ref={keepEditsRef} onClick={() => setPending(null)}>
                {UI_TEXT.buttons.keepEdits}
              </button>
              <button type="button" onClick={confirmPending}>
                {activePending.kind === "replace" ? UI_TEXT.buttons.replaceEdits : UI_TEXT.buttons.restoreDraft}
              </button>
            </div>
          </div>
        )}
        <div className="field">
          <label htmlFor="markdown-preview">{UI_TEXT.fields.markdownDocument}</label>
          <textarea
            id="markdown-preview"
            className="preview"
            readOnly={assembled === null}
            value={markdown}
            placeholder={UI_TEXT.placeholder.markdown}
            aria-describedby={describedBy("preview-note", stale && "stale-notice", edited && "edited-notice")}
            onChange={(event) => {
              if (!assembled) return;
              setMarkdown(event.target.value);
              copyGeneration.current += 1;
              setCopyStatus("idle");
            }}
          />
        </div>
      </section>
    </div>
  );
}
