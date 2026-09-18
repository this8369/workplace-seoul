import PhotoManager from "./components/PhotoManager";
import BuildingPhoto from "./components/BuildingPhoto";
import { fetchBuildingImages, primaryImage } from "./lib/building-images";
import { districts } from "./lib/map-regions";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  Building2,
  Check,
  ChevronRight,
  Compass,
  FileText,
  ImagePlus,
  Layers3,
  LogOut,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import NaverMap, { type MapCamera } from "./components/NaverMap";
import { fetchCatalog, supabase } from "./lib/supabase";
import { filterBuildings, formatArea, type Building } from "./lib/domain";
import { AssetWorkspace, Transactions } from "./components/AssetWorkspace";
import { emptyCatalog, type Catalog } from "./lib/catalog";
const initialQuery = new URLSearchParams(location.search).get("q") || "";
export default function App() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (window.matchMedia("(max-width: 760px)").matches) return true;
    try {
      return localStorage.getItem("workplace-sidebar-collapsed") === "true";
    } catch {
      return false;
    }
  });
  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("workplace-sidebar-collapsed", String(next));
    } catch {
      /* Layout still works when storage is unavailable. */
    }
  }
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [buildings, setBuildings] = useState<Building[]>([]),
    [load, setLoad] = useState<"loading" | "ready" | "error" | "setup">(
      supabase ? "loading" : "setup",
    );
  const [query, setQuery] = useState(initialQuery),
    [region, setRegion] = useState(""),
    [status, setStatus] = useState(""),
    [view, setView] = useState<"all" | "saved" | "transactions" | "images">(
      "all",
    );
  const [selected, setSelected] = useState<string | null>(null),
    [compare, setCompare] = useState<string[]>([]),
    [showCompare, setShowCompare] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set()),
    [session, setSession] = useState<Session | null>(null),
    [login, setLogin] = useState(false),
    [email, setEmail] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  const mapCamera = useRef<MapCamera | null>(null);
  const [homeRequest, setHomeRequest] = useState(0);
  function goHome() {
    setView("all");
    setSelected(null);
    mapCamera.current = null;
    setHomeRequest((value) => value + 1);
  }
  const loadGeneration = useRef(0);
  const refresh = useCallback(() => {
    const generation = ++loadGeneration.current;
    setLoad("loading");
    setCatalog(emptyCatalog);
    setBuildings([]);
    setSelected(null);
    setCompare([]);
    fetchCatalog()
      .then((data) => {
        if (generation !== loadGeneration.current) return;
        setCatalog(data);
        setBuildings(data.buildings);
        setLoad(supabase ? "ready" : "setup");
      })
      .catch(() => {
        if (generation === loadGeneration.current) setLoad("error");
      });
  }, []);
  useEffect(refresh, [refresh, session?.user.id]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, value) =>
      setSession(value),
    );
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setSaved(new Set());
    if (session && supabase)
      supabase
        .from("favorites")
        .select("building_id")
        .then(({ data, error }) => {
          if (!alive) return;
          if (error) setNotice("관심 건물을 불러오지 못했습니다.");
          else setSaved(new Set(data?.map((r) => r.building_id)));
        });
    return () => {
      alive = false;
    };
  }, [session]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        search.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const url = new URL(location.href);
    query ? url.searchParams.set("q", query) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
  }, [query]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  const results = useMemo(
    () =>
      filterBuildings(
        buildings,
        query,
        region,
        status,
        view === "saved" ? saved : undefined,
      ),
    [buildings, query, region, status, view, saved],
  );
  const active = buildings.find((b) => b.id === selected),
    regions = [
      ...new Set([
        ...districts.map((d) => d.key),
        ...buildings.map((b) => b.region),
      ]),
    ];
  const select = useCallback((id: string) => setSelected(id), []);
  const openDialog = () => {
    if (compare.length < 2) return;
    setShowCompare(true);
    dialog.current?.showModal();
  };
  async function toggleSave(id: string) {
    if (!supabase || !session) {
      setLogin(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const exists = saved.has(id);
    const { error } = exists
      ? await supabase
          .from("favorites")
          .delete()
          .eq("building_id", id)
          .eq("user_id", session.user.id)
      : await supabase
          .from("favorites")
          .insert({ building_id: id, user_id: session.user.id });
    setBusy(false);
    if (error) {
      setNotice("저장하지 못했습니다. 다시 시도해 주세요.");
      return;
    }
    setSaved((previous) => {
      const next = new Set(previous);
      exists ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleCompare(id: string) {
    setCompare((previous) =>
      previous.includes(id)
        ? previous.filter((v) => v !== id)
        : previous.length < 3
          ? [...previous, id]
          : previous,
    );
    if (compare.length === 3 && !compare.includes(id))
      setNotice("최대 3개 건물을 비교할 수 있습니다.");
  }
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
    });
    setBusy(false);
    setNotice(
      error
        ? "로그인 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "이메일로 로그인 링크를 보냈습니다.",
    );
    if (!error) setLogin(false);
  }
  return (
    <div className="app">
      <aside className={`sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}>
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="Workplace Seoul"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            goHome();
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            w.
          </span>
          <span className="brand-name">
            Workplace <span className="brand-city">Seoul</span>
          </span>
        </a>
        <div className="sidebar-heading">
          <div className="nav-label">WORKSPACE</div>
          <button
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
            title={sidebarCollapsed ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!sidebarCollapsed}
            aria-controls="primary-navigation"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <nav id="primary-navigation" aria-label="주 메뉴">
          <button
            className={view === "all" ? "current" : ""}
            aria-label="공간 탐색"
            title="공간 탐색"
            onClick={goHome}
          >
            <Compass size={18} />
            <span className="nav-text">공간 탐색</span>
            <ChevronRight size={14} />
          </button>
          <button
            className={view === "saved" ? "current" : ""}
            aria-label="관심 건물"
            title="관심 건물"
            onClick={() => {
              setView("saved");
              setSelected(null);
            }}
          >
            <Bookmark size={18} />
            <span className="nav-text">관심 건물</span>
            <span className="nav-count">{saved.size || ""}</span>
          </button>
          <button
            aria-label="빌딩 매매사례"
            title="빌딩 매매사례"
            className={view === "transactions" ? "current" : ""}
            onClick={() => {
              setView("transactions");
              setSelected(null);
            }}
          >
            <FileText size={18} />
            <span className="nav-text">빌딩 매매사례</span>
          </button>
        </nav>
        <div className="sidebar-note">
          <span>공간을 보는 새로운 기준</span>
          <p>
            연면적 1만 평 이상의 오피스.
            <br />한 건물씩, 깊이 있게.
          </p>
        </div>
        {catalog.review && (
          <nav className="admin-navigation" aria-label="관리 메뉴">
            <div className="nav-label">관리</div>
            <button
              aria-label="사진 관리"
              title="사진 관리"
              className={view === "images" ? "current" : ""}
              onClick={() => {
                setView("images");
                setSelected(null);
              }}
            >
              <ImagePlus size={18} />
              <span className="nav-text">사진 관리</span>
            </button>
          </nav>
        )}
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {session ? session.user.email?.[0].toUpperCase() || "W" : "W"}
          </span>
          {session && (
            <div className="account-identity">
              <span title={session.user.email}>{session.user.email}</span>
              <small>
                {load !== "ready"
                  ? "로그인됨"
                  : catalog.review
                    ? "검수 계정"
                    : "일반 계정"}
              </small>
            </div>
          )}
          <button
            className={session ? "account-action" : "account-login"}
            aria-label={session ? "로그아웃" : "로그인"}
            title={session ? "로그아웃" : "로그인"}
            onClick={() =>
              session
                ? supabase?.auth.signOut().then(({ error }) => {
                    if (error) setNotice("로그아웃하지 못했습니다.");
                  })
                : setLogin(true)
            }
          >
            {session ? (
              <LogOut size={16} />
            ) : (
              <>
                로그인
                <ArrowUpRight size={14} />
              </>
            )}
          </button>
        </div>
      </aside>
      <main>
        {session &&
          load === "ready" &&
          !catalog.review &&
          buildings.length === 0 && (
            <div className="access-notice" role="status">
              <div>
                <strong>
                  로그인은 완료됐지만 검수 자료를 볼 권한이 없습니다.
                </strong>
                <p>
                  {session.user.email} · 권한이 등록된 계정인지 확인해 주세요.
                </p>
              </div>
              <button onClick={refresh}>권한 다시 확인</button>
            </div>
          )}
        {!active && view !== "images" && (
          <section className="toolbar" aria-label="검색 및 필터">
            <div className="search">
              <Search size={18} />
              <input
                ref={search}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  view === "transactions"
                    ? "건물명, 매수인 또는 매도인 검색"
                    : "건물명 또는 주소 검색"
                }
                aria-label={
                  view === "transactions" ? "매매사례 검색" : "건물 검색"
                }
              />
              {query ? (
                <button aria-label="검색 초기화" onClick={() => setQuery("")}>
                  <X size={14} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
            </div>
            <div className="filters">
              <label>
                <MapPin size={14} />
                <select
                  aria-label="권역"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  <option value="">전국</option>
                  {regions.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              {view !== "transactions" && (
                <label>
                  <Layers3 size={14} />
                  <select
                    aria-label="건물 상태"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">전체 상태</option>
                    <option value="operating">운영 중</option>
                    <option value="development">개발 중</option>
                  </select>
                </label>
              )}
              <span className="fixed-filter">
                <SlidersHorizontal size={14} />
                1만 평 이상
              </span>
            </div>
          </section>
        )}
        {view === "images" && catalog.review && !active ? (
          <PhotoManager
            buildings={buildings}
            images={catalog.images}
            onRefresh={async () => {
              const images = await fetchBuildingImages();
              setCatalog((previous) => ({ ...previous, images }));
            }}
          />
        ) : active ? (
          <AssetWorkspace
            key={active.id}
            building={active}
            catalog={catalog}
            onClose={() => setSelected(null)}
            onBuilding={select}
            saved={saved.has(active.id)}
            onSave={() => toggleSave(active.id)}
          />
        ) : view === "transactions" ? (
          load === "ready" ? (
            <Transactions
              catalog={catalog}
              query={query}
              region={region}
              onBuilding={select}
            />
          ) : (
            <div className="empty">
              <h2>
                {load === "error"
                  ? "거래 정보를 불러오지 못했습니다"
                  : load === "loading"
                    ? "거래 정보를 불러오고 있습니다"
                    : "거래 정보를 준비하고 있습니다"}
              </h2>
              {load === "error" && <button onClick={refresh}>다시 시도</button>}
            </div>
          )
        ) : (
          <div className="workspace">
            <section className="results" aria-label="건물 목록">
              <div className="results-heading">
                <h1>{view === "all" ? "오피스 둘러보기" : "관심 건물"}</h1>
                <p>
                  {load === "ready"
                    ? `${results.length.toLocaleString()}개의 공간`
                    : "공간의 안팎을 연결합니다"}
                </p>
              </div>
              <div className="results-scroll">
                {load !== "ready" ? (
                  <div className="empty">
                    <Building2 size={30} />
                    <h2>
                      {load === "loading"
                        ? "공간 정보를 불러오고 있습니다"
                        : load === "error"
                          ? "정보를 불러오지 못했습니다"
                          : "첫 번째 공간을 준비하고 있습니다"}
                    </h2>
                    <p>
                      {load === "setup"
                        ? "검증된 건물 정보를 이곳에서 만나보세요."
                        : load === "error"
                          ? "연결 상태를 확인하고 다시 시도해 주세요."
                          : "잠시만 기다려 주세요."}
                    </p>
                    {load === "error" && (
                      <button onClick={refresh}>다시 시도</button>
                    )}
                  </div>
                ) : results.length === 0 ? (
                  <div className="empty">
                    <Search size={26} />
                    <h2>
                      {view === "saved"
                        ? "저장한 건물이 없습니다"
                        : buildings.length === 0
                          ? "공간 정보를 공개 준비 중입니다"
                          : "조건에 맞는 건물이 없습니다"}
                    </h2>
                    <p>
                      {view === "saved"
                        ? "관심 있는 건물의 북마크를 눌러보세요."
                        : buildings.length === 0
                          ? "검수 계정으로 로그인하면 수집된 자료를 확인할 수 있습니다."
                          : "다른 검색어나 지역으로 살펴보세요."}
                    </p>
                  </div>
                ) : (
                  results.map((b) => (
                    <article
                      key={b.id}
                      className={`building-card ${b.id === selected ? "selected" : ""}`}
                    >
                      <button
                        className="card-main"
                        onClick={() => select(b.id)}
                      >
                        <span className="building-art" aria-hidden="true">
                          <BuildingPhoto
                            image={primaryImage(catalog.images, b.id)}
                          />
                        </span>
                        <span className="card-info">
                          <span className="eyebrow">
                            {b.region} ·{" "}
                            {b.status === "operating" ? "운영 중" : "개발 중"}
                          </span>
                          <strong title={b.name}>{b.name}</strong>
                          <span className="address" title={b.address}>
                            {b.address}
                          </span>
                          <span className="area">
                            {formatArea(b.gross_area_m2)}
                            <span>
                              연면적
                              {b.area_basis === "planned" ? " · 계획" : ""}
                            </span>
                          </span>
                        </span>
                      </button>
                      <div className="card-actions">
                        <button
                          aria-label={`${b.name} 관심 건물 ${saved.has(b.id) ? "해제" : "저장"}`}
                          aria-pressed={saved.has(b.id)}
                          disabled={busy}
                          onClick={() => toggleSave(b.id)}
                        >
                          <Bookmark
                            size={15}
                            fill={saved.has(b.id) ? "currentColor" : "none"}
                          />
                        </button>
                        <button
                          aria-label={`${b.name} 비교 ${compare.includes(b.id) ? "해제" : "선택"}`}
                          aria-pressed={compare.includes(b.id)}
                          onClick={() => toggleCompare(b.id)}
                        >
                          {compare.includes(b.id) ? (
                            <Check size={14} />
                          ) : (
                            <Layers3 size={14} />
                          )}
                          {compare.includes(b.id) ? "비교 선택됨" : "비교"}
                        </button>
                        <span>
                          {b.verified_on
                            ? `확인 ${b.verified_on}`
                            : `원본 ${b.source_as_of || "기준일 미확인"}`}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
              {compare.length > 0 ? (
                <section className="compare-bar" aria-label="비교할 건물">
                  <div className="compare-heading">
                    <strong aria-live="polite">
                      비교할 건물 {compare.length}/3
                    </strong>
                    <button onClick={() => setCompare([])}>초기화</button>
                  </div>
                  <div className="compare-selection">
                    {compare.map((id) => {
                      const name =
                        buildings.find((b) => b.id === id)?.name ?? "건물";
                      return (
                        <button
                          key={id}
                          onClick={() => toggleCompare(id)}
                          aria-label={`${name} 비교 목록에서 제외`}
                          title={name}
                        >
                          <span>{name}</span>
                          <X size={12} />
                        </button>
                      );
                    })}
                  </div>
                  <p aria-live="polite">
                    {compare.length < 2
                      ? "비교할 건물을 1개 더 선택하세요."
                      : "최대 3개 건물을 나란히 비교할 수 있습니다."}
                  </p>
                  <button
                    className="primary"
                    disabled={compare.length < 2}
                    onClick={openDialog}
                  >
                    {compare.length < 2
                      ? "2개부터 비교 가능"
                      : `${compare.length}개 건물 비교하기`}{" "}
                    <ChevronRight size={14} />
                  </button>
                </section>
              ) : (
                <footer>기준이 명확한 공간, 근거가 있는 정보.</footer>
              )}
            </section>
            <section className="map-region" aria-label="공간 지도">
              <NaverMap
                camera={mapCamera}
                homeRequest={homeRequest}
                buildings={results}
                leasing={catalog.leasing}
                selected={selected}
                onSelect={select}
              />
            </section>
          </div>
        )}
      </main>
      <dialog
        ref={dialog}
        onClose={() => setShowCompare(false)}
        className="compare-dialog"
      >
        <div className="dialog-heading">
          <h2>건물 비교</h2>
          <button
            aria-label="비교 닫기"
            onClick={() => dialog.current?.close()}
          >
            <X />
          </button>
        </div>
        {showCompare && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>기준</th>
                  {compare.map((id) => (
                    <th key={id}>{buildings.find((b) => b.id === id)?.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["연면적", (b: Building) => formatArea(b.gross_area_m2)],
                  [
                    "면적 기준",
                    (b: Building) =>
                      b.area_basis === "actual" ? "실제" : "계획",
                  ],
                  ["주소", (b: Building) => b.address],
                  ["준공연도", (b: Building) => b.completion_year ?? "미확인"],
                  ["주차 대수", (b: Building) => b.parking_spaces ?? "미확인"],
                  ["확인일", (b: Building) => b.verified_on ?? "검수 전"],
                ].map(([label, fn]) => (
                  <tr key={label as string}>
                    <th>{label as string}</th>
                    {compare.map((id) => (
                      <td key={id}>
                        {(fn as (b: Building) => string | number)(
                          buildings.find((b) => b.id === id)!,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </dialog>
      {login && (
        <LoginModal onClose={() => setLogin(false)}>
          <h2>Workplace Seoul에 로그인</h2>
          <p>이메일로 받은 링크를 통해 로그인합니다.</p>
          {supabase ? (
            <form onSubmit={signIn}>
              <label>
                이메일
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "전송 중…" : "로그인 링크 받기"}
              </button>
            </form>
          ) : (
            <p className="muted">회원 서비스를 준비하고 있습니다.</p>
          )}
        </LoginModal>
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
function LoginModal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="login-dialog" onClose={onClose}>
      <button
        className="close"
        aria-label="로그인 닫기"
        onClick={() => ref.current?.close()}
      >
        <X size={19} />
      </button>
      {children}
    </dialog>
  );
}
