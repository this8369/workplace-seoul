import { useEffect, useId, useState } from "react";
import { Plus, X, Search, Leaf, TrainFront } from "lucide-react";
import { masterRpc } from "../lib/master-data";
import { supabase } from "../lib/supabase";
import {
  areaBases,
  overviewLabels,
  certificateStates,
  subwayLines,
  tagCategories,
  type Certification,
  type CertificationOption,
  type Connection,
} from "../lib/asset-overview";
import "./AssetOverview.css";
function arrayValue<T>(value: string): T[] {
  try {
    const v = JSON.parse(value);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function Tags({
  field,
  value,
  onChange,
}: {
  field: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const tags = arrayValue<string>(value);
  const [query, setQuery] = useState(""),
    [options, setOptions] = useState<string[]>([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const id = useId();
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      void masterRpc<string[]>("asset_name_suggestions", {
        category: tagCategories[field],
        query,
      })
        .then((x) => {
          if (live) {
            setOptions(x.filter((n) => !tags.includes(n)));
            setActive(-1);
          }
        })
        .catch(() => {
          if (live) setOptions([]);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [field, query, value]);
  const add = (name: string) => {
    const text = name.trim();
    if (!text || text.length > 160) return;
    onChange(JSON.stringify([...new Set([...tags, text])]));
    setQuery("");
    setOpen(false);
  };
  return (
    <div className="overview-tag-editor">
      <div className="overview-edit-chips">
        {tags.map((name, i) => (
          <span key={name}>
            {name}
            <button
              type="button"
              aria-label={`${name} 삭제`}
              onClick={() =>
                onChange(JSON.stringify(tags.filter((_, n) => n !== i)))
              }
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="overview-autocomplete">
        <Search size={16} />
        <input
          role="combobox"
          aria-label="등록명 검색 또는 추가"
          aria-expanded={open}
          aria-controls={id}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
          value={query}
          maxLength={160}
          placeholder={
            field === "green_spaces"
              ? "대형 공원·강·호수 이름 검색 또는 추가"
              : "이름 검색 또는 새 이름 입력"
          }
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(n + 1, options.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => Math.max(n - 1, 0));
            }
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              add(active >= 0 && open ? options[active] : query);
            }
          }}
        />
        <button
          type="button"
          onClick={() => add(query)}
          disabled={!query.trim()}
          aria-label="이름 추가"
        >
          <Plus size={17} />
        </button>
        {open && (
          <div id={id} role="listbox" className="overview-suggestions">
            {options.map((n, i) => (
              <button
                id={`${id}-${i}`}
                role="option"
                aria-selected={active === i}
                type="button"
                key={n}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(n)}
              >
                {n}
              </button>
            ))}
            {query.trim() &&
              !options.some(
                (n) => n.toLowerCase() === query.trim().toLowerCase(),
              ) && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(query)}
                >
                  <Plus size={14} /> ‘{query.trim()}’ 추가
                </button>
              )}
            {!options.length && !query && (
              <span>새 이름을 입력해 등록할 수 있습니다.</span>
            )}
          </div>
        )}
      </div>
      <small>
        Enter로 추가할 수 있습니다. 저장 후 다른 자산에서도 검색됩니다.
      </small>
    </div>
  );
}
export default function OverviewFieldEditor({
  field,
  value,
  onChange,
}: {
  field: string;
  value: string;
  onChange: (s: string) => void;
}) {
  const [options, setOptions] = useState<CertificationOption[]>([]),
    [catalogError, setCatalogError] = useState(false);
  useEffect(() => {
    if (field !== "certifications" || !supabase) return;
    let live = true;
    void supabase
      .from("asset_certification_options")
      .select("*")
      .order("sort_order")
      .then(({ data, error }) => {
        if (live) {
          setOptions(data || []);
          setCatalogError(!!error);
        }
      });
    return () => {
      live = false;
    };
  }, [field]);
  if (tagCategories[field])
    return <Tags field={field} value={value} onChange={onChange} />;
  if (field.endsWith("_area_basis"))
    return (
      <select
        aria-label={overviewLabels[field]}
        value={value || "unknown"}
        onChange={(e) => onChange(e.target.value)}
      >
        {Object.entries(areaBases).map(([k, v]) => (
          <option value={k} key={k}>
            {v}
          </option>
        ))}
      </select>
    );
  if (field === "subway_connections") {
    const rows = arrayValue<Connection>(value);
    const update = (i: number, patch: Partial<Connection>) =>
      onChange(
        JSON.stringify(rows.map((x, n) => (n === i ? { ...x, ...patch } : x))),
      );
    return (
      <div className="overview-structured-editor">
        {rows.map((r, i) => (
          <div className="overview-editor-item" key={i}>
            <header>
              <TrainFront size={18} />
              <strong>연결역 {i + 1}</strong>
              <button
                type="button"
                aria-label="연결역 삭제"
                onClick={() =>
                  onChange(JSON.stringify(rows.filter((_, n) => n !== i)))
                }
              >
                <X size={17} />
              </button>
            </header>
            <label>
              역 이름
              <input
                value={r.station_name}
                maxLength={100}
                placeholder="예: 역삼역"
                onChange={(e) => update(i, { station_name: e.target.value })}
              />
            </label>
            <label>
              직연결 여부
              <select
                value={
                  r.direct_connection == null ? "" : String(r.direct_connection)
                }
                onChange={(e) =>
                  update(i, {
                    direct_connection:
                      e.target.value === "" ? null : e.target.value === "true",
                  })
                }
              >
                <option value="">미확인</option>
                <option value="true">직연결 O</option>
                <option value="false">직연결 X</option>
              </select>
            </label>
            <label>
              호선 추가
              <select
                value=""
                onChange={(e) =>
                  update(i, {
                    lines: [...new Set([...r.lines, e.target.value])],
                  })
                }
              >
                <option value="">호선 선택</option>
                {subwayLines.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
            <div className="overview-edit-chips">
              {r.lines.map((l) => (
                <span key={l}>
                  {l}
                  <button
                    type="button"
                    aria-label={`${l} 삭제`}
                    onClick={() =>
                      update(i, { lines: r.lines.filter((x) => x !== l) })
                    }
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="overview-add"
          onClick={() =>
            onChange(
              JSON.stringify([
                ...rows,
                { station_name: "", lines: [], direct_connection: null },
              ]),
            )
          }
        >
          <Plus size={15} /> 연결역 추가
        </button>
        <small>
          반경 500m 인근 역은 별도로 표시됩니다. 직연결은 확인한 경우에만 선택해
          주세요.
        </small>
      </div>
    );
  }
  if (field === "certifications") {
    const rows = arrayValue<Certification>(value);
    const update = (i: number, patch: Partial<Certification>) =>
      onChange(
        JSON.stringify(rows.map((x, n) => (n === i ? { ...x, ...patch } : x))),
      );
    const schemes = [...new Set(options.map((o) => o.scheme))];
    return (
      <div className="overview-structured-editor">
        {catalogError && (
          <p role="alert">
            인증 목록을 불러오지 못했습니다. 창을 다시 열어 주세요.
          </p>
        )}
        {rows.map((c, i) => {
          const option = options.find((o) => o.code === c.option_code);
          return (
            <div className="overview-editor-item" key={i}>
              <header>
                <Leaf size={18} />
                <strong>인증 {i + 1}</strong>
                <button
                  type="button"
                  aria-label="인증 삭제"
                  onClick={() =>
                    onChange(JSON.stringify(rows.filter((_, n) => n !== i)))
                  }
                >
                  <X size={17} />
                </button>
              </header>
              <div className="overview-editor-grid">
                <label>
                  인증 종류
                  <select
                    aria-label="인증 종류"
                    value={option?.scheme || ""}
                    onChange={(e) =>
                      update(i, {
                        option_code: options.find(
                          (o) => o.scheme === e.target.value,
                        )!.code,
                      })
                    }
                  >
                    {schemes.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  등급
                  <select
                    aria-label="등급"
                    value={c.option_code}
                    onChange={(e) => update(i, { option_code: e.target.value })}
                  >
                    {options
                      .filter((o) => o.scheme === option?.scheme)
                      .map((o) => (
                        <option value={o.code} key={o.code}>
                          {o.grade}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  상태
                  <select
                    aria-label="인증 상태"
                    value={c.status}
                    onChange={(e) => update(i, { status: e.target.value })}
                  >
                    {Object.entries(certificateStates).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  취득일
                  <input
                    type="date"
                    value={c.certified_on || ""}
                    onChange={(e) =>
                      update(i, { certified_on: e.target.value })
                    }
                  />
                </label>
                <label>
                  유효기간
                  <input
                    type="date"
                    value={c.expires_on || ""}
                    onChange={(e) => update(i, { expires_on: e.target.value })}
                  />
                </label>
              </div>
              <label>
                인증서 링크
                <input
                  type="url"
                  placeholder="https://"
                  value={c.certificate_url || ""}
                  onChange={(e) =>
                    update(i, { certificate_url: e.target.value })
                  }
                />
              </label>
              <label>
                인증 로고 이미지 링크
                <input
                  type="url"
                  placeholder="공식 인증 로고의 https:// 이미지 주소"
                  value={c.logo_url || ""}
                  onChange={(e) => update(i, { logo_url: e.target.value })}
                />
              </label>
            </div>
          );
        })}
        <button
          type="button"
          className="overview-add"
          disabled={!options.length}
          onClick={() =>
            onChange(
              JSON.stringify([
                ...rows,
                {
                  option_code:
                    options.find(
                      (o) => !rows.some((c) => c.option_code === o.code),
                    )?.code || options[0].code,
                  status: "unknown",
                },
              ]),
            )
          }
        >
          <Plus size={15} /> 인증 추가
        </button>
      </div>
    );
  }
  return (
    <input
      aria-label={overviewLabels[field]}
      type="number"
      min="0"
      step="any"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="미확인"
    />
  );
}
export function hasOverviewEditor(field: string) {
  return (
    !!tagCategories[field] ||
    [
      "subway_connections",
      "certifications",
      "office_area_basis",
      "retail_area_basis",
      "ceiling_height_m",
      "lease_span_m",
      "office_area_m2",
      "retail_area_m2",
      "contracted_capacity_mw",
      "site_area_m2",
      "floor_area_ratio",
      "efficiency_pct",
    ].includes(field)
  );
}
