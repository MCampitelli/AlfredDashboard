# Alfred BI - Bugs encerrados

Dashboard de BI (React + Vite + Tailwind) que carrega um CSV no próprio navegador e mostra KPIs
(média, mediana, P90, % dentro da meta), tempo por fase, clientes, módulos/grupos, retrabalho e a
lista de bugs. Nenhum dado sai do navegador.

## Uso

```bash
pnpm install
pnpm dev        # desenvolvimento
pnpm test       # testes (vitest)
pnpm build      # typecheck + build em dist/
pnpm preview    # serve o build local
```

Abra a página e arraste o CSV (ou use "Usar dados de exemplo", que são fictícios).

## Formato do CSV

Separador `;` (também aceita `,` e tab), UTF-8 com ou sem BOM (ou Windows-1252), decimais com vírgula
ou ponto, datas `dd/mm/aaaa` ou `aaaa-mm-dd`, linhas vazias ignoradas.

Formato atual (script ado-monthly-bug-report.ps1), tudo em **minutos** inteiros:

`Card; Grupo/Time; Tempo total no board (min); Com o cliente (min); Aguardando merge (min); Aguardando SP (min); Investigacao (min); Desenvolvimento (min); Teste doing (min); Completed (min); Sem atuacao (min)`

- Cada coluna de fase vira uma fase, na ordem do arquivo. O sufixo define a unidade: `(min)` minutos, `(h)` horas,
  `(dias)` ou prefixo `dias_` (formato antigo) dias. Internamente tudo é guardado em minutos.
- "Sem atuação" (tempo ocioso: Ready, Triage Done, Test Done...) é tratada como fase ociosa (cinza) e gera os
  indicadores "% do tempo sem atuação" e "tempo com atuação"; o gargalo considera só as fases com atuação.
- Identificação: `id` ou `Card`. Lead time: `Tempo total no board` ou `lead_time_dias`; se ausente, soma das fases.
- Opcionais (telas/filtros só aparecem se existirem): `titulo`, `tipo`, `severidade`, `prioridade`, `cliente`,
  `modulo` (ou `Grupo/Time`), `versao`, `responsavel`, `data_abertura`, `data_encerramento`, `qtd_retornos`, `pr`, `backports`.

## Unidade de tempo

O seletor **Minutos | Horas | Dias** (padrão Dias, lembrado no navegador) vale para todo o app, inclusive a
meta de lead time (guardada em dias) e a exportação CSV. Conversão com dia útil de 8 h: **1 dia = 8 h = 480 min**.
Minutos sem casas; horas com 1 casa; dias com 2 casas (1 acima de 10).

Os testes lêem, se existir, o CSV real em `C:\Users\mjunior\OneDrive - Bionexo S.A\Documentos\bugs-outubro.csv`
(fora do projeto); sem o arquivo eles são pulados com aviso. CSVs são ignorados pelo git (`*.csv`).

## Deploy no GitHub Pages

1. Envie o projeto para um repositório com branch `main`.
2. Em Settings > Pages, escolha **Source: GitHub Actions**.
3. A cada push na `main`, `.github/workflows/deploy.yml` roda testes, build e publica `dist/`.

O build usa `base: "./"` (caminhos relativos), então funciona em `https://usuario.github.io/repositorio/`.
Não há roteamento (as abas são estado da página), logo recarregar não gera 404. Para outro base, use
`VITE_BASE=/caminho/ pnpm build`.
