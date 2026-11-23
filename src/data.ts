export const IDLE_COLOR = "#94a3b8";
export const PHASE_COLORS = [
  "#0f766e",
  "#2563eb",
  "#7c3aed",
  "#d97706",
  "#db2777",
  "#0891b2",
  "#65a30d",
  "#dc2626",
  "#4f46e5",
  "#ea580c",
  "#0d9488",
  "#9333ea",
  "#ca8a04",
  "#475569",
];

export type Bug = {
  id: string;
  titulo: string;
  tipo: string;
  severidade: string;
  prioridade: string;
  cliente: string;
  modulo: string;
  versao: string;
  responsavel: string;
  data_abertura: string;
  data_encerramento: string;
  /** Tempo total no board, em MINUTOS (unidade interna). */
  lead_time_min: number;
  qtd_retornos: number;
  pr: string;
  backports: string[];
  /** Minutos em cada fase (unidade interna). */
  phases: Record<string, number>;
};

/** idle = fase "ociosa" (Sem atuação). */
export type Phase = { key: string; label: string; color: string; idle?: boolean };

export type Unit = "min" | "h" | "d";
/** Dia útil de 8 h: 1 dia = 480 min. */
export const MIN_PER_DAY = 480;
export const UNIT_FACTOR: Record<Unit, number> = { min: 1, h: 60, d: MIN_PER_DAY };
export const UNIT_LABEL: Record<Unit, string> = { min: "min", h: "h", d: "d" };
export const toUnit = (min: number, unit: Unit) => min / UNIT_FACTOR[unit];
export const fromUnit = (value: number, unit: Unit) => value * UNIT_FACTOR[unit];
/** Número formatado (pt-BR) sem rótulo: minutos inteiro, horas 1 casa, dias 2 casas (<10) ou 1. */
export const fmtVal = (min: number, unit: Unit) => {
  const v = toUnit(Number.isFinite(min) ? min : 0, unit);
  const digits = unit === "min" ? 0 : unit === "h" ? 1 : Math.abs(v) < 10 ? 2 : 1;
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
export const fmtTime = (min: number, unit: Unit) => `${fmtVal(min, unit)} ${UNIT_LABEL[unit]}`;
export const UNIT_NAME: Record<Unit, string> = { min: "minutos", h: "horas", d: "dias" };

export type Meta = {
  /** Quais dimensões existem de fato no arquivo (coluna presente e com algum valor). */
  has: {
    titulo: boolean;
    tipo: boolean;
    severidade: boolean;
    prioridade: boolean;
    cliente: boolean;
    modulo: boolean;
    versao: boolean;
    responsavel: boolean;
    data_abertura: boolean;
    data_encerramento: boolean;
    qtd_retornos: boolean;
    pr: boolean;
    backports: boolean;
  };
  /** Rótulo exibido para a dimensão "modulo" (ex.: "Grupo/Time" no CSV real). */
  moduloLabel: string;
};
export type Dataset = { bugs: Bug[]; phases: Phase[]; meta: Meta };

export type Filters = {
  start: string;
  end: string;
  clients: string[];
  module: string;
  version: string;
  severity: string;
  owner: string;
  rework: string;
  search: string;
  phase: string;
};
export const emptyFilters: Filters = {
  start: "",
  end: "",
  clients: [],
  module: "",
  version: "",
  severity: "",
  owner: "",
  rework: "",
  search: "",
  phase: "",
};

const validDate = (y: number, m: number, d: number) => {
  const date = new Date(y, m - 1, d, 12);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
    ? date
    : new Date(NaN);
};

/** Aceita dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa (ano com 2 ou 4 dígitos) e ISO aaaa-mm-dd, com ou sem hora. */
export const parsePtDate = (value: string) => {
  const text = String(value ?? "").trim();
  if (!text) return new Date(NaN);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (m) return validDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:[T\s,].*)?$/.exec(text);
  if (m) return validDate(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return new Date(NaN);
};

export const formatDate = (date: Date | string) => {
  const d = typeof date === "string" ? parsePtDate(date) : date;
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

export const formatNumber = (value: number, digits = 1) =>
  (Number.isFinite(value) ? value : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/** Aceita "12,5", "12.5", "1.234,56", "1,234.56", vazio e lixo (vira 0). */
export function toNumber(value: unknown): number {
  let s = String(value ?? "").replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Decodifica o arquivo: UTF-8 (com ou sem BOM) e, se inválido, Windows-1252. */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const canon = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ALIASES: Record<string, string[]> = {
  id: ["id", "card", "id_card", "work_item", "workitem", "numero"],
  titulo: ["titulo", "title", "nome", "descricao"],
  tipo: ["tipo", "type"],
  severidade: ["severidade", "severity"],
  prioridade: ["prioridade", "priority"],
  cliente: ["cliente", "client", "customer"],
  modulo: ["modulo", "grupo_time", "grupo", "time", "equipe", "area"],
  versao: ["versao", "version"],
  responsavel: ["responsavel", "owner", "assigned_to"],
  data_abertura: ["data_abertura", "abertura", "data_criacao", "created"],
  data_encerramento: ["data_encerramento", "encerramento", "data_fechamento", "closed"],
  // "lead_time_dias" é só o id interno do campo; o valor é convertido para minutos.
  lead_time_dias: ["lead_time_dias", "lead_time"],
  qtd_retornos: ["qtd_retornos", "retornos", "retrabalho"],
  pr: ["pr", "pull_request"],
  backports: ["backports", "backport"],
};

function fieldFor(header: string): string | null {
  const c = canon(header);
  for (const [field, names] of Object.entries(ALIASES)) if (names.includes(c)) return field;
  if (c.startsWith("tempo_total") || c.startsWith("lead_time")) return "lead_time_dias";
  return null;
}

const UNIT_SUFFIX = /\(\s*(min|minutos?|h|horas?|dias?|d)\s*\)\s*$/i;
/** Fator para converter o valor da coluna em minutos, conforme o sufixo do cabeçalho. */
function headerFactor(header: string): number {
  const m = UNIT_SUFFIX.exec(header.trim());
  if (m) {
    const u = m[1].toLowerCase();
    if (u.startsWith("min")) return 1;
    if (u.startsWith("h")) return 60;
    return MIN_PER_DAY;
  }
  return MIN_PER_DAY; // dias_* e legado: dias
}

const FRIENDLY: Record<string, string> = {
  com_o_cliente: "Com o cliente",
  aguardando_merge: "Aguardando merge",
  aguardando_sp: "Aguardando SP",
  investigacao: "Investigação",
  desenvolvimento: "Desenvolvimento",
  teste_doing: "Teste (doing)",
  completed: "Completed",
  sem_atuacao: "Sem atuação",
};

const phaseBase = (raw: string) => {
  const c = canon(raw);
  return c.startsWith("dias_") ? c.slice(5) : canon(raw.replace(UNIT_SUFFIX, "")) || c;
};
const phaseLabel = (raw: string) => {
  const baseCanon = phaseBase(raw);
  if (FRIENDLY[baseCanon]) return FRIENDLY[baseCanon];
  const base = canon(raw).startsWith("dias_")
    ? baseCanon.replace(/_/g, " ")
    : raw.replace(UNIT_SUFFIX, "").trim();
  return base.replace(/^./, (letter) => letter.toUpperCase());
};

const isPhaseHeader = (header: string) => {
  const c = canon(header);
  return c.startsWith("dias_") || UNIT_SUFFIX.test(header.trim()) || c.endsWith("_dias");
};

/** Ordem das fases no fluxo do board (Awaiting for Customer primeiro; Merge/SP depois de Completed). */
const PHASE_ORDER: [RegExp, number][] = [
  [/com_o_cliente|awaiting_for_customer/, 0],
  [/triage_done/, 2],
  [/triagem|triage/, 1],
  [/investigacao|investigation/, 3],
  [/ready/, 4],
  [/desenvolvimento|develop/, 5],
  [/documentacao_doing|documentation_doing/, 6],
  [/documentacao_done|documentation_done/, 7],
  [/documentacao|documentation/, 6],
  [/teste_doing|test_doing/, 8],
  [/teste_done|test_done/, 9],
  [/teste|test/, 8],
  [/completed/, 10],
  [/aguardando_merge|awaiting_for_merge/, 11],
  [/aguardando_sp|awaiting_for_service_pack|service_pack/, 12],
  [/sem_atuacao/, 99],
];
/** Fases desconhecidas ficam no fim, na ordem do arquivo (sort estável). */
const phaseRank = (raw: string) => {
  const c = canon(raw);
  return PHASE_ORDER.find(([re]) => re.test(c))?.[1] ?? 50;
};

function detectSeparator(text: string) {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let quoted = false;
  for (const ch of first) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ";";
}

/** Parser CSV: aspas, "" escapado, quebras de linha dentro de aspas, CRLF/LF/CR, linhas vazias ignoradas. */
export function parseRecords(text: string, sep: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const endRow = () => {
    row.push(cur.trim());
    cur = "";
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cur.trim());
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cur += ch;
  }
  if (cur !== "" || row.length) endRow();
  return rows;
}

export function parseCSV(text: string): Dataset {
  const clean = text.replace(/^﻿/, "");
  if (!clean.trim()) throw new Error("O arquivo está vazio.");
  const rows = parseRecords(clean, detectSeparator(clean));
  if (!rows.length) throw new Error("O arquivo está vazio.");
  const rawHeaders = rows[0];
  const colOf: Record<string, number> = {};
  const phaseCols: { index: number; key: string; label: string; factor: number; idle: boolean }[] =
    [];
  rawHeaders.forEach((header, index) => {
    const field = fieldFor(header);
    if (field) {
      if (!(field in colOf)) colOf[field] = index;
    } else if (isPhaseHeader(header)) {
      let key = canon(header);
      while (phaseCols.some((p) => p.key === key)) key += "_";
      phaseCols.push({
        index,
        key,
        label: phaseLabel(header),
        factor: headerFactor(header),
        idle: phaseBase(header) === "sem_atuacao",
      });
    }
  });
  phaseCols.sort((a, b) => phaseRank(rawHeaders[a.index]) - phaseRank(rawHeaders[b.index]));
  if (!phaseCols.length)
    throw new Error(
      "Nenhuma coluna de fase foi encontrada (prefixo “dias_”, ou sufixo “(min)” / “(dias)” no cabeçalho).",
    );
  const phases: Phase[] = phaseCols.map((p, i) => ({
    key: p.key,
    label: p.label,
    color: p.idle ? IDLE_COLOR : PHASE_COLORS[i % PHASE_COLORS.length],
    idle: p.idle || undefined,
  }));
  const leadFactor = "lead_time_dias" in colOf ? headerFactor(rawHeaders[colOf.lead_time_dias]) : 1;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const cell = (r: string[], field: string) => (field in colOf ? (r[colOf[field]] ?? "") : "");
  const dataRows = rows.slice(1);
  if (!dataRows.length) throw new Error("O arquivo contém apenas o cabeçalho, sem bugs.");
  const bugs: Bug[] = dataRows.map((r, i) => {
    const id = cell(r, "id") || String(i + 1);
    const phaseValues = Object.fromEntries(
      phaseCols.map((p) => [p.key, round2(toNumber(r[p.index]) * p.factor)]),
    );
    const phaseSum = Object.values(phaseValues).reduce((a, b) => a + b, 0);
    const leadRaw = cell(r, "lead_time_dias");
    return {
      id,
      titulo: cell(r, "titulo") || `Card ${id}`,
      tipo: cell(r, "tipo"),
      severidade: cell(r, "severidade"),
      prioridade: cell(r, "prioridade"),
      cliente: cell(r, "cliente"),
      modulo: cell(r, "modulo"),
      versao: cell(r, "versao"),
      responsavel: cell(r, "responsavel"),
      data_abertura: cell(r, "data_abertura"),
      data_encerramento: cell(r, "data_encerramento"),
      lead_time_min: leadRaw.trim() ? round2(toNumber(leadRaw) * leadFactor) : round2(phaseSum),
      qtd_retornos: toNumber(cell(r, "qtd_retornos")),
      pr: cell(r, "pr"),
      backports: cell(r, "backports")
        .split(/[,;|]/)
        .map((v) => v.trim())
        .filter(Boolean),
      phases: phaseValues,
    };
  });
  const any = (f: (b: Bug) => unknown) => bugs.some((b) => Boolean(f(b)));
  const validDateOf = (v: string) => !Number.isNaN(parsePtDate(v).getTime());
  const meta: Meta = {
    has: {
      titulo: "titulo" in colOf && any((b) => b.titulo !== `Card ${b.id}`),
      tipo: any((b) => b.tipo),
      severidade: any((b) => b.severidade),
      prioridade: any((b) => b.prioridade),
      cliente: any((b) => b.cliente),
      modulo: any((b) => b.modulo),
      versao: any((b) => b.versao),
      responsavel: any((b) => b.responsavel),
      data_abertura: any((b) => validDateOf(b.data_abertura)),
      data_encerramento: any((b) => validDateOf(b.data_encerramento)),
      qtd_retornos: "qtd_retornos" in colOf,
      pr: any((b) => b.pr),
      backports: any((b) => b.backports.length),
    },
    moduloLabel:
      "modulo" in colOf && /grupo|time|equipe/.test(canon(rawHeaders[colOf.modulo]))
        ? "Grupo/Time"
        : "Módulo",
  };
  return { bugs, phases, meta };
}

const inputToDate = (value: string) => (value ? new Date(`${value}T12:00:00`) : null);

export function filterBugs(bugs: Bug[], filters: Filters): Bug[] {
  const start = inputToDate(filters.start),
    end = inputToDate(filters.end),
    q = filters.search.toLowerCase();
  return bugs.filter((b) => {
    if (start || end) {
      const d = parsePtDate(b.data_encerramento);
      if (Number.isNaN(d.getTime())) return false;
      if ((start && d < start) || (end && d > end)) return false;
    }
    return (
      (!filters.clients.length || filters.clients.includes(b.cliente)) &&
      (!filters.module || b.modulo === filters.module) &&
      (!filters.version || b.versao === filters.version) &&
      (!filters.severity || b.severidade === filters.severity) &&
      (!filters.owner || b.responsavel === filters.owner) &&
      (!filters.rework || (filters.rework === "sim" ? b.qtd_retornos > 0 : b.qtd_retornos === 0)) &&
      (!filters.phase || b.phases[filters.phase] > 0) &&
      (!q || `${b.id} ${b.titulo}`.toLowerCase().includes(q))
    );
  });
}

/** Filtros do período imediatamente anterior (mesma duração), ou null se não houver período. */
export function previousPeriodFilters(filters: Filters): Filters | null {
  const start = inputToDate(filters.start),
    end = inputToDate(filters.end);
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days + 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { ...filters, start: iso(prevStart), end: iso(prevEnd), phase: "", search: "" };
}

export function makeSampleData(): Dataset {
  // Mesmas fases do relatório mensal (minutos); "Sem atuação" é a fase ociosa.
  const phaseDefs = [
    { name: "Com o cliente", mod: 40, scale: 150, base: 0 },
    { name: "Aguardando merge", mod: 12, scale: 120, base: 0 },
    { name: "Aguardando SP", mod: 15, scale: 300, base: 0 },
    { name: "Investigação", mod: 20, scale: 180, base: 60 },
    { name: "Desenvolvimento", mod: 35, scale: 400, base: 480 },
    { name: "Teste (doing)", mod: 10, scale: 100, base: 30 },
    { name: "Completed", mod: 6, scale: 60, base: 0 },
    { name: "Sem atuação", mod: 25, scale: 200, base: 0 },
  ];
  const phases: Phase[] = phaseDefs.map((d, i) => {
    const idle = d.name === "Sem atuação";
    return {
      key: `${d.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[^a-z0-9]+/g, "_")}_min`,
      label: d.name,
      color: idle ? IDLE_COLOR : PHASE_COLORS[i % PHASE_COLORS.length],
      idle: idle || undefined,
    };
  });
  const clients = [
    "Hospital Santa Clara",
    "Rede Vida Saúde",
    "Clínica Aurora",
    "Hospital São Lucas",
    "Unimed Vale",
  ];
  const modules = ["Financeiro", "Faturamento", "Repasse", "Convênio", "Prontuário"];
  const versions = ["1851", "1840", "1830"];
  const severities = ["Crítica", "Alta", "Média", "Baixa"];
  const owners = ["Ana Lima", "Bruno Costa", "Carla Nunes", "Diego Alves", "Elisa Martins"];
  const subjects = [
    "Erro ao fechar conta",
    "Cálculo divergente",
    "Tela não carrega",
    "Duplicidade no lançamento",
    "Falha na autorização",
    "Inconsistência no relatório",
  ];
  const endBase = new Date();
  endBase.setHours(12, 0, 0, 0);
  const bugs: Bug[] = Array.from({ length: 60 }, (_, i) => {
    const seed = (i * 17 + 11) % 97;
    const values = phaseDefs.map(
      (d, p) => d.base + ((seed + p * 13 + i * (p + 1)) % d.mod) * d.scale,
    );
    if (i % 5 === 0) values[0] = 0;
    const lead = values.reduce((sum, value) => sum + value, 0);
    const end = new Date(endBase);
    end.setDate(end.getDate() - ((i * 7 + seed) % 90));
    const start = new Date(end);
    start.setDate(start.getDate() - Math.max(1, Math.round(lead / MIN_PER_DAY)));
    const returns = i % 4 === 0 ? 1 + (i % 3) : 0;
    return {
      id: `BUG-${String(1420 + i).padStart(4, "0")}`,
      titulo: `${subjects[i % subjects.length]} — ${modules[(i * 2) % modules.length]}`,
      tipo: i % 6 === 0 ? "Regressão" : "Defeito",
      severidade: severities[(i * 7) % severities.length],
      prioridade: ["Urgente", "Alta", "Normal"][i % 3],
      cliente: clients[(i * 3 + Math.floor(i / 7)) % clients.length],
      modulo: modules[(i * 2 + 1) % modules.length],
      versao: versions[i % versions.length],
      responsavel: owners[(i * 3) % owners.length],
      data_abertura: formatDate(start),
      data_encerramento: formatDate(end),
      lead_time_min: lead,
      qtd_retornos: returns,
      pr: `#${9200 + i}`,
      backports: i % 3 === 0 ? ["1840", "1830"].slice(0, 1 + (i % 2)) : [],
      phases: Object.fromEntries(phases.map((phase, p) => [phase.key, values[p]])),
    };
  });
  return {
    bugs,
    phases,
    meta: {
      has: {
        titulo: true,
        tipo: true,
        severidade: true,
        prioridade: true,
        cliente: true,
        modulo: true,
        versao: true,
        responsavel: true,
        data_abertura: true,
        data_encerramento: true,
        qtd_retornos: true,
        pr: true,
        backports: true,
      },
      moduloLabel: "Módulo",
    },
  };
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return sorted[lower + 1] === undefined
    ? sorted[lower]
    : sorted[lower] + fraction * (sorted[lower + 1] - sorted[lower]);
}

export function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
