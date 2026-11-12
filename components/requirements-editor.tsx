"use client";

import { useState } from "react";
import type { ProjectConfig } from "@/lib/config";
import {
  addAcceptanceCriterion,
  addFunctionalRequirement,
  criteriaLinking,
  removeAcceptanceCriterion,
  removeFunctionalRequirement,
  requirementsOf,
  updateAcceptanceCriterion,
  updateFunctionalRequirement,
  beginStructuredRequirements,
  returnToFreeTextRequirements,
  type CriterionScope,
  type RequirementStatus,
  type RequirementsContent,
} from "@/lib/requirements-content";
import { UI_TEXT } from "@/lib/ui-text";
import type { StructuredItemError } from "@/lib/validate-config";

const isBlank = (value: string) => value.trim().length === 0;

export function RequirementsEditor({
  config,
  error,
  itemErrors,
  onChange,
}: {
  config: ProjectConfig;
  error?: string;
  itemErrors: Record<string, StructuredItemError>;
  onChange: (content: RequirementsContent) => void;
}) {
  const content = requirementsOf(config);
  const [modePrompt, setModePrompt] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const linked = pendingDelete ? criteriaLinking(content, pendingDelete) : [];

  function requestStructuredMode() {
    const hasText = !isBlank(config.businessRequirements) || !isBlank(config.acceptanceCriteria);
    const hasItems = content.functionalRequirements.length > 0 || content.acceptanceCriteria.length > 0;
    if (hasText && !hasItems) {
      setModePrompt(true);
      return;
    }
    onChange({ ...content, mode: "structured" });
  }

  function requestRemoveRequirement(id: string) {
    if (criteriaLinking(content, id).length === 0) {
      onChange(removeFunctionalRequirement(content, id));
      return;
    }
    setPendingDelete(id);
  }

  return (
    <fieldset id="field-requirementsContent" tabIndex={-1} aria-invalid={error ? true : undefined} aria-describedby={error ? "field-requirementsContent-error" : undefined}>
      <legend>{UI_TEXT.legends.structuredRequirements}</legend>
      {content.mode === "free-text" ? (
        <div className="actions">
          <button type="button" className="secondary" onClick={requestStructuredMode}>
            {UI_TEXT.buttons.useStructuredRequirements}
          </button>
        </div>
      ) : (
        <>
          <p className="hint">{UI_TEXT.fields.structuredKept}</p>
          <p className="hint">{UI_TEXT.fields.proposedKept}</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={() => onChange(returnToFreeTextRequirements(content))}>
              {UI_TEXT.buttons.returnToFreeText}
            </button>
          </div>
          {content.functionalRequirements.map((item) => (
            <StructuredItem
              key={item.id}
              id={item.id}
              text={item.text}
              status={item.status}
              error={itemErrors[item.id]}
              onText={(text) => onChange(updateFunctionalRequirement(content, item.id, { text }))}
              onStatus={(status) => onChange(updateFunctionalRequirement(content, item.id, { status }))}
              onRemove={() => requestRemoveRequirement(item.id)}
            />
          ))}
          {content.acceptanceCriteria.map((item) => (
            <StructuredItem
              key={item.id}
              id={item.id}
              text={item.text}
              status={item.status}
              error={itemErrors[item.id]}
              scope={item.scope}
              requirementIds={item.requirementIds}
              functionalRequirements={content.functionalRequirements}
              onText={(text) => onChange(updateAcceptanceCriterion(content, item.id, { text }))}
              onStatus={(status) => onChange(updateAcceptanceCriterion(content, item.id, { status }))}
              onScope={(scope) => onChange(updateAcceptanceCriterion(content, item.id, { scope }))}
              onLink={(requirementId, checked) =>
                onChange(
                  updateAcceptanceCriterion(content, item.id, {
                    requirementIds: checked
                      ? [...item.requirementIds, requirementId]
                      : item.requirementIds.filter((existing) => existing !== requirementId),
                  }),
                )
              }
              onRemove={() => onChange(removeAcceptanceCriterion(content, item.id))}
            />
          ))}
          <div className="actions">
            <button type="button" className="secondary" onClick={() => onChange(addFunctionalRequirement(content))}>
              {UI_TEXT.buttons.addFunctionalRequirement}
            </button>
            <button type="button" className="secondary" onClick={() => onChange(addAcceptanceCriterion(content, { scope: "project" }))}>
              {UI_TEXT.buttons.addProjectCriterion}
            </button>
            <button type="button" className="secondary" onClick={() => onChange(addAcceptanceCriterion(content, { scope: "requirement" }))}>
              {UI_TEXT.buttons.addRequirementCriterion}
            </button>
          </div>
        </>
      )}
      {error && (
        <span id="field-requirementsContent-error" className="error">
          {error}
        </span>
      )}
      {modePrompt && (
        <div
          className="confirm"
          role="region"
          aria-labelledby="structured-confirm-heading"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setModePrompt(false);
            }
          }}
        >
          <h3 id="structured-confirm-heading">{UI_TEXT.confirm.structuredHeading}</h3>
          <p>{UI_TEXT.confirm.structuredBody}</p>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                onChange(beginStructuredRequirements(content, "copy", config.businessRequirements, config.acceptanceCriteria));
                setModePrompt(false);
              }}
            >
              {UI_TEXT.buttons.copyCurrentText}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                onChange(beginStructuredRequirements(content, "empty", config.businessRequirements, config.acceptanceCriteria));
                setModePrompt(false);
              }}
            >
              {UI_TEXT.buttons.startEmptyStructured}
            </button>
            <button type="button" className="secondary" onClick={() => setModePrompt(false)}>
              {UI_TEXT.buttons.cancel}
            </button>
          </div>
        </div>
      )}
      {pendingDelete && (
        <div
          className="confirm"
          role="region"
          aria-labelledby="remove-confirm-heading"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPendingDelete(null);
            }
          }}
        >
          <h3 id="remove-confirm-heading">{UI_TEXT.confirm.removeHeading(pendingDelete)}</h3>
          <p>
            {UI_TEXT.confirm.removeLinkedBody(
              pendingDelete,
              linked.map((item) => item.id).join(", "),
              linked.length === 1,
            )}
          </p>
          <div className="actions">
            <button
              type="button"
              onClick={() => {
                onChange(removeFunctionalRequirement(content, pendingDelete));
                setPendingDelete(null);
              }}
            >
              {UI_TEXT.buttons.removeItem(pendingDelete)}
            </button>
            <button type="button" className="secondary" onClick={() => setPendingDelete(null)}>
              {UI_TEXT.buttons.cancel}
            </button>
          </div>
        </div>
      )}
    </fieldset>
  );
}

function StructuredItem({
  id,
  text,
  status,
  error,
  scope,
  requirementIds = [],
  functionalRequirements = [],
  onText,
  onStatus,
  onScope,
  onLink,
  onRemove,
}: {
  id: string;
  text: string;
  status: RequirementStatus;
  error?: StructuredItemError;
  scope?: CriterionScope;
  requirementIds?: string[];
  functionalRequirements?: RequirementsContent["functionalRequirements"];
  onText: (text: string) => void;
  onStatus: (status: RequirementStatus) => void;
  onScope?: (scope: CriterionScope) => void;
  onLink?: (requirementId: string, checked: boolean) => void;
  onRemove: () => void;
}) {
  const textId = `field-${id}-text`;
  const errorId = `field-${id}-error`;
  const blocking = error?.blocking === true;
  return (
    <div className="field">
      <label htmlFor={textId}>{`${id} text`}</label>
      <textarea
        id={textId}
        value={text}
        aria-invalid={blocking ? true : undefined}
        aria-describedby={blocking ? errorId : undefined}
        onChange={(event) => onText(event.target.value)}
      />
      <label htmlFor={`field-${id}-status`}>{`${id} status`}</label>
      <select
        id={`field-${id}-status`}
        value={status}
        onChange={(event) => onStatus(event.target.value as RequirementStatus)}
      >
        {(["confirmed", "proposed"] as const).map((option) => (
          <option key={option} value={option}>
            {UI_TEXT.requirementStatus[option]}
          </option>
        ))}
      </select>
      {scope && onScope && (
        <>
          <label htmlFor={`field-${id}-scope`}>{`${id} scope`}</label>
          <select
            id={`field-${id}-scope`}
            value={scope}
            onChange={(event) => onScope(event.target.value as CriterionScope)}
          >
            {(["project", "requirement"] as const).map((option) => (
              <option key={option} value={option}>
                {UI_TEXT.criterionScope[option]}
              </option>
            ))}
          </select>
          {scope === "requirement" &&
            functionalRequirements.map((requirement) => (
              <label key={requirement.id}>
                <input
                  type="checkbox"
                  checked={requirementIds.includes(requirement.id)}
                  onChange={(event) => onLink?.(requirement.id, event.target.checked)}
                />{" "}
                {`${id} applies to ${requirement.id}`}
              </label>
            ))}
        </>
      )}
      {error && (
        <span id={errorId} className="error">
          {error.message}
        </span>
      )}
      <button type="button" className="secondary" onClick={onRemove}>
        {UI_TEXT.buttons.removeItem(id)}
      </button>
    </div>
  );
}
