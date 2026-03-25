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
import {
  E as e,
  H as t,
  I as n,
  U as r,
  W as i,
  b as a,
  bt as o,
  r as s,
} from "./Cj99izlc.js";
import { u as c } from "./B_7_FnlV.js";
import { C as l, o as u } from "./B1wSa5WC.js";
import { t as d } from "./B9-RHjnp.js";
import { n as f, t as p } from "./DjAyKxgg.js";
import { t as m } from "./MHuzYdZ-.js";
import "./B9oZIV4X.js";
import { a as h, i as ee, n as g, s as _, t as v } from "./BQgObYT-.js";
import { c as y, d as b, n as x, r as S } from "./CYzsY-HP.js";
import "./Cy_J9uWP.js";
function C() {
  if (!document.body) return 1;
  let e = 1;
  for (let t of [document.documentElement, document.body]) {
    let n = window.getComputedStyle(t).zoom;
    if (n && n !== `normal`) {
      let t = parseFloat(n);
      !isNaN(t) && t > 0 && (e *= t);
    }
  }
  return e;
}
function w() {
  if (typeof document > `u`) return [];
  let e = [];
  return (
    document
      .querySelectorAll(`embed[src],iframe[src],object[data]`)
      .forEach((t) => {
        let n = t.getAttribute(`src`) || t.getAttribute(`data`);
        if (n)
          try {
            let t = new URL(n, document.baseURI || window.location.href);
            (t.protocol === `http:` || t.protocol === `https:`) &&
              e.push(t.href);
          } catch (e) {
            console.warn(`Failed to resolve PDF URL:`, n, e);
          }
      }),
    e
  );
}
const te = async ({
  elementId: e,
  action: t,
  text: n,
  clearExisting: r,
  direction: i,
}) => {
  if (t === `go_back` && !p()) return (window.history.go(-1), {});
  if (t === `scroll`) return { scrolled: v(i ?? `down`) };
  let a = e ? ee(e) : null;
  return a
    ? t === `click`
      ? (await d(300), await S(a), { title: u(a).label })
      : t === `input_text`
        ? n == null
          ? (console.error(`No text to type`, e, t, n), null)
          : (await x(a, n, new AbortController().signal, {
              insertOption: r ? o.Replace : o.Append,
            }),
            { title: u(a).label })
        : (console.error(`UNSUPPORTED action:`, t), null)
    : (console.error(`Failed to find element`, e, document), null);
};
var T = !1,
  E,
  D,
  O,
  k,
  A = null,
  j = null,
  M = null,
  N = null,
  P = !1;
function F(e) {
  switch (e.route) {
    case i.Capturing:
      if ((D?.stop(), T)) break;
      ((T = !0),
        G(e.params).then((e) => {
          ((T = !1), e.start());
        }));
      break;
    case i.NewPin:
      J().then((e) => {
        e.start();
      });
      break;
    case i.Blurring:
      (E?.stop(),
        K().then((e) => {
          e.start();
        }));
      break;
    case i.Viewing:
      if (P) break;
      ((P = !0),
        c({ name: n.InjectPopupBlockCircumvention }),
        window.addEventListener(`tangoPopupBlocked`, (e) => {
          let t = e.detail[0];
          c({ name: n.OpenContentBlockUrl, url: t, tabBehavior: `always-new` });
        }));
      break;
    default:
      (E?.stop(),
        (E = void 0),
        O?.stop(),
        (O = void 0),
        D?.stop(),
        (D = void 0),
        k &&
          k.stop().then(() => {
            k = void 0;
          }));
  }
  if (e.route === i.Hidden && !e.params?.hasKnowledgeLayer) return B();
  L() || H(e);
}
function I(e) {
  let t = new CustomEvent(`tango-overlay`, { detail: e });
  document.dispatchEvent(t);
}
function L() {
  return document.querySelector(r);
}
function R(e) {
  if (e.parentElement !== document.body) return;
  let t = () => {
    let t = C();
    e.style.zoom = t === 1 ? `` : String(1 / t);
  };
  (t(),
    (j = new MutationObserver(t)),
    j.observe(document.body, {
      attributes: !0,
      attributeFilter: [`style`, `class`],
    }),
    j.observe(document.documentElement, {
      attributes: !0,
      attributeFilter: [`style`, `class`],
    }));
}
function z(e) {
  ((M = new MutationObserver(() => {
    e.hasAttribute(`inert`) && e.removeAttribute(`inert`);
  })),
    M.observe(e, { attributes: !0, attributeFilter: [`inert`] }));
}
function B() {
  (A?.abort(),
    (A = null),
    j?.disconnect(),
    (j = null),
    M?.disconnect(),
    (M = null),
    I(`remove`));
  let e = L();
  e && e.remove();
}
var V = null;
function H(e) {
  (V?.abort(), (V = new AbortController()), U(e, V.signal));
}
async function U(a, o) {
  if (o.aborted || !document.body) return;
  if (p()) {
    if (!e.includes(a.route)) return;
    if (f()) {
      ((A = new AbortController()),
        window.addEventListener(
          `resize`,
          () => {
            f() || L() || H(a);
          },
          { signal: A.signal },
        ));
      return;
    }
  }
  B();
  let s = document.createElement(r);
  ((s.id = t),
    s.attachShadow({ mode: `open` }),
    document.body.isContentEditable
      ? document.documentElement.appendChild(s)
      : document.body.appendChild(s),
    R(s),
    z(s),
    a.route === i.Viewing &&
      q().then((e) => {
        k ??= e;
      }),
    !o.aborted &&
      (await c({ name: n.InjectOverlay }), !o.aborted && I(`render`)));
}
var W = () => m(() => import(`./DpXKo6eI.js`), []),
  G = async (e) => {
    if (!E) {
      let { DomRecorder: t } = await m(async () => {
        let { DomRecorder: e } = await import(`./BfWwG185.js`);
        return { DomRecorder: e };
      }, []);
      E = new t(e);
    }
    return E;
  },
  K = async () => {
    if (!D) {
      let { BlurRecorder: e } = await m(async () => {
        let { BlurRecorder: e } = await import(`./DmwtT9l7.js`);
        return { BlurRecorder: e };
      }, []);
      D = new e();
    }
    return D;
  },
  q = async () => {
    let { SessionRecorder: e } = await m(async () => {
      let { SessionRecorder: e } = await import(`./CMqtrNpV.js`);
      return { SessionRecorder: e };
    }, []);
    return new e();
  },
  J = async () => {
    if (!O) {
      let { KLPinRecorder: e } = await m(async () => {
        let { KLPinRecorder: e } = await import(`./DsG1O_u1.js`);
        return { KLPinRecorder: e };
      }, []);
      O = new e();
    }
    return O;
  },
  Y = async () => {
    (window.addEventListener(
      `click`,
      (e) => {
        X(e) && (e.stopImmediatePropagation(), e.preventDefault());
      },
      !0,
    ),
      window.addEventListener(
        `pointerdown`,
        (e) => {
          let t = X(e);
          t && c({ name: n.HandleDirectToGuidanceLinkClick, url: t });
        },
        !0,
      ));
  },
  X = (e) => {
    let t = e.target instanceof Element && e.target.closest(`a`);
    if (t instanceof HTMLAnchorElement) {
      let e = t;
      if (e.href.includes(`tango.us`) && e.href.endsWith(`/play`))
        return e.href;
    }
    return !1;
  };
Y();
function Z(e, t, r) {
  switch (e.message.name) {
    case n.CurrentRoute:
      (F(e.message), r());
      return;
    case n.ClearAllBlur:
      (r(),
        W().then(({ destroyAllDomObservers: e, clearAllBlur: t }) => {
          (t(), e());
        }));
      return;
    case n.ClearBlurredFields: {
      let { fields: t } = e.message;
      (r(),
        W().then(({ clearBlurByType: e }) => {
          t.forEach((t) => {
            t.id && e(t.id);
          });
        }));
      return;
    }
    case n.RunAutoBlur: {
      let { fields: t, secureBlurSettings: n } = e.message;
      (W().then(({ runAutoBlur: e }) => {
        e(t, n);
      }),
        r());
      return;
    }
    case n.StopAutoBlur:
      (W().then(({ destroyAllDomObservers: e, clearAllAutoBlur: t }) => {
        (t(), e());
      }),
        r());
      return;
    case n.UnloadContentScript:
      ($(), r());
      return;
    case n.StepEventsProcessed:
      (E?.processEventIds(e.message.eventIds, { sendMessageToParent: !1 }),
        r());
      return;
    case n.CheckContentScriptActive:
      r();
      return;
    case n.StartSessionRecording: {
      let t = {
        sessionId: e.message.sessionId,
        workflowId: e.message.workflowId,
        tabId: e.message.tabId,
        workspaceId: e.message.workspaceId,
      };
      k
        ? k.start(t)
        : !p() &&
          !window.location.href.includes(`about:blank`) &&
          q()
            .then((e) => {
              k ??= e;
            })
            .then(() => {
              k?.start(t);
            });
      return;
    }
    case n.StopSessionRecording:
      (k?.stop(), (k = void 0));
      return;
    case n.GenerateSnapshot:
      return p()
        ? void 0
        : (b({ useTangoDomSnapshot: e.message.useTangoDomSnapshot }).then(
            (e) => {
              r(e);
            },
          ),
          !0);
    case n.GetEmbeddedPDFUrls:
      return p() ? void 0 : (r(w()), !0);
    case n.GenerateSimplifiedDom: {
      if (p()) return;
      let t = e.message.includeInvisibleElements,
        n = e.message.includeClasses;
      return (
        (e.message.scroll ? g() : Promise.resolve())
          .then(() =>
            _({
              includeInvisibleElements: t,
              includeClasses: n,
              eventNamespace: `tango-extension`,
            }),
          )
          .then((e) => {
            r(e);
          })
          .catch((e) => {
            (console.error(`Failed to generate simplified DOM`, e), r(``));
          }),
        !0
      );
    }
    case n.InteractWithSimplifiedDom: {
      let {
        elementId: t,
        action: n,
        text: i,
        clearExisting: a,
        direction: o,
      } = e.message;
      return (
        te({
          elementId: t,
          action: n,
          text: i ?? void 0,
          clearExisting: a,
          direction: o,
        }).then((e) => {
          e && r(e);
        }),
        !0
      );
    }
    default:
      break;
  }
}
function ne() {
  (chrome.runtime.onMessage.addListener(Z),
    B(),
    c({ name: n.InjectTestOnlyOpenSidePanelButton }),
    c({ name: n.CurrentRoute }).then(F),
    (N = new AbortController()),
    h({ signal: N.signal, eventNamespace: `tango-extension` }),
    p() && y(N.signal),
    window.addEventListener(`message`, l, { signal: N.signal }));
}
var Q = `remove_content_script_` + chrome.runtime.id;
function $() {
  (document.removeEventListener(Q, $),
    B(),
    E?.stop(),
    k?.stop(),
    chrome.runtime?.onMessage.removeListener(Z),
    N?.abort());
}
(document.dispatchEvent(new CustomEvent(Q)),
  document.addEventListener(Q, $),
  window.addEventListener(`beforeunload`, () => {
    k?.stop();
  }),
  ne());
//# sourceMappingURL=NgR8NcGw.js.map
