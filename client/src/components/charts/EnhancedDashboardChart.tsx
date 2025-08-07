import { Bar } from "react-chartjs-2";
export default function EnhancedDashboardChart({ data }) {
  const labels = data.map(d => d.label);
  const values = data.map(d => d.value);
  return <Bar data={{ labels, datasets: [{ label: "Series", data: values }] }}/>;
}
