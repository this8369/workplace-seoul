import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exactOverviewTopic,
  overviewItemInput,
  overviewTopicKey,
  suggestOverviewTopics,
  type OverviewTopic,
} from "./overview-topics.ts";
const topics: OverviewTopic[] = [
  {
    code: "builtin:typical_floor_exclusive_pyeong",
    label: "기준층면적(전용)",
    entity: "buildings",
    field: "typical_floor_exclusive_pyeong",
    overview_label: "기준층면적(전용)",
    unit: "평",
    aliases: ["기준층전용면적"],
  },
  {
    code: "custom:피트니스",
    label: "피트니스",
    entity: null,
    field: null,
    overview_label: null,
    unit: null,
    aliases: ["피트니스", "헬스장", "휘트니스"],
  },
  {
    code: "custom:메일룸",
    label: "메일룸",
    entity: null,
    field: null,
    overview_label: null,
    unit: null,
    aliases: ["메일룸"],
  },
];
test("topics resolve canonical labels and aliases without creating spacing/punctuation duplicates", () => {
  assert.equal(overviewTopicKey("비교표 · Ｌｅａｓｅ Span"), "leasespan");
  assert.equal(overviewTopicKey("원그로브 전체 · 옥상 정원"), "옥상정원");
  assert.equal(
    exactOverviewTopic(topics, "기준층 전용 면적")?.entity,
    "buildings",
  );
  assert.equal(exactOverviewTopic(topics, "헬스 장")?.label, "피트니스");
  assert.equal(exactOverviewTopic(topics, "  메일 룸 ")?.code, "custom:메일룸");
  assert.equal(exactOverviewTopic(topics, ""), undefined);
  assert.equal(suggestOverviewTopics(topics, "휘트")[0]?.label, "피트니스");
  assert(
    suggestOverviewTopics(topics, "")
      .slice(0, 2)
      .every((t) => t.entity === null),
  );
});
test("custom values preserve meaningful zero, quantities and text without requiring JSON syntax", () => {
  assert.equal(overviewItemInput(" 0 "), 0);
  assert.equal(overviewItemInput("1,234.5"), 1234.5);
  assert.equal(overviewItemInput(" O (700평) "), "O (700평)");
  assert.equal(overviewItemInput("약 600~900"), "약 600~900");
  assert.equal(overviewItemInput("3,5"), "3,5");
  assert.throws(() => overviewItemInput(" "));
  assert.throws(() => overviewItemInput("x".repeat(2001)));
});
