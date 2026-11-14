"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; value: number };

export function GrowthChart({ data }: { data: Point[] }) {
  if (!data.some((point) => point.value > 0)) return <div className="grid h-[250px] place-items-center text-xs text-muted">Subscriber activity will appear here as contacts are added.</div>;
  return <ResponsiveContainer width="100%" height={250}>
    <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
      <defs><linearGradient id="subscriberFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7765ee" stopOpacity={0.17} /><stop offset="95%" stopColor="#7765ee" stopOpacity={0} /></linearGradient></defs>
      <CartesianGrid vertical={false} stroke="#eeeee9" strokeDasharray="3 4" />
      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#999991" }} />
      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#999991" }} />
      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e9e9e5", fontSize: 12, boxShadow: "0 4px 16px #0000000c" }} />
      <Area type="monotone" dataKey="value" name="New subscribers" stroke="#7665e9" strokeWidth={2} fill="url(#subscriberFill)" />
    </AreaChart>
  </ResponsiveContainer>;
}

export function PerformanceChart({ data }: { data: Point[] }) {
  if (!data.some((point) => point.value > 0)) return <div className="grid h-[250px] place-items-center text-xs text-muted">Campaign performance appears after your first send.</div>;
  return <ResponsiveContainer width="100%" height={250}>
    <AreaChart data={data} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="#eeeee9" strokeDasharray="3 4" />
      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#999991" }} />
      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#999991" }} />
      <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e9e9e5", fontSize: 12 }} />
      <Area type="monotone" dataKey="value" name="Delivered emails" stroke="#19a878" strokeWidth={2} fill="#19a878" fillOpacity={0.1} />
    </AreaChart>
  </ResponsiveContainer>;
}
