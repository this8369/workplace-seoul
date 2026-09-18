import PhotoBatchImport from "./PhotoBatchImport";
import { useEffect, useState } from "react";
import { ImagePlus, ExternalLink, Search, Check } from "lucide-react";
import type { Building } from "../lib/domain";
import { safeSourceUrl } from "../lib/domain";
import { supabase } from "../lib/supabase";
import { prepareWebp, type BuildingImage } from "../lib/building-images";
import BuildingPhoto from "./BuildingPhoto";

export default function PhotoManager({
  buildings,
  images,
  onRefresh,
}: {
  buildings: Building[];
  images: BuildingImage[];
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [newBuilding, setNewBuilding] = useState("");
  const row = images.find((i) => i.id === selected);
  const [draft, setDraft] = useState<BuildingImage>();
  const [matched, setMatched] = useState(false);
  useEffect(() => {
    setDraft(row ? { ...row } : undefined);
    setMatched(false);
  }, [row]);
  const names = new Map(buildings.map((b) => [b.id, b]));
  const filtered = images.filter(
    (i) =>
      (!filter ||
        (filter === "missing" ? !i.object_path : i.review_status === filter)) &&
      `${names.get(i.building_id)?.name} ${names.get(i.building_id)?.address}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      await onRefresh();
      setMessage("저장했습니다.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "저장하지 못했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || !supabase) return;
    const { error } = await supabase
      .from("building_images")
      .update({
        title: draft.title.trim(),
        kind: draft.kind,
        source_name: draft.source_name.trim(),
        source_url: draft.source_url || null,
        captured_on: draft.captured_on || null,
        credit: draft.credit.trim(),
        license_name: draft.license_name.trim(),
        rights_status: draft.rights_status,
        rights_note: draft.rights_note.trim(),
        review_note: draft.review_note,
        focal_x: draft.focal_x,
        focal_y: draft.focal_y,
        review_status: "candidate",
        is_primary: false,
        reviewed_at: null,
        reviewed_by: null,
      })
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
      await save();
      const { error } = await supabase
        .from("building_images")
        .update({ object_path: paths[0], thumbnail_path: paths[1] })
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
    <section className="photo-manager" aria-label="사진 관리">
      <header className="photo-heading">
        <div>
          <h1>사진 관리</h1>
          <p>
            대표 사진 {images.filter((i) => i.is_primary).length}개 · 검수 대기{" "}
            {images.filter((i) => i.review_status === "candidate").length}개
          </p>
        </div>
        <span className="pill">WebP 자동 저장</span>
      </header>
      <PhotoBatchImport buildings={buildings} onRefresh={onRefresh} />
      <div className="photo-controls">
        <label className="photo-search">
          <Search size={16} />
          <input
            aria-label="사진 건물 검색"
            placeholder="건물명 또는 주소"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="사진 상태"
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
      <div className="photo-add">
        <select
          aria-label="사진 추가할 건물"
          value={newBuilding}
          onChange={(e) => setNewBuilding(e.target.value)}
        >
          <option value="">사진을 추가할 건물 선택</option>
          {buildings
            .filter((b) =>
              `${b.name} ${b.address}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
        <button
          disabled={!newBuilding || busy}
          onClick={() =>
            run(async () => {
              const { data, error } = await supabase!
                .from("building_images")
                .insert({
                  building_id: newBuilding,
                  title: `${names.get(newBuilding)?.name} 외관`,
                  source_name: "직접 등록",
                })
                .select("id")
                .single();
              if (error) throw error;
              setSelected(data.id);
            })
          }
        >
          <ImagePlus size={15} />
          사진 추가
        </button>
      </div>
      {message && (
        <p className="photo-message" role="status">
          {message}
        </p>
      )}
      <div className="photo-layout">
        <div className="photo-list">
          {filtered.length ? (
            filtered.map((i) => (
              <button
                disabled={busy}
                key={i.id}
                onClick={() => setSelected(i.id)}
                aria-pressed={selected === i.id}
                className={selected === i.id ? "selected" : ""}
              >
                <span className="photo-mini">
                  <BuildingPhoto image={i} />
                </span>
                <span>
                  <strong>{names.get(i.building_id)?.name || i.title}</strong>
                  <small>
                    {i.is_primary
                      ? "대표 사진"
                      : i.review_status === "approved"
                        ? "승인됨"
                        : i.review_status === "rejected"
                          ? "보류"
                          : "검수 대기"}{" "}
                    · {i.object_path ? "WebP" : "출처 후보"}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <p className="photo-muted">
              등록된 후보가 없습니다. 건물을 선택해 사진을 추가하세요.
            </p>
          )}
        </div>
        {draft ? (
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
              <div className="photo-preview">
                {draft.object_path ? (
                  <BuildingPhoto image={draft} detail />
                ) : (
                  <div>
                    <ImagePlus size={32} />
                    <p>원본 사진 등록 전</p>
                    <small>출처 자료에서 해당 건물의 외관을 확인하세요.</small>
                  </div>
                )}
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
                <span>{draft.source_date && `${draft.source_date} 자료`}</span>
              </div>
              <label className="photo-upload">
                사진 파일 선택
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
                JPG·PNG·WebP → 카드 480px / 상세 1,600px WebP · 원본보다
                확대하지 않음
              </small>
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
                  </select>
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
              <div className="photo-fields">
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
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={matched}
                  onChange={(e) => setMatched(e.target.checked)}
                />
                사진의 건물·동과 외관이 해당 자산과 일치합니다.
              </label>
              {draft.is_primary && (
                <p className="photo-muted">
                  내용을 수정해 저장하면 대표 사진에서 해제됩니다. 확인 후 다시
                  지정하세요.
                </p>
              )}
              <div className="photo-actions">
                <button type="submit">검수 내용 저장</button>
                <button
                  type="button"
                  disabled={!matched || !draft.object_path}
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
                  <Check size={14} />
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
            <ImagePlus size={30} />
            <p>왼쪽에서 사진 후보를 선택하세요.</p>
            <small>출처 확인 → WebP 등록 → 대표 사진 적용</small>
          </div>
        )}
      </div>
    </section>
  );
}
