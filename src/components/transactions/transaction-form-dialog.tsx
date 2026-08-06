import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { AssetType, Transaction, TransactionType } from "@/domain/types";
import {
  derivedUnitPrice,
  effectiveUnitPrice,
  getTransactionOption,
  getTransactionProfile,
  getTransactionTypeOptions,
  getTransactionTypes,
  usesQuantity as usesQuantityFor,
  validateTransactionForm,
  type TransactionFormValues,
} from "@/domain/transaction-profiles";
import type { TransactionWriteInput } from "@/repositories/transactions";
import { availableQuantityAt } from "@/services/position-engine";
import { EMPTY_RATE_TABLE, rateAt, type FxRateTable } from "@/services/fx";
import { readSettlement, withSettlement } from "@/services/settlement";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatQuantity, formatUnitPrice } from "@/lib/number-format";

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
    amount: String(tx.amount ?? ""),
    currency: tx.currency || currency,
    fees: tx.fees ? String(tx.fees) : "",
    taxes: tx.taxes ? String(tx.taxes) : "",
    notes: tx.notes ?? "",
  };
}

export function TransactionFormDialog({
  title,
  assetType,
  currency,
  transaction,
  transactions = [],
  unitBased = false,
  reportingCurrency,
  fxTable = EMPTY_RATE_TABLE,
  onSubmit,
  loading,
}: {
  title: string;
  assetType: AssetType;
  currency: string;
  transaction?: Transaction;
  /** Histórico completo do ativo, para validar alienações à data. */
  transactions?: Transaction[];
  /** Produto baseado em Unidades de Participação (Unit Linked). */
  unitBased?: boolean;
  /** Moeda base da carteira; ativa o campo de montante liquidado quando difere. */
  reportingCurrency?: string | null;
  /** Catálogo de taxas já carregado pela secção (sem fetch adicional). */
  fxTable?: FxRateTable;
  onSubmit: (input: TransactionWriteInput) => void;
  loading: boolean;
}) {
  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialValues(assetType, currency, transaction),
  );
  const set = (key: keyof TransactionFormValues, value: string) =>
    setValues((p) => ({ ...p, [key]: value }));

  const reporting = (reportingCurrency ?? "").toUpperCase();
  const existingSettlement = readSettlement(transaction?.metadata, reporting);
  const [settlementOn, setSettlementOn] = useState(!!existingSettlement);
  const [settlementAmount, setSettlementAmount] = useState(
    existingSettlement ? String(existingSettlement.amount) : "",
  );

  const profile = getTransactionProfile(values.type);
  const option = getTransactionOption(assetType, values.type);
  const ctx = useMemo(() => ({ unitBased }), [unitBased]);
  const withQuantity = usesQuantityFor(assetType, values.type, ctx);
  const options = getTransactionTypeOptions(assetType);

  const changeType = (next: TransactionType) => {
    setValues((p) => ({
      ...p,
      type: next,
      quantity: usesQuantityFor(assetType, next, ctx) ? p.quantity : "",
    }));
  };

  const qty = Number(values.quantity);
  const amount = Number(values.amount);
  const fees = values.fees === "" ? 0 : Number(values.fees);
  const taxes = values.taxes === "" ? 0 : Number(values.taxes);
  /** Posição disponível à data escolhida, excluindo a transação em edição. */
  const available = useMemo(() => {
    if (!values.occurredAt) return null;
    const history = transactions.filter((t) => t.id !== transaction?.id);
    return availableQuantityAt(
      assetType,
      history,
      new Date(values.occurredAt).toISOString(),
      ctx,
    );
  }, [transactions, transaction?.id, assetType, values.occurredAt, ctx]);

  const isDisposal = profile.direction === "out";
  const showUnitPrice = withQuantity && qty > 0 && Number.isFinite(amount) && amount > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateTransactionForm(assetType, values, {
      ...ctx,
      availableQuantity: available ?? undefined,
    });
    if (!result.ok) return toast.error(result.message);

    const quantity = withQuantity ? qty : 0;
    onSubmit({
      type: values.type,
      occurredAt: new Date(values.occurredAt).toISOString(),
      quantity,
      // Preço unitário é sempre derivado — nunca introduzido pelo utilizador.
      unitPrice: withQuantity ? derivedUnitPrice(amount, quantity) : 0,
      amount,
      currency: values.currency,
      fees,
      taxes,
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
      metadata: {
        ...(transaction?.metadata ?? {}),
        ...(option?.incomeKind ? { incomeKind: option.incomeKind } : {}),
      },
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          As transações são a fonte de verdade do histórico financeiro do ativo. A posição
          (quantidade, custo médio) é derivada — nunca introduzida manualmente.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="t-type">Tipo *</Label>
          <Select value={values.type} onValueChange={(v) => changeType(v as TransactionType)}>
            <SelectTrigger id="t-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {option?.help && <p className="text-xs text-muted-foreground">{option.help}</p>}
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

        <div className="grid gap-3 sm:grid-cols-2">
          {withQuantity && (
            <div className="space-y-2">
              <Label htmlFor="t-qty">Quantidade *</Label>
              <Input
                id="t-qty"
                type="number"
                step="any"
                min={0}
                value={values.quantity}
                onChange={(e) => set("quantity", e.target.value)}
              />
              {isDisposal && available != null && (
                <p className="text-xs text-muted-foreground">
                  Disponível nesta data: {formatQuantity(available)}
                </p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="t-amount">Montante total *</Label>
            <Input
              id="t-amount"
              type="number"
              step="any"
              min={0}
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-currency">Moeda *</Label>
            <Input
              id="t-currency"
              maxLength={3}
              value={values.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="t-fees">Comissões</Label>
            <Input
              id="t-fees"
              type="number"
              step="any"
              min={0}
              value={values.fees}
              onChange={(e) => set("fees", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="t-taxes">Impostos</Label>
            <Input
              id="t-taxes"
              type="number"
              step="any"
              min={0}
              value={values.taxes}
              onChange={(e) => set("taxes", e.target.value)}
            />
          </div>
        </div>

        {showUnitPrice && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Preço unitário derivado:{" "}
            <span className="font-medium text-foreground">
              {formatUnitPrice(derivedUnitPrice(amount, qty), values.currency)}
            </span>
            {(fees > 0 || taxes > 0) && (
              <>
                {" "}
                · efetivo (com custos):{" "}
                <span className="font-medium text-foreground">
                  {formatUnitPrice(effectiveUnitPrice(profile.direction, amount, qty, fees, taxes))}{" "}
                  {values.currency}
                </span>
              </>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="t-notes">Notas</Label>
          <Textarea
            id="t-notes"
            maxLength={1000}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button type="submit" disabled={loading}>
            {loading ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
