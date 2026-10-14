import { imageEditPatch, keepPrimaryOnPublish } from "../lib/image-edit";
import PhotoBatchImport from "./PhotoBatchImport";
import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  ExternalLink,
  Search,
  Check,
  X,
  Upload,
  Images,
  Star,
} from "lucide-react";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import { supabase } from "../lib/supabase";
import { prepareWebp, type BuildingImage } from "../lib/building-images";
import BuildingPhoto from "./BuildingPhoto";
import "./PhotoManager.css";
import ImagePager, { galleryKey } from "./ImagePager";
import { adjacentImageId } from "../lib/image-gallery";

export default function PhotoManager({
  buildings,
  images,
  onRefresh,
  initialBuilding = "",
  loading = false,
  loadError = false,
  onRetry,
  onClose,
  onBuildingChange,
}: {
  buildings: Building[];
  images: BuildingImage[];
  onRefresh: () => Promise<void>;
  initialBuilding?: string;
  loading?: boolean;
  loadError?: boolean;
  onRetry: () => void;
  onClose: () => void;
  onBuildingChange: (id: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  const [componentBuildings, setComponentBuildings] = useState<Building[]>([]);
  useEffect(() => {
    let live = true;
    if (supabase)
      void supabase
        .from("buildings")
        .select("*")
        .eq("complex_scope", "component")
        .order("name")
        .then(({ data, error }) => {
          if (live && !error) setComponentBuildings(data || []);
        });
    return () => {
      live = false;
    };
  }, []);
  const availableBuildings = [
    ...new Map(
      [...buildings, ...componentBuildings].map((b) => [b.id, b]),
    ).values(),
  ];
  const [selected, setSelected] = useState<string>("");
  const [operationBusy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const busy = operationBusy || batchBusy;
  const [newBuilding, setNewBuilding] = useState(initialBuilding);
  const [newKind, setNewKind] = useState<BuildingImage["kind"]>("photo");
  const row = images.find((i) => i.id === selected);
  const [draft, setDraft] = useState<BuildingImage>();
  const [matched, setMatched] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const dirty =
    !!draft && !!row && JSON.stringify(draft) !== JSON.stringify(row);
  function requestAction(action: () => void) {
    if (busy) return;
    if (dirty) setPendingAction(() => action);
    else action();
  }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy]);
  useEffect(() => {
    setDraft(row ? { ...row } : undefined);
    setMatched(false);
  }, [row]);
  const names = new Map(availableBuildings.map((b) => [b.id, b]));
  const filtered = images
    .filter(
      (i) =>
        (!newBuilding || i.building_id === newBuilding) &&
        (!filter ||
          (filter === "missing"
            ? !i.object_path
            : i.review_status === filter)) &&
        `${names.get(i.building_id)?.name} ${names.get(i.building_id)?.address} ${i.title} ${i.floor_label || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  useEffect(() => {
    if (loading || loadError || dirty || busy) return;
    if (!filtered.some((image) => image.id === selected)) {
      setSelected(
        (filtered.find((image) => image.is_primary) || filtered[0])?.id || "",
      );
    }
  }, [
    images,
    query,
    filter,
    newBuilding,
    loading,
    loadError,
    dirty,
    busy,
    selected,
  ]);
  const imageIndex = Math.max(
    0,
    filtered.findIndex((image) => image.id === selected),
  );
  function moveImage(step: -1 | 1) {
    const id = adjacentImageId(filtered, selected, step);
    if (id) requestAction(() => setSelected(id));
  }
  useEffect(() => {
    const editor = panel.current?.querySelector<HTMLElement>(".photo-editor");
    if (editor) editor.scrollTop = 0;
  }, [selected]);
  const building = names.get(newBuilding);
  const counts = images.filter(
    (image) => !newBuilding || image.building_id === newBuilding,
  );
  const kindLabel = (kind: BuildingImage["kind"]) =>
    kind === "floor_plan"
      ? "평면도"
      : kind === "rendering"
        ? "조감도"
        : "건물 사진";
  async function addPhoto(file: File, sortOrder: number) {
    if (!supabase || !newBuilding) return;
    const converted = await prepareWebp(file);
    const paths = [
      `${newBuilding}/${crypto.randomUUID()}.webp`,
      `${newBuilding}/${crypto.randomUUID()}.webp`,
    ];
    const storage = supabase.storage.from("building-images");
    try {
      for (const [index, blob] of [
        converted.detail,
        converted.thumbnail,
      ].entries()) {
        const { error } = await storage.upload(paths[index], blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
        if (error) throw error;
      }
      const { data, error } = await supabase
        .from("building_images")
        .insert({
          building_id: newBuilding,
          title: `${building?.name || "자산"} ${kindLabel(newKind)}`,
          kind: newKind,
          sort_order: sortOrder,
          source_name: "직접 등록",
          object_path: paths[0],
          thumbnail_path: paths[1],
        })
        .select("id")
        .single();
      if (error) throw error;
      setQuery("");
      setFilter("");
      setSelected(data.id);
    } catch (error) {
      await storage.remove(paths);
      throw error;
    }
  }
  async function addPhotos(files: File[]) {
    const failures: string[] = [];
    let done = 0;
    const firstOrder =
      Math.max(0, ...counts.map((image) => image.sort_order || 0)) + 1;
    for (const [index, file] of files.entries()) {
      setMessage(`이미지 등록 중 ${index + 1} / ${files.length}`);
      try {
        await addPhoto(file, firstOrder + index);
        done++;
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "등록 실패"}`,
        );
      }
    }
    if (failures.length)
      throw Error(
        `${done}개 등록 · ${failures.length}개 실패 (${failures.slice(0, 3).join(", ")}). 실패한 파일만 다시 시도해 주세요.`,
      );
  }
  async function run(
    action: () => Promise<void>,
    successMessage = "저장했습니다.",
  ) {
    if (busy) return;
    setBusy(true);
    setMessage("저장 중입니다…");
    try {
      await action();
      setMessage(successMessage);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "저장하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      try {
        await onRefresh();
      } catch {
        setMessage(
          "처리 결과를 다시 불러오지 못했습니다. 창을 다시 열어 확인해 주세요.",
        );
      }
      setBusy(false);
    }
  }
  async function save(replacingFile = false) {
    if (!draft || !row || !supabase) return;
    const patch = imageEditPatch(row, draft, replacingFile);
    if (!Object.keys(patch).length) return;
    const { error } = await supabase
      .from("building_images")
      .update(patch)
      .eq("id", draft.id);
    if (error) throw error;
  }
  async function upload(file: File) {
    if (!draft || !supabase) return;
    const converted = await prepareWebp(file);
    const paths = [
      `${draft.building_id}/${crypto.randomUUID()}.webp`,
      `${draft.building_id}/${crypto.randomUUID()}.webp`,
    ];
    const storage = supabase.storage.from("building-images");
    try {
      for (const [index, blob] of [
        converted.detail,
        converted.thumbnail,
      ].entries()) {
        const { error } = await storage.upload(paths[index], blob, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false,
        });
        if (error) throw error;
      }
      await save(true);
      const { error } = await supabase
        .from("building_images")
        .update({
          object_path: paths[0],
          thumbnail_path: paths[1],
          inherited_from_image_id: null,
        })
        .eq("id", draft.id);
      if (error) throw error;
    } catch (e) {
      await storage.remove(paths);
      throw e;
    }
  }
  function field<K extends keyof BuildingImage>(
    key: K,
    value: BuildingImage[K],
  ) {
    if (draft) setDraft({ ...draft, [key]: value });
  }
  return (
    <section
      ref={panel}
      className="asset-popup photo-manager photo-manager-popup"
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-manager-title"
      tabIndex={-1}
      onKeyDown={(event) => {
        galleryKey(
          event,
          moveImage,
          !busy && !loading && !pendingAction && filtered.length > 1,
        );
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          requestAction(onClose);
        }
        if (event.key === "Tab") {
          const items = Array.from(
            panel.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary",
            ) || [],
          ).filter((item) => item.getClientRects().length);
          const first = items[0],
            last = items[items.length - 1];
          if (
            event.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (
            !event.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <header className="photo-heading">
        <div className="photo-heading-title">
          <span className="photo-heading-eyebrow">자산 이미지</span>
          <h1 id="photo-manager-title">사진·평면도 관리</h1>
          <p>
            {building?.name || "전체 자산"} <span>· {counts.length}개</span>
          </p>
        </div>
        <button
          className="photo-manager-close"
          type="button"
          disabled={busy}
          onClick={() => requestAction(onClose)}
          aria-label="사진 관리 닫기"
        >
          <X size={21} />
        </button>
      </header>
      {pendingAction && (
        <div className="photo-unsaved" role="alert">
          <span>저장하지 않은 수정 내용이 있습니다.</span>
          <button type="button" onClick={() => setPendingAction(null)}>
            계속 편집
          </button>
          <button
            type="button"
            onClick={() => {
              pendingAction();
              setPendingAction(null);
            }}
          >
            저장하지 않고 이동
          </button>
        </div>
      )}
      <div className="photo-manager-body">
        <div className="photo-management-controls">
          <div className="photo-scope">
            <label>
              <span>관리할 자산</span>
              <select
                aria-label="관리할 자산"
                value={newBuilding}
                disabled={busy}
                onChange={(event) => {
                  const id = event.target.value;
                  requestAction(() => {
                    setNewBuilding(id);
                    setSelected("");
                    setQuery("");
                    setFilter("");
                    onBuildingChange(id);
                  });
                }}
              >
                <option value="">전체 자산</option>
                {availableBuildings.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="photo-upload-controls">
              <select
                aria-label="추가할 이미지 종류"
                value={newKind}
                disabled={busy}
                onChange={(event) =>
                  setNewKind(event.target.value as BuildingImage["kind"])
                }
              >
                <option value="photo">건물 사진</option>
                <option value="rendering">조감도</option>
                <option value="floor_plan">평면도</option>
              </select>
              <button
                className="photo-primary-button"
                disabled={!newBuilding || busy || loading || loadError}
                onClick={() =>
                  requestAction(() => uploadInput.current?.click())
                }
              >
                <Upload size={16} />
                파일 추가
              </button>
              <input
                ref={uploadInput}
                multiple
                type="file"
                hidden
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const files = Array.from(event.target.files || []);
                  if (files.length)
                    void run(
                      () => addPhotos(files),
                      `${files.length}개 이미지를 등록했습니다. 내용을 확인하고 사진 또는 평면도를 게시해 주세요.`,
                    );
                  event.target.value = "";
                }}
              />
            </div>
          </div>
          {!newBuilding && (
            <p className="photo-scope-hint">
              자산을 선택하면 해당 자산에 사진과 평면도를 추가할 수 있습니다.
            </p>
          )}
          <div className="photo-controls">
            <label className="photo-search">
              <Search size={16} />
              <input
                aria-label="이미지 검색"
                placeholder={
                  newBuilding
                    ? "사진 제목 또는 층 검색"
                    : "건물명 또는 주소 검색"
                }
                disabled={busy}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="사진 상태"
              disabled={busy}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">전체 사진</option>
              <option value="candidate">검수 대기</option>
              <option value="approved">승인됨</option>
              <option value="missing">파일 등록 전</option>
              <option value="rejected">보류</option>
            </select>
          </div>
          {!initialBuilding && (
            <details className="photo-batch-tools">
              <summary>여러 자산 일괄 등록</summary>
              <PhotoBatchImport
                buildings={availableBuildings}
                onRefresh={onRefresh}
                onBusyChange={setBatchBusy}
              />
            </details>
          )}
        </div>
        {message && (
          <p className="photo-message" role="status">
            {message}
          </p>
        )}
        <div className="photo-layout">
          <div className="photo-list">
            <div className="photo-list-heading">
              <strong>등록 이미지</strong>
              <span>{filtered.length}개</span>
            </div>
            {loading ? (
              <p className="photo-muted" role="status">
                이미지를 불러오고 있습니다.
              </p>
            ) : loadError ? (
              <div className="photo-load-error" role="alert">
                <p>이미지를 불러오지 못했습니다.</p>
                <button onClick={onRetry}>다시 불러오기</button>
              </div>
            ) : filtered.length ? (
              filtered.map((i) => (
                <button
                  disabled={busy}
                  key={i.id}
                  onClick={() => requestAction(() => setSelected(i.id))}
                  aria-pressed={selected === i.id}
                  className={selected === i.id ? "selected" : ""}
                >
                  <span className="photo-mini">
                    <BuildingPhoto image={i} memberOnly />
                  </span>
                  <span>
                    <strong>
                      {newBuilding
                        ? i.floor_label || i.title || kindLabel(i.kind)
                        : names.get(i.building_id)?.name || i.title}
                    </strong>
                    <small>
                      {i.is_primary
                        ? "대표 사진"
                        : i.review_status === "approved"
                          ? "승인됨"
                          : i.review_status === "rejected"
                            ? "보류"
                            : "검수 대기"}{" "}
                      · {kindLabel(i.kind)}
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <p className="photo-muted">
                등록된 이미지가 없습니다. 위의 파일 추가 버튼으로 등록해 주세요.
              </p>
            )}
          </div>
          {!loading && !loadError && draft ? (
            <form
              className="photo-editor"
              key={draft.id}
              onSubmit={(e) => {
                e.preventDefault();
                void run(save);
              }}
            >
              <fieldset disabled={busy}>
                <legend>{names.get(draft.building_id)?.name}</legend>
                <p className="photo-muted">
                  {names.get(draft.building_id)?.address}
                </p>
                <div
                  className="photo-preview"
                  data-kind={draft.kind}
                  tabIndex={0}
                  aria-label="이미지 미리보기 · 좌우 방향키로 이동"
                >
                  {draft.object_path ? (
                    <BuildingPhoto image={draft} detail memberOnly />
                  ) : (
                    <div>
                      <ImagePlus size={32} />
                      <p>이미지 파일을 등록해 주세요</p>
                      <small>
                        건물 사진·조감도·평면도를 추가할 수 있습니다.
                      </small>
                    </div>
                  )}
                  <ImagePager
                    index={imageIndex}
                    total={filtered.length}
                    onMove={moveImage}
                    disabled={busy}
                  />
                </div>
                <div className="photo-fields photo-focal-controls">
                  <label className="photo-zoom-control">
                    확대·축소 {draft.zoom_percent ?? 100}%
                    <input
                      type="range"
                      min="100"
                      max="300"
                      step="1"
                      value={draft.zoom_percent ?? 100}
                      onChange={(e) => field("zoom_percent", +e.target.value)}
                    />
                  </label>
                  <label>
                    가로 중심 {draft.focal_x}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={draft.focal_x}
                      onChange={(e) => field("focal_x", +e.target.value)}
                    />
                  </label>
                  <label>
                    세로 중심 {draft.focal_y}%
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={draft.focal_y}
                      onChange={(e) => field("focal_y", +e.target.value)}
                    />
                  </label>
                </div>
                <div className="photo-source">
                  {safeSourceUrl(draft.source_url) && (
                    <a
                      href={safeSourceUrl(draft.source_url)!}
                      target="_blank"
                      rel="noreferrer"
                    >
                      출처 자료 열기 <ExternalLink size={13} />
                    </a>
                  )}
                  <span>
                    {draft.source_date && `${draft.source_date} 자료`}
                  </span>
                </div>
                <label className="photo-upload">
                  <Upload size={18} />
                  이미지 파일 교체
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void run(() => upload(file));
                      e.target.value = "";
                    }}
                  />
                </label>
                <small className="photo-muted">
                  JPG·PNG·WebP, 최대 25MB · 화면에 맞게 자동 최적화
                </small>
                <h2 className="photo-section-title">이미지 정보</h2>
                <div className="photo-fields">
                  <label>
                    사진 제목
                    <input
                      required
                      value={draft.title}
                      onChange={(e) => field("title", e.target.value)}
                    />
                  </label>
                  <label>
                    이미지 종류
                    <select
                      value={draft.kind}
                      onChange={(e) =>
                        field("kind", e.target.value as BuildingImage["kind"])
                      }
                    >
                      <option value="photo">실제 사진</option>
                      <option value="rendering">조감도</option>
                      <option value="floor_plan">평면도</option>
                    </select>
                  </label>
                  {draft.kind === "floor_plan" && (
                    <label>
                      동·층 표기
                      <input
                        value={draft.floor_label || ""}
                        placeholder="예: A동 기준층 / 10층"
                        onChange={(e) => field("floor_label", e.target.value)}
                      />
                    </label>
                  )}
                  <label>
                    표시 순서
                    <input
                      type="number"
                      step="1"
                      value={draft.sort_order || 0}
                      onChange={(e) =>
                        field("sort_order", Math.trunc(Number(e.target.value)))
                      }
                    />
                    <small className="photo-muted">
                      낮은 숫자부터 표시하며, 게시된 첫 사진이 대표 사진입니다.
                    </small>
                  </label>
                  <label>
                    출처명
                    <input
                      required
                      value={draft.source_name}
                      onChange={(e) => field("source_name", e.target.value)}
                    />
                  </label>
                  <label>
                    출처 주소
                    <input
                      type="url"
                      pattern="https://.*"
                      value={draft.source_url || ""}
                      onChange={(e) => field("source_url", e.target.value)}
                    />
                  </label>
                  <label>
                    촬영일
                    <input
                      type="date"
                      value={draft.captured_on || ""}
                      onChange={(e) => field("captured_on", e.target.value)}
                    />
                  </label>
                  <label>
                    저작자·크레딧
                    <input
                      value={draft.credit}
                      onChange={(e) => field("credit", e.target.value)}
                    />
                  </label>
                </div>
                <label>
                  검수 메모
                  <textarea
                    value={draft.review_note}
                    onChange={(e) => field("review_note", e.target.value)}
                  />
                </label>
                <label className="photo-check">
                  <input
                    type="checkbox"
                    checked={matched}
                    onChange={(e) => setMatched(e.target.checked)}
                  />
                  이미지의 건물·동·층이 해당 자산과 일치합니다.
                </label>
                {draft.is_primary && (
                  <p className="photo-muted">
                    위치·확대율은 대표 사진을 유지하며 반영됩니다. 이미지
                    파일이나 정보를 바꾸면 다시 게시해 주세요.
                  </p>
                )}
                <div className="photo-actions" aria-label="이미지 저장 및 적용">
                  <button type="submit" disabled={!dirty}>
                    수정 내용 저장
                  </button>
                  <button
                    type="button"
                    disabled={!matched || !draft.object_path}
                    onClick={() =>
                      run(async () => {
                        await save();
                        const { error } = await supabase!.rpc(
                          "approve_building_image",
                          {
                            image_id: draft.id,
                            make_primary:
                              !!row && keepPrimaryOnPublish(row, draft),
                          },
                        );
                        if (error) throw error;
                      })
                    }
                  >
                    <Check size={14} />
                    {draft.kind === "floor_plan" ? "평면도 게시" : "사진 게시"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      !matched ||
                      !draft.object_path ||
                      draft.kind === "floor_plan"
                    }
                    onClick={() =>
                      run(async () => {
                        await save();
                        const { error } = await supabase!.rpc(
                          "set_primary_building_image",
                          { image_id: draft.id },
                        );
                        if (error) throw error;
                      })
                    }
                  >
                    <Star size={14} />
                    대표 사진 적용
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(async () => {
                        const { error } = await supabase!
                          .from("building_images")
                          .update({
                            is_primary: false,
                            review_status: "rejected",
                          })
                          .eq("id", draft.id);
                        if (error) throw error;
                      })
                    }
                  >
                    보류
                  </button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="photo-empty">
              <Images size={38} />
              <h2>
                {loadError
                  ? "이미지를 불러오지 못했습니다"
                  : loading
                    ? "이미지를 불러오는 중입니다"
                    : "자산의 이미지를 채워 주세요"}
              </h2>
              <p>
                {newBuilding
                  ? "건물 사진, 조감도, 평면도를 등록하고 관리하세요."
                  : "자산을 선택하거나 목록에서 이미지를 선택하세요."}
              </p>
              {newBuilding && !loading && !loadError && (
                <button
                  className="photo-primary-button"
                  disabled={busy}
                  onClick={() =>
                    requestAction(() => uploadInput.current?.click())
                  }
                >
                  <Upload size={16} />첫 이미지 추가
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
