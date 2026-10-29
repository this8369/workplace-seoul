import { useAreaUnit } from "./AreaUnit";
import { useEffect, useState } from "react";
import { ReviewValue as RV } from "./DataReview";
import type { Resource } from "../lib/asset-context";
import {
  fetchBuildingRegister,
  registerGroups,
  registerValue as sourceRegisterValue,
  type RegisterData,
} from "../lib/building-register";
export default function BuildingRegister({
  buildingId,
  resource,
  onRetry,
}: {
  buildingId: string;
  resource?: Resource<RegisterData>;
  onRetry?: () => void;
}) {
  const { formatArea } = useAreaUnit();
  const registerValue = (value: unknown, unit = "") =>
    unit === "㎡" && typeof value === "number"
      ? formatArea(value, "m²", 2)
      : sourceRegisterValue(value, unit);
  const [localData, setData] = useState<RegisterData | null>(null),
    [error, setError] = useState(false),
    [selected, setSelected] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (resource !== undefined) return;
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
  }, [buildingId, retry, resource]);
  const data = resource ? resource.data : localData;
  if (resource ? resource.error : error)
    return (
      <div className="section-empty" role="alert">
        <h3>건축물대장 정보를 불러오지 못했습니다.</h3>
        <button onClick={onRetry ?? (() => setRetry((v) => v + 1))}>
          다시 불러오기
        </button>
      </div>
    );
  if (!data) return <p role="status">건축물대장 정보를 불러오는 중입니다.</p>;
  if (!data.records.length)
    return (
      <div className="register-panel">
        <div className="section-heading">
          <div>
            <h2>건축물대장</h2>
            <p>주소와 동 정보가 확인된 대장을 연결하면 항목별로 표시됩니다.</p>
          </div>
          <span className="connection-tag">대장 연결 전</span>
        </div>
        <div className="register-groups">
          {registerGroups.map((group) => (
            <section className="info-panel" key={group.title}>
              <h3>{group.title}</h3>
              <dl>
                {group.fields.map(([key, label]) => (
                  <div key={key}>
                    <dt>{label}</dt>
                    <dd>—</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    );
  const record = data.records.find((r) => r.id === selected) ?? data.records[0];
  const floors = data.floors.filter((f) => f.record_id === record.id);
  const sections = data.sections.filter((s) => s.record_id === record.id);
  // Do not add a complex recap to individual buildings or excluded floor areas.
  const uses = new Map<string, number>();
  floors
    .filter(
      (f) =>
        f.area_m2 != null &&
        f.area_m2 > 0 &&
        (!f.area_excluded ||
          f.area_excluded === "0" ||
          f.area_excluded === "N"),
    )
    .forEach((f) => {
      const use = f.main_use || f.other_use || "용도 미기재";
      uses.set(use, (uses.get(use) ?? 0) + f.area_m2!);
    });
  const total = [...uses.values()].reduce((sum, value) => sum + value, 0);
  return (
    <section className="register-panel" aria-label="건축물대장 정보">
      <div className="register-heading">
        <div>
          <h2>건축물대장</h2>
          <p>
            {record.record_kind === "complex"
              ? "단지 총괄표제부"
              : "건물 표제부"}
          </p>
        </div>
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
                    <RV
                      entity="building_register_records"
                      id={record.id}
                      field={key}
                      label={label}
                    >
                      {key === "seismic_design"
                        ? record[key] === "1"
                          ? "적용"
                          : record[key] === "0"
                            ? "미적용"
                            : registerValue(record[key])
                        : registerValue(record[key], unit)}
                    </RV>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {total > 0 && (
        <section className="info-panel use-composition">
          <h3>층별 용도 구성</h3>
          <p className="context-note">
            선택한 대장의 조회된 층별 면적 합계 기준 · 연면적 제외 항목 제외
          </p>
          {[...uses]
            .sort((a, b) => b[1] - a[1])
            .map(([use, area]) => (
              <div className="use-composition-row" key={use}>
                <div>
                  <span>{use}</span>
                  <strong>
                    {((area / total) * 100).toFixed(1)}%{" "}
                    <small>{registerValue(area, "㎡")}</small>
                  </strong>
                </div>
                <div className="use-composition-track">
                  <span style={{ width: `${(area / total) * 100}%` }} />
                </div>
              </div>
            ))}
        </section>
      )}
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
                        <RV
                          entity="building_register_sections"
                          id={s.id}
                          field="attributes"
                        >
                          {section === "zoning"
                            ? registerValue(s.attributes.name)
                            : `${registerValue(s.attributes.capacity_people, "명")} · ${registerValue(s.attributes.capacity_m3, "㎥")}`}
                        </RV>
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
