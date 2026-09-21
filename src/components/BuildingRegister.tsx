import { useEffect, useState } from "react";
import {
  fetchBuildingRegister,
  registerGroups,
  registerValue,
  type RegisterData,
} from "../lib/building-register";
const source = "https://www.data.go.kr/data/15134735/openapi.do";
export default function BuildingRegister({
  buildingId,
}: {
  buildingId: string;
}) {
  const [data, setData] = useState<RegisterData | null>(null),
    [error, setError] = useState(false),
    [selected, setSelected] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError(false);
    setSelected("");
    fetchBuildingRegister(buildingId)
      .then((result) => {
        if (active) {
          setData(result);
          setSelected(result.records[0]?.id ?? "");
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [buildingId, retry]);
  if (error)
    return (
      <div className="section-empty" role="alert">
        <h3>건축물대장 정보를 불러오지 못했습니다.</h3>
        <button onClick={() => setRetry((v) => v + 1)}>다시 불러오기</button>
      </div>
    );
  if (!data) return <p role="status">건축물대장 정보를 불러오는 중입니다.</p>;
  if (!data.records.length)
    return (
      <div className="section-empty">
        <h3>연결된 건축물대장이 없습니다.</h3>
        <p>주소와 동 정보를 확인한 건축물대장이 여기에 표시됩니다.</p>
      </div>
    );
  const record = data.records.find((r) => r.id === selected) ?? data.records[0];
  const floors = data.floors
    .filter((f) => f.record_id === record.id)
    .sort((a, b) => {
      const order = (f: typeof a) =>
        f.floor_category === "지하"
          ? -(f.floor_number ?? 0)
          : f.floor_category === "옥탑"
            ? 1000 + (f.floor_number ?? 0)
            : (f.floor_number ?? 0);
      return order(a) - order(b) || a.source_ordinal - b.source_ordinal;
    });
  const areas = data.areas.filter((a) => a.record_id === record.id),
    sections = data.sections.filter((s) => s.record_id === record.id);
  return (
    <section className="register-panel" aria-label="건축물대장 정보">
      <div className="register-heading">
        <div>
          <h2>건축물대장</h2>
          <p>
            국토교통부 건축HUB ·{" "}
            {record.record_kind === "complex"
              ? "단지 총괄표제부"
              : "건물 표제부"}
          </p>
        </div>
        <a href={source} target="_blank" rel="noreferrer">
          공공데이터 출처 ↗
        </a>
      </div>
      {data.records.length > 1 && (
        <div className="register-records" aria-label="대장 선택">
          {data.records.map((r) => (
            <button
              key={r.id}
              aria-pressed={record.id === r.id}
              onClick={() => setSelected(r.id)}
            >
              {r.record_kind === "complex"
                ? "단지 전체"
                : r.dong_name || r.building_name || "건물"}{" "}
              · {r.register_kind}
            </button>
          ))}
        </div>
      )}
      <div className="register-groups">
        {registerGroups.map((group) => (
          <section className="info-panel" key={group.title}>
            <h3>{group.title}</h3>
            <dl>
              {group.fields.map(([key, label, unit]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {key === "seismic_design"
                      ? record[key] === "1"
                        ? "적용"
                        : record[key] === "0"
                          ? "미적용"
                          : registerValue(record[key])
                      : registerValue(record[key], unit)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <details className="register-detail">
        <summary>
          층별 용도·면적 <span>{floors.length}개 항목</span>
        </summary>
        <p>
          같은 층도 용도별로 나뉘어 있습니다. 대장상 면적이며, 기준층
          임대·전용면적과는 구분됩니다.
        </p>
        {floors.length ? (
          <div className="register-table">
            <table>
              <thead>
                <tr>
                  <th>동</th>
                  <th>층</th>
                  <th>용도</th>
                  <th>면적</th>
                  <th>면적 제외 여부</th>
                </tr>
              </thead>
              <tbody>
                {floors.map((f) => (
                  <tr key={f.id}>
                    <td>{f.dong_name || "—"}</td>
                    <td>
                      {f.floor_number == null
                        ? f.floor_name || "미기재"
                        : `${f.floor_category || ""} ${registerValue(f.floor_number, "층")}`}
                    </td>
                    <td>{f.other_use || f.main_use || "미기재"}</td>
                    <td>{registerValue(f.area_m2, "㎡")}</td>
                    <td>{registerValue(f.area_excluded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>조회된 층별 정보가 없습니다.</p>
        )}
      </details>
      <details className="register-detail">
        <summary>
          전유·공용 면적 <span>{areas.length}개 항목</span>
        </summary>
        {areas.length ? (
          <div className="register-table">
            <table>
              <thead>
                <tr>
                  <th>동·호</th>
                  <th>층</th>
                  <th>구분</th>
                  <th>용도</th>
                  <th>면적</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {[a.dong_name, a.unit_name].filter(Boolean).join(" ") ||
                        "—"}
                    </td>
                    <td>
                      {a.floor_category} {registerValue(a.floor_number, "층")}
                    </td>
                    <td>{a.area_category || "미기재"}</td>
                    <td>{a.main_use || "미기재"}</td>
                    <td>{registerValue(a.area_m2, "㎡")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>조회된 전유·공용 면적 정보가 없습니다.</p>
        )}
      </details>
      {sections.length > 0 && (
        <div className="register-groups">
          {(["zoning", "sanitation"] as const).map((section) => (
            <section className="info-panel" key={section}>
              <h3>
                {section === "zoning" ? "지역·지구·구역" : "오수정화시설"}
              </h3>
              <dl>
                {sections
                  .filter((s) => s.section === section)
                  .map((s) => (
                    <div key={s.id}>
                      <dt>
                        {String(
                          s.attributes.category ||
                            s.attributes.method ||
                            "미기재",
                        )}
                      </dt>
                      <dd>
                        {section === "zoning"
                          ? registerValue(s.attributes.name)
                          : `${registerValue(s.attributes.capacity_people, "명")} · ${registerValue(s.attributes.capacity_m3, "㎥")}`}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      )}
      <p className="register-provenance">
        대장 고유번호 {record.register_pk} · 원천 생성일{" "}
        {record.source_created_date || "미기재"} · 수집일{" "}
        {record.collected_at.slice(0, 10)}
      </p>
    </section>
  );
}
