import { useEffect, useState } from "react";
import { LockKeyhole, Plus, Pencil, History, X } from "lucide-react";
import { masterRpc } from "../lib/master-data";
import "./IgisOperationsPanel.css";

type Scope = {
  asset_id: string;
  vehicle_id: string | null;
  vehicle_name: string | null;
  domain: string;
  can_write: boolean;
};
type Row = { id: string; revision: string; [key: string]: unknown };
type Field = {
  key: string;
  label: string;
  type?: string;
  choices?: [string, string][];
  required?: boolean;
};
const f = (
  key: string,
  label: string,
  type = "text",
  required = false,
): Field => ({ key, label, type, required });
const choice = (
  key: string,
  label: string,
  choices: [string, string][],
  required = true,
): Field => ({ key, label, choices, required });
const currency = f("currency_code", "통화 코드 (KRW·USD 등)", "text", true);
const scopeBasis = choice("scope_basis", "금액의 대상 범위", [
  ["whole_asset", "자산 전체"],
  ["fund_share", "해당 펀드 지분"],
]);
const periods = [
  f("period_start", "집계 시작일", "date", true),
  f("period_end", "집계 종료일", "date", true),
];
const datasets: {
  entity: string;
  domain: string;
  label: string;
  help: string;
  fields: Field[];
}[] = [
  {
    entity: "igis_lease_contracts",
    domain: "lease_contract",
    label: "실제 임대차계약",
    help: "체결된 계약의 기간과 상태입니다. 시장 조사 임대조건과 분리합니다.",
    fields: [
      f("contract_reference", "계약번호", "text", true),
      f("signed_on", "체결일", "date"),
      f("started_on", "계약 시작일", "date", true),
      f("ended_on", "계약 종료일", "date"),
      choice("status", "계약 상태", [
        ["signed", "체결"],
        ["active", "유효"],
        ["ended", "종료"],
        ["cancelled", "취소"],
      ]),
    ],
  },
  {
    entity: "igis_lease_terms",
    domain: "lease_contract",
    label: "계약 임대조건",
    help: "계약상 월 총액입니다. 실제 수납액과는 별도로 기록합니다. 종료일은 다음 조건이 시작되는 날짜입니다.",
    fields: [
      {
        key: "contract_id",
        label: "임대차계약",
        type: "contract",
        required: true,
      },
      f("effective_from", "적용 시작일", "date", true),
      f("effective_to", "적용 종료일 (미포함)", "date"),
      currency,
      f("leased_area_m2", "계약 면적 (㎡)", "number"),
      choice("area_basis", "면적 기준", [
        ["rentable", "임대면적"],
        ["exclusive", "전용면적"],
        ["other", "기타"],
        ["unconfirmed", "미확인"],
      ]),
      f("deposit_amount", "보증금 총액", "number"),
      f("monthly_rent_amount", "계약 월 임대료 총액", "number"),
      f("monthly_management_fee", "계약 월 관리비 총액", "number"),
      choice("vat_basis", "부가세 기준", [
        ["excluded", "별도"],
        ["included", "포함"],
        ["exempt", "면세"],
        ["unconfirmed", "미확인"],
      ]),
      f("rent_free_months", "렌트프리 개월 수", "number"),
      choice(
        "rent_free_basis",
        "렌트프리 적용 범위",
        [
          ["per_year", "연간"],
          ["contract_total", "계약 전체"],
          ["other", "기타"],
          ["unconfirmed", "미확인"],
        ],
        false,
      ),
    ],
  },
  {
    entity: "igis_operating_periods",
    domain: "operating_actual",
    label: "실제 운영실적",
    help: "집계 기간·회계 기준·대상 범위가 같은 값끼리 비교합니다. NOI 산식과 포함 항목을 함께 기록합니다.",
    fields: [
      ...periods,
      currency,
      scopeBasis,
      choice("accounting_basis", "회계 기준", [
        ["accrual", "발생주의"],
        ["cash", "현금주의"],
      ]),
      f("rental_revenue", "실제 임대수익", "number"),
      f("management_revenue", "관리수익", "number"),
      f("other_revenue", "기타수익", "number"),
      f("operating_expense", "운영비용", "number"),
      f("noi_amount", "실제 NOI", "number"),
      f("noi_definition", "NOI 산식·포함 항목"),
      f("capital_expenditure", "자본적 지출", "number"),
      f("rent_receivable", "미수 임대료", "number"),
      f("deposit_liability", "보증금 잔액", "number"),
      f("occupied_area_m2", "임대 중 면적 (㎡)", "number"),
      f("rentable_area_m2", "총 임대가능 면적 (㎡)", "number"),
    ],
  },
  {
    entity: "igis_cash_entries",
    domain: "operating_actual",
    label: "실제 수납·지급",
    help: "실제로 입출금된 금액만 기록합니다. 계약금액이나 미수액을 수납액으로 기록하지 않습니다.",
    fields: [
      f("transaction_reference", "입출금 식별번호", "text", true),
      f("occurred_on", "입출금일", "date", true),
      currency,
      choice("direction", "입출금 구분", [
        ["in", "수납"],
        ["out", "지급"],
      ]),
      choice("category", "항목", [
        ["rent", "임대료"],
        ["management_fee", "관리비"],
        ["deposit", "보증금"],
        ["operating_expense", "운영비용"],
        ["capex", "자본적 지출"],
        ["other", "기타"],
      ]),
      f("amount", "입출금 금액", "number", true),
    ],
  },
  {
    entity: "igis_operating_plans",
    domain: "operating_plan",
    label: "예산·전망",
    help: "예산과 전망은 실제 운영실적에 합산되지 않습니다.",
    fields: [
      f("scenario_name", "계획·시나리오명", "text", true),
      f("version_no", "판본 번호", "number", true),
      choice("plan_kind", "계획 구분", [
        ["budget", "예산"],
        ["forecast", "전망"],
      ]),
      ...periods,
      currency,
      scopeBasis,
      f("rental_revenue", "예상 임대수익", "number"),
      f("operating_expense", "예상 운영비용", "number"),
      f("noi_amount", "예상 NOI", "number"),
      f("noi_definition", "NOI 산식·포함 항목"),
      f("assumptions", "주요 가정", "text", true),
    ],
  },
  {
    entity: "igis_asset_valuations",
    domain: "valuation",
    label: "내부 자산평가",
    help: "감정평가액·장부가·추정 시장가·매각 목표가는 각각 별도 기준값입니다.",
    fields: [
      f("valued_on", "평가 기준일", "date", true),
      currency,
      scopeBasis,
      choice("value_kind", "평가 구분", [
        ["appraisal", "감정평가액"],
        ["book", "장부가"],
        ["market_estimate", "추정 시장가"],
        ["target_sale", "매각 목표가"],
      ]),
      f("amount", "평가금액", "number", true),
      f("method", "평가 방법·근거", "text", true),
    ],
  },
];
const evidence = [
  f("source_reference", "근거 자료·문서 참조", "text", true),
  f("note", "비고"),
];
const labelValue = (field: Field, value: unknown) =>
  field.choices?.find(([key]) => key === value)?.[1] ?? String(value ?? "—");
export default function IgisOperationsPanel({
  buildingId,
}: {
  buildingId: string;
}) {
  const [scopes, setScopes] = useState<Scope[]>([]),
    [scopeIndex, setScopeIndex] = useState(0),
    [entity, setEntity] = useState("");
  const [rows, setRows] = useState<Row[]>([]),
    [contracts, setContracts] = useState<Row[]>([]),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null | undefined>(undefined),
    [draft, setDraft] = useState<Record<string, string>>({}),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState<
      | {
          id: string;
          changed_at: string;
          reason: string;
          before: Row | null;
          after: Row;
        }[]
      | null
    >(null),
    [refresh, setRefresh] = useState(0);
  const scope = scopes[scopeIndex];
  const available = datasets.filter((d) => d.domain === scope?.domain);
  const dataset = available.find((d) => d.entity === entity) ?? available[0];
  useEffect(() => {
    let alive = true;
    void masterRpc<{ scopes: Scope[] }>("igis_operation_access", {
      building_key: buildingId,
    })
      .then((data) => {
        if (alive) setScopes(data.scopes);
      })
      .catch(() => {
        if (alive) setError("내부정보 권한을 확인하지 못했습니다.");
      });
    return () => {
      alive = false;
    };
  }, [buildingId]);
  useEffect(() => {
    if (!scope || !dataset) return;
    let alive = true;
    setBusy(true);
    setError("");
    setRows([]);
    setContracts([]);
    setEditing(undefined);
    setHistory(null);
    const args = { asset_key: scope.asset_id, vehicle_key: scope.vehicle_id };
    void Promise.all([
      masterRpc<Row[]>("igis_operation_records", {
        ...args,
        entity: dataset.entity,
        page_offset: offset,
      }),
      dataset.entity === "igis_lease_terms"
        ? masterRpc<Row[]>("igis_operation_records", {
            ...args,
            entity: "igis_lease_contracts",
          })
        : Promise.resolve([]),
    ])
      .then(([records, leases]) => {
        if (alive) {
          setRows(records);
          setContracts(leases);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [scope, dataset, offset, refresh]);
  if (!scope) return null;
  const fields = [...dataset.fields, ...evidence];
  const begin = (row: Row | null) => {
    setEditing(row);
    setHistory(null);
    setDraft(
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          String(
            row?.[field.key] ??
              (field.key === "scope_basis"
                ? scope.vehicle_id
                  ? "fund_share"
                  : "whole_asset"
                : ""),
          ),
        ]),
      ),
    );
    setReason("");
    setError("");
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await masterRpc("igis_operation_save", {
        entity: dataset.entity,
        asset_key: scope.asset_id,
        vehicle_key: scope.vehicle_id,
        record_key: editing?.id ?? null,
        expected_revision: editing?.revision ?? null,
        changes: Object.fromEntries(
          fields.map((field) => [field.key, draft[field.key]?.trim() || null]),
        ),
        change_reason: reason,
      });
      setEditing(undefined);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="igis-operations info-panel">
      <div className="section-heading">
        <div>
          <h2>
            <LockKeyhole size={18} /> 이지스 내부 운영정보
          </h2>
          <p>권한이 부여된 관계자 전용 · 시장 임대조건과 별도 관리</p>
        </div>
      </div>
      <div className="operations-controls">
        <label>
          조회 범위
          <select
            value={scopeIndex}
            onChange={(e) => {
              setScopeIndex(Number(e.target.value));
              setOffset(0);
              setEntity("");
            }}
          >
            {scopes.map((s, i) => (
              <option key={i} value={i}>
                {s.vehicle_name ?? "자산 전체"} ·{" "}
                {datasets.find((d) => d.domain === s.domain)?.label}{" "}
                {s.can_write ? "(수정 가능)" : "(조회 전용)"}
              </option>
            ))}
          </select>
        </label>
        <label>
          정보 구분
          <select
            value={dataset.entity}
            onChange={(e) => {
              setEntity(e.target.value);
              setOffset(0);
            }}
          >
            {available.map((d) => (
              <option key={d.entity} value={d.entity}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="context-note">{dataset.help}</p>
      {error && <p role="alert">{error}</p>}
      {editing === undefined && scope.can_write && (
        <button
          className="operations-action"
          disabled={busy}
          onClick={() => begin(null)}
        >
          <Plus size={16} /> {dataset.label} 등록
        </button>
      )}
      {editing !== undefined && (
        <form onSubmit={save}>
          <div className="section-heading">
            <h3>{editing ? "정보 수정" : "정보 등록"}</h3>
            <button
              type="button"
              aria-label="편집 닫기"
              onClick={() => setEditing(undefined)}
              disabled={busy}
            >
              <X size={18} />
            </button>
          </div>
          <div className="operations-fields">
            {fields.map((field) => (
              <label key={field.key}>
                {field.label}
                {field.required ? " *" : ""}
                {field.choices || field.type === "contract" ? (
                  <select
                    required={field.required}
                    value={draft[field.key] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [field.key]: e.target.value })
                    }
                  >
                    <option value="">선택</option>
                    {(field.type === "contract"
                      ? contracts.map((c) => [
                          c.id,
                          String(c.contract_reference),
                        ])
                      : field.choices
                    )?.map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required={field.required}
                    type={field.type ?? "text"}
                    step={field.type === "number" ? "any" : undefined}
                    value={draft[field.key] ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, [field.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          <label>
            등록·수정 사유
            <textarea
              required
              minLength={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button className="operations-action" disabled={busy} type="submit">
            {busy ? "저장 중…" : "저장"}
          </button>
        </form>
      )}
      {busy && <p role="status">처리 중입니다.</p>}
      {!busy && !rows.length && editing === undefined && (
        <p className="context-note">
          등록된 내부 자료가 없습니다. 실제 자료가 확인되면 등록합니다.
        </p>
      )}
      {rows.map((row) => (
        <article key={row.id}>
          <dl>
            {fields
              .filter((field) => row[field.key] != null)
              .map((field) => (
                <div key={field.key}>
                  <dt>{field.label}</dt>
                  <dd>{labelValue(field, row[field.key])}</dd>
                </div>
              ))}
          </dl>
          <div className="operations-controls">
            {scope.can_write && (
              <button disabled={busy} onClick={() => begin(row)}>
                <Pencil size={15} /> 수정
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void masterRpc<typeof history>(
                  "igis_operation_record_history",
                  { entity: dataset.entity, record_key: row.id },
                )
                  .then(setHistory)
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <History size={15} /> 수정 이력
            </button>
          </div>
        </article>
      ))}
      {(offset > 0 || rows.length === 50) && (
        <div className="operations-controls">
          <button
            disabled={busy || offset === 0}
            onClick={() => setOffset((n) => n - 50)}
          >
            이전
          </button>
          <button
            disabled={busy || rows.length < 50}
            onClick={() => setOffset((n) => n + 50)}
          >
            다음
          </button>
        </div>
      )}
      {history && (
        <aside>
          <div className="section-heading">
            <h3>내부정보 수정 이력</h3>
            <button aria-label="이력 닫기" onClick={() => setHistory(null)}>
              <X size={18} />
            </button>
          </div>
          {history.map((h) => (
            <article key={h.id}>
              <p>
                {new Date(h.changed_at).toLocaleString("ko-KR")} · {h.reason}
              </p>
              <dl>
                {fields
                  .filter(
                    (field) => h.before?.[field.key] !== h.after[field.key],
                  )
                  .map((field) => (
                    <div key={field.key}>
                      <dt>{field.label}</dt>
                      <dd>
                        {labelValue(field, h.before?.[field.key])} →{" "}
                        {labelValue(field, h.after[field.key])}
                      </dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
        </aside>
      )}
    </section>
  );
}
