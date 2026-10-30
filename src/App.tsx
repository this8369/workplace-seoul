import {
  markerDevelopmentIndex,
  markerNocIndex,
  mapMarkerFacts,
} from "./lib/map-marker-facts";
import PhotoManager from "./components/PhotoManager";
import AssetNotifications from "./components/AssetNotifications";
import { assetNavigationUrl, sharedAssetId } from "./lib/asset-link";
import { fetchMemberBuilding } from "./lib/member-details";
import { assetDetailClient } from "./lib/asset-detail-client";
import MemberAssetWorkspace from "./components/MemberAssetWorkspace";
import { DataReviewProvider } from "./components/DataReview";
import {
  buildingFloorText,
  complexMapBuildings,
  towersFor,
  towerNocFact,
} from "./lib/building-towers";
import { clearPrivatePhotoUrls } from "./lib/photo-urls";
import AssetTypeSelect from "./components/AssetTypeSelect";
import FilterSelect from "./components/FilterSelect";
import BuildingPhoto from "./components/BuildingPhoto";
import CardScrollArea from "./components/CardScrollArea";
import { fetchBuildingImages, primaryImage } from "./lib/building-images";
import { regionForBuilding, districts } from "./lib/map-regions";
import { hasLocation } from "./lib/map-clusters";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  Bookmark,
  Building2,
  Check,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Compass,
  FileText,
  ImagePlus,
  Layers3,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  List,
  Map as MapIcon,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import NaverMap, { type MapCamera } from "./components/NaverMap";
import {
  visibleBuildings,
  sortBuildings,
  type MapBounds,
  type BuildingSort,
} from "./lib/map-list";
import {
  fetchCatalog,
  fetchFreshCatalog,
  fetchCatalogArchive,
  fetchCatalogImages,
  supabase,
} from "./lib/supabase";
import IgisLogin from "./components/IgisLogin";
import AccountMenu from "./components/AccountMenu";
import { igisStaffTitle } from "./lib/igis-profile";
import { recoveryRoute, signOutIgis } from "./lib/igis-auth";
import { useWorkplaceAccess } from "./lib/use-workplace-access";
import {
  assetCategoryOptions,
  filterBuildings,
  formatArea,
  type Building,
} from "./lib/domain";
import { Transactions } from "./components/AssetWorkspace";
import { emptyCatalog, type Catalog } from "./lib/catalog";
const initialAsset = sharedAssetId(location.search);
const initialTitle = document.title;
const initialQuery = new URLSearchParams(location.search).get("q") || "";
const MasterWorkspace = lazy(() => import("./components/MasterWorkspace"));
const cardValue = (value: string | null | undefined) =>
  !value || value === "미확인" || value === "—" ? "-" : value;
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
  const developmentSummary = useMemo(
    () => markerDevelopmentIndex(catalog.developments),
    [catalog.developments],
  );
  const noc = useMemo(() => markerNocIndex(catalog.leasing), [catalog.leasing]);
  const nocValues = useMemo(
    () => new Map([...noc].map(([id, record]) => [id, record.value])),
    [noc],
  );
  const cardMetrics = useMemo(() => {
    return new Map(
      complexMapBuildings(catalog.buildings, catalog.complexes).map(
        (building) => {
          const facts = mapMarkerFacts(
            building,
            noc.get(building.id),
            developmentSummary.get(building.id),
          );
          return [
            building.id,
            {
              floor: buildingFloorText(
                building,
                catalog.towers,
                catalog.buildings,
              ),
              noc: building.member_ids
                ? towerNocFact(
                    building,
                    towersFor(building, catalog.towers),
                    noc,
                  ).value
                : (facts.find((fact) => fact.label === "NOC")?.value ?? "—"),
              period: noc.get(building.id)?.period,
              completion:
                facts.find(
                  (fact) =>
                    fact.label ===
                    (building.status === "development"
                      ? "준공 예정"
                      : "준공년도"),
                )?.value ?? "미확인",
            },
          ];
        },
      ),
    );
  }, [
    catalog.buildings,
    catalog.complexes,
    catalog.towers,
    noc,
    developmentSummary,
  ]);
  const [buildings, setBuildings] = useState<Building[]>([]),
    [load, setLoad] = useState<"loading" | "ready" | "error" | "setup">(
      supabase ? "loading" : "setup",
    );
  const [imageBuilding, setImageBuilding] = useState("");
  const [imageLoad, setImageLoad] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [imageAttempt, setImageAttempt] = useState(0);
  const [igisMode, setIgisMode] = useState(false);
  const [assetCategory, setAssetCategory] = useState("");
  const [query, setQuery] = useState(initialQuery),
    [region, setRegion] = useState(""),
    [status, setStatus] = useState(""),
    [view, setView] = useState<
      "all" | "saved" | "transactions" | "images" | "my"
    >("all");
  const [selected, setSelection] = useState<string | null>(initialAsset),
    [compare, setCompare] = useState<string[]>([]),
    [showCompare, setShowCompare] = useState(false);
  const [mobileMap, setMobileMap] = useState(
    () => window.matchMedia("(max-width: 760px)").matches,
  );
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const listToggle = useRef<HTMLButtonElement>(null);
  const listHandle = useRef<HTMLButtonElement>(null);
  const listDragStart = useRef<number | null>(null);
  const returnToList = useRef(false);
  const previousDetail = useRef(selected);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setMobileMap(media.matches);
      setMobileListOpen(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (mobileMap && selected) setMobileListOpen(false);
    else if (mobileMap && previousDetail.current && returnToList.current) {
      setMobileListOpen(true);
      returnToList.current = false;
    }
    previousDetail.current = selected;
  }, [selected, mobileMap]);
  function openMobileList() {
    setMobileListOpen(true);
    requestAnimationFrame(() =>
      listHandle.current?.focus({ preventScroll: true }),
    );
  }
  function closeMobileList() {
    setMobileListOpen(false);
    requestAnimationFrame(() =>
      listToggle.current?.focus({ preventScroll: true }),
    );
  }
  const setSelected = useCallback((id: string | null, replace = false) => {
    const url = assetNavigationUrl(location.href, id);
    if (url !== location.href)
      history[replace ? "replaceState" : "pushState"](null, "", url);
    setSelection(id);
  }, []);
  const [linkedBuilding, setLinkedBuilding] = useState<Building>();
  const [linkedError, setLinkedError] = useState(false);
  const [linkedAttempt, setLinkedAttempt] = useState(0);
  const [savedBuildings, setSavedBuildings] = useState<Building[]>([]);
  const [savedImages, setSavedImages] = useState<Catalog["images"]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set()),
    [session, setSession] = useState<Session | null>(null),
    [login, setLogin] = useState(
      recoveryRoute ||
        new URLSearchParams(location.search).get("login") === "1",
    ),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [authReady, setAuthReady] = useState(!supabase);
  const [loginMode, setLoginMode] = useState<"email" | "change">("email");
  const access = useWorkplaceAccess(session, setNotice);
  const can = (permission: string) => access.permissions.includes(permission);
  const canReadDetails = !!session && can("details.read");
  const accessPending =
    !authReady ||
    (!!session &&
      !canReadDetails &&
      (access.status === "checking" || access.status === "unavailable"));
  const canManageImages = canReadDetails && can("images.manage");
  const canReadTransactions = true;
  const [adminImages, setAdminImages] = useState<Catalog["images"]>([]);
  const accessUser = useRef(session?.user.id);
  const [comparisonDetails, setComparisonDetails] = useState<Building[]>([]);
  useEffect(() => {
    setComparisonDetails([]);
    if (!showCompare || !assetDetailClient) return;
    let alive = true;
    void assetDetailClient
      .from("buildings")
      .select("*")
      .in("id", compare)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setNotice("비교 상세정보를 불러오지 못했습니다.");
        else setComparisonDetails(data as Building[]);
      });
    return () => {
      alive = false;
    };
  }, [showCompare, compare]);
  useEffect(() => {
    const changedAccount =
      !!accessUser.current && accessUser.current !== session?.user.id;
    accessUser.current = session?.user.id;
    if (!canReadDetails) {
      clearPrivatePhotoUrls();
      // Keep the navigation intent while revalidating, but render private data
      // only after the server has issued a fresh attestation.
      if (accessPending && !changedAccount) return;
      setView((current) => (current === "my" ? "all" : current));
    }
  }, [canReadDetails, accessPending, session?.user.id]);
  useEffect(() => {
    if (canReadDetails && loginMode === "email" && !recoveryRoute)
      setLogin(false);
  }, [canReadDetails, loginMode]);
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null);
  const mapCamera = useRef<MapCamera | null>(null);
  const [previewedBuilding, setPreviewedBuilding] = useState<string | null>(
    null,
  );
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [buildingSort, setBuildingSort] = useState<BuildingSort>("area-desc");
  const resultsScroll = useRef<HTMLDivElement>(null);
  const updateMapBounds = useCallback((bounds: MapBounds) => {
    setMapBounds((previous) =>
      previous &&
      previous.south === bounds.south &&
      previous.north === bounds.north &&
      previous.west === bounds.west &&
      previous.east === bounds.east
        ? previous
        : bounds,
    );
  }, []);
  const [homeRequest, setHomeRequest] = useState(0);
  function goHome() {
    returnToList.current = false;
    setMobileListOpen(false);
    setIgisMode(false);
    setAssetCategory("");
    setView("all");
    setRegion("");
    setSelected(null);
    mapCamera.current = null;
    setHomeRequest((value) => value + 1);
  }
  const loadGeneration = useRef(0);
  const [archiveLoad, setArchiveLoad] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const refresh = useCallback(() => {
    const generation = ++loadGeneration.current;
    setLoad("loading");
    setCatalog(emptyCatalog);
    setBuildings([]);
    setCompare([]);
    setArchiveLoad("idle");
    let coreShown = false;
    const showCore = (data: Catalog) => {
      if (generation !== loadGeneration.current) return;
      coreShown = true;
      setCatalog((previous) => ({
        ...data,
        transactions: previous.transactions,
        companies: previous.companies,
        occupancies: previous.occupancies,
        movements: previous.movements,
      }));
      setBuildings(data.buildings);
      setLoad(supabase ? "ready" : "setup");
    };
    fetchCatalog(showCore)
      .then((data) => {
        if (generation !== loadGeneration.current) return;
        showCore(data);
      })
      .catch(() => {
        if (generation === loadGeneration.current && !coreShown)
          setLoad("error");
      });
  }, []);
  useEffect(refresh, [refresh]);
  const catalogSyncGeneration = useRef(0);
  const refreshVisibleCatalog = useCallback(() => {
    const loadVersion = loadGeneration.current;
    const syncVersion = ++catalogSyncGeneration.current;
    void fetchFreshCatalog()
      .then((data) => {
        if (
          loadVersion !== loadGeneration.current ||
          syncVersion !== catalogSyncGeneration.current
        )
          return;
        setCatalog((current) => ({
          ...current,
          buildings: data.buildings,
          images: data.images,
          leasing: data.leasing,
          developments: data.developments,
          complexes: data.complexes,
          towers: data.towers,
        }));
        setBuildings(data.buildings);
        setSavedBuildings((current) =>
          current.map((building) => {
            const updated = data.buildings.find((b) => b.id === building.id);
            return updated ? { ...building, ...updated } : building;
          }),
        );
      })
      .catch(() => {
        if (
          loadVersion === loadGeneration.current &&
          syncVersion === catalogSyncGeneration.current
        )
          setNotice("저장됐지만 목록 갱신에 실패했습니다. 새로고침해 주세요.");
      });
  }, []);
  useEffect(() => {
    if (load !== "ready" || archiveLoad !== "idle" || view !== "transactions")
      return;
    const generation = loadGeneration.current;
    setArchiveLoad("loading");
    void fetchCatalogArchive()
      .then((data) => {
        if (generation !== loadGeneration.current) return;
        setCatalog((previous) => ({ ...previous, ...data }));
        setArchiveLoad("ready");
      })
      .catch(() => {
        if (generation === loadGeneration.current) setArchiveLoad("error");
      });
  }, [load, archiveLoad, view]);
  useEffect(() => {
    setAdminImages([]);
    if (view !== "images" || !canManageImages) return;
    let alive = true;
    setImageLoad("loading");
    void fetchBuildingImages(supabase, imageBuilding)
      .then((images) => {
        if (alive) {
          setAdminImages(images);
          setImageLoad("ready");
        }
      })
      .catch(() => {
        if (alive) setImageLoad("error");
      });
    return () => {
      alive = false;
    };
  }, [view, canManageImages, session?.user.id, imageBuilding, imageAttempt]);
  useEffect(() => {
    if (!supabase) return;
    // INITIAL_SESSION arrives after persisted-session restoration. Using one
    // source avoids a late getSession result overwriting a newer auth event.
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      setAuthReady(true);
    });
    return () => {
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
  }, [session?.user.id]);
  useEffect(() => {
    let alive = true;
    setSavedBuildings([]);
    setSavedImages([]);
    setSavedError(false);
    if (!supabase || !canReadDetails || !saved.size) {
      setSavedLoading(false);
      return;
    }
    setSavedLoading(true);
    const ids = [...saved];
    void (async () => {
      const records: Building[] = [],
        images: Catalog["images"] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100);
        const [b, p] = await Promise.all([
          supabase!.from("buildings").select("*").in("id", batch),
          supabase!
            .from("building_images")
            .select("*")
            .in("building_id", batch)
            .eq("review_status", "approved")
            .eq("is_primary", true),
        ]);
        if (b.error || p.error) throw b.error || p.error;
        records.push(
          ...b.data.map((b) => ({
            ...b,
            source_address: b.address,
            address: b.standard_address || b.address,
            region: regionForBuilding(b),
          })),
        );
        images.push(...p.data);
      }
      if (alive) {
        setSavedBuildings(records);
        setSavedImages(images);
      }
    })()
      .catch(() => {
        if (alive) setSavedError(true);
      })
      .finally(() => {
        if (alive) setSavedLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [saved, canReadDetails, session?.user.id]);
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
  const savedList = useMemo(
    () =>
      savedBuildings.map((b) => {
        const source = buildings.find(
          (x) =>
            x.id === b.component_source_building_id ||
            (b.complex_id && x.complex_id === b.complex_id),
        );
        return {
          ...b,
          is_igis: b.is_igis ?? source?.is_igis,
          asset_category: b.asset_category ?? source?.asset_category,
          is_mixed_use: b.is_mixed_use ?? source?.is_mixed_use,
        };
      }),
    [savedBuildings, buildings],
  );
  const results = useMemo(
    () =>
      filterBuildings(
        view === "saved"
          ? canReadDetails
            ? savedList
            : []
          : complexMapBuildings(buildings, catalog.complexes),
        query,
        region,
        status,
        view === "saved" ? saved : undefined,
        igisMode,
        assetCategory,
      ).filter(hasLocation),
    [
      buildings,
      savedList,
      canReadDetails,
      catalog.complexes,
      query,
      region,
      status,
      view,
      saved,
      igisMode,
      assetCategory,
    ],
  );
  const developmentYears = useMemo(
    () =>
      new Map(
        [...developmentSummary].map(([id, record]) => {
          const match = /^(\d{4})년/.exec(record.completion || "");
          return [id, match ? Number(match[1]) : null] as const;
        }),
      ),
    [developmentSummary],
  );
  const cardResults = useMemo(
    () =>
      sortBuildings(
        visibleBuildings(results, mapBounds),
        buildingSort,
        developmentYears,
        nocValues,
      ),
    [results, mapBounds, buildingSort, developmentYears, nocValues],
  );
  useEffect(() => {
    if (resultsScroll.current) resultsScroll.current.scrollTop = 0;
  }, [mapBounds, buildingSort, query, region, status, view]);
  const displayMetrics = (b: Building) => {
    if (view !== "saved") return cardMetrics.get(b.id);
    const lease =
      noc.get(b.id) ||
      (b.component_source_building_id
        ? noc.get(b.component_source_building_id)
        : undefined);
    const facts = mapMarkerFacts(b, lease, developmentSummary.get(b.id));
    return {
      floor: buildingFloorText(b, catalog.towers, savedBuildings),
      noc: facts.find((f) => f.label === "NOC")?.value || "—",
      period: lease?.period,
      completion:
        facts.find(
          (f) =>
            f.label === (b.status === "development" ? "준공 예정" : "준공년도"),
        )?.value || "미확인",
    };
  };
  const active =
      buildings.find((b) => b.id === selected) ||
      (linkedBuilding?.id === selected ? linkedBuilding : undefined),
    regions = [
      ...new Set([
        ...districts.map((d) => d.key),
        ...buildings.map((b) => b.region),
      ]),
    ];
  useEffect(() => {
    document.title = active ? `${active.name} | WORKPLACE SEOUL` : initialTitle;
  }, [active?.id, active?.name]);
  useEffect(() => {
    let alive = true;
    setLinkedError(false);
    if (!selected) {
      setLinkedBuilding(undefined);
      return;
    }
    if (
      buildings.some((b) => b.id === selected) ||
      linkedBuilding?.id === selected
    )
      return;
    void fetchMemberBuilding(selected)
      .then((building) => {
        if (alive) setLinkedBuilding(building);
      })
      .catch(() => {
        if (alive) setLinkedError(true);
      });
    return () => {
      alive = false;
    };
  }, [selected, buildings, linkedAttempt]);
  const focusBuilding = useCallback(
    (building: Building, replace = false) => {
      setLinkedBuilding(building);
      setSelected(building.id, replace);
    },
    [setSelected],
  );
  useEffect(() => {
    const restore = () => {
      const id = sharedAssetId(location.search);
      setSelection(id);
      setQuery(new URLSearchParams(location.search).get("q") || "");
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const requireLogin = useCallback(() => {
    if (session && !accessPending) {
      setNotice("이 기능을 이용할 권한이 없습니다.");
      return;
    }
    setLoginMode("email");
    setLogin(true);
    if (!accessPending) setNotice("로그인 후 이용할 수 있습니다.");
  }, [session, accessPending]);
  function openPhotoManager(id = "", fromNavigation = false) {
    if (!canManageImages) {
      requireLogin();
      return;
    }
    setImageBuilding(id);
    setView("images");
    if (fromNavigation) setSelected(null);
  }
  const select = useCallback(
    (id: string) => {
      if (mobileMap && !selected) returnToList.current = mobileListOpen;
      if (mobileMap) setMobileListOpen(false);
      setSelected(id);
    },
    [mobileMap, mobileListOpen, selected, setSelected],
  );
  const openDialog = () => {
    if (compare.length < 2) return;
    setShowCompare(true);
    dialog.current?.showModal();
  };
  async function toggleSave(id: string) {
    if (!supabase || !session) {
      requireLogin();
      return;
    }
    if (!can("favorites.write")) {
      setNotice("저장 기능을 사용할 권한이 없습니다.");
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
  const alignToolbar = useCallback((node: HTMLElement | null) => {
    const workspace = node?.closest<HTMLElement>(".workspace");
    if (!node || !workspace) return;
    const align = () => {
      const height = node.getBoundingClientRect().height;
      if (height > 0)
        workspace.style.setProperty("--results-heading-height", `${height}px`);
    };
    const observer = new ResizeObserver(align);
    observer.observe(node);
    align();
    return () => observer.disconnect();
  }, []);
  const searchToolbar = (
    <section
      ref={alignToolbar}
      className="toolbar"
      aria-label="검색 및 필터"
      inert={view === "images" && canManageImages}
    >
      <div className="search">
        <Search size={18} />
        <input
          ref={search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => {
            if (
              mobileMap &&
              (view === "all" || view === "saved") &&
              event.key === "Enter" &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.blur();
              openMobileList();
            }
          }}
          placeholder={
            view === "transactions"
              ? "건물명, 매수인 또는 매도인 검색"
              : "건물명 또는 주소 검색"
          }
          aria-label={view === "transactions" ? "매매사례 검색" : "건물 검색"}
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
        <FilterSelect
          label="권역"
          icon={<MapPin size={14} />}
          value={region}
          onChange={setRegion}
          options={[
            { value: "", label: "권역 전체" },
            ...regions.map((r) => ({ value: r, label: r })),
          ]}
        />
        {view !== "transactions" && (
          <FilterSelect
            label="건물 상태"
            icon={<Layers3 size={14} />}
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: "실물+개발" },
              { value: "operating", label: "실물" },
              { value: "development", label: "개발중" },
            ]}
          />
        )}
      </div>
      {view !== "transactions" && (
        <div className="filters igis-controls" data-active={igisMode}>
          <button
            className="asset-type-trigger filter-select-trigger igis-mode-toggle"
            aria-label="이지스 자산 보기"
            title="이지스 자산 보기"
            aria-pressed={igisMode}
            onClick={() => {
              setIgisMode(!igisMode);
              setAssetCategory("");
            }}
          >
            <span className="igis-badge" aria-hidden="true">
              IGIS
            </span>
            <span>이지스자산</span>
          </button>
          <div
            className="igis-category-reveal"
            inert={!igisMode}
            aria-hidden={!igisMode}
          >
            <div className="igis-category-control">
              <FilterSelect
                label="이지스 자산 유형"
                icon={<Building2 size={14} />}
                value={assetCategory}
                onChange={setAssetCategory}
                options={assetCategoryOptions}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
  return (
    <div className="app">
      <aside
        inert={view === "images" && canManageImages}
        className={`sidebar${sidebarCollapsed ? " is-collapsed" : ""}`}
      >
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
              if (!session) {
                requireLogin();
                return;
              }
              setMobileListOpen(true);
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
          <button
            aria-label="MY 데이터 관리"
            title="MY 데이터 관리"
            className={view === "my" ? "current" : ""}
            onClick={() => {
              if (!canReadDetails) {
                requireLogin();
                return;
              }
              setView("my");
              setSelected(null);
            }}
          >
            <Layers3 size={18} />
            <span className="nav-text">MY</span>
          </button>
        </nav>
        <nav className="admin-navigation" aria-label="관리 메뉴">
          <div className="nav-label">관리</div>
          <button
            aria-label="사진 관리"
            title="사진 관리"
            className={view === "images" ? "current" : ""}
            onClick={() => openPhotoManager("", true)}
          >
            <ImagePlus size={18} />
            <span className="nav-text">사진 관리</span>
          </button>
        </nav>
        <AccountMenu
          name={access.display_name || ""}
          email={session?.user.email}
          title={igisStaffTitle(access.display_name || "")}
          onLogin={() => {
            setLoginMode("email");
            setLogin(true);
          }}
          onPassword={() => {
            setLoginMode("change");
            setLogin(true);
          }}
          onLogout={signOutIgis}
        />
      </aside>
      <main>
        {!active && view === "transactions" && searchToolbar}
        {view === "my" && canReadDetails ? (
          <Suspense
            fallback={
              <div className="empty">데이터 관리를 불러오고 있습니다.</div>
            }
          >
            <MasterWorkspace key={session?.user.id} />
          </Suspense>
        ) : view === "transactions" && !active ? (
          load === "ready" && archiveLoad === "ready" ? (
            <DataReviewProvider
              key={`${session?.user.id}:${canReadDetails}`}
              enabled={canReadDetails && can("transactions.read")}
              onRequireLogin={requireLogin}
            >
              <Transactions
                catalog={catalog}
                query={query}
                region={region}
                onBuilding={select}
                canReadDetails={canReadTransactions}
                onRequireLogin={requireLogin}
                accessKey={session?.user.id}
              />
            </DataReviewProvider>
          ) : (
            <div className="empty">
              <h2>
                {load === "error" || archiveLoad === "error"
                  ? "거래 정보를 불러오지 못했습니다"
                  : load === "loading" ||
                      archiveLoad === "loading" ||
                      archiveLoad === "idle"
                    ? "거래 정보를 불러오고 있습니다"
                    : "거래 정보를 준비하고 있습니다"}
              </h2>
              {load === "error" && <button onClick={refresh}>다시 시도</button>}
              {load !== "error" && archiveLoad === "error" && (
                <button onClick={() => setArchiveLoad("idle")}>
                  다시 시도
                </button>
              )}
            </div>
          )
        ) : (
          <div
            className={`workspace mobile-map-browse${mobileListOpen ? " is-list-open" : ""}${selected || (view === "images" && canManageImages) ? " is-detail-open" : ""}`}
            onKeyDown={(event) => {
              if (
                mobileMap &&
                mobileListOpen &&
                event.key === "Escape" &&
                !event.defaultPrevented
              ) {
                event.preventDefault();
                event.stopPropagation();
                closeMobileList();
              }
            }}
          >
            <button
              type="button"
              className="mobile-list-scrim"
              onClick={closeMobileList}
              aria-label="목록 접고 지도 보기"
              tabIndex={-1}
              aria-hidden={!mobileMap || !mobileListOpen}
            />
            <section
              className="results"
              id="mobile-building-list"
              aria-label="건물 목록"
              aria-hidden={mobileMap && !mobileListOpen ? true : undefined}
              inert={
                (view === "images" && canManageImages) ||
                (mobileMap && !mobileListOpen)
              }
            >
              <button
                type="button"
                className="mobile-list-handle"
                ref={listHandle}
                aria-label="목록 접고 지도 보기"
                aria-controls="mobile-building-list"
                aria-expanded={mobileListOpen}
                onClick={closeMobileList}
                onPointerDown={(event) => {
                  if (!event.isPrimary || event.button !== 0) return;
                  listDragStart.current = event.clientY;
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerUp={(event) => {
                  if (
                    listDragStart.current != null &&
                    event.clientY - listDragStart.current > 40
                  )
                    closeMobileList();
                  listDragStart.current = null;
                }}
                onPointerCancel={() => {
                  listDragStart.current = null;
                }}
              >
                <span className="mobile-list-grip" aria-hidden="true" />
                <span>
                  <MapIcon size={14} />
                  지도 보기
                  <ChevronDown size={15} />
                </span>
              </button>
              <div className="results-heading">
                {view === "all" || view === "images" ? (
                  igisMode ? (
                    <h1>
                      IGIS ·{" "}
                      {
                        assetCategoryOptions.find(
                          (o) => o.value === assetCategory,
                        )?.label
                      }
                    </h1>
                  ) : (
                    <AssetTypeSelect />
                  )
                ) : (
                  <h1>관심 건물</h1>
                )}
                <div
                  className="results-sort"
                  role="group"
                  aria-label="카드 정렬"
                >
                  {(
                    [
                      ["area", "연면적"],
                      ["noc", "NOC"],
                      ["year", "연도"],
                    ] as const
                  ).map(([key, label]) => {
                    const active = buildingSort.startsWith(key);
                    const ascending = active && buildingSort.endsWith("asc");
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        aria-label={`${label} 정렬${active ? (ascending ? ", 오름차순" : ", 내림차순") : ""}`}
                        onClick={() =>
                          setBuildingSort(
                            active && !ascending ? `${key}-asc` : `${key}-desc`,
                          )
                        }
                      >
                        {label}
                        <span className="sort-arrows" aria-hidden="true">
                          <ChevronUp
                            className={ascending ? "is-active" : ""}
                            size={10}
                          />
                          <ChevronDown
                            className={active && !ascending ? "is-active" : ""}
                            size={10}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {igisMode && (
                <p className="igis-list-note">
                  {cardResults.length}개 자산 · 현재 지도 범위
                </p>
              )}
              <CardScrollArea
                scrollRef={resultsScroll}
                onPreview={setPreviewedBuilding}
                previewKey={JSON.stringify([
                  query,
                  region,
                  status,
                  view,
                  buildingSort,
                  selected,
                  homeRequest,
                  igisMode,
                  assetCategory,
                ])}
              >
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
                ) : view === "saved" && (savedLoading || savedError) ? (
                  <div className="empty" role={savedError ? "alert" : "status"}>
                    <p>
                      {savedError
                        ? "관심 건물을 불러오지 못했습니다. 다시 시도해 주세요."
                        : "관심 건물을 불러오고 있습니다."}
                    </p>
                    {savedError && (
                      <button onClick={() => setSaved(new Set(saved))}>
                        다시 시도
                      </button>
                    )}
                  </div>
                ) : cardResults.length === 0 ? (
                  <div className="empty">
                    <Search size={26} />
                    <h2>
                      {view === "saved" && saved.size === 0
                        ? "저장한 건물이 없습니다"
                        : buildings.length === 0
                          ? "공간 정보를 공개 준비 중입니다"
                          : !mapBounds
                            ? "지도 범위를 확인하고 있습니다"
                            : "현재 지도 범위에 자산이 없습니다"}
                    </h2>
                    <p>
                      {view === "saved" && saved.size === 0
                        ? "관심 있는 건물의 북마크를 눌러보세요."
                        : buildings.length === 0
                          ? "등록된 자산 정보를 준비하고 있습니다."
                          : "지도를 이동하거나 축소하고, 검색 조건을 확인해 주세요."}
                    </p>
                  </div>
                ) : (
                  cardResults.map((b, index) => (
                    <article
                      key={b.id}
                      data-building-id={b.id}
                      className={`building-card ${b.status === "development" ? "is-development" : ""} ${b.id === selected || b.member_ids?.includes(selected || "") || !!(active?.complex_id && active.complex_id === b.complex_id) ? "selected" : ""}`}
                    >
                      <button
                        className="card-main"
                        onClick={() => select(b.id)}
                      >
                        <span className="building-art" aria-hidden="true">
                          <BuildingPhoto
                            image={primaryImage(
                              view === "saved" ? savedImages : catalog.images,
                              b.id,
                            )}
                            memberOnly={view === "saved"}
                            priority={index < 8}
                          />
                          {b.status === "development" && (
                            <span className="building-development-badge">
                              개발
                            </span>
                          )}
                        </span>
                        <span className="card-info">
                          <strong>
                            <span className="card-building-name">{b.name}</span>
                            {b.is_igis && (
                              <span
                                className="igis-badge"
                                title="이지스 투자·운용 연관 자산"
                              >
                                IGIS
                              </span>
                            )}
                          </strong>
                          <span className="card-metrics">
                            <span className="card-metric">
                              <span className="card-metric-label">
                                {b.area_basis === "planned"
                                  ? "계획 연면적"
                                  : "연면적"}
                              </span>
                              <span className="card-metric-value">
                                {formatArea(b.gross_area_m2)}
                              </span>
                            </span>
                            <span className="card-metric card-floor">
                              <span className="card-metric-label">
                                기준층(전용)
                              </span>
                              <span
                                className="card-metric-value"
                                title={displayMetrics(b)?.floor}
                              >
                                {cardValue(displayMetrics(b)?.floor)}
                              </span>
                            </span>
                            <span
                              className={`card-metric ${b.status === "development" ? "card-owner" : "card-noc"}`}
                            >
                              <span className="card-metric-label">
                                {b.status === "development"
                                  ? "소유주"
                                  : "F.NOC"}
                              </span>
                              <span className="card-metric-value">
                                {cardValue(
                                  b.status === "development"
                                    ? developmentSummary.get(b.id)?.developer
                                    : displayMetrics(b)?.noc,
                                )}
                              </span>
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
                          저장
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
                          비교
                        </button>
                        <span className="card-metric card-completion">
                          <span className="card-metric-label">
                            {b.status === "development" ? "준공 예정" : "준공"}
                          </span>
                          <span className="card-metric-value">
                            {cardValue(displayMetrics(b)?.completion)}
                          </span>
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </CardScrollArea>
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
              ) : null}
            </section>
            <div className="map-column">
              {searchToolbar}
              <section className="map-region" aria-label="공간 지도">
                <NaverMap
                  igisMode={igisMode}
                  camera={mapCamera}
                  homeRequest={homeRequest}
                  region={region}
                  onBoundsChange={updateMapBounds}
                  buildings={results}
                  complexes={catalog.complexes}
                  towers={catalog.towers}
                  leasing={catalog.leasing}
                  developments={catalog.developments}
                  selected={selected}
                  previewed={previewedBuilding}
                  onSelect={select}
                />
                {selected && !active && view !== "images" && (
                  <div
                    className="asset-popup"
                    role="dialog"
                    aria-label="자산 상세"
                  >
                    <div className="asset-popup-toolbar">
                      <span>자산 상세</span>
                      <button
                        className="asset-popup-close"
                        onClick={() => setSelected(null)}
                        aria-label="상세 닫기"
                      >
                        <X size={21} />
                      </button>
                    </div>
                    <div
                      className="empty"
                      role={linkedError ? "alert" : "status"}
                    >
                      <p>
                        {linkedError
                          ? "이 자산을 열 수 없습니다. 주소 또는 접근 권한을 확인해 주세요."
                          : "자산 정보를 불러오고 있습니다."}
                      </p>
                      {linkedError && (
                        <button onClick={() => setLinkedAttempt((n) => n + 1)}>
                          다시 시도
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {active && view !== "images" && (
                  <MemberAssetWorkspace
                    key={`${session?.user.id}:${canReadDetails}:${active.complex_id || active.id}`}
                    building={active}
                    complexes={catalog.complexes}
                    onInformationSaved={refreshVisibleCatalog}
                    onActiveBuilding={focusBuilding}
                    savedIds={saved}
                    onSaveBuilding={toggleSave}
                    onManageBuildingImages={openPhotoManager}
                    canReadTransactions={canReadTransactions}
                    canReadIgis={canReadDetails}
                    onRequireLogin={requireLogin}
                    onClose={() => setSelected(null)}
                    onBuilding={select}
                    saved={saved.has(active.id)}
                    onSave={() => toggleSave(active.id)}
                    onManageImages={() => openPhotoManager(active.id)}
                  />
                )}
                {view === "images" && canManageImages && (
                  <>
                    <div className="photo-manager-backdrop" />
                    <PhotoManager
                      key={session?.user.id}
                      initialBuilding={imageBuilding}
                      buildings={buildings}
                      images={adminImages}
                      loading={imageLoad === "loading"}
                      loadError={imageLoad === "error"}
                      onRetry={() => setImageAttempt((n) => n + 1)}
                      onBuildingChange={setImageBuilding}
                      onClose={() => setView("all")}
                      onRefresh={async () => {
                        const [images, publicImages] = await Promise.all([
                          fetchBuildingImages(supabase, imageBuilding),
                          fetchCatalogImages(),
                        ]);
                        setAdminImages(images);
                        setCatalog((current) => ({
                          ...current,
                          images: publicImages,
                        }));
                      }}
                    />
                  </>
                )}
              </section>
            </div>
            <button
              type="button"
              className="mobile-list-toggle"
              ref={listToggle}
              aria-controls="mobile-building-list"
              aria-expanded={mobileListOpen}
              aria-label={
                view === "saved" ? "관심 건물 목록 보기" : "목록 보기"
              }
              onClick={openMobileList}
              inert={
                mobileListOpen ||
                !!selected ||
                (view === "images" && canManageImages)
              }
            >
              <List size={18} />
              <span>{view === "saved" ? "관심 목록 보기" : "목록 보기"}</span>
              <span className="mobile-list-count" aria-live="polite">
                {load === "ready"
                  ? cardResults.length.toLocaleString("ko-KR")
                  : "…"}
              </span>
              <ChevronUp size={17} />
            </button>
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
                  [
                    "준공연도 / 예정",
                    (b: Building) =>
                      b.status === "development"
                        ? `${developmentSummary.get(b.id)?.completion || "미확인"} (예정)`
                        : (b.completion_year ?? "미확인"),
                  ],
                  ["주차 대수", (b: Building) => b.parking_spaces ?? "미확인"],
                  ["확인일", (b: Building) => b.verified_on ?? "검수 전"],
                ].map(([label, fn]) => (
                  <tr key={label as string}>
                    <th>{label as string}</th>
                    {compare.map((id) => (
                      <td key={id}>
                        {(fn as (b: Building) => string | number)(
                          comparisonDetails.find((b) => b.id === id) ||
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
      {login &&
        (recoveryRoute ||
          loginMode === "change" ||
          (!accessPending && !canReadDetails)) && (
          <IgisLogin
            initialMode={loginMode}
            initialEmail={
              loginMode === "change" ? session?.user.email : undefined
            }
            initialName={
              loginMode === "change" ? access.display_name || "" : ""
            }
            onClose={() => {
              setLogin(false);
              setLoginMode("email");
            }}
            onSuccess={() => {
              setLogin(false);
              setLoginMode("email");
            }}
          />
        )}
      {canReadDetails && session && (
        <AssetNotifications key={session.user.id} onOpen={select} />
      )}
      {accessPending && (login || view === "my" || view === "images") ? (
        <div className="toast" role="status">
          {access.status === "unavailable"
            ? "인증 서버에 다시 연결하고 있습니다. 잠시 후 자동으로 다시 시도합니다."
            : "로그인 상태를 확인하고 있습니다."}
        </div>
      ) : (
        notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )
      )}
    </div>
  );
}
