/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { Bar } from "react-chartjs-2";

interface ChartDataItem {
  label: string;
  value: number;
}

export default function EnhancedDashboardChart({ data }: { data: ChartDataItem[] }) {
  const labels = data.map((d: ChartDataItem) => d.label);
  const values = data.map((d: ChartDataItem) => d.value);
  return <Bar data={{ labels, datasets: [{ label: "Series", data: values }] }}/>;
}

