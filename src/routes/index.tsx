import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IvestWise — Gestão patrimonial e análise de investimentos" },
      {
        name: "description",
        content:
          "IvestWise: plataforma de gestão patrimonial multi-utilizador para carteiras, ativos e passivos.",
      },
      { property: "og:title", content: "IvestWise" },
      {
        property: "og:description",
        content:
          "Gestão patrimonial e análise de investimentos, com arquitetura preparada para SaaS.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          IvestWise
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Gestão patrimonial &amp; análise de investimentos
        </h1>
        <p className="mt-4 text-muted-foreground">
          Fundações prontas. Backend, modelo de dados e camadas de arquitetura
          definidos. Interface a construir nos próximos passos.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Camadas</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li><code>src/domain</code> — tipos partilhados (modelo de negócio)</li>
          <li><code>src/services</code> — lógica financeira pura, sem I/O</li>
          <li><code>src/repositories</code> — única fronteira com a base de dados</li>
          <li><code>src/routes</code> — apresentação (a construir)</li>
        </ul>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Entidades</h2>
        <p className="text-sm text-muted-foreground">
          <strong>profiles</strong> · <strong>portfolios</strong> ·{" "}
          <strong>assets</strong> · <strong>transactions</strong> ·{" "}
          <strong>asset_valuations</strong> · <strong>liabilities</strong> ·{" "}
          <strong>liability_payments</strong> · <strong>user_roles</strong>
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Ativos suportados</h2>
        <p className="text-sm text-muted-foreground">
          ETF, Ações, Fundos, Seguros de Capitalização, PPR, Obrigações,
          Liquidez, Criptoativos, Imobiliário.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-medium">Passivos suportados</h2>
        <p className="text-sm text-muted-foreground">
          Crédito Habitação, Crédito Automóvel, Crédito Pessoal, Outros
          Passivos.
        </p>
      </section>

      <footer className="mt-12 text-xs text-muted-foreground">
        Ver <code>ARCHITECTURE.md</code> para detalhes completos do modelo,
        relações e RLS.
      </footer>
    </main>
  );
}
