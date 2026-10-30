export type OverviewTopic = {
  code: string;
  label: string;
  entity: string | null;
  field: string | null;
  overview_label: string | null;
  unit: string | null;
  aliases: string[];
};
export type OverviewItem = {
  id: string;
  topic_code: string;
  label: string;
  value: string | number | boolean;
  unit: string | null;
};
export type OverviewItems = {
  building_id: string;
  items: OverviewItem[];
  topics: OverviewTopic[];
};
export function overviewTopicKey(label: string) {
  return label
    .replace(/^(비교표|.+ 전체)\s*·\s*/, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "");
}
export function exactOverviewTopic(topics: OverviewTopic[], label: string) {
  const key = overviewTopicKey(label);
  return key
    ? topics.find(
        (t) => overviewTopicKey(t.label) === key || t.aliases.includes(key),
      )
    : undefined;
}
export function suggestOverviewTopics(topics: OverviewTopic[], label: string) {
  const key = overviewTopicKey(label);
  const score = (t: OverviewTopic) => {
    const names = [overviewTopicKey(t.label), ...t.aliases];
    return !key
      ? t.entity
        ? 2
        : 1
      : names.includes(key)
        ? 0
        : names.some((n) => n.startsWith(key))
          ? 1
          : names.some((n) => n.includes(key))
            ? 2
            : 9;
  };
  return topics
    .filter((t) => score(t) < 9)
    .sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label, "ko"))
    .slice(0, 8);
}
export function overviewItemInput(value: string) {
  const text = value.trim();
  if (!text || text.length > 2000)
    throw Error("내용을 1~2,000자로 입력해 주세요.");
  if (/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
    const number = Number(text.replaceAll(",", ""));
    if (Number.isFinite(number)) return number;
  }
  return text;
}
