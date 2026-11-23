import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  decodeCsv,
  emptyFilters,
  filterBugs,
  makeSampleData,
  mean,
  parseCSV,
  parsePtDate,
  percentile,
  previousPeriodFilters,
  toNumber,
  fmtTime,
  fmtVal,
  fromUnit,
  toUnit,
  MIN_PER_DAY,
} from "./data";

const REAL_CSV = "C:\\Users\\mjunior\\OneDrive - Bionexo S.A\\Documentos\\bugs-outubro.csv";
const hasReal = fs.existsSync(REAL_CSV);
if (!hasReal) {
  console.warn(
    `[aviso] CSV real não encontrado em ${REAL_CSV}: testes do arquivo real foram pulados.`,
  );
}

describe("parsePtDate", () => {
  it("aceita dd/mm/aaaa, ISO e variações", () => {
    const iso = (d: Date) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join("-");
    expect(iso(parsePtDate("05/10/2026"))).toBe("2026-10-5");
    expect(iso(parsePtDate("2026-10-05"))).toBe("2026-10-5");
    expect(iso(parsePtDate("2026-10-05T10:20:00Z"))).toBe("2026-10-5");
    expect(iso(parsePtDate("5-1-26"))).toBe("2026-1-5");
    expect(iso(parsePtDate("31/10/2026 14:30"))).toBe("2026-10-31");
  });
  it("datas inválidas viram NaN", () => {
    for (const v of ["", "abc", "32/01/2026", "31/02/2026", "2026-13-01"])
      expect(Number.isNaN(parsePtDate(v).getTime())).toBe(true);
  });
});

describe("toNumber", () => {
  it("trata vírgula, ponto, milhar e vazio", () => {
    expect(toNumber("48,74")).toBe(48.74);
    expect(toNumber("3.5")).toBe(3.5);
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("1,234.56")).toBe(1234.56);
    expect(toNumber("")).toBe(0);
    expect(toNumber("n/a")).toBe(0);
  });
});

describe("estatísticas", () => {
  it("média, mediana e P90", () => {
    const v = [1, 2, 3, 4, 10];
    expect(mean(v)).toBe(4);
    expect(percentile(v, 0.5)).toBe(3);
    expect(percentile(v, 0.9)).toBeCloseTo(7.6);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([5], 0.9)).toBe(5);
  });
});

describe("parseCSV (formato descrito, dados fictícios)", () => {
  const csv =
    "\uFEFFid;titulo;tipo;severidade;prioridade;cliente;modulo;versao;responsavel;data_abertura;data_encerramento;lead_time_dias;qtd_retornos;pr;backports;dias_analise;dias_dev;coluna_extra\r\n" +
    '1;"Erro; com ponto e vírgula";Defeito;Alta;Normal;Cli A;Fin;1851;Ana;01/10/2026;10/10/2026;"9,5";1;#10;"1840,1830";"2,5";7;x\r\n' +
    "\r\n" +
    '2;"Titulo ""aspas""";Defeito;Baixa;Normal;Cli B;Rep;1840;Bia;2026-10-02;2026-10-12;10.0;0;#11;;3;7\r\n' +
    ";;;;;;;;;;;;;;;;;\r\n" +
    "3;Curto\r\n";
  const ds = parseCSV(csv);
  it("lê BOM, aspas, vírgula decimal, linhas vazias e colunas extras/ausentes", () => {
    expect(ds.bugs.map((b) => b.id)).toEqual(["1", "2", "3"]);
    expect(ds.bugs[0].titulo).toBe("Erro; com ponto e vírgula");
    expect(ds.bugs[0].lead_time_min).toBe(4560);
    expect(ds.bugs[0].backports).toEqual(["1840", "1830"]);
    expect(ds.bugs[0].phases.dias_analise).toBe(1200);
    expect(ds.bugs[1].titulo).toBe('Titulo "aspas"');
    expect(ds.bugs[2].phases.dias_dev).toBe(0);
    expect(ds.phases.map((p) => p.label)).toEqual(["Analise", "Dev"]);
  });
  it("filtros de período aceitam datas BR e ISO e não perdem linhas sem filtro", () => {
    expect(filterBugs(ds.bugs, emptyFilters)).toHaveLength(3);
    expect(
      filterBugs(ds.bugs, { ...emptyFilters, start: "2026-10-11", end: "2026-10-12" }).map(
        (b) => b.id,
      ),
    ).toEqual(["2"]);
    expect(filterBugs(ds.bugs, { ...emptyFilters, end: "2026-10-10" }).map((b) => b.id)).toEqual([
      "1",
    ]);
  });
  it("separador vírgula e tab são detectados; Windows-1252 é decodificado", () => {
    expect(parseCSV('id,dias_a\n1,"2,5"\n').bugs[0].phases.dias_a).toBe(1200);
    expect(parseCSV("id\tdias_a\n1\t4\n").bugs[0].phases.dias_a).toBe(1920);
    const latin1 = Uint8Array.from([0x6d, 0xf3, 0x64, 0x75, 0x6c, 0x6f]); // "módulo"
    expect(decodeCsv(latin1.buffer)).toBe("módulo");
  });
  it("erros claros", () => {
    expect(() => parseCSV("")).toThrow(/vazio/);
    expect(() => parseCSV("id;titulo\n1;a")).toThrow(/fase/);
    expect(() => parseCSV("id;dias_a\n")).toThrow(/apenas o cabeçalho/);
  });
  it("lead time ausente cai para a soma das fases", () => {
    expect(parseCSV("id;dias_a;dias_b\n1;1,5;2").bugs[0].lead_time_min).toBe(1680);
  });
});

describe("dados de exemplo", () => {
  const ds = makeSampleData();
  it("lead time = soma das fases e filtros por período/comparação", () => {
    for (const b of ds.bugs)
      expect(
        Math.abs(b.lead_time_min - Object.values(b.phases).reduce((a, c) => a + c, 0)),
      ).toBeLessThan(0.11);
    const f = { ...emptyFilters, start: "2000-01-01", end: "2999-12-31" };
    expect(filterBugs(ds.bugs, f)).toHaveLength(ds.bugs.length);
    const prev = previousPeriodFilters({
      ...emptyFilters,
      start: "2026-10-11",
      end: "2026-10-20",
    })!;
    expect([prev.start, prev.end]).toEqual(["2026-10-01", "2026-10-10"]);
    expect(previousPeriodFilters(emptyFilters)).toBeNull();
  });
});

describe.skipIf(!hasReal)("CSV real (bugs-outubro.csv)", () => {
  const raw = hasReal ? fs.readFileSync(REAL_CSV) : Buffer.alloc(0);
  const text = decodeCsv(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
  );
  const ds = hasReal ? parseCSV(text) : (null as never);
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const cells = (l: string) => l.split(";").map((c) => c.replace(/^"|"$/g, ""));
  const num = (s: string) => Number(s.replace(",", "."));

  it("contagens batem com as linhas do arquivo", () => {
    expect(ds.bugs).toHaveLength(lines.length - 1);
    expect(new Set(ds.bugs.map((b) => b.id)).size).toBe(ds.bugs.length);
    expect(ds.phases).toHaveLength(cells(lines[0]).length - 3);
    expect(ds.phases.every((p) => !/dias/i.test(p.label))).toBe(true);
  });
  it("valores lidos == valores brutos (vírgula decimal)", () => {
    lines.slice(1).forEach((l, i) => {
      const c = cells(l);
      expect(ds.bugs[i].id).toBe(c[0]);
      expect(ds.bugs[i].modulo).toBe(c[1]);
      expect(ds.bugs[i].lead_time_min).toBeCloseTo(num(c[2]) * 480, 1);
      ds.phases.forEach((p, k) =>
        expect(ds.bugs[i].phases[p.key]).toBeCloseTo(num(c[3 + k]) * 480, 1),
      );
    });
  });
  it("detecta dimensões presentes/ausentes", () => {
    expect(ds.meta.has.modulo).toBe(true);
    expect(ds.meta.moduloLabel).toBe("Grupo/Time");
    expect(ds.meta.has.cliente).toBe(false);
    expect(ds.meta.has.data_encerramento).toBe(false);
    expect(ds.meta.has.qtd_retornos).toBe(false);
  });
  it("KPIs: média, mediana, P90 e % dentro da meta", () => {
    const leads = ds.bugs.map((b) => b.lead_time_min);
    const sorted = [...leads].sort((a, b) => a - b);
    expect(mean(leads)).toBeCloseTo(leads.reduce((a, b) => a + b, 0) / leads.length, 9);
    const mid = (sorted.length - 1) / 2;
    expect(percentile(leads, 0.5)).toBeCloseTo(
      (sorted[Math.floor(mid)] + sorted[Math.ceil(mid)]) / 2,
      9,
    );
    const p90 = percentile(leads, 0.9);
    expect(p90).toBeGreaterThanOrEqual(percentile(leads, 0.5));
    expect(p90).toBeLessThanOrEqual(sorted.at(-1)!);
    const inTarget = leads.filter((n) => n <= 10 * 480).length / leads.length;
    expect(inTarget).toBeGreaterThan(0);
    expect(inTarget).toBeLessThanOrEqual(1);
  });
  it("agregação por fase e por grupo conserva o total", () => {
    for (const p of ds.phases) {
      const all = ds.bugs.map((b) => b.phases[p.key]);
      const groups = [...new Set(ds.bugs.map((b) => b.modulo))];
      const weighted = groups.reduce((s, g) => {
        const v = ds.bugs.filter((b) => b.modulo === g).map((b) => b.phases[p.key]);
        return s + mean(v) * v.length;
      }, 0);
      expect(weighted / all.length).toBeCloseTo(mean(all), 9);
    }
  });
  it("filtros não perdem linhas", () => {
    expect(filterBugs(ds.bugs, emptyFilters)).toHaveLength(ds.bugs.length);
    const groups = [...new Set(ds.bugs.map((b) => b.modulo))];
    expect(groups.length).toBeGreaterThan(1);
    expect(
      groups.reduce((s, g) => s + filterBugs(ds.bugs, { ...emptyFilters, module: g }).length, 0),
    ).toBe(ds.bugs.length);
    const withPhase = ds.phases.map(
      (p) => filterBugs(ds.bugs, { ...emptyFilters, phase: p.key }).length,
    );
    withPhase.forEach((n, i) =>
      expect(n).toBe(ds.bugs.filter((b) => b.phases[ds.phases[i].key] > 0).length),
    );
    expect(filterBugs(ds.bugs, { ...emptyFilters, search: ds.bugs[0].id })).toHaveLength(1);
  });
  it("consistência lead time x soma das fases (informativo)", () => {
    const diffs = ds.bugs.map((b) => {
      const sum = Object.values(b.phases).reduce((a, c) => a + c, 0);
      return { id: b.id, sum, lead: b.lead_time_min };
    });
    const off = diffs.filter((d) => Math.abs(d.sum - d.lead) > Math.max(240, d.lead * 0.1));
    console.warn(
      `[info] ${off.length}/${diffs.length} cards com |soma das fases - tempo total| > max(240 min; 10%). ` +
        `Média tempo total=${mean(diffs.map((d) => d.lead)).toFixed(1)} min, média soma fases=${mean(diffs.map((d) => d.sum)).toFixed(1)} min.`,
    );
    expect(diffs.every((d) => d.lead >= 0 && d.sum >= 0)).toBe(true);
  });
});

describe("formato novo em minutos (dados fictícios)", () => {
  const header =
    '"Card";"Grupo/Time";"Tempo total no board (min)";"Com o cliente (min)";"Aguardando merge (min)";"Aguardando SP (min)";"Investigacao (min)";"Desenvolvimento (min)";"Teste doing (min)";"Completed (min)";"Sem atuacao (min)"';
  const csv =
    "\uFEFF" +
    header +
    '\r\n"1";"Time A";"1000";"100";"0";"0";"200";"300";"50";"0";"350"\r\n"2";"Time B";"480";"0";"0";"0";"0";"480";"0";"0";"0"\r\n';
  const ds = parseCSV(csv);
  it("lê fases (min) sem converter, com rótulos amigáveis e ordem do board", () => {
    expect(ds.phases.map((p) => p.label)).toEqual([
      "Com o cliente",
      "Investigação",
      "Desenvolvimento",
      "Teste (doing)",
      "Completed",
      "Aguardando merge",
      "Aguardando SP",
      "Sem atuação",
    ]);
    expect(ds.bugs[0].lead_time_min).toBe(1000);
    expect(ds.bugs[0].phases[ds.phases[2].key]).toBe(300);
  });
  it("marca Sem atuação como ociosa (cinza) e soma das fases = total", () => {
    expect(ds.phases.filter((p) => p.idle).map((p) => p.label)).toEqual(["Sem atuação"]);
    expect(ds.phases.at(-1)!.color).toBe("#94a3b8");
    for (const b of ds.bugs)
      expect(Object.values(b.phases).reduce((a, c) => a + c, 0)).toBe(b.lead_time_min);
  });
  it("sufixos (h) e (dias) são convertidos para minutos (1 dia = 480 min)", () => {
    const m = parseCSV('Card;Tempo total (h);Fase A (h);Fase B (dias)\n1;"2,5";"1,5";1').bugs[0];
    expect(m.lead_time_min).toBe(150);
    expect(Object.values(m.phases)).toEqual([90, 480]);
  });
});

describe("conversão de unidades", () => {
  it("min/h/d com dia útil de 8 h", () => {
    expect(MIN_PER_DAY).toBe(480);
    expect(toUnit(480, "d")).toBe(1);
    expect(toUnit(480, "h")).toBe(8);
    expect(toUnit(90, "h")).toBe(1.5);
    expect(fromUnit(2, "d")).toBe(960);
    expect(fromUnit(1.5, "h")).toBe(90);
  });
  it("formatação pt-BR por unidade", () => {
    expect(fmtTime(1234, "min")).toBe("1.234 min");
    expect(fmtTime(1234, "h")).toBe("20,6 h");
    expect(fmtTime(1234, "d")).toBe("2,57 d");
    expect(fmtTime(48000, "d")).toBe("100,0 d");
    expect(fmtVal(NaN, "min")).toBe("0");
  });
});

const NEW_CSV =
  process.env.ALFRED_NEW_CSV ??
  "C:/Users/mjunior/AppData/Local/Temp/claude/bdf903c2dc561d87/49bf43b7-3a93-4c0f-b2fb-d1f96119c625/scratchpad/out2/bugs-tempo-por-etapa-20261001-20261031.csv";
const hasNew = fs.existsSync(NEW_CSV);
if (!hasNew) console.warn(`[aviso] CSV novo (min) não encontrado em ${NEW_CSV}: testes pulados.`);
describe.skipIf(!hasNew)("CSV novo em minutos (arquivo real de teste)", () => {
  const buf = hasNew ? fs.readFileSync(NEW_CSV) : Buffer.alloc(0);
  const text = decodeCsv(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
  );
  const ds = hasNew ? parseCSV(text) : (null as never);
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  it("linhas, fases e rótulos", () => {
    expect(ds.bugs).toHaveLength(lines.length - 1);
    expect(ds.phases.map((p) => p.label)).toContain("Sem atuação");
    expect(ds.phases.filter((p) => p.idle)).toHaveLength(1);
    expect(ds.meta.moduloLabel).toBe("Grupo/Time");
  });
  it("soma das fases = tempo total em todos os cards", () => {
    for (const b of ds.bugs)
      expect(Object.values(b.phases).reduce((a, c) => a + c, 0)).toBeCloseTo(b.lead_time_min, 6);
  });
  it("mesmo card em min, h e d é coerente", () => {
    const b = ds.bugs[0];
    expect(toUnit(b.lead_time_min, "h") * 60).toBeCloseTo(b.lead_time_min, 9);
    expect(toUnit(b.lead_time_min, "d") * 480).toBeCloseTo(b.lead_time_min, 9);
  });
});

describe("ordem das fases (fluxo do board)", () => {
  it("ordena as colunas do CSV novo conforme o board, independente da ordem do arquivo", () => {
    const cols = [
      "Awaiting for Service Pack (dias)",
      "Completed (dias)",
      "Teste - Done (dias)",
      "Teste - Doing (dias)",
      "Documentacao - Done (dias)",
      "Documentacao - Doing (dias)",
      "Desenvolvimento (dias)",
      "Ready (dias)",
      "Investigacao (dias)",
      "Aguardando investigacao - Triage Done (dias)",
      "Triagem - Doing (dias)",
      "Awaiting for Merge (dias)",
      "Com o cliente - Awaiting for Customer (dias)",
    ];
    const csv = `Card;Grupo/Time;${cols.join(";")}\n1;A;${cols.map(() => "1").join(";")}`;
    expect(parseCSV(csv).phases.map((p) => p.label)).toEqual([
      "Com o cliente - Awaiting for Customer",
      "Triagem - Doing",
      "Aguardando investigacao - Triage Done",
      "Investigação",
      "Ready",
      "Desenvolvimento",
      "Documentacao - Doing",
      "Documentacao - Done",
      "Teste (doing)",
      "Teste - Done",
      "Completed",
      "Awaiting for Merge",
      "Awaiting for Service Pack",
    ]);
  });
});
