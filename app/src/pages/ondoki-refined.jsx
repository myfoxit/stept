import { useState } from "react";

const themes = [
  { name: "Ink", brand: "#7a6a5a", light: "#f6f3ef", mid: "#e8e2da", bg: "#fafaf8", t1: "#2c2a27", t2: "#7a756e", t3: "#b0aaa2", bd: "#e8e4de", bdL: "#f0ece6", dot1: "#e0c8b8", dot2: "#e0d8c0", dot3: "#c8d4c0", banner: ["#fefcf6","#f5eedd","#96804e"] },
  { name: "Charcoal", brand: "#4a4a4a", light: "#f5f5f5", mid: "#e2e2e2", bg: "#fafafa", t1: "#1a1a1a", t2: "#6e6e6e", t3: "#aaa", bd: "#e0e0e0", bdL: "#efefef", dot1: "#e0b0b0", dot2: "#e0d8a0", dot3: "#b0d0b0", banner: ["#fafafa","#eee","#888"] },
  { name: "Navy", brand: "#3d5a80", light: "#f0f4f8", mid: "#d5dfea", bg: "#f8f9fb", t1: "#1c2a3a", t2: "#5e7080", t3: "#9aabba", bd: "#d8e0ea", bdL: "#edf1f5", dot1: "#d4a8a8", dot2: "#d8d0a0", dot3: "#a8c8b0", banner: ["#f5f8fc","#dde6f0","#5a7a96"] },
  { name: "Plum", brand: "#7a5a7a", light: "#f6f2f6", mid: "#e6dae6", bg: "#faf8fa", t1: "#2c272c", t2: "#7a6e7a", t3: "#b0a2b0", bd: "#e4dce4", bdL: "#f0eaf0", dot1: "#deb8b8", dot2: "#d8d0b0", dot3: "#b8ccb8", banner: ["#fcf8fc","#f0e4f0","#8a6a8a"] },
  { name: "Terracotta", brand: "#b07050", light: "#faf3ee", mid: "#eadace", bg: "#fdfaf7", t1: "#332820", t2: "#8a7060", t3: "#b8a090", bd: "#e8dcd0", bdL: "#f2ebe2", dot1: "#e0b8a0", dot2: "#ddd8b0", dot3: "#b0ccb8", banner: ["#fef8f0","#f2e4d4","#a08060"] },
  { name: "Forest", brand: "#4a6a54", light: "#f0f5f1", mid: "#d6e2d8", bg: "#f8faf8", t1: "#1e2a22", t2: "#5e7062", t3: "#9aaa9e", bd: "#d8e2da", bdL: "#edf2ee", dot1: "#d4b0a8", dot2: "#d8d4a0", dot3: "#a8c8b0", banner: ["#f6faf6","#dde8de","#5a7a5e"] },
  { name: "Slate", brand: "#6a7a8a", light: "#f2f4f6", mid: "#dce2e8", bg: "#f9fafb", t1: "#222830", t2: "#6a7580", t3: "#a0aab4", bd: "#dde2e8", bdL: "#eef0f3", dot1: "#d4aeae", dot2: "#d6d2a8", dot3: "#aecaae", banner: ["#f8fafc","#e2e8ee","#7a8a9a"] },
  { name: "Espresso", brand: "#6a4e3a", light: "#f5f0ea", mid: "#e4d8cc", bg: "#faf8f5", t1: "#2a2018", t2: "#7a6a58", t3: "#b0a08a", bd: "#e2d8ca", bdL: "#eeebe4", dot1: "#deb8a0", dot2: "#dcd8b0", dot3: "#b8ccb0", banner: ["#faf6f0","#eee0d0","#8a7050"] },
  { name: "Steel", brand: "#5a6a7a", light: "#f1f3f6", mid: "#d8dfe6", bg: "#f8f9fb", t1: "#20252c", t2: "#60707e", t3: "#98a4b0", bd: "#d8dee6", bdL: "#edf0f4", dot1: "#d0acac", dot2: "#d4d0a4", dot3: "#acc8ac", banner: ["#f6f8fc","#dee4ee","#6a7a8e"] },
  { name: "Mocha", brand: "#8a6e5e", light: "#f6f2ee", mid: "#e6dcd4", bg: "#faf9f6", t1: "#2e2420", t2: "#7e6e62", t3: "#b0a296", bd: "#e4dad0", bdL: "#f0eae4", dot1: "#deb8a8", dot2: "#dcd8b4", dot3: "#b4cab8", banner: ["#fcf8f4","#eee2d6","#967a66"] },
];

const privateItems = [
  { label: "Create new item in Op…" },
  { label: "Untitled Workflow" },
  { label: "Create new item in Go…" },
  { label: "Fill out form in Google …" },
  { label: "How to use Google She…" },
  { label: "How to use Google She…", active: true },
];

function Icon({ name, size = 16, color = "currentColor" }) {
  const s = { width: size, height: size, flexShrink: 0 };
  switch (name) {
    case "page": return (<svg style={s} fill="none" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "workflow": return (<svg style={s} fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5"/><rect x="15" y="3" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5"/><rect x="9" y="15" width="6" height="6" rx="1" stroke={color} strokeWidth="1.5"/><path d="M9 6h6M6 9v3a3 3 0 003 3M18 9v3a3 3 0 01-3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>);
    case "docs": return (<svg style={s} fill="none" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>);
    case "spark": return (<svg style={s} fill="none" viewBox="0 0 24 24"><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/><path d="M17 14l.75 2.25L20 17l-2.25.75L17 20l-.75-2.25L14 17l2.25-.75L17 14z" stroke={color} strokeWidth="1.2" strokeLinejoin="round"/></svg>);
    case "folder": return (<svg style={s} fill="none" viewBox="0 0 24 24"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "settings": return (<svg style={s} fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke={color} strokeWidth="1.5"/></svg>);
    case "help": return (<svg style={s} fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" stroke={color} strokeWidth="1.5" strokeLinecap="round"/><circle cx="12" cy="17" r="0.5" fill={color}/></svg>);
    case "chevronDown": return (<svg style={{ width: 10, height: 10, flexShrink: 0 }} fill="none" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case "search": return (<svg style={s} fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke={color} strokeWidth="1.5"/><path d="M21 21l-4.35-4.35" stroke={color} strokeWidth="1.5" strokeLinecap="round"/></svg>);
    default: return null;
  }
}

export default function FångaThemed() {
  const [themeIdx, setThemeIdx] = useState(0);
  const th = themes[themeIdx];
  const font = '"Source Sans 3", "Source Sans Pro", -apple-system, sans-serif';
  const headFont = '"DM Sans", sans-serif';
  const iconMuted = th.mid;

  const SidebarItem = ({ icon, label, indent = 0, active, hasChevron }) => (
    <button style={{
      display: "flex", alignItems: "center", gap: 8, width: "100%",
      padding: `4px 14px 4px ${16 + indent * 16}px`, border: "none",
      background: active ? th.light : "transparent",
      cursor: "pointer", fontFamily: font, fontSize: 13, textAlign: "left",
      color: active ? th.brand : th.t2, fontWeight: active ? 500 : 400,
      borderRadius: 0, transition: "all 0.2s", lineHeight: "28px",
    }}>
      {hasChevron && <Icon name="chevronDown" size={10} color={active ? th.brand : iconMuted} />}
      <Icon name={icon} size={15} color={active ? th.brand : iconMuted} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );

  return (
    <div style={{ fontFamily: font, display: "flex", flexDirection: "column", height: "100vh", color: th.t1, fontSize: 13.5, transition: "all 0.3s" }}>
      <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* THEME SWITCHER */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#fff", borderBottom: `1px solid ${th.bdL}`, flexShrink: 0, transition: "all 0.3s" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: th.t3, letterSpacing: "0.04em", textTransform: "uppercase", marginRight: 4 }}>Theme</span>
        {themes.map((t, i) => (
          <button
            key={t.name}
            onClick={() => setThemeIdx(i)}
            title={t.name}
            style={{
              width: 28, height: 28, borderRadius: 8, background: t.brand, border: i === themeIdx ? "2px solid #fff" : "2px solid transparent",
              boxShadow: i === themeIdx ? `0 0 0 2px ${t.brand}` : "none",
              cursor: "pointer", transition: "all 0.2s", position: "relative",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {i === themeIdx && <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </button>
        ))}
        <span style={{ fontSize: 12.5, fontWeight: 500, color: th.t2, marginLeft: 6, transition: "color 0.3s" }}>{th.name}</span>
        <code style={{ fontSize: 10.5, color: th.t3, background: th.light, padding: "2px 6px", borderRadius: 4, marginLeft: 2, transition: "all 0.3s" }}>{th.brand}</code>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <aside style={{ width: 232, borderRight: `1px solid ${th.bdL}`, display: "flex", flexDirection: "column", background: th.bg, flexShrink: 0, userSelect: "none", transition: "all 0.3s" }}>
          <div style={{ padding: "14px 16px 10px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: th.brand, display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.3s" }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <span style={{ fontFamily: headFont, fontWeight: 600, fontSize: 15.5, letterSpacing: "-0.02em", color: th.t1 }}>Fånga</span>
          </div>

          <div style={{ padding: "0 12px 8px" }}>
            <button style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "5px 6px", border: "none", background: "none", cursor: "pointer", fontFamily: font, fontSize: 13, color: th.t2, fontWeight: 500 }}>
              My Workspace <Icon name="chevronDown" size={10} color={th.t3} />
            </button>
          </div>

          <div style={{ padding: "0 12px 6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 6, border: `1px solid ${th.bdL}`, background: "#fff", fontSize: 12.5, color: iconMuted, transition: "all 0.3s" }}>
              <Icon name="search" size={13} color={iconMuted}/> Search…
              <span style={{ marginLeft: "auto", fontSize: 10, background: th.bdL, borderRadius: 3, padding: "1px 5px", color: th.t3 }}>⌘K</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "2px 0" }}>
            <div style={{ padding: "10px 16px 4px", fontSize: 10.5, fontWeight: 600, color: th.t3, letterSpacing: "0.06em", textTransform: "uppercase" }}>Content</div>
            <SidebarItem icon="page" label="Pages"/>
            <SidebarItem icon="workflow" label="Workflows"/>
            <SidebarItem icon="docs" label="All Documents"/>

            <div style={{ padding: "16px 16px 4px", fontSize: 10.5, fontWeight: 600, color: th.t3, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              Shared
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: iconMuted, display: "flex" }}><svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
            </div>
            <SidebarItem icon="folder" label="Monitoring Base" hasChevron/>
            <SidebarItem icon="folder" label="Unsorted" indent={1} hasChevron/>
            <SidebarItem icon="page" label="Untitled" indent={2.5}/>

            <div style={{ padding: "16px 16px 4px", fontSize: 10.5, fontWeight: 600, color: th.t3, letterSpacing: "0.06em", textTransform: "uppercase", display: "flex", justifyContent: "space-between" }}>
              Private
              <button style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: iconMuted, display: "flex" }}><svg width="11" height="11" fill="none" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></button>
            </div>
            <SidebarItem icon="folder" label="Unsorted" hasChevron/>
            {privateItems.map((item, i) => (
              <SidebarItem key={i} icon="spark" label={item.label} indent={1} active={item.active}/>
            ))}
          </div>

          <div style={{ borderTop: `1px solid ${th.bdL}`, padding: "4px 0" }}>
            <SidebarItem icon="settings" label="Settings"/>
            <SidebarItem icon="help" label="Get Help"/>
          </div>
          <div style={{ borderTop: `1px solid ${th.bdL}`, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: th.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10.5, fontWeight: 600, transition: "background 0.3s" }}>AH</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3 }}>Alexander Höhne</div>
              <div style={{ fontSize: 11, color: th.t3, lineHeight: 1.3 }}>hello@ondoki.com</div>
            </div>
            <button style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: iconMuted, display: "flex" }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main style={{ flex: 1, overflowY: "auto", background: "#fff", transition: "all 0.3s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 24px", borderBottom: `1px solid ${th.bdL}` }}>
            <span style={{ fontSize: 13, color: th.t3 }}>Workflow</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {["Edit","Share"].map(label => (
                <button key={label} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", border: `1px solid ${th.bd}`, borderRadius: 6, background: "#fff", fontSize: 12.5, color: th.t2, cursor: "pointer", fontFamily: font, fontWeight: 500 }}>{label}</button>
              ))}
              <button style={{ padding: "5px 14px", border: "none", borderRadius: 6, background: th.brand, fontSize: 12.5, color: "#fff", cursor: "pointer", fontFamily: font, fontWeight: 500, transition: "background 0.3s" }}>Export</button>
            </div>
          </div>

          <div style={{ padding: "8px 24px", background: th.banner[0], borderBottom: `1px solid ${th.banner[1]}`, fontSize: 12.5, color: th.banner[2], display: "flex", alignItems: "center", gap: 8, transition: "all 0.3s" }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
            This Workflow is only visible to you. Make any changes, then share it.
          </div>

          <div style={{ maxWidth: 720, margin: "0 auto", padding: "36px 32px 80px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: th.light, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.3s" }}>
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke={th.brand} strokeWidth="1.5" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" stroke={th.brand} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <div>
                <h1 style={{ fontFamily: headFont, fontSize: 24, fontWeight: 600, letterSpacing: "-0.025em", margin: 0, color: th.t1, lineHeight: 1.25 }}>How to use Google Sheets</h1>
                <div style={{ fontSize: 12.5, color: th.t3, marginTop: 2 }}>Anonymous · 5 steps</div>
              </div>
            </div>

            <div style={{ padding: "8px 0 18px 58px" }}>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontFamily: font, fontSize: 12.5, color: th.t3, padding: 0 }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Add context
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 32, padding: "12px 16px", borderRadius: 8, background: th.bg, border: `1px solid ${th.bdL}`, transition: "all 0.3s" }}>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, border: "none", background: th.brand, color: "#fff", fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: font, transition: "background 0.3s" }}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24"><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round"/></svg>
                Process with AI
              </button>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, border: `1px solid ${th.bd}`, background: "#fff", color: th.t2, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: font }}>
                <Icon name="page" size={13} color={iconMuted}/> Generate Guide
              </button>
              <button style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, border: `1.5px solid ${th.brand}`, background: th.light, color: th.brand, fontSize: 12.5, fontWeight: 500, cursor: "pointer", fontFamily: font, transition: "all 0.3s" }}>
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21" fill={th.brand}/></svg>
                Guide Me
              </button>
            </div>

            {[
              { num: 1, title: 'Click the "Format" tab', full: true },
              { num: 2, title: "Click on highlight" },
              { num: 3, title: "Select your formatting option" },
              { num: 4, title: "Apply conditional formatting" },
              { num: 5, title: "Click Done" },
            ].map((step) => (
              <div key={step.num} style={{ marginBottom: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: th.brand, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 600, flexShrink: 0, fontFamily: headFont, transition: "background 0.3s" }}>{step.num}</div>
                  <span style={{ fontFamily: headFont, fontSize: 15, fontWeight: 500, color: th.t1, letterSpacing: "-0.01em" }}>{step.title}</span>
                </div>

                {step.full ? (
                  <div style={{ borderRadius: 8, border: `1px solid ${th.bdL}`, overflow: "hidden", marginLeft: 40, transition: "border-color 0.3s" }}>
                    <div style={{ background: th.bg, borderBottom: `1px solid ${th.bdL}`, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, transition: "all 0.3s" }}>
                      <div style={{ display: "flex", gap: 5 }}>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: th.dot1, transition: "background 0.3s" }}/>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: th.dot2, transition: "background 0.3s" }}/>
                        <div style={{ width: 9, height: 9, borderRadius: "50%", background: th.dot3, transition: "background 0.3s" }}/>
                      </div>
                      <span style={{ fontSize: 11, color: th.t3 }}>Unbenannte Tabelle</span>
                    </div>
                    <div style={{ display: "flex", padding: "0 12px", borderBottom: `1px solid ${th.bdL}`, background: "#fff" }}>
                      {["Datei","Bearbeiten","Ansicht","Einfügen","Format","Daten","Tools","Extras"].map(item => (
                        <span key={item} style={{ padding: "4px 9px", fontSize: 11.5, color: item === "Format" ? th.brand : th.t2, fontWeight: item === "Format" ? 600 : 400, position: "relative", cursor: "pointer", transition: "color 0.3s" }}>
                          {item}
                          {item === "Format" && <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 42, height: 26, borderRadius: 13, border: `2px solid ${th.brand}`, background: `${th.brand}10`, pointerEvents: "none", transition: "all 0.3s" }}/>}
                        </span>
                      ))}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10.5, color: th.mid }}>
                      <thead><tr style={{ background: th.bg }}>
                        <th style={{ width: 26, padding: 3, borderRight: `1px solid ${th.bdL}`, borderBottom: `1px solid ${th.bdL}`, fontWeight: 400 }}/>
                        {["A","B","C","D","E","F","G","H","I"].map(c => (
                          <th key={c} style={{ padding: "3px 8px", borderRight: `1px solid ${th.bdL}`, borderBottom: `1px solid ${th.bdL}`, fontWeight: 400, minWidth: 54 }}>{c}</th>
                        ))}
                      </tr></thead>
                      <tbody>{Array.from({length:6},(_,i) => (
                        <tr key={i}>
                          <td style={{ padding: "2px 4px", borderRight: `1px solid ${th.bdL}`, borderBottom: `1px solid ${th.bdL}`, textAlign: "center", background: th.bg, fontSize: 10 }}>{i+1}</td>
                          {Array.from({length:9},(_,j) => (
                            <td key={j} style={{ padding: "2px 8px", borderRight: `1px solid ${th.bdL}`, borderBottom: `1px solid ${th.bdL}`, height: 18 }}/>
                          ))}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ borderRadius: 8, border: `1px solid ${th.bdL}`, marginLeft: 40, height: 120, background: th.bg, display: "flex", alignItems: "center", justifyContent: "center", color: th.mid, fontSize: 12, transition: "all 0.3s" }}>
                    Screenshot placeholder
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
