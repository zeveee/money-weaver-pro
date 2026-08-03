import { useState } from "react";
import { toast } from "sonner";
import type { AssetType, Transaction, TransactionType } from "@/domain/types";
import {
  getTransactionProfile,
  getTransactionTypeOptions,
  getTransactionTypes,
  validateTransactionForm,
  type TransactionFormValues,
} from "@/domain/transaction-profiles";
import type { TransactionWriteInput } from "@/repositories/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function initialValues(
  assetType: AssetType,
  currency: string,
  tx?: Transaction,
): TransactionFormValues {
  const fallback = getTransactionTypes(assetType)[0];
  if (!tx) {
    return {
      type: fallback,
      occurredAt: toLocalInput(new Date().toISOString()),
      quantity: "",
      unitPrice: "",
      amount: "",
      currency,
      fees: "",
      taxes: "",
      notes: "",
    };
  }
  return {
    type: tx.type,
    occurredAt: toLocalInput(tx.occurredAt),
    quantity: tx.quantity ? String(tx.quantity) : "",
    unitPrice: tx.unitPrice ? String(tx.unitPrice) : "",
    amount: String(tx.amount ?? ""),
    currency: tx.currency || currency,
    fees: tx.fees ? String(tx.fees) : "",
    taxes: tx.taxes ? String(tx.taxes) : "",
    notes: tx.notes ?? "",
  };
}

export function TransactionFormDialog({
  title, assetType, currency, transaction, onSubmit, loading,
}: {
  title: string;
  assetType: AssetType;
  currency: string;
  transaction?: Transaction;
  onSubmit: (input: TransactionWriteInput) => void;
  loading: boolean;
}) {
  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialValues(assetType, currency, transaction),
  );
  const set = (key: keyof TransactionFormValues, value: string) =>
    setValues((p) => ({ ...p, [key]: value }));

  const profile = getTransactionProfile(values.type);
  const options = getTransactionTypeOptions(assetType);

  const changeType = (next: TransactionType) => {
    const nextProfile = getTransactionProfile(next);
    setValues((p) => ({
      ...p,
      type: next,
      quantity: nextProfile.usesQuantity ? p.quantity : "",
      unitPrice: nextProfile.usesQuantity ? p.unitPrice : "",
    }));
  };

  const autoAmount = () => {
    if (!profile.usesQuantity) return;
    const q = Number(values.quantity);
    const p = Number(values.unitPrice);
    if (Number.isFinite(q) && Number.isFinite(p) && q > 0 && p > 0) {
      set("amount", String(Number((q * p).toFixed(2))));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateTransactionForm(assetType, values);
    if (!result.ok) return toast.error(result.message);

    onSubmit({
      type: values.type,
      occurredAt: new Date(values.occurredAt).toISOString(),
      quantity: profile.usesQuantity ? Number(values.quantity) : 0,
      unitPrice: profile.usesQuantity ? Number(values.unitPrice) : 0,
      amount: Number(values.amount),
      currency: values.currency,
      fees: values.fees === "" ? 0 : Number(values.fees),
      taxes: values.taxes === "" ? 0 : Number(values.taxes),
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          As transações são a fonte de verdade do histórico financeiro do ativo.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="t-type">Tipo *</Label>
          <Select value={values.type} onValueChange={(v) => changeType(v as TransactionType)}>
            <SelectTrigger id="t-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-date">Data *</Label>
          <Input
            id="t-date"
            type="datetime-local"
            value={values.occurredAt}
            onChange={(e) => set("occurredAt", e.target.value)}
          />
        </div>

        {profile.usesQuantity && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="t-qty">Quantidade *</Label>
              <Input
                id="t-qty" type="number" step="any" min={0}
                value={values.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                onBlur={autoAmount}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-price">Preço unitário *</Label>
              <Input
                id="t-price" type="number" step="any" min={0}
                value={values.unitPrice}
                onChange={(e) => set("unitPrice", e.target.value)}
                onBlur={autoAmount}
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="t-amount">Montante *</Label>
            <Input
              id="t-amount" type="number" step="any" min={0}
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-currency">Moeda *</Label>
            <Input
              id="t-currency" maxLength={3} value={values.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="t-fees">Comissões</Label>
            <Input
              id="t-fees" type="number" step="any" min={0}
              value={values.fees}
              onChange={(e) => set("fees", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-taxes">Impostos</Label>
            <Input
              id="t-taxes" type="number" step="any" min={0}
              value={values.taxes}
              onChange={(e) => set("taxes", e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="t-notes">Notas</Label>
          <Textarea
            id="t-notes" maxLength={1000} value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={loading}>{loading ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
