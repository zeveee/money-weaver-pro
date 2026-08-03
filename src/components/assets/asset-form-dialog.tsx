import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Asset, AssetType } from "@/domain/types";
import {
  ASSET_TYPE_OPTIONS,
  getAssetFields,
  getAssetProfile,
  validateAssetForm,
  type AssetFieldSpec,
} from "@/domain/asset-profiles";
import type { AssetWriteInput } from "@/repositories/assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Values = Record<string, unknown>;

const getPath = (obj: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Values)[k] : undefined), obj);

const setPath = (obj: Values, path: string, value: unknown) => {
  const parts = path.split(".");
  let cur = obj;
  parts.slice(0, -1).forEach((k) => {
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Values;
  });
  cur[parts[parts.length - 1]] = value;
};

function initialValues(type: AssetType, asset?: Asset): Values {
  const v: Values = {};
  for (const f of getAssetFields(type)) {
    if (!asset) {
      v[f.key] = f.kind === "checkbox" ? false : f.key === "currency" ? "EUR" : "";
      continue;
    }
    if (f.target === "column") {
      const raw = (asset as unknown as Values)[f.key];
      v[f.key] = raw ?? (f.kind === "checkbox" ? false : "");
    } else {
      const raw = getPath(asset.metadata, f.key);
      v[f.key] = raw ?? (f.kind === "checkbox" ? false : "");
    }
  }
  return v;
}

export function AssetFormDialog({
  title, asset, onSubmit, loading,
}: {
  title: string;
  asset?: Asset;
  onSubmit: (input: AssetWriteInput) => void;
  loading: boolean;
}) {
  const [type, setType] = useState<AssetType>(asset?.type ?? "etf");
  const [values, setValues] = useState<Values>(() => initialValues(asset?.type ?? "etf", asset));

  const profile = getAssetProfile(type);
  const fields = useMemo(() => getAssetFields(type), [type]);
  const recurringOn = Boolean(values["recurring.enabled"]);

  const changeType = (next: AssetType) => {
    setType(next);
    setValues((prev) => {
      const base = initialValues(next, asset && asset.type === next ? asset : undefined);
      for (const f of getAssetFields(next)) if (prev[f.key] !== undefined) base[f.key] = prev[f.key];
      return base;
    });
  };

  const set = (key: string, value: unknown) => setValues((p) => ({ ...p, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateAssetForm(type, values);
    if (!result.ok) return toast.error(result.message);

    const metadata: Values = { ...(asset?.metadata ?? {}) };
    const input: AssetWriteInput = { type, name: "", currency: "EUR", metadata };

    for (const f of fields) {
      const raw = values[f.key];
      const empty = raw === undefined || raw === null || raw === "";
      const value = f.kind === "number" ? (empty ? null : Number(raw)) : f.kind === "checkbox" ? Boolean(raw) : empty ? null : String(raw).trim();

      if (f.target === "column") {
        if (f.key === "name") input.name = String(value ?? "");
        else if (f.key === "currency") input.currency = String(value ?? "EUR");
        else if (f.key === "ticker") input.ticker = value as string | null;
        else if (f.key === "isin") input.isin = value as string | null;
        else if (f.key === "notes") input.notes = value as string | null;
        else if (f.key === "acquiredAt") input.acquiredAt = value as string | null;
      } else if (f.key.startsWith("recurring.") && !recurringOn) {
        setPath(metadata, f.key, f.key === "recurring.enabled" ? false : null);
      } else {
        setPath(metadata, f.key, value);
      }
    }

    onSubmit(input);
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{profile.purpose}</DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="a-type">Tipo de ativo *</Label>
          <Select value={type} onValueChange={(v) => changeType(v as AssetType)}>
            <SelectTrigger id="a-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {fields.map((f) => {
          if (f.key.startsWith("recurring.") && f.key !== "recurring.enabled" && !recurringOn) return null;
          return (
            <FieldControl key={f.key} field={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          );
        })}

        <p className="text-xs text-muted-foreground">
          Quantidade, custo médio e valor atual são derivados de transações e valorações — não se introduzem aqui.
        </p>

        <DialogFooter>
          <Button type="submit" disabled={loading}>{loading ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function FieldControl({
  field, value, onChange,
}: {
  field: AssetFieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.key.replace(/\./g, "-")}`;
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.kind === "checkbox") {
    return (
      <div className="flex items-start gap-2">
        <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(c) => onChange(Boolean(c))} />
        <div className="space-y-1 leading-none">
          <Label htmlFor={id}>{field.label}</Label>
          {field.help && <p className="text-xs text-muted-foreground">{field.help}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {field.kind === "textarea" ? (
        <Textarea id={id} value={String(value ?? "")} maxLength={field.maxLength} onChange={(e) => onChange(e.target.value)} />
      ) : field.kind === "select" ? (
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger id={id}><SelectValue placeholder="Seleciona…" /></SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          maxLength={field.kind === "text" ? field.maxLength : undefined}
          min={field.min}
          max={field.max}
          step={field.step}
          onChange={(e) =>
            onChange(field.key === "currency" || field.key === "isin" ? e.target.value.toUpperCase() : e.target.value)
          }
        />
      )}
      {field.help && field.kind !== "checkbox" && <p className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  );
}
