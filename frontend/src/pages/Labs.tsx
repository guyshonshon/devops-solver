import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { labsApi } from "../lib/api";
import { LabCard } from "../components/LabCard";
import { CategoryChip } from "../components/CategoryChip";
import { Category } from "../types";

export function Labs() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: labs = [], isLoading } = useQuery({
    queryKey: ["labs"],
    queryFn: labsApi.list,
    refetchInterval: 30_000,
  });

  const filtered = labs.filter((l) => {
    const matchCat = filter === "all" || l.category === filter;
    const matchSearch = !search || l.title.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const grouped = filtered.reduce<Record<string, typeof labs>>((acc, lab) => {
    (acc[lab.category] ??= []).push(lab);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", paddingTop: "52px" }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "44px 40px 64px" }}>

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: "32px" }}>
          <p className="font-mono" style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: "10px" }}>
            All Content
          </p>
          <h1 style={{ fontSize: "28px", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em" }}>
            Labs &amp; Homework
          </h1>
        </motion.div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "32px", flexWrap: "wrap" }}>
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="font-mono"
            style={{
              padding: "7px 12px", fontSize: "12px",
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "6px", color: "var(--text)", outline: "none",
              width: "200px", transition: "border-color 0.15s",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--border-2)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          />
          <button
            onClick={() => setFilter("all")}
            className="font-mono"
            style={{
              padding: "6px 12px", fontSize: "11px", borderRadius: "6px", cursor: "pointer",
              border: `1px solid ${filter === "all" ? "rgba(59,130,246,0.35)" : "var(--border)"}`,
              background: filter === "all" ? "rgba(59,130,246,0.1)" : "transparent",
              color: filter === "all" ? "#60a5fa" : "var(--text-2)", transition: "all 0.15s",
            }}
          >
            All
          </button>
          {(["linux", "git", "python", "homework"] as Category[]).map((cat) => (
            <CategoryChip key={cat} category={cat} active={filter === cat} onClick={() => setFilter(filter === cat ? "all" : cat)} />
          ))}
        </div>

        {/* Groups */}
        {isLoading ? (
          <p className="font-mono" style={{ color: "var(--text-2)", fontSize: "13px" }}>Loading...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="font-mono" style={{ color: "var(--text-3)", fontSize: "13px" }}>No results</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
            {Object.entries(grouped).map(([cat, items]) => (
              <section key={cat}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px" }}>
                  <CategoryChip category={cat as Category} active />
                  <span className="font-mono" style={{ fontSize: "11px", color: "var(--text-3)" }}>{items.length} items</span>
                  <div style={{ flex: 1, height: "1px", background: "var(--border)" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "14px" }}>
                  {items.map((lab, i) => <LabCard key={lab.slug} lab={lab} index={i} />)}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
