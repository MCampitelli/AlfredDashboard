import { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  Bug,
  Dataset,
  decodeCsv,
  emptyFilters,
  Filters,
  filterBugs,
  formatDate,
  formatNumber,
  fmtTime,
  fmtVal,
  fromUnit,
  makeSampleData,
  MIN_PER_DAY,
  mean,
  Meta,
  parseCSV,
  parsePtDate,
  percentile,
  Phase,
  previousPeriodFilters,
  toUnit,
  Unit,
  UNIT_FACTOR,
  UNIT_LABEL,
  UNIT_NAME,
} from "./data";

type Tab = "Resumo" | "Fases" | "Clientes" | "Módulos e Versões" | "Retrabalho" | "Lista de Bugs";
const UnitContext = createContext<Unit>("d");
const useUnit = () => useContext(UnitContext);
const UNIT_KEY = "alfred.unit";
const loadUnit = (): Unit => {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    return v === "min" || v === "h" || v === "d" ? v : "d";
  } catch {
    return "d";
  }
};

const tabs: Tab[] = [
  "Resumo",
  "Fases",
  "Clientes",
  "Módulos e Versões",
  "Retrabalho",
  "Lista de Bugs",
];

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    upload: (
      <>
        <path d="M12 16V4m0 0-4 4m4-4 4 4" />
        <path d="M5 15v4h14v-4" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    bug: (
      <>
        <path d="M8 6h8m-7-2 1.5 2M15 4l-1.5 2M7 13h10v2a5 5 0 0 1-10 0v-5a5 5 0 0 1 10 0v5" />
        <path d="M3 13h4m10 0h4M4 8l3 2m10 0 3-2M4 19l3-2m10 0 3 2" />
      </>
    ),
    x: <path d="m6 6 12 12M18 6 6 18" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    arrow: (
      <>
        <path d="M5 12h14m-5-5 5 5-5 5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
        <path d="M5 19h14" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h10m4 0h2M4 17h2m4 0h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

const unique = (bugs: Bug[], key: keyof Bug) =>
  [...new Set(bugs.map((bug) => String(bug[key])).filter(Boolean))].sort();
const dateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const inputToDate = (value: string) => (value ? new Date(`${value}T12:00:00`) : null);

function MiniPhases({ bug, phases, height = 8 }: { bug: Bug; phases: Phase[]; height?: number }) {
  const unit = useUnit();
  const total = phases.reduce((sum, phase) => sum + bug.phases[phase.key], 0);
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
      style={{ height }}
      title={fmtTime(total, unit)}
    >
      {phases.map((phase) => (
        <span
          key={phase.key}
          title={`${phase.label}: ${fmtTime(bug.phases[phase.key], unit)}`}
          style={{
            background: phase.color,
            width: `${total ? (bug.phases[phase.key] / total) * 100 : 0}%`,
          }}
        />
      ))}
    </div>
  );
}

function MultiSelect({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <details className="relative">
      <summary className="control flex min-w-40 list-none items-center justify-between gap-2">
        <span className="max-w-32 truncate">
          {selected.length
            ? `${selected.length} selecionado${selected.length > 1 ? "s" : ""}`
            : "Todos"}
        </span>
        <Icon name="chevron" size={15} />
      </summary>
      <div className="absolute top-11 z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2 dark:bg-slate-800">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full bg-transparent text-sm"
            placeholder="Buscar cliente"
          />
        </div>
        <div className="thin-scroll max-h-52 overflow-auto">
          {values
            .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
            .map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() =>
                    onChange(
                      selected.includes(value)
                        ? selected.filter((v) => v !== value)
                        : [...selected, value],
                    )
                  }
                  className="accent-brand-600"
                />
                <span className="truncate">{value}</span>
              </label>
            ))}
        </div>
      </div>
    </details>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  delta,
  good = "down",
}: {
  label: string;
  value: string;
  suffix?: string;
  delta?: number | null;
  good?: "up" | "down";
}) {
  const positive =
    delta !== null &&
    delta !== undefined &&
    ((good === "up" && delta >= 0) || (good === "down" && delta <= 0));
  return (
    <div className="panel p-5">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold tracking-tight">
        {value}
        <span className="ml-1 text-sm font-semibold text-slate-400">{suffix}</span>
      </p>
      {delta !== null && delta !== undefined && (
        <p className={`mt-2 text-xs font-bold ${positive ? "text-emerald-600" : "text-rose-500"}`}>
          {delta > 0 ? "↑" : delta < 0 ? "↓" : "—"} {formatNumber(Math.abs(delta))}%{" "}
          <span className="font-normal text-slate-400">vs. anterior</span>
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-5 ${className}`}>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-bold">{title}</h2>
          {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <div className="grid min-h-52 place-items-center text-center">
      <div>
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          <Icon name="sliders" />
        </div>
        <p className="font-semibold">Nenhum bug encontrado</p>
        <p className="text-sm text-slate-500">Ajuste ou limpe os filtros para visualizar dados.</p>
      </div>
    </div>
  );
}

function TargetInput({
  target,
  setTarget,
  unit,
}: {
  target: number;
  setTarget: (n: number) => void;
  unit: Unit;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = String(
    Number(((target * MIN_PER_DAY) / UNIT_FACTOR[unit]).toFixed(unit === "min" ? 0 : 2)),
  );
  return (
    <label className="text-xs text-slate-500" title="Meta de lead time (guardada em dias)">
      Meta{" "}
      <input
        type="number"
        min={0}
        step="any"
        value={draft ?? shown}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (n > 0) setTarget(fromUnit(n, unit) / MIN_PER_DAY);
        }}
        onBlur={() => setDraft(null)}
        className="ml-1 w-16 rounded border border-slate-200 bg-white px-1 py-0.5 text-center dark:border-slate-700 dark:bg-slate-900"
      />{" "}
      {UNIT_LABEL[unit]}
    </label>
  );
}

function Summary({
  bugs,
  meta,
  compareBugs,
  phases,
  compare,
  target,
  setTarget,
  applyFilter,
}: {
  bugs: Bug[];
  meta: Meta;
  compareBugs: Bug[];
  phases: Phase[];
  compare: boolean;
  target: number;
  setTarget: (n: number) => void;
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  if (!bugs.length) return <EmptyChart />;
  const leads = bugs.map((b) => b.lead_time_min);
  const previous = compareBugs.map((b) => b.lead_time_min);
  const rework = (bugs.filter((b) => b.qtd_retornos > 0).length / bugs.length) * 100;
  const targetMin = target * MIN_PER_DAY;
  const inTarget = (bugs.filter((b) => b.lead_time_min <= targetMin).length / bugs.length) * 100;
  const delta = (now: number, before: number) =>
    compare ? (before ? ((now - before) / before) * 100 : 0) : null;
  const previousRework = compareBugs.length
    ? (compareBugs.filter((b) => b.qtd_retornos > 0).length / compareBugs.length) * 100
    : 0;
  const previousTarget = compareBugs.length
    ? (compareBugs.filter((b) => b.lead_time_min <= targetMin).length / compareBugs.length) * 100
    : 0;
  const phaseMeans = phases.map((p) => ({ ...p, value: mean(bugs.map((b) => b.phases[p.key])) }));
  const totalPhase = phaseMeans.reduce((s, p) => s + p.value, 0) || 1;
  const activeMeans = phaseMeans.filter((p) => !p.idle);
  const bottleneck = [...(activeMeans.length ? activeMeans : phaseMeans)].sort(
    (a, b) => b.value - a.value,
  )[0];
  const idleMean = phaseMeans.filter((p) => p.idle).reduce((s, p) => s + p.value, 0);
  const hasIdle = phases.some((p) => p.idle);
  const activeTotal = totalPhase - idleMean;
  const idlePct = (idleMean / totalPhase) * 100;
  const bottleneckBase = hasIdle ? activeTotal || 1 : totalPhase;
  const clients = (meta.has.cliente ? unique(bugs, "cliente") : [])
    .map((client) => ({
      client,
      value: mean(bugs.filter((b) => b.cliente === client).map((b) => b.lead_time_min)),
    }))
    .sort((a, b) => b.value - a.value);
  const weeks = new Map<string, number>();
  bugs.forEach((bug) => {
    const d = parsePtDate(bug.data_encerramento);
    if (Number.isNaN(d.getTime())) return;
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = dateInput(monday);
    weeks.set(key, (weeks.get(key) || 0) + 1);
  });
  const weekData = [...weeks].sort(([a], [b]) => a.localeCompare(b));
  const maxWeek = Math.max(...weekData.map(([, n]) => n), 1);
  const edgesDays = [2, 5, 10, 20].map((d) => d * MIN_PER_DAY);
  const edgeLabel = (min: number) => String(Math.round(toUnit(min, unit)));
  const bins = [
    { label: `≤ ${edgeLabel(edgesDays[0])}`, count: leads.filter((n) => n <= edgesDays[0]).length },
    ...[0, 1, 2].map((k) => ({
      label: `${edgeLabel(edgesDays[k])}–${edgeLabel(edgesDays[k + 1])}`,
      count: leads.filter((n) => n > edgesDays[k] && n <= edgesDays[k + 1]).length,
    })),
    { label: `> ${edgeLabel(edgesDays[3])}`, count: leads.filter((n) => n > edgesDays[3]).length },
  ];
  const maxBin = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div className="space-y-5 animate-enter">
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Bugs encerrados"
          value={bugs.length.toLocaleString("pt-BR")}
          delta={delta(bugs.length, compareBugs.length)}
          good="up"
        />
        <KpiCard
          label="Lead time médio"
          value={fmtVal(mean(leads), unit)}
          suffix={UNIT_LABEL[unit]}
          delta={delta(mean(leads), mean(previous))}
        />
        <KpiCard
          label="Mediana"
          value={fmtVal(percentile(leads, 0.5), unit)}
          suffix={UNIT_LABEL[unit]}
          delta={delta(percentile(leads, 0.5), percentile(previous, 0.5))}
        />
        <KpiCard
          label="P90"
          value={fmtVal(percentile(leads, 0.9), unit)}
          suffix={UNIT_LABEL[unit]}
          delta={delta(percentile(leads, 0.9), percentile(previous, 0.9))}
        />
        {meta.has.qtd_retornos && (
          <KpiCard
            label="Com retrabalho"
            value={formatNumber(rework)}
            suffix="%"
            delta={delta(rework, previousRework)}
          />
        )}
        {hasIdle && (
          <>
            <KpiCard
              label="Tempo com atuação (média)"
              value={fmtVal(activeTotal, unit)}
              suffix={UNIT_LABEL[unit]}
            />
            <KpiCard label="% do tempo sem atuação" value={formatNumber(idlePct)} suffix="%" />
          </>
        )}
        <KpiCard
          label="Dentro da meta"
          value={formatNumber(inTarget)}
          suffix="%"
          delta={delta(inTarget, previousTarget)}
          good="up"
        />
      </div>
      <div className={`grid gap-5 ${weekData.length ? "xl:grid-cols-[1.4fr_1fr]" : ""}`}>
        {weekData.length > 0 && (
          <Section
            title="Bugs encerrados por semana"
            subtitle="Clique em uma barra para definir o período"
          >
            <div className="flex h-56 items-end gap-2 border-b border-slate-200 px-2 dark:border-slate-700">
              {weekData.map(([date, count]) => (
                <button
                  key={date}
                  onClick={() => applyFilter("week", date)}
                  className="group flex h-full min-w-5 flex-1 flex-col justify-end"
                  title={`${formatDate(new Date(`${date}T12:00:00`))}: ${count} bugs`}
                >
                  <span className="mb-1 text-[10px] font-bold text-slate-500 opacity-0 group-hover:opacity-100">
                    {count}
                  </span>
                  <span
                    className="w-full rounded-t-md bg-brand-500/80 transition hover:bg-brand-600"
                    style={{ height: `${(count / maxWeek) * 82}%` }}
                  />
                  <span className="mt-2 hidden -rotate-25 text-[9px] text-slate-400 sm:block">
                    {formatDate(new Date(`${date}T12:00:00`)).slice(0, 5)}
                  </span>
                </button>
              ))}
            </div>
          </Section>
        )}
        <Section
          title="Distribuição do lead time"
          subtitle={`Quantidade de bugs por faixa (${UNIT_NAME[unit]})`}
        >
          <div className="flex h-56 items-end gap-4 border-b border-slate-200 px-3 dark:border-slate-700">
            {bins.map((bin) => (
              <div
                key={bin.label}
                className="flex h-full flex-1 flex-col justify-end text-center"
                title={`${bin.count} bugs`}
              >
                <span className="mb-1 text-xs font-bold">{bin.count}</span>
                <span
                  className="mx-auto w-full max-w-14 rounded-t-md bg-sky-500/75"
                  style={{ height: `${(bin.count / maxBin) * 75}%` }}
                />
                <span className="mt-2 text-xs text-slate-500">{bin.label}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Section
          title="Composição média do lead time"
          subtitle={`${fmtTime(totalPhase, unit)} no total`}
        >
          <PhasePie
            phases={phaseMeans}
            total={totalPhase}
            unit={unit}
            onSelect={(key) => applyFilter("phase", key)}
          />
        </Section>
        <div className="rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-50 to-cyan-50 p-5 dark:from-brand-700/20 dark:to-slate-900">
          <div className="mb-5 flex items-center justify-between">
            <span className="rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
              Insight automático
            </span>
            <TargetInput target={target} setTarget={setTarget} unit={unit} />
          </div>
          <p className="font-display text-xl font-bold leading-relaxed">
            {hasIdle ? "Maior fase com atuação: " : "A fase "}
            <span style={{ color: bottleneck.color }}>{bottleneck.label}</span>
            {hasIdle ? " " : " consome "}(
            {formatNumber((bottleneck.value / bottleneckBase) * 100, 0)}%
            {hasIdle ? " do tempo com atuação" : " do tempo"})
            {hasIdle && (
              <>
                . Sem atuação representa{" "}
                <span style={{ color: "#64748b" }}>{formatNumber(idlePct, 0)}%</span> do tempo total
              </>
            )}
            {clients[0] ? "; " : "."}
            {clients[0] && (
              <>
                <span className="text-brand-700 dark:text-brand-500">{clients[0].client}</span> tem
                o maior lead time médio.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function PhasePie({
  phases,
  total,
  unit,
  onSelect,
}: {
  phases: { key: string; label: string; color: string; value: number }[];
  total: number;
  unit: Unit;
  onSelect: (key: string) => void;
}) {
  const R = 100;
  const slices = phases.filter((p) => p.value > 0);
  if (!slices.length || total <= 0) return null;
  let angle = -Math.PI / 2;
  const arcs = slices.map((phase) => {
    const frac = phase.value / total;
    const start = angle;
    angle += frac * 2 * Math.PI;
    const mid = (start + angle) / 2;
    const point = (a: number, r = R) =>
      `${(R + r * Math.cos(a)).toFixed(2)} ${(R + r * Math.sin(a)).toFixed(2)}`;
    const d =
      frac >= 0.9999
        ? `M ${R} 0 A ${R} ${R} 0 1 1 ${R} ${2 * R} A ${R} ${R} 0 1 1 ${R} 0 Z`
        : `M ${R} ${R} L ${point(start)} A ${R} ${R} 0 ${frac > 0.5 ? 1 : 0} 1 ${point(angle)} Z`;
    const lx = R + R * 0.65 * Math.cos(mid);
    const ly = R + R * 0.65 * Math.sin(mid);
    return { phase, frac, d, lx, ly };
  });
  return (
    <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
      <svg
        viewBox={`0 0 ${2 * R} ${2 * R}`}
        className="size-64 shrink-0"
        role="img"
        aria-label="Composição média do lead time por fase"
      >
        {arcs.map(({ phase, frac, d, lx, ly }) => (
          <g key={phase.key} className="cursor-pointer" onClick={() => onSelect(phase.key)}>
            <title>{`${phase.label}: ${fmtTime(phase.value, unit)} (${formatNumber(frac * 100, 0)}%)`}</title>
            <path
              d={d}
              fill={phase.color}
              stroke="white"
              strokeWidth={1.5}
              className="transition hover:brightness-110"
            />
            {frac > 0.05 && (
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none fill-white text-[10px] font-bold"
              >
                {formatNumber(frac * 100, 0)}%
              </text>
            )}
          </g>
        ))}
      </svg>
      <ul className="grid flex-1 gap-1.5 text-sm">
        {arcs.map(({ phase, frac }) => (
          <li key={phase.key}>
            <button
              onClick={() => onSelect(phase.key)}
              className="flex w-full items-center gap-2 text-left hover:underline"
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ background: phase.color }} />
              <span className="flex-1">{phase.label}</span>
              <span className="font-semibold">{fmtTime(phase.value, unit)}</span>
              <span className="w-10 text-right text-slate-500">{formatNumber(frac * 100, 0)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PhasesView({
  bugs,
  phases,
  active,
  applyFilter,
}: {
  bugs: Bug[];
  phases: Phase[];
  active: string;
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  const [metric, setMetric] = useState<"Média" | "Mediana">("Média");
  if (!bugs.length) return <EmptyChart />;
  const data = phases.map((phase) => {
    const values = bugs.map((b) => b.phases[phase.key]);
    return {
      ...phase,
      values,
      avg: mean(values),
      median: percentile(values, 0.5),
      q1: percentile(values, 0.25),
      q3: percentile(values, 0.75),
      p90: percentile(values, 0.9),
      max: Math.max(...values),
      passed: values.filter((n) => n > 0).length,
    };
  });
  const total = data.reduce((s, p) => s + p.avg, 0) || 1;
  const bottleneck = [...(data.some((p) => !p.idle) ? data.filter((p) => !p.idle) : data)].sort(
    (a, b) => b[metric === "Média" ? "avg" : "median"] - a[metric === "Média" ? "avg" : "median"],
  )[0];
  const chartMax = Math.max(...data.map((p) => p.max), 1);
  return (
    <div className="space-y-5 animate-enter">
      <Section
        title="Dispersão por fase"
        subtitle="Quartis, mediana e amplitude; pontos representam outliers"
        action={
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(["Média", "Mediana"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold ${metric === m ? "bg-white shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
              >
                {m}
              </button>
            ))}
          </div>
        }
      >
        <div
          className="grid min-h-72 gap-3"
          style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(70px,1fr))` }}
        >
          {data.map((phase) => (
            <button
              key={phase.key}
              onClick={() => applyFilter("phase", phase.key)}
              className={`group flex flex-col items-center ${active && active !== phase.key ? "opacity-30" : ""}`}
            >
              <div className="relative h-60 w-full">
                <span
                  className="absolute left-1/2 w-px bg-slate-300 dark:bg-slate-600"
                  style={{
                    bottom: `${(phase.q1 / chartMax) * 100}%`,
                    height: `${((phase.max - phase.q1) / chartMax) * 100}%`,
                  }}
                />
                <span
                  className="absolute left-[22%] w-[56%] rounded-md border-2"
                  style={{
                    borderColor: phase.color,
                    background: `${phase.color}22`,
                    bottom: `${(phase.q1 / chartMax) * 100}%`,
                    height: `${(Math.max(phase.q3 - phase.q1, chartMax * 0.004) / chartMax) * 100}%`,
                  }}
                />
                <span
                  className="absolute left-[22%] w-[56%] border-t-2"
                  style={{
                    borderColor: phase.color,
                    bottom: `${(phase.median / chartMax) * 100}%`,
                  }}
                />
                <span
                  className="absolute left-[35%] w-[30%] border-t border-slate-400"
                  style={{ bottom: `${(phase.max / chartMax) * 100}%` }}
                />
              </div>
              <span className="mt-2 text-xs font-semibold">{phase.label}</span>
              <span className="text-[10px] text-slate-400">
                {fmtTime(metric === "Média" ? phase.avg : phase.median, unit)}
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section
        title="Indicadores por fase"
        subtitle={`Gargalo (fase com atuação): ${bottleneck.label}`}
      >
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-3">Fase</th>
                <th>Média</th>
                <th>Mediana</th>
                <th>P90</th>
                <th>Máximo</th>
                <th>% do total</th>
                <th>Bugs na fase</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr
                  key={p.key}
                  onClick={() => applyFilter("phase", p.key)}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 ${p.key === bottleneck.key ? "bg-amber-50/70 dark:bg-amber-500/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
                >
                  <td className="py-3 font-semibold">
                    <span
                      className="mr-2 inline-block size-2 rounded-full"
                      style={{ background: p.color }}
                    />
                    {p.label}
                    {p.key === bottleneck.key && (
                      <span className="ml-2 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-500/15">
                        GARGALO
                      </span>
                    )}
                  </td>
                  <td>{fmtTime(p.avg, unit)}</td>
                  <td>{fmtTime(p.median, unit)}</td>
                  <td>{fmtTime(p.p90, unit)}</td>
                  <td>{fmtTime(p.max, unit)}</td>
                  <td>{formatNumber((p.avg / total) * 100)}%</td>
                  <td>{p.passed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Heatmap({
  bugs,
  phases,
  rows,
  rowKey,
  applyFilter,
}: {
  bugs: Bug[];
  phases: Phase[];
  rows: string[];
  rowKey: "cliente" | "modulo";
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  const values = rows.flatMap((row) =>
    phases.map((p) => mean(bugs.filter((b) => b[rowKey] === row).map((b) => b.phases[p.key]))),
  );
  const max = Math.max(...values, 1);
  return (
    <div className="overflow-auto">
      <div
        className="min-w-[620px] grid gap-1 text-xs"
        style={{ gridTemplateColumns: `160px repeat(${phases.length},1fr)` }}
      >
        <span />
        {phases.map((p) => (
          <span key={p.key} className="truncate px-2 pb-2 text-center font-semibold text-slate-500">
            {p.label}
          </span>
        ))}
        {rows.map((row) => (
          <div key={row} className="contents">
            <button
              onClick={() => applyFilter(rowKey, row)}
              className="truncate py-3 pr-3 text-left font-semibold hover:text-brand-600"
            >
              {row}
            </button>
            {phases.map((p) => {
              const v = mean(bugs.filter((b) => b[rowKey] === row).map((b) => b.phases[p.key]));
              return (
                <button
                  key={p.key}
                  onClick={() => applyFilter("phase", p.key)}
                  title={`${row} · ${p.label}: ${fmtTime(v, unit)}`}
                  className="rounded-md py-3 text-center font-bold"
                  style={{
                    background: `rgba(15,118,110,${0.08 + (v / max) * 0.76})`,
                    color: v / max > 0.55 ? "white" : "inherit",
                  }}
                >
                  {fmtVal(v, unit)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientsView({
  bugs,
  phases,
  applyFilter,
}: {
  bugs: Bug[];
  phases: Phase[];
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  if (!bugs.length) return <EmptyChart />;
  const clients = unique(bugs, "cliente");
  const ranking = clients
    .map((client) => {
      const rows = bugs.filter((b) => b.cliente === client);
      return {
        client,
        rows,
        count: rows.length,
        lead: mean(rows.map((b) => b.lead_time_min)),
        critical: rows.filter((b) => ["Crítica", "Alta"].includes(b.severidade)).length,
      };
    })
    .sort((a, b) => b.lead - a.lead);
  const maxCount = Math.max(...ranking.map((r) => r.count), 1),
    maxLead = Math.max(...ranking.map((r) => r.lead), 1);
  return (
    <div className="space-y-5 animate-enter">
      <Section
        title="Ranking de clientes"
        subtitle="Composição média por fase — clique no cliente para filtrar"
      >
        <div className="space-y-4">
          {ranking.map((row, i) => (
            <button
              key={row.client}
              onClick={() => applyFilter("cliente", row.client)}
              className="grid w-full grid-cols-[26px_minmax(130px,1fr)_70px_90px_minmax(200px,2fr)] items-center gap-3 text-left text-sm"
            >
              <span className="text-slate-400">{i + 1}</span>
              <span className="truncate font-semibold hover:text-brand-600">{row.client}</span>
              <span>{row.count} bugs</span>
              <span className="font-bold">{fmtTime(row.lead, unit)}</span>
              <div className="flex h-3 overflow-hidden rounded-full">
                {phases.map((p) => {
                  const v = mean(row.rows.map((b) => b.phases[p.key]));
                  return (
                    <span
                      key={p.key}
                      style={{ background: p.color, width: `${(v / row.lead) * 100}%` }}
                      title={`${p.label}: ${fmtTime(v, unit)}`}
                    />
                  );
                })}
              </div>
            </button>
          ))}
        </div>
      </Section>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Section title="Mapa de calor cliente × fase">
          <Heatmap
            bugs={bugs}
            phases={phases}
            rows={clients}
            rowKey="cliente"
            applyFilter={applyFilter}
          />
        </Section>
        <Section
          title="Volume × lead time"
          subtitle="Tamanho da bolha: bugs de severidade crítica ou alta"
        >
          <div className="relative h-72 border-b border-l border-slate-200 dark:border-slate-700">
            {ranking.map((r) => (
              <button
                key={r.client}
                onClick={() => applyFilter("cliente", r.client)}
                title={`${r.client}: ${r.count} bugs, ${fmtTime(r.lead, unit)}`}
                className="absolute grid -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-brand-500/65 text-[9px] font-bold text-white ring-2 ring-white transition hover:bg-brand-600 dark:ring-slate-900"
                style={{
                  left: `${8 + (r.count / maxCount) * 84}%`,
                  bottom: `${(r.lead / maxLead) * 90}%`,
                  width: 24 + r.critical * 5,
                  height: 24 + r.critical * 5,
                }}
              >
                {r.critical}
              </button>
            ))}
            <span className="absolute -bottom-6 right-0 text-xs text-slate-400">Nº de bugs →</span>
            <span className="absolute -left-8 top-0 -rotate-90 text-xs text-slate-400">
              Lead time →
            </span>
          </div>
        </Section>
      </div>
    </div>
  );
}

function ModulesView({
  bugs,
  meta,
  phases,
  applyFilter,
}: {
  bugs: Bug[];
  meta: Meta;
  phases: Phase[];
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  if (!bugs.length) return <EmptyChart />;
  const modules = unique(bugs, "modulo"),
    versions = unique(bugs, "versao");
  const versionData = versions.map((v) => ({
    v,
    lead: mean(bugs.filter((b) => b.versao === v).map((b) => b.lead_time_min)),
    count: bugs.filter((b) => b.versao === v).length,
  }));
  const max = Math.max(...versionData.map((v) => v.lead), 1);
  const recurrence = (meta.has.cliente ? modules : [])
    .flatMap((m) =>
      unique(
        bugs.filter((b) => b.modulo === m),
        "cliente",
      ).map((c) => ({ m, c, count: bugs.filter((b) => b.modulo === m && b.cliente === c).length })),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return (
    <div className="space-y-5 animate-enter">
      <div className={`grid gap-5 ${meta.has.versao ? "xl:grid-cols-[1.3fr_1fr]" : ""}`}>
        <Section title={`Comparativo ${meta.moduloLabel.toLowerCase()} × fase`}>
          <Heatmap
            bugs={bugs}
            phases={phases}
            rows={modules}
            rowKey="modulo"
            applyFilter={applyFilter}
          />
        </Section>
        {meta.has.versao && (
          <Section title="Lead time por versão" subtitle={`Média em ${UNIT_NAME[unit]}`}>
            {versionData.map((row) => (
              <button
                key={row.v}
                onClick={() => applyFilter("versao", row.v)}
                className="mb-5 grid w-full grid-cols-[55px_1fr_55px] items-center gap-3 text-sm"
              >
                <span className="font-bold">{row.v}</span>
                <span
                  className="h-7 rounded-r-md bg-indigo-500/75"
                  style={{ width: `${(row.lead / max) * 100}%` }}
                />
                <span className="text-right font-semibold">{fmtTime(row.lead, unit)}</span>
              </button>
            ))}
          </Section>
        )}
      </div>
      {recurrence.length > 0 && (
        <Section
          title="Reincidência por módulo e cliente"
          subtitle="Combinações com mais bugs no período"
        >
          <div className="grid gap-x-8 md:grid-cols-2">
            {recurrence.map((r, i) => (
              <button
                key={`${r.m}${r.c}`}
                onClick={() => applyFilter("modulo", r.m)}
                className="flex items-center gap-3 border-b border-slate-100 py-3 text-left text-sm dark:border-slate-800"
              >
                <span className="w-5 text-slate-400">{i + 1}</span>
                <span className="flex-1">
                  <b>{r.m}</b>
                  <small className="block text-slate-500">{r.c}</small>
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold dark:bg-slate-800">
                  {r.count}
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function ReworkView({
  bugs,
  meta,
  applyFilter,
}: {
  bugs: Bug[];
  meta: Meta;
  applyFilter: (key: string, value: string) => void;
}) {
  const unit = useUnit();
  if (!bugs.length) return <EmptyChart />;
  const withR = bugs.filter((b) => b.qtd_retornos > 0),
    without = bugs.filter((b) => !b.qtd_retornos);
  const extra = mean(withR.map((b) => b.lead_time_min)) - mean(without.map((b) => b.lead_time_min));
  const grouped = (key: "modulo" | "cliente") =>
    unique(withR, key)
      .map((v) => ({ v, count: withR.filter((b) => b[key] === v).length }))
      .sort((a, b) => b.count - a.count);
  return (
    <div className="space-y-5 animate-enter">
      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard label="Bugs com retrabalho" value={String(withR.length)} />
        <KpiCard
          label="% do total"
          value={formatNumber((withR.length / bugs.length) * 100)}
          suffix="%"
        />
        <KpiCard
          label="Tempo médio adicional"
          value={`${extra >= 0 ? "+" : ""}${fmtVal(extra, unit)}`}
          suffix={UNIT_LABEL[unit]}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        {(["modulo", "cliente"] as const)
          .filter((key) => meta.has[key])
          .map((key) => (
            <Section
              key={key}
              title={`Retrabalho por ${key === "modulo" ? meta.moduloLabel.toLowerCase() : key}`}
            >
              <div className="space-y-3">
                {grouped(key).map((r) => (
                  <button
                    key={r.v}
                    onClick={() => applyFilter(key, r.v)}
                    className="flex w-full items-center gap-3 text-sm"
                  >
                    <span className="w-36 truncate text-left font-semibold">{r.v}</span>
                    <span
                      className="h-5 rounded bg-rose-400/75"
                      style={{ width: `${(r.count / withR.length) * 100}%` }}
                    />
                    <span className="ml-auto font-bold">{r.count}</span>
                  </button>
                ))}
              </div>
            </Section>
          ))}
      </div>
      <Section title="Bugs que retornaram" subtitle="Ordenados pela quantidade de retornos">
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="pb-3">Bug</th>
                {meta.has.cliente && <th>Cliente</th>}
                {meta.has.modulo && <th>{meta.moduloLabel}</th>}
                <th>Retornos</th>
                <th>Lead time</th>
              </tr>
            </thead>
            <tbody>
              {[...withR]
                .sort((a, b) => b.qtd_retornos - a.qtd_retornos)
                .map((b) => (
                  <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-3">
                      <b className="text-brand-600">{b.id}</b>
                      <span className="ml-2">{b.titulo}</span>
                    </td>
                    {meta.has.cliente && <td>{b.cliente}</td>}
                    {meta.has.modulo && <td>{b.modulo}</td>}
                    <td>
                      <span className="rounded bg-rose-50 px-2 py-1 font-bold text-rose-600 dark:bg-rose-500/10">
                        {b.qtd_retornos}
                      </span>
                    </td>
                    <td>{fmtTime(b.lead_time_min, unit)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function BugList({
  bugs,
  meta,
  phases,
  onSelect,
}: {
  bugs: Bug[];
  meta: Meta;
  phases: Phase[];
  onSelect: (bug: Bug) => void;
}) {
  const unit = useUnit();
  const [sort, setSort] = useState<"date" | "lead" | "id">(
      meta.has.data_encerramento ? "date" : "lead",
    ),
    [desc, setDesc] = useState(true),
    [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      bugs
        .filter((b) =>
          `${b.id} ${b.titulo} ${b.cliente} ${b.modulo}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => {
          let n =
            sort === "lead"
              ? a.lead_time_min - b.lead_time_min
              : sort === "id"
                ? a.id.localeCompare(b.id)
                : (parsePtDate(a.data_encerramento).getTime() || 0) -
                  (parsePtDate(b.data_encerramento).getTime() || 0);
          return desc ? -n : n;
        }),
    [bugs, query, sort, desc],
  );
  const perPage = 12,
    totalPages = Math.max(1, Math.ceil(rows.length / perPage)),
    shown = rows.slice((page - 1) * perPage, page * perPage);
  const exportCsv = () => {
    const headers = [
      "id",
      "titulo",
      "tipo",
      "severidade",
      "prioridade",
      "cliente",
      "modulo",
      "versao",
      "responsavel",
      "data_abertura",
      "data_encerramento",
      "qtd_retornos",
      "pr",
      "backports",
    ];
    const fmtExport = (min: number) =>
      String(Number(toUnit(min, unit).toFixed(2))).replace(".", ",");
    const timeHeaders = [
      `Tempo total no board (${UNIT_LABEL[unit]})`,
      ...phases.map((p) => `${p.label} (${UNIT_LABEL[unit]})`),
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const text = [
      [...headers, ...timeHeaders].map(escape).join(";"),
      ...rows.map((b) =>
        [
          ...headers.map((h) =>
            escape(
              h === "backports"
                ? b.backports.join(",")
                : (b as unknown as Record<string, unknown>)[h],
            ),
          ),
          escape(fmtExport(b.lead_time_min)),
          ...phases.map((p) => escape(fmtExport(b.phases[p.key]))),
        ].join(";"),
      ),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }));
    a.download = "bugs-filtrados.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  if (!bugs.length) return <EmptyChart />;
  return (
    <Section
      title="Lista de bugs"
      subtitle={`${rows.length} registros encontrados`}
      action={
        <button onClick={exportCsv} className="btn-primary">
          <Icon name="download" size={16} />
          Exportar CSV
        </button>
      }
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="control flex flex-1 items-center gap-2">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="w-full bg-transparent"
            placeholder="Filtrar nesta tabela..."
          />
        </div>
        <select
          className="control"
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
        >
          {meta.has.data_encerramento && <option value="date">Encerramento</option>}
          <option value="lead">Lead time</option>
          <option value="id">ID</option>
        </select>
        <button className="icon-btn" onClick={() => setDesc(!desc)} title="Inverter ordenação">
          {desc ? "↓" : "↑"}
        </button>
      </div>
      <div className="thin-scroll overflow-auto">
        <table className="min-w-[700px] w-full text-left text-sm">
          <thead className="sticky top-0 bg-white text-[11px] uppercase tracking-wide text-slate-400 dark:bg-[#111923]">
            <tr>
              <th className="pb-3">ID / Título</th>
              {meta.has.cliente && <th>Cliente</th>}
              {meta.has.modulo && <th>{meta.moduloLabel}</th>}
              {meta.has.versao && <th>Versão</th>}
              {meta.has.severidade && <th>Severidade</th>}
              {meta.has.responsavel && <th>Responsável</th>}
              {meta.has.data_encerramento && <th>Encerrado</th>}
              <th>Lead time</th>
              <th className="w-52">Fases</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr
                key={b.id}
                onClick={() => onSelect(b)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
              >
                <td className="max-w-64 py-3">
                  <b className="text-brand-600">{b.id}</b>
                  <span className="block truncate text-xs text-slate-500">{b.titulo}</span>
                </td>
                {meta.has.cliente && <td>{b.cliente}</td>}
                {meta.has.modulo && <td>{b.modulo}</td>}
                {meta.has.versao && <td>{b.versao}</td>}
                {meta.has.severidade && (
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-bold ${b.severidade === "Crítica" ? "bg-rose-100 text-rose-700 dark:bg-rose-500/10" : b.severidade === "Alta" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}
                    >
                      {b.severidade}
                    </span>
                  </td>
                )}
                {meta.has.responsavel && <td>{b.responsavel}</td>}
                {meta.has.data_encerramento && <td>{b.data_encerramento}</td>}
                <td className="font-bold">{fmtTime(b.lead_time_min, unit)}</td>
                <td>
                  <MiniPhases bug={b} phases={phases} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
        <span>
          Página {Math.min(page, totalPages)} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="control disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="control disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      </div>
    </Section>
  );
}

function Drawer({
  bug,
  meta,
  phases,
  bugs,
  onClose,
}: {
  bug: Bug;
  meta: Meta;
  phases: Phase[];
  bugs: Bug[];
  onClose: () => void;
}) {
  const unit = useUnit();
  const max = Math.max(...phases.map((p) => bug.phases[p.key]), 1),
    median = percentile(
      bugs.map((b) => b.lead_time_min),
      0.5,
    ),
    diff = bug.lead_time_min - median;
  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/30 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside
        onMouseDown={(e) => e.stopPropagation()}
        className="thin-scroll absolute right-0 top-0 h-full w-full max-w-lg overflow-auto bg-white p-7 shadow-2xl dark:bg-[#111923]"
      >
        <button onClick={onClose} className="icon-btn absolute right-5 top-5">
          <Icon name="x" />
        </button>
        <span className="text-xs font-bold text-brand-600">{bug.id}</span>
        <h2 className="mt-2 pr-12 font-display text-2xl font-bold">{bug.titulo}</h2>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Lead time total</p>
          <p className="mt-1 text-3xl font-bold">
            {fmtVal(bug.lead_time_min, unit)}{" "}
            <small className="text-sm text-slate-400">{UNIT_NAME[unit]}</small>
          </p>
          <p
            className={`mt-2 text-sm font-semibold ${diff > 0 ? "text-rose-500" : "text-emerald-600"}`}
          >
            {fmtTime(Math.abs(diff), unit)} {diff > 0 ? "acima" : "abaixo"} da mediana do período
          </p>
        </div>
        <h3 className="mt-7 font-display font-bold">Tempo em cada fase</h3>
        <div className="mt-4 space-y-4">
          {phases.map((p) => (
            <div key={p.key}>
              <div className="mb-1 flex justify-between text-xs">
                <span>{p.label}</span>
                <b>{fmtTime(bug.phases[p.key], unit)}</b>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full"
                  style={{ background: p.color, width: `${(bug.phases[p.key] / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <h3 className="mt-8 font-display font-bold">Detalhes</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {(
            [
              [meta.has.cliente, "Cliente", bug.cliente],
              [meta.has.modulo, meta.moduloLabel, bug.modulo],
              [meta.has.versao, "Versão", bug.versao],
              [meta.has.tipo, "Tipo", bug.tipo],
              [meta.has.severidade, "Severidade", bug.severidade],
              [meta.has.prioridade, "Prioridade", bug.prioridade],
              [meta.has.responsavel, "Responsável", bug.responsavel],
              [meta.has.data_abertura, "Abertura", bug.data_abertura],
              [meta.has.data_encerramento, "Encerramento", bug.data_encerramento],
              [meta.has.qtd_retornos, "Retornos", bug.qtd_retornos],
              [meta.has.pr, "PR", bug.pr],
              [meta.has.backports, "Backports", bug.backports.join(", ") || "—"],
            ] as [boolean, string, string | number][]
          )
            .filter(([show]) => show)
            .map(([, k, v]): [string, string | number] => [k, v === "" ? "—" : v])
            .map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-slate-500">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
        </dl>
      </aside>
    </div>
  );
}

function Welcome({
  onSample,
  onFile,
  error,
}: {
  onSample: () => void;
  onFile: (f: File) => void;
  error: string;
}) {
  const [drag, setDrag] = useState(false),
    input = useRef<HTMLInputElement>(null);
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_50%_10%,rgba(15,118,110,.12),transparent_40%)] p-6 dark:bg-[radial-gradient(circle_at_50%_10%,rgba(15,118,110,.18),transparent_40%)]">
      <div className="w-full max-w-3xl text-center animate-enter">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
          <Icon name="bug" size={31} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-brand-600">Alfred BI</p>
        <h1 className="mt-2 font-display text-4xl font-bold tracking-tight md:text-5xl">
          Bugs Encerrados
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
          Transforme seu CSV em uma visão clara de fluxo, gargalos e qualidade. Seus dados são
          processados apenas neste navegador.
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className={`panel mt-10 border-2 border-dashed p-9 transition ${drag ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-slate-300 dark:border-slate-700"}`}
        >
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10">
            <Icon name="upload" />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold">Arraste seu arquivo CSV aqui</h2>
          <p className="mt-1 text-sm text-slate-500">
            CSV com cabeçalho (separador ; , ou tab; UTF-8 ou Windows-1252)
          </p>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <button onClick={() => input.current?.click()} className="btn-primary mt-5">
            <Icon name="upload" size={16} />
            Carregar CSV
          </button>
          {error && (
            <p className="mx-auto mt-4 max-w-xl rounded-lg bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>
        <button
          onClick={onSample}
          className="mt-6 text-sm font-bold text-brand-600 hover:underline"
        >
          Usar dados de exemplo <span className="ml-1">→</span>
        </button>
        <div className="mt-10 grid gap-3 text-left md:grid-cols-3">
          {[
            {
              t: "Colunas",
              d: "Card/ID e ao menos uma fase. Cliente, módulo ou grupo, versão, datas e retornos são opcionais.",
            },
            {
              t: "Fases dinâmicas",
              d: "Toda coluna terminada em “(min)”, “(h)”, “(dias)” ou com prefixo dias_ vira uma fase, na ordem do arquivo.",
            },
            {
              t: "Privacidade total",
              d: "Nenhum dado sai do navegador e nenhuma API externa é consultada.",
            },
          ].map((x) => (
            <div key={x.t} className="rounded-xl bg-white/60 p-4 dark:bg-slate-900/50">
              <b className="text-sm">{x.t}</b>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{x.d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null),
    [fileName, setFileName] = useState(""),
    [loadedAt, setLoadedAt] = useState<Date | null>(null),
    [error, setError] = useState(""),
    [dark, setDark] = useState(false),
    [tab, setTab] = useState<Tab>("Resumo"),
    [filters, setFilters] = useState<Filters>(emptyFilters),
    [compare, setCompare] = useState(false),
    [target, setTarget] = useState(10),
    [unit, setUnitState] = useState<Unit>(loadUnit),
    [selected, setSelected] = useState<Bug | null>(null);
  const setUnit = (u: Unit) => {
    setUnitState(u);
    try {
      localStorage.setItem(UNIT_KEY, u);
    } catch {
      /* sem persistência */
    }
  };
  const loadFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Selecione um arquivo no formato CSV.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseCSV(decodeCsv(reader.result as ArrayBuffer));
        setData(parsed);
        setFileName(file.name);
        setLoadedAt(new Date());
        setFilters(emptyFilters);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
      }
    };
    reader.onerror = () => setError("Não foi possível ler o arquivo.");
    reader.readAsArrayBuffer(file);
  };
  const useSample = () => {
    setData(makeSampleData());
    setFileName("dados-exemplo-alfred.csv");
    setLoadedAt(new Date());
    setFilters(emptyFilters);
    setError("");
  };
  const options = useMemo(
    () =>
      data
        ? {
            clients: unique(data.bugs, "cliente"),
            modules: unique(data.bugs, "modulo"),
            versions: unique(data.bugs, "versao"),
            severities: unique(data.bugs, "severidade"),
            owners: unique(data.bugs, "responsavel"),
          }
        : { clients: [], modules: [], versions: [], severities: [], owners: [] },
    [data],
  );
  const filtered = useMemo(() => (data ? filterBugs(data.bugs, filters) : []), [data, filters]);
  const compareBugs = useMemo(() => {
    if (!data || !compare) return [];
    const prev = previousPeriodFilters(filters);
    return prev ? filterBugs(data.bugs, prev) : [];
  }, [data, compare, filters]);
  if (!data)
    return (
      <div className={dark ? "dark" : ""}>
        <button
          onClick={() => setDark(!dark)}
          className="icon-btn fixed right-5 top-5 z-10"
          title="Alternar tema"
        >
          <Icon name={dark ? "sun" : "moon"} />
        </button>
        <Welcome onSample={useSample} onFile={loadFile} error={error} />
      </div>
    );
  const applyFilter = (key: string, value: string) => {
    if (key === "cliente")
      setFilters((f) => ({
        ...f,
        clients: f.clients.includes(value)
          ? f.clients.filter((v) => v !== value)
          : [...f.clients, value],
      }));
    else if (key === "week") {
      const s = new Date(`${value}T12:00:00`),
        e = new Date(s);
      e.setDate(e.getDate() + 6);
      setFilters((f) => ({ ...f, start: dateInput(s), end: dateInput(e) }));
    } else setFilters((f) => ({ ...f, [key]: f[key as keyof Filters] === value ? "" : value }));
  };
  const shortcut = (kind: string) => {
    const dates = data.bugs
      .map((b) => parsePtDate(b.data_encerramento))
      .filter((d) => !Number.isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    if (!dates.length) return;
    const max = dates.at(-1)!,
      min = dates[0];
    let start = new Date(max),
      end = new Date(max);
    if (kind === "30") start.setDate(end.getDate() - 29);
    if (kind === "previous") {
      end = new Date(max.getFullYear(), max.getMonth(), 0, 12);
      start = new Date(end.getFullYear(), end.getMonth(), 1, 12);
    }
    if (kind === "quarter")
      start = new Date(max.getFullYear(), Math.floor(max.getMonth() / 3) * 3, 1, 12);
    if (kind === "all") {
      start = min;
      end = max;
    }
    setFilters((f) => ({ ...f, start: dateInput(start), end: dateInput(end) }));
  };
  const has = data.meta.has;
  const visibleTabs = tabs.filter(
    (t) =>
      (t !== "Clientes" || has.cliente) &&
      (t !== "Módulos e Versões" || has.modulo || has.versao) &&
      (t !== "Retrabalho" || has.qtd_retornos),
  );
  const currentTab = visibleTabs.includes(tab) ? tab : "Resumo";
  const activeChips = [
    ...filters.clients.map((v) => ({ k: "cliente", v, label: `Cliente: ${v}` })),
    ...(filters.module
      ? [{ k: "module", v: filters.module, label: `Módulo: ${filters.module}` }]
      : []),
    ...(filters.version
      ? [{ k: "version", v: filters.version, label: `Versão: ${filters.version}` }]
      : []),
    ...(filters.severity
      ? [{ k: "severity", v: filters.severity, label: `Severidade: ${filters.severity}` }]
      : []),
    ...(filters.owner
      ? [{ k: "owner", v: filters.owner, label: `Responsável: ${filters.owner}` }]
      : []),
    ...(filters.rework
      ? [{ k: "rework", v: filters.rework, label: `Retrabalho: ${filters.rework}` }]
      : []),
    ...(filters.phase
      ? [
          {
            k: "phase",
            v: filters.phase,
            label: `Fase: ${data.phases.find((p) => p.key === filters.phase)?.label}`,
          },
        ]
      : []),
  ];
  return (
    <UnitContext.Provider value={unit}>
      <div className={dark ? "dark" : ""}>
        <div className="min-h-screen bg-slate-50 dark:bg-[#0b1017]">
          <header className="border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-[#111923]">
            <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-4">
              <div className="grid size-9 place-items-center rounded-xl bg-brand-600 text-white">
                <Icon name="bug" size={20} />
              </div>
              <div>
                <h1 className="font-display text-base font-bold leading-tight">Alfred BI</h1>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Bugs encerrados
                </p>
              </div>
              <span className="mx-2 hidden h-6 w-px bg-slate-200 lg:block dark:bg-slate-700" />
              <nav className="thin-scroll flex flex-1 self-stretch overflow-x-auto">
                {visibleTabs.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative whitespace-nowrap px-4 text-sm font-semibold ${currentTab === t ? "text-brand-600" : "text-slate-500 hover:text-slate-800 dark:hover:text-white"}`}
                  >
                    {t === "Módulos e Versões" && !data.meta.has.versao ? data.meta.moduloLabel : t}
                    {currentTab === t && (
                      <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-brand-600" />
                    )}
                  </button>
                ))}
              </nav>
              <button onClick={() => setDark(!dark)} className="icon-btn">
                <Icon name={dark ? "sun" : "moon"} />
              </button>
              <label className="btn-primary hidden cursor-pointer sm:inline-flex">
                <Icon name="upload" size={15} />
                Trocar CSV
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])}
                />
              </label>
            </div>
          </header>
          <div className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-[#0b1017]/95">
            <div className="mx-auto max-w-[1600px]">
              <div className="thin-scroll flex items-end gap-3 overflow-x-auto pb-1">
                {has.data_encerramento && (
                  <div>
                    <span className="label">Período de encerramento</span>
                    <div className="flex gap-1">
                      <input
                        type="date"
                        value={filters.start}
                        onChange={(e) => setFilters({ ...filters, start: e.target.value })}
                        className="control w-36"
                      />
                      <input
                        type="date"
                        value={filters.end}
                        onChange={(e) => setFilters({ ...filters, end: e.target.value })}
                        className="control w-36"
                      />
                    </div>
                  </div>
                )}
                {has.cliente && (
                  <div>
                    <span className="label">Cliente</span>
                    <MultiSelect
                      values={options.clients}
                      selected={filters.clients}
                      onChange={(clients) => setFilters({ ...filters, clients })}
                    />
                  </div>
                )}
                {[
                  [data.meta.moduloLabel, "module", has.modulo ? options.modules : null],
                  ["Versão", "version", has.versao ? options.versions : null],
                  ["Severidade", "severity", has.severidade ? options.severities : null],
                  ["Responsável", "owner", has.responsavel ? options.owners : null],
                ]
                  .filter(([, , vals]) => vals)
                  .map(([label, key, vals]) => (
                    <label key={key as string}>
                      <span className="label">{label as string}</span>
                      <select
                        value={filters[key as keyof Filters] as string}
                        onChange={(e) =>
                          setFilters({ ...filters, [key as string]: e.target.value })
                        }
                        className="control min-w-32"
                      >
                        <option value="">Todos</option>
                        {(vals as string[]).map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                {has.qtd_retornos && (
                  <label>
                    <span className="label">Teve retrabalho</span>
                    <select
                      value={filters.rework}
                      onChange={(e) => setFilters({ ...filters, rework: e.target.value })}
                      className="control"
                    >
                      <option value="">Todos</option>
                      <option value="sim">Sim</option>
                      <option value="não">Não</option>
                    </select>
                  </label>
                )}
                <label className="min-w-48 flex-1">
                  <span className="label">Buscar ID ou título</span>
                  <div className="control flex items-center gap-2">
                    <Icon name="search" size={14} />
                    <input
                      value={filters.search}
                      onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                      placeholder="Ex.: 123456"
                      className="w-full bg-transparent"
                    />
                  </div>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-bold text-brand-700 dark:text-brand-500">
                  {filtered.length} bugs no filtro
                </span>
                {(has.data_encerramento ? ["30", "previous", "quarter", "all"] : []).map((v, i) => (
                  <button
                    key={v}
                    onClick={() => shortcut(v)}
                    className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 shadow-sm ring-1 ring-slate-200 hover:text-brand-600 dark:bg-slate-900 dark:ring-slate-700"
                  >
                    {["Últimos 30 dias", "Mês anterior", "Trimestre", "Tudo"][i]}
                  </button>
                ))}
                <div
                  className="ml-auto flex items-center gap-2"
                  title="Dia útil de 8 horas: 1 dia = 8 h = 480 min"
                >
                  <span className="text-[11px] text-slate-400">1 dia = 8 h úteis</span>
                  <div
                    role="group"
                    aria-label="Unidade de tempo"
                    className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
                  >
                    {(["min", "h", "d"] as const).map((u) => (
                      <button
                        key={u}
                        onClick={() => setUnit(u)}
                        aria-pressed={unit === u}
                        className={`rounded-md px-3 py-1 text-xs font-bold ${unit === u ? "bg-white shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
                      >
                        {{ min: "Minutos", h: "Horas", d: "Dias" }[u]}
                      </button>
                    ))}
                  </div>
                </div>
                {has.data_encerramento && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={compare}
                      onChange={(e) => setCompare(e.target.checked)}
                      className="accent-brand-600"
                    />
                    Comparar com período anterior
                  </label>
                )}
                <button
                  onClick={() => setFilters(emptyFilters)}
                  className="text-xs font-bold text-slate-500 hover:text-brand-600"
                >
                  Limpar filtros
                </button>
              </div>
              {activeChips.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {activeChips.map((chip) => (
                    <button
                      key={`${chip.k}${chip.v}`}
                      onClick={() => applyFilter(chip.k, chip.v)}
                      className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-500"
                    >
                      {chip.label}
                      <Icon name="x" size={12} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <main className="mx-auto max-w-[1600px] p-5">
            {currentTab === "Resumo" && (
              <Summary
                bugs={filtered}
                meta={data.meta}
                compareBugs={compareBugs}
                phases={data.phases}
                compare={compare}
                target={target}
                setTarget={setTarget}
                applyFilter={applyFilter}
              />
            )}{" "}
            {currentTab === "Fases" && (
              <PhasesView
                bugs={filtered}
                phases={data.phases}
                active={filters.phase}
                applyFilter={applyFilter}
              />
            )}{" "}
            {currentTab === "Clientes" && (
              <ClientsView bugs={filtered} phases={data.phases} applyFilter={applyFilter} />
            )}{" "}
            {currentTab === "Módulos e Versões" && (
              <ModulesView
                bugs={filtered}
                meta={data.meta}
                phases={data.phases}
                applyFilter={applyFilter}
              />
            )}{" "}
            {currentTab === "Retrabalho" && (
              <ReworkView bugs={filtered} meta={data.meta} applyFilter={applyFilter} />
            )}{" "}
            {currentTab === "Lista de Bugs" && (
              <BugList
                bugs={filtered}
                meta={data.meta}
                phases={data.phases}
                onSelect={setSelected}
              />
            )}
          </main>
          <footer className="border-t border-slate-200 bg-white px-5 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111923]">
            <div className="mx-auto flex max-w-[1600px] flex-wrap justify-between gap-2">
              <span>
                <b className="text-slate-700 dark:text-slate-300">{fileName}</b> · carregado em{" "}
                {loadedAt?.toLocaleString("pt-BR")}
              </span>
              <span>
                {data.bugs.length.toLocaleString("pt-BR")} linhas lidas · processamento local
              </span>
            </div>
          </footer>
          {selected && (
            <Drawer
              bug={selected}
              meta={data.meta}
              phases={data.phases}
              bugs={filtered}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </UnitContext.Provider>
  );
}
