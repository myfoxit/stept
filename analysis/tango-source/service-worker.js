(function () {
  try {
    var e =
      typeof window < `u`
        ? window
        : typeof global < `u`
          ? global
          : typeof globalThis < `u`
            ? globalThis
            : typeof self < `u`
              ? self
              : {};
    e.SENTRY_RELEASE = { id: `extension@8.6.6` };
  } catch {}
})();
import "./NwBF3_Sl.js";
import {
  B as e,
  C as t,
  Et as n,
  Ht as r,
  I as i,
  J as a,
  L as o,
  N as s,
  Nt as c,
  O as l,
  Ot as u,
  R as ee,
  St as d,
  Ut as f,
  Vt as p,
  W as m,
  Y as h,
  b as g,
  ct as _,
  dt as v,
  gt as y,
  h as te,
  o as ne,
  ot as re,
  p as ie,
  r as ae,
  w as b,
  x,
  y as oe,
  yt as se,
} from "./Cj99izlc.js";
import {
  A as ce,
  B as le,
  C as ue,
  D as de,
  E as fe,
  H as S,
  I as pe,
  L as C,
  M as w,
  N as me,
  O as T,
  P as he,
  R as ge,
  S as _e,
  T as ve,
  U as E,
  V as D,
  Z as ye,
  _ as O,
  a as be,
  b as xe,
  c as Se,
  d as Ce,
  f as we,
  g as Te,
  h as k,
  l as Ee,
  m as A,
  n as j,
  q as M,
  r as De,
  s as Oe,
  t as N,
  u as ke,
  v as P,
  w as F,
  x as I,
  y as L,
  z as R,
} from "./D5qtcQ-q.js";
import {
  S as Ae,
  T as z,
  _ as B,
  b as V,
  d as H,
  f as U,
  h as W,
  l as G,
  n as K,
  p as q,
  r as je,
  t as Me,
  u as Ne,
  y as Pe,
} from "./B_7_FnlV.js";
import {
  a as Fe,
  d as Ie,
  f as Le,
  i as Re,
  m as ze,
  p as Be,
  r as Ve,
  u as He,
} from "./CqoGIaHP.js";
import "./C5jLDnSS.js";
import "./C74s0Oy-.js";
import "./Al87cAac.js";
import {
  $ as Ue,
  A as We,
  B as Ge,
  C as Ke,
  D as qe,
  E as Je,
  G as Ye,
  H as Xe,
  J as Ze,
  K as Qe,
  M as $e,
  Mt as et,
  N as tt,
  Nt as nt,
  O as rt,
  P as it,
  Q as at,
  R as ot,
  S as st,
  T as ct,
  U as lt,
  V as ut,
  W as dt,
  X as ft,
  Y as pt,
  Z as mt,
  _ as J,
  a as Y,
  b as ht,
  c as gt,
  d as _t,
  et as vt,
  g as yt,
  j as bt,
  jt as xt,
  k as St,
  m as Ct,
  mt as wt,
  o as Tt,
  ot as Et,
  pt as Dt,
  s as Ot,
  v as kt,
  w as At,
  x as jt,
  y as Mt,
  z as Nt,
} from "./BtgoBnV8.js";
import { g as Pt } from "./B1wSa5WC.js";
import { t as Ft } from "./B9-RHjnp.js";
import { t as X } from "./DNykMfwC.js";
import "./BvIkpkrg.js";
import { n as It } from "./Cy_J9uWP.js";
const Lt = (e) => {
  if (!E.user || e.stepTrackingEvents || e.workflowTrackingEvents) return;
  let t = e.nuggetTrackingEvents || [];
  N(E.user)
    .trackEvents({ nuggetTrackingEvents: t })
    .catch((t) => {
      V(t, { extra: { input: JSON.stringify(e) } });
    });
};
function Rt(e, t) {
  let n = t.contentBlocks.map((e) =>
      e.type === y.Step || e.type === y.Heading ? Pt(e.url) : null,
    ),
    r = Pt(e.pendingUrl ?? e.url);
  return n.includes(r);
}
const zt = (e) => {
  if (e.tab?.id)
    return chrome.scripting.executeScript({
      func: Bt,
      target: { tabId: e.tab.id, frameIds: e.frameId ? [e.frameId] : void 0 },
      world: `MAIN`,
    });
};
function Bt() {
  let e = (e) => {
      if (e == null || e instanceof URL) return e;
      try {
        return new URL(e, document.baseURI).href;
      } catch {
        return e;
      }
    },
    t = window.open;
  window.open = function (...n) {
    let r = t.apply(this, n),
      i = n[0],
      a = [e(i), ...n.slice(1)];
    return (
      r ||
        window.dispatchEvent(
          new CustomEvent(`tangoPopupBlocked`, { detail: a }),
        ),
      r
    );
  };
}
var Vt = null;
function Ht() {
  chrome.runtime.onConnect.addListener((e) => {
    e.name === `panel-messages` &&
      (e.onDisconnect.addListener(Wt), (Vt = setTimeout(Ut, 28e3, e)));
  });
}
function Ut(e) {
  (Gt(), e.disconnect());
}
function Wt() {
  Gt();
  async function e() {
    (await ue()) || yt();
  }
  e();
}
function Gt() {
  Vt &&= (clearTimeout(Vt), null);
}
async function Kt(e) {
  let t = `${K.webUrl}${a}`;
  e && (t += `?redirectTo=${encodeURIComponent(e)}`);
  let n = (await chrome.tabs.query({ url: t }))[0];
  n && n.id
    ? (chrome.tabs.reload(n.id), he(n.id))
    : chrome.tabs.create({ url: t, active: !0 });
}
const Z = (e) => {
  let { id: t, owner: n, createdBy: r, ...i } = e;
  return { ...i, workflowId: t, author: n || r };
};
var qt = 36e5 * 8,
  Jt = `https://tango.launchnotes.io/`,
  Yt = `pro_Z7yZJkso9fI58`,
  Xt = `public_nZf5q3zm1oLXugkClgoy0nJf`,
  Zt = `https://app.launchnotes.io/graphql`;
function Qt() {
  let e = new Date().getTime();
  (!E.latestAnnouncementCheck || e - E.latestAnnouncementCheck > qt) && nn();
}
function $t() {
  return (
    !!E.latestAnnouncement && E.latestAnnouncement !== K.lastViewedAnnouncement
  );
}
function en() {
  (chrome.tabs.create({ url: Jt, active: !0 }), tn());
}
function tn() {
  (je(o.LastViewedAnnouncement, E.latestAnnouncement),
    chrome.action.setBadgeText({ text: `` }));
}
async function nn() {
  let e = await rn(),
    t = new Date().getTime();
  e
    ? (D({ latestAnnouncement: e, latestAnnouncementCheck: t }),
      K.lastViewedAnnouncement || tn())
    : D({ latestAnnouncementCheck: t });
}
async function rn() {
  let e = `
    query {
      viewer {
        id
        project(id: "${Yt}") {
          announcements(first: 1, state: published) {
            nodes {
              id
            }
          }
        }
      }
    }
  `;
  try {
    let t = await fetch(Zt, {
      method: `POST`,
      headers: {
        "Content-Type": `application/json`,
        Authorization: `Bearer ${Xt}`,
      },
      body: JSON.stringify({ query: e }),
    });
    if (!t.ok)
      throw Error(`LaunchNotes returned invalid status: ${t.statusText}`);
    return (await t.json())?.data?.viewer?.project?.announcements?.nodes[0]?.id;
  } catch (e) {
    return (
      console.warn(`Could not fetch announcements from LaunchNotes`, e),
      null
    );
  }
}
const an = (e) => N(E.user).addComment(e),
  on = (e) => N(E.user).listComments(e),
  sn = (e, t, n) => N(E.user).deleteComment(e, t, n);
function cn(e) {
  return ln(e)
    ? {
        isGuidanceCompatible: !1,
        reason: `This Tango was captured on desktop, Guide Me unavailable`,
      }
    : un(e)
      ? {
          isGuidanceCompatible: !1,
          reason: `Guide Me unavailable; step URLs are missing`,
        }
      : { isGuidanceCompatible: !0 };
}
function ln(e) {
  return e.contentBlocks.filter(ye).every((e) => e.stepOrigin === c.Desktop);
}
function un(e) {
  let t = e.contentBlocks.filter((e) => ye(e) && e.stepOrigin === c.Extension);
  return t.length > 0 && t.every((e) => !e.url);
}
const dn = async (e) => {
  if (!e) return !1;
  try {
    return (
      (
        await fetch(e, {
          method: `get`,
          headers: { "Content-Type": `application/json` },
        })
      ).status === 200
    );
  } catch {}
  return !1;
};
var fn = (e) => {
  let t = (e || ``).split(`-`),
    n = t[t.length - 1];
  if (!n) throw Error(`Invalid workflow slug`);
  return `${n.slice(0, 8)}-${n.slice(8, 12)}-${n.slice(12, 16)}-${n.slice(16, 20)}-${n.slice(20)}`;
};
const pn = (e, t) => {
  if (mn(e)) return e;
  {
    let n = fn(e);
    return mn(n) ? n : t || e;
  }
};
var mn = (e) =>
    /^[0-9A-F]{8}-[0-9A-F]{4}-[4][0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i.test(
      e,
    ),
  hn = async (e, t) => {
    I();
    let n = await w(),
      r = e.replace(g, ``);
    t
      ? chrome.tabs.create({ url: r, index: n?.index + 1 })
      : chrome.tabs.update(n.id, { url: r, active: !0 });
  },
  gn = async (e, t, n) => {
    let r = e.contentBlocks.find((e) => `url` in e && e.url),
      i = r?.url;
    if (await dn(i ?? ``)) {
      let e = await L(i, { tabBehavior: `reuse-only` });
      (e && t !== e.id && (await chrome.tabs.remove(t)),
        e || (await chrome.tabs.update(t, { url: r?.url, active: !0 })));
    } else await chrome.tabs.update(t, { url: n + oe, active: !0 });
    return (
      R(X.DtgOverlayViewedFromExternalApp, { workflow_id: e?.id }),
      k(m.DirectToGuidance, { workflow: e })
    );
  },
  _n = async (e, t, n) => {
    let r = cn(e),
      i = t.replace(g, ``),
      a = e.contentBlocks.find((e) => `url` in e && e.url);
    if (!a || !r.isGuidanceCompatible) {
      (chrome.tabs.create({ url: i }), I());
      return;
    }
    let o = [];
    a &&
      pe(a.url) &&
      (n && chrome.tabs.update(n, { url: i }),
      await L(a.url, { tabBehavior: `always-new` }),
      o.push(a.id));
    let s = new URLSearchParams(t.split(`?`)[1]).get(`eventSource`),
      c = crypto.randomUUID();
    (Ot({ input: { sessionId: c } }),
      Y()?.send({ type: `setWorkflow`, workflow: e }),
      R(X.WorkflowViewedFromDTGInline, {
        workflow_id: e?.id,
        event_source: s || void 0,
      }),
      k(m.Viewing, {
        workflow: e,
        preview: !0,
        guidanceSessionId: c,
        eventSource: `Direct to Guidance - Sidepanel`,
        initialOpenedUrlContentBlockIds: o,
      }));
  };
const vn = (e) => {
  let t = e.url || e.pendingUrl;
  if (!t) return;
  let n = pe(t),
    r = n?.pathname.includes(v),
    i = n?.pathname.endsWith(g);
  n && r && i && yn(e.id, n);
};
var yn = async (e, t) => {
  let n = pn(t.pathname.split(`/`)[3]),
    r = t.href.replace(g, ``);
  if (!E.user && E.isForceInstalled) {
    (A(m.DirectToGuidanceSignInPrompt, { guidanceUrl: t.pathname }),
      chrome.tabs.update(e, { url: r + oe }));
    return;
  }
  try {
    let t = await fetch(`${K.webUrl}api/convert-workflow?workflowId=${n}`);
    if (t.ok) {
      let { exportWorkflow: n } = await t.json(),
        i = n,
        a = E.bgWorkspacesCache.workspaces?.find((e) => e.id === i.workspaceId),
        o = cn(i);
      return !a || a.tier !== f.Enterprise || !o.isGuidanceCompatible
        ? hn(r, !1)
        : (await ue())
          ? _n(i, r, e)
          : gn(i, e, r);
    }
  } catch (e) {
    console.error(`Error exporting workflow: `, e);
  }
  chrome.tabs.update(e, { url: r });
};
const bn = async (e) => {
    if (!E.user) {
      if (E.isForceInstalled) {
        (k(m.Actions, {
          signInRedirect: e,
          isForceInstalled: E.isForceInstalled,
          eventSource: `DTG - Inline Link`,
        }),
          F());
        return;
      }
      return hn(e, !0);
    }
    let t = pn(e.split(`/`)[5]);
    (k(m.Loading), F(void 0, `DTG - link click`));
    let n = await (
      await fetch(`${K.webUrl}api/convert-workflow?workflowId=${t}`)
    ).json();
    if (n.error) {
      let e = n.error,
        t = M.Unknown;
      (e.includes(`Workflow not found`) && (t = M.NotFound),
        e.includes(`You are not permitted`) && (t = M.Private),
        A(m.ViewingError, { reason: t }),
        V(e));
      return;
    }
    let r = n.exportWorkflow,
      i = r?.workspaceId,
      { workspace: a, hasHitLimit: o } = O({ workspaceId: i });
    if (
      E.bgWorkspacesCache.workspaces?.find((e) => e.id === i)?.tier !==
      f.Enterprise
    )
      return hn(e, !0);
    if (o) return (P({ workspace: a, workflowId: t }), !1);
    _n(r, e);
  },
  xn = async () => {
    await D({
      isForceInstalled:
        (await chrome.management.getSelf()).installType === `admin`,
    });
  },
  Sn = async ({ sessionId: e, workflowId: t, userId: n }) => {
    try {
      return N(E.user).getExtensionReplayMetadata({
        sessionId: e,
        workflowId: t,
        userId: n,
      });
    } catch (e) {
      return (
        V(`extensionReplay: failed to get extension replay metadata: ${e}`),
        []
      );
    }
  },
  Cn = async ({ contextId: e }) =>
    N(E.user).getExtensionReplayPresignedURL({ contextId: e }),
  wn = async (e) => {
    try {
      let { presignedURL: t, path: n } = await Le(`pdf`);
      await Be(t, e.document.data);
      let r = {
          workflowId: e.metadata.workflowId ?? E.workflowId,
          sessionId: e.sessionId,
          metadata: { workspaceId: E.user?.currentWorkspaceId, ...e.metadata },
          documentPath: n,
        },
        i = await fetch(`${K.webUrl}api/generate-document-name`, {
          method: `POST`,
          headers: {
            "Content-Type": `application/json`,
            "x-tango-platform": `extension@${x}`,
          },
          body: JSON.stringify(r),
        });
      if (!i.ok) {
        let e = await i.text();
        return {
          error: `Failed to generate document name`,
          details: `HTTP ${i.status}: ${i.statusText}. Response: ${e}`,
        };
      }
      return await i.json();
    } catch (e) {
      return {
        error: `Failed to generate document name`,
        details: e instanceof Error ? e.message : `Unknown error`,
      };
    }
  },
  Tn = async () => {
    let e = E.automatixConfig.config,
      t = E.automatixConfig.cacheTimestamp;
    if (e && t && Date.now() - t < 36e5) return e;
    let n = E.automatixConfig.error,
      r = E.automatixConfig.errorTimestamp;
    if (n && r && Date.now() - r < 3e5) return n;
    try {
      let e = await fetch(`${K.webUrl}api/automatix/config`, {
        method: `GET`,
        headers: {
          "Content-Type": `application/json`,
          "x-tango-platform": `extension@${x}`,
        },
      });
      if (!e.ok) {
        let t = {
          error: `Failed to fetch Automatix config`,
          details: `HTTP ${e.status}`,
        };
        return (
          await D({
            automatixConfig: {
              config: null,
              cacheTimestamp: null,
              error: t,
              errorTimestamp: Date.now(),
            },
          }),
          t
        );
      }
      let t = await e.json();
      return (
        await D({
          automatixConfig: {
            config: t,
            cacheTimestamp: Date.now(),
            error: null,
            errorTimestamp: null,
          },
        }),
        t
      );
    } catch (e) {
      let t = {
        error: `Failed to fetch Automatix config`,
        details: e instanceof Error ? e.message : `Unknown error`,
      };
      return (
        await D({
          automatixConfig: {
            config: null,
            cacheTimestamp: null,
            error: t,
            errorTimestamp: Date.now(),
          },
        }),
        t
      );
    }
  };
async function En(e) {
  return (await (await vt()).get(`klEvents`, e))?.timestamp;
}
async function Dn(e, t) {
  await (await vt()).put(`klEvents`, { id: e, timestamp: t });
}
const On = async (e) => {
    let t = {
      ...e,
      metadata: {
        ...e.metadata,
        workflowId: e.metadata.workflowId ?? E.workflowId,
        workspaceId: E.user?.currentWorkspaceId,
      },
    };
    try {
      return await (
        await fetch(`${K.webUrl}api/variables/label-instructions`, {
          method: `POST`,
          headers: {
            "Content-Type": `application/json`,
            "x-tango-platform": `extension@${x}`,
          },
          body: JSON.stringify(t),
        })
      ).json();
    } catch (e) {
      return {
        error: `Failed to label instructions`,
        details: e instanceof Error ? e.message : `Unknown error`,
      };
    }
  },
  kn = async (e) => {
    let t = (await chrome.tabs.query({ url: e }))[0];
    return t && t.id
      ? (he(t.id), t.id)
      : new Promise(async (t) => {
          let n = await chrome.tabs.create({ url: e, active: !0 });
          chrome.tabs.onUpdated.addListener(function e(r, i) {
            r === n.id &&
              i.status === `complete` &&
              (chrome.tabs.onUpdated.removeListener(e), t(r));
          });
        });
  };
var An = { origins: [`<all_urls>`] };
function jn() {
  return Mn(An);
}
function Mn(e) {
  return chrome.permissions.contains(e);
}
const Nn = async (e, t) => {
  let { workflow: n } = E.currentParams,
    r;
  try {
    r = await Pn(t);
  } catch (e) {
    V(`Failed to take screenshot while pinning: ${e.message}`);
  }
  return { ...e, workflow: n, rawScreenshotURL: r };
};
var Pn = (e) =>
  e.tab?.windowId
    ? chrome.tabs.captureVisibleTab(e.tab?.windowId, {
        format: `jpeg`,
        quality: 75,
      })
    : ``;
const Fn = async (e, t) => {
    if (!E.user?.currentWorkspaceId) return null;
    let n = N(E.user);
    try {
      let r = await n.getNuggetPresignedUrl({
        workspaceId: E.user.currentWorkspaceId,
        fileType: `jpg`,
        fileName: e,
      });
      return r.url ? (await et(await xt(t), r.presignedURL), r.url) : null;
    } catch (e) {
      return (V(e), null);
    }
  },
  In = async ({ sdpOffer: e }) => {
    try {
      let t = await fetch(`${K.webUrl}api/ai/voice-transcription`, {
        method: `POST`,
        headers: {
          "Content-Type": `application/json`,
          Authorization: `Bearer ${E.user?.token}`,
          "x-tango-platform": `extension@${x}`,
        },
        body: JSON.stringify({ sdpOffer: e }),
      });
      if (!t.ok) {
        let e = Error(`Failed to proxy realtime SDP: ${t.status}`);
        throw ((e.status = t.status), e);
      }
      return { sdpAnswer: (await t.json()).sdpAnswer };
    } catch (e) {
      throw (
        V(e, { tags: { feature: `voice_transcription`, phase: `sdp_proxy` } }),
        e
      );
    }
  };
var Ln = (e) =>
    `${e.getUTCFullYear()}${String(e.getUTCMonth() + 1).padStart(2, `0`)}${String(e.getUTCDate()).padStart(2, `0`)}${String(e.getUTCHours()).padStart(2, `0`)}${String(e.getUTCMinutes()).padStart(2, `0`)}${String(e.getUTCSeconds()).padStart(2, `0`)}${String(e.getUTCMilliseconds()).padStart(3, `0`)}`,
  Rn = 3,
  zn = 100;
const Bn = async ({
  events: e,
  workflowId: t,
  contextId: n,
  workspaceId: r,
  isFirstBatch: i,
  timestamp: a,
  tabId: o,
}) => {
  for (let s = 1; s <= Rn; s++)
    try {
      if (!E.user) return null;
      let s = E.user.id,
        c = N(E.user),
        l = new Date(a),
        u = `${`${Ln(l)}_${crypto.randomUUID()}`}.gz`,
        [ee, d] = await Promise.all([
          (async () =>
            await c.getExtensionReplayUpdatePresignedURL({
              contextId: n,
              fileName: u,
              workspaceId: r,
            }))(),
          (async () => {
            let r = JSON.stringify({
                createdAt: a,
                tabId: o,
                userId: s,
                workflowId: t,
                contextId: n,
                events: e,
              }),
              i = it.gzip(r);
            return new Blob([i], { type: `application/gzip` });
          })(),
        ]),
        { presignedURL: f, path: p } = ee.getExtensionReplayUpdatePresignedURL;
      return (
        i &&
          (await c.storeExtensionReplayMetadata({
            workflowId: t,
            contextId: n,
            createdAt: l.toISOString(),
            userId: E.user.id,
          })),
        await Vn(d, f, u),
        p
      );
    } catch (e) {
      if (s === Rn)
        return (
          V(e, { extra: { sessionId: n, workflowId: t, workspaceId: r } }),
          null
        );
      let i = zn * 2 ** (s - 1);
      await new Promise((e) => setTimeout(e, i));
    }
};
var Vn = async (e, t, n) =>
  t
    ? fetch(t, {
        method: `PUT`,
        body: e,
        headers: {
          "Content-Type": `application/gzip`,
          "Content-Length": e.size.toString(),
        },
      })
    : Error(`Fetch URL is undefined`);
const Hn = ({ workspaceId: e, limit: t, offset: n, sort: r }) =>
    N(E.user).listTeamWorkflows({
      workspaceId: e,
      limit: t,
      offset: n,
      sort: r,
    }),
  Un = async (e, t) => {
    let n = await N(E.user).starWorkflow(e.workspaceId, e.id, t),
      r = E.starredWorkflows[e.workspaceId]?.workflows;
    if (t) {
      let t = Z(e);
      r ? r.unshift(t) : (r = [t]);
    } else r = r?.filter((t) => t.workflowId !== e.id);
    return (
      await D({
        starredWorkflows: Object.assign(E.starredWorkflows, {
          [e.workspaceId]: { cacheTimestamp: Date.now(), workflows: r },
        }),
      }),
      n
    );
  },
  Wn = async ({ workspaceId: e, limit: t = 20, offset: n = 0 }) => {
    let r = E.starredWorkflows[e],
      i = r?.cacheTimestamp,
      a = te,
      o = r?.workflows?.length !== void 0 && r.workflows.length >= t,
      s = i && i < Date.now() - a;
    if (r && !s && o) return r.workflows;
    let c = (
      await N(E.user).listStarredWorkflows({
        workspaceId: e,
        limit: t,
        offset: n,
      })
    ).listStarredWorkflows.results.map(Z);
    return (
      await D({
        starredWorkflows: Object.assign(E.starredWorkflows, {
          [e]: { cacheTimestamp: Date.now(), workflows: c },
        }),
      }),
      c
    );
  },
  Gn = async ({ order: e, userId: t, workflowId: n }) => {
    let r = N(E.user),
      i = E.user?.currentWorkspaceId;
    if (!i || !E.starredWorkflows[i]) return;
    let a = E.starredWorkflows[i].workflows,
      o = [...a],
      s = a.findIndex((e) => e.workflowId === n),
      c = o[s];
    return (
      o.splice(s, 1),
      o.splice(e, 0, c),
      await D({
        starredWorkflows: Object.assign(E.starredWorkflows, {
          [i]: { cacheTimestamp: Date.now(), workflows: o },
        }),
      }),
      r.updateStarredWorkflowOrder({ order: e, userId: t, workflowId: n })
    );
  },
  Kn = async ({ workflow: e, isStarred: t }) => {
    let n = E.user?.currentWorkspaceId;
    if (!n || !E.starredWorkflows[n]) return;
    let r = E.starredWorkflows[n].workflows,
      a = [];
    if (t) {
      if (r.some((t) => t.workflowId === e.id)) return;
      ((a = [Z(e), ...r]),
        D({
          starredWorkflows: {
            ...E.starredWorkflows,
            [n]: { cacheTimestamp: Date.now(), workflows: a },
          },
        }));
    } else
      ((a = r.filter((t) => t.workflowId !== e.id)),
        D({
          starredWorkflows: {
            ...E.starredWorkflows,
            [n]: { cacheTimestamp: Date.now(), workflows: a },
          },
        }));
    U({ name: i.StarWorkflow, starredWorkflows: a });
  },
  qn = async ({ workflowId: e, order: t }) => {
    let n = E.user?.currentWorkspaceId;
    if (!n || !E.starredWorkflows[n]) return;
    let r = [...E.starredWorkflows[n].workflows],
      a = r.findIndex((t) => t.workflowId === e),
      o = r[a];
    (r.splice(a, 1),
      r.splice(t, 0, o),
      D({
        starredWorkflows: {
          ...E.starredWorkflows,
          [n]: { cacheTimestamp: Date.now(), workflows: r },
        },
      }),
      U({ name: i.UpdateStarredWorkflowOrder, starredWorkflows: r }));
  };
async function Jn() {
  (Ae(), await Promise.all([Me(), le()]), Tt(() => E.openTabId));
  try {
    S.lastFocusedWindow.id = (await chrome.windows.getLastFocused())?.id ?? 0;
  } catch (e) {
    if (
      ((S.lastFocusedWindow.id = 0),
      e.message.includes(`No last-focused window`))
    )
      return;
    V(Error(`Error finding last focused window: ${e.message}`));
  }
  (Se(), await st(), Qt(), ge(), _e());
}
console.assert(
  typeof window > `u`,
  `Do NOT load the background script in any environment with window set. This will lead to weird behavior!`,
);
var Q = Jn();
(chrome.runtime.onInstalled.addListener(async function (e) {
  if (
    (await Q,
    await xn(),
    Pe(),
    e && e.reason === chrome.runtime.OnInstalledReason.UPDATE)
  )
    return (await Xe(), await De(), j());
  if (e && e.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    if (
      (E.isForceInstalled && (await C()),
      R(X.ExtensionInstalled, { was_force_installed: E.isForceInstalled }),
      await j(),
      E.isForceInstalled)
    )
      return;
    let e = await chrome.tabs.query({ url: `${K.webUrl}${v}/*` }),
      n = await chrome.tabs.query({ url: `${K.webUrl}${ne}` });
    switch (!0) {
      case e.length > 0: {
        let t = e[0];
        (t?.windowId &&
          (await chrome.windows.update(t.windowId, { focused: !0 })),
          t?.id && chrome.tabs.update(t.id, { active: !0 }),
          jn().then((e) => {
            e === !1
              ? V(
                  Error(
                    `User does not have host permissions set after install`,
                  ),
                )
              : W(i.ExtensionInstalled);
          }));
        break;
      }
      case n.length > 0: {
        let e = n[0];
        (e?.windowId &&
          (await chrome.windows.update(e.windowId, { focused: !0 })),
          e?.id &&
            chrome.tabs.update(e.id, { active: !0, url: `${K.webUrl}${t}` }),
          jn().then((e) => {
            e === !1
              ? V(
                  Error(
                    `User does not have host permissions set after install`,
                  ),
                )
              : W(i.ExtensionInstalled);
          }));
        break;
      }
      default:
        (chrome.tabs.create({
          url: `${K.webUrl}${h}?ref=ext-install-${l ? `edge` : `chrome`}`,
          active: !0,
        }),
          jn().then((e) => {
            e === !1
              ? V(
                  Error(
                    `User does not have host permissions set after install`,
                  ),
                )
              : W(i.ExtensionInstalled);
          }));
    }
  }
  return (chrome.runtime.setUninstallURL(`${_}?extension-version=${x}`), !1);
}),
  chrome.runtime.onStartup.addListener(async function () {
    (await Q, await j());
  }),
  chrome.runtime.onMessage.addListener(function (e, t, r) {
    if (!(!e.message || !e.message.name)) {
      if (typeof e.target != `string`) {
        console.warn(`Message without target`, e);
        return;
      }
      if (e.target === `background`)
        switch (e.message.name) {
          case i.RequestViewWorkflowState:
            r({ snapshot: Y()?.getSnapshot() ?? null });
            return;
          case i.RequestSidekickDataExtractionState: {
            let e = Ve();
            r({
              snapshot: e
                ? {
                    ...e.getPersistedSnapshot(),
                    tags: Array.from(e.getSnapshot().tags),
                  }
                : null,
            });
            return;
          }
          case i.SignIn:
            (k(m.PendingSignIn, {
              isForceInstalled: E.isForceInstalled,
              eventSource: e.message.eventSource,
            }),
              Kt(e.message.redirectTo),
              R(X.SignIn, { event_source: e.message.eventSource }),
              r(void 0));
            return;
          case i.CurrentRoute:
            r({ ...we(t), frameId: t.frameId ?? 0 });
            return;
          case i.NavigateTo:
            (k(e.message.route, e.message.params), r(void 0));
            return;
          case i.CheckUser:
            (e.message.identify && C(),
              r({ user: E.user, workspaces: E.bgWorkspacesCache.workspaces }));
            return;
          case i.VerifyUserToken:
            (Ce(), r(void 0));
            return;
          case i.GetUserPreferences:
            return (
              ot().then((e) => {
                r({ preferences: e });
              }),
              !0
            );
          case i.ToggleUserPreference:
            let { preference: a, value: o } = e.message;
            return (
              w()
                .then((e) => {
                  (Nt(a, o, e),
                    R(X.UserPreferenceToggled, { event_source: a, value: o }),
                    r(void 0));
                })
                .catch((e) => {
                  (V(e), r(void 0));
                }),
              !0
            );
          case i.OpenSidePanel:
            (F(t.tab?.windowId, e.message.eventSource),
              e.message.skipNavigation ||
                A(m.Actions, {
                  isForceInstalled: E.isForceInstalled,
                  signInRedirect: e.message.signInRedirect,
                  view: e.message.view,
                  eventSource: e.message.eventSource,
                }));
            return;
          case i.HandleDirectToGuidanceLinkClick: {
            let t = e.message.url;
            bn(t);
            return;
          }
          case i.StartCustomAgent: {
            let t = crypto.randomUUID(),
              { id: n, instructions: i, model: a } = e.message;
            (Ot({ input: { sessionId: t } })
              .then(() => {
                if (!E.openTabId) throw Error(`No open tab id`);
                return chrome.tabs.get(E.openTabId);
              })
              .then((e) => {
                Y()?.send({
                  type: `startCustomAgent`,
                  instructions: i,
                  model: a,
                  tabId: e.id,
                  windowId: e.windowId,
                });
              })
              .then(() => {
                k(m.RunAgentAction, { id: n, instructions: i });
              }),
              r(void 0));
            return;
          }
          case i.SelectWorkflowType:
            (k(m.SelectWorkflowType), r(void 0));
            return;
          case i.StartCapture: {
            let n = e.message;
            ((E.currentRoute = m.Loading),
              F(t.tab?.windowId, `Start Capture - ${n.eventSource}`),
              Q.then(() => {
                St(n);
              }),
              r(void 0));
            return;
          }
          case i.PauseCapture:
            (ht(`Extension Action`), r(void 0));
            return;
          case i.ContinueCapture:
            (J(`Extension Action`), r(void 0));
            return;
          case i.ToggleBlurOn:
            (k(m.Blurring),
              R(X.WorkflowLiveBlurred, { event_context: `on` }),
              r(void 0));
            return;
          case i.ToggleBlurOff:
            (R(X.WorkflowLiveBlurred, { event_context: `off` }),
              J(`Resume from blur`),
              r(void 0));
            return;
          case i.ToggleDataExtraction:
            (e.message.isActive
              ? k(m.DataExtraction, {
                  isDocumentUpload: e.message.isDocumentUpload,
                  documentFile: e.message.documentFile,
                  documentName: e.message.documentName,
                })
              : J(`Resume from data extraction`),
              r({ isActive: e.message.isActive }));
            return;
          case i.ToggleAddAgentActionOn:
            (k(m.AddAgentAction), r(void 0));
            return;
          case i.ToggleAddAgentActionOff:
            (J(`Resume from add Agent Action`), r(void 0));
            return;
          case i.ClearAllBlur:
            (At(), r(void 0));
            return;
          case i.ClearBlurredFields:
            (ct(e.message.fields), r(void 0));
            return;
          case i.ClosePanel:
            (I(), r(void 0));
            return;
          case i.RunAutoBlur:
            let s = E.bgWorkspacesCache?.workspaces.find(
              (e) => e.id === E.user?.currentWorkspaceId,
            )?.settings.secureBlurSettingsV2;
            (Je(e.message.fields, s), r(void 0));
            return;
          case i.StopAutoBlur:
            (rt(), r(void 0));
            return;
          case i.CollectArtemisLogs: {
            let t = chrome.runtime
                .getManifest()
                .description?.replace(`TEST BUILD — `, ``),
              n = e.message.extraLogData;
            (Object.assign(n, { buildDescription: t }),
              console.log(`[ARTEMIS] ${e.message.log}`, n));
            let { workflow: i } = E.currentParams;
            (R(X.ArtemisLog, {
              workflow_id: i?.id,
              log: e.message.log,
              log_context: n,
              content_block_id: n.stepId,
              event_context: n.eventContext,
            }),
              r(void 0));
            return;
          }
          case i.FinishCapture:
            let c = e.message;
            (Q.then(() => {
              Mt(c);
            }),
              r(void 0));
            return;
          case i.SaveStep:
            let l = e.message;
            (Q.then(() => {
              Ke(l.data, {
                shouldReplace: l.shouldReplace,
                workflowId: l.workflowId,
              });
            }),
              r(void 0));
            return;
          case i.TakeStepScreenshot: {
            let n = t.tab?.windowId;
            if (!n) return V(`No windowId on tab while saving step`);
            let i = e.message;
            return (
              Q.then(() => Ue(i.eventId, n))
                .then(() => {
                  r(void 0);
                })
                .catch((e) => {
                  (V(e), r(void 0));
                }),
              !0
            );
          }
          case i.SaveDataExtractionStep: {
            let t = e.message.step,
              n = e.message.workflowFields,
              i = e.message.snapshot,
              a = n
                .map((e) => ({
                  id: e.id,
                  label: e.displayName?.trim(),
                  value: e.value?.trim(),
                  description: e.description,
                  originEvent: p.LlmExtract,
                  required: e.required,
                }))
                .filter((e) => e.value !== void 0);
            return (
              gt(a).then((e) => {
                let n = a
                  .map((t, n) => {
                    let r = e[t.id]?.uniqueLabel;
                    return r == null
                      ? null
                      : {
                          id: t.id,
                          dataType: se.String,
                          name: r,
                          originalName: t.label,
                          originalValue: t.value,
                          originEvent: p.LlmExtract,
                          description: t.description,
                          required: t.required,
                          index: n,
                        };
                  })
                  .filter((e) => e != null);
                (Ze({ ...t, workflowId: E.workflowId, originatedFields: n }, i),
                  r(void 0));
              }),
              !0
            );
          }
          case i.SaveSidekickSessionFields:
            (gt(e.message.fields), r(void 0));
            return;
          case i.GetSessionWorkflowFields:
            r({
              sessionWorkflowFields: Object.values(E.sessionWorkflowFields),
            });
            return;
          case i.SetReferenceField:
            let { variable: ee } = e.message;
            (Ct(ee), r(void 0));
            return;
          case i.RemoveReferenceField:
            (_t(), r(void 0));
            return;
          case i.DeleteStep:
            (R(X.WorkflowStepDeleted, { content_block_id: e.message.id }),
              ft(e.message.id),
              r(void 0));
            return;
          case i.DeleteHeading:
            (R(X.WorkflowHeadingDeleted, { content_block_id: e.message.id }),
              ft(e.message.id),
              r(void 0));
            return;
          case i.DeleteWorkflow:
            (kt(), r(void 0));
            return;
          case i.RestartWorkflow:
            (jt(), r(void 0));
            return;
          case i.GetTabInfo:
            r({ url: t.tab?.pendingUrl ?? t.tab?.url, id: t.tab?.id });
            return;
          case i.OpenContentBlockUrl:
            return (
              L(e.message.url, {
                tabBehavior: e.message.tabBehavior,
                tabId: e.message.tabId,
              }),
              r(void 0),
              !0
            );
          case i.GetTabs:
            return (
              chrome.tabs.query({ currentWindow: !0 }, (e) => {
                r({ tabs: e.filter(B) });
              }),
              !0
            );
          case i.FeatureFlags:
            if (e.message.refreshed) return;
            r({ featureFlags: de() });
            return;
          case i.ProxyRealtimeSDP:
            return (
              In({ sdpOffer: e.message.sdpOffer })
                .then((e) => {
                  r(e);
                })
                .catch(() => {
                  r(null);
                }),
              !0
            );
          case i.GetContentBlocks:
            return (
              Q.then(() => mt()).then((e) => {
                r({ contentBlocks: e });
              }),
              !0
            );
          case i.SwitchWorkspace:
            let f = e.message.workspaceId;
            return (
              be(f)
                .then(async (e) => {
                  (await Ee(f, e), r(void 0));
                })
                .catch((e) => {
                  (V(e),
                    U({ name: i.CheckUser, user: E.user, isRevert: !0 }),
                    r(void 0));
                }),
              !0
            );
          case i.Track:
            (R(e.message.eventName, e.message.eventProperties), r(void 0));
            return;
          case i.GuidanceAnalytics:
            (nt(e.message.event), r(void 0));
            return;
          case i.UnloadContentScript:
            (ze(), r(void 0));
            return;
          case i.ReloadOptions:
            (Me().then(() => {
              G({ name: i.FeatureFlags, featureFlags: de() });
            }),
              r(void 0));
            return;
          case i.GetScreenshot:
            let h = e.message.stepId;
            return (
              at(h).then((e) => {
                r({ url: e });
              }),
              !0
            );
          case i.EdgeConfig:
            return (xe(e.message.force).then((e) => r(e)), !0);
          case i.ClickElement:
            return (
              It(
                e.message.elementId,
                e.message.eventProperties,
                t,
                e.message.options,
              )
                .then(r)
                .catch((e) => {
                  (V(e), r(!1));
                }),
              !0
            );
          case i.OpenNewTab:
            let g = e.message.path,
              _ = K.webUrl;
            _ = _.substring(0, _.length - 1);
            let v = `${_}${g}`;
            return (
              chrome.tabs
                .create({ url: v })
                .then(() => r(void 0))
                .catch((e) => {
                  (V(e), r(void 0));
                }),
              !0
            );
          case i.GetSuggestedWorkflows:
            let { bustCache: y } = e.message;
            return (
              w().then((e) => {
                let t = e?.url;
                if (!t) return r(null);
                let n = Qe(t);
                if (
                  (t.includes(`viewer-guest-splash`) &&
                    (n = `viewer-guest-splash`),
                  !n)
                )
                  return r(null);
                lt(n, e, { bustCache: y })
                  .then((e) => {
                    r({
                      workflows: e?.workflows ?? [],
                      workspaces: E.bgWorkspacesCache.workspaces,
                      searchUrl: e?.searchUrl ?? n,
                      totalCount: e?.totalCount ?? 0,
                    });
                  })
                  .catch((e) => {
                    (V(e), r(null));
                  });
              }),
              !0
            );
          case i.ViewWorkflow: {
            let n = e.message.workspaceId,
              i = e.message.id,
              a = e.message.preview,
              o = e.message.redirectBack,
              s = e.message.searchQuery,
              c = e.message.eventSource,
              l = e.message.guidanceSessionId,
              u = e.message.tabBehavior,
              ee = e.message.artemis,
              d = e.message.exportWorkflow,
              f = e.message.restarting;
            if (Te.includes(E.currentRoute)) {
              let { workspace: e, hasHitLimit: p } = O({ workspaceId: n });
              if (p) return (P({ workspace: e, workflowId: i }), !1);
              F(t.tab?.windowId, `View Workflow - ${c}`);
              let h = {
                preview: a,
                redirectBack: o,
                searchQuery: s,
                tabBehavior: u,
                guidanceSessionId: l,
                artemis: ee,
                restarting: f,
              };
              return (
                (async () => (await Q, d || k(m.Loading), dt(i, h, c)))()
                  .then(() => {
                    (me().then((e) => {
                      e?.url &&
                        Y()?.send({ type: `setInitialUrl`, url: e.url });
                    }),
                      r({}));
                  })
                  .catch((e) => {
                    let t = M.Unknown;
                    (e instanceof Ge
                      ? e.apiError.includes(`Workflow not found`)
                        ? (t = M.NotFound)
                        : e.apiError.includes(`You are not permitted`) &&
                          (t = M.Private)
                      : e instanceof Error &&
                        e.message.includes(`Workflow not found`) &&
                        (t = M.NotFound),
                      A(m.ViewingError, { reason: t }),
                      t === M.Unknown && V(e),
                      r({ errorMessage: e.message }));
                  }),
                !0
              );
            }
            let p = `Cannot view workflow because current route is ${E.currentRoute}`;
            return (r({ errorMessage: p }), V(p), !1);
          }
          case i.RefreshWorkspaces:
            return (
              Oe()
                .then((e) => {
                  r({ workspaces: e });
                })
                .catch((e) => {
                  (V(e), r({ workspaces: [] }));
                }),
              !0
            );
          case i.AddComment:
            return (
              an(e.message.comment)
                .then(() => r(void 0))
                .catch((e) => {
                  (V(e), r(void 0));
                }),
              !0
            );
          case i.ListComments:
            return (
              on(e.message.workflowId)
                .then((e) => r(e))
                .catch((e) => {
                  (V(e), r({ total: 0, results: [] }));
                }),
              !0
            );
          case i.DeleteComment:
            return (
              sn(e.message.commentId, e.message.workflowId, e.message.stepId)
                .then((e) => r(e))
                .catch((e) => {
                  (V(e), r(!1));
                }),
              !0
            );
          case i.SearchWorkflows: {
            let t = N(E.user),
              n = e.message.query;
            (R(X.WorkflowsSearched, { query: n }),
              t
                .searchWorkflows(n)
                .then((e) => {
                  r({ workflows: e });
                })
                .catch((e) => {
                  (V(e), r({ workflows: { searchContent: { results: [] } } }));
                }));
            let i = E.recentSearches;
            return (
              i.push(n),
              i.length > 5 && i.shift(),
              D({ recentSearches: i }),
              !0
            );
          }
          case i.GetRecentSearches:
            r({ recentSearches: E.recentSearches });
            return;
          case i.GetRecentTangos:
            return (
              Hn({
                workspaceId: e.message.workspaceId,
                limit: 5,
                offset: 0,
                sort: d.CreatedAtDesc,
              })
                .then((e) => {
                  let {
                    listTeamWorkflows: { results: t },
                  } = e;
                  r({ recentTangos: t.map(Z) });
                })
                .catch((e) => {
                  (V(e), r({ recentTangos: [] }));
                }),
              !0
            );
          case i.GetStarredWorkflows:
            return (
              Wn({ workspaceId: e.message.workspaceId, limit: e.message.limit })
                .then((e) => {
                  r({ starredWorkflows: e });
                })
                .catch((e) => {
                  (V(e), r({ starredWorkflows: [] }));
                }),
              !0
            );
          case i.UpdateStarredWorkflowOrder:
            return (
              Gn({
                order: e.message.order,
                userId: e.message.userId,
                workflowId: e.message.workflowId,
              })
                .then(() => {
                  r(void 0);
                })
                .catch((e) => {
                  (V(e), r(void 0));
                }),
              W(
                JSON.stringify({
                  name: i.UpdateStarredWorkflowOrder,
                  workflowId: e.message.workflowId,
                  order: e.message.order,
                }),
              ),
              !0
            );
          case i.UploadNuggetSnapshot:
            return (
              tt(e.message.payload)
                .then(r)
                .catch((e) => {
                  (V(e), r(``));
                }),
              !0
            );
          case i.KLAnalytics:
            (Lt(e.message.event), r(void 0));
            return;
          case i.ShouldTakeNuggetDisplaySnapshot:
            if (!e.message.nuggetId) throw Error(`nuggetId is required`);
            if (!E.user?.currentWorkspaceId) {
              r(!1);
              return;
            }
            if (
              !E.edgeConfig?.nuggetDisplaySnapshotsEnabledTeams?.includes(
                E.user.currentWorkspaceId,
              )
            ) {
              r(!1);
              return;
            }
            return (
              En(e.message.nuggetId).then((e) => {
                r(!e || Date.now() - e > 6e5);
              }),
              !0
            );
          case i.SetLastKLEvent:
            Dn(e.message.nuggetId, e.message.timestamp);
            return;
          case i.InjectTestOnlyOpenSidePanelButton:
            return;
          case i.InjectOverlay:
            if (!t.tab?.id) {
              r(void 0);
              return;
            }
            return (
              chrome.scripting
                .executeScript({
                  files: [`./content/overlay.js`],
                  target: {
                    tabId: t.tab.id,
                    frameIds: t.frameId ? [t.frameId] : void 0,
                  },
                })
                .then(() => r(void 0)),
              !0
            );
          case i.InjectPopupBlockCircumvention:
            (zt(t), r(void 0));
            return;
          case i.CheckAnnouncements:
            r({ hasUnseen: $t() });
            return;
          case i.OpenAnnouncements:
            (en(), r(void 0));
            return;
          case i.GetSnapshotDataForCapture:
            return (
              bt({
                snapshotType: u.Capture,
                workflowId: e.message.workflowId,
                stepId: e.message.stepId,
                method: n.Get,
              })
                .then(r)
                .catch((e) => {
                  (V(e), r(null));
                }),
              !0
            );
          case i.GetSnapshotDataForNugget:
            return (
              We({
                snapshotType: e.message.snapshotType,
                nuggetId: e.message.nuggetId,
                workspaceId: e.message.workspaceId,
                fileName: e.message.fileName,
              })
                .then(r)
                .catch((e) => {
                  (V(e), r(null));
                }),
              !0
            );
          case i.GetNuggetData:
            let te = e.message.nuggetId,
              ne = `kl:${e.message.workspaceId}:${e.message.domain}`,
              re = `${K.webUrl}api/threads/${ne}/thread/${te}`;
            return (
              fetch(re)
                .then((e) => {
                  e &&
                    e.json().then((e) => {
                      r(e);
                    });
                })
                .catch((e) => {
                  (V(e), r({ nuggetData: null, thread: { metadata: {} } }));
                }),
              !0
            );
          case i.GetExtensionReplayMetadata: {
            let t = e.message.sessionId;
            return (
              t &&
                Sn({ sessionId: t })
                  .then((e) => r(e))
                  .catch((e) => {
                    (V(`Error in GetExtensionReplayMetadata handler:`, e),
                      r([]));
                  }),
              !0
            );
          }
          case i.GetExtensionReplayPresignedURL: {
            let t = e.message.contextId;
            return (
              Cn({ contextId: t })
                .then((e) => r(e))
                .catch((e) => {
                  (V(e), r([]));
                }),
              !0
            );
          }
          case i.GenerateSnapshot: {
            let e = t.tab?.id;
            if (!e) {
              (console.error(`[TANGO] Cannot generate snapshot without tab id`),
                r(null));
              return;
            }
            return (
              q(e, {
                name: i.GenerateSnapshot,
                useTangoDomSnapshot: T(b.TANGO_HTML_SNAPSHOT),
              })
                .then((e) => {
                  r(e);
                })
                .catch((e) => {
                  (V(e), r(null));
                }),
              !0
            );
          }
          case i.CaptureGuidanceSnapshot:
            return ($e(E.openTabId, t.tab?.windowId, e.message), r(void 0), !0);
          case i.GetWorkflowData:
            let ie = e.message.workflowId;
            return (
              fetch(`${K.webUrl}api/convert-workflow?workflowId=${ie}`)
                .then((e) => {
                  e &&
                    e.json().then((e) => {
                      r(e);
                    });
                })
                .catch((e) => {
                  (V(e), r(null));
                }),
              !0
            );
          case i.RequestWorkspaceInvitation: {
            let t = e.message.workspaceId,
              n = N(E.user);
            return (
              R(X.WorkspaceInvitationRequested, {
                workspace_id: t,
                event_source: E.currentRoute,
              }),
              n
                .requestWorkspaceInvitation(t)
                .then((e) => {
                  r(e.requestWorkspaceInvitation.status);
                })
                .catch((e) => {
                  (V(e), r(null));
                }),
              !0
            );
          }
          case i.KLAuth: {
            let { domain: t } = e.message;
            if (!t) {
              r({ error: `forbidden`, reason: `No domain provided` });
              return;
            }
            return (
              fe(t)
                .then((e) => {
                  r(e);
                })
                .catch((e) => {
                  r({ error: `forbidden`, reason: Error(e).message });
                }),
              !0
            );
          }
          case i.KLClearAuthCache:
            (ve().catch(V), r(void 0));
            return;
          case i.SendNotification: {
            let t = N(E.user),
              {
                kind: n,
                userId: i,
                subjectId: a,
                roomId: o,
                activityData: s,
              } = e.message;
            (t.sendNotification(n, i, o, a, s), r(void 0));
            return;
          }
          case i.GetProfiles: {
            let t = e.message.userIds,
              n = t.slice().sort().join(`,`),
              i = E.profilesCache[n];
            if (i && Date.now() - i.cacheTimestamp < 3e5) {
              r(i.profiles);
              return;
            }
            return (
              N(E.user)
                .getProfiles(t)
                .then((e) => {
                  let t = e ?? [];
                  (D({
                    profilesCache: {
                      ...E.profilesCache,
                      [n]: { cacheTimestamp: Date.now(), profiles: t },
                    },
                  }),
                    r(t));
                })
                .catch((e) => {
                  (V(e), r([]));
                }),
              !0
            );
          }
          case i.GetWorkspaceUsers: {
            let { query: t } = e.message;
            if (!E.user?.currentWorkspaceId) {
              r({ users: [] });
              return;
            }
            let n = N(E.user);
            if (E.featureFlags?.[`kl-pilot`])
              return (
                n
                  .listWorkspaceUsers({
                    workspaceId: E.user.currentWorkspaceId,
                    search: t,
                  })
                  .then((e) => {
                    r({ users: e });
                  })
                  .catch((e) => {
                    (V(e), r({ users: [] }));
                  }),
                !0
              );
            r({ users: [] });
            return;
          }
          case i.UpsertWorkflowPin: {
            let { pin: t } = e.message;
            (N(E.user).upsertWorkflowPin(t), r(void 0));
            return;
          }
          case i.DeleteWorkflowPin: {
            let { pinId: t, workflowId: n } = e.message;
            (N(E.user).deleteWorkflowPin({ pinId: t, workflowId: n }),
              r(void 0));
            return;
          }
          case i.GetHiddenThreads:
            r(E.hiddenThreads);
            return;
          case i.HideThread: {
            let { threadId: t } = e.message,
              n = E.hiddenThreads;
            (n.push(t),
              D({ hiddenThreads: n }),
              H({ name: i.SyncHiddenThreads, hiddenThreads: n }),
              Ne({ name: i.SyncHiddenThreads, hiddenThreads: n }),
              r(void 0));
            return;
          }
          case i.ShowThread: {
            let { threadId: t } = e.message,
              n = E.hiddenThreads,
              a = n.indexOf(t);
            (a > -1 && n.splice(a, 1),
              D({ hiddenThreads: n }),
              H({ name: i.SyncHiddenThreads, hiddenThreads: n }),
              Ne({ name: i.SyncHiddenThreads, hiddenThreads: n }),
              r(void 0));
            return;
          }
          case i.PinData:
            let ae = t.tab?.id,
              oe = t.frameId;
            (Nn(e.message.data, t).then((e) => {
              if (!ae) {
                r(void 0);
                return;
              }
              q(ae, { name: i.PinData, data: { ...e, originFrameId: oe } });
            }),
              r(void 0));
            return;
          case i.PinFromDiscovery: {
            let { data: t } = e.message;
            (A(m.NewPin, { workflow: t }), r(void 0));
            return;
          }
          case i.ToolbarPosition:
            (G({ name: i.ToolbarPosition, data: e.message.data }), r(void 0));
            return;
          case i.KLVisibility:
            (G({ name: i.KLVisibility, data: e.message.data }), r(void 0));
            return;
          case i.UploadPinScreenshot:
            return (
              Fn(e.message.threadId, e.message.rawScreenshotURL).then((e) =>
                r(e),
              ),
              !0
            );
          case i.Version:
            return (
              chrome.action.getUserSettings?.()?.then((e) => {
                r({
                  version: x,
                  isPinned: e.isOnToolbar,
                  isForceInstalled: E.isForceInstalled,
                });
              }),
              !0
            );
          case i.SetActiveTab:
            (r(void 0), chrome.tabs.update(e.message.tabId, { active: !0 }));
            return;
          case i.StartSessionRecording:
            if (!e.message.tabId) {
              r(void 0);
              return;
            }
            (q(e.message.tabId, {
              name: i.StartSessionRecording,
              sessionId: e.message.sessionId,
              workflowId: e.message.workflowId,
              tabId: e.message.tabId,
              workspaceId: e.message.workspaceId,
            }),
              r(void 0));
            return;
          case i.StopSessionRecording:
            if (!e.message.tabId) {
              r(void 0);
              return;
            }
            (q(e.message.tabId, { name: i.StopSessionRecording }), r(void 0));
            return;
          case i.SessionRecorderCustomEvent:
            if (!e.message.tabId) {
              r(void 0);
              return;
            }
            (q(e.message.tabId, { name: i.SessionRecorderCustomEvent }),
              r(void 0));
            return;
          case i.SessionRecorderPersistEvents:
            if (!e.message.workflowId) {
              r({ success: !1, error: `No workflowId provided` });
              return;
            }
            (Bn({
              events: e.message.events,
              contextId: e.message.contextId,
              workflowId: e.message.workflowId,
              workspaceId: e.message.workspaceId,
              isFirstBatch: e.message.isFirstBatch,
              timestamp: e.message.createdAt,
              tabId: e.message.tabId,
            }),
              r({ success: !0 }));
            return;
          case i.AssertPolicy: {
            let {
                policyId: t,
                userInput: n,
                contextId: i,
                policyWorkflowFields: a,
                url: o,
                timestamp: s,
              } = e.message,
              c = N(E.user),
              l = a
                .map((e) => {
                  let t = E.sessionWorkflowFields[e.id];
                  return t
                    ? {
                        value: t.value,
                        workflowFieldId: t.id,
                        workflowFieldName: t.label,
                      }
                    : null;
                })
                .filter((e) => e !== null);
            return (
              c
                .assertPolicy({
                  policyId: t,
                  userInput: n,
                  contextId: i,
                  sessionFields: l,
                  clientMetadata: { url: o, timestamp: s },
                })
                .then((e) => {
                  r(e.assertPolicy);
                }),
              !0
            );
          }
          case i.AITrace: {
            let { name: t, traceId: n, traceName: i, ...a } = e.message;
            (wt({ id: n, name: i, ...a }), r(void 0));
            return;
          }
          case i.AIScore: {
            let { name: t, scoreName: n, ...i } = e.message;
            (Dt({ name: n, ...i }), r(void 0));
            return;
          }
          case i.StarWorkflow: {
            let { workflow: t, isStarred: n } = e.message;
            return (
              Un(t, n).then((e) => {
                let t = e.starWorkflow.isStarred;
                r(t);
              }),
              W(
                JSON.stringify({
                  name: i.StarWorkflow,
                  workflowId: t.id,
                  isStarred: n,
                }),
              ),
              !0
            );
          }
          case i.GenerateSimplifiedDom:
            if (e.message.source === `capture` && !T(b.ARTEMIS_GOALS)) {
              r(``);
              return;
            }
            return (
              H({ name: i.GenerateSimplifiedDom }).then((e) => {
                r(e);
              }),
              !0
            );
          case i.GetAutomatixConfig:
            return (
              Tn().then((e) => {
                r(e);
              }),
              !0
            );
          case i.SendVariableToIframes:
            (H({ name: i.SendVariableToIframes, value: e.message.value }),
              r(void 0));
            return;
          case i.SendTypeEventToMain:
            (H({ name: i.SendTypeEventToMain }), r(void 0));
            return;
          case i.ElementIframeBounds: {
            let { bounds: t, showElementAsInput: n } = e.message;
            (H({
              name: i.ElementIframeBounds,
              bounds: t,
              showElementAsInput: n,
            }),
              r(void 0));
            return;
          }
          case i.ExtractData: {
            let t = e.message.body.metadata?.flow;
            return (
              t &&
                t !== `creator` &&
                V(
                  Error(
                    `ExtractData handler received non-creator flow: ${t}. Sidekick should call extractData/extractDataStream directly.`,
                  ),
                ),
              T(b.DATA_EXTRACTION_STREAMING)
                ? Ie(e.message.body, {
                    onData: (e) => {
                      U({ name: i.ExtractDataChunk, data: e });
                    },
                    onError: (e) => {
                      U({ name: i.ExtractDataError, error: e });
                    },
                    onFinish: () => {
                      U({ name: i.ExtractDataFinish });
                    },
                  })
                : He(e.message.body).then((e) => {
                    r(e);
                  }),
              !0
            );
          }
          case i.LabelInstructions:
            return (
              On(e.message.payload).then((e) => {
                r(e);
              }),
              !0
            );
          case i.GenerateDocumentName:
            return (
              wn(e.message.payload).then((e) => {
                r(e);
              }),
              !0
            );
          case i.TakeSuggestionScreenshot:
            if (!t.tab?.windowId) {
              r(``);
              return;
            }
            return (
              chrome.tabs
                .captureVisibleTab(t.tab.windowId, {
                  format: `jpeg`,
                  quality: 90,
                })
                .then((e) => {
                  r(e);
                }),
              !0
            );
          case i.ViewWorkflowEvent: {
            let { event: t } = e.message;
            (Y()?.send(t), r(void 0));
            return;
          }
          case i.StartSidekickDataExtraction: {
            let { input: t } = e.message;
            (Re(t), r(void 0));
            return;
          }
          case i.StopSidekickDataExtraction:
            (Fe(), r(void 0));
            return;
          case i.SidekickDataExtractionEvent: {
            let { event: t } = e.message;
            (Ve()?.send(t), r(void 0));
            return;
          }
          case i.TakeAgentFixScreenshot:
            if (!t.tab?.windowId) {
              r(``);
              return;
            }
            return (
              chrome.tabs
                .captureVisibleTab(t.tab?.windowId, {
                  format: `jpeg`,
                  quality: 75,
                })
                .then((e) => {
                  r(e);
                })
                .catch((e) => {
                  (console.error(e), r(``));
                }),
              !0
            );
          case i.UpdateContentBlock: {
            let { stepId: t, updates: n } = e.message,
              i = E.contentBlocks.find((e) => e.id === t);
            (i && (Object.assign(i, n), qe()), r(void 0));
            return;
          }
          case i.AddVoiceTranscript: {
            let { transcript: t, timestamp: n } = e.message;
            (E.voiceTranscripts.push({ transcript: t, timestamp: n }),
              D({ voiceTranscripts: E.voiceTranscripts }),
              r(void 0));
            return;
          }
          case i.GetBranchExcludedCounts:
            r({
              excludedCount: E.branchExcludedCount,
              excludedCountBottom: E.branchExcludedCountBottom,
            });
            return;
          case i.SetBranchExcludedCounts: {
            let { excludedCount: t, excludedCountBottom: n } = e.message;
            (D({ branchExcludedCount: t, branchExcludedCountBottom: n }),
              r(void 0));
            return;
          }
          default:
            z(`Unknown message sent:`, e.message);
            return;
        }
    }
  }),
  chrome.runtime.onMessageExternal.addListener((e, t, n) => {
    if (!t.origin || !K.webUrl.startsWith(t.origin)) {
      z(
        `Ignored incoming message from ${t.origin} because its not the currently selected web app`,
      );
      return;
    }
    if (e.preferences) {
      let { preferences: t } = e;
      (je(o.HighlighterColor, t.highlighterColor), n());
      return;
    }
    if (e.featureFlags) {
      let { featureFlags: t } = e;
      ([m.Hidden, m.Actions].includes(E.currentRoute) &&
        (z(`Receiving Feature Flags from web app`, t), ce(t)),
        n());
      return;
    }
    if (e.session !== void 0) {
      (ke(e.session), n());
      return;
    }
    switch (
      ([i.CurrentRoute, i.Version].includes(e.message) || C(), e.message)
    ) {
      case i.CurrentRoute:
        n({ route: E.currentRoute });
        return;
      case i.Version:
        return (
          chrome.action.getUserSettings?.()?.then((e) => {
            n({
              version: x,
              isPinned: e.isOnToolbar,
              isForceInstalled: E.isForceInstalled,
            });
          }),
          !0
        );
      case i.OpenExtension:
        (A(m.Actions), n());
        return;
      case `startRecording`:
      case i.StartCapture:
        let r = {
          workflowId: e.workflowId,
          stepIndex: e.stepIndex,
          stepUrl: e.stepUrl,
          transitionId: e.transitionId,
          convergingTransitionInfo: e.convergingTransitionInfo,
          tabId: e.tabId,
          eventSource: e.eventSource,
          workflowType: e.workflowType,
          guidance: e.guidance,
        };
        ((E.currentRoute = m.Loading),
          F(t.tab?.windowId, `Start Capture - ${e.eventSource}`),
          Q.then(() => St(r)),
          n());
        return;
      case i.CheckWorkspace:
        return (
          Q.then(() => {
            n({ workspaceId: E.user?.currentWorkspaceId });
          }),
          !0
        );
      case i.GetTabs:
        return (
          chrome.tabs.query({ currentWindow: !0 }, (e) => {
            n({ tabs: e.filter(B) });
          }),
          !0
        );
      case i.ViewWorkflow:
        k(m.Loading);
        let a = e.workflow.workspaceId,
          { workspace: o, hasHitLimit: s } = O({ workspaceId: a });
        if (s) {
          (P({ workspace: o, workflowId: e.workflow.id }), n());
          return;
        }
        (F(t.tab?.windowId, `View Workflow - ${e.eventSource}`),
          Q.then(() => Ye({ workflow: e.workflow })),
          n());
        return;
      case i.GetUserToken:
        return (
          Q.then(() => {
            n({ token: E.user?.token || `` });
          }),
          !0
        );
      case i.OpenSidePanel:
        (F(t.tab?.windowId),
          A(m.Actions, {
            isForceInstalled: E.isForceInstalled,
            signInRedirect: e.signInRedirect,
            eventSource: e.eventSource,
          }),
          n());
        return;
      case i.ToggleUserPreference: {
        let { preference: t, value: r } = e;
        return (
          w().then((e) => {
            if (!e) {
              n();
              return;
            }
            (Nt(t, r, e),
              R(X.UserPreferenceToggled, {
                event_source: t,
                value: r,
                event_context: `Web app`,
              }),
              n());
          }),
          !0
        );
      }
      case i.SignInStarted:
        (U({ name: i.SignInStarted }), n());
        return;
      case i.PinFromWeb: {
        let { url: t, message: r, type: i, ...a } = e;
        (kn(t).then((e) => {
          e &&
            setTimeout(() => {
              A(m.NewPin, { workflow: a });
            }, 300);
        }),
          n());
        return;
      }
      case i.OpenThread: {
        let { threadMetadata: r, threadId: a } = e;
        (kn(r.baseURI).then((e) => {
          e &&
            setTimeout(() => {
              q(e, { name: i.OpenThread, threadMetadata: r, threadId: a });
              let n = t.tab?.id;
              n && chrome.tabs.remove(n);
            }, 300);
        }),
          n());
        return;
      }
      case i.GetUser:
        n({ user: E.user });
        return;
      case i.StarWorkflow: {
        let { workflow: t, isStarred: r } = e;
        (Kn({ workflow: t, isStarred: r }), n());
        return;
      }
      case i.UpdateStarredWorkflowOrder: {
        let { workflowId: t, order: r } = e;
        (qn({ workflowId: t, order: r }), n());
        return;
      }
    }
  }));
var $ = (t) => {
  let n = Y()?.getSnapshot();
  if (E.currentRoute === m.Viewing && n && !Et(n)) {
    let i = E.currentParams,
      { paused: a } = n.context;
    if (!i.preview && a !== e.Manual) {
      let n = e.UntilSuitableTab;
      (Rt(t, i.workflow) &&
        (n =
          (a === e.UntilSuitableTab || a === e.AutomationOnly) &&
          i.workflow.type === r.Automation
            ? e.AutomationOnly
            : e.None),
        Y()?.send({ type: `setPaused`, paused: n }),
        E.openTabId !== t.id && Y()?.send({ type: `clearFindElementResult` }));
    }
    k(m.Viewing);
  }
  if (!(t.status !== `complete` || !t.url)) {
    if (
      ((E.currentRoute === m.Hidden || E.currentRoute === m.Viewing) &&
        (E.edgeConfig?.disableBackgroundDiscoverWorkflowsQuery || ut(t)),
      E.currentRoute === m.Capturing)
    ) {
      let e =
        B(t) && E.workflowId
          ? pt(t, { workflowId: E.workflowId })
          : Promise.resolve();
      Q.then(() => e).then(() => {
        (qe(), k(m.Capturing));
      });
    }
    if (
      (E.currentRoute === m.Countdown && k(m.Countdown),
      E.currentRoute === m.Blurring && k(m.Blurring),
      E.currentRoute === m.DirectToGuidance && k(m.DirectToGuidance),
      E.currentRoute === m.DataExtraction && k(m.DataExtraction),
      E.currentRoute === m.RunAgentAction &&
        Y()?.getSnapshot()?.context.agentActionWindowId === t.windowId &&
        k(m.RunAgentAction),
      E.currentRoute === m.EnterpriseOnboardingToast)
    )
      return (
        z(`Browser action: navigate to enterprise onboarding sign in`),
        F(t?.windowId),
        A(m.Actions, { isForceInstalled: E.isForceInstalled }, t)
      );
  }
};
(chrome.tabs.onActivated.addListener(async ({ tabId: e }) => {
  let t;
  try {
    t = await chrome.tabs.get(e);
  } catch {}
  if (!t)
    try {
      (await Ft(100), (t = await chrome.tabs.get(e)));
    } catch {
      t = await w();
    }
  t && ($(t), vn(t));
}),
  chrome.tabs.onRemoved.addListener(function (e, t) {
    (At(),
      rt(),
      E.currentRoute === m.Viewing &&
        Et(Y()?.getSnapshot() ?? null) &&
        e === E.openTabId &&
        I());
  }),
  chrome.tabs.onUpdated.addListener((e, t, n) => {
    (t.status === `complete` &&
      n.active &&
      n.windowId === S.lastFocusedWindow.id &&
      (q(n.id, { name: i.TabUpdated }), $(n)),
      t.url && vn(n),
      n.id === S.ssoSignInTabId &&
        n?.url?.includes(`/oauth/callback`) &&
        n?.url?.includes(`code`) &&
        n.status === `complete` &&
        chrome.tabs.query({ active: !0, currentWindow: !0 }, function (e) {
          var t = e[0];
          t &&
            n?.id &&
            chrome.tabs.update(n.id, { active: !0 }).then(() => {
              setTimeout(() => {
                t?.id && chrome.tabs.update(t.id, { active: !0 });
              }, 10);
            });
        }));
  }),
  chrome.windows.onFocusChanged.addListener(async (e) => {
    if (e < 0) return;
    S.lastFocusedWindow.id = e;
    let t = await w();
    t && $(t);
  }),
  chrome.runtime.onUpdateAvailable.addListener((e) => {
    E.currentRoute === m.Hidden && ze();
  }),
  Ht());
//# sourceMappingURL=DLEf9qkj.js.map
