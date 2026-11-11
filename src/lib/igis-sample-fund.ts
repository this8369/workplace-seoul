// Standalone fictional values for the read-only investment panel.
export const igisSampleFund = {
  name: "이지스 테스트 오피스 펀드",
  code: "DEMO-IGIS-01",
  asOf: "2025.12.31",
  asset: {
    name: "가상 오피스 01",
    grossArea: 47_960,
    exclusiveArea: 29_850,
    floors: "지하 6층 / 지상 28층",
    acquiredOn: "2023.06.30",
    acquisitionPrice: 3_780,
    valuation: 4_280,
    capRate: 4.49,
  },
  fund: {
    establishedOn: "2023.05.12",
    maturity: "2030.06.30",
    manager: "가상 운용사 A",
    trustee: "가상 수탁기관 A",
    administrator: "가상 사무관리사 A",
    committedCapital: 2_100,
    fundedCapital: 2_050,
    otherAssets: 130,
    otherLiabilities: 50,
    targetIrr: 8.2,
    distributed: 186,
    fee: 0.55,
  },
  investors: [
    {
      name: "가상 기관투자자 A",
      tranche: "1종",
      committed: 1_000,
      funded: 1_000,
    },
    { name: "가상 기관투자자 B", tranche: "1종", committed: 700, funded: 675 },
    { name: "가상 기관투자자 C", tranche: "2종", committed: 400, funded: 375 },
  ],
  loans: [
    {
      name: "선순위 담보대출",
      lender: "가상 금융기관 A",
      committed: 1_750,
      balance: 1_700,
      rate: 4.35,
      maturity: "2028.06.30",
      repayment: "만기 일시상환",
    },
    {
      name: "후순위 담보대출",
      lender: "가상 금융기관 B",
      committed: 350,
      balance: 350,
      rate: 5.6,
      maturity: "2028.06.30",
      repayment: "만기 일시상환",
    },
  ],
  leases: [
    {
      name: "가상 임차사 A",
      floors: "19–28층",
      area: 10_100,
      rent: 7.6,
      fee: 2.1,
      deposit: 76,
      expiresOn: "2030.06.30",
    },
    {
      name: "가상 임차사 B",
      floors: "11–18층",
      area: 8_200,
      rent: 5.7,
      fee: 1.7,
      deposit: 57,
      expiresOn: "2029.12.31",
    },
    {
      name: "가상 임차사 C",
      floors: "5–10층",
      area: 6_150,
      rent: 4.6,
      fee: 1.3,
      deposit: 46,
      expiresOn: "2028.09.30",
    },
    {
      name: "가상 임차사 D",
      floors: "1–4층",
      area: 4_206,
      rent: 3.1,
      fee: 0.9,
      deposit: 31,
      expiresOn: "2028.03.31",
    },
  ],
  operations: [
    {
      period: "2024 실적",
      rent: 236,
      otherRevenue: 16,
      expenses: 75,
      capex: 32,
    },
    {
      period: "2025 실적",
      rent: 252,
      otherRevenue: 18,
      expenses: 78,
      capex: 28,
    },
    {
      period: "2026 계획",
      rent: 262,
      otherRevenue: 19,
      expenses: 82,
      capex: 34,
    },
  ],
  cashEntries: [
    {
      date: "2025.12.05",
      type: "입금",
      description: "12월 임대료 수납",
      amount: 21,
    },
    {
      date: "2025.12.15",
      type: "출금",
      description: "12월 시설 운영비",
      amount: 6.5,
    },
    {
      date: "2025.12.30",
      type: "출금",
      description: "4분기 배당금 지급",
      amount: 28,
    },
  ],
  valuations: [
    { date: "2023.12.31", value: 3_950, method: "수익환원법" },
    { date: "2024.12.31", value: 4_120, method: "현금흐름할인법" },
    { date: "2025.12.31", value: 4_280, method: "현금흐름할인법" },
  ],
  history: [
    {
      date: "2025.12.31",
      title: "연말 감정평가 반영",
      description: "평가액 4,120억 → 4,280억",
    },
    {
      date: "2025.12.20",
      title: "운영계획 승인",
      description: "2026년 NOI 목표 199억, 시설투자 34억",
    },
    {
      date: "2025.07.01",
      title: "주요 임대차 갱신",
      description: "가상 임차사 A 계약 만기를 2030년 6월로 연장",
    },
    {
      date: "2023.06.30",
      title: "투자 자산 인수",
      description: "가상 오피스 01을 3,780억에 인수",
    },
  ],
} as const;

const debt = igisSampleFund.loans.reduce((sum, loan) => sum + loan.balance, 0);
export const igisSampleMetrics = {
  debt,
  nav:
    igisSampleFund.asset.valuation +
    igisSampleFund.fund.otherAssets -
    debt -
    igisSampleFund.fund.otherLiabilities,
  ltv: (debt / igisSampleFund.asset.valuation) * 100,
  occupancy:
    (igisSampleFund.leases.reduce((sum, lease) => sum + lease.area, 0) /
      igisSampleFund.asset.exclusiveArea) *
    100,
};
