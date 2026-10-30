import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Check, Plus, X } from "lucide-react";
import { publicSupabase } from "../lib/public-supabase";
import { masterRpc } from "../lib/master-data";
import {
  exactOverviewTopic,
  overviewItemInput,
  suggestOverviewTopics,
  type OverviewItems,
  type OverviewTopic,
} from "../lib/overview-topics";
import {
  ReviewValue,
  useDataReviewActions,
  useDataReviewVersion,
} from "./DataReview";
import { useAreaUnit } from "./AreaUnit";
import "./OverviewExtraFields.css";

export default function OverviewExtraFields({
  assetId,
  expanded,
  onExpand,
  onExistingTopic,
}: {
  assetId: string;
  expanded: boolean;
  onExpand: () => void;
  onExistingTopic: (topic: OverviewTopic) => void;
}) {
  const version = useDataReviewVersion(),
    review = useDataReviewActions();
  const { formatArea } = useAreaUnit();
  const [data, setData] = useState<OverviewItems | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const active = expanded || adding;
  useEffect(() => {
    if (!active) return;
    let alive = true;
    setError("");
    void (async () => {
      if (!publicSupabase) throw Error("서비스 연결을 확인해 주세요.");
      const { data, error } = await publicSupabase.rpc(
        "asset_overview_fields",
        { asset_key: assetId },
      );
      if (error) throw Error("항목을 불러오지 못했습니다.");
      if (alive) setData(data as OverviewItems);
    })().catch((e) => {
      if (alive) setError(e.message);
    });
    return () => {
      alive = false;
    };
  }, [assetId, version, active, attempt]);
  const close = () => setAdding(false);
  const display = (value: string | number | boolean, unit: string | null) => {
    if (typeof value === "boolean") return value ? "O" : "X";
    if (typeof value === "number") {
      if (unit && ["㎡", "m²", "평"].includes(unit))
        return formatArea(value, unit === "평" ? "평" : "m²");
      return `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit ? ` ${unit}` : ""}`;
    }
    return `${value}${unit ? ` ${unit}` : ""}`;
  };
  return (
    <>
      {expanded && (
        <>
          <dl className="overview-facts overview-extra-facts">
            {data?.items.map((item) => (
              <div className="overview-fact" key={item.id}>
                <dt>{item.label}</dt>
                <dd>
                  <ReviewValue
                    entity="building_facts"
                    id={item.id}
                    field="value"
                    allowedFields={["value", "unit"]}
                    label={item.label}
                  >
                    {display(item.value, item.unit)}
                  </ReviewValue>
                </dd>
              </div>
            ))}
          </dl>
          {error && (
            <p className="overview-load-error" role="alert">
              {error}
              <button onClick={() => setAttempt((n) => n + 1)}>
                다시 불러오기
              </button>
            </p>
          )}
        </>
      )}
      {expanded && !review?.readOnly && (
        <div className="overview-extra-footer">
          <button
            type="button"
            onClick={() => {
              if (review?.beginEdit()) setAdding(true);
            }}
          >
            <Plus size={14} />
            항목 추가
          </button>
        </div>
      )}
      {adding && (
        <OverviewItemDialog
          data={data}
          error={error}
          assetId={assetId}
          onRetry={() => setAttempt((n) => n + 1)}
          onClose={close}
          onExistingTopic={(topic) => {
            close();
            onExistingTopic(topic);
          }}
          onExistingItem={(id) => {
            const item = data?.items.find((x) => x.id === id);
            close();
            review?.open({
              entity: "building_facts",
              id,
              field: "value",
              allowedFields: ["value", "unit"],
              label: item?.label,
            });
          }}
          onSaved={() => {
            close();
            onExpand();
            review?.saved();
          }}
        />
      )}
    </>
  );
}

export function OverviewItemDialog({
  data,
  assetId,
  error: loadError,
  onRetry,
  onClose,
  onExistingTopic,
  onExistingItem,
  onSaved,
}: {
  data: OverviewItems | null;
  assetId: string;
  error: string;
  onRetry: () => void;
  onClose: () => void;
  onExistingTopic: (topic: OverviewTopic) => void;
  onExistingItem: (id: string) => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    id = useId();
  const [name, setName] = useState(""),
    [value, setValue] = useState("");
  const [unit, setUnit] = useState(""),
    [reason, setReason] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false),
    [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState<boolean | null>(null);
  const exact = exactOverviewTopic(data?.topics || [], name);
  const existing =
    exact && data?.items.find((item) => item.topic_code === exact.code);
  const suggestions = suggestOverviewTopics(data?.topics || [], name);
  const duplicate = existing || exact?.entity;
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => {
    if (!data) return;
    let alive = true;
    void masterRpc<{ can_edit: boolean }>("data_field_context", {
      entity: "buildings",
      rid: data.building_id,
    })
      .then((x) => {
        if (alive) setCanEdit(x.can_edit);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [data?.building_id]);
  function choose(topic: OverviewTopic) {
    setName(topic.label);
    setUnit(topic.unit || "");
    setShowSuggestions(false);
    setActive(-1);
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (existing) {
      onExistingItem(existing.id);
      return;
    }
    if (exact?.entity) {
      onExistingTopic(exact);
      return;
    }
    if (!canEdit || !data) return;
    setBusy(true);
    setError("");
    try {
      await masterRpc("asset_overview_add_item", {
        asset_key: assetId,
        topic_name: exact?.label || name.trim(),
        item_value: overviewItemInput(value),
        item_unit: unit.trim() || null,
        change_reason: reason.trim(),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return createPortal(
    <dialog
      ref={dialog}
      className="data-review-dialog overview-item-dialog"
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2 id={`${id}-title`}>자산개요 항목 추가</h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="항목 추가 닫기"
        >
          <X size={20} />
        </button>
      </header>
      {loadError && (
        <p role="alert" className="review-error">
          {loadError} <button onClick={onRetry}>다시 불러오기</button>
        </p>
      )}
      {error && (
        <p role="alert" className="review-error">
          {error}
        </p>
      )}
      {canEdit === false && (
        <p role="alert" className="review-error">
          항목을 추가할 권한이 없습니다.
        </p>
      )}
      <form onSubmit={submit}>
        <label className="review-label" htmlFor={`${id}-name`}>
          항목명
        </label>
        <div className="overview-topic-combobox">
          <input
            id={`${id}-name`}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showSuggestions && suggestions.length > 0}
            aria-controls={`${id}-suggestions`}
            aria-activedescendant={
              showSuggestions && active >= 0
                ? `${id}-option-${active}`
                : undefined
            }
            autoComplete="off"
            maxLength={80}
            required
            value={name}
            disabled={!data || busy}
            onChange={(e) => {
              setName(e.target.value);
              setUnit(
                exactOverviewTopic(data?.topics || [], e.target.value)?.unit ||
                  "",
              );
              setShowSuggestions(true);
              setActive(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setShowSuggestions(false)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape" && showSuggestions) {
                e.preventDefault();
                e.stopPropagation();
                setShowSuggestions(false);
              }
              if (
                (e.key === "ArrowDown" || e.key === "ArrowUp") &&
                suggestions.length
              ) {
                e.preventDefault();
                setShowSuggestions(true);
                setActive(
                  (n) =>
                    (n +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      suggestions.length) %
                    suggestions.length,
                );
              }
              if (
                e.key === "Enter" &&
                showSuggestions &&
                active >= 0 &&
                suggestions[active]
              ) {
                e.preventDefault();
                choose(suggestions[active]);
              }
            }}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div
              id={`${id}-suggestions`}
              role="listbox"
              className="overview-topic-options"
            >
              {suggestions.map((topic, i) => (
                <button
                  type="button"
                  role="option"
                  key={topic.code}
                  id={`${id}-option-${i}`}
                  aria-selected={active === i}
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(topic)}
                >
                  {topic.label}
                  {topic.code === exact?.code && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
        {!duplicate && (
          <>
            <label className="review-label">
              내용
              <textarea
                rows={2}
                required
                maxLength={2000}
                value={value}
                disabled={busy}
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
            <label className="review-label">
              단위
              <input
                value={unit}
                maxLength={30}
                disabled={busy}
                onChange={(e) => setUnit(e.target.value)}
              />
            </label>
            <label className="review-label">
              등록 사유
              <textarea
                rows={2}
                required
                maxLength={4000}
                value={reason}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </>
        )}
        <button
          type="submit"
          className="review-submit"
          disabled={
            busy ||
            !data ||
            !name.trim() ||
            (!duplicate && (!canEdit || !value.trim() || !reason.trim()))
          }
        >
          {busy
            ? "저장 중"
            : existing
              ? "기존 항목 수정"
              : exact?.entity
                ? "기존 항목 보기"
                : "항목 저장"}
        </button>
      </form>
    </dialog>,
    document.body,
  );
}
