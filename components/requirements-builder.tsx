"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { assembleRequirements } from "@/lib/assemble-requirements";
import { configsMatch, defaultConfig, type ProjectConfig } from "@/lib/config";
import {
  CONFIG_FILE_MAX_BYTES,
  CONFIG_FILE_NAME,
  parseConfigText,
  serializeConfig,
  type ConfigFileError,
} from "@/lib/config-file";
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
  BACKEND_LANGUAGES,
  FRONTEND_LABELS,
  INPUT_LIMITS,
  JAVA_LINTER_LABELS,
  JAVA_LINTERS,
  JAVA_PACKAGE_MANAGER_LABELS,
  JAVA_PACKAGE_MANAGERS,
  JAVA_VERSION_LABELS,
  JAVA_VERSIONS,
  JS_LINTER_LABELS,
  JS_LINTERS,
  JS_PACKAGE_MANAGER_LABELS,
  JS_PACKAGE_MANAGERS,
  JS_TEST_RUNNER_LABELS,
  JS_TEST_RUNNERS,
  LANGUAGE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  MODES,
  NODE_VERSION_LABELS,
  NODE_VERSIONS,
  OPTIONAL_MODULE_LABELS,
  OPTIONAL_MODULES,
  PYTHON_LINTER_LABELS,
  PYTHON_LINTERS,
  PYTHON_PACKAGE_MANAGER_LABELS,
  PYTHON_PACKAGE_MANAGERS,
  PYTHON_TEST_RUNNER_LABELS,
  PYTHON_TEST_RUNNERS,
  PYTHON_VERSION_LABELS,
  PYTHON_VERSIONS,
  RUNTIME_LABELS,
  STACK_SIDE_LABELS,
  TYPESCRIPT_VERSION_LABELS,
  TYPESCRIPT_VERSIONS,
  UI_LANGUAGES,
  type Language,
  type LanguageToolchain,
  type OptionalModule,
  type StackSide,
} from "@/lib/constants";
import type { Templates } from "@/lib/load-templates";
import { moduleVersionMap } from "@/lib/module-registry";
import {
  allowedBackendFrameworks,
  allowedFrontends,
  allowedRuntimes,
  isApiChoiceFixed,
  normalizeSelections,
} from "@/lib/selection-rules";
import { defaultToolchain, replaceToolchain, type ToolchainPatch } from "@/lib/toolchain";
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
const CONFIG_FILE_ERRORS: Record<ConfigFileError, string> = {
  "not-json": UI_TEXT.configFile.notJson,
  "too-large": UI_TEXT.configFile.tooLarge,
  "wrong-format": UI_TEXT.configFile.wrongFormat,
  invalid: UI_TEXT.configFile.invalid,
};

const ERROR_FOCUS_ORDER: (keyof ValidationErrors)[] = [
  ...TEXT_FIELDS.map((field) => field.name),
  "exposesApi",
  "backendLanguages",
  "runtime",
  "backendFramework",
  "frontend",
  "uiLanguages",
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

type SyncLanguage = "typescript" | "javascript";

function ToolchainSelect<T extends string>({
  id,
  label,
  value,
  options,
  labels,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

function toolchainControlId(side: StackSide, language: Language, field: string) {
  return `field-${side}-${language}-${field}`;
}

function toolchainControlLabel(side: StackSide, language: Language, field: string) {
  return `${STACK_SIDE_LABELS[side]} ${LANGUAGE_LABELS[language]} ${field}`;
}

function ToolchainOptions({
  side,
  entry,
  onChange,
}: {
  side: StackSide;
  entry: Exclude<LanguageToolchain, { language: "other" }>;
  onChange: (patch: ToolchainPatch, syncLanguage?: SyncLanguage) => void;
}) {
  const language = entry.language;
  const syncLanguage: SyncLanguage | undefined =
    language === "typescript" || language === "javascript" ? language : undefined;

  if (entry.language === "typescript" || entry.language === "javascript") {
    return (
      <>
        {entry.language === "typescript" && (
          <ToolchainSelect
            id={toolchainControlId(side, language, "languageVersion")}
            label={toolchainControlLabel(side, language, "language version")}
            value={entry.languageVersion}
            options={TYPESCRIPT_VERSIONS}
            labels={TYPESCRIPT_VERSION_LABELS}
            onChange={(languageVersion) => onChange({ languageVersion })}
          />
        )}
        <ToolchainSelect
          id={toolchainControlId(side, language, "nodeVersion")}
          label={toolchainControlLabel(side, language, "Node.js version")}
          value={entry.nodeVersion}
          options={NODE_VERSIONS}
          labels={NODE_VERSION_LABELS}
          onChange={(nodeVersion) => onChange({ nodeVersion }, syncLanguage)}
        />
        <ToolchainSelect
          id={toolchainControlId(side, language, "packageManager")}
          label={toolchainControlLabel(side, language, "package manager")}
          value={entry.packageManager}
          options={JS_PACKAGE_MANAGERS}
          labels={JS_PACKAGE_MANAGER_LABELS}
          onChange={(packageManager) => onChange({ packageManager }, syncLanguage)}
        />
        <ToolchainSelect
          id={toolchainControlId(side, language, "testRunner")}
          label={toolchainControlLabel(side, language, "test runner")}
          value={entry.testRunner}
          options={JS_TEST_RUNNERS}
          labels={JS_TEST_RUNNER_LABELS}
          onChange={(testRunner) => onChange({ testRunner }, syncLanguage)}
        />
        <ToolchainSelect
          id={toolchainControlId(side, language, "linter")}
          label={toolchainControlLabel(side, language, "linter")}
          value={entry.linter}
          options={JS_LINTERS}
          labels={JS_LINTER_LABELS}
          onChange={(linter) => onChange({ linter }, syncLanguage)}
        />
      </>
    );
  }

  if (entry.language === "java") {
    return (
      <>
        <ToolchainSelect
          id={toolchainControlId(side, language, "languageVersion")}
          label={toolchainControlLabel(side, language, "language version")}
          value={entry.languageVersion}
          options={JAVA_VERSIONS}
          labels={JAVA_VERSION_LABELS}
          onChange={(languageVersion) => onChange({ languageVersion })}
        />
        <ToolchainSelect
          id={toolchainControlId(side, language, "packageManager")}
          label={toolchainControlLabel(side, language, "package manager")}
          value={entry.packageManager}
          options={JAVA_PACKAGE_MANAGERS}
          labels={JAVA_PACKAGE_MANAGER_LABELS}
          onChange={(packageManager) => onChange({ packageManager })}
        />
        <ToolchainSelect
          id={toolchainControlId(side, language, "linter")}
          label={toolchainControlLabel(side, language, "linter")}
          value={entry.linter}
          options={JAVA_LINTERS}
          labels={JAVA_LINTER_LABELS}
          onChange={(linter) => onChange({ linter })}
        />
        <p className="hint">{UI_TEXT.hints.junit}</p>
      </>
    );
  }

  return (
    <>
      <ToolchainSelect
        id={toolchainControlId(side, language, "languageVersion")}
        label={toolchainControlLabel(side, language, "language version")}
        value={entry.languageVersion}
        options={PYTHON_VERSIONS}
        labels={PYTHON_VERSION_LABELS}
        onChange={(languageVersion) => onChange({ languageVersion })}
      />
      <ToolchainSelect
        id={toolchainControlId(side, language, "packageManager")}
        label={toolchainControlLabel(side, language, "package manager")}
        value={entry.packageManager}
        options={PYTHON_PACKAGE_MANAGERS}
        labels={PYTHON_PACKAGE_MANAGER_LABELS}
        onChange={(packageManager) => onChange({ packageManager })}
      />
      <ToolchainSelect
        id={toolchainControlId(side, language, "testRunner")}
        label={toolchainControlLabel(side, language, "test runner")}
        value={entry.testRunner}
        options={PYTHON_TEST_RUNNERS}
        labels={PYTHON_TEST_RUNNER_LABELS}
        onChange={(testRunner) => onChange({ testRunner })}
      />
      <ToolchainSelect
        id={toolchainControlId(side, language, "linter")}
        label={toolchainControlLabel(side, language, "linter")}
        value={entry.linter}
        options={PYTHON_LINTERS}
        labels={PYTHON_LINTER_LABELS}
        onChange={(linter) => onChange({ linter })}
      />
    </>
  );
}

function StackLanguages({
  side,
  languages,
  entries,
  error,
  onToggle,
  onChange,
}: {
  side: StackSide;
  languages: readonly Language[];
  entries: LanguageToolchain[];
  error?: string;
  onToggle: (language: Language, checked: boolean) => void;
  onChange: (language: Language, patch: ToolchainPatch, syncLanguage?: SyncLanguage) => void;
}) {
  const fieldName = side === "ui" ? "uiLanguages" : "backendLanguages";
  const sharesManifest =
    entries.some((entry) => entry.language === "typescript") &&
    entries.some((entry) => entry.language === "javascript");
  const hintId = `${side}-shared-manifest`;

  return (
    <fieldset
      id={fieldId(fieldName)}
      tabIndex={-1}
      aria-describedby={describedBy(sharesManifest && hintId, error && `${fieldId(fieldName)}-error`)}
    >
      <legend>{side === "ui" ? UI_TEXT.legends.uiLanguages : UI_TEXT.legends.backendLanguages}</legend>
      {languages.map((language) => {
        const entry = entries.find((item) => item.language === language);
        return (
          <div key={language}>
            <div className="field">
              <label>
                <input
                  type="checkbox"
                  checked={entry !== undefined}
                  onChange={(event) => onToggle(language, event.target.checked)}
                />{" "}
                {`${STACK_SIDE_LABELS[side]} ${LANGUAGE_LABELS[language]}`}
              </label>
            </div>
            {entry && entry.language !== "other" && (
              <ToolchainOptions side={side} entry={entry} onChange={(patch, syncLanguage) => onChange(language, patch, syncLanguage)} />
            )}
          </div>
        );
      })}
      {sharesManifest && (
        <p id={hintId} className="hint">
          {UI_TEXT.hints.sharedManifest}
        </p>
      )}
      <ErrorText name={fieldName} error={error} />
    </fieldset>
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
  const [configFileNotice, setConfigFileNotice] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
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

  const toggleLanguage = (side: StackSide, language: Language, checked: boolean) =>
    setConfig((current) => {
      const key = side === "ui" ? "uiLanguages" : "backendLanguages";
      const existing = current[key];
      const without = existing.filter((entry) => entry.language !== language);
      const sibling = language === "typescript" ? "javascript" : language === "javascript" ? "typescript" : undefined;
      const siblingExists = sibling !== undefined && existing.some((entry) => entry.language === sibling);
      return normalizeSelections(
        { ...current, [key]: checked ? [...without, defaultToolchain(language)] : without },
        {
          syncSide: side,
          // A newly checked language adopts the toolchain already chosen for its sibling.
          syncLanguage: checked && siblingExists ? sibling : undefined,
        },
      );
    });

  const changeToolchain = (side: StackSide, language: Language, patch: ToolchainPatch, syncLanguage?: SyncLanguage) =>
    setConfig((current) => {
      const key = side === "ui" ? "uiLanguages" : "backendLanguages";
      return normalizeSelections(
        { ...current, [key]: replaceToolchain(current[key], language, patch) },
        { syncSide: side, syncLanguage },
      );
    });

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
    const started = downloadBlob(markdown, "text/markdown;charset=utf-8", downloadFilename(count));
    if (started) storeDownloadCount(count + 1);
  }

  function downloadBlob(contents: string, type: string, filename: string): boolean {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    try {
      link.click();
    } catch {
      link.remove();
      URL.revokeObjectURL(url);
      return false;
    }
    link.remove();
    // Revoke on the next turn so the browser can start the download first.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  function exportConfiguration() {
    const started = downloadBlob(
      serializeConfig(config, moduleVersionMap()),
      "application/json;charset=utf-8",
      CONFIG_FILE_NAME,
    );
    setConfigFileNotice(started ? null : { kind: "alert", text: UI_TEXT.configFile.exportFailed });
  }

  async function importConfiguration(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > CONFIG_FILE_MAX_BYTES) {
      setConfigFileNotice({ kind: "alert", text: UI_TEXT.configFile.tooLarge });
      return;
    }

    let text: string;
    try {
      text = await file.text();
    } catch {
      setConfigFileNotice({ kind: "alert", text: UI_TEXT.configFile.readFailed });
      return;
    }

    const parsed = parseConfigText(text, moduleVersionMap());
    if (!parsed.ok) {
      setConfigFileNotice({ kind: "alert", text: CONFIG_FILE_ERRORS[parsed.error] });
      return;
    }

    const nextErrors = validateConfig(parsed.value.config);
    setConfig(parsed.value.config);
    setErrors(nextErrors);
    setPending(null);
    setAssemblyError("");
    setConfigFileNotice({
      kind: "status",
      text: parsed.value.libraryChanged ? UI_TEXT.configFile.libraryChanged : UI_TEXT.configFile.imported,
    });
    if (hasErrors(nextErrors)) {
      const firstInvalid = ERROR_FOCUS_ORDER.find((key) => nextErrors[key]);
      if (firstInvalid) document.getElementById(fieldId(firstInvalid))?.focus();
    }
  }

  const runtimes = allowedRuntimes(config);
  const backendFrameworks = allowedBackendFrameworks(config);
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
          <StackLanguages
            side="backend"
            languages={BACKEND_LANGUAGES}
            entries={config.backendLanguages}
            error={errors.backendLanguages}
            onToggle={(language, checked) => toggleLanguage("backend", language, checked)}
            onChange={(language, patch, syncLanguage) => changeToolchain("backend", language, patch, syncLanguage)}
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
            <>
              <SelectField
                name="frontend"
                label={UI_TEXT.fields.frontendFramework}
                value={config.frontend}
                options={allowedFrontends(config)}
                labels={FRONTEND_LABELS}
                error={errors.frontend}
                onChange={(frontend) => updateSelection({ frontend })}
              />
              <StackLanguages
                side="ui"
                languages={UI_LANGUAGES}
                entries={config.uiLanguages}
                error={errors.uiLanguages}
                onToggle={(language, checked) => toggleLanguage("ui", language, checked)}
                onChange={(language, patch, syncLanguage) => changeToolchain("ui", language, patch, syncLanguage)}
              />
            </>
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

        <fieldset>
          <legend>{UI_TEXT.legends.configurationFile}</legend>
          <div className="actions">
            <button type="button" className="secondary" onClick={exportConfiguration}>
              {UI_TEXT.buttons.exportConfiguration}
            </button>
            <label className="file-import">
              {UI_TEXT.buttons.importConfiguration}
              <input type="file" accept="application/json,.json" onChange={(event) => void importConfiguration(event)} />
            </label>
          </div>
          {configFileNotice && (
            <p role={configFileNotice.kind === "alert" ? "alert" : "status"} className={configFileNotice.kind === "alert" ? "error" : "status"}>
              {configFileNotice.text}
            </p>
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
