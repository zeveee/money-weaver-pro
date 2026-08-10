import { useMemo, useState, type ReactNode } from "react";
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
import { convertEntry, readEntry, withEntry } from "@/services/transaction-entry";
import { useFxTable } from "@/hooks/use-fx-table";
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
import { formatDateLabel } from "@/lib/date-format";
import { formatCurrency, formatQuantity, formatUnitPrice } from "@/lib/number-format";

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Moedas oferecidas: a do ativo, a da carteira e as principais do BCE. */
const COMMON_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "BRL"];

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
  // Em edição mostra-se o que o utilizador introduziu (moeda original), não o
  // facto já convertido para a moeda nativa do ativo.
  const entry = readEntry(tx.metadata);
  return {
    type: tx.type,
    occurredAt: toLocalInput(tx.occurredAt),
    quantity: tx.quantity ? String(tx.quantity) : "",
    amount: String((entry ? entry.amount : tx.amount) ?? ""),
    currency: entry?.currency || tx.currency || currency,
    fees: (entry ? entry.fees : tx.fees) ? String(entry ? entry.fees : tx.fees) : "",
    taxes: (entry ? entry.taxes : tx.taxes) ? String(entry ? entry.taxes : tx.taxes) : "",
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
  header,
}: {
  title: string;
  assetType: AssetType;
  /** Moeda nativa do ativo — moeda em que o facto é registado. */
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
  /** Slot opcional acima do título (ex.: "‹ Trocar ativo"). Puramente visual. */
  header?: ReactNode;
}) {
  const [values, setValues] = useState<TransactionFormValues>(() =>
    initialValues(assetType, currency, transaction),
  );
  const set = (key: keyof TransactionFormValues, value: string) =>
    setValues((p) => ({ ...p, [key]: value }));

  const native = (currency || "").toUpperCase();
  const reporting = (reportingCurrency ?? "").toUpperCase();
  const entryCurrency = (values.currency || "").toUpperCase();
  const needsConversion = !!entryCurrency && entryCurrency !== native;

  // Catálogo próprio do formulário: a moeda de introdução pode não ser nenhuma
  // das que a secção carregou.
  const { table: ownTable } = useFxTable([native, reporting, entryCurrency]);
  const table = ownTable.pairs.size > 0 ? ownTable : fxTable;

  const frozenEntry = readEntry(transaction?.metadata);
  const [manualRate, setManualRate] = useState("");

  const existingSettlement = readSettlement(transaction?.metadata, reporting);
  const [settlementOn, setSettlementOn] = useState(
    !!existingSettlement && (frozenEntry?.currency ?? native) !== reporting,
  );
  const [settlementAmount, setSettlementAmount] = useState(
    existingSettlement ? String(existingSettlement.amount) : "",
  );

  const profile = getTransactionProfile(values.type);
  const option = getTransactionOption(assetType, values.type);
  const ctx = useMemo(() => ({ unitBased }), [unitBased]);
  const withQuantity = usesQuantityFor(assetType, values.type, ctx);
  const options = getTransactionTypeOptions(assetType);

  const currencyOptions = useMemo(
    () =>
      [...new Set([native, reporting, ...COMMON_CURRENCIES, entryCurrency].filter(Boolean))].sort(),
    [native, reporting, entryCurrency],
  );

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

  // ---- Conversão para a moeda nativa do ativo (congelada na gravação) ----
  const conversion = useMemo(() => {
    if (!values.occurredAt || !entryCurrency) return null;
    return convertEntry(
      table,
      {
        amount: Number.isFinite(amount) ? amount : 0,
        currency: entryCurrency,
        fees,
        taxes,
        occurredAt: new Date(values.occurredAt).toISOString(),
      },
      native,
      { frozen: frozenEntry, manualRate: manualRate === "" ? null : Number(manualRate) },
    );
  }, [
    table,
    amount,
    entryCurrency,
    fees,
    taxes,
    values.occurredAt,
    native,
    frozenEntry,
    manualRate,
  ]);

  const converted = conversion?.status === "ok" ? conversion : null;
  const missingRate = needsConversion && conversion?.status === "missing";
  const nativeAmount = converted ? converted.native.amount : Number.isFinite(amount) ? amount : 0;
  const nativeFees = converted ? converted.native.fees : fees;
  const nativeTaxes = converted ? converted.native.taxes : taxes;

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
  const showUnitPrice = withQuantity && qty > 0 && nativeAmount > 0;

  // ---- Liquidação efetiva (opcional) ----
  // Quando a introdução já é feita na moeda da carteira, o montante introduzido
  // É o valor liquidado: a liquidação passa a ser automática.
  const entryIsReporting = !!reporting && entryCurrency === reporting;
  const showSettlement = !!reporting && reporting !== native && !entryIsReporting;
  const gross = nativeAmount + nativeFees + nativeTaxes;
  const ecbResolution = useMemo(
    () =>
      showSettlement && values.occurredAt
        ? rateAt(table, native, reporting, new Date(values.occurredAt).toISOString())
        : null,
    [showSettlement, table, native, reporting, values.occurredAt],
  );
  const ecbRate = ecbResolution?.status === "ok" ? ecbResolution.rate : null;
  const ecbValue = ecbRate != null && gross > 0 ? gross * ecbRate : null;
  const settledNumber = settlementAmount === "" ? NaN : Number(settlementAmount);
  const settledRate =
    Number.isFinite(settledNumber) && settledNumber > 0 && gross > 0
      ? settledNumber / gross
      : null;
  const deviation =
    settledRate != null && ecbRate ? (settledRate / ecbRate - 1) * 100 : null;

  const toggleSettlement = (on: boolean) => {
    setSettlementOn(on);
    if (on && settlementAmount === "" && ecbValue != null) {
      setSettlementAmount(String(Number(ecbValue.toFixed(2))));
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = validateTransactionForm(assetType, values, {
      ...ctx,
      availableQuantity: available ?? undefined,
    });
    if (!result.ok) return toast.error(result.message);

    if (!converted) {
      return toast.error(
        `Sem taxa ${entryCurrency}/${native} para esta data. Indique uma taxa manual.`,
      );
    }

    let settlement: { amount: number; currency: string } | null = null;
    if (entryIsReporting) {
      // A introdução foi feita na moeda da carteira: é esse o valor movimentado.
      const grossEntryAmount = (Number.isFinite(amount) ? amount : 0) + fees + taxes;
      if (grossEntryAmount > 0) settlement = { amount: grossEntryAmount, currency: reporting };
    } else if (showSettlement && settlementOn) {
      if (!Number.isFinite(settledNumber) || settledNumber <= 0) {
        return toast.error(`Indique o montante liquidado em ${reporting}.`);
      }
      settlement = { amount: settledNumber, currency: reporting };
    }

    const quantity = withQuantity ? qty : 0;
    const baseMetadata = {
      ...(transaction?.metadata ?? {}),
      ...(option?.incomeKind ? { incomeKind: option.incomeKind } : {}),
    };

    onSubmit({
      type: values.type,
      occurredAt: new Date(values.occurredAt).toISOString(),
      quantity,
      // Preço unitário é sempre derivado — nunca introduzido pelo utilizador.
      unitPrice: withQuantity ? derivedUnitPrice(converted.native.amount, quantity) : 0,
      amount: converted.native.amount,
      currency: native,
      fees: converted.native.fees,
      taxes: converted.native.taxes,
      notes: values.notes.trim() === "" ? null : values.notes.trim(),
      metadata: withSettlement(withEntry(baseMetadata, converted.entry), settlement),
    });
  };

  return (
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        {header}
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
            <Label htmlFor="t-currency">Moeda da introdução *</Label>
            <Select value={entryCurrency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger id="t-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                    {c === native ? " · moeda do ativo" : c === reporting ? " · carteira" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {needsConversion && (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Conversão para {native}</p>
            {converted && converted.entry ? (
              <>
                <p className="text-sm">
                  {formatCurrency(Number.isFinite(amount) ? amount : 0, entryCurrency)} ={" "}
                  <span className="font-medium">
                    {formatCurrency(converted.native.amount, native)}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  1 {entryCurrency} = {converted.entry.rate.toPrecision(8)} {native} ·{" "}
                  {converted.entry.source === "manual"
                    ? "taxa manual"
                    : `BCE ${formatDateLabel(converted.entry.rateDate)}`}
                  {converted.entry.carriedForward && " (transportada)"}
                  {converted.frozen && " · congelada na criação"}
                  {(fees > 0 || taxes > 0) && " · custos convertidos à mesma taxa"}
                </p>
                <p className="text-xs text-muted-foreground">
                  A transação fica registada em {native}; a conversão é congelada e não é
                  recalculada por atualizações futuras das taxas.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-destructive">
                  Sem taxa {entryCurrency}/{native} para esta data.
                </p>
                <Label htmlFor="t-manual-rate" className="text-xs font-normal">
                  Taxa manual (1 {entryCurrency} = ? {native})
                </Label>
                <Input
                  id="t-manual-rate"
                  type="number"
                  step="any"
                  min={0}
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                />
              </>
            )}
          </div>
        )}

        {entryIsReporting && needsConversion && (
          <p className="text-xs text-muted-foreground">
            Introduzido na moeda da carteira: este montante é usado diretamente no reporting em{" "}
            {reporting}, sem reconversão.
          </p>
        )}

        {showSettlement && (
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="t-settlement"
                checked={settlementOn}
                onCheckedChange={(v) => toggleSettlement(v === true)}
              />
              <Label htmlFor="t-settlement" className="text-sm font-normal">
                Conheço o montante liquidado em {reporting}
              </Label>
            </div>
            {settlementOn ? (
              <>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  placeholder={ecbValue != null ? ecbValue.toFixed(2) : ""}
                />
                <p className="text-xs text-muted-foreground">
                  {settledRate != null ? (
                    <>
                      Taxa efetiva: 1 {native} = {settledRate.toPrecision(6)} {reporting}
                      {deviation != null && (
                        <>
                          {" "}
                          · {deviation >= 0 ? "+" : ""}
                          {deviation.toFixed(2)}% vs BCE
                        </>
                      )}
                    </>
                  ) : (
                    `Montante realmente debitado/creditado pela corretora, em ${reporting}.`
                  )}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Por defeito converte-se à taxa do BCE da data
                {ecbValue != null && <> (≈ {ecbValue.toFixed(2)} {reporting})</>}.
              </p>
            )}
          </div>
        )}

        {showUnitPrice && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            Preço unitário derivado:{" "}
            <span className="font-medium text-foreground">
              {formatUnitPrice(derivedUnitPrice(nativeAmount, qty), native)}
            </span>
            {(nativeFees > 0 || nativeTaxes > 0) && (
              <>
                {" "}
                · efetivo (com custos):{" "}
                <span className="font-medium text-foreground">
                  {formatUnitPrice(
                    effectiveUnitPrice(profile.direction, nativeAmount, qty, nativeFees, nativeTaxes),
                  )}{" "}
                  {native}
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
          <Button type="submit" disabled={loading || missingRate}>
            {loading ? "A guardar…" : "Guardar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
