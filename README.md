# InvestWise Architecture

Quero construir uma aplicação web de gestão patrimonial e análise de investimentos.




Inicialmente será utilizada apenas por mim, mas toda a arquitetura deve ser desenhada para permitir futura comercialização como produto SaaS.




Antes de criar qualquer interface, quero definir a arquitetura da aplicação.




Requisitos fundamentais:




- Separar completamente a lógica financeira da interface.

- Separar camada de dados, camada de negócio e camada de apresentação.

- Pensar a aplicação para suportar múltiplos utilizadores.

- Um utilizador pode possuir várias carteiras.

- Uma carteira pode possuir vários ativos.

- Uma carteira pode possuir passivos.

- Toda a lógica financeira deve existir em serviços independentes.




A aplicação deverá suportar:




ATIVOS

- ETF

- Ações

- Fundos de Investimento

- Seguros de Capitalização

- PPR

- Obrigações

- Liquidez

- Criptoativos

- Imobiliário




PASSIVOS

- Crédito Habitação

- Crédito Automóvel

- Crédito Pessoal

- Outros Passivos




Não criar dashboards.

Não criar gráficos.

Não criar páginas complexas.




Quero apenas:




- modelos de dados

- arquitetura da aplicação

- estrutura das entidades

- relações entre entidades




e ligação ao Supabase.

Nome do projeto deverá ser IvestWise

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ebb30265-c485-49c3-b2a6-7d2f59e13d25).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
