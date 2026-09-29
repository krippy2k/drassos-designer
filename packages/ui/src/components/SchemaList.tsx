import { useState, type ReactNode } from "react";
import type { ValueSchema, ValueSchemaFormat } from "@drassos/designer-model";

const FORMATS: ValueSchemaFormat[] = ["email", "url", "uuid", "cuid", "cuid2", "ulid", "nanoid", "datetime", "date", "time", "duration", "ip", "base64", "emoji"];
const TYPES = ["string", "number", "integer", "bigint", "boolean", "date", "enum", "literal", "array", "object", "record", "union", "any", "unknown", "null", "nan", "undefined", "void", "never"];

export function SchemaList(props: {
  title: string;
  fields: Record<string, ValueSchema>;
  onChange: (name: string, schema: ValueSchema | null, previousName?: string) => void;
}) {
  const [draft, setDraft] = useState<{ mode: "add" | "edit"; name: string; originalName: string; schema: ValueSchema } | null>(null);
  const singular = props.title.toLowerCase().replace(/s$/, "");
  return (
    <div>
      <h3>{props.title}</h3>
      <ul>
        {Object.entries(props.fields).map(([name, schema]) => (
          <li key={name}>
            {name} {schema.type ?? "string"}
            <button type="button" aria-label={`Edit ${name}`} onClick={() => setDraft({ mode: "edit", name, originalName: name, schema: structuredClone(schema) })}>
              Edit
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => setDraft({ mode: "add", name: "", originalName: "", schema: { type: "string", required: true } })}>
        Add {singular}
      </button>
      {draft ? (
        <div className="dialog schema-dialog" role="dialog" aria-label={draft.mode === "add" ? `Add ${singular}` : `Edit ${draft.name}`}>
          <h2>{draft.mode === "add" ? `Add ${singular}` : `Edit ${singular}`}</h2>
          <label>
            Name
            <input aria-label="Field name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <SchemaEditor name={draft.name || "field"} schema={draft.schema} onChange={(schema) => setDraft({ ...draft, schema })} showLegend={false} />
          <div>
            {draft.mode === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  props.onChange(draft.originalName, null);
                  setDraft(null);
                }}
              >
                Remove
              </button>
            ) : null}
            <button type="button" onClick={() => setDraft(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const name = draft.name.trim();
                if (!name) {
                  return;
                }
                if (draft.mode === "edit") {
                  props.onChange(name, draft.schema, draft.originalName);
                } else {
                  props.onChange(name, draft.schema);
                }
                setDraft(null);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SchemaEditor(props: {
  name: string;
  schema: ValueSchema;
  onChange: (schema: ValueSchema) => void;
  onRemove?: () => void;
  showLegend?: boolean;
}) {
  const schema = props.schema;
  const type = schema.type ?? "string";
  return (
    <fieldset>
      {props.showLegend === false ? null : <legend>{props.name}</legend>}
      <label>
        Type
        <select aria-label={`${props.name} type`} value={type} onChange={(event) => props.onChange(withType(schema, event.target.value))}>
          {TYPES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Description
        <input aria-label={`${props.name} description`} value={schema.description ?? ""} onChange={(event) => props.onChange(assign(schema, "description", event.target.value || undefined))} />
      </label>
      <label>
        <input aria-label={`${props.name} required`} type="checkbox" checked={schema.required !== false} onChange={(event) => props.onChange({ ...schema, required: event.target.checked })} />
        Required
      </label>
      <label>
        <input aria-label={`${props.name} nullable`} type="checkbox" checked={schema.nullable === true} onChange={(event) => props.onChange(assign(schema, "nullable", event.target.checked || undefined))} />
        Nullable
      </label>
      <label>
        <input aria-label={`${props.name} private`} type="checkbox" checked={schema.private === true} onChange={(event) => props.onChange(assign(schema, "private", event.target.checked || undefined))} />
        Private
      </label>
      <label>
        Default
        <input aria-label={`${props.name} default`} value={schema.default === undefined ? "" : JSON.stringify(schema.default)} onChange={(event) => props.onChange(withDefault(schema, event.target.value))} />
      </label>
      {hasAdvanced(type) ? (
        <Advanced>
          <Constraints name={props.name} schema={schema} onChange={props.onChange} />
        </Advanced>
      ) : null}
      {props.onRemove ? (
        <button type="button" onClick={props.onRemove}>Remove</button>
      ) : null}
    </fieldset>
  );
}

function hasAdvanced(type: string): boolean {
  return ["string", "number", "integer", "bigint", "date", "enum", "literal", "array", "object", "record", "union"].includes(type);
}

function Advanced(props: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details open={open}>
      <summary onClick={(event) => {
        event.preventDefault();
        setOpen((value) => !value);
      }}>Advanced Options</summary>
      {open ? props.children : null}
    </details>
  );
}

function Constraints(props: { name: string; schema: ValueSchema; onChange: (schema: ValueSchema) => void }) {
  const { name, schema, onChange } = props;
  const type = schema.type ?? "string";
  if (type === "string") {
    return (
      <>
        <NumberField name={name} label="minimum length" field="min" schema={schema} onChange={onChange} />
        <NumberField name={name} label="maximum length" field="max" schema={schema} onChange={onChange} />
        <NumberField name={name} label="length" field="length" schema={schema} onChange={onChange} />
        <TextField name={name} label="pattern" field="regex" schema={schema} onChange={onChange} />
        <TextField name={name} label="starts with" field="startsWith" schema={schema} onChange={onChange} />
        <TextField name={name} label="ends with" field="endsWith" schema={schema} onChange={onChange} />
        <TextField name={name} label="includes" field="includes" schema={schema} onChange={onChange} />
        <label>
          Format
          <select aria-label={`${name} format`} value={schema.format ?? ""} onChange={(event) => onChange(assign(schema, "format", event.target.value || undefined))}>
            <option value="">none</option>
            {FORMATS.map((format) => (
              <option key={format} value={format}>{format}</option>
            ))}
          </select>
        </label>
        <Check name={name} label="trim" field="trim" schema={schema} onChange={onChange} />
        <Check name={name} label="lowercase" field="toLowerCase" schema={schema} onChange={onChange} />
        <Check name={name} label="uppercase" field="toUpperCase" schema={schema} onChange={onChange} />
      </>
    );
  }
  if (type === "number" || type === "integer" || type === "bigint") {
    return (
      <>
        <NumberField name={name} label="minimum" field="min" schema={schema} onChange={onChange} />
        <NumberField name={name} label="maximum" field="max" schema={schema} onChange={onChange} />
        <NumberField name={name} label="greater than" field="gt" schema={schema} onChange={onChange} />
        <NumberField name={name} label="less than" field="lt" schema={schema} onChange={onChange} />
        <NumberField name={name} label="multiple of" field="multipleOf" schema={schema} onChange={onChange} />
        {type === "number" ? <Check name={name} label="integer" field="integer" schema={schema} onChange={onChange} /> : null}
        <Check name={name} label="positive" field="positive" schema={schema} onChange={onChange} />
        <Check name={name} label="negative" field="negative" schema={schema} onChange={onChange} />
        <Check name={name} label="nonnegative" field="nonnegative" schema={schema} onChange={onChange} />
        <Check name={name} label="nonpositive" field="nonpositive" schema={schema} onChange={onChange} />
        {type !== "bigint" ? <Check name={name} label="finite" field="finite" schema={schema} onChange={onChange} /> : null}
        {type !== "bigint" ? <Check name={name} label="safe integer" field="safe" schema={schema} onChange={onChange} /> : null}
      </>
    );
  }
  if (type === "date") {
    return (
      <>
        <TextField name={name} label="minimum date" field="minDate" schema={schema} onChange={onChange} />
        <TextField name={name} label="maximum date" field="maxDate" schema={schema} onChange={onChange} />
      </>
    );
  }
  if (type === "enum") {
    return (
      <label>
        Values
        <input
          aria-label={`${name} values`}
          value={(schema.values ?? []).join(", ")}
          onChange={(event) => onChange({ ...schema, values: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}
        />
      </label>
    );
  }
  if (type === "literal") {
    return (
      <label>
        Literal
        <input aria-label={`${name} literal`} value={schema.literal === undefined ? "" : JSON.stringify(schema.literal)} onChange={(event) => onChange(withLiteral(schema, event.target.value))} />
      </label>
    );
  }
  if (type === "array") {
    return (
      <>
        <NumberField name={name} label="minimum length" field="min" schema={schema} onChange={onChange} />
        <NumberField name={name} label="maximum length" field="max" schema={schema} onChange={onChange} />
        <NumberField name={name} label="length" field="length" schema={schema} onChange={onChange} />
        <SchemaEditor name={`${name} item`} schema={schema.items ?? { type: "string", required: true }} onChange={(items) => onChange({ ...schema, items })} />
      </>
    );
  }
  if (type === "object") {
    return (
      <SchemaList
        title={`${name} properties`}
        fields={schema.properties ?? {}}
        onChange={(field, next, previousName) => onChange({ ...schema, properties: writeField(schema.properties, field, next, previousName) })}
      />
    );
  }
  if (type === "record") {
    return <SchemaEditor name={`${name} value`} schema={schema.items ?? { type: "string", required: true }} onChange={(items) => onChange({ ...schema, items })} />;
  }
  if (type === "union") {
    const options = schema.options ?? [];
    return (
      <div>
        {options.map((option, index) => (
          <SchemaEditor
            key={`${option.type ?? "option"}-${index}`}
            name={`${name} option ${index + 1}`}
            schema={option}
            onChange={(next) => onChange({ ...schema, options: options.map((item, itemIndex) => itemIndex === index ? next : item) })}
            onRemove={() => onChange({ ...schema, options: options.filter((_, itemIndex) => itemIndex !== index) })}
          />
        ))}
        <button type="button" onClick={() => onChange({ ...schema, options: [...options, { type: "string", required: true }] })}>
          Add {name} option
        </button>
      </div>
    );
  }
  return null;
}

function NumberField(props: {
  name: string;
  label: string;
  field: "min" | "max" | "gt" | "lt" | "length" | "multipleOf";
  schema: ValueSchema;
  onChange: (schema: ValueSchema) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        aria-label={`${props.name} ${props.label}`}
        value={props.schema[props.field] ?? ""}
        onChange={(event) => {
          const next = { ...props.schema };
          if (event.target.value === "") {
            delete next[props.field];
          } else {
            next[props.field] = Number(event.target.value);
          }
          props.onChange(next);
        }}
      />
    </label>
  );
}

function TextField(props: {
  name: string;
  label: string;
  field: "regex" | "startsWith" | "endsWith" | "includes" | "minDate" | "maxDate";
  schema: ValueSchema;
  onChange: (schema: ValueSchema) => void;
}) {
  return (
    <label>
      {props.label}
      <input
        aria-label={`${props.name} ${props.label}`}
        value={props.schema[props.field] ?? ""}
        onChange={(event) => props.onChange(assign(props.schema, props.field, event.target.value || undefined))}
      />
    </label>
  );
}

function Check(props: {
  name: string;
  label: string;
  field: "trim" | "toLowerCase" | "toUpperCase" | "integer" | "positive" | "negative" | "nonnegative" | "nonpositive" | "finite" | "safe";
  schema: ValueSchema;
  onChange: (schema: ValueSchema) => void;
}) {
  return (
    <label>
      <input
        aria-label={`${props.name} ${props.label}`}
        type="checkbox"
        checked={props.schema[props.field] === true}
        onChange={(event) => props.onChange(assign(props.schema, props.field, event.target.checked || undefined))}
      />
      {props.label}
    </label>
  );
}

function withType(schema: ValueSchema, type: string): ValueSchema {
  return {
    type,
    description: schema.description,
    required: schema.required !== false,
    nullable: schema.nullable,
    private: schema.private,
    default: schema.default,
  };
}

function withDefault(schema: ValueSchema, text: string): ValueSchema {
  if (!text) {
    const next = { ...schema };
    delete next.default;
    return next;
  }
  try {
    return { ...schema, default: JSON.parse(text) };
  } catch {
    return { ...schema, default: text };
  }
}

function withLiteral(schema: ValueSchema, text: string): ValueSchema {
  if (!text) {
    const next = { ...schema };
    delete next.literal;
    return next;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
      return { ...schema, literal: parsed };
    }
  } catch {
    return { ...schema, literal: text };
  }
  return { ...schema, literal: text };
}

function assign<K extends keyof ValueSchema>(schema: ValueSchema, key: K, value: ValueSchema[K] | undefined): ValueSchema {
  const next = { ...schema };
  if (value === undefined || value === "") {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
}

function writeField(fields: Record<string, ValueSchema> | undefined, name: string, schema: ValueSchema | null, previousName?: string): Record<string, ValueSchema> {
  const next = { ...(fields ?? {}) };
  if (previousName && previousName !== name) {
    delete next[previousName];
  }
  if (schema) {
    next[name] = schema;
  } else {
    delete next[name];
  }
  return next;
}
