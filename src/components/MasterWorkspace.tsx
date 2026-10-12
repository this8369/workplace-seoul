import { useEffect, useState } from "react";
import { useAreaUnit } from "./AreaUnit";
import {
  ChevronLeft,
  ChevronRight,
  History,
  Plus,
  Save,
  Search,
  X,
} from "lucide-react";
import { masterFields } from "../lib/master-fields";
import {
  masterDisplay,
  masterRpc,
  type MasterRecord,
} from "../lib/master-data";
import "./MasterWorkspace.css";
import {
  DataReviewProvider,
  ReviewValue,
  ReviewRecordButton,
  ReviewInbox,
} from "./DataReview";

const sections = [
  ["master_assets", "자산"],
  ["master_parties", "기업·기관"],
  ["master_vehicles", "펀드"],
  ["master_investment_objects", "투자자산"],
  ["master_investments", "투자관계"],
  ["master_beneficiary_positions", "투자자"],
  ["master_loan_positions", "대주"],
  ["master_aum_snapshots", "AUM"],
] as const;
function title(r: MasterRecord) {
  return masterDisplay(
    r.name ||
      r.party_label ||
      r.lender_name ||
      r.beneficiary_name ||
      r.object_name ||
      r.vehicle_label ||
      r.vehicle_name,
  );
}
export default function MasterWorkspace({
  initialSearch = "",
  initialTable = "master_vehicles",
  embedded = false,
  vehicleScope,
}: {
  initialSearch?: string;
  initialTable?: string;
  embedded?: boolean;
  vehicleScope?: string;
}) {
  const [inbox, setInbox] = useState(false);
  const { areaField, areaLabel, showAreaField } = useAreaUnit();
  const [partyScope, setPartyScope] = useState<string | null>(null),
    [fundScope, setFundScope] = useState<string | null>(vehicleScope || null),
    [scopeLabel, setScopeLabel] = useState("");
  const [table, setTable] = useState(initialTable),
    [search, setSearch] = useState(initialSearch),
    [query, setQuery] = useState(initialSearch),
    [offset, setOffset] = useState(0),
    [records, setRecords] = useState<MasterRecord[]>([]),
    [selected, setSelected] = useState<MasterRecord | null>(null),
    [creating, setCreating] = useState(false),
    [changes, setChanges] = useState<Record<string, unknown>>({}),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState<Record<string, unknown>[] | null>(null),
    [canWrite, setCanWrite] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let alive = true;
    void Promise.all([
      masterRpc<boolean>("has_master_permission", { feature: "master.write" }),
      masterRpc<boolean>("has_master_permission", {
        feature: "master.confidential",
      }),
    ])
      .then((v) => {
        if (alive) setCanWrite(v.every(Boolean));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 250);
    return () => clearTimeout(id);
  }, [search]);
  useEffect(() => {
    let alive = true;
    setRecords([]);
    setLoading(true);
    setError("");
    setSelected(null);
    setCreating(false);
    setHistory(null);
    setChanges({});
    void masterRpc<{ records: MasterRecord[] }>("master_query_records", {
      entity_type: table,
      search_text: query,
      page_limit: 30,
      page_offset: offset,
      vehicle_key: fundScope,
      party_key: partyScope,
    })
      .then((v) => {
        if (alive) setRecords(v.records);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [table, query, offset, refresh, fundScope, partyScope]);
  const fields = masterFields[table] || [];
  function select(r: MasterRecord | null) {
    setSelected(r);
    setCreating(!r);
    setChanges({});
    setReason("");
    setHistory(null);
    setError("");
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!Object.keys(changes).length)
        throw Error("변경할 내용을 입력해 주세요.");
      if (reason.trim().length < 3)
        throw Error("변경 사유를 3자 이상 입력해 주세요.");
      const result = await masterRpc<MasterRecord>("master_save_record", {
        entity_type: table,
        record_id: creating ? null : selected?.id,
        expected_revision: creating ? null : selected?.revision,
        changes,
        change_reason: reason.trim(),
      });
      setRecords((old) =>
        creating
          ? [result, ...old].slice(0, 30)
          : old.map((r) => (r.id === result.id ? result : r)),
      );
      setSelected(result);
      setCreating(false);
      setChanges({});
      setReason("");
      setHistory(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function showHistory() {
    if (!selected) return;
    setError("");
    try {
      setHistory(
        await masterRpc<Record<string, unknown>[]>("master_record_history", {
          entity_type: table,
          record_id: selected.id,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <DataReviewProvider onSaved={() => setRefresh((n) => n + 1)}>
      <section
        className={`master-workspace ${embedded ? "master-embedded" : ""}`}
        aria-label="MY 데이터 관리"
      >
        <header className="master-heading">
          <div>
            <span className="eyebrow">MY / IGIS</span>
            <h1>데이터 관리</h1>
            <p>자산과 기업을 중심으로 펀드·투자·대출 관계를 살펴보세요.</p>
          </div>
          <span className="pill">회원 전용</span>
        </header>
        <button
          className="review-record-button"
          onClick={() => setInbox((v) => !v)}
        >
          {inbox ? "데이터 관리로 돌아가기" : "수정 요청함"}
        </button>
        {inbox ? (
          <ReviewInbox onSaved={() => setRefresh((n) => n + 1)} />
        ) : (
          <>
            <nav className="master-tabs" aria-label="데이터 분류">
              {sections.map(([key, label]) => (
                <button
                  key={key}
                  aria-pressed={table === key}
                  onClick={() => {
                    setTable(key);
                    setOffset(0);
                  }}
                >
                  {label}
                </button>
              ))}
            </nav>
            {(fundScope || partyScope) && (
              <p className="master-note">
                {scopeLabel || "선택한 펀드"}의 연결 정보
                {!vehicleScope && (
                  <button
                    onClick={() => {
                      setPartyScope(null);
                      setFundScope(null);
                      setScopeLabel("");
                      setOffset(0);
                    }}
                  >
                    전체 보기
                  </button>
                )}
              </p>
            )}
            <div className="master-tools">
              <label>
                <Search size={17} />
                <input
                  aria-label="데이터 검색"
                  placeholder="이름·펀드코드 등으로 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <button onClick={() => setRefresh((n) => n + 1)}>새로고침</button>
              {canWrite &&
                ["master_assets", "master_parties", "master_vehicles"].includes(
                  table,
                ) && (
                  <button onClick={() => select(null)}>
                    <Plus size={16} /> 추가
                  </button>
                )}
            </div>
            {[
              "master_loan_positions",
              "master_beneficiary_positions",
              "master_aum_snapshots",
            ].includes(table) && (
              <p className="master-note">
                원본의 기준일·통화·약정/투입 기준을 구분해 표시합니다. 같은
                이름의 행도 별도 계약이나 비공개 참여자일 수 있어 각각
                보존합니다.
              </p>
            )}
            {table === "master_parties" && (
              <p className="master-note">
                현재 기업·기관 명부는 원본에 기재된 명칭 기준입니다. 법인·지점의
                동일성은 식별번호 확인 후 확정합니다.
              </p>
            )}
            {table === "master_beneficiary_positions" && (
              <p className="master-note">
                금액은 원화 환산액으로 판단했습니다. 원본에 통화 표기가 없어 AUM
                원화 금액과의 대조 근거를 보존했습니다.
              </p>
            )}
            {table === "master_aum_snapshots" && (
              <p className="master-note">
                AUM 입력일자는 현재 시스템 입력일로 해석하며, 향후 기준이 바뀔
                수 있습니다. 원본 날짜·해석 기준·실제 금액 기준일을 구분해
                관리합니다.
              </p>
            )}
            {error && (
              <div className="master-error" role="alert">
                {error}
              </div>
            )}
            <div className="master-layout">
              <div className="master-list" aria-busy={loading}>
                {loading ? (
                  <p className="master-empty">불러오는 중입니다.</p>
                ) : !records.length ? (
                  <p className="master-empty">해당하는 정보가 없습니다.</p>
                ) : (
                  records.map((r) => (
                    <button
                      key={r.id}
                      className={selected?.id === r.id ? "selected" : ""}
                      onClick={() => select(r)}
                    >
                      <strong>{title(r)}</strong>
                      <span>
                        {[
                          r.short_name || r.vehicle_short_name,
                          r.source_code || r.vehicle_source_code,
                          r.as_of ||
                            r.administrator_as_of ||
                            r.source_exported_on,
                        ]
                          .filter(Boolean)
                          .map(masterDisplay)
                          .join(" · ")}
                      </span>
                      {Boolean(r.vehicle_label) &&
                        r.vehicle_label !== title(r) && (
                          <small>{masterDisplay(r.vehicle_label)}</small>
                        )}
                      <ChevronRight size={16} />
                    </button>
                  ))
                )}
                <div className="master-paging">
                  <button
                    aria-label="이전 페이지"
                    disabled={offset === 0 || loading}
                    onClick={() => setOffset((n) => Math.max(0, n - 30))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>{Math.floor(offset / 30) + 1}</span>
                  <button
                    aria-label="다음 페이지"
                    disabled={records.length < 30 || loading}
                    onClick={() => setOffset((n) => n + 30)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="master-detail">
                {selected || creating ? (
                  <>
                    <div className="master-detail-title">
                      <div>
                        <h2>{creating ? "새 정보 추가" : title(selected!)}</h2>
                        {selected && (
                          <p>
                            수정 이력 {selected.revision} ·{" "}
                            {masterDisplay(selected.updated_at)
                              .replace("T", " ")
                              .slice(0, 16)}
                          </p>
                        )}
                      </div>
                      <button
                        aria-label="선택 닫기"
                        onClick={() => {
                          setSelected(null);
                          setCreating(false);
                        }}
                      >
                        <X size={20} />
                      </button>
                    </div>
                    {selected &&
                      ["master_parties", "master_vehicles"].includes(table) && (
                        <div className="master-tools">
                          <button
                            onClick={() => {
                              if (table === "master_parties") {
                                setPartyScope(selected.id);
                                setFundScope(null);
                                setTable("master_vehicles");
                              } else {
                                setPartyScope(null);
                                setFundScope(selected.id);
                                setTable("master_investments");
                              }
                              setScopeLabel(title(selected));
                              setSearch("");
                              setQuery("");
                              setOffset(0);
                            }}
                          >
                            연결된 펀드·투자·대출 보기
                          </button>
                        </div>
                      )}
                    <div className="master-fields">
                      {fields
                        .filter((f) => !creating || !f.readonly)
                        .filter(
                          (f) =>
                            !embedded ||
                            creating ||
                            !selected ||
                            showAreaField(f.key, selected),
                        )
                        .map((f) => {
                          const value = Object.hasOwn(changes, f.key)
                            ? changes[f.key]
                            : selected?.[f.key];
                          const editable = canWrite && !f.readonly;
                          return (
                            <label key={f.key}>
                              <span>
                                {embedded && !creating
                                  ? areaLabel(f.key, f.label)
                                  : f.label}
                              </span>
                              {!editable || !creating ? (
                                <output>
                                  {selected &&
                                  (!f.readonly || f.key === "source_code") ? (
                                    <ReviewValue
                                      entity={table}
                                      id={selected.id}
                                      field={f.key}
                                      label={f.label}
                                    >
                                      {(embedded
                                        ? areaField(f.key, value)
                                        : undefined) ?? masterDisplay(value)}
                                    </ReviewValue>
                                  ) : (
                                    ((embedded
                                      ? areaField(f.key, value)
                                      : undefined) ?? masterDisplay(value))
                                  )}
                                </output>
                              ) : f.type === "boolean" ? (
                                <select
                                  value={
                                    value === null || value === undefined
                                      ? ""
                                      : String(value)
                                  }
                                  onChange={(e) =>
                                    setChanges((v) => ({
                                      ...v,
                                      [f.key]:
                                        e.target.value === ""
                                          ? null
                                          : e.target.value === "true",
                                    }))
                                  }
                                >
                                  <option value="">미확인</option>
                                  <option value="true">예</option>
                                  <option value="false">아니오</option>
                                </select>
                              ) : (
                                <input
                                  type={f.type === "date" ? "date" : "text"}
                                  inputMode={
                                    f.type.startsWith("numeric") ||
                                    f.type === "integer"
                                      ? "decimal"
                                      : undefined
                                  }
                                  value={
                                    value === null || value === undefined
                                      ? ""
                                      : String(value)
                                  }
                                  onChange={(e) =>
                                    setChanges((v) => ({
                                      ...v,
                                      [f.key]:
                                        e.target.value === ""
                                          ? null
                                          : e.target.value,
                                    }))
                                  }
                                />
                              )}
                            </label>
                          );
                        })}
                    </div>
                    {selected && (
                      <ReviewRecordButton entity={table} id={selected.id} />
                    )}
                    {canWrite && creating && (
                      <div className="master-save">
                        <input
                          aria-label="변경 사유"
                          placeholder="변경 사유를 입력해 주세요"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                        <button
                          disabled={busy || !Object.keys(changes).length}
                          onClick={save}
                        >
                          <Save size={16} />
                          {busy ? "저장 중" : "변경 저장"}
                        </button>
                        {selected && (
                          <button onClick={showHistory}>
                            <History size={16} /> 이력
                          </button>
                        )}
                      </div>
                    )}
                    {history && (
                      <div className="master-history">
                        <h3>변경 이력</h3>
                        {history.map((h) => (
                          <article key={String(h.id)}>
                            <strong>{masterDisplay(h.change_reason)}</strong>
                            <p>
                              {masterDisplay(h.changed_at)
                                .replace("T", " ")
                                .slice(0, 19)}{" "}
                              ·{" "}
                              {h.change_origin === "my"
                                ? "MY 수정"
                                : h.change_origin === "initial_import"
                                  ? "최초 적재"
                                  : h.change_origin === "source_clarification"
                                    ? "자료 해석 보완"
                                    : "DB 변경"}{" "}
                              · {masterDisplay(h.changed_by_name || "시스템")}
                            </p>
                            <dl>
                              {(h.changed_fields as string[])
                                .filter((k) => fields.some((f) => f.key === k))
                                .map((k) => (
                                  <div key={k}>
                                    <dt>
                                      {fields.find((f) => f.key === k)?.label}
                                    </dt>
                                    <dd>
                                      {masterDisplay(
                                        (
                                          h.before_record as Record<
                                            string,
                                            unknown
                                          > | null
                                        )?.[k],
                                      )}{" "}
                                      →{" "}
                                      {masterDisplay(
                                        (
                                          h.after_record as Record<
                                            string,
                                            unknown
                                          > | null
                                        )?.[k],
                                      )}
                                    </dd>
                                  </div>
                                ))}
                            </dl>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="master-empty">
                    왼쪽에서 항목을 선택하면 상세정보와 변경 이력을 볼 수
                    있습니다.
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </DataReviewProvider>
  );
}
