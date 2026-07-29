import { createFileRoute, Link } from "@tanstack/react-router";

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
          Gere grupos de carteiras e carteiras. Fundações prontas para evolução SaaS.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Entrar
          </Link>
          <Link
            to="/app"
            className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Abrir aplicação
          </Link>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Camadas</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li><code>src/domain</code> — tipos partilhados (modelo de negócio)</li>
          <li><code>src/services</code> — lógica financeira pura, sem I/O</li>
          <li><code>src/repositories</code> — única fronteira com a base de dados</li>
          <li><code>src/routes</code> — apresentação</li>
        </ul>
      </section>
    </main>
  );
}
