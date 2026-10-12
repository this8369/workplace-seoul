import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { History, MessageSquareText, Pencil, X } from "lucide-react";
import { masterDisplay, masterRpc } from "../lib/master-data";
import { masterFields } from "../lib/master-fields";
import { registerGroups } from "../lib/building-register";
import "./DataReview.css";
export type ReviewTarget = {
  entity: string;
  id: string;
  field?: string;
  label?: string;
  assetId?: string;
};
type Field = { key: string; type: string; value: unknown };
type Context = {
  record: Record<string, unknown>;
  fields: Field[];
  can_edit: boolean;
  read_only: boolean;
  asset_ids: string[];
};
type Change = {
  id: number;
  entity: string;
  record_label: string;
  changed_at: string;
  changed_by_name: string | null;
  reason: string;
  changes: Record<string, { before: unknown; after: unknown }>;
};
const ReviewContext = createContext<{
  open: (target: ReviewTarget) => void;
  assetId?: string;
  version: number;
} | null>(null);
export function useDataReviewVersion() {
  return useContext(ReviewContext)?.version ?? 0;
}
export function fieldLabel(entity: string, key: string) {
  return (
    masterFields[entity]?.find((f) => f.key === key)?.label ||
    (entity === "building_register_records"
      ? registerGroups.flatMap((g) => g.fields).find((f) => f[0] === key)?.[1]
      : undefined) ||
    (
      {
        name: "이름",
        address: "주소",
        gross_area_m2: "연면적(㎡)",
        overview: "소개",
        completion_year: "준공연도",
        parking_spaces: "주차대수",
        floors_above: "지상층수",
        floors_below: "지하층수",
        deposit: "보증금",
        rent: "임대료",
        fee: "관리비",
        noc: "NOC",
        period: "기준분기",
        year: "연도",
        source_name: "출처",
        as_of: "자료 기준일",
        official_prices: "개별공시지가",
        geometry: "토지 경계",
        attributes: "세부 정보",
        value: "정보 값",
        amount_won: "거래금액(원)",
        seller: "매도인",
        buyer: "매수인",
        standard_address: "표준 주소",
        area_m2: "면적(㎡)",
        source_url: "출처 링크",
        source_as_of: "자료 기준일",
        verified_on: "확인일",
        area_basis: "면적 기준",
        vat_basis: "부가세 기준",
        rent_free: "렌트프리",
        note: "비고",
        scope: "거래 범위",
        kind: "종류",
        status: "상태",
        region: "권역",
        building_name: "건물명",
        company_name: "기업명",
        industry: "업종",
        floors: "입주 층",
        started_on: "시작일",
        ended_on: "종료일",
        traded_area_m2: "거래면적(㎡)",
        building_area_m2: "건물 연면적(㎡)",
        unit_price_won: "평당가(원)",
        typical_floor_rentable_pyeong: "기준층 임대면적(평)",
        typical_floor_exclusive_pyeong: "기준층 전용면적(평)",
        developer: "소유주·시행주체",
        contractor: "시공사",
        stage: "개발 단계",
        from_name: "이전 출발지",
        to_name: "이전 도착지",
        pnu: "필지 고유번호",
        is_primary: "대표 필지",
        land_category: "지목",
        land_use: "이용상황",
        terrain: "지형·고저",
        shape: "형상",
        road_condition: "도로조건",
        ownership_type: "소유 구분",
        ownership_changed_on: "소유권 변동일",
        coowners: "공유 인수",
        zoning: "토지이용계획",
        latitude: "위도",
        longitude: "경도",
        distance_m: "거리(m)",
        walking_minutes: "도보 시간(분)",
        walking_source: "도보 경로 출처",
        dong_name: "동 이름",
        floor_category: "층 구분",
        floor_number: "층수",
        floor_name: "층 이름",
        main_use: "주용도",
        other_use: "기타 용도",
        area_excluded: "면적 제외 여부",
        unit_name: "호 이름",
        area_category: "전유·공용 구분",
        field_key: "정보 항목",
        unit: "단위",
        source_period: "자료 기준분기",
        label: "표시명",
        title: "제목",
        credit: "사진 출처",
        license_name: "이용허락",
        captured_on: "촬영일",
        source_date: "원문 기준일",
      } as Record<string, string>
    )[key] ||
    key
  );
}
export function DataReviewBoundary({ children }: { children: ReactNode }) {
  const existing = useContext(ReviewContext);
  return existing ? (
    children
  ) : (
    <DataReviewProvider>{children}</DataReviewProvider>
  );
}
export function DataReviewProvider({
  children,
  assetId,
  onSaved,
}: {
  children: ReactNode;
  assetId?: string;
  onSaved?: () => void;
}) {
  const [target, setTarget] = useState<ReviewTarget | null>(null);
  const [version, setVersion] = useState(0);
  return (
    <ReviewContext.Provider value={{ open: setTarget, assetId, version }}>
      {children}
      {target && (
        <FieldDialog
          key={`${target.entity}:${target.id}:${target.field}`}
          target={{ ...target, assetId: target.assetId || assetId }}
          onClose={() => setTarget(null)}
          onSaved={() => {
            setVersion((n) => n + 1);
            onSaved?.();
          }}
        />
      )}
    </ReviewContext.Provider>
  );
}
export function ReviewValue({
  entity,
  id,
  field,
  label,
  children,
}: {
  entity: string;
  id?: string | null;
  field: string;
  label?: string;
  children: ReactNode;
}) {
  const ctx = useContext(ReviewContext);
  if (!ctx || !id || entity.startsWith("building_register_"))
    return <>{children}</>;
  return (
    <button
      type="button"
      className="review-value"
      title="정보 수정·요청 및 변경 이력"
      onClick={(e) => {
        e.stopPropagation();
        ctx.open({ entity, id, field, label });
      }}
    >
      {children}
      <Pencil className="review-pencil" size={11} aria-hidden="true" />
    </button>
  );
}
export function ReviewRecordButton({
  entity,
  id,
  field,
  label = "모든 항목·수정 이력",
}: {
  entity: string;
  id?: string | null;
  field?: string;
  label?: string;
}) {
  const ctx = useContext(ReviewContext);
  if (!ctx || !id) return null;
  return (
    <button
      type="button"
      className="review-record-button"
      onClick={() => ctx.open({ entity, id, field })}
    >
      <History size={14} />
      {entity.startsWith("building_register_") &&
      label === "모든 항목·수정 이력"
        ? "원천 데이터 갱신 이력"
        : label}
    </button>
  );
}
export function AssetHistoryButton() {
  const ctx = useContext(ReviewContext);
  if (!ctx?.assetId) return null;
  return (
    <button
      type="button"
      className="review-record-button"
      onClick={() =>
        ctx.open({
          entity: "buildings",
          id: ctx.assetId!,
          field: "__asset_history",
        })
      }
    >
      <History size={15} />
      자산 전체 수정 이력
    </button>
  );
}
export function FieldDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ReviewTarget;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [context, setContext] = useState<Context | null>(null),
    [field, setField] = useState(
      target.field === "__asset_history" ? "" : target.field || "",
    ),
    [value, setValue] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [mode, setMode] = useState<"field" | "record" | "asset">(
      target.field === "__asset_history"
        ? "asset"
        : target.field
          ? "field"
          : "record",
    ),
    [history, setHistory] = useState<Change[]>([]),
    [more, setMore] = useState(false),
    [offset, setOffset] = useState(0),
    [historyLoading, setHistoryLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    nonce = useRef(crypto.randomUUID());
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => {
    let alive = true;
    setError("");
    void masterRpc<Context>("data_field_context", {
      entity: target.entity,
      rid: target.id,
    })
      .then((x) => {
        if (alive) {
          setContext(x);
          setField((f) =>
            x.fields.some((x) => x.key === f) ? f : x.fields[0]?.key || "",
          );
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [target.entity, target.id, attempt]);
  const selected = context?.fields.find((f) => f.key === field);
  useEffect(() => {
    setValue(
      selected?.value == null
        ? ""
        : typeof selected.value === "object"
          ? JSON.stringify(selected.value, null, 2)
          : String(selected.value),
    );
    setReason("");
    nonce.current = crypto.randomUUID();
  }, [selected]);
  useEffect(() => {
    setMessage("");
  }, [field]);
  const asset = target.assetId || context?.asset_ids[0];
  useEffect(() => {
    if (!context || !field) return;
    let alive = true;
    setHistoryLoading(true);
    setHistory([]);
    void masterRpc<{ records: Change[]; has_more: boolean }>(
      "data_field_history",
      {
        entity: target.entity,
        rid: target.id,
        field: mode === "field" ? field : null,
        asset_key: mode === "asset" ? asset : null,
        page_offset: offset,
      },
    )
      .then((x) => {
        if (alive) {
          setHistory(x.records);
          setMore(x.has_more);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [context, field, mode, asset, offset, target.entity, target.id]);
  async function submit() {
    if (!context || !selected || busy) return;
    setBusy(true);
    setError("");
    try {
      if (reason.trim().length < 3)
        throw Error("수정 사유를 3자 이상 입력해 주세요.");
      const proposed =
        value === ""
          ? null
          : selected.type === "boolean"
            ? value === "true"
            : selected.type === "jsonb" || selected.type === "json"
              ? JSON.parse(value)
              : value;
      if (context.can_edit) {
        await masterRpc("data_save_field", {
          entity: target.entity,
          rid: target.id,
          field,
          expected: selected.value,
          proposed,
          reason: reason.trim(),
        });
        setAttempt((v) => v + 1);
        onSaved?.();
        setMessage("수정 내용을 저장하고 이력을 남겼습니다.");
      } else {
        await masterRpc("data_submit_request", {
          entity: target.entity,
          rid: target.id,
          field,
          expected: selected.value,
          proposed,
          reason: reason.trim(),
          client_key: nonce.current,
        });
        setMessage(
          "기획추진실 전기영·이관용·이시정 담당자의 MY 요청함에 접수했습니다.",
        );
      }
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "입력한 데이터 형식을 확인해 주세요."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="data-review-dialog"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span>정보 관리</span>
          <h2>{target.label || "정보 수정 및 이력"}</h2>
        </div>
        <button disabled={busy} onClick={onClose} aria-label="정보 관리 닫기">
          <X size={21} />
        </button>
      </header>
      {error && (
        <p className="review-error" role="alert">
          {error}
          <button onClick={() => setAttempt((n) => n + 1)} disabled={busy}>
            최신 정보 다시 불러오기
          </button>
        </p>
      )}
      {!context ? (
        <p>정보를 불러오는 중입니다.</p>
      ) : (
        <>
          <label className="review-label">
            항목
            <select
              value={field}
              disabled={busy}
              onChange={(e) => {
                setField(e.target.value);
                setOffset(0);
              }}
            >
              {context.fields.map((f) => (
                <option value={f.key} key={f.key}>
                  {fieldLabel(target.entity, f.key)}
                </option>
              ))}
            </select>
          </label>
          {context.read_only ? (
            <p className="context-note">
              <strong>현재 값: {masterDisplay(selected?.value)}</strong>
              <br />
              건축물대장은 공식 원천 자료입니다. 직접 수정과 수정 요청은
              제공하지 않으며, 원천 데이터 갱신 이력을 확인할 수 있습니다.
            </p>
          ) : (
            <div className="review-edit">
              <p>
                현재 값 <strong>{masterDisplay(selected?.value)}</strong>
              </p>
              <label className="review-label">
                {context.can_edit ? "수정할 값" : "수정 요청할 값"}
                {selected?.type === "boolean" ? (
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  >
                    <option value="">미확인</option>
                    <option value="true">예</option>
                    <option value="false">아니오</option>
                  </select>
                ) : (
                  <textarea
                    rows={selected?.type === "jsonb" ? 6 : 2}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                )}
              </label>
              <label className="review-label">
                수정 사유
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="확인한 내용과 근거를 적어주세요"
                />
              </label>
              <button
                className="review-submit"
                disabled={busy || reason.trim().length < 3 || !!message}
                onClick={submit}
              >
                {context.can_edit ? (
                  <Pencil size={15} />
                ) : (
                  <MessageSquareText size={15} />
                )}{" "}
                {busy
                  ? "처리 중"
                  : context.can_edit
                    ? "수정 저장"
                    : "기획추진실에 수정 요청"}
              </button>
              {message && <p role="status">{message}</p>}
              {!context.can_edit && (
                <small>요청은 전기영·이관용·이시정 담당자가 확인합니다.</small>
              )}
            </div>
          )}
          <div className="review-history">
            <h3>수정 이력</h3>
            <div className="review-history-tabs">
              {(
                ["field", "record", ...(asset ? ["asset"] : [])] as (
                  "field" | "record" | "asset"
                )[]
              ).map((m) => (
                <button
                  key={m}
                  aria-pressed={mode === m}
                  onClick={() => {
                    setMode(m);
                    setOffset(0);
                  }}
                >
                  {m === "field"
                    ? "이 항목"
                    : m === "record"
                      ? "이 데이터 전체"
                      : "이 자산 전체"}
                </button>
              ))}
            </div>
            {historyLoading ? (
              <p>이력을 불러오는 중입니다.</p>
            ) : !history.length ? (
              <p>기록된 수정 이력이 없습니다.</p>
            ) : (
              history.map((h) => (
                <article key={h.id}>
                  <p>{h.record_label}</p>
                  <strong>
                    {h.changed_by_name || "시스템"} ·{" "}
                    {new Date(h.changed_at).toLocaleString("ko-KR")}
                  </strong>
                  <p>{h.reason}</p>
                  {Object.entries(h.changes).map(([k, v]) => (
                    <div key={k}>
                      <span>{fieldLabel(h.entity, k)}</span>
                      <del>{masterDisplay(v.before)}</del>
                      <b>→ {masterDisplay(v.after)}</b>
                    </div>
                  ))}
                </article>
              ))
            )}
            <footer>
              <button
                disabled={!offset || historyLoading}
                onClick={() => setOffset((n) => Math.max(0, n - 50))}
              >
                이전
              </button>
              <button
                disabled={!more || historyLoading}
                onClick={() => setOffset((n) => n + 50)}
              >
                다음
              </button>
            </footer>
          </div>
        </>
      )}
    </dialog>,
    document.body,
  );
}
export function ReviewInbox({ onSaved }: { onSaved?: () => void }) {
  const [data, setData] = useState<{
      can_review: boolean;
      requests: Record<string, any>[];
    } | null>(null),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [attempt, setAttempt] = useState(0),
    [notes, setNotes] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState("");
  useEffect(() => {
    let alive = true;
    void masterRpc<typeof data>("data_review_inbox", { page_offset: offset })
      .then((x) => {
        if (alive) setData(x);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [offset, attempt]);
  async function decide(id: string, approve: boolean) {
    setBusy(id);
    setError("");
    try {
      await masterRpc("data_decide_request", {
        request_key: id,
        approve,
        note: notes[id] || "",
      });
      setAttempt((n) => n + 1);
      if (approve) onSaved?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="review-inbox">
      <h2>{data?.can_review ? "기획추진실 수정 요청함" : "내 수정 요청"}</h2>
      <p>전기영 · 이관용 · 이시정 담당자가 요청을 확인하고 처리합니다.</p>
      {error && (
        <p className="review-error" role="alert">
          {error}
        </p>
      )}
      {!data ? (
        <p>불러오는 중입니다.</p>
      ) : !data.requests.length ? (
        <p>접수된 요청이 없습니다.</p>
      ) : (
        data.requests.map((q) => (
          <article key={q.id}>
            <h3>{q.record_label}</h3>
            <header>
              <strong>{fieldLabel(q.entity, q.field_key)}</strong>
              <span>
                {q.status === "pending"
                  ? "확인 대기"
                  : q.status === "approved"
                    ? "반영 완료"
                    : "반려"}
              </span>
            </header>
            <p>
              {q.requester_name} ·{" "}
              {new Date(q.requested_at).toLocaleString("ko-KR")}
            </p>
            <p>
              {masterDisplay(q.before_value)} →{" "}
              <b>{masterDisplay(q.proposed_value)}</b>
            </p>
            <p>{q.reason}</p>
            {q.decision_note && (
              <p>
                처리: {q.decided_by_name} · {q.decision_note}
              </p>
            )}
            {data.can_review && q.status === "pending" && (
              <>
                <textarea
                  aria-label="처리 의견"
                  placeholder="처리 의견을 입력해 주세요"
                  value={notes[q.id] || ""}
                  onChange={(e) =>
                    setNotes((n) => ({ ...n, [q.id]: e.target.value }))
                  }
                />
                <div>
                  <button
                    disabled={!!busy || (notes[q.id] || "").trim().length < 3}
                    onClick={() => decide(q.id, true)}
                  >
                    승인하고 반영
                  </button>
                  <button
                    disabled={!!busy || (notes[q.id] || "").trim().length < 3}
                    onClick={() => decide(q.id, false)}
                  >
                    반려
                  </button>
                </div>
              </>
            )}
          </article>
        ))
      )}
      <footer>
        <button
          disabled={!offset}
          onClick={() => setOffset((n) => Math.max(0, n - 30))}
        >
          이전
        </button>
        <button
          disabled={!data || data.requests.length < 30}
          onClick={() => setOffset((n) => n + 30)}
        >
          다음
        </button>
      </footer>
    </section>
  );
}
