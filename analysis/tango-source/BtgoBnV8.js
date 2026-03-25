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
import { i as e, o as t, t as n } from "./DzoHlDNo.js";
import { n as r, t as i } from "./NwBF3_Sl.js";
import {
  At as a,
  B as o,
  Dt as s,
  Et as c,
  G as l,
  Ht as u,
  I as d,
  K as f,
  M as p,
  Mt as m,
  Nt as h,
  P as g,
  Pt as _,
  Rt as v,
  T as y,
  Vt as b,
  W as x,
  X as S,
  Z as C,
  _ as w,
  _t as T,
  g as E,
  gt as D,
  h as O,
  jt as k,
  kt as A,
  nt as ee,
  ot as te,
  p as ne,
  q as re,
  s as ie,
  t as ae,
  vt as oe,
  w as se,
  x as ce,
  yt as le,
  zt as ue,
} from "./Cj99izlc.js";
import {
  C as de,
  F as fe,
  G as pe,
  H as j,
  I as me,
  M as he,
  N as ge,
  O as _e,
  P as ve,
  U as M,
  V as N,
  Y as ye,
  _ as be,
  g as xe,
  h as Se,
  j as Ce,
  k as we,
  m as Te,
  o as Ee,
  p as De,
  s as Oe,
  t as P,
  v as ke,
  x as Ae,
  y as je,
  z as F,
} from "./D5qtcQ-q.js";
import {
  C as Me,
  T as I,
  _ as Ne,
  b as L,
  d as Pe,
  f as Fe,
  i as Ie,
  l as Le,
  m as Re,
  n as ze,
  o as Be,
  p as Ve,
  s as He,
  u as Ue,
  v as We,
} from "./B_7_FnlV.js";
import { t as R } from "./Bzo9RhRT.js";
import { o as Ge } from "./Bf-cQlPl.js";
import {
  a as Ke,
  c as qe,
  i as Je,
  l as Ye,
  o as Xe,
  r as Ze,
  s as Qe,
  t as $e,
} from "./C5jLDnSS.js";
import { t as et } from "./C74s0Oy-.js";
import { n as tt } from "./Al87cAac.js";
import {
  P as nt,
  d as z,
  f as rt,
  g as it,
  n as at,
  o as ot,
} from "./B1wSa5WC.js";
import { n as st, r as ct, t as lt } from "./CRVriIae.js";
import { t as ut } from "./B9-RHjnp.js";
import { r as dt, t as B } from "./DNykMfwC.js";
import { a as ft, o as pt, r as mt, t as ht } from "./BvIkpkrg.js";
import { t as gt } from "./DfDxjBVa.js";
import { n as _t, t as vt } from "./CDuscg6U.js";
var yt = t(r(), 1),
  bt = t(i(), 1);
function xt(e, t) {
  let n = (0, yt.useContext)(St),
    r = (0, yt.useRef)(null),
    i = n ? e(n) : (t ?? null);
  return r.current && tt(r.current, i) ? r.current : ((r.current = i), i);
}
var St = (0, yt.createContext)(null);
const Ct = ({ children: e }) => {
  let [t, n] = (0, yt.useState)(null);
  return (
    et((e, t, r) => {
      if (e.message.name === d.ViewWorkflowState) {
        let t = e.message.snapshot;
        (n(t), r());
      }
    }),
    (0, yt.useLayoutEffect)(() => {
      Ue({ name: d.RequestViewWorkflowState }).then(({ snapshot: e }) => {
        n(e);
      });
    }, []),
    (0, bt.jsx)(St.Provider, { value: t, children: e })
  );
};
function wt(e) {
  if (!ct(e)) throw TypeError(`Invalid UUID`);
  let t,
    n = new Uint8Array(16);
  return (
    (n[0] = (t = parseInt(e.slice(0, 8), 16)) >>> 24),
    (n[1] = (t >>> 16) & 255),
    (n[2] = (t >>> 8) & 255),
    (n[3] = t & 255),
    (n[4] = (t = parseInt(e.slice(9, 13), 16)) >>> 8),
    (n[5] = t & 255),
    (n[6] = (t = parseInt(e.slice(14, 18), 16)) >>> 8),
    (n[7] = t & 255),
    (n[8] = (t = parseInt(e.slice(19, 23), 16)) >>> 8),
    (n[9] = t & 255),
    (n[10] = ((t = parseInt(e.slice(24, 36), 16)) / 1099511627776) & 255),
    (n[11] = (t / 4294967296) & 255),
    (n[12] = (t >>> 24) & 255),
    (n[13] = (t >>> 16) & 255),
    (n[14] = (t >>> 8) & 255),
    (n[15] = t & 255),
    n
  );
}
var Tt = wt;
function Et(e) {
  e = unescape(encodeURIComponent(e));
  let t = [];
  for (let n = 0; n < e.length; ++n) t.push(e.charCodeAt(n));
  return t;
}
function Dt(e, t, n) {
  function r(e, r, i, a) {
    if (
      (typeof e == `string` && (e = Et(e)),
      typeof r == `string` && (r = Tt(r)),
      r?.length !== 16)
    )
      throw TypeError(
        `Namespace must be array-like (16 iterable integer values, 0-255)`,
      );
    let o = new Uint8Array(16 + e.length);
    if (
      (o.set(r),
      o.set(e, r.length),
      (o = n(o)),
      (o[6] = (o[6] & 15) | t),
      (o[8] = (o[8] & 63) | 128),
      i)
    ) {
      a ||= 0;
      for (let e = 0; e < 16; ++e) i[a + e] = o[e];
      return i;
    }
    return st(o);
  }
  try {
    r.name = e;
  } catch {}
  return (
    (r.DNS = `6ba7b810-9dad-11d1-80b4-00c04fd430c8`),
    (r.URL = `6ba7b811-9dad-11d1-80b4-00c04fd430c8`),
    r
  );
}
function Ot(e, t, n, r) {
  switch (e) {
    case 0:
      return (t & n) ^ (~t & r);
    case 1:
      return t ^ n ^ r;
    case 2:
      return (t & n) ^ (t & r) ^ (n & r);
    case 3:
      return t ^ n ^ r;
  }
}
function kt(e, t) {
  return (e << t) | (e >>> (32 - t));
}
function At(e) {
  let t = [1518500249, 1859775393, 2400959708, 3395469782],
    n = [1732584193, 4023233417, 2562383102, 271733878, 3285377520];
  if (typeof e == `string`) {
    let t = unescape(encodeURIComponent(e));
    e = [];
    for (let n = 0; n < t.length; ++n) e.push(t.charCodeAt(n));
  } else Array.isArray(e) || (e = Array.prototype.slice.call(e));
  e.push(128);
  let r = e.length / 4 + 2,
    i = Math.ceil(r / 16),
    a = Array(i);
  for (let t = 0; t < i; ++t) {
    let n = new Uint32Array(16);
    for (let r = 0; r < 16; ++r)
      n[r] =
        (e[t * 64 + r * 4] << 24) |
        (e[t * 64 + r * 4 + 1] << 16) |
        (e[t * 64 + r * 4 + 2] << 8) |
        e[t * 64 + r * 4 + 3];
    a[t] = n;
  }
  ((a[i - 1][14] = ((e.length - 1) * 8) / 2 ** 32),
    (a[i - 1][14] = Math.floor(a[i - 1][14])),
    (a[i - 1][15] = ((e.length - 1) * 8) & 4294967295));
  for (let e = 0; e < i; ++e) {
    let r = new Uint32Array(80);
    for (let t = 0; t < 16; ++t) r[t] = a[e][t];
    for (let e = 16; e < 80; ++e)
      r[e] = kt(r[e - 3] ^ r[e - 8] ^ r[e - 14] ^ r[e - 16], 1);
    let i = n[0],
      o = n[1],
      s = n[2],
      c = n[3],
      l = n[4];
    for (let e = 0; e < 80; ++e) {
      let n = Math.floor(e / 20),
        a = (kt(i, 5) + Ot(n, o, s, c) + l + t[n] + r[e]) >>> 0;
      ((l = c), (c = s), (s = kt(o, 30) >>> 0), (o = i), (i = a));
    }
    ((n[0] = (n[0] + i) >>> 0),
      (n[1] = (n[1] + o) >>> 0),
      (n[2] = (n[2] + s) >>> 0),
      (n[3] = (n[3] + c) >>> 0),
      (n[4] = (n[4] + l) >>> 0));
  }
  return [
    (n[0] >> 24) & 255,
    (n[0] >> 16) & 255,
    (n[0] >> 8) & 255,
    n[0] & 255,
    (n[1] >> 24) & 255,
    (n[1] >> 16) & 255,
    (n[1] >> 8) & 255,
    n[1] & 255,
    (n[2] >> 24) & 255,
    (n[2] >> 16) & 255,
    (n[2] >> 8) & 255,
    n[2] & 255,
    (n[3] >> 24) & 255,
    (n[3] >> 16) & 255,
    (n[3] >> 8) & 255,
    n[3] & 255,
    (n[4] >> 24) & 255,
    (n[4] >> 16) & 255,
    (n[4] >> 8) & 255,
    n[4] & 255,
  ];
}
var jt = Dt(`v5`, 80, At);
function Mt() {
  if (typeof globalThis < `u`) return globalThis;
  if (typeof self < `u`) return self;
  if (typeof window < `u`) return window;
  if (typeof global < `u`) return global;
}
function Nt() {
  let e = Mt();
  if (e.__xstate__) return e.__xstate__;
}
var Pt = (e) => {
    if (typeof window > `u`) return;
    let t = Nt();
    t && t.register(e);
  },
  Ft = class {
    constructor(e) {
      ((this._process = e),
        (this._active = !1),
        (this._current = null),
        (this._last = null));
    }
    start() {
      ((this._active = !0), this.flush());
    }
    clear() {
      this._current &&
        ((this._current.next = null), (this._last = this._current));
    }
    enqueue(e) {
      let t = { value: e, next: null };
      if (this._current) {
        ((this._last.next = t), (this._last = t));
        return;
      }
      ((this._current = t), (this._last = t), this._active && this.flush());
    }
    flush() {
      for (; this._current; ) {
        let e = this._current;
        (this._process(e.value), (this._current = e.next));
      }
      this._last = null;
    }
  },
  It = ``,
  Lt = `#`,
  Rt = `*`,
  zt = `xstate.init`,
  Bt = `xstate.stop`;
function Vt(e, t) {
  return { type: `xstate.after.${e}.${t}` };
}
function Ht(e, t) {
  return { type: `xstate.done.state.${e}`, output: t };
}
function Ut(e, t) {
  return { type: `xstate.done.actor.${e}`, output: t, actorId: e };
}
function Wt(e, t) {
  return { type: `xstate.error.actor.${e}`, error: t, actorId: e };
}
function Gt(e) {
  return { type: zt, input: e };
}
function Kt(e) {
  setTimeout(() => {
    throw e;
  });
}
var qt = (() =>
  (typeof Symbol == `function` && Symbol.observable) || `@@observable`)();
function Jt(e, t) {
  let n = Xt(e),
    r = Xt(t);
  return typeof r == `string`
    ? typeof n == `string`
      ? r === n
      : !1
    : typeof n == `string`
      ? n in r
      : Object.keys(n).every((e) => (e in r ? Jt(n[e], r[e]) : !1));
}
function Yt(e) {
  if (nn(e)) return e;
  let t = [],
    n = ``;
  for (let r = 0; r < e.length; r++) {
    switch (e.charCodeAt(r)) {
      case 92:
        ((n += e[r + 1]), r++);
        continue;
      case 46:
        (t.push(n), (n = ``));
        continue;
    }
    n += e[r];
  }
  return (t.push(n), t);
}
function Xt(e) {
  return wr(e) ? e.value : typeof e == `string` ? Zt(Yt(e)) : e;
}
function Zt(e) {
  if (e.length === 1) return e[0];
  let t = {},
    n = t;
  for (let t = 0; t < e.length - 1; t++)
    if (t === e.length - 2) n[e[t]] = e[t + 1];
    else {
      let r = n;
      ((n = {}), (r[e[t]] = n));
    }
  return t;
}
function Qt(e, t) {
  let n = {},
    r = Object.keys(e);
  for (let i = 0; i < r.length; i++) {
    let a = r[i];
    n[a] = t(e[a], a, e, i);
  }
  return n;
}
function $t(e) {
  return nn(e) ? e : [e];
}
function en(e) {
  return e === void 0 ? [] : $t(e);
}
function tn(e, t, n, r) {
  return typeof e == `function` ? e({ context: t, event: n, self: r }) : e;
}
function nn(e) {
  return Array.isArray(e);
}
function rn(e) {
  return e.type.startsWith(`xstate.error.actor`);
}
function an(e) {
  return $t(e).map((e) =>
    e === void 0 || typeof e == `string` ? { target: e } : e,
  );
}
function on(e) {
  if (!(e === void 0 || e === It)) return en(e);
}
function sn(e, t, n) {
  let r = typeof e == `object`,
    i = r ? e : void 0;
  return {
    next: (r ? e.next : e)?.bind(i),
    error: (r ? e.error : t)?.bind(i),
    complete: (r ? e.complete : n)?.bind(i),
  };
}
function cn(e, t) {
  return `${t}.${e}`;
}
function ln(e, t) {
  let n = t.match(/^xstate\.invoke\.(\d+)\.(.*)/);
  if (!n) return e.implementations.actors[t];
  let [, r, i] = n,
    a = e.getStateNodeById(i).config.invoke;
  return (Array.isArray(a) ? a[r] : a).src;
}
function un(e, t) {
  return `${e.sessionId}.${t}`;
}
var dn = 0;
function fn(e, t) {
  let n = new Map(),
    r = new Map(),
    i = new WeakMap(),
    a = new Set(),
    o = {},
    { clock: s, logger: c } = t,
    l = {
      schedule: (e, t, n, r, i = Math.random().toString(36).slice(2)) => {
        let a = {
            source: e,
            target: t,
            event: n,
            delay: r,
            id: i,
            startedAt: Date.now(),
          },
          c = un(e, i);
        ((u._snapshot._scheduledEvents[c] = a),
          (o[c] = s.setTimeout(() => {
            (delete o[c],
              delete u._snapshot._scheduledEvents[c],
              u._relay(e, t, n));
          }, r)));
      },
      cancel: (e, t) => {
        let n = un(e, t),
          r = o[n];
        (delete o[n],
          delete u._snapshot._scheduledEvents[n],
          r !== void 0 && s.clearTimeout(r));
      },
      cancelAll: (e) => {
        for (let t in u._snapshot._scheduledEvents) {
          let n = u._snapshot._scheduledEvents[t];
          n.source === e && l.cancel(e, n.id);
        }
      },
    },
    u = {
      _snapshot: {
        _scheduledEvents: (t?.snapshot && t.snapshot.scheduler) ?? {},
      },
      _bookId: () => `x:${dn++}`,
      _register: (e, t) => (n.set(e, t), e),
      _unregister: (e) => {
        n.delete(e.sessionId);
        let t = i.get(e);
        t !== void 0 && (r.delete(t), i.delete(e));
      },
      get: (e) => r.get(e),
      _set: (e, t) => {
        let n = r.get(e);
        if (n && n !== t)
          throw Error(`Actor with system ID '${e}' already exists.`);
        (r.set(e, t), i.set(t, e));
      },
      inspect: (e) => {
        let t = sn(e);
        return (
          a.add(t),
          {
            unsubscribe() {
              a.delete(t);
            },
          }
        );
      },
      _sendInspectionEvent: (t) => {
        if (!a.size) return;
        let n = { ...t, rootId: e.sessionId };
        a.forEach((e) => e.next?.(n));
      },
      _relay: (e, t, n) => {
        (u._sendInspectionEvent({
          type: `@xstate.event`,
          sourceRef: e,
          actorRef: t,
          event: n,
        }),
          t._send(n));
      },
      scheduler: l,
      getSnapshot: () => ({
        _scheduledEvents: { ...u._snapshot._scheduledEvents },
      }),
      start: () => {
        let e = u._snapshot._scheduledEvents;
        for (let t in ((u._snapshot._scheduledEvents = {}), e)) {
          let { source: n, target: r, event: i, delay: a, id: o } = e[t];
          l.schedule(n, r, i, a, o);
        }
      },
      _clock: s,
      _logger: c,
    };
  return u;
}
var pn = !1,
  V = (function (e) {
    return (
      (e[(e.NotStarted = 0)] = `NotStarted`),
      (e[(e.Running = 1)] = `Running`),
      (e[(e.Stopped = 2)] = `Stopped`),
      e
    );
  })({}),
  mn = {
    clock: {
      setTimeout: (e, t) => setTimeout(e, t),
      clearTimeout: (e) => clearTimeout(e),
    },
    logger: console.log.bind(console),
    devTools: !1,
  },
  hn = class {
    constructor(e, t) {
      ((this.logic = e),
        (this._snapshot = void 0),
        (this.clock = void 0),
        (this.options = void 0),
        (this.id = void 0),
        (this.mailbox = new Ft(this._process.bind(this))),
        (this.observers = new Set()),
        (this.eventListeners = new Map()),
        (this.logger = void 0),
        (this._processingStatus = V.NotStarted),
        (this._parent = void 0),
        (this._syncSnapshot = void 0),
        (this.ref = void 0),
        (this._actorScope = void 0),
        (this._systemId = void 0),
        (this.sessionId = void 0),
        (this.system = void 0),
        (this._doneEvent = void 0),
        (this.src = void 0),
        (this._deferred = []));
      let n = { ...mn, ...t },
        {
          clock: r,
          logger: i,
          parent: a,
          syncSnapshot: o,
          id: s,
          systemId: c,
          inspect: l,
        } = n;
      ((this.system = a ? a.system : fn(this, { clock: r, logger: i })),
        l && !a && this.system.inspect(sn(l)),
        (this.sessionId = this.system._bookId()),
        (this.id = s ?? this.sessionId),
        (this.logger = t?.logger ?? this.system._logger),
        (this.clock = t?.clock ?? this.system._clock),
        (this._parent = a),
        (this._syncSnapshot = o),
        (this.options = n),
        (this.src = n.src ?? e),
        (this.ref = this),
        (this._actorScope = {
          self: this,
          id: this.id,
          sessionId: this.sessionId,
          logger: this.logger,
          defer: (e) => {
            this._deferred.push(e);
          },
          system: this.system,
          stopChild: (e) => {
            if (e._parent !== this)
              throw Error(
                `Cannot stop child actor ${e.id} of ${this.id} because it is not a child`,
              );
            e._stop();
          },
          emit: (e) => {
            let t = this.eventListeners.get(e.type),
              n = this.eventListeners.get(`*`);
            if (!t && !n) return;
            let r = [...(t ? t.values() : []), ...(n ? n.values() : [])];
            for (let t of r)
              try {
                t(e);
              } catch (e) {
                Kt(e);
              }
          },
          actionExecutor: (e) => {
            let t = () => {
              if (
                (this._actorScope.system._sendInspectionEvent({
                  type: `@xstate.action`,
                  actorRef: this,
                  action: { type: e.type, params: e.params },
                }),
                !e.exec)
              )
                return;
              let t = pn;
              try {
                ((pn = !0), e.exec(e.info, e.params));
              } finally {
                pn = t;
              }
            };
            this._processingStatus === V.Running ? t() : this._deferred.push(t);
          },
        }),
        (this.send = this.send.bind(this)),
        this.system._sendInspectionEvent({
          type: `@xstate.actor`,
          actorRef: this,
        }),
        c && ((this._systemId = c), this.system._set(c, this)),
        this._initState(t?.snapshot ?? t?.state),
        c &&
          this._snapshot.status !== `active` &&
          this.system._unregister(this));
    }
    _initState(e) {
      try {
        this._snapshot = e
          ? this.logic.restoreSnapshot
            ? this.logic.restoreSnapshot(e, this._actorScope)
            : e
          : this.logic.getInitialSnapshot(
              this._actorScope,
              this.options?.input,
            );
      } catch (e) {
        this._snapshot = { status: `error`, output: void 0, error: e };
      }
    }
    update(e, t) {
      this._snapshot = e;
      let n;
      for (; (n = this._deferred.shift()); )
        try {
          n();
        } catch (t) {
          ((this._deferred.length = 0),
            (this._snapshot = { ...e, status: `error`, error: t }));
        }
      switch (this._snapshot.status) {
        case `active`:
          for (let t of this.observers)
            try {
              t.next?.(e);
            } catch (e) {
              Kt(e);
            }
          break;
        case `done`:
          for (let t of this.observers)
            try {
              t.next?.(e);
            } catch (e) {
              Kt(e);
            }
          (this._stopProcedure(),
            this._complete(),
            (this._doneEvent = Ut(this.id, this._snapshot.output)),
            this._parent &&
              this.system._relay(this, this._parent, this._doneEvent));
          break;
        case `error`:
          this._error(this._snapshot.error);
          break;
      }
      this.system._sendInspectionEvent({
        type: `@xstate.snapshot`,
        actorRef: this,
        event: t,
        snapshot: e,
      });
    }
    subscribe(e, t, n) {
      let r = sn(e, t, n);
      if (this._processingStatus !== V.Stopped) this.observers.add(r);
      else
        switch (this._snapshot.status) {
          case `done`:
            try {
              r.complete?.();
            } catch (e) {
              Kt(e);
            }
            break;
          case `error`: {
            let e = this._snapshot.error;
            if (!r.error) Kt(e);
            else
              try {
                r.error(e);
              } catch (e) {
                Kt(e);
              }
            break;
          }
        }
      return {
        unsubscribe: () => {
          this.observers.delete(r);
        },
      };
    }
    on(e, t) {
      let n = this.eventListeners.get(e);
      n || ((n = new Set()), this.eventListeners.set(e, n));
      let r = t.bind(void 0);
      return (
        n.add(r),
        {
          unsubscribe: () => {
            n.delete(r);
          },
        }
      );
    }
    start() {
      if (this._processingStatus === V.Running) return this;
      (this._syncSnapshot &&
        this.subscribe({
          next: (e) => {
            e.status === `active` &&
              this.system._relay(this, this._parent, {
                type: `xstate.snapshot.${this.id}`,
                snapshot: e,
              });
          },
          error: () => {},
        }),
        this.system._register(this.sessionId, this),
        this._systemId && this.system._set(this._systemId, this),
        (this._processingStatus = V.Running));
      let e = Gt(this.options.input);
      switch (
        (this.system._sendInspectionEvent({
          type: `@xstate.event`,
          sourceRef: this._parent,
          actorRef: this,
          event: e,
        }),
        this._snapshot.status)
      ) {
        case `done`:
          return (this.update(this._snapshot, e), this);
        case `error`:
          return (this._error(this._snapshot.error), this);
      }
      if ((this._parent || this.system.start(), this.logic.start))
        try {
          this.logic.start(this._snapshot, this._actorScope);
        } catch (e) {
          return (
            (this._snapshot = { ...this._snapshot, status: `error`, error: e }),
            this._error(e),
            this
          );
        }
      return (
        this.update(this._snapshot, e),
        this.options.devTools && this.attachDevTools(),
        this.mailbox.start(),
        this
      );
    }
    _process(e) {
      let t, n;
      try {
        t = this.logic.transition(this._snapshot, e, this._actorScope);
      } catch (e) {
        n = { err: e };
      }
      if (n) {
        let { err: e } = n;
        ((this._snapshot = { ...this._snapshot, status: `error`, error: e }),
          this._error(e));
        return;
      }
      (this.update(t, e),
        e.type === `xstate.stop` && (this._stopProcedure(), this._complete()));
    }
    _stop() {
      return this._processingStatus === V.Stopped
        ? this
        : (this.mailbox.clear(),
          this._processingStatus === V.NotStarted
            ? ((this._processingStatus = V.Stopped), this)
            : (this.mailbox.enqueue({ type: Bt }), this));
    }
    stop() {
      if (this._parent)
        throw Error(`A non-root actor cannot be stopped directly.`);
      return this._stop();
    }
    _complete() {
      for (let e of this.observers)
        try {
          e.complete?.();
        } catch (e) {
          Kt(e);
        }
      this.observers.clear();
    }
    _reportError(e) {
      if (!this.observers.size) {
        this._parent || Kt(e);
        return;
      }
      let t = !1;
      for (let n of this.observers) {
        let r = n.error;
        t ||= !r;
        try {
          r?.(e);
        } catch (e) {
          Kt(e);
        }
      }
      (this.observers.clear(), t && Kt(e));
    }
    _error(e) {
      (this._stopProcedure(),
        this._reportError(e),
        this._parent && this.system._relay(this, this._parent, Wt(this.id, e)));
    }
    _stopProcedure() {
      return this._processingStatus === V.Running
        ? (this.system.scheduler.cancelAll(this),
          this.mailbox.clear(),
          (this.mailbox = new Ft(this._process.bind(this))),
          (this._processingStatus = V.Stopped),
          this.system._unregister(this),
          this)
        : this;
    }
    _send(e) {
      this._processingStatus !== V.Stopped && this.mailbox.enqueue(e);
    }
    send(e) {
      this.system._relay(void 0, this, e);
    }
    attachDevTools() {
      let { devTools: e } = this.options;
      e && (typeof e == `function` ? e : Pt)(this);
    }
    toJSON() {
      return { xstate$$type: 1, id: this.id };
    }
    getPersistedSnapshot(e) {
      return this.logic.getPersistedSnapshot(this._snapshot, e);
    }
    [qt]() {
      return this;
    }
    getSnapshot() {
      return this._snapshot;
    }
  };
function gn(e, ...[t]) {
  return new hn(e, t);
}
function _n(e, t, n, r, { sendId: i }) {
  return [t, { sendId: typeof i == `function` ? i(n, r) : i }, void 0];
}
function vn(e, t) {
  e.defer(() => {
    e.system.scheduler.cancel(e.self, t.sendId);
  });
}
function yn(e) {
  function t(e, t) {}
  return (
    (t.type = `xstate.cancel`),
    (t.sendId = e),
    (t.resolve = _n),
    (t.execute = vn),
    t
  );
}
function bn(
  e,
  t,
  n,
  r,
  { id: i, systemId: a, src: o, input: s, syncSnapshot: c },
) {
  let l = typeof o == `string` ? ln(t.machine, o) : o,
    u = typeof i == `function` ? i(n) : i,
    d,
    f;
  return (
    l &&
      ((f =
        typeof s == `function`
          ? s({ context: t.context, event: n.event, self: e.self })
          : s),
      (d = gn(l, {
        id: u,
        src: o,
        parent: e.self,
        syncSnapshot: c,
        systemId: a,
        input: f,
      }))),
    [
      jr(t, { children: { ...t.children, [u]: d } }),
      { id: i, systemId: a, actorRef: d, src: o, input: f },
      void 0,
    ]
  );
}
function xn(e, { actorRef: t }) {
  t &&
    e.defer(() => {
      t._processingStatus !== V.Stopped && t.start();
    });
}
function Sn(
  ...[e, { id: t, systemId: n, input: r, syncSnapshot: i = !1 } = {}]
) {
  function a(e, t) {}
  return (
    (a.type = `xstate.spawnChild`),
    (a.id = t),
    (a.systemId = n),
    (a.src = e),
    (a.input = r),
    (a.syncSnapshot = i),
    (a.resolve = bn),
    (a.execute = xn),
    a
  );
}
function Cn(e, t, n, r, { actorRef: i }) {
  let a = typeof i == `function` ? i(n, r) : i,
    o = typeof a == `string` ? t.children[a] : a,
    s = t.children;
  return (
    o && ((s = { ...s }), delete s[o.id]),
    [jr(t, { children: s }), o, void 0]
  );
}
function wn(e, t) {
  if (t) {
    if ((e.system._unregister(t), t._processingStatus !== V.Running)) {
      e.stopChild(t);
      return;
    }
    e.defer(() => {
      e.stopChild(t);
    });
  }
}
function Tn(e) {
  function t(e, t) {}
  return (
    (t.type = `xstate.stopChild`),
    (t.actorRef = e),
    (t.resolve = Cn),
    (t.execute = wn),
    t
  );
}
function En(e, t, n, r) {
  let { machine: i } = r,
    a = typeof e == `function`,
    o = a ? e : i.implementations.guards[typeof e == `string` ? e : e.type];
  if (!a && !o)
    throw Error(
      `Guard '${typeof e == `string` ? e : e.type}' is not implemented.'.`,
    );
  if (typeof o != `function`) return En(o, t, n, r);
  let s = { context: t, event: n },
    c =
      a || typeof e == `string`
        ? void 0
        : `params` in e
          ? typeof e.params == `function`
            ? e.params({ context: t, event: n })
            : e.params
          : void 0;
  return `check` in o ? o.check(r, s, o) : o(s, c);
}
var Dn = (e) => e.type === `atomic` || e.type === `final`;
function On(e) {
  return Object.values(e.states).filter((e) => e.type !== `history`);
}
function kn(e, t) {
  let n = [];
  if (t === e) return n;
  let r = e.parent;
  for (; r && r !== t; ) (n.push(r), (r = r.parent));
  return n;
}
function An(e) {
  let t = new Set(e),
    n = Mn(t);
  for (let e of t)
    if (e.type === `compound` && (!n.get(e) || !n.get(e).length))
      Wn(e).forEach((e) => t.add(e));
    else if (e.type === `parallel`) {
      for (let n of On(e))
        if (n.type !== `history` && !t.has(n)) {
          let e = Wn(n);
          for (let n of e) t.add(n);
        }
    }
  for (let e of t) {
    let n = e.parent;
    for (; n; ) (t.add(n), (n = n.parent));
  }
  return t;
}
function jn(e, t) {
  let n = t.get(e);
  if (!n) return {};
  if (e.type === `compound`) {
    let e = n[0];
    if (e) {
      if (Dn(e)) return e.key;
    } else return {};
  }
  let r = {};
  for (let e of n) r[e.key] = jn(e, t);
  return r;
}
function Mn(e) {
  let t = new Map();
  for (let n of e)
    (t.has(n) || t.set(n, []),
      n.parent &&
        (t.has(n.parent) || t.set(n.parent, []), t.get(n.parent).push(n)));
  return t;
}
function Nn(e, t) {
  return jn(e, Mn(An(t)));
}
function Pn(e, t) {
  return t.type === `compound`
    ? On(t).some((t) => t.type === `final` && e.has(t))
    : t.type === `parallel`
      ? On(t).every((t) => Pn(e, t))
      : t.type === `final`;
}
var Fn = (e) => e[0] === Lt;
function In(e, t) {
  return (
    e.transitions.get(t) ||
    [...e.transitions.keys()]
      .filter((e) => {
        if (e === Rt) return !0;
        if (!e.endsWith(`.*`)) return !1;
        let n = e.split(`.`),
          r = t.split(`.`);
        for (let e = 0; e < n.length; e++) {
          let t = n[e],
            i = r[e];
          if (t === `*`) return e === n.length - 1;
          if (t !== i) return !1;
        }
        return !0;
      })
      .sort((e, t) => t.length - e.length)
      .flatMap((t) => e.transitions.get(t))
  );
}
function Ln(e) {
  let t = e.config.after;
  if (!t) return [];
  let n = (t) => {
    let n = Vt(t, e.id),
      r = n.type;
    return (e.entry.push(Lr(n, { id: r, delay: t })), e.exit.push(yn(r)), r);
  };
  return Object.keys(t)
    .flatMap((e) => {
      let r = t[e],
        i = typeof r == `string` ? { target: r } : r,
        a = Number.isNaN(+e) ? e : +e,
        o = n(a);
      return en(i).map((e) => ({ ...e, event: o, delay: a }));
    })
    .map((t) => {
      let { delay: n } = t;
      return { ...Rn(e, t.event, t), delay: n };
    });
}
function Rn(e, t, n) {
  let r = on(n.target),
    i = n.reenter ?? !1,
    a = Vn(e, r),
    o = {
      ...n,
      actions: en(n.actions),
      guard: n.guard,
      target: a,
      source: e,
      reenter: i,
      eventType: t,
      toJSON: () => ({
        ...o,
        source: `#${e.id}`,
        target: a ? a.map((e) => `#${e.id}`) : void 0,
      }),
    };
  return o;
}
function zn(e) {
  let t = new Map();
  if (e.config.on)
    for (let n of Object.keys(e.config.on)) {
      if (n === ``)
        throw Error(
          'Null events ("") cannot be specified as a transition key. Use `always: { ... }` instead.',
        );
      let r = e.config.on[n];
      t.set(
        n,
        an(r).map((t) => Rn(e, n, t)),
      );
    }
  if (e.config.onDone) {
    let n = `xstate.done.state.${e.id}`;
    t.set(
      n,
      an(e.config.onDone).map((t) => Rn(e, n, t)),
    );
  }
  for (let n of e.invoke) {
    if (n.onDone) {
      let r = `xstate.done.actor.${n.id}`;
      t.set(
        r,
        an(n.onDone).map((t) => Rn(e, r, t)),
      );
    }
    if (n.onError) {
      let r = `xstate.error.actor.${n.id}`;
      t.set(
        r,
        an(n.onError).map((t) => Rn(e, r, t)),
      );
    }
    if (n.onSnapshot) {
      let r = `xstate.snapshot.${n.id}`;
      t.set(
        r,
        an(n.onSnapshot).map((t) => Rn(e, r, t)),
      );
    }
  }
  for (let n of e.after) {
    let e = t.get(n.eventType);
    (e || ((e = []), t.set(n.eventType, e)), e.push(n));
  }
  return t;
}
function Bn(e, t) {
  let n = typeof t == `string` ? e.states[t] : t ? e.states[t.target] : void 0;
  if (!n && t)
    throw Error(
      `Initial state node "${t}" not found on parent state node #${e.id}`,
    );
  let r = {
    source: e,
    actions: !t || typeof t == `string` ? [] : en(t.actions),
    eventType: null,
    reenter: !1,
    target: n ? [n] : [],
    toJSON: () => ({ ...r, source: `#${e.id}`, target: n ? [`#${n.id}`] : [] }),
  };
  return r;
}
function Vn(e, t) {
  if (t !== void 0)
    return t.map((t) => {
      if (typeof t != `string`) return t;
      if (Fn(t)) return e.machine.getStateNodeById(t);
      let n = t[0] === `.`;
      if (n && !e.parent) return qn(e, t.slice(1));
      let r = n ? e.key + t : t;
      if (e.parent)
        try {
          return qn(e.parent, r);
        } catch (t) {
          throw Error(
            `Invalid transition definition for state node '${e.id}':\n${t.message}`,
          );
        }
      else
        throw Error(
          `Invalid target: "${t}" is not a valid target from the root node. Did you mean ".${t}"?`,
        );
    });
}
function Hn(e) {
  let t = on(e.config.target);
  return t
    ? { target: t.map((t) => (typeof t == `string` ? qn(e.parent, t) : t)) }
    : e.parent.initial;
}
function Un(e) {
  return e.type === `history`;
}
function Wn(e) {
  let t = Gn(e);
  for (let n of t) for (let r of kn(n, e)) t.add(r);
  return t;
}
function Gn(e) {
  let t = new Set();
  function n(e) {
    if (!t.has(e)) {
      if ((t.add(e), e.type === `compound`)) n(e.initial.target[0]);
      else if (e.type === `parallel`) for (let t of On(e)) n(t);
    }
  }
  return (n(e), t);
}
function Kn(e, t) {
  if (Fn(t)) return e.machine.getStateNodeById(t);
  if (!e.states)
    throw Error(
      `Unable to retrieve child state '${t}' from '${e.id}'; no child states exist.`,
    );
  let n = e.states[t];
  if (!n) throw Error(`Child state '${t}' does not exist on '${e.id}'`);
  return n;
}
function qn(e, t) {
  if (typeof t == `string` && Fn(t))
    try {
      return e.machine.getStateNodeById(t);
    } catch {}
  let n = Yt(t).slice(),
    r = e;
  for (; n.length; ) {
    let e = n.shift();
    if (!e.length) break;
    r = Kn(r, e);
  }
  return r;
}
function Jn(e, t) {
  if (typeof t == `string`) {
    let n = e.states[t];
    if (!n) throw Error(`State '${t}' does not exist on '${e.id}'`);
    return [e, n];
  }
  let n = Object.keys(t),
    r = n.map((t) => Kn(e, t)).filter(Boolean);
  return [e.machine.root, e].concat(
    r,
    n.reduce((n, r) => {
      let i = Kn(e, r);
      if (!i) return n;
      let a = Jn(i, t[r]);
      return n.concat(a);
    }, []),
  );
}
function Yn(e, t, n, r) {
  let i = Kn(e, t).next(n, r);
  return !i || !i.length ? e.next(n, r) : i;
}
function Xn(e, t, n, r) {
  let i = Object.keys(t),
    a = Qn(Kn(e, i[0]), t[i[0]], n, r);
  return !a || !a.length ? e.next(n, r) : a;
}
function Zn(e, t, n, r) {
  let i = [];
  for (let a of Object.keys(t)) {
    let o = t[a];
    if (!o) continue;
    let s = Qn(Kn(e, a), o, n, r);
    s && i.push(...s);
  }
  return i.length ? i : e.next(n, r);
}
function Qn(e, t, n, r) {
  return typeof t == `string`
    ? Yn(e, t, n, r)
    : Object.keys(t).length === 1
      ? Xn(e, t, n, r)
      : Zn(e, t, n, r);
}
function $n(e) {
  return Object.keys(e.states)
    .map((t) => e.states[t])
    .filter((e) => e.type === `history`);
}
function er(e, t) {
  let n = e;
  for (; n.parent && n.parent !== t; ) n = n.parent;
  return n.parent === t;
}
function tr(e, t) {
  let n = new Set(e),
    r = new Set(t);
  for (let e of n) if (r.has(e)) return !0;
  for (let e of r) if (n.has(e)) return !0;
  return !1;
}
function nr(e, t, n) {
  let r = new Set();
  for (let i of e) {
    let e = !1,
      a = new Set();
    for (let o of r)
      if (tr(or([i], t, n), or([o], t, n)))
        if (er(i.source, o.source)) a.add(o);
        else {
          e = !0;
          break;
        }
    if (!e) {
      for (let e of a) r.delete(e);
      r.add(i);
    }
  }
  return Array.from(r);
}
function rr(e) {
  let [t, ...n] = e;
  for (let e of kn(t, void 0)) if (n.every((t) => er(t, e))) return e;
}
function ir(e, t) {
  if (!e.target) return [];
  let n = new Set();
  for (let r of e.target)
    if (Un(r))
      if (t[r.id]) for (let e of t[r.id]) n.add(e);
      else for (let e of ir(Hn(r), t)) n.add(e);
    else n.add(r);
  return [...n];
}
function ar(e, t) {
  let n = ir(e, t);
  if (!n) return;
  if (!e.reenter && n.every((t) => t === e.source || er(t, e.source)))
    return e.source;
  let r = rr(n.concat(e.source));
  if (r) return r;
  if (!e.reenter) return e.source.machine.root;
}
function or(e, t, n) {
  let r = new Set();
  for (let i of e)
    if (i.target?.length) {
      let e = ar(i, n);
      i.reenter && i.source === e && r.add(e);
      for (let n of t) er(n, e) && r.add(n);
    }
  return [...r];
}
function sr(e, t) {
  if (e.length !== t.size) return !1;
  for (let n of e) if (!t.has(n)) return !1;
  return !0;
}
function cr(e, t, n, r, i, a) {
  if (!e.length) return t;
  let o = new Set(t._nodes),
    s = t.historyValue,
    c = nr(e, o, s),
    l = t;
  (i || ([l, s] = hr(l, r, n, c, o, s, a, n.actionExecutor)),
    (l = vr(
      l,
      r,
      n,
      c.flatMap((e) => e.actions),
      a,
      void 0,
    )),
    (l = ur(l, r, n, c, o, a, s, i)));
  let u = [...o];
  l.status === `done` &&
    (l = vr(
      l,
      r,
      n,
      u.sort((e, t) => t.order - e.order).flatMap((e) => e.exit),
      a,
      void 0,
    ));
  try {
    return s === t.historyValue && sr(t._nodes, o)
      ? l
      : jr(l, { _nodes: u, historyValue: s });
  } catch (e) {
    throw e;
  }
}
function lr(e, t, n, r, i) {
  if (r.output === void 0) return;
  let a = Ht(
    i.id,
    i.output !== void 0 && i.parent
      ? tn(i.output, e.context, t, n.self)
      : void 0,
  );
  return tn(r.output, e.context, a, n.self);
}
function ur(e, t, n, r, i, a, o, s) {
  let c = e,
    l = new Set(),
    u = new Set();
  (dr(r, o, u, l), s && u.add(e.machine.root));
  let d = new Set();
  for (let e of [...l].sort((e, t) => e.order - t.order)) {
    i.add(e);
    let r = [];
    r.push(...e.entry);
    for (let t of e.invoke)
      r.push(Sn(t.src, { ...t, syncSnapshot: !!t.onSnapshot }));
    if (u.has(e)) {
      let t = e.initial.actions;
      r.push(...t);
    }
    if (
      ((c = vr(
        c,
        t,
        n,
        r,
        a,
        e.invoke.map((e) => e.id),
      )),
      e.type === `final`)
    ) {
      let r = e.parent,
        o = r?.type === `parallel` ? r : r?.parent,
        s = o || e;
      for (
        r?.type === `compound` &&
        a.push(
          Ht(
            r.id,
            e.output === void 0 ? void 0 : tn(e.output, c.context, t, n.self),
          ),
        );
        o?.type === `parallel` && !d.has(o) && Pn(i, o);
      )
        (d.add(o), a.push(Ht(o.id)), (s = o), (o = o.parent));
      if (o) continue;
      c = jr(c, { status: `done`, output: lr(c, t, n, c.machine.root, s) });
    }
  }
  return c;
}
function dr(e, t, n, r) {
  for (let i of e) {
    let e = ar(i, t);
    for (let a of i.target || [])
      (!Un(a) &&
        (i.source !== a || i.source !== e || i.reenter) &&
        (r.add(a), n.add(a)),
        fr(a, t, n, r));
    let a = ir(i, t);
    for (let o of a) {
      let a = kn(o, e);
      (e?.type === `parallel` && a.push(e),
        pr(r, t, n, a, !i.source.parent && i.reenter ? void 0 : e));
    }
  }
}
function fr(e, t, n, r) {
  if (Un(e))
    if (t[e.id]) {
      let i = t[e.id];
      for (let e of i) (r.add(e), fr(e, t, n, r));
      for (let a of i) mr(a, e.parent, r, t, n);
    } else {
      let i = Hn(e);
      for (let a of i.target)
        (r.add(a), i === e.parent?.initial && n.add(e.parent), fr(a, t, n, r));
      for (let a of i.target) mr(a, e.parent, r, t, n);
    }
  else if (e.type === `compound`) {
    let [i] = e.initial.target;
    (Un(i) || (r.add(i), n.add(i)), fr(i, t, n, r), mr(i, e, r, t, n));
  } else if (e.type === `parallel`)
    for (let i of On(e).filter((e) => !Un(e)))
      [...r].some((e) => er(e, i)) ||
        (Un(i) || (r.add(i), n.add(i)), fr(i, t, n, r));
}
function pr(e, t, n, r, i) {
  for (let a of r)
    if (((!i || er(a, i)) && e.add(a), a.type === `parallel`))
      for (let r of On(a).filter((e) => !Un(e)))
        [...e].some((e) => er(e, r)) || (e.add(r), fr(r, t, n, e));
}
function mr(e, t, n, r, i) {
  pr(n, r, i, kn(e, t));
}
function hr(e, t, n, r, i, a, o, s) {
  let c = e,
    l = or(r, i, a);
  l.sort((e, t) => t.order - e.order);
  let u;
  for (let e of l)
    for (let t of $n(e)) {
      let n;
      ((n =
        t.history === `deep`
          ? (t) => Dn(t) && er(t, e)
          : (t) => t.parent === e),
        (u ??= { ...a }),
        (u[t.id] = Array.from(i).filter(n)));
    }
  for (let e of l)
    ((c = vr(
      c,
      t,
      n,
      [...e.exit, ...e.invoke.map((e) => Tn(e.id))],
      o,
      void 0,
    )),
      i.delete(e));
  return [c, u || a];
}
function gr(e, t) {
  return e.implementations.actions[t];
}
function _r(e, t, n, r, i, a) {
  let { machine: o } = e,
    s = e;
  for (let e of r) {
    let r = typeof e == `function`,
      c = r ? e : gr(o, typeof e == `string` ? e : e.type),
      l = { context: s.context, event: t, self: n.self, system: n.system },
      u =
        r || typeof e == `string`
          ? void 0
          : `params` in e
            ? typeof e.params == `function`
              ? e.params({ context: s.context, event: t })
              : e.params
            : void 0;
    if (!c || !(`resolve` in c)) {
      n.actionExecutor({
        type:
          typeof e == `string`
            ? e
            : typeof e == `object`
              ? e.type
              : e.name || `(anonymous)`,
        info: l,
        params: u,
        exec: c,
      });
      continue;
    }
    let d = c,
      [f, p, m] = d.resolve(n, s, l, u, c, i);
    ((s = f),
      `retryResolve` in d && a?.push([d, p]),
      `execute` in d &&
        n.actionExecutor({
          type: d.type,
          info: l,
          params: p,
          exec: d.execute.bind(null, n, p),
        }),
      m && (s = _r(s, t, n, m, i, a)));
  }
  return s;
}
function vr(e, t, n, r, i, a) {
  let o = a ? [] : void 0,
    s = _r(e, t, n, r, { internalQueue: i, deferredActorIds: a }, o);
  return (
    o?.forEach(([e, t]) => {
      e.retryResolve(n, s, t);
    }),
    s
  );
}
function yr(e, t, n, r) {
  let i = e,
    a = [];
  function o(e, t, r) {
    (n.system._sendInspectionEvent({
      type: `@xstate.microstep`,
      actorRef: n.self,
      event: t,
      snapshot: e,
      _transitions: r,
    }),
      a.push(e));
  }
  if (t.type === `xstate.stop`)
    return (
      (i = jr(br(i, t, n), { status: `stopped` })),
      o(i, t, []),
      { snapshot: i, microstates: a }
    );
  let s = t;
  if (s.type !== zt) {
    let t = s,
      c = rn(t),
      l = xr(t, i);
    if (c && !l.length)
      return (
        (i = jr(e, { status: `error`, error: t.error })),
        o(i, t, []),
        { snapshot: i, microstates: a }
      );
    ((i = cr(l, e, n, s, !1, r)), o(i, t, l));
  }
  let c = !0;
  for (; i.status === `active`; ) {
    let e = c ? Sr(i, s) : [],
      t = e.length ? i : void 0;
    if (!e.length) {
      if (!r.length) break;
      ((s = r.shift()), (e = xr(s, i)));
    }
    ((i = cr(e, i, n, s, !1, r)), (c = i !== t), o(i, s, e));
  }
  return (
    i.status !== `active` && br(i, s, n),
    { snapshot: i, microstates: a }
  );
}
function br(e, t, n) {
  return vr(
    e,
    t,
    n,
    Object.values(e.children).map((e) => Tn(e)),
    [],
    void 0,
  );
}
function xr(e, t) {
  return t.machine.getTransitionData(t, e);
}
function Sr(e, t) {
  let n = new Set(),
    r = e._nodes.filter(Dn);
  for (let i of r)
    loop: for (let r of [i].concat(kn(i, void 0)))
      if (r.always) {
        for (let i of r.always)
          if (i.guard === void 0 || En(i.guard, e.context, t, e)) {
            n.add(i);
            break loop;
          }
      }
  return nr(Array.from(n), new Set(e._nodes), e.historyValue);
}
function Cr(e, t) {
  return Nn(e, [...An(Jn(e, t))]);
}
function wr(e) {
  return !!e && typeof e == `object` && `machine` in e && `value` in e;
}
var Tr = function (e) {
    return Jt(e, this.value);
  },
  Er = function (e) {
    return this.tags.has(e);
  },
  Dr = function (e) {
    let t = this.machine.getTransitionData(this, e);
    return (
      !!t?.length && t.some((e) => e.target !== void 0 || e.actions.length)
    );
  },
  Or = function () {
    let {
      _nodes: e,
      tags: t,
      machine: n,
      getMeta: r,
      toJSON: i,
      can: a,
      hasTag: o,
      matches: s,
      ...c
    } = this;
    return { ...c, tags: Array.from(t) };
  },
  kr = function () {
    return this._nodes.reduce(
      (e, t) => (t.meta !== void 0 && (e[t.id] = t.meta), e),
      {},
    );
  };
function Ar(e, t) {
  return {
    status: e.status,
    output: e.output,
    error: e.error,
    machine: t,
    context: e.context,
    _nodes: e._nodes,
    value: Nn(t.root, e._nodes),
    tags: new Set(e._nodes.flatMap((e) => e.tags)),
    children: e.children,
    historyValue: e.historyValue || {},
    matches: Tr,
    hasTag: Er,
    can: Dr,
    getMeta: kr,
    toJSON: Or,
  };
}
function jr(e, t = {}) {
  return Ar({ ...e, ...t }, e.machine);
}
function Mr(e) {
  if (typeof e != `object` || !e) return {};
  let t = {};
  for (let n in e) {
    let r = e[n];
    Array.isArray(r) && (t[n] = r.map((e) => ({ id: e.id })));
  }
  return t;
}
function Nr(e, t) {
  let {
      _nodes: n,
      tags: r,
      machine: i,
      children: a,
      context: o,
      can: s,
      hasTag: c,
      matches: l,
      getMeta: u,
      toJSON: d,
      ...f
    } = e,
    p = {};
  for (let e in a) {
    let n = a[e];
    p[e] = {
      snapshot: n.getPersistedSnapshot(t),
      src: n.src,
      systemId: n._systemId,
      syncSnapshot: n._syncSnapshot,
    };
  }
  return {
    ...f,
    context: Pr(o),
    children: p,
    historyValue: Mr(f.historyValue),
  };
}
function Pr(e) {
  let t;
  for (let n in e) {
    let r = e[n];
    if (r && typeof r == `object`)
      if (`sessionId` in r && `send` in r && `ref` in r)
        ((t ??= Array.isArray(e) ? e.slice() : { ...e }),
          (t[n] = { xstate$$type: 1, id: r.id }));
      else {
        let i = Pr(r);
        i !== r &&
          ((t ??= Array.isArray(e) ? e.slice() : { ...e }), (t[n] = i));
      }
  }
  return t ?? e;
}
function Fr(e, t, n, r, { event: i, id: a, delay: o }, { internalQueue: s }) {
  let c = t.machine.implementations.delays;
  if (typeof i == `string`)
    throw Error(
      `Only event objects may be used with raise; use raise({ type: "${i}" }) instead`,
    );
  let l = typeof i == `function` ? i(n, r) : i,
    u;
  if (typeof o == `string`) {
    let e = c && c[o];
    u = typeof e == `function` ? e(n, r) : e;
  } else u = typeof o == `function` ? o(n, r) : o;
  return (
    typeof u != `number` && s.push(l),
    [t, { event: l, id: a, delay: u }, void 0]
  );
}
function Ir(e, t) {
  let { event: n, delay: r, id: i } = t;
  if (typeof r == `number`) {
    e.defer(() => {
      let t = e.self;
      e.system.scheduler.schedule(t, t, n, r, i);
    });
    return;
  }
}
function Lr(e, t) {
  function n(e, t) {}
  return (
    (n.type = `xstate.raise`),
    (n.event = e),
    (n.id = t?.id),
    (n.delay = t?.delay),
    (n.resolve = Fr),
    (n.execute = Ir),
    n
  );
}
var Rr = `xstate.promise.resolve`,
  zr = `xstate.promise.reject`,
  Br = new WeakMap();
function Vr(e) {
  return {
    config: e,
    transition: (e, t, n) => {
      if (e.status !== `active`) return e;
      switch (t.type) {
        case Rr: {
          let n = t.data;
          return { ...e, status: `done`, output: n, input: void 0 };
        }
        case zr:
          return { ...e, status: `error`, error: t.data, input: void 0 };
        case Bt:
          return (
            Br.get(n.self)?.abort(),
            { ...e, status: `stopped`, input: void 0 }
          );
        default:
          return e;
      }
    },
    start: (t, { self: n, system: r, emit: i }) => {
      if (t.status !== `active`) return;
      let a = new AbortController();
      (Br.set(n, a),
        Promise.resolve(
          e({ input: t.input, system: r, self: n, signal: a.signal, emit: i }),
        ).then(
          (e) => {
            n.getSnapshot().status === `active` &&
              (Br.delete(n), r._relay(n, n, { type: Rr, data: e }));
          },
          (e) => {
            n.getSnapshot().status === `active` &&
              (Br.delete(n), r._relay(n, n, { type: zr, data: e }));
          },
        ));
    },
    getInitialSnapshot: (e, t) => ({
      status: `active`,
      output: void 0,
      error: void 0,
      input: t,
    }),
    getPersistedSnapshot: (e) => e,
    restoreSnapshot: (e) => e,
  };
}
function Hr(e, { machine: t, context: n }, r, i) {
  let a = (a, o) => {
    if (typeof a == `string`) {
      let s = ln(t, a);
      if (!s)
        throw Error(`Actor logic '${a}' not implemented in machine '${t.id}'`);
      let c = gn(s, {
        id: o?.id,
        parent: e.self,
        syncSnapshot: o?.syncSnapshot,
        input:
          typeof o?.input == `function`
            ? o.input({ context: n, event: r, self: e.self })
            : o?.input,
        src: a,
        systemId: o?.systemId,
      });
      return ((i[c.id] = c), c);
    } else
      return gn(a, {
        id: o?.id,
        parent: e.self,
        syncSnapshot: o?.syncSnapshot,
        input: o?.input,
        src: a,
        systemId: o?.systemId,
      });
  };
  return (t, n) => {
    let r = a(t, n);
    return (
      (i[r.id] = r),
      e.defer(() => {
        r._processingStatus !== V.Stopped && r.start();
      }),
      r
    );
  };
}
function Ur(e, t, n, r, { assignment: i }) {
  if (!t.context)
    throw Error(
      "Cannot assign to undefined `context`. Ensure that `context` is defined in the machine config.",
    );
  let a = {},
    o = {
      context: t.context,
      event: n.event,
      spawn: Hr(e, t, n.event, a),
      self: e.self,
      system: e.system,
    },
    s = {};
  if (typeof i == `function`) s = i(o, r);
  else
    for (let e of Object.keys(i)) {
      let t = i[e];
      s[e] = typeof t == `function` ? t(o, r) : t;
    }
  return [
    jr(t, {
      context: Object.assign({}, t.context, s),
      children: Object.keys(a).length ? { ...t.children, ...a } : t.children,
    }),
    void 0,
    void 0,
  ];
}
function H(e) {
  function t(e, t) {}
  return ((t.type = `xstate.assign`), (t.assignment = e), (t.resolve = Ur), t);
}
var Wr = new WeakMap();
function Gr(e, t, n) {
  let r = Wr.get(e);
  return (
    r ? t in r || (r[t] = n()) : ((r = { [t]: n() }), Wr.set(e, r)),
    r[t]
  );
}
var Kr = {},
  qr = (e) =>
    typeof e == `string`
      ? { type: e }
      : typeof e == `function`
        ? `resolve` in e
          ? { type: e.type }
          : { type: e.name }
        : e,
  Jr = class e {
    constructor(t, n) {
      if (
        ((this.config = t),
        (this.key = void 0),
        (this.id = void 0),
        (this.type = void 0),
        (this.path = void 0),
        (this.states = void 0),
        (this.history = void 0),
        (this.entry = void 0),
        (this.exit = void 0),
        (this.parent = void 0),
        (this.machine = void 0),
        (this.meta = void 0),
        (this.output = void 0),
        (this.order = -1),
        (this.description = void 0),
        (this.tags = []),
        (this.transitions = void 0),
        (this.always = void 0),
        (this.parent = n._parent),
        (this.key = n._key),
        (this.machine = n._machine),
        (this.path = this.parent ? this.parent.path.concat(this.key) : []),
        (this.id = this.config.id || [this.machine.id, ...this.path].join(`.`)),
        (this.type =
          this.config.type ||
          (this.config.states && Object.keys(this.config.states).length
            ? `compound`
            : this.config.history
              ? `history`
              : `atomic`)),
        (this.description = this.config.description),
        (this.order = this.machine.idMap.size),
        this.machine.idMap.set(this.id, this),
        (this.states = this.config.states
          ? Qt(
              this.config.states,
              (t, n) =>
                new e(t, { _parent: this, _key: n, _machine: this.machine }),
            )
          : Kr),
        this.type === `compound` && !this.config.initial)
      )
        throw Error(
          `No initial state specified for compound state node "#${this.id}". Try adding { initial: "${Object.keys(this.states)[0]}" } to the state config.`,
        );
      ((this.history =
        this.config.history === !0 ? `shallow` : this.config.history || !1),
        (this.entry = en(this.config.entry).slice()),
        (this.exit = en(this.config.exit).slice()),
        (this.meta = this.config.meta),
        (this.output =
          this.type === `final` || !this.parent ? this.config.output : void 0),
        (this.tags = en(t.tags).slice()));
    }
    _initialize() {
      ((this.transitions = zn(this)),
        this.config.always &&
          (this.always = an(this.config.always).map((e) => Rn(this, ``, e))),
        Object.keys(this.states).forEach((e) => {
          this.states[e]._initialize();
        }));
    }
    get definition() {
      return {
        id: this.id,
        key: this.key,
        version: this.machine.version,
        type: this.type,
        initial: this.initial
          ? {
              target: this.initial.target,
              source: this,
              actions: this.initial.actions.map(qr),
              eventType: null,
              reenter: !1,
              toJSON: () => ({
                target: this.initial.target.map((e) => `#${e.id}`),
                source: `#${this.id}`,
                actions: this.initial.actions.map(qr),
                eventType: null,
              }),
            }
          : void 0,
        history: this.history,
        states: Qt(this.states, (e) => e.definition),
        on: this.on,
        transitions: [...this.transitions.values()]
          .flat()
          .map((e) => ({ ...e, actions: e.actions.map(qr) })),
        entry: this.entry.map(qr),
        exit: this.exit.map(qr),
        meta: this.meta,
        order: this.order || -1,
        output: this.output,
        invoke: this.invoke,
        description: this.description,
        tags: this.tags,
      };
    }
    toJSON() {
      return this.definition;
    }
    get invoke() {
      return Gr(this, `invoke`, () =>
        en(this.config.invoke).map((e, t) => {
          let { src: n, systemId: r } = e,
            i = e.id ?? cn(this.id, t),
            a = typeof n == `string` ? n : `xstate.invoke.${cn(this.id, t)}`;
          return {
            ...e,
            src: a,
            id: i,
            systemId: r,
            toJSON() {
              let { onDone: t, onError: n, ...r } = e;
              return { ...r, type: `xstate.invoke`, src: a, id: i };
            },
          };
        }),
      );
    }
    get on() {
      return Gr(this, `on`, () =>
        [...this.transitions]
          .flatMap(([e, t]) => t.map((t) => [e, t]))
          .reduce((e, [t, n]) => ((e[t] = e[t] || []), e[t].push(n), e), {}),
      );
    }
    get after() {
      return Gr(this, `delayedTransitions`, () => Ln(this));
    }
    get initial() {
      return Gr(this, `initial`, () => Bn(this, this.config.initial));
    }
    next(e, t) {
      let n = t.type,
        r = [],
        i,
        a = Gr(this, `candidates-${n}`, () => In(this, n));
      for (let o of a) {
        let { guard: a } = o,
          s = e.context,
          c = !1;
        try {
          c = !a || En(a, s, t, e);
        } catch (e) {
          let t =
            typeof a == `string` ? a : typeof a == `object` ? a.type : void 0;
          throw Error(
            `Unable to evaluate guard ${t ? `'${t}' ` : ``}in transition for event '${n}' in state node '${this.id}':\n${e.message}`,
          );
        }
        if (c) {
          (r.push(...o.actions), (i = o));
          break;
        }
      }
      return i ? [i] : void 0;
    }
    get events() {
      return Gr(this, `events`, () => {
        let { states: e } = this,
          t = new Set(this.ownEvents);
        if (e)
          for (let n of Object.keys(e)) {
            let r = e[n];
            if (r.states) for (let e of r.events) t.add(`${e}`);
          }
        return Array.from(t);
      });
    }
    get ownEvents() {
      let e = new Set(
        [...this.transitions.keys()].filter((e) =>
          this.transitions
            .get(e)
            .some((e) => !(!e.target && !e.actions.length && !e.reenter)),
        ),
      );
      return Array.from(e);
    }
  },
  Yr = class e {
    constructor(e, t) {
      ((this.config = e),
        (this.version = void 0),
        (this.schemas = void 0),
        (this.implementations = void 0),
        (this.__xstatenode = !0),
        (this.idMap = new Map()),
        (this.root = void 0),
        (this.id = void 0),
        (this.states = void 0),
        (this.events = void 0),
        (this.id = e.id || `(machine)`),
        (this.implementations = {
          actors: t?.actors ?? {},
          actions: t?.actions ?? {},
          delays: t?.delays ?? {},
          guards: t?.guards ?? {},
        }),
        (this.version = this.config.version),
        (this.schemas = this.config.schemas),
        (this.transition = this.transition.bind(this)),
        (this.getInitialSnapshot = this.getInitialSnapshot.bind(this)),
        (this.getPersistedSnapshot = this.getPersistedSnapshot.bind(this)),
        (this.restoreSnapshot = this.restoreSnapshot.bind(this)),
        (this.start = this.start.bind(this)),
        (this.root = new Jr(e, { _key: this.id, _machine: this })),
        this.root._initialize(),
        (this.states = this.root.states),
        (this.events = this.root.events));
    }
    provide(t) {
      let {
        actions: n,
        guards: r,
        actors: i,
        delays: a,
      } = this.implementations;
      return new e(this.config, {
        actions: { ...n, ...t.actions },
        guards: { ...r, ...t.guards },
        actors: { ...i, ...t.actors },
        delays: { ...a, ...t.delays },
      });
    }
    resolveState(e) {
      let t = Cr(this.root, e.value),
        n = An(Jn(this.root, t));
      return Ar(
        {
          _nodes: [...n],
          context: e.context || {},
          children: {},
          status: Pn(n, this.root) ? `done` : e.status || `active`,
          output: e.output,
          error: e.error,
          historyValue: e.historyValue,
        },
        this,
      );
    }
    transition(e, t, n) {
      return yr(e, t, n, []).snapshot;
    }
    microstep(e, t, n) {
      return yr(e, t, n, []).microstates;
    }
    getTransitionData(e, t) {
      return Qn(this.root, e.value, e, t) || [];
    }
    getPreInitialState(e, t, n) {
      let { context: r } = this.config,
        i = Ar(
          {
            context: typeof r != `function` && r ? r : {},
            _nodes: [this.root],
            children: {},
            status: `active`,
          },
          this,
        );
      return typeof r == `function`
        ? vr(
            i,
            t,
            e,
            [
              H(({ spawn: e, event: t, self: n }) =>
                r({ spawn: e, input: t.input, self: n }),
              ),
            ],
            n,
            void 0,
          )
        : i;
    }
    getInitialSnapshot(e, t) {
      let n = Gt(t),
        r = [],
        i = this.getPreInitialState(e, n, r),
        { snapshot: a } = yr(
          cr(
            [
              {
                target: [...Gn(this.root)],
                source: this.root,
                reenter: !0,
                actions: [],
                eventType: null,
                toJSON: null,
              },
            ],
            i,
            e,
            n,
            !0,
            r,
          ),
          n,
          e,
          r,
        );
      return a;
    }
    start(e) {
      Object.values(e.children).forEach((e) => {
        e.getSnapshot().status === `active` && e.start();
      });
    }
    getStateNodeById(e) {
      let t = Yt(e),
        n = t.slice(1),
        r = Fn(t[0]) ? t[0].slice(1) : t[0],
        i = this.idMap.get(r);
      if (!i)
        throw Error(
          `Child state node '#${r}' does not exist on machine '${this.id}'`,
        );
      return qn(i, n);
    }
    get definition() {
      return this.root.definition;
    }
    toJSON() {
      return this.definition;
    }
    getPersistedSnapshot(e, t) {
      return Nr(e, t);
    }
    restoreSnapshot(e, t) {
      let n = {},
        r = e.children;
      Object.keys(r).forEach((e) => {
        let i = r[e],
          a = i.snapshot,
          o = i.src,
          s = typeof o == `string` ? ln(this, o) : o;
        s &&
          (n[e] = gn(s, {
            id: e,
            parent: t.self,
            syncSnapshot: i.syncSnapshot,
            snapshot: a,
            src: o,
            systemId: i.systemId,
          }));
      });
      function i(e, t) {
        if (t instanceof Jr) return t;
        try {
          return e.machine.getStateNodeById(t.id);
        } catch {}
      }
      function a(e, t) {
        if (!t || typeof t != `object`) return {};
        let n = {};
        for (let r in t) {
          let a = t[r];
          for (let t of a) {
            let a = i(e, t);
            a && ((n[r] ??= []), n[r].push(a));
          }
        }
        return n;
      }
      let o = a(this.root, e.historyValue),
        s = Ar(
          {
            ...e,
            children: n,
            _nodes: Array.from(An(Jn(this.root, e.value))),
            historyValue: o,
          },
          this,
        ),
        c = new Set();
      function l(e, t) {
        if (!c.has(e))
          for (let n in (c.add(e), e)) {
            let r = e[n];
            if (r && typeof r == `object`) {
              if (`xstate$$type` in r && r.xstate$$type === 1) {
                e[n] = t[r.id];
                continue;
              }
              l(r, t);
            }
          }
      }
      return (l(s.context, n), s);
    }
  };
function Xr(e, t, n, r, { event: i }) {
  return [t, { event: typeof i == `function` ? i(n, r) : i }, void 0];
}
function Zr(e, { event: t }) {
  e.defer(() => e.emit(t));
}
function Qr(e) {
  function t(e, t) {}
  return (
    (t.type = `xstate.emit`),
    (t.event = e),
    (t.resolve = Xr),
    (t.execute = Zr),
    t
  );
}
var $r = (function (e) {
  return ((e.Parent = `#_parent`), (e.Internal = `#_internal`), e);
})({});
function ei(e, t, n, r, { to: i, event: a, id: o, delay: s }, c) {
  let l = t.machine.implementations.delays;
  if (typeof a == `string`)
    throw Error(
      `Only event objects may be used with sendTo; use sendTo({ type: "${a}" }) instead`,
    );
  let u = typeof a == `function` ? a(n, r) : a,
    d;
  if (typeof s == `string`) {
    let e = l && l[s];
    d = typeof e == `function` ? e(n, r) : e;
  } else d = typeof s == `function` ? s(n, r) : s;
  let f = typeof i == `function` ? i(n, r) : i,
    p;
  if (typeof f == `string`) {
    if (
      ((p =
        f === $r.Parent
          ? e.self._parent
          : f === $r.Internal
            ? e.self
            : f.startsWith(`#_`)
              ? t.children[f.slice(2)]
              : c.deferredActorIds?.includes(f)
                ? f
                : t.children[f]),
      !p)
    )
      throw Error(
        `Unable to send event to actor '${f}' from machine '${t.machine.id}'.`,
      );
  } else p = f || e.self;
  return [
    t,
    {
      to: p,
      targetId: typeof f == `string` ? f : void 0,
      event: u,
      id: o,
      delay: d,
    },
    void 0,
  ];
}
function ti(e, t, n) {
  typeof n.to == `string` && (n.to = t.children[n.to]);
}
function ni(e, t) {
  e.defer(() => {
    let { to: n, event: r, delay: i, id: a } = t;
    if (typeof i == `number`) {
      e.system.scheduler.schedule(e.self, n, r, i, a);
      return;
    }
    e.system._relay(
      e.self,
      n,
      r.type === `xstate.error` ? Wt(e.self.id, r.data) : r,
    );
  });
}
function ri(e, t, n) {
  function r(e, t) {}
  return (
    (r.type = `xstate.sendTo`),
    (r.to = e),
    (r.event = t),
    (r.id = n?.id),
    (r.delay = n?.delay),
    (r.resolve = ei),
    (r.retryResolve = ti),
    (r.execute = ni),
    r
  );
}
function ii(e, t) {
  return ri($r.Parent, e, t);
}
function ai(e, t, n, r, { collect: i }) {
  let a = [],
    o = function (e) {
      a.push(e);
    };
  return (
    (o.assign = (...e) => {
      a.push(H(...e));
    }),
    (o.cancel = (...e) => {
      a.push(yn(...e));
    }),
    (o.raise = (...e) => {
      a.push(Lr(...e));
    }),
    (o.sendTo = (...e) => {
      a.push(ri(...e));
    }),
    (o.sendParent = (...e) => {
      a.push(ii(...e));
    }),
    (o.spawnChild = (...e) => {
      a.push(Sn(...e));
    }),
    (o.stopChild = (...e) => {
      a.push(Tn(...e));
    }),
    (o.emit = (...e) => {
      a.push(Qr(...e));
    }),
    i(
      {
        context: n.context,
        event: n.event,
        enqueue: o,
        check: (e) => En(e, t.context, n.event, t),
        self: e.self,
        system: e.system,
      },
      r,
    ),
    [t, void 0, a]
  );
}
function oi(e) {
  function t(e, t) {}
  return (
    (t.type = `xstate.enqueueActions`),
    (t.collect = e),
    (t.resolve = ai),
    t
  );
}
function si(e, t, n, r, { value: i, label: a }) {
  return [t, { value: typeof i == `function` ? i(n, r) : i, label: a }, void 0];
}
function ci({ logger: e }, { value: t, label: n }) {
  n ? e(n, t) : e(t);
}
function li(e = ({ context: e, event: t }) => ({ context: e, event: t }), t) {
  function n(e, t) {}
  return (
    (n.type = `xstate.log`),
    (n.value = e),
    (n.label = t),
    (n.resolve = si),
    (n.execute = ci),
    n
  );
}
function ui(e, t) {
  return new Yr(e, t);
}
function di({ schemas: e, actors: t, actions: n, guards: r, delays: i }) {
  return {
    createMachine: (a) =>
      ui({ ...a, schemas: e }, { actors: t, actions: n, guards: r, delays: i }),
  };
}
const fi = [
  z.Success,
  z.NeedsIntermediateAction,
  z.ElementHidden,
  z.ElementNotInteractive,
  z.ScoreTooLow,
];
let pi = (function (e) {
  return (
    (e.NoAutomation = `noAutomation`),
    (e.Queued = `queued`),
    (e.Pending = `pending`),
    (e.PendingHalfway = `pendingHalfway`),
    (e.InProgress = `inProgress`),
    (e.Exception = `exception`),
    (e.Done = `done`),
    (e.CustomAgent = `customAgent`),
    e
  );
})({});
var mi = t($e(), 1),
  hi = {},
  gi = (0, mi.default)(() => {
    let e = hi;
    ((hi = {}),
      M.user &&
        P(M.user)
          .trackEvents(e)
          .catch((t) => {
            L(t, { extra: { input: JSON.stringify(e) } });
          }));
  }, 500);
const _i = (e) => {
    (e.stepTrackingEvents &&
      (hi.stepTrackingEvents = (hi.stepTrackingEvents || []).concat(
        e.stepTrackingEvents,
      )),
      e.workflowTrackingEvents &&
        (hi.workflowTrackingEvents = (hi.workflowTrackingEvents || []).concat(
          e.workflowTrackingEvents,
        )),
      e.policyTrackingEvents &&
        (hi.policyTrackingEvents = (hi.policyTrackingEvents || []).concat(
          e.policyTrackingEvents,
        )),
      e.exceptionResolutionTrackingEvents &&
        (hi.exceptionResolutionTrackingEvents = (
          hi.exceptionResolutionTrackingEvents || []
        ).concat(e.exceptionResolutionTrackingEvents)),
      gi());
  },
  vi = (e) =>
    !!e &&
    !Number.isNaN(e.x) &&
    !Number.isNaN(e.y) &&
    !Number.isNaN(e.height) &&
    !Number.isNaN(e.width);
async function yi(e) {
  return (await fetch(e)).blob();
}
const bi = async (e, t) => {
    let n = new File([e], `blob`, { type: e.type });
    if (!t || (!t.includes(`https://`) && !t.includes(`http://localhost`)))
      throw Error(`Incorrect fetchUrl given`);
    if (e.size < 500)
      throw Error(`Trying to upload screenshot but blob is empty`);
    let r = await fetch(t, {
      method: `PUT`,
      body: n,
      headers: { "Content-Type": n.type },
    });
    if (!r.ok) {
      let e = new Si(
        `Uploading screenshot resulted in unexpected server response: ${r.statusText} (${r.status})`,
      );
      try {
        e.responseBody = await r.text();
      } catch {}
      throw e;
    }
    return r;
  },
  xi = (e) => (e.type.endsWith(`png`) ? `png` : `jpg`);
var Si = class extends Error {
  constructor(...e) {
    (super(...e), R(this, `responseBody`, void 0));
  }
};
const Ci = async (e, t) => {
    let n = M.user;
    if (!n) return;
    let r = P(n),
      i = e
        .filter((e) => t.includes(e.id))
        .map((e) =>
          r.updateExceptionResolutionAction({
            id: e.id,
            titleDetails: e.titleDetails,
          }),
        );
    try {
      await Promise.all(i);
    } catch (e) {
      let t = e,
        n = Error(`Error processing agent fixes inputs: ${t.message}`);
      reportError(n);
    }
  },
  wi = async (e) => {
    let t = M.user;
    if (!t) return;
    let n = P(t),
      r = e.actions
        ?.map((e, t) => ({
          ...e,
          screenshot: e.screenshot?.sourcePath ? { ...e.screenshot } : void 0,
          index: t,
        }))
        ?.reduce(
          (e, t, n) => {
            let { titleDetails: r, ...i } = t;
            return (
              t.action === `type`
                ? (e.actionsPayload.push({ ...i }),
                  e.titleDetailsPayload.push({
                    titleDetails: t.titleDetails,
                    index: n,
                  }))
                : e.actionsPayload.push({ ...i, titleDetails: t.titleDetails }),
              e
            );
          },
          { actionsPayload: [], titleDetailsPayload: [] },
        ) || { actionsPayload: [], titleDetailsPayload: [] },
      i = r.actionsPayload,
      a = r.titleDetailsPayload;
    try {
      let t = await n.createExceptionResolution({
        workflowId: e.workflowId,
        contentBlockId: e.contentBlockId,
        actions: i,
        traceId: e.traceId ?? void 0,
        userId: e.userId,
        sessionId: e.sessionId,
      });
      if (
        (t.actions &&
          [...t.actions]
            .sort((e, t) => e.index - t.index)
            .forEach((e) => {
              let t = a.find((t) => t.index === e.index)?.titleDetails;
              t &&
                Oh()?.send({
                  type: `setPendingAgentFixesInput`,
                  input: { id: e.id, label: e.reason, titleDetails: t },
                });
            }),
        _i({
          exceptionResolutionTrackingEvents: [
            {
              resolutionId: t.id,
              contentBlockId: e.contentBlockId,
              workflowId: e.workflowId,
              eventType: T.ExceptionResolutionCompleted,
              eventTimestamp: new Date().toISOString(),
              sessionId: e.sessionId,
              trackingId: e.userId,
              userId: e.userId,
              workspaceId: M.user?.currentWorkspaceId,
            },
          ],
        }),
        !e.actions || !t.actions)
      ) {
        reportError(Error(`No actions found in exception resolution`));
        return;
      }
      let r = e.actions.map(async (r, i) => {
        let a = t.actions?.[i]?.id;
        if (!r.screenshot?.url || !a || r.screenshot.sourcePath) return;
        let o = await yi(r.screenshot.url),
          s = await createImageBitmap(o),
          c = r.screenshot.bounds;
        c && !vi(c) && (c = null);
        let l = {
          url: void 0,
          bounds: c ? { ...c, draw: !0 } : void 0,
          pixelWidth: s.width,
          pixelHeight: s.height,
          pixelRatio: r.screenshot.pixelRatio,
          fileType: `jpeg`,
          zoomLevel: 1.5,
        };
        s.close();
        let u = await n.getResolutionScreenshotPresignedURLs({
          fileType: `jpeg`,
          resolutionActionId: a,
          stepId: e.contentBlockId,
          workflowId: e.workflowId,
        });
        if (u.sourcePathPresignedURL && u.deliveryPathPresignedURL)
          try {
            (await bi(o, u.sourcePathPresignedURL),
              await bi(o, u.deliveryPathPresignedURL),
              await n.updateExceptionResolutionAction({
                id: a,
                screenshot: {
                  ...l,
                  deliveryPath: u.deliveryPath,
                  sourcePath: u.sourcePath,
                },
              }));
          } catch (e) {
            let t = e,
              n = Error(
                `Error updating exception resolution action with screenshot: ${t.message}`,
              );
            reportError(n);
            return;
          }
      });
      await Promise.all(r);
    } catch (e) {
      let t = e,
        n = Error(`Error creating exception resolution: ${t.message}`);
      reportError(n);
      return;
    }
  },
  Ti = (e) => {
    let t = pt(e, nt(e), { isAutomatedWorkflow: !0 });
    if (!t) return null;
    let n = t?.specificValue;
    return {
      template: t?.template,
      variables: [
        {
          name: t?.name ?? ft.FlexibleStep,
          currentSetting: t.setting,
          genericValue: t.genericValue,
          specificValue: n,
          capturedValue: n,
        },
      ],
    };
  },
  Ei = async (e, t, n) => {
    let r = ot(e).label,
      i = await rt(e),
      a = Ti(e),
      { cssSelectorGenerationTimedOut: o, ...s } = i,
      c = await Ue({ name: d.TakeAgentFixScreenshot });
    await xa({
      type: `setPendingAgentFix`,
      agentFix: {
        sessionId: t.sessionId,
        workflowId: t.workflowId,
        contentBlockId: t.contentBlockId,
        userId: t.userId,
        traceId: t.traceId,
        actions: [
          {
            index: 0,
            action: n,
            reason: t.helpfulInstruction ?? ``,
            contentBlockId: t.contentBlockId,
            completesStep: !!t.nextStepId,
            targetDetails: {
              ...s,
              computedLabels: [],
              eventType: n,
              selectedLabel: { label: r, type: n },
            },
            titleDetails: a,
            screenshot: {
              bounds: mt(i.bounds),
              pixelRatio: window.devicePixelRatio,
              url: c,
            },
          },
        ],
      },
    });
  },
  Di = (e, t, n, r) => {
    let i = e.find((e) => e.contentBlockId === n);
    if (!i || !i.actions?.[0]) return t;
    let a = [...i.actions].sort((e, t) => e.index - t.index),
      o = a.find((e) => !t.includes(e.id));
    return (
      (!o || a.length - 1 === t.length) &&
        _i({
          exceptionResolutionTrackingEvents: [
            {
              resolutionId: i.id,
              contentBlockId: i.contentBlockId,
              workflowId: i.workflowId,
              eventType: T.ExceptionResolutionCompleted,
              eventTimestamp: new Date().toISOString(),
              sessionId: r,
              trackingId: M.user?.id,
              userId: M.user?.id,
              workspaceId: M.user?.currentWorkspaceId,
            },
          ],
        }),
      o ? [...t, o.id] : t
    );
  },
  Oi = (e, t, n, r) => {
    let i = e.actions?.[0];
    if (!i) return t;
    let a = n.find((t) => t.contentBlockId === e.contentBlockId),
      o = t.find((t) => t.contentBlockId === e.contentBlockId),
      s = !!o,
      c = o?.actions?.[(o.actions?.length || 0) - 1],
      l = i.action === c?.action && i.reason === c?.reason,
      u = [];
    if (a && !s) {
      let n = a.actions?.every((e) => r.includes(e.id)),
        o = a.actions?.some((e) => r.includes(e.id));
      if (a.actions?.every((e) => !r.includes(e.id))) return [...t, e];
      let s = [...(a.actions || [])].sort((e, t) => e.index - t.index);
      switch (!0) {
        case n:
          u = s?.map((e) => {
            let { id: t, contentBlock: n, targetDetails: r, ...i } = e,
              { userAction: a, ...o } = r;
            return { ...i, contentBlockId: n?.id, targetDetails: { ...o } };
          });
          break;
        case o:
          u = s
            ?.filter((e) => r.includes(e.id))
            .map((e) => {
              let { id: t, contentBlock: n, targetDetails: r, ...i } = e,
                { userAction: a, ...o } = r;
              return { ...i, contentBlockId: n?.id, targetDetails: { ...o } };
            });
          break;
      }
      return [...t, { ...e, actions: [...u, i] }];
    }
    return s && l
      ? t
      : s
        ? t.map((t) =>
            t.contentBlockId === e.contentBlockId
              ? { ...t, actions: [...(t.actions || []), i] }
              : t,
          )
        : [...t, e];
  },
  ki = (e, t, n) => {
    if (!t) return e;
    let r = e.findIndex((e) => e.contentBlockId === t);
    if (r === -1) return e;
    let i = e[r];
    if (!i) return e;
    let a = i.actions;
    if (!a || a.length === 0) return e;
    let o = a.length - 1,
      s = a[o];
    if (!s) return e;
    let c = [...a];
    c[o] = { ...s, titleDetails: n };
    let l = { ...i, actions: c },
      u = [...e];
    return ((u[r] = l), u);
  },
  Ai = (e) =>
    e.automation === a.Manual
      ? !1
      : e.automation === a.Automated ||
          e.eventType === `combobox` ||
          e.eventType === `singleOption`
        ? !0
        : !(
            e.isFlexible ||
            !e.targetDetails ||
            !(e.eventType === `click` || e.eventType === `input`) ||
            (e.eventType === `input` && e.titleDetails == null) ||
            (Fi(e.titleDetails) && !e.referencedField)
          ),
  ji = async (e) => {
    if (e.referencedField?.id) {
      let t = await Ue({ name: d.GetSessionWorkflowFields });
      if (!t) return null;
      let n = t.sessionWorkflowFields.find(
          (t) => t.id === e.referencedField?.id,
        ),
        r = ht(e.titleDetails?.variables?.[0]?.specificValue || ``),
        i = Ni(n?.value ?? ``);
      return i.length && r ? i + r : i;
    }
    let t =
      e.titleDetails?.variables.find(
        (e) =>
          e.name === `textInput` ||
          e.name === `comboboxOption` ||
          e.name === `singleOption`,
      )?.specificValue ?? ``;
    return t.trim() === `` ? null : Ni(t);
  },
  Mi = (e) =>
    !e.referencedField?.id || !e.referencedField.required
      ? !1
      : !(Object.values(M.sessionWorkflowFields) ?? []).find(
          (t) => t.id === e.referencedField?.id,
        );
var Ni = (e) => e.replace(/\u00A0/g, ` `);
const Pi = () => {
  N({ sessionWorkflowFields: {} });
};
var Fi = (e) => e?.variables?.[0]?.currentSetting === _.Generic;
const Ii = (e, t) =>
    t.find((t) => (ye(t) ? t.originatedFields?.some((t) => t.id === e) : !1)),
  Li = (e, t) => t.find((t) => t.id === e)?.method === ee.MANUAL,
  Ri = ({ step: e, completedBlocks: t, contentBlocks: n }) => {
    if (!e.referencedField?.id || e.referencedField.required) return !1;
    let r = (M.sessionWorkflowFields ?? {})[e.referencedField.id];
    if (Ni(r?.value ?? ``).trim()) return !1;
    let i = Ii(e.referencedField.id, n);
    return i ? Li(i.id, t) : !1;
  };
function zi(e) {
  if (!e || !(`stepIndex` in e)) return null;
  if (`children` in e && Array.isArray(e.children) && e.children.length > 0) {
    let t = e.children[0];
    if (t && `stepIndex` in t && typeof t.stepIndex == `number`)
      return t.stepIndex;
  }
  return typeof e.stepIndex == `number` ? e.stepIndex : null;
}
function U(e) {
  return !(`transitions` in e) || !Array.isArray(e.transitions)
    ? []
    : [...e.transitions]
        .filter((e) => e.event === v.BlockCompleted)
        .sort((e, t) => (e.order ?? 0) - (t.order ?? 0));
}
function Bi(e) {
  return Number.isFinite(e.index) ? e.index : 0;
}
function Vi(e, t) {
  return Bi(e.block) - Bi(t.block) || e.ordinal - t.ordinal;
}
function Hi(e) {
  if (e.length <= 1) return [...e];
  let t = e.map((e, t) => ({ block: e, ordinal: t })),
    n = new Map(t.map(({ block: e }) => [e.id, e])),
    r = new Map(),
    i = new Map(t.map(({ block: e }) => [e.id, 0])),
    a = new Map(t.map(({ block: e }) => [e.id, []])),
    o = new Map(t.map(({ block: e }) => [e.id, new Set()]));
  for (let t of e)
    if ((r.set(t.id, t.id), `children` in t && Array.isArray(t.children)))
      for (let e of t.children) r.set(e.id, t.id);
  for (let t of e) {
    let e = t.id,
      n = [t];
    `children` in t && Array.isArray(t.children) && n.push(...t.children);
    for (let t of n)
      for (let n of U(t)) {
        let t = n.toId;
        if (!t) continue;
        let s = r.get(t);
        if (!s || e === s) continue;
        let c = o.get(e);
        c.has(s) || (c.add(s), a.get(e).push(s), i.set(s, (i.get(s) ?? 0) + 1));
      }
  }
  let s = [],
    c = new Set(),
    l = (e) => {
      if (c.has(e) || (i.get(e) ?? 0) > 0) return;
      c.add(e);
      let t = n.get(e);
      t && s.push(t);
      for (let t of a.get(e) ?? []) (i.set(t, (i.get(t) ?? 1) - 1), l(t));
    },
    u = t.filter(({ block: e }) => (i.get(e.id) ?? 0) === 0).sort(Vi);
  for (let { block: e } of u) l(e.id);
  let d = [...t].sort(Vi);
  for (let { block: e } of d) c.has(e.id) || (c.add(e.id), s.push(e));
  return s;
}
function Ui(e, t) {
  let n = U(e);
  if (n.length <= 1) return null;
  let r = [];
  for (let e of n) {
    let n = [],
      i = e.toId ?? null,
      a = new Set();
    for (; i && !a.has(i); ) {
      (a.add(i), n.push(i));
      let e = t.get(i);
      if (!e) break;
      let r = U(e)[0];
      i = r ? (r.toId ?? null) : null;
    }
    r.push(n);
  }
  let i = r.filter((e) => e.length > 0);
  if (i.length < 2) return null;
  let a = new Map();
  for (let e of i) for (let t of e) a.set(t, (a.get(t) ?? 0) + 1);
  let o = new Set();
  for (let [e, t] of a) t > 1 && o.add(e);
  if (o.size === 0) return null;
  let s = i[0];
  for (let e of s) if (o.has(e)) return t.get(e) ?? null;
  return null;
}
function Wi(e, t, n, r) {
  let i = U(e)[t];
  if (!i) return [];
  let a = [],
    o = new Set(),
    s = i.toId ?? null;
  for (; s && !o.has(s) && !(r && s === r); ) {
    o.add(s);
    let e = n.get(s);
    if (!e) break;
    a.push(e);
    let t = U(e)[0];
    s = t ? (t.toId ?? null) : null;
  }
  return a;
}
function Gi(e, t = {}) {
  let n = Ji(e);
  return e.contentBlocks
    .filter((e) => e.type === D.BranchPoint)
    .map((e) => {
      let r = U(e),
        i = Ui(e, n)?.id ?? null,
        a = r.map((t, r) => {
          let a = !(i && Ki(e, r, n, i)) && qi(e, r, n);
          return {
            id: `${e.id}-transition-${r}`,
            name: t.name || `Path ${r + 1}`,
            description: t.description ?? null,
            transitionIndex: r,
            endsProcess: a,
          };
        }),
        o = t[e.id],
        s = o ? a.find((e) => e.id === o) : a[0],
        c = s?.id ?? a[0]?.id ?? ``,
        l = s?.transitionIndex ?? 0,
        u = r[l],
        d = zi(u?.toId ? n.get(u.toId) : null) ?? e.index + 1;
      return {
        id: e.id,
        contentBlockId: e.id,
        branchPointIndex: d,
        branches: a,
        activeBranchId: c,
        activeBranchTransitionIndex: l,
        rejoinBlockId: i,
      };
    });
}
function Ki(e, t, n, r) {
  let i = U(e)[t];
  if (!i?.toId) return !1;
  let a = i.toId,
    o = new Set();
  for (; a && !o.has(a); ) {
    if (a === r) return !0;
    o.add(a);
    let e = n.get(a);
    if (!e) break;
    let t = U(e)[0];
    a = t ? (t.toId ?? null) : null;
  }
  return !1;
}
function qi(e, t, n) {
  let r = U(e)[t];
  if (!r?.toId) return !0;
  let i = Wi(e, t, n, null);
  if (i.length === 0) {
    let e = n.get(r.toId);
    if (!e) return !0;
    let t = U(e);
    return t.length === 0 || !t[0]?.toId;
  }
  let a = i[i.length - 1];
  if (!a) return !0;
  let o = U(a);
  return o.length === 0 || !o[0]?.toId;
}
function Ji(e) {
  let t = new Map();
  for (let n of e.contentBlocks)
    if ((t.set(n.id, n), `children` in n && Array.isArray(n.children)))
      for (let e of n.children) t.set(e.id, e);
  return t;
}
function Yi(e, t) {
  let n = new Set(),
    r = t.get(e.contentBlockId);
  if (!r) return n;
  let i = U(r);
  for (let a = 0; a < i.length; a++) {
    let i = Wi(r, a, t, e.rejoinBlockId);
    for (let e of i) n.add(e.id);
  }
  return n;
}
function Xi(e, t) {
  let n = t.get(e.contentBlockId);
  return n ? Wi(n, e.activeBranchTransitionIndex, t, e.rejoinBlockId) : [];
}
function Zi({ workflow: e, branchPoints: t }) {
  let n = Ji(e),
    r = new Map(t.map((e) => [e.contentBlockId, e]));
  if (e.contentBlocks.length === 0) return [];
  let i = [],
    a = new Set(),
    o = e.contentBlocks[0];
  for (; o && !a.has(o.id); ) {
    (a.add(o.id), i.push(o));
    let e = r.get(o.id);
    if (e) {
      let t = Wi(o, e.activeBranchTransitionIndex, n, e.rejoinBlockId);
      for (let e of t) a.has(e.id) || (a.add(e.id), i.push(e));
      if (e.branches[e.activeBranchTransitionIndex]?.endsProcess) break;
      if (e.rejoinBlockId) {
        o = n.get(e.rejoinBlockId);
        continue;
      }
      break;
    }
    let t = U(o)[0];
    o = t?.toId ? n.get(t.toId) : void 0;
  }
  return i;
}
function Qi({ activePathBlocks: e }) {
  let t = new Map(),
    n = 0;
  for (let r of e) r.type === D.Step && (n++, t.set(r.id, n));
  return t;
}
function $i({ workflow: e, branchPoints: t }) {
  let n = Ji(e),
    r = Zi({ workflow: e, branchPoints: t }),
    i = Qi({ activePathBlocks: r }),
    a = new Set(r.map((e) => e.id)),
    o = new Map();
  for (let e of t) {
    let t = n.get(e.contentBlockId);
    if (!t) continue;
    let r = U(t);
    for (let i = 0; i < r.length; i++) {
      let r = Wi(t, i, n, e.rejoinBlockId);
      for (let t of r) o.set(t.id, e.contentBlockId);
    }
  }
  let s = new Map();
  for (let e of t) {
    let t = 0;
    for (let n of r) {
      if (n.id === e.contentBlockId) break;
      let r = i.get(n.id);
      r != null && (t = r);
    }
    s.set(e.contentBlockId, t);
  }
  return e.contentBlocks.map((e) => {
    let t = `branchId` in e ? (e.branchId ?? null) : null,
      n = `stepOrder` in e ? (e.stepOrder ?? null) : null,
      r = null;
    if (e.type === D.Step) {
      if (i.has(e.id)) r = i.get(e.id);
      else if (!a.has(e.id) && n != null) {
        let t = o.get(e.id);
        r = (t ? (s.get(t) ?? 0) : 0) + n;
      }
    }
    let c = (`title` in e && e.title) || (`text` in e && e.text) || null;
    return {
      id: e.id,
      name: typeof c == `string` ? c : null,
      type: e.type,
      branchId: t,
      stepOrder: n,
      stepDepth: r,
    };
  });
}
const ea = (e) => {
  let t = e?.targetDetails;
  if (!t || t.tag.toLowerCase() !== `input`) return !1;
  try {
    return JSON.parse(t.attributes || `{}`).type === `file`;
  } catch {
    return !1;
  }
};
var ta = class e {
  constructor() {
    (R(this, `pendingRequestsByTab`, new Map()),
      R(this, `handleBeforeRequest`, (t) => {
        if (this.shouldIgnoreRequest(t)) return;
        this.pendingRequestsByTab.has(t.tabId) ||
          this.pendingRequestsByTab.set(t.tabId, new Map());
        let n = this.pendingRequestsByTab.get(t.tabId),
          r = setTimeout(() => {
            this.clearRequest(t.tabId, t.requestId);
          }, e.REQUEST_TIMEOUT_MS);
        n.set(t.requestId, r);
      }),
      R(this, `handleRequestFinished`, (e) => {
        this.shouldIgnoreRequest(e) || this.clearRequest(e.tabId, e.requestId);
      }));
  }
  shouldIgnoreRequest(e) {
    return !!(/^(chrome-extension|data):\/\//.test(e.url) || e.tabId === -1);
  }
  clearRequest(e, t) {
    let n = this.pendingRequestsByTab.get(e);
    if (!n) return;
    let r = n.get(t);
    (r && clearTimeout(r),
      n.delete(t),
      n.size === 0 && this.pendingRequestsByTab.delete(e));
  }
  start() {
    this.pendingRequestsByTab.clear();
    let e = {
      urls: [`<all_urls>`],
      types: [`main_frame`, `other`, `xmlhttprequest`, `script`],
    };
    (chrome.webRequest.onBeforeRequest.addListener(this.handleBeforeRequest, e),
      chrome.webRequest.onCompleted.addListener(this.handleRequestFinished, e),
      chrome.webRequest.onErrorOccurred.addListener(
        this.handleRequestFinished,
        e,
      ));
  }
  stop() {
    for (let [, e] of this.pendingRequestsByTab)
      for (let t of e.values()) clearTimeout(t);
    (this.pendingRequestsByTab.clear(),
      chrome.webRequest.onBeforeRequest.removeListener(
        this.handleBeforeRequest,
      ),
      chrome.webRequest.onCompleted.removeListener(this.handleRequestFinished),
      chrome.webRequest.onErrorOccurred.removeListener(
        this.handleRequestFinished,
      ));
  }
  waitForIdle(e, t) {
    return new Promise((n) => {
      let r = () => {
          clearTimeout(a);
        },
        i = () => {
          let o = this.pendingRequestsByTab.get(e);
          !o || o.size === 0 ? (r(), n()) : (a = setTimeout(i, t));
        },
        a = setTimeout(i, t);
    });
  }
  isTabIdle(e) {
    let t = this.pendingRequestsByTab.get(e);
    return !t || t.size === 0;
  }
};
R(ta, `REQUEST_TIMEOUT_MS`, 5e3);
var na = null;
const ra = () => {
    na || ((na = new ta()), na.start());
  },
  ia = () => (ra(), na);
var aa = 5e3;
const oa = async (e) =>
    e.status === `complete`
      ? e
      : new Promise((t) => {
          let n = e.id,
            r = setTimeout(() => {
              (chrome.tabs.onUpdated.removeListener(i), t(e));
            }, aa),
            i = (e, a, o) => {
              e === n &&
                a.status === `complete` &&
                (clearTimeout(r),
                chrome.tabs.onUpdated.removeListener(i),
                t(o));
            };
          chrome.tabs.onUpdated.addListener(i);
        }),
  sa = async ({ input: e, signal: t }) => {
    (ra(),
      e.messages.length > 1 &&
        (I(`Waiting before taking next action`), await ut(1e3)));
    let n = await ua(e.windowId);
    await oa(n);
    let r = ia();
    n.id &&
      !r.isTabIdle(n.id) &&
      (I(`[AGENT] Waiting for tab to be idle`), await r.waitForIdle(n.id, 1e3));
    let i = ``;
    if (Ne(n))
      try {
        i = await Ve(n.id, {
          name: d.GenerateSimplifiedDom,
          includeClasses: !0,
        });
      } catch {
        await ut(1e3);
        try {
          i = await Ve(n.id, {
            name: d.GenerateSimplifiedDom,
            includeClasses: !0,
          });
        } catch (e) {
          throw Error(`Failed to generate simplified DOM`, { cause: e });
        }
      }
    let a = ``;
    try {
      a = (await da(n.windowId)) ?? ``;
    } catch (e) {
      console.warn(`Failed to take screenshot`, e);
    }
    let { messages: o, sessionId: s } = e,
      c = (await chrome.tabs.query({ windowId: n.windowId }))
        .filter((e) => e.id != null)
        .filter(Ne),
      l = c.find((t) => t.id === e.initialTabId)?.id ?? null,
      u = o.filter((e) => e.type !== `fetchError`);
    u.push({
      type: `userState`,
      pageContents: i,
      screenshot: a,
      activeTabId: n.id,
      initialTabId: l,
      tabs: c.map((e) => ({
        id: e.id,
        title: e.title ?? ``,
        url: e.pendingUrl ?? e.url ?? ``,
      })),
    });
    let f = {
        messages: u,
        metadata: { guidanceSessionId: s, simplifiedDomVersion: 6 },
        traceId: s,
        model: e.model,
      },
      p = JSON.stringify(f),
      m = await fetch(`${ze.webUrl}api/agent-actions/generate`, {
        method: `POST`,
        headers: {
          "Content-Type": `application/json`,
          "x-tango-platform": `extension@${ce}`,
        },
        body: p,
        signal: t,
      });
    if (!m.ok) {
      let e = `HTTP error! status: ${m.status} ${m.statusText}`;
      try {
        let t = await m.json();
        if (t.error) {
          let n = t.details?.issues?.[0]?.message;
          n && (e = n);
        }
      } catch {}
      throw Error(e);
    }
    return await m.json();
  },
  ca = async ({ input: e }) => {
    ra();
    let { message: t } = e;
    if (!t || t.type !== `assistant`) throw Error(`No message to execute?`);
    let n = await ua(e.windowId);
    if (
      (M.openTabId !== n.id &&
        console.warn(
          `[AGENT] Received agent action for a different tab than the one that is open`,
        ),
      I(`Received agent action:`, t),
      t.action === `click` || t.action === `input_text`)
    ) {
      if (!t.elementId) throw Error(`No elementId to click`);
      try {
        let e = await Promise.race([
          Ve(n.id, {
            name: d.InteractWithSimplifiedDom,
            elementId: t.elementId,
            action: t.action,
            text: t.action === `input_text` ? t.textToType : null,
            clearExisting: t.action === `input_text` ? t.clearExisting : void 0,
          }),
          ut(2e3),
        ]);
        if (!e) throw Error(`element not found in the tab`);
        return t.action === `click`
          ? { content: `Clicked on ${e.title}` }
          : { content: `Typed "${t.textToType}" into ${e.title}` };
      } catch (e) {
        throw Error(`Failed to interact with element`, { cause: e });
      }
    }
    if (t.action === `scroll`) {
      let e = await Promise.race([
        Ve(n.id, {
          name: d.InteractWithSimplifiedDom,
          action: `scroll`,
          direction: t.direction,
        }),
        ut(2e3),
      ]);
      if (e?.scrolled == null) throw Error(`Failed to scroll`);
      return {
        content: e.scrolled
          ? `Scrolled ${t.direction}`
          : `Scrolled to ${t.direction === `down` ? `bottom` : `top`} already, no more scrolling`,
      };
    }
    if (t.action === `wait`) {
      let e = t.seconds ?? 1;
      return (await ut(e * 1e3), { content: `Waited for ${e} seconds` });
    }
    if (t.action === `switch_tab`) {
      if (!t.tabId) throw Error(`No tabId to switch to`);
      let e = await chrome.tabs.get(t.tabId);
      if (!e) throw Error(`Tab ${t.tabId} not found`);
      return (
        await chrome.tabs.update(t.tabId, { active: !0 }),
        { content: `Switched to tab ${e.id}: ${e.url}` }
      );
    }
    if (t.action === `go_back`)
      try {
        if (!n.id) throw Error(`No tab id to go back to`);
        return (
          await Ve(n.id, {
            name: d.InteractWithSimplifiedDom,
            action: `go_back`,
          }),
          { content: `Navigated back` }
        );
      } catch (e) {
        throw Error(`Failed to navigate back: ${e.message}`, { cause: e });
      }
    if (t.action === `go_to_url`)
      try {
        return t.newTab
          ? (await chrome.tabs.create({
              url: t.url,
              active: !0,
              windowId: n.windowId,
            }),
            { content: `Opened new tab with URL: ${t.url}` })
          : (await chrome.tabs.update(n.id, { url: t.url }),
            { content: `Navigated to ${t.url}` });
      } catch (e) {
        throw Error(`Failed to navigate to ${t.url}: ${e.message}`, {
          cause: e,
        });
      }
    if (t.action === `done`) return { action: `done`, content: `` };
    throw Error(`Unknown action: ${JSON.stringify(t)}`);
  },
  la = (e, t) => [...e.agentActionMessages, t];
var ua = async (e) => {
    if (!e) throw Error(`No windowId provided`);
    let [t] = await chrome.tabs.query({ windowId: e, active: !0 });
    if (!t?.id) throw Error(`No active tab found`);
    return t;
  },
  da = async (e) => {
    try {
      return await chrome.tabs.captureVisibleTab(e, {
        format: `jpeg`,
        quality: 75,
      });
    } catch (e) {
      console.error(`[AGENT] Error taking screenshot:`, e);
      return;
    }
  };
const fa = ({
    branchId: e,
    branchPointId: t,
    branchPoints: n,
    workflow: r,
  }) => {
    if (!r) return null;
    let i = n.find((e) => e.id === t);
    if (!i) return null;
    let a = i.branches.find((t) => t.id === e);
    if (!a) return null;
    let o = Ji(r),
      s = o.get(i.contentBlockId);
    if (!s) return null;
    let c =
      Wi(s, a.transitionIndex, o, i.rejoinBlockId)[0]?.id ??
      i.rejoinBlockId ??
      null;
    return c ? ma({ blockId: c, workflow: r }) : null;
  },
  pa = ({
    branchId: e,
    branchPointId: t,
    branchPoints: n,
    completedBlockId: r,
    completedBlockTopLevelUrlsById: i,
    workflow: a,
  }) => {
    if (r) {
      let e = i[r];
      if (e) return e;
    }
    let o = fa({ branchId: e, branchPointId: t, branchPoints: n, workflow: a });
    return o ? (i[o] ?? null) : null;
  },
  ma = ({ blockId: e, workflow: t }) => {
    let n = t.contentBlocks.find((t) => t.id === e);
    return n
      ? `children` in n && n.children?.length
        ? (n.children[0]?.id ?? null)
        : n.id
      : e;
  },
  ha = async (e) => {
    try {
      let t = await fetch(`${ze.webUrl}api/ai/trace`, {
        method: `POST`,
        headers: { "Content-Type": `application/json` },
        body: JSON.stringify(e),
      });
      if (!t.ok) throw Error(`HTTP error! status: ${t.status}`);
      return await t.json();
    } catch (e) {
      throw (console.error(`Error sending trace to backend:`, e), e);
    }
  },
  ga = async (e) => {
    try {
      let t = await fetch(`${ze.webUrl}api/ai/score`, {
        method: `POST`,
        headers: {
          "Content-Type": `application/json`,
          Authorization: `Bearer ${M.user?.token}`,
        },
        body: JSON.stringify(e),
      });
      if (!t.ok) throw Error(`HTTP error! status: ${t.status}`);
      return await t.json();
    } catch (e) {
      throw (console.error(`Error sending score to backend:`, e), e);
    }
  };
function _a(e = {}) {
  if (!e.guidanceSessionId) return ``;
  let t = new URL(`https://aura.tango.us`);
  return (
    (t.pathname = `/session/${e.guidanceSessionId}`),
    e.stepId && t.searchParams.set(`stepId`, e.stepId),
    t.toString()
  );
}
function va({
  traceId: e,
  step: t,
  result: n,
  workflowId: r,
  sessionId: i,
  sessionUrl: a,
  workspaceId: o,
  eventOrigin: s,
  isFinalResult: c,
  snapshotPath: l,
  currentAgentFix: u,
  currentAgentFixAction: d,
}) {
  let { stepId: f, nextStepId: p, automatixAnalytics: m, ...h } = n;
  if (
    (ha({
      id: e,
      name: `classifyStep`,
      input: { result: { ...h, step: t } },
      metadata: {
        sessionUrl: a,
        sessionDebugUrl: _a({ guidanceSessionId: i, stepId: t.id }),
        stepId: t.id,
        workflowId: r,
        sessionId: i,
        automatixConfigVersion: n.automatixConfigVersion,
        workspaceId: o,
        appName: t.app?.name,
        guidanceSnapshotId: l,
        eventOrigin: s,
        eventType: t.eventType ?? void 0,
        currentAgentFix: u,
        currentAgentFixAction: d,
        isFinalResult: c,
      },
    }),
    !M.user)
  ) {
    console.error(`User not found. Cannot create step classification.`);
    return;
  }
  P(M.user).createStepClassification({
    stepId: t.id,
    traceId: e,
    classification: n.status,
    metadata: JSON.stringify({ workflowId: r, sessionId: i }),
    snapshotPath: l,
    eventOrigin: s,
    eventType: t.eventType ?? ``,
    workflowId: r,
    workspaceId: o,
    appName: t.app?.name,
  });
}
function ya(e, t) {
  ha({ id: e, metadata: t });
}
const ba = di({
  types: { context: {}, events: {}, input: {} },
  actors: { fetchGenerateAgentActions: Vr(sa), executeAgentActions: Vr(ca) },
}).createMachine({
  context: ({ input: e }) => ({
    paused: o.None,
    automationStatus: pi.NoAutomation,
    workflow: null,
    completedAgentFixActions: [],
    completedBlocks: [],
    completedBlockTopLevelUrlsById: {},
    skippedBlocks: [],
    agentStatus: ae.Idle,
    agentStatusDescription: null,
    agentAttempts: 0,
    agentRunLog: [],
    highlightedBlockId: null,
    currentClassifyStepTraceId: null,
    hasLoggedSuccessfulStepTrace: !1,
    stepsWithFinalResult: [],
    suggestedAction: null,
    zoomScreenshotStepId: null,
    findElementResult: null,
    initialUrl: null,
    stepLog: [],
    pendingAgentFixes: [],
    pendingAgentFixesInput: [],
    agentFixes: [],
    suggestedActionFeedback: null,
    agentActionMessages: [],
    agentActionInitialTabId: null,
    agentActionWindowId: null,
    agentActionModel: null,
    sessionId: e.sessionId,
    transitionsEnabled: !1,
    traversedTransitions: [],
    branchPoints: [],
    activeBranchSelections: {},
    pendingBranchSelection: null,
  }),
  initial: `none`,
  states: {
    none: { states: {}, on: {} },
    customAgent: {
      initial: `fetching`,
      states: {
        fetching: {
          invoke: {
            id: `getGenerateAgentActions`,
            src: `fetchGenerateAgentActions`,
            input: ({ context: e }) => ({
              messages: e.agentActionMessages,
              initialTabId: e.agentActionInitialTabId,
              windowId: e.agentActionWindowId,
              sessionId: e.sessionId,
              model: e.agentActionModel,
            }),
            onDone: {
              actions: H({
                agentActionMessages: ({ context: e, event: t }) =>
                  la(e, {
                    timestamp: Date.now(),
                    type: `assistant`,
                    ...t.output,
                  }),
              }),
              target: `executing`,
            },
            onError: {
              actions: H({
                agentActionMessages: ({ context: e, event: t }) =>
                  la(e, {
                    timestamp: Date.now(),
                    type: `fetchError`,
                    content: t.error.message,
                  }),
              }),
              target: `failed`,
            },
          },
        },
        executing: {
          invoke: {
            id: `getExecuteAgentActions`,
            src: `executeAgentActions`,
            input: ({ context: e }) => ({
              message: e.agentActionMessages.at(-1),
              windowId: e.agentActionWindowId,
            }),
            onDone: [
              {
                target: `completed`,
                guard: ({ event: e }) => e.output.action === `done`,
              },
              {
                target: `fetching`,
                guard: ({ event: e }) => e.output.action !== `done`,
                actions: H({
                  agentActionMessages: ({ context: e, event: t }) =>
                    la(e, {
                      timestamp: Date.now(),
                      type: `actionResult`,
                      content: t.output.content,
                    }),
                }),
              },
            ],
            onError: {
              target: `fetching`,
              actions: H({
                agentActionMessages: ({ context: e, event: t }) =>
                  la(e, {
                    timestamp: Date.now(),
                    type: `actionResult`,
                    content: t.error.message,
                  }),
              }),
            },
          },
        },
        completed: {},
        failed: {},
        stopped: {},
      },
    },
  },
  on: {
    setAutomationStatus: {
      actions: H({
        automationStatus: ({ event: e, context: t }) => e.status ?? Ca(t),
      }),
    },
    setAgentStatus: {
      actions: H({ agentStatus: ({ event: e }) => e.agentStatus }),
    },
    setHighlightedBlock: {
      guard: ({ context: e, event: t }) => e.highlightedBlockId !== t.blockId,
      actions: [
        H({
          highlightedBlockId: ({ event: e, context: t }) =>
            Sa(t.workflow, e.blockId),
          ...Na(),
          ...ja(),
          automationStatus: ({ event: e, context: t }) =>
            Ca({
              ...t,
              highlightedBlockId: e.blockId,
              paused: e.stopAutomation ? o.AutomationOnly : t.paused,
            }),
          findElementResult: null,
          paused: ({ event: e, context: t }) =>
            e.stopAutomation ? o.AutomationOnly : t.paused,
          completedAgentFixActions: () => [],
          pendingBranchSelection: null,
        }),
        oi(({ context: e, enqueue: t }) => {
          let n = Pa(e);
          n && t.assign(n);
        }),
      ],
    },
    setSuggestedAction: {
      actions: H({
        suggestedAction: ({ event: e }) => e.suggestedAction,
        agentStatus: ({ event: e, context: t }) =>
          e.suggestedAction ? ae.Done : t.agentStatus,
        agentRunLog: ({ context: e, event: t }) =>
          t.log ? [...e.agentRunLog, t.log] : e.agentRunLog,
        agentStatusDescription: ({ event: e, context: t }) =>
          e.description ? e.description : t.agentStatusDescription,
      }),
    },
    setZoomScreenshotStepId: {
      actions: H({ zoomScreenshotStepId: ({ event: e }) => e.stepId }),
    },
    setSuggestedActionFeedback: {
      actions: H({ suggestedActionFeedback: ({ event: e }) => e.feedback }),
    },
    setAgentStatusDescription: {
      actions: H({ agentStatusDescription: ({ event: e }) => e.description }),
    },
    setPendingAgentFix: {
      actions: H({
        pendingAgentFixes: ({ event: e, context: t }) =>
          Oi(
            e.agentFix,
            t.pendingAgentFixes,
            t.agentFixes,
            t.completedAgentFixActions,
          ),
      }),
    },
    setPendingAgentFixesInput: {
      actions: H({
        pendingAgentFixesInput: ({ event: e, context: t }) => [
          ...t.pendingAgentFixesInput,
          e.input,
        ],
      }),
    },
    clearPendingAgentFix: { actions: H({ pendingAgentFixes: () => [] }) },
    clearPendingAgentFixesInput: {
      actions: H({ pendingAgentFixesInput: () => [] }),
    },
    setAgentFixes: {
      actions: H({ agentFixes: ({ event: e }) => e.agentFixes }),
    },
    markAgentFixActionAsCompleted: {
      actions: H({
        completedAgentFixActions: ({ context: e }) =>
          Di(
            e.agentFixes,
            e.completedAgentFixActions,
            e.highlightedBlockId,
            e.sessionId,
          ),
      }),
    },
    setWorkflow: {
      actions: [
        H({
          workflow: ({ event: e }) => e.workflow,
          highlightedBlockId: ({ context: e, event: t }) =>
            Ta(e, t.workflow) ?? null,
          branchPoints: ({ context: e, event: t }) =>
            Gi(t.workflow, e.activeBranchSelections),
        }),
        oi(({ context: e, enqueue: t }) => {
          let n = Pa(e);
          n && t.assign(n);
        }),
      ],
    },
    processPendingAgentFixes: {
      actions: H({
        pendingAgentFixes: ({ context: e }) => (
          e.pendingAgentFixes.forEach((e) => wi(e)),
          []
        ),
      }),
    },
    setFindElementResult: {
      guard: ({ context: e, event: t }) => {
        let n = e.findElementResult,
          r = t.findElementResult;
        return (r?.stepId && r.stepId !== e.highlightedBlockId) || tt(n, r)
          ? !1
          : Aa(n, r);
      },
      actions: [
        H({
          findElementResult: ({ event: e }) => e.findElementResult,
          pendingAgentFixes: ({ context: e, event: t }) => {
            let n = t.findElementResult?.status === z.Success,
              r = e.workflow,
              i = e.highlightedBlockId;
            if (r && i) {
              let t = r.contentBlocks.find((e) => e.id === i),
                a = !!t && ye(t);
              if (e.pendingAgentFixes.length > 0 && !a)
                return (
                  I(
                    `[Self-improvement] Encountered a non-step content block. Processing pending agent fix...`,
                  ),
                  e.pendingAgentFixes.forEach((e) => wi(e)),
                  []
                );
              if (a && t?.eventType === `data_extraction`)
                return (
                  I(
                    `[Self-improvement] Encountered a data extraction content block. Keeping pending agent fixes...`,
                  ),
                  e.pendingAgentFixes
                );
              if (e.pendingAgentFixes.length > 0 && n && !e.suggestedAction)
                return (
                  I(
                    `[Self-improvement] Automatix Status Success. Processing pending agent fixes...`,
                  ),
                  e.pendingAgentFixes.forEach((e) => wi(e)),
                  []
                );
            }
            return e.pendingAgentFixes;
          },
          suggestedActionFeedback: ({ context: e, event: t }) =>
            e.suggestedAction?.action !== `type` &&
            t.findElementResult?.status === z.Success
              ? { success: !0, automatic: !0 }
              : e.suggestedActionFeedback,
        }),
        oi(({ context: e, event: t, enqueue: n }) => {
          e.transitionsEnabled &&
            Da(t.findElementResult, e) &&
            n.raise({
              type: `TARGET_NOT_FOUND`,
              blockId: t.findElementResult.stepId,
            });
        }),
      ],
    },
    TARGET_NOT_FOUND: {
      guard: ({ context: e }) => e.transitionsEnabled,
      actions: [
        li(({ event: e }) => `Target not found for block: ${e.blockId}`),
        oi(({ context: e, event: t, enqueue: n }) => {
          let r = [
            ...(e.workflow?.contentBlocks.flatMap((e) =>
              `children` in e && e.children?.length ? e.children : e,
            ) ?? []),
            ...(e.workflow?.exceptionResolutions ?? []),
          ]
            .find((e) => e.id === t.blockId)
            ?.transitions?.find(
              (t) =>
                t.event === v.TargetNotFound &&
                !new Set(e.traversedTransitions).has(Ma(t)),
            );
          r && n.raise({ type: `TRANSITION_TO_BLOCK`, transition: r });
        }),
      ],
    },
    TRANSITION_TO_BLOCK: {
      guard: ({ context: e }) => e.transitionsEnabled,
      actions: [
        li(({ event: e }) => `Transitioning to block: ${e.transition.toId}`),
        H({
          ...Na(),
          highlightedBlockId: ({ context: e, event: t }) =>
            Sa(e.workflow, t.transition.toId ?? null),
          traversedTransitions: ({ context: e, event: t }) => [
            ...e.traversedTransitions,
            Ma(t.transition),
          ],
        }),
      ],
    },
    clearFindElementResult: {
      actions: H({ ...ja(), findElementResult: null, pendingAgentFixes: [] }),
    },
    markBlockAsCompleted: {
      actions: H({
        completedBlocks: ({ context: e, event: t }) => {
          let n = new Map(e.completedBlocks.map((e) => [e.id, e]));
          return (
            t.blocks.forEach((e) => {
              let t = n.get(e.id);
              n.set(e.id, { id: e.id, method: t?.method || e.method });
            }),
            Array.from(n.values())
          );
        },
        skippedBlocks: ({ context: e, event: t }) =>
          t.skipIds
            ? Array.from(new Set([...e.skippedBlocks, ...t.skipIds]))
            : e.skippedBlocks,
      }),
    },
    markBlockAsUncompleted: {
      actions: H({
        completedBlocks: ({ context: e, event: t }) =>
          e.completedBlocks.filter((e) => !t.ids.includes(e.id)),
        skippedBlocks: ({ context: e, event: t }) =>
          e.skippedBlocks.filter((e) => !t.ids.includes(e)),
      }),
    },
    clearCompleted: {
      actions: H({
        completedBlocks: () => [],
        skippedBlocks: () => [],
        completedBlockTopLevelUrlsById: () => ({}),
      }),
    },
    setCompletedBlockTopLevelUrl: {
      actions: H({
        completedBlockTopLevelUrlsById: ({ context: e, event: t }) => ({
          ...e.completedBlockTopLevelUrlsById,
          [t.blockId]: t.url,
        }),
      }),
    },
    goBackToBlock: {
      actions: H({
        completedBlocks: ({ context: e, event: t }) => {
          let n = wa({ context: e, targetBlockId: t.blockId, inclusive: !1 });
          return n
            ? e.completedBlocks.filter((e) => n.has(e.id))
            : e.completedBlocks;
        },
        skippedBlocks: ({ context: e, event: t }) => {
          let n = wa({ context: e, targetBlockId: t.blockId, inclusive: !1 });
          return n ? e.skippedBlocks.filter((e) => n.has(e)) : e.skippedBlocks;
        },
        pendingBranchSelection: null,
      }),
    },
    restart: {
      actions: H({
        completedBlocks: () => [],
        skippedBlocks: () => [],
        stepLog: () => [],
        highlightedBlockId: null,
        automationStatus: pi.NoAutomation,
        activeBranchSelections: () => ({}),
        completedBlockTopLevelUrlsById: () => ({}),
        branchPoints: ({ context: e }) =>
          e.workflow ? Gi(e.workflow, {}) : [],
        pendingBranchSelection: null,
      }),
    },
    setInitialUrl: { actions: H({ initialUrl: ({ event: e }) => e.url }) },
    addStepLogEntry: {
      actions: H({
        stepLog: ({ context: e, event: t }) => [
          ...e.stepLog,
          { stepId: t.stepId, tabId: t.tabId, complete: t.complete },
        ],
      }),
    },
    clearStepLog: { actions: H({ stepLog: () => [] }) },
    startNewAgentRun: {
      actions: H({
        agentAttempts: ({ context: e }) => e.agentAttempts + 1,
        agentRunLog: [],
        agentStatusDescription: ({ event: e }) => e.description,
      }),
    },
    addAgentLog: {
      actions: H({
        agentRunLog: ({ context: e, event: t }) => [...e.agentRunLog, t.log],
      }),
    },
    clearAgentRunLog: { actions: H({ agentRunLog: () => [] }) },
    setPaused: {
      guard: ({ context: e, event: t }) => e.paused !== t.paused,
      actions: H({
        ...ja(),
        paused: ({ event: e }) => e.paused,
        automationStatus: ({ context: e, event: t }) =>
          e.paused !== o.AutomationOnly && t.paused !== o.AutomationOnly
            ? e.automationStatus
            : Ca({ ...e, paused: t.paused }),
      }),
    },
    startCustomAgent: {
      actions: H({
        agentActionMessages: ({ event: e }) => [
          {
            timestamp: Date.now(),
            type: `instruction`,
            content: e.instructions,
          },
        ],
        agentActionInitialTabId: ({ event: e }) => e.tabId,
        agentActionWindowId: ({ event: e }) => e.windowId,
        agentActionModel: ({ event: e }) => e.model ?? null,
      }),
      target: `.customAgent`,
    },
    stopCustomAgent: { target: `.customAgent.stopped` },
    resetCustomAgent: {
      actions: H({
        agentActionMessages: () => [],
        agentActionInitialTabId: null,
        agentActionWindowId: null,
        agentActionModel: null,
      }),
      target: `.none`,
    },
    updatePendingAgentFixTitleDetails: {
      actions: H({
        pendingAgentFixes: ({ context: e, event: t }) =>
          ki(e.pendingAgentFixes, e.highlightedBlockId, t.titleDetails),
      }),
    },
    processAgentFixesInputs: {
      actions: H({
        pendingAgentFixesInput: ({ context: e, event: t }) => (
          Ci(e.pendingAgentFixesInput, t.inputs),
          []
        ),
      }),
    },
    setTransitionsEnabled: {
      actions: H({
        transitionsEnabled: ({ event: e }) => e.transitionsEnabled,
      }),
    },
    setActiveBranch: {
      actions: H({
        activeBranchSelections: ({ context: e, event: t }) => ({
          ...e.activeBranchSelections,
          [t.branchPointId]: t.branchId,
        }),
        branchPoints: ({ context: e, event: t }) => {
          let n = e.workflow,
            r = n ? Ji(n) : null;
          return e.branchPoints.map((e) =>
            Fa(e, t.branchPointId, t.branchId, r),
          );
        },
      }),
    },
    setPendingBranchSelection: {
      actions: H({
        pendingBranchSelection: ({ event: e }) => ({
          branchPointId: e.branchPointId,
          completedBlockId: e.completedBlockId,
          branches: e.branches,
          isSwitchingPaths: !0,
        }),
        ...Na(),
      }),
    },
    cancelPendingBranchSelection: {
      actions: H({ pendingBranchSelection: () => null }),
    },
    completeBranchSelection: {
      actions: [
        oi(({ context: e, event: t, enqueue: n }) => {
          if (
            e.pendingBranchSelection?.isSwitchingPaths &&
            e.activeBranchSelections[t.branchPointId] === t.branchId
          ) {
            n.assign({ pendingBranchSelection: () => null });
            return;
          }
          let r = fa({
            branchId: t.branchId,
            branchPointId: t.branchPointId,
            branchPoints: e.branchPoints,
            workflow: e.workflow,
          });
          n.assign({
            completedBlocks: ({ context: e }) => {
              let t = e.pendingBranchSelection?.completedBlockId;
              if (!t) return e.completedBlocks;
              let n = wa({ context: e, targetBlockId: t, inclusive: !0 }),
                r = n
                  ? e.completedBlocks.filter((e) => n.has(e.id))
                  : e.completedBlocks;
              return r.some((e) => e.id === t) ? r : [...r, { id: t }];
            },
            skippedBlocks: ({ context: e }) => {
              let t = e.pendingBranchSelection?.completedBlockId;
              if (!t) return e.skippedBlocks;
              let n = wa({ context: e, targetBlockId: t, inclusive: !0 });
              return n
                ? e.skippedBlocks.filter((e) => n.has(e))
                : e.skippedBlocks;
            },
            activeBranchSelections: ({ context: e, event: t }) => ({
              ...e.activeBranchSelections,
              [t.branchPointId]: t.branchId,
            }),
            branchPoints: ({ context: e, event: t }) => {
              let n = e.workflow,
                r = n ? Ji(n) : null;
              return e.branchPoints.map((e) =>
                Fa(e, t.branchPointId, t.branchId, r),
              );
            },
            highlightedBlockId: () => r,
            pendingBranchSelection: () => null,
            currentClassifyStepTraceId: null,
            hasLoggedSuccessfulStepTrace: !1,
            findElementResult: null,
            completedAgentFixActions: () => [],
            ...ja(),
            automationStatus: ({ context: e }) =>
              Ca({ ...e, highlightedBlockId: r }),
          });
          let i = e.pendingBranchSelection?.completedBlockId,
            a = i ? wa({ context: e, targetBlockId: i, inclusive: !0 }) : null,
            o = a
              ? e.completedBlocks.filter((e) => a.has(e.id))
              : e.completedBlocks,
            s = i && !o.some((e) => e.id === i) ? [...o, { id: i }] : o,
            c = Pa({ ...e, highlightedBlockId: r, completedBlocks: s });
          c && n.assign(c);
        }),
      ],
    },
    createClassifyStepTrace: {
      actions: [
        H(({ context: e, event: t }) => {
          let n = e.workflow;
          if (!n)
            return {
              currentClassifyStepTraceId: e.currentClassifyStepTraceId,
              hasLoggedSuccessfulStepTrace: e.hasLoggedSuccessfulStepTrace,
            };
          let r = [
            ...n.contentBlocks.flatMap((e) =>
              `children` in e && e.children?.length ? e.children : e,
            ),
            ...(n.exceptionResolutions ?? []),
          ].find((e) => e.id === t.stepId);
          if (!r || !ye(r))
            return {
              currentClassifyStepTraceId: e.currentClassifyStepTraceId,
              hasLoggedSuccessfulStepTrace: e.hasLoggedSuccessfulStepTrace,
            };
          let i = t.stepId === e.highlightedBlockId,
            a = lt();
          i &&
            e.currentClassifyStepTraceId !== null &&
            !e.hasLoggedSuccessfulStepTrace &&
            ya(e.currentClassifyStepTraceId, { isFinalResult: !1 });
          let o = (e.stepsWithFinalResult ?? []).includes(t.stepId),
            s = i && !e.hasLoggedSuccessfulStepTrace && !o;
          return (
            va({
              traceId: a,
              step: r,
              result: t.result,
              workflowId: n.id,
              sessionId: e.sessionId,
              sessionUrl: t.sessionUrl,
              workspaceId: n.workspaceId,
              eventOrigin: n.type === u.Automation ? m.Artemis : m.Guidance,
              isFinalResult: s,
              snapshotPath: t.snapshotPath,
              currentAgentFix: t.currentAgentFix,
              currentAgentFixAction: t.currentAgentFixAction,
            }),
            i
              ? {
                  currentClassifyStepTraceId: a,
                  hasLoggedSuccessfulStepTrace:
                    e.hasLoggedSuccessfulStepTrace ||
                    t.result.status === z.Success,
                }
              : {
                  currentClassifyStepTraceId: e.currentClassifyStepTraceId,
                  hasLoggedSuccessfulStepTrace: e.hasLoggedSuccessfulStepTrace,
                }
          );
        }),
      ],
    },
  },
});
function xa(e) {
  return Ue({ name: d.ViewWorkflowEvent, event: e });
}
function Sa(e, t) {
  return !e || !t ? t : ma({ blockId: t, workflow: e });
}
function Ca(e) {
  let t = e.highlightedBlockId;
  if (e.paused === o.AutomationOnly || !t) return pi.NoAutomation;
  let n = Ea(e).find((e) => e.id === t);
  if (!n || (!ye(n) && n.type !== D.ExceptionResolution))
    return pi.NoAutomation;
  if (n.type === D.ExceptionResolution) return pi.Queued;
  if (!Ai(n) || Mi(n)) return pi.NoAutomation;
  if (ye(n) && n.referencedField?.id) {
    let t = Ea(e),
      r = Ii(n.referencedField.id, t);
    if (r && !Li(r.id, e.completedBlocks)) return pi.NoAutomation;
  }
  return e.workflow?.type === u.Static ? pi.NoAutomation : pi.Queued;
}
function wa({ context: e, targetBlockId: t, inclusive: n }) {
  let r = Ea(e),
    i = r.findIndex((e) => e.id === t);
  if (i === -1) return null;
  let a = n ? i + 1 : i;
  return new Set(r.slice(0, a).map((e) => e.id));
}
function Ta(e, t) {
  let n = Ea(e, t)[0];
  return n
    ? `children` in n && n.children?.length
      ? (n.children[0]?.id ?? null)
      : n.id
    : null;
}
function Ea(e, t) {
  if (((t ??= e.workflow), !t)) return [];
  let n = Hi(t.contentBlocks)
    .flatMap((e) => (`children` in e && e.children?.length ? e.children : [e]))
    .filter(
      (e) =>
        e.type === D.Step ||
        e.type === D.Heading ||
        e.type === D.Callout ||
        e.type === D.BranchPoint,
    );
  return e.transitionsEnabled ? [...n, ...t.exceptionResolutions] : n;
}
function Da(e, t) {
  if (!e) return !1;
  let n = `step` in e ? e.step : Oa({ stepId: e.stepId, context: t });
  return e.status === z.ElementHidden && ea(n)
    ? !1
    : (e.status === z.NoElements ||
        e.status === z.ScoreTooLow ||
        e.status === z.ElementHidden ||
        e.status === z.ElementNotInteractive ||
        e.status === z.ElementObstructed) &&
        !!e.timeout;
}
function Oa({ stepId: e, context: t }) {
  let n = t?.workflow;
  if (!n) return;
  let r = [
    ...n.contentBlocks.flatMap((e) =>
      `children` in e && e.children?.length ? [e, ...e.children] : [e],
    ),
    ...(n.exceptionResolutions ?? []),
  ].find((t) => t.id === e);
  if (!(!r || !ye(r))) return r;
}
function ka(e) {
  return e ? e.status === z.NoTargetDetails : !1;
}
var Aa = (e, t) =>
  !e ||
  e.tabId !== t?.tabId ||
  e.stepId !== t.stepId ||
  (e && e.tabId === t.tabId && e.frameId === t.frameId)
    ? !0
    : at(e, t);
function ja() {
  return {
    agentStatus: ae.Idle,
    agentAttempts: 0,
    agentRunLog: [],
    agentStatusDescription: null,
    suggestedAction: null,
  };
}
function Ma(e) {
  return e.toId ? `${e.event}-${e.toId}` : `${e.event}-${e.id}`;
}
function Na() {
  return {
    stepsWithFinalResult: ({ context: e }) => {
      let t = e.stepsWithFinalResult ?? [];
      return e.highlightedBlockId &&
        e.currentClassifyStepTraceId !== null &&
        !t.includes(e.highlightedBlockId)
        ? [...t, e.highlightedBlockId]
        : t;
    },
    currentClassifyStepTraceId: null,
    hasLoggedSuccessfulStepTrace: !1,
  };
}
function Pa(e) {
  let t = e.highlightedBlockId;
  if (!t) return null;
  let n = Ea(e),
    r = new Map(e.completedBlocks.map((e) => [e.id, e])),
    i = new Set(e.skippedBlocks),
    a = !1;
  for (; t; ) {
    let o = t,
      s = n.find((e) => e.id === o),
      c =
        s?.type === D.Heading ||
        s?.type === D.Callout ||
        s?.type === D.BranchPoint,
      l =
        !c &&
        s &&
        ye(s) &&
        Ri({
          step: s,
          completedBlocks: Array.from(r.values()),
          contentBlocks: n,
        });
    if ((!c && !l) || !s || (s.type === D.Heading && `url` in s && s.url))
      break;
    if (s.type === D.BranchPoint) {
      let t = e.branchPoints.find((e) => e.contentBlockId === o);
      if (t && t.branches.length > 1)
        return {
          completedBlocks: Array.from(r.values()),
          skippedBlocks: Array.from(i),
          pendingBranchSelection: {
            branchPointId: t.id,
            completedBlockId: o,
            branches: t.branches,
          },
          highlightedBlockId: null,
          automationStatus: pi.NoAutomation,
          findElementResult: null,
        };
    }
    (r.set(o, { id: o }), l && i.add(o), (a = !0));
    let u = e.branchPoints.find((e) => e.contentBlockId === o);
    if (u && u.branches.length > 1)
      return {
        completedBlocks: Array.from(r.values()),
        skippedBlocks: Array.from(i),
        pendingBranchSelection: {
          branchPointId: u.id,
          completedBlockId: o,
          branches: u.branches,
        },
        highlightedBlockId: null,
        automationStatus: pi.NoAutomation,
        findElementResult: null,
      };
    let d = n[n.findIndex((e) => e.id === o) + 1]?.id ?? null;
    if (e.transitionsEnabled) {
      let e = s.transitions?.find((e) => e.event === v.BlockCompleted);
      d = e?.toId ? e.toId : null;
    }
    t = Sa(e.workflow, d);
  }
  if (!a) return null;
  let o = Array.from(r.values());
  return {
    completedBlocks: o,
    skippedBlocks: Array.from(i),
    highlightedBlockId: t,
    automationStatus: Ca({ ...e, highlightedBlockId: t, completedBlocks: o }),
  };
}
function Fa(e, t, n, r) {
  if (e.id !== t) return e;
  let i = e.branches.find((e) => e.id === n);
  if (!i) return e;
  let a = e.branchPointIndex;
  if (r) {
    let t = r.get(e.contentBlockId);
    if (t) {
      let e = U(t)[i.transitionIndex];
      a = zi(e?.toId ? r.get(e.toId) : null) ?? t.index + 1;
    }
  }
  return {
    ...e,
    activeBranchId: n,
    activeBranchTransitionIndex: i.transitionIndex,
    branchPointIndex: a,
  };
}
function Ia(e, t = 0) {
  return Number.isFinite(e.index) ? (e.index ?? t) : t;
}
function La(e) {
  let t = e.context.workflow,
    n = e.context.highlightedBlockId;
  if (!(!t || !n))
    return [
      ...t.contentBlocks.flatMap((e) =>
        `children` in e && e.children?.length ? e.children : e,
      ),
      ...t.exceptionResolutions,
    ].find((e) => e.id === n);
}
function Ra(e) {
  let t = e.context.workflow,
    n = e.context.highlightedBlockId;
  if (!t || !n) return;
  let r = t.contentBlocks.flatMap((e) =>
    `children` in e && e.children?.length ? e.children : e,
  );
  if (e.context.transitionsEnabled) {
    let e = [...r, ...t.exceptionResolutions],
      i = e
        .find((e) => e.id === n)
        ?.transitions?.find((e) => e.event === v.BlockCompleted);
    return e.find((e) => e.id === i?.toId);
  }
  let i = r.findIndex((e) => e.id === n);
  return r.find((e, t) => t > i && ye(e));
}
function za(e) {
  if (!e?.context.workflow || e.context.pendingBranchSelection) return !1;
  let t = e.context.branchPoints,
    n = new Set(e.context.completedBlocks.map((e) => e.id)),
    r = Ea(e.context).filter((e) => e.type !== D.ExceptionResolution),
    i = e.context.highlightedBlockId;
  if (i && r.some((e) => e.id === i)) return !1;
  if (t.length > 0) {
    let i = Ji(e.context.workflow),
      a = new Set();
    for (let e of t) {
      if (!n.has(e.contentBlockId)) continue;
      let t = i.get(e.contentBlockId);
      if (!t) continue;
      let r = Wi(t, e.activeBranchTransitionIndex, i, e.rejoinBlockId),
        o = new Set(r.map((e) => e.id)),
        s = U(t);
      for (let n = 0; n < s.length; n++) {
        if (n === e.activeBranchTransitionIndex) continue;
        let [r, ...s] = Wi(t, n, i, e.rejoinBlockId);
        if (!r) continue;
        o.has(r.id) || a.add(r.id);
        let c = !0,
          l = Ia(r, Ia(t));
        for (let e of s) {
          if (o.has(e.id)) {
            l = Ia(e, l);
            continue;
          }
          let t = Ia(e, l);
          (c && t < l && (c = !1), c && a.add(e.id), (l = t));
        }
      }
    }
    r = r.filter((e) => !a.has(e.id));
  }
  return r.every((e) => n.has(e.id));
}
function Ba(e) {
  return e.context.agentFixes || [];
}
function Va(e, t) {
  let n = e.context.agentFixes;
  if (!(!n || !t)) {
    for (let e of n)
      if (e.actions) {
        let n = e.actions.find((e) => e.id === t);
        if (n) return n;
      }
  }
}
function Ha(e) {
  return e.context.completedAgentFixActions;
}
var Ua = {
  "in text field": `Text Field`,
  "an option": `Option`,
  "your search query": `Search Query`,
  "Select...": `Option`,
  password: `Password`,
  "a date": `Date`,
};
function Wa(e) {
  let t = {};
  return e.map((e) => {
    let n = e.label,
      r = Ua[n];
    r && (n = r);
    let i = (t[n] ?? 0) + 1;
    return ((t[n] = i), { ...e, uniqueLabel: i > 1 ? `${n} ${i}` : n });
  });
}
var Ga = (e, t) => {
    if (t === null || t < 0) return { ...e, contentBlocks: [] };
    let n = e.contentBlocks ?? [],
      r = [],
      i = 0;
    for (let e of n) i <= t && (r.push(e), i++);
    return { ...e, contentBlocks: r };
  },
  Ka = async (e, t, n) => {
    let r = Ga(e, t);
    await jh({ input: { sessionId: n } });
    let i = Oh();
    i && i.send({ type: `setWorkflow`, workflow: r });
  };
const qa = async (e, t) => {
    let n = (
      await (
        await fetch(`${ze.webUrl}api/convert-workflow?workflowId=${e}`)
      ).json()
    )?.exportWorkflow;
    N({ capturedWorkflow: n, workflowId: e, workflowType: n?.type });
    let r = (() => {
      let e = n?.contentBlocks?.filter((e) => e.type === D.Step);
      if (!e) return [];
      let t = M.insertAfterStepIndex;
      return t === -1 || !t ? [] : e.slice(0, t);
    })()
      ?.map((e) => e.originatedFields)
      .filter((e) => !!e)
      .flat()
      ?.map((e) => ({
        id: e.id,
        label: e.name,
        uniqueLabel: e.name,
        value: e.originalValue,
        description: e.description ?? ``,
        originEvent: e.originEvent,
      }));
    return (
      N({ sessionWorkflowFields: r.reduce((e, t) => ((e[t.id] = t), e), {}) }),
      t && n && (await Ka(n, M.insertAfterStepIndex, M.captureSessionId ?? ``)),
      n
    );
  },
  Ja = (e, t) => (e.length > t ? `${e.substring(0, t)}…` : e);
var Ya = (e, t) => t.some((t) => e instanceof t),
  Xa,
  Za;
function Qa() {
  return (Xa ||= [
    IDBDatabase,
    IDBObjectStore,
    IDBIndex,
    IDBCursor,
    IDBTransaction,
  ]);
}
function $a() {
  return (Za ||= [
    IDBCursor.prototype.advance,
    IDBCursor.prototype.continue,
    IDBCursor.prototype.continuePrimaryKey,
  ]);
}
var eo = new WeakMap(),
  to = new WeakMap(),
  no = new WeakMap(),
  ro = new WeakMap(),
  io = new WeakMap();
function ao(e) {
  let t = new Promise((t, n) => {
    let r = () => {
        (e.removeEventListener(`success`, i),
          e.removeEventListener(`error`, a));
      },
      i = () => {
        (t(fo(e.result)), r());
      },
      a = () => {
        (n(e.error), r());
      };
    (e.addEventListener(`success`, i), e.addEventListener(`error`, a));
  });
  return (
    t
      .then((t) => {
        t instanceof IDBCursor && eo.set(t, e);
      })
      .catch(() => {}),
    io.set(t, e),
    t
  );
}
function oo(e) {
  if (to.has(e)) return;
  let t = new Promise((t, n) => {
    let r = () => {
        (e.removeEventListener(`complete`, i),
          e.removeEventListener(`error`, a),
          e.removeEventListener(`abort`, a));
      },
      i = () => {
        (t(), r());
      },
      a = () => {
        (n(e.error || new DOMException(`AbortError`, `AbortError`)), r());
      };
    (e.addEventListener(`complete`, i),
      e.addEventListener(`error`, a),
      e.addEventListener(`abort`, a));
  });
  to.set(e, t);
}
var so = {
  get(e, t, n) {
    if (e instanceof IDBTransaction) {
      if (t === `done`) return to.get(e);
      if (t === `objectStoreNames`) return e.objectStoreNames || no.get(e);
      if (t === `store`)
        return n.objectStoreNames[1]
          ? void 0
          : n.objectStore(n.objectStoreNames[0]);
    }
    return fo(e[t]);
  },
  set(e, t, n) {
    return ((e[t] = n), !0);
  },
  has(e, t) {
    return e instanceof IDBTransaction && (t === `done` || t === `store`)
      ? !0
      : t in e;
  },
};
function co(e) {
  so = e(so);
}
function lo(e) {
  return e === IDBDatabase.prototype.transaction &&
    !(`objectStoreNames` in IDBTransaction.prototype)
    ? function (t, ...n) {
        let r = e.call(po(this), t, ...n);
        return (no.set(r, t.sort ? t.sort() : [t]), fo(r));
      }
    : $a().includes(e)
      ? function (...t) {
          return (e.apply(po(this), t), fo(eo.get(this)));
        }
      : function (...t) {
          return fo(e.apply(po(this), t));
        };
}
function uo(e) {
  return typeof e == `function`
    ? lo(e)
    : (e instanceof IDBTransaction && oo(e),
      Ya(e, Qa()) ? new Proxy(e, so) : e);
}
function fo(e) {
  if (e instanceof IDBRequest) return ao(e);
  if (ro.has(e)) return ro.get(e);
  let t = uo(e);
  return (t !== e && (ro.set(e, t), io.set(t, e)), t);
}
var po = (e) => io.get(e);
function mo(e, t, { blocked: n, upgrade: r, blocking: i, terminated: a } = {}) {
  let o = indexedDB.open(e, t),
    s = fo(o);
  return (
    r &&
      o.addEventListener(`upgradeneeded`, (e) => {
        r(fo(o.result), e.oldVersion, e.newVersion, fo(o.transaction), e);
      }),
    n && o.addEventListener(`blocked`, (e) => n(e.oldVersion, e.newVersion, e)),
    s
      .then((e) => {
        (a && e.addEventListener(`close`, () => a()),
          i &&
            e.addEventListener(`versionchange`, (e) =>
              i(e.oldVersion, e.newVersion, e),
            ));
      })
      .catch(() => {}),
    s
  );
}
var ho = [`get`, `getKey`, `getAll`, `getAllKeys`, `count`],
  go = [`put`, `add`, `delete`, `clear`],
  _o = new Map();
function vo(e, t) {
  if (!(e instanceof IDBDatabase && !(t in e) && typeof t == `string`)) return;
  if (_o.get(t)) return _o.get(t);
  let n = t.replace(/FromIndex$/, ``),
    r = t !== n,
    i = go.includes(n);
  if (
    !(n in (r ? IDBIndex : IDBObjectStore).prototype) ||
    !(i || ho.includes(n))
  )
    return;
  let a = async function (e, ...t) {
    let a = this.transaction(e, i ? `readwrite` : `readonly`),
      o = a.store;
    return (
      r && (o = o.index(t.shift())),
      (await Promise.all([o[n](...t), i && a.done]))[0]
    );
  };
  return (_o.set(t, a), a);
}
co((e) => ({
  ...e,
  get: (t, n, r) => vo(t, n) || e.get(t, n, r),
  has: (t, n) => !!vo(t, n) || e.has(t, n),
}));
var yo = null,
  bo = 2,
  xo = `Tango`;
async function So() {
  return await mo(xo, bo, {
    upgrade(e) {
      try {
        (e.deleteObjectStore(`snapshots`),
          e.deleteObjectStore(`screenshots`),
          e.deleteObjectStore(`klEvents`));
      } catch {}
      (e.createObjectStore(`klEvents`, { keyPath: `id`, autoIncrement: !1 }),
        e.createObjectStore(`snapshots`, { keyPath: `id`, autoIncrement: !1 }),
        e
          .createObjectStore(`screenshots`, {
            keyPath: `id`,
            autoIncrement: !1,
          })
          .createIndex(`timestamp`, `timestamp`));
    },
  });
}
function Co() {
  return yo || ((yo = So()), yo);
}
var wo = t($e(), 1),
  To = [],
  Eo = (0, wo.default)(
    async (e, t, n) => {
      try {
        let r = _e(se.JPEG_SCREENSHOT),
          i = await chrome.tabs.captureVisibleTab(e, {
            format: r ? `jpeg` : `png`,
            quality: 90,
          });
        return (
          M.shouldTrackCapture &&
            F(B.CaptureScreenshotTaken, {
              tracking_id: t,
              precise_timestamp: Date.now(),
            }),
          n(i)
        );
      } catch (e) {
        let t = e;
        return t.message.includes(`Taking screenshots has been disabled`)
          ? (F(B.CaptureScreenshotDisabled, {}),
            eh({ route: x.ScreenshotDisabled }),
            n(null))
          : (t.message.includes(`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`) ||
              L(t),
            n(null));
      }
    },
    300,
    { leading: !0, trailing: !0 },
  );
const Do = (e) =>
    Object.assign(
      {
        id: ``,
        index: e.index,
        title: ``,
        eventType: ``,
        url: ``,
        timestamp: new Date().getTime(),
        targetDetails: null,
        titleDetails: null,
        isFlexible: null,
        isAuthAction: !1,
        isHighStakesAction: !1,
        screenshotPixelRatio: null,
        bounds: void 0,
        parentBounds: void 0,
        synced: !1,
        syncAttempts: 0,
        backendId: null,
        mergeEventId: null,
        description: ``,
        type: e.type || Ie.Step,
        simplifiedDom: null,
        simplifiedDomElementId: null,
        goal: null,
        workflowId: e.workflowId,
      },
      e,
    ),
  Oo = (e, t) => {
    (To.push(e),
      Eo(t, e, async (t) => {
        if ((ah(To.splice(0, To.indexOf(e) + 1)), (t ||= await ko()), t)) {
          let n = { id: e, url: t, timestamp: Date.now() };
          (await (await Co()).put(`screenshots`, n), ih());
        }
      }));
  };
var ko = async () =>
  (
    await (await Co())
      .transaction(`screenshots`)
      .objectStore(`screenshots`)
      .index(`timestamp`)
      ?.openCursor(null, `prev`)
  )?.value?.url || null;
const Ao = (e, t, n) => {
    let r = e.stepText,
      i = null,
      a = !1;
    return (
      (Ee(pe.FlexibleSteps) || M.workflowType === u.Automation) &&
        e.stepTitle &&
        ((r = e.stepTitle), (i = e.titleDetails), (a = e.isFlexible)),
      Do({
        index: t,
        id: e.eventId,
        screenshotEventId: e.eventId,
        eventType: e.action,
        title: Ja(r, 280) || ``,
        url: e.url || ``,
        bounds: e.bounds,
        parentBounds: e.parentBounds,
        targetDetails: e.targetDetails,
        titleDetails: i,
        isFlexible: a,
        isAuthAction: e.isAuthAction,
        isHighStakesAction: e.isHighStakesAction,
        screenshotPixelRatio: e.screenshotPixelRatio,
        mergeEventId: e.mergeEventId,
        type: Ie.Step,
        simplifiedDom: e.simplifiedDom,
        simplifiedDomElementId: e.simplifiedDomElementId,
        workflowId: n.workflowId,
        referencedFieldId: e.referencedFieldId,
      })
    );
  },
  jo = (e, t, n, r) =>
    Do({
      index: n,
      id: lt(),
      title: e,
      url: t,
      type: Ie.Heading,
      workflowId: r.workflowId,
    }),
  Mo = () => M.contentBlocks.filter((e) => !e.deleted),
  No = async () => {
    let e = await Co(),
      t = e.transaction(`screenshots`),
      n = await t.objectStore(`screenshots`).getAllKeys(),
      r = Mo(),
      i = r.at(-1),
      a = null;
    if (i) {
      let t = i.screenshotEventId ?? i.id;
      a = (await e.get(`screenshots`, t))?.url || null;
    }
    return (
      await t.done,
      r.map((e, t) => {
        let i = r.length - 1 === t,
          o = () =>
            e.attachedDocument?.screenshot?.url
              ? e.attachedDocument?.screenshot?.url
              : i
                ? a
                : n.includes(e.id)
                  ? ``
                  : null;
        return { ...e, screenshotURL: o() };
      })
    );
  },
  Po = async (e) => {
    let t = M.contentBlocks.find((t) => t.id === e);
    return (
      (await (await Co()).get(`screenshots`, t?.screenshotEventId ?? e))?.url ||
      null
    );
  },
  Fo = async (e) => {
    if (!e.id) return null;
    try {
      let t = (
        await chrome.scripting.executeScript({
          target: { tabId: e.id },
          func: Io,
          args: [],
          world: `MAIN`,
        })
      )[0]?.result;
      if (t) return t;
    } catch (e) {
      L(e);
    }
    return e.title || null;
  };
var Io = async () => {
    let e = document.querySelector(`meta[property="og:site_name"]`);
    if (e?.content) return e.content;
    let t = document.querySelector(`link[rel="manifest"]`);
    if (t?.href)
      try {
        let e = await (await fetch(t.href)).json();
        return e.name || e.short_name;
      } catch {
        return null;
      }
    return null;
  },
  Lo = [],
  Ro = !1,
  zo = async () => {
    if (Ro || !Lo[0]) return;
    Ro = !0;
    let { eventData: e, options: t } = Lo[0];
    (await Vo(e, t), Lo.shift(), (Ro = !1), zo());
  };
const Bo = async (e, t) => {
  (Lo.push({ eventData: e, options: t }), zo());
};
var Vo = async (e, t) => {
    let { contentBlocks: n } = M,
      { shouldReplace: r } = t,
      i = Mo().length,
      a = Ao(e, r ? i - 1 : i, { workflowId: t.workflowId }),
      o = await Co();
    e.snapshot &&
      (await o.put(`snapshots`, { id: e.eventId, snapshot: e.snapshot }));
    let s = n[n.length - 1];
    if (
      (r &&
        s &&
        ((a.id = s.id),
        e.usePreviousSnapshot && (a.simplifiedDom = s.simplifiedDom),
        s.referencedFieldId && (a.referencedFieldId = s.referencedFieldId),
        s.description && (a.description = s.description)),
      !r && s && e.usePreviousSnapshot)
    ) {
      let e = await o.get(`snapshots`, s.id);
      e && (await o.put(`snapshots`, { id: a.id, snapshot: e.snapshot }));
    }
    (M.workflowType === u.Automation &&
      (e.isVariableInserted || (await Go(a)), (a.originatedFields = Ko(a))),
      Ho(a, { shouldReplace: t.shouldReplace }),
      t.shouldReplace ||
        ha({
          id: a.id,
          name: `capture-step`,
          metadata: {
            sessionId: M.captureSessionId,
            workspaceId: M.user?.currentWorkspaceId,
            workflowId: t.workflowId,
            stepId: a.id,
          },
        }),
      ih());
  },
  Ho = (e, { shouldReplace: t }) => {
    let n = M.contentBlocks.length === 0;
    (t && M.contentBlocks.pop(),
      M.contentBlocks.push(e),
      n && M.captureMode === ie.Guidance && Se(x.Capturing));
  };
const Uo = async (e, t) => {
    let n = Mo().length,
      r = Do({ ...e, index: n, workflowId: e.workflowId });
    (M.contentBlocks.push(r),
      t && (await (await Co()).put(`snapshots`, { id: r.id, snapshot: t })));
    let i = await he();
    (i && !r.attachedDocument?.screenshot?.url && Oo(r.id, i.windowId), ih());
  },
  Wo = (e) => {
    let t = M.contentBlocks.slice(),
      n = t.find((t) => t.id === e),
      r = n === t.at(-1);
    n &&
      ((n.synced = !1),
      (n.deleted = !0),
      n.originatedFields && hh(n.originatedFields),
      Mo().forEach((e, t) => {
        e.index = t;
      }),
      r && n.type === Ie.Step && Pe({ name: d.LastStepDeleted }),
      ih());
  };
var Go = (e) =>
    fh(
      e.titleDetails?.variables
        .map((t) =>
          !t.specificValue ||
          t.specificValue.includes(`{{`) ||
          !t.genericValue ||
          t.specificValue.length < 3
            ? null
            : {
                id: jt(t.genericValue, e.id),
                label: t.genericValue.trim(),
                value: t.specificValue.trim(),
                originEvent: b.UserInput,
              },
        )
        .filter((e) => e !== null) || [],
    ),
  Ko = (e) =>
    e.titleDetails?.variables
      .map((t) => {
        if (!t.genericValue) return null;
        let n = jt(t.genericValue, e.id),
          r = M.sessionWorkflowFields[n];
        return r
          ? {
              id: n,
              dataType: le.String,
              name: r.uniqueLabel,
              originalName: r.label,
              originalValue: r.value,
              originEvent: b.UserInput,
            }
          : null;
      })
      .filter((e) => e !== null && e.name !== void 0);
const qo = async (e, t) => {
    if (!e.url) return;
    let n = Mo(),
      r = n.at(-1),
      i = (await Fo(e)) || me(e.url)?.hostname || ``,
      a = r?.type === Ie.Heading,
      o = jo(i, e.url, n.length - (a ? 1 : 0), { workflowId: t.workflowId }),
      s = n.at(-2);
    if (a && s && it(s.url) === it(o.url)) {
      Wo(r.id);
      return;
    }
    (n.length === 0 &&
      M.insertAfterStepUrl &&
      it(M.insertAfterStepUrl) === it(o.url)) ||
      (r && it(r.url) === it(o.url)) ||
      Ho(o, { shouldReplace: a });
  },
  Jo = async () => {
    let e = await Co();
    return Promise.all([
      e.clear(`snapshots`),
      e.clear(`screenshots`),
      N({
        workflowId: null,
        workflowType: u.Static,
        insertAfterStepIndex: null,
        insertAfterStepUrl: null,
        contentBlocks: [],
        initialUrl: null,
        captureMode: ie.New,
        sessionWorkflowFields: {},
        captureSessionId: null,
        capturedWorkflow: null,
        voiceTranscripts: [],
        blockTransitions: {},
      }),
    ]);
  };
var Yo = `has_voice_transcript`;
async function Xo({ workflowId: e, secondCaptureCompleted: t }) {
  let n = M.voiceTranscripts.length > 0;
  if (e)
    if (M.captureMode !== ie.New) {
      let [t] = await Ce(e);
      if (t?.id) {
        await ve(t.id);
        try {
          await He({
            tabId: t.id,
            message: {
              type: n ? `VOICE_TRANSCRIPT_READY` : `WORKFLOW_UPDATED`,
              workflowId: e,
              ...(n && { isAddSteps: !0 }),
            },
          });
        } catch {
          if (n) {
            let n = new URL(t.url || fe(e));
            (n.searchParams.set(Yo, `true`),
              await chrome.tabs.update(t.id, { url: n.toString() }));
          } else await chrome.tabs.reload(t.id);
        }
      } else {
        let t = fe(e);
        (n && (t = `${t}?${Yo}=true`),
          await chrome.tabs.create({ url: t, active: !0 }));
      }
    } else {
      let r = `${fe(e)}?captured=true`;
      (t && (r = r.concat(`&secondCaptureCompleted=true`)),
        n && (r = r.concat(`&${Yo}=true`)),
        await chrome.tabs.create({ url: r, active: !0 }));
    }
}
const Zo = {
    notificationBadge: !0,
    autoCombineSteps: !0,
    klController: !0,
    artemisDebug: !0,
    enableAutomatix: !0,
  },
  Qo = (e) => e.slice(0, g);
async function $o(e) {
  if (
    !e ||
    M.bgWorkspacesCache.workspaces?.find((t) => t.id === e)?.workspaceUser
      ?.role !== ue.Guest
  )
    return;
  let t = await P(M.user).incrementGuidanceViewCount(e);
  return (
    t.incrementWorkspaceUserGuidanceViews.guidanceViewCount === 3 &&
      F(B.GuidanceGuestLimitReached, { workspace_id: e }),
    t
  );
}
var es = t($e(), 1),
  ts = async (e) => {
    let t = P(M.user);
    try {
      return (
        (
          await t.listExceptionResolutions({
            workflowId: e,
            sortBy: { direction: A.Desc, sort: oe.CreatedAt },
          })
        )?.results ?? []
      );
    } catch (e) {
      return (console.error(`Error getting agent fixes`, e), []);
    }
  },
  ns = async (e) => {
    let t = await chrome.scripting.executeScript({
      target: { tabId: e.id },
      func: () => JSON.stringify(localStorage),
    });
    if (!t[0]?.result) return;
    let n = JSON.parse(t[0].result),
      r = JSON.stringify(n?.[`tango-recently-viewed-workflows`] ?? []);
    chrome.storage.local.set({ recentWorkflows: r });
  },
  rs = async (e) => {
    if (!M.user?.currentWorkspaceId) return;
    let t = P(M.user),
      n = me(e.url || e.pendingUrl),
      r = n ? new URLSearchParams(n.search) : null,
      i = M.user.currentWorkspaceId,
      a = r?.get(`workspaceId`) || i,
      o =
        (await t.listSharedWorkflows({ workspaceId: a }))?.listSharedWorkflows
          ?.results ?? [],
      s = JSON.stringify({ [a]: o });
    (chrome.storage.local.set({ sharedWorkflows: s }),
      Re([e], {
        name: d.WorkflowsFound,
        workflows: o,
        searchUrl: `viewer-guest-splash`,
        totalCount: o.length,
      }));
  },
  is = async () => {
    let e = await _s();
    return e.notificationBadge || e.notificationBadge === void 0;
  },
  as = new Map(),
  os = (e, t) => {
    let n = M.bgWorkflows[e],
      r = n?.cacheTimestamp,
      i = M.user?.currentWorkspaceId,
      a = t ? ne : O,
      o = (r && r < Date.now() - a) || i !== n?.workspaceId;
    if (n && !o)
      return Promise.resolve({
        workflows: n.workflows,
        searchUrl: e,
        totalCount: n.totalCount,
      });
    let c = as.get(e);
    if (c) return c;
    let l = (async () => {
      try {
        let t = await P(M.user).discoverWorkflowsByFilter(e, s.Url, 20),
          n = t?.workflows ?? [],
          r = t?.totalCount ?? 0;
        return (
          N({
            bgWorkflows: Object.assign(M.bgWorkflows, {
              [e]: {
                workspaceId: i,
                cacheTimestamp: Date.now(),
                workflows: n,
                totalCount: r,
              },
            }),
            bgWorkflowFailedAttempt: null,
          }),
          { workflows: n, searchUrl: e, totalCount: r }
        );
      } finally {
        as.delete(e);
      }
    })();
    return (as.set(e, l), l);
  };
const ss = (0, es.default)(async (e) => {
    (await is()) || us(e);
    let t = await chrome.action.getUserSettings?.(),
      n = M.user?.currentWorkspaceId;
    if (!M.user || !t?.isOnToolbar || !n) return;
    if (M.bgWorkflowFailedAttempt && Date.now() < M.bgWorkflowFailedAttempt) {
      I(
        `Not doing a discover workflows request because last attempt failed recently`,
      );
      return;
    }
    if (!Ne(e)) return;
    let r = e.url || e.pendingUrl || ``;
    if (r.includes(`viewer-guest-splash`)) {
      await rs(e);
      return;
    }
    r.includes(ze.webUrl) && (await ns(e));
    try {
      let t = Qo(r),
        n = [],
        i = 0,
        a = await os(t);
      ((n = a.workflows),
        (i = a.totalCount),
        await ls(e, i),
        Re([e], {
          name: d.WorkflowsFound,
          workflows: n,
          searchUrl: t,
          totalCount: i,
        }));
    } catch (e) {
      L(e);
      let t = E + Math.random() * (w - E);
      N({ bgWorkflowFailedAttempt: Date.now() + t });
    }
  }, 200),
  cs = async (e, t, n) => {
    if (!M.user || !M.user.currentWorkspaceId) return;
    let r = await os(e, n?.bustCache);
    return (
      t && (await ls(t, r.totalCount ?? 0)),
      {
        workflows: r.workflows,
        searchUrl: r.searchUrl,
        totalCount: r.totalCount,
      }
    );
  };
var ls = async (e, t) => {
  if (await is())
    if (t === 0) us(e);
    else {
      let n = t > 20 ? `20+` : t.toString();
      (chrome.action.setBadgeText({ text: n, tabId: e?.id }),
        chrome.action.setBadgeBackgroundColor({
          color: Ge.colors.red500.value,
        }));
    }
};
const us = (e) => {
  chrome.action.setBadgeText({ text: ``, tabId: e?.id });
};
var ds = class extends Error {
  constructor(e, t) {
    (super(`${e}. Event source: ${t}`),
      (this.apiError = e),
      (this.name = `WorkflowFetchError`));
  }
};
const fs = async (e, t, n, r) => {
    if ((await we(), !M.user))
      throw Error(
        `Tried to view workflow but there is no user. Event source: ${n}`,
      );
    if (!r) {
      let t = await (
        await fetch(`${ze.webUrl}api/convert-workflow?workflowId=${e}`)
      ).json();
      if (t.error) throw new ds(t.error, n);
      if (((r = t.exportWorkflow), !r))
        throw Error(
          `Unexpected convert-workflow response for ${e}. Event source: ${n}`,
        );
    }
    Pi();
    let i = await ts(e),
      a = t.guidanceSessionId ?? crypto.randomUUID(),
      o = Oh()?.getSnapshot()?.context.initialUrl;
    (jh({ input: { sessionId: a } }),
      Oh()?.send({ type: `setWorkflow`, workflow: r }),
      Oh()?.send({ type: `setAgentFixes`, agentFixes: i }),
      Oh()?.send({
        type: `setTransitionsEnabled`,
        transitionsEnabled: M.featureFlags[se.CONTENTBLOCK_TRANSITION] ?? !1,
      }));
    let s = r.contentBlocks.find((e) => `url` in e && e.url),
      c = [];
    if (
      (s &&
        !t.preview &&
        !t.restarting &&
        me(s.url) &&
        (await je(s.url, { tabBehavior: t.tabBehavior ?? `always-new` }),
        c.push(s.id)),
      t.restarting)
    ) {
      let e = o || (await ge())?.url;
      e &&
        me(e) &&
        (await je(e, { tabBehavior: t.tabBehavior ?? `always-new` }));
    }
    return (
      F(B.WorkflowViewedFromExtension, { workflow_id: e, event_source: n }),
      Se(x.Viewing, {
        workflow: r,
        guidanceSessionId: a,
        preview: t.preview,
        redirectBack: t.redirectBack,
        searchQuery: t.searchQuery,
        eventSource: n,
        initialOpenedUrlContentBlockIds: c,
      }),
      r.type === u.Static && !t.preview && $o(r.workspaceId),
      r
    );
  },
  ps = async ({ workflow: e }) => {
    if ((await we(), !xe.includes(M.currentRoute))) return;
    let t = e.workspaceId,
      { workspace: n, hasHitLimit: r } = be({ workspaceId: t });
    if (r) {
      ke({ workspace: n, workflowId: e.id });
      return;
    }
    let i = e.contentBlocks.find((e) => `url` in e && e.url),
      a = [];
    (i &&
      me(i.url) &&
      (await je(i.url, { tabBehavior: `always-new` }), a.push(i.id)),
      Pi());
    let o = await ts(e.id),
      s = crypto.randomUUID();
    (jh({ input: { sessionId: s } }),
      Oh()?.send({ type: `setWorkflow`, workflow: e }),
      Oh()?.send({ type: `setAgentFixes`, agentFixes: o }),
      Oh()?.send({
        type: `setTransitionsEnabled`,
        transitionsEnabled: M.featureFlags[se.CONTENTBLOCK_TRANSITION] ?? !1,
      }),
      Se(x.Viewing, {
        preview: !0,
        workflow: e,
        guidanceSessionId: s,
        initialOpenedUrlContentBlockIds: a,
      }));
  },
  ms = async () => {
    await N({ bgWorkflows: {} });
  },
  hs = `extension_preferences`,
  gs = (e, t, n) => {
    _s().then((r) => {
      let i = { ...r, [e]: t };
      (chrome.storage.local.set({ [hs]: i }),
        e === `notificationBadge` && (t ? ss(n) : us(n)),
        Le({ name: d.ToggleUserPreference, preferences: i }),
        Fe({ name: d.ToggleUserPreference, preferences: i }));
    });
  };
async function _s() {
  let e = await chrome.storage.local.get(hs);
  return Object.assign({}, Zo, e?.extension_preferences || {});
}
const vs = async () => {
  if (M.voiceTranscripts.length !== 0 && !(!M.workflowId || !M.user))
    try {
      let { presignedURL: e } = await P(
          M.user,
        ).getWorkflowTranscriptUploadPresignedURL({
          workflowId: M.workflowId,
          fileType: `json`,
        }),
        t = {
          workflowId: M.workflowId,
          workspaceId: M.user.currentWorkspaceId,
          transcripts: M.voiceTranscripts,
        },
        n = new Blob([JSON.stringify(t)], { type: `application/json` }),
        r = await fetch(e, {
          method: `PUT`,
          body: n,
          headers: { "Content-Type": `application/json` },
        });
      if (!r.ok)
        throw Error(`Failed to upload transcript: ${r.status} ${r.statusText}`);
    } catch (e) {
      L(e, { extra: { workflowId: M.workflowId } });
    }
};
var ys = n((e, t) => {
    var n = Ke(),
      r = Ye(),
      i = `[object AsyncFunction]`,
      a = `[object Function]`,
      o = `[object GeneratorFunction]`,
      s = `[object Proxy]`;
    function c(e) {
      if (!r(e)) return !1;
      var t = n(e);
      return t == a || t == o || t == i || t == s;
    }
    t.exports = c;
  }),
  bs = n((e, t) => {
    t.exports = Qe()[`__core-js_shared__`];
  }),
  xs = n((e, t) => {
    var n = bs(),
      r = (function () {
        var e = /[^.]+$/.exec((n && n.keys && n.keys.IE_PROTO) || ``);
        return e ? `Symbol(src)_1.` + e : ``;
      })();
    function i(e) {
      return !!r && r in e;
    }
    t.exports = i;
  }),
  Ss = n((e, t) => {
    var n = Function.prototype.toString;
    function r(e) {
      if (e != null) {
        try {
          return n.call(e);
        } catch {}
        try {
          return e + ``;
        } catch {}
      }
      return ``;
    }
    t.exports = r;
  }),
  Cs = n((e, t) => {
    var n = ys(),
      r = xs(),
      i = Ye(),
      a = Ss(),
      o = /[\\^$.*+?()[\]{}|]/g,
      s = /^\[object .+?Constructor\]$/,
      c = Function.prototype,
      l = Object.prototype,
      u = c.toString,
      d = l.hasOwnProperty,
      f = RegExp(
        `^` +
          u
            .call(d)
            .replace(o, `\\$&`)
            .replace(
              /hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g,
              `$1.*?`,
            ) +
          `$`,
      );
    function p(e) {
      return !i(e) || r(e) ? !1 : (n(e) ? f : s).test(a(e));
    }
    t.exports = p;
  }),
  ws = n((e, t) => {
    function n(e, t) {
      return e?.[t];
    }
    t.exports = n;
  }),
  Ts = n((e, t) => {
    var n = Cs(),
      r = ws();
    function i(e, t) {
      var i = r(e, t);
      return n(i) ? i : void 0;
    }
    t.exports = i;
  }),
  Es = n((e, t) => {
    var n = Ts();
    t.exports = (function () {
      try {
        var e = n(Object, `defineProperty`);
        return (e({}, ``, {}), e);
      } catch {}
    })();
  }),
  Ds = n((e, t) => {
    var n = Es();
    function r(e, t, r) {
      t == `__proto__` && n
        ? n(e, t, { configurable: !0, enumerable: !0, value: r, writable: !0 })
        : (e[t] = r);
    }
    t.exports = r;
  }),
  Os = n((e, t) => {
    function n(e, t, n, r) {
      for (var i = -1, a = e == null ? 0 : e.length; ++i < a; ) {
        var o = e[i];
        t(r, o, n(o), e);
      }
      return r;
    }
    t.exports = n;
  }),
  ks = n((e, t) => {
    function n(e) {
      return function (t, n, r) {
        for (var i = -1, a = Object(t), o = r(t), s = o.length; s--; ) {
          var c = o[e ? s : ++i];
          if (n(a[c], c, a) === !1) break;
        }
        return t;
      };
    }
    t.exports = n;
  }),
  As = n((e, t) => {
    t.exports = ks()();
  }),
  js = n((e, t) => {
    function n(e, t) {
      for (var n = -1, r = Array(e); ++n < e; ) r[n] = t(n);
      return r;
    }
    t.exports = n;
  }),
  Ms = n((e, t) => {
    var n = Ke(),
      r = Je(),
      i = `[object Arguments]`;
    function a(e) {
      return r(e) && n(e) == i;
    }
    t.exports = a;
  }),
  Ns = n((e, t) => {
    var n = Ms(),
      r = Je(),
      i = Object.prototype,
      a = i.hasOwnProperty,
      o = i.propertyIsEnumerable;
    t.exports = n(
      (function () {
        return arguments;
      })(),
    )
      ? n
      : function (e) {
          return r(e) && a.call(e, `callee`) && !o.call(e, `callee`);
        };
  }),
  Ps = n((e, t) => {
    t.exports = Array.isArray;
  }),
  Fs = n((e, t) => {
    function n() {
      return !1;
    }
    t.exports = n;
  }),
  Is = n((e, t) => {
    var n = Qe(),
      r = Fs(),
      i = typeof e == `object` && e && !e.nodeType && e,
      a = i && typeof t == `object` && t && !t.nodeType && t,
      o = a && a.exports === i ? n.Buffer : void 0;
    t.exports = (o ? o.isBuffer : void 0) || r;
  }),
  Ls = n((e, t) => {
    var n = 9007199254740991,
      r = /^(?:0|[1-9]\d*)$/;
    function i(e, t) {
      var i = typeof e;
      return (
        (t ??= n),
        !!t &&
          (i == `number` || (i != `symbol` && r.test(e))) &&
          e > -1 &&
          e % 1 == 0 &&
          e < t
      );
    }
    t.exports = i;
  }),
  Rs = n((e, t) => {
    var n = 9007199254740991;
    function r(e) {
      return typeof e == `number` && e > -1 && e % 1 == 0 && e <= n;
    }
    t.exports = r;
  }),
  zs = n((e, t) => {
    var n = Ke(),
      r = Rs(),
      i = Je(),
      a = `[object Arguments]`,
      o = `[object Array]`,
      s = `[object Boolean]`,
      c = `[object Date]`,
      l = `[object Error]`,
      u = `[object Function]`,
      d = `[object Map]`,
      f = `[object Number]`,
      p = `[object Object]`,
      m = `[object RegExp]`,
      h = `[object Set]`,
      g = `[object String]`,
      _ = `[object WeakMap]`,
      v = `[object ArrayBuffer]`,
      y = `[object DataView]`,
      b = `[object Float32Array]`,
      x = `[object Float64Array]`,
      S = `[object Int8Array]`,
      C = `[object Int16Array]`,
      w = `[object Int32Array]`,
      T = `[object Uint8Array]`,
      E = `[object Uint8ClampedArray]`,
      D = `[object Uint16Array]`,
      O = `[object Uint32Array]`,
      k = {};
    ((k[b] = k[x] = k[S] = k[C] = k[w] = k[T] = k[E] = k[D] = k[O] = !0),
      (k[a] =
        k[o] =
        k[v] =
        k[s] =
        k[y] =
        k[c] =
        k[l] =
        k[u] =
        k[d] =
        k[f] =
        k[p] =
        k[m] =
        k[h] =
        k[g] =
        k[_] =
          !1));
    function A(e) {
      return i(e) && r(e.length) && !!k[n(e)];
    }
    t.exports = A;
  }),
  Bs = n((e, t) => {
    function n(e) {
      return function (t) {
        return e(t);
      };
    }
    t.exports = n;
  }),
  Vs = n((e, t) => {
    var n = qe(),
      r = typeof e == `object` && e && !e.nodeType && e,
      i = r && typeof t == `object` && t && !t.nodeType && t,
      a = i && i.exports === r && n.process;
    t.exports = (function () {
      try {
        return (
          (i && i.require && i.require(`util`).types) ||
          (a && a.binding && a.binding(`util`))
        );
      } catch {}
    })();
  }),
  Hs = n((e, t) => {
    var n = zs(),
      r = Bs(),
      i = Vs(),
      a = i && i.isTypedArray;
    t.exports = a ? r(a) : n;
  }),
  Us = n((e, t) => {
    var n = js(),
      r = Ns(),
      i = Ps(),
      a = Is(),
      o = Ls(),
      s = Hs(),
      c = Object.prototype.hasOwnProperty;
    function l(e, t) {
      var l = i(e),
        u = !l && r(e),
        d = !l && !u && a(e),
        f = !l && !u && !d && s(e),
        p = l || u || d || f,
        m = p ? n(e.length, String) : [],
        h = m.length;
      for (var g in e)
        (t || c.call(e, g)) &&
          !(
            p &&
            (g == `length` ||
              (d && (g == `offset` || g == `parent`)) ||
              (f &&
                (g == `buffer` || g == `byteLength` || g == `byteOffset`)) ||
              o(g, h))
          ) &&
          m.push(g);
      return m;
    }
    t.exports = l;
  }),
  Ws = n((e, t) => {
    var n = Object.prototype;
    function r(e) {
      var t = e && e.constructor;
      return e === ((typeof t == `function` && t.prototype) || n);
    }
    t.exports = r;
  }),
  Gs = n((e, t) => {
    function n(e, t) {
      return function (n) {
        return e(t(n));
      };
    }
    t.exports = n;
  }),
  Ks = n((e, t) => {
    t.exports = Gs()(Object.keys, Object);
  }),
  qs = n((e, t) => {
    var n = Ws(),
      r = Ks(),
      i = Object.prototype.hasOwnProperty;
    function a(e) {
      if (!n(e)) return r(e);
      var t = [];
      for (var a in Object(e)) i.call(e, a) && a != `constructor` && t.push(a);
      return t;
    }
    t.exports = a;
  }),
  Js = n((e, t) => {
    var n = ys(),
      r = Rs();
    function i(e) {
      return e != null && r(e.length) && !n(e);
    }
    t.exports = i;
  }),
  Ys = n((e, t) => {
    var n = Us(),
      r = qs(),
      i = Js();
    function a(e) {
      return i(e) ? n(e) : r(e);
    }
    t.exports = a;
  }),
  Xs = n((e, t) => {
    var n = As(),
      r = Ys();
    function i(e, t) {
      return e && n(e, t, r);
    }
    t.exports = i;
  }),
  Zs = n((e, t) => {
    var n = Js();
    function r(e, t) {
      return function (r, i) {
        if (r == null) return r;
        if (!n(r)) return e(r, i);
        for (
          var a = r.length, o = t ? a : -1, s = Object(r);
          (t ? o-- : ++o < a) && i(s[o], o, s) !== !1;
        );
        return r;
      };
    }
    t.exports = r;
  }),
  Qs = n((e, t) => {
    var n = Xs();
    t.exports = Zs()(n);
  }),
  $s = n((e, t) => {
    var n = Qs();
    function r(e, t, r, i) {
      return (
        n(e, function (e, n, a) {
          t(i, e, r(e), a);
        }),
        i
      );
    }
    t.exports = r;
  }),
  ec = n((e, t) => {
    function n() {
      ((this.__data__ = []), (this.size = 0));
    }
    t.exports = n;
  }),
  tc = n((e, t) => {
    function n(e, t) {
      return e === t || (e !== e && t !== t);
    }
    t.exports = n;
  }),
  nc = n((e, t) => {
    var n = tc();
    function r(e, t) {
      for (var r = e.length; r--; ) if (n(e[r][0], t)) return r;
      return -1;
    }
    t.exports = r;
  }),
  rc = n((e, t) => {
    var n = nc(),
      r = Array.prototype.splice;
    function i(e) {
      var t = this.__data__,
        i = n(t, e);
      return i < 0
        ? !1
        : (i == t.length - 1 ? t.pop() : r.call(t, i, 1), --this.size, !0);
    }
    t.exports = i;
  }),
  ic = n((e, t) => {
    var n = nc();
    function r(e) {
      var t = this.__data__,
        r = n(t, e);
      return r < 0 ? void 0 : t[r][1];
    }
    t.exports = r;
  }),
  ac = n((e, t) => {
    var n = nc();
    function r(e) {
      return n(this.__data__, e) > -1;
    }
    t.exports = r;
  }),
  oc = n((e, t) => {
    var n = nc();
    function r(e, t) {
      var r = this.__data__,
        i = n(r, e);
      return (i < 0 ? (++this.size, r.push([e, t])) : (r[i][1] = t), this);
    }
    t.exports = r;
  }),
  sc = n((e, t) => {
    var n = ec(),
      r = rc(),
      i = ic(),
      a = ac(),
      o = oc();
    function s(e) {
      var t = -1,
        n = e == null ? 0 : e.length;
      for (this.clear(); ++t < n; ) {
        var r = e[t];
        this.set(r[0], r[1]);
      }
    }
    ((s.prototype.clear = n),
      (s.prototype.delete = r),
      (s.prototype.get = i),
      (s.prototype.has = a),
      (s.prototype.set = o),
      (t.exports = s));
  }),
  cc = n((e, t) => {
    var n = sc();
    function r() {
      ((this.__data__ = new n()), (this.size = 0));
    }
    t.exports = r;
  }),
  lc = n((e, t) => {
    function n(e) {
      var t = this.__data__,
        n = t.delete(e);
      return ((this.size = t.size), n);
    }
    t.exports = n;
  }),
  uc = n((e, t) => {
    function n(e) {
      return this.__data__.get(e);
    }
    t.exports = n;
  }),
  dc = n((e, t) => {
    function n(e) {
      return this.__data__.has(e);
    }
    t.exports = n;
  }),
  fc = n((e, t) => {
    t.exports = Ts()(Qe(), `Map`);
  }),
  pc = n((e, t) => {
    t.exports = Ts()(Object, `create`);
  }),
  mc = n((e, t) => {
    var n = pc();
    function r() {
      ((this.__data__ = n ? n(null) : {}), (this.size = 0));
    }
    t.exports = r;
  }),
  hc = n((e, t) => {
    function n(e) {
      var t = this.has(e) && delete this.__data__[e];
      return ((this.size -= t ? 1 : 0), t);
    }
    t.exports = n;
  }),
  gc = n((e, t) => {
    var n = pc(),
      r = `__lodash_hash_undefined__`,
      i = Object.prototype.hasOwnProperty;
    function a(e) {
      var t = this.__data__;
      if (n) {
        var a = t[e];
        return a === r ? void 0 : a;
      }
      return i.call(t, e) ? t[e] : void 0;
    }
    t.exports = a;
  }),
  _c = n((e, t) => {
    var n = pc(),
      r = Object.prototype.hasOwnProperty;
    function i(e) {
      var t = this.__data__;
      return n ? t[e] !== void 0 : r.call(t, e);
    }
    t.exports = i;
  }),
  vc = n((e, t) => {
    var n = pc(),
      r = `__lodash_hash_undefined__`;
    function i(e, t) {
      var i = this.__data__;
      return (
        (this.size += this.has(e) ? 0 : 1),
        (i[e] = n && t === void 0 ? r : t),
        this
      );
    }
    t.exports = i;
  }),
  yc = n((e, t) => {
    var n = mc(),
      r = hc(),
      i = gc(),
      a = _c(),
      o = vc();
    function s(e) {
      var t = -1,
        n = e == null ? 0 : e.length;
      for (this.clear(); ++t < n; ) {
        var r = e[t];
        this.set(r[0], r[1]);
      }
    }
    ((s.prototype.clear = n),
      (s.prototype.delete = r),
      (s.prototype.get = i),
      (s.prototype.has = a),
      (s.prototype.set = o),
      (t.exports = s));
  }),
  bc = n((e, t) => {
    var n = yc(),
      r = sc(),
      i = fc();
    function a() {
      ((this.size = 0),
        (this.__data__ = {
          hash: new n(),
          map: new (i || r)(),
          string: new n(),
        }));
    }
    t.exports = a;
  }),
  xc = n((e, t) => {
    function n(e) {
      var t = typeof e;
      return t == `string` || t == `number` || t == `symbol` || t == `boolean`
        ? e !== `__proto__`
        : e === null;
    }
    t.exports = n;
  }),
  Sc = n((e, t) => {
    var n = xc();
    function r(e, t) {
      var r = e.__data__;
      return n(t) ? r[typeof t == `string` ? `string` : `hash`] : r.map;
    }
    t.exports = r;
  }),
  Cc = n((e, t) => {
    var n = Sc();
    function r(e) {
      var t = n(this, e).delete(e);
      return ((this.size -= t ? 1 : 0), t);
    }
    t.exports = r;
  }),
  wc = n((e, t) => {
    var n = Sc();
    function r(e) {
      return n(this, e).get(e);
    }
    t.exports = r;
  }),
  Tc = n((e, t) => {
    var n = Sc();
    function r(e) {
      return n(this, e).has(e);
    }
    t.exports = r;
  }),
  Ec = n((e, t) => {
    var n = Sc();
    function r(e, t) {
      var r = n(this, e),
        i = r.size;
      return (r.set(e, t), (this.size += r.size == i ? 0 : 1), this);
    }
    t.exports = r;
  }),
  Dc = n((e, t) => {
    var n = bc(),
      r = Cc(),
      i = wc(),
      a = Tc(),
      o = Ec();
    function s(e) {
      var t = -1,
        n = e == null ? 0 : e.length;
      for (this.clear(); ++t < n; ) {
        var r = e[t];
        this.set(r[0], r[1]);
      }
    }
    ((s.prototype.clear = n),
      (s.prototype.delete = r),
      (s.prototype.get = i),
      (s.prototype.has = a),
      (s.prototype.set = o),
      (t.exports = s));
  }),
  Oc = n((e, t) => {
    var n = sc(),
      r = fc(),
      i = Dc(),
      a = 200;
    function o(e, t) {
      var o = this.__data__;
      if (o instanceof n) {
        var s = o.__data__;
        if (!r || s.length < a - 1)
          return (s.push([e, t]), (this.size = ++o.size), this);
        o = this.__data__ = new i(s);
      }
      return (o.set(e, t), (this.size = o.size), this);
    }
    t.exports = o;
  }),
  kc = n((e, t) => {
    var n = sc(),
      r = cc(),
      i = lc(),
      a = uc(),
      o = dc(),
      s = Oc();
    function c(e) {
      this.size = (this.__data__ = new n(e)).size;
    }
    ((c.prototype.clear = r),
      (c.prototype.delete = i),
      (c.prototype.get = a),
      (c.prototype.has = o),
      (c.prototype.set = s),
      (t.exports = c));
  }),
  Ac = n((e, t) => {
    var n = `__lodash_hash_undefined__`;
    function r(e) {
      return (this.__data__.set(e, n), this);
    }
    t.exports = r;
  }),
  jc = n((e, t) => {
    function n(e) {
      return this.__data__.has(e);
    }
    t.exports = n;
  }),
  Mc = n((e, t) => {
    var n = Dc(),
      r = Ac(),
      i = jc();
    function a(e) {
      var t = -1,
        r = e == null ? 0 : e.length;
      for (this.__data__ = new n(); ++t < r; ) this.add(e[t]);
    }
    ((a.prototype.add = a.prototype.push = r),
      (a.prototype.has = i),
      (t.exports = a));
  }),
  Nc = n((e, t) => {
    function n(e, t) {
      for (var n = -1, r = e == null ? 0 : e.length; ++n < r; )
        if (t(e[n], n, e)) return !0;
      return !1;
    }
    t.exports = n;
  }),
  Pc = n((e, t) => {
    function n(e, t) {
      return e.has(t);
    }
    t.exports = n;
  }),
  Fc = n((e, t) => {
    var n = Mc(),
      r = Nc(),
      i = Pc(),
      a = 1,
      o = 2;
    function s(e, t, s, c, l, u) {
      var d = s & a,
        f = e.length,
        p = t.length;
      if (f != p && !(d && p > f)) return !1;
      var m = u.get(e),
        h = u.get(t);
      if (m && h) return m == t && h == e;
      var g = -1,
        _ = !0,
        v = s & o ? new n() : void 0;
      for (u.set(e, t), u.set(t, e); ++g < f; ) {
        var y = e[g],
          b = t[g];
        if (c) var x = d ? c(b, y, g, t, e, u) : c(y, b, g, e, t, u);
        if (x !== void 0) {
          if (x) continue;
          _ = !1;
          break;
        }
        if (v) {
          if (
            !r(t, function (e, t) {
              if (!i(v, t) && (y === e || l(y, e, s, c, u))) return v.push(t);
            })
          ) {
            _ = !1;
            break;
          }
        } else if (!(y === b || l(y, b, s, c, u))) {
          _ = !1;
          break;
        }
      }
      return (u.delete(e), u.delete(t), _);
    }
    t.exports = s;
  }),
  Ic = n((e, t) => {
    t.exports = Qe().Uint8Array;
  }),
  Lc = n((e, t) => {
    function n(e) {
      var t = -1,
        n = Array(e.size);
      return (
        e.forEach(function (e, r) {
          n[++t] = [r, e];
        }),
        n
      );
    }
    t.exports = n;
  }),
  Rc = n((e, t) => {
    function n(e) {
      var t = -1,
        n = Array(e.size);
      return (
        e.forEach(function (e) {
          n[++t] = e;
        }),
        n
      );
    }
    t.exports = n;
  }),
  zc = n((e, t) => {
    var n = Xe(),
      r = Ic(),
      i = tc(),
      a = Fc(),
      o = Lc(),
      s = Rc(),
      c = 1,
      l = 2,
      u = `[object Boolean]`,
      d = `[object Date]`,
      f = `[object Error]`,
      p = `[object Map]`,
      m = `[object Number]`,
      h = `[object RegExp]`,
      g = `[object Set]`,
      _ = `[object String]`,
      v = `[object Symbol]`,
      y = `[object ArrayBuffer]`,
      b = `[object DataView]`,
      x = n ? n.prototype : void 0,
      S = x ? x.valueOf : void 0;
    function C(e, t, n, x, C, w, T) {
      switch (n) {
        case b:
          if (e.byteLength != t.byteLength || e.byteOffset != t.byteOffset)
            return !1;
          ((e = e.buffer), (t = t.buffer));
        case y:
          return !(e.byteLength != t.byteLength || !w(new r(e), new r(t)));
        case u:
        case d:
        case m:
          return i(+e, +t);
        case f:
          return e.name == t.name && e.message == t.message;
        case h:
        case _:
          return e == t + ``;
        case p:
          var E = o;
        case g:
          var D = x & c;
          if (((E ||= s), e.size != t.size && !D)) return !1;
          var O = T.get(e);
          if (O) return O == t;
          ((x |= l), T.set(e, t));
          var k = a(E(e), E(t), x, C, w, T);
          return (T.delete(e), k);
        case v:
          if (S) return S.call(e) == S.call(t);
      }
      return !1;
    }
    t.exports = C;
  }),
  Bc = n((e, t) => {
    function n(e, t) {
      for (var n = -1, r = t.length, i = e.length; ++n < r; ) e[i + n] = t[n];
      return e;
    }
    t.exports = n;
  }),
  Vc = n((e, t) => {
    var n = Bc(),
      r = Ps();
    function i(e, t, i) {
      var a = t(e);
      return r(e) ? a : n(a, i(e));
    }
    t.exports = i;
  }),
  Hc = n((e, t) => {
    function n(e, t) {
      for (var n = -1, r = e == null ? 0 : e.length, i = 0, a = []; ++n < r; ) {
        var o = e[n];
        t(o, n, e) && (a[i++] = o);
      }
      return a;
    }
    t.exports = n;
  }),
  Uc = n((e, t) => {
    function n() {
      return [];
    }
    t.exports = n;
  }),
  Wc = n((e, t) => {
    var n = Hc(),
      r = Uc(),
      i = Object.prototype.propertyIsEnumerable,
      a = Object.getOwnPropertySymbols;
    t.exports = a
      ? function (e) {
          return e == null
            ? []
            : ((e = Object(e)),
              n(a(e), function (t) {
                return i.call(e, t);
              }));
        }
      : r;
  }),
  Gc = n((e, t) => {
    var n = Vc(),
      r = Wc(),
      i = Ys();
    function a(e) {
      return n(e, i, r);
    }
    t.exports = a;
  }),
  Kc = n((e, t) => {
    var n = Gc(),
      r = 1,
      i = Object.prototype.hasOwnProperty;
    function a(e, t, a, o, s, c) {
      var l = a & r,
        u = n(e),
        d = u.length;
      if (d != n(t).length && !l) return !1;
      for (var f = d; f--; ) {
        var p = u[f];
        if (!(l ? p in t : i.call(t, p))) return !1;
      }
      var m = c.get(e),
        h = c.get(t);
      if (m && h) return m == t && h == e;
      var g = !0;
      (c.set(e, t), c.set(t, e));
      for (var _ = l; ++f < d; ) {
        p = u[f];
        var v = e[p],
          y = t[p];
        if (o) var b = l ? o(y, v, p, t, e, c) : o(v, y, p, e, t, c);
        if (!(b === void 0 ? v === y || s(v, y, a, o, c) : b)) {
          g = !1;
          break;
        }
        _ ||= p == `constructor`;
      }
      if (g && !_) {
        var x = e.constructor,
          S = t.constructor;
        x != S &&
          `constructor` in e &&
          `constructor` in t &&
          !(
            typeof x == `function` &&
            x instanceof x &&
            typeof S == `function` &&
            S instanceof S
          ) &&
          (g = !1);
      }
      return (c.delete(e), c.delete(t), g);
    }
    t.exports = a;
  }),
  qc = n((e, t) => {
    t.exports = Ts()(Qe(), `DataView`);
  }),
  Jc = n((e, t) => {
    t.exports = Ts()(Qe(), `Promise`);
  }),
  Yc = n((e, t) => {
    t.exports = Ts()(Qe(), `Set`);
  }),
  Xc = n((e, t) => {
    t.exports = Ts()(Qe(), `WeakMap`);
  }),
  Zc = n((e, t) => {
    var n = qc(),
      r = fc(),
      i = Jc(),
      a = Yc(),
      o = Xc(),
      s = Ke(),
      c = Ss(),
      l = `[object Map]`,
      u = `[object Object]`,
      d = `[object Promise]`,
      f = `[object Set]`,
      p = `[object WeakMap]`,
      m = `[object DataView]`,
      h = c(n),
      g = c(r),
      _ = c(i),
      v = c(a),
      y = c(o),
      b = s;
    (((n && b(new n(new ArrayBuffer(1))) != m) ||
      (r && b(new r()) != l) ||
      (i && b(i.resolve()) != d) ||
      (a && b(new a()) != f) ||
      (o && b(new o()) != p)) &&
      (b = function (e) {
        var t = s(e),
          n = t == u ? e.constructor : void 0,
          r = n ? c(n) : ``;
        if (r)
          switch (r) {
            case h:
              return m;
            case g:
              return l;
            case _:
              return d;
            case v:
              return f;
            case y:
              return p;
          }
        return t;
      }),
      (t.exports = b));
  }),
  Qc = n((e, t) => {
    var n = kc(),
      r = Fc(),
      i = zc(),
      a = Kc(),
      o = Zc(),
      s = Ps(),
      c = Is(),
      l = Hs(),
      u = 1,
      d = `[object Arguments]`,
      f = `[object Array]`,
      p = `[object Object]`,
      m = Object.prototype.hasOwnProperty;
    function h(e, t, h, g, _, v) {
      var y = s(e),
        b = s(t),
        x = y ? f : o(e),
        S = b ? f : o(t);
      ((x = x == d ? p : x), (S = S == d ? p : S));
      var C = x == p,
        w = S == p,
        T = x == S;
      if (T && c(e)) {
        if (!c(t)) return !1;
        ((y = !0), (C = !1));
      }
      if (T && !C)
        return (
          (v ||= new n()),
          y || l(e) ? r(e, t, h, g, _, v) : i(e, t, x, h, g, _, v)
        );
      if (!(h & u)) {
        var E = C && m.call(e, `__wrapped__`),
          D = w && m.call(t, `__wrapped__`);
        if (E || D) {
          var O = E ? e.value() : e,
            k = D ? t.value() : t;
          return ((v ||= new n()), _(O, k, h, g, v));
        }
      }
      return T ? ((v ||= new n()), a(e, t, h, g, _, v)) : !1;
    }
    t.exports = h;
  }),
  $c = n((e, t) => {
    var n = Qc(),
      r = Je();
    function i(e, t, a, o, s) {
      return e === t
        ? !0
        : e == null || t == null || (!r(e) && !r(t))
          ? e !== e && t !== t
          : n(e, t, a, o, i, s);
    }
    t.exports = i;
  }),
  el = n((e, t) => {
    var n = kc(),
      r = $c(),
      i = 1,
      a = 2;
    function o(e, t, o, s) {
      var c = o.length,
        l = c,
        u = !s;
      if (e == null) return !l;
      for (e = Object(e); c--; ) {
        var d = o[c];
        if (u && d[2] ? d[1] !== e[d[0]] : !(d[0] in e)) return !1;
      }
      for (; ++c < l; ) {
        d = o[c];
        var f = d[0],
          p = e[f],
          m = d[1];
        if (u && d[2]) {
          if (p === void 0 && !(f in e)) return !1;
        } else {
          var h = new n();
          if (s) var g = s(p, m, f, e, t, h);
          if (!(g === void 0 ? r(m, p, i | a, s, h) : g)) return !1;
        }
      }
      return !0;
    }
    t.exports = o;
  }),
  tl = n((e, t) => {
    var n = Ye();
    function r(e) {
      return e === e && !n(e);
    }
    t.exports = r;
  }),
  nl = n((e, t) => {
    var n = tl(),
      r = Ys();
    function i(e) {
      for (var t = r(e), i = t.length; i--; ) {
        var a = t[i],
          o = e[a];
        t[i] = [a, o, n(o)];
      }
      return t;
    }
    t.exports = i;
  }),
  rl = n((e, t) => {
    function n(e, t) {
      return function (n) {
        return n == null ? !1 : n[e] === t && (t !== void 0 || e in Object(n));
      };
    }
    t.exports = n;
  }),
  il = n((e, t) => {
    var n = el(),
      r = nl(),
      i = rl();
    function a(e) {
      var t = r(e);
      return t.length == 1 && t[0][2]
        ? i(t[0][0], t[0][1])
        : function (r) {
            return r === e || n(r, e, t);
          };
    }
    t.exports = a;
  }),
  al = n((e, t) => {
    var n = Ps(),
      r = Ze(),
      i = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
      a = /^\w*$/;
    function o(e, t) {
      if (n(e)) return !1;
      var o = typeof e;
      return o == `number` ||
        o == `symbol` ||
        o == `boolean` ||
        e == null ||
        r(e)
        ? !0
        : a.test(e) || !i.test(e) || (t != null && e in Object(t));
    }
    t.exports = o;
  }),
  ol = n((e, t) => {
    var n = Dc(),
      r = `Expected a function`;
    function i(e, t) {
      if (typeof e != `function` || (t != null && typeof t != `function`))
        throw TypeError(r);
      var a = function () {
        var n = arguments,
          r = t ? t.apply(this, n) : n[0],
          i = a.cache;
        if (i.has(r)) return i.get(r);
        var o = e.apply(this, n);
        return ((a.cache = i.set(r, o) || i), o);
      };
      return ((a.cache = new (i.Cache || n)()), a);
    }
    ((i.Cache = n), (t.exports = i));
  }),
  sl = n((e, t) => {
    var n = ol(),
      r = 500;
    function i(e) {
      var t = n(e, function (e) {
          return (i.size === r && i.clear(), e);
        }),
        i = t.cache;
      return t;
    }
    t.exports = i;
  }),
  cl = n((e, t) => {
    var n = sl(),
      r =
        /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g,
      i = /\\(\\)?/g;
    t.exports = n(function (e) {
      var t = [];
      return (
        e.charCodeAt(0) === 46 && t.push(``),
        e.replace(r, function (e, n, r, a) {
          t.push(r ? a.replace(i, `$1`) : n || e);
        }),
        t
      );
    });
  }),
  ll = n((e, t) => {
    function n(e, t) {
      for (var n = -1, r = e == null ? 0 : e.length, i = Array(r); ++n < r; )
        i[n] = t(e[n], n, e);
      return i;
    }
    t.exports = n;
  }),
  ul = n((e, t) => {
    var n = Xe(),
      r = ll(),
      i = Ps(),
      a = Ze(),
      o = 1 / 0,
      s = n ? n.prototype : void 0,
      c = s ? s.toString : void 0;
    function l(e) {
      if (typeof e == `string`) return e;
      if (i(e)) return r(e, l) + ``;
      if (a(e)) return c ? c.call(e) : ``;
      var t = e + ``;
      return t == `0` && 1 / e == -o ? `-0` : t;
    }
    t.exports = l;
  }),
  dl = n((e, t) => {
    var n = ul();
    function r(e) {
      return e == null ? `` : n(e);
    }
    t.exports = r;
  }),
  fl = n((e, t) => {
    var n = Ps(),
      r = al(),
      i = cl(),
      a = dl();
    function o(e, t) {
      return n(e) ? e : r(e, t) ? [e] : i(a(e));
    }
    t.exports = o;
  }),
  pl = n((e, t) => {
    var n = Ze(),
      r = 1 / 0;
    function i(e) {
      if (typeof e == `string` || n(e)) return e;
      var t = e + ``;
      return t == `0` && 1 / e == -r ? `-0` : t;
    }
    t.exports = i;
  }),
  ml = n((e, t) => {
    var n = fl(),
      r = pl();
    function i(e, t) {
      t = n(t, e);
      for (var i = 0, a = t.length; e != null && i < a; ) e = e[r(t[i++])];
      return i && i == a ? e : void 0;
    }
    t.exports = i;
  }),
  hl = n((e, t) => {
    var n = ml();
    function r(e, t, r) {
      var i = e == null ? void 0 : n(e, t);
      return i === void 0 ? r : i;
    }
    t.exports = r;
  }),
  gl = n((e, t) => {
    function n(e, t) {
      return e != null && t in Object(e);
    }
    t.exports = n;
  }),
  _l = n((e, t) => {
    var n = fl(),
      r = Ns(),
      i = Ps(),
      a = Ls(),
      o = Rs(),
      s = pl();
    function c(e, t, c) {
      t = n(t, e);
      for (var l = -1, u = t.length, d = !1; ++l < u; ) {
        var f = s(t[l]);
        if (!(d = e != null && c(e, f))) break;
        e = e[f];
      }
      return d || ++l != u
        ? d
        : ((u = e == null ? 0 : e.length),
          !!u && o(u) && a(f, u) && (i(e) || r(e)));
    }
    t.exports = c;
  }),
  vl = n((e, t) => {
    var n = gl(),
      r = _l();
    function i(e, t) {
      return e != null && r(e, t, n);
    }
    t.exports = i;
  }),
  yl = n((e, t) => {
    var n = $c(),
      r = hl(),
      i = vl(),
      a = al(),
      o = tl(),
      s = rl(),
      c = pl(),
      l = 1,
      u = 2;
    function d(e, t) {
      return a(e) && o(t)
        ? s(c(e), t)
        : function (a) {
            var o = r(a, e);
            return o === void 0 && o === t ? i(a, e) : n(t, o, l | u);
          };
    }
    t.exports = d;
  }),
  bl = n((e, t) => {
    function n(e) {
      return e;
    }
    t.exports = n;
  }),
  xl = n((e, t) => {
    function n(e) {
      return function (t) {
        return t?.[e];
      };
    }
    t.exports = n;
  }),
  Sl = n((e, t) => {
    var n = ml();
    function r(e) {
      return function (t) {
        return n(t, e);
      };
    }
    t.exports = r;
  }),
  Cl = n((e, t) => {
    var n = xl(),
      r = Sl(),
      i = al(),
      a = pl();
    function o(e) {
      return i(e) ? n(a(e)) : r(e);
    }
    t.exports = o;
  }),
  wl = n((e, t) => {
    var n = il(),
      r = yl(),
      i = bl(),
      a = Ps(),
      o = Cl();
    function s(e) {
      return typeof e == `function`
        ? e
        : e == null
          ? i
          : typeof e == `object`
            ? a(e)
              ? r(e[0], e[1])
              : n(e)
            : o(e);
    }
    t.exports = s;
  }),
  Tl = n((e, t) => {
    var n = Os(),
      r = $s(),
      i = wl(),
      a = Ps();
    function o(e, t) {
      return function (o, s) {
        var c = a(o) ? n : r,
          l = t ? t() : {};
        return c(o, e, i(s, 2), l);
      };
    }
    t.exports = o;
  }),
  El = n((e, t) => {
    var n = Ds(),
      r = Tl(),
      i = Object.prototype.hasOwnProperty;
    t.exports = r(function (e, t, r) {
      i.call(e, r) ? e[r].push(t) : n(e, r, [t]);
    });
  }),
  Dl = n((e, t) => {
    t.exports = {};
  }),
  Ol = n((t, n) => {
    (function (e, r) {
      typeof t == `object`
        ? (n.exports = t = r())
        : typeof define == `function` && define.amd
          ? define([], r)
          : (e.CryptoJS = r());
    })(t, function () {
      var t =
        t ||
        (function (t, n) {
          var r;
          if (
            (typeof window < `u` && window.crypto && (r = window.crypto),
            typeof self < `u` && self.crypto && (r = self.crypto),
            typeof globalThis < `u` &&
              globalThis.crypto &&
              (r = globalThis.crypto),
            !r &&
              typeof window < `u` &&
              window.msCrypto &&
              (r = window.msCrypto),
            !r && typeof global < `u` && global.crypto && (r = global.crypto),
            !r && typeof e == `function`)
          )
            try {
              r = Dl();
            } catch {}
          var i = function () {
              if (r) {
                if (typeof r.getRandomValues == `function`)
                  try {
                    return r.getRandomValues(new Uint32Array(1))[0];
                  } catch {}
                if (typeof r.randomBytes == `function`)
                  try {
                    return r.randomBytes(4).readInt32LE();
                  } catch {}
              }
              throw Error(
                `Native crypto module could not be used to get secure random number.`,
              );
            },
            a =
              Object.create ||
              (function () {
                function e() {}
                return function (t) {
                  var n;
                  return (
                    (e.prototype = t),
                    (n = new e()),
                    (e.prototype = null),
                    n
                  );
                };
              })(),
            o = {},
            s = (o.lib = {}),
            c = (s.Base = (function () {
              return {
                extend: function (e) {
                  var t = a(this);
                  return (
                    e && t.mixIn(e),
                    (!t.hasOwnProperty(`init`) || this.init === t.init) &&
                      (t.init = function () {
                        t.$super.init.apply(this, arguments);
                      }),
                    (t.init.prototype = t),
                    (t.$super = this),
                    t
                  );
                },
                create: function () {
                  var e = this.extend();
                  return (e.init.apply(e, arguments), e);
                },
                init: function () {},
                mixIn: function (e) {
                  for (var t in e) e.hasOwnProperty(t) && (this[t] = e[t]);
                  e.hasOwnProperty(`toString`) && (this.toString = e.toString);
                },
                clone: function () {
                  return this.init.prototype.extend(this);
                },
              };
            })()),
            l = (s.WordArray = c.extend({
              init: function (e, t) {
                ((e = this.words = e || []),
                  t == n
                    ? (this.sigBytes = e.length * 4)
                    : (this.sigBytes = t));
              },
              toString: function (e) {
                return (e || d).stringify(this);
              },
              concat: function (e) {
                var t = this.words,
                  n = e.words,
                  r = this.sigBytes,
                  i = e.sigBytes;
                if ((this.clamp(), r % 4))
                  for (var a = 0; a < i; a++) {
                    var o = (n[a >>> 2] >>> (24 - (a % 4) * 8)) & 255;
                    t[(r + a) >>> 2] |= o << (24 - ((r + a) % 4) * 8);
                  }
                else
                  for (var s = 0; s < i; s += 4) t[(r + s) >>> 2] = n[s >>> 2];
                return ((this.sigBytes += i), this);
              },
              clamp: function () {
                var e = this.words,
                  n = this.sigBytes;
                ((e[n >>> 2] &= 4294967295 << (32 - (n % 4) * 8)),
                  (e.length = t.ceil(n / 4)));
              },
              clone: function () {
                var e = c.clone.call(this);
                return ((e.words = this.words.slice(0)), e);
              },
              random: function (e) {
                for (var t = [], n = 0; n < e; n += 4) t.push(i());
                return new l.init(t, e);
              },
            })),
            u = (o.enc = {}),
            d = (u.Hex = {
              stringify: function (e) {
                for (
                  var t = e.words, n = e.sigBytes, r = [], i = 0;
                  i < n;
                  i++
                ) {
                  var a = (t[i >>> 2] >>> (24 - (i % 4) * 8)) & 255;
                  (r.push((a >>> 4).toString(16)),
                    r.push((a & 15).toString(16)));
                }
                return r.join(``);
              },
              parse: function (e) {
                for (var t = e.length, n = [], r = 0; r < t; r += 2)
                  n[r >>> 3] |=
                    parseInt(e.substr(r, 2), 16) << (24 - (r % 8) * 4);
                return new l.init(n, t / 2);
              },
            }),
            f = (u.Latin1 = {
              stringify: function (e) {
                for (
                  var t = e.words, n = e.sigBytes, r = [], i = 0;
                  i < n;
                  i++
                ) {
                  var a = (t[i >>> 2] >>> (24 - (i % 4) * 8)) & 255;
                  r.push(String.fromCharCode(a));
                }
                return r.join(``);
              },
              parse: function (e) {
                for (var t = e.length, n = [], r = 0; r < t; r++)
                  n[r >>> 2] |= (e.charCodeAt(r) & 255) << (24 - (r % 4) * 8);
                return new l.init(n, t);
              },
            }),
            p = (u.Utf8 = {
              stringify: function (e) {
                try {
                  return decodeURIComponent(escape(f.stringify(e)));
                } catch {
                  throw Error(`Malformed UTF-8 data`);
                }
              },
              parse: function (e) {
                return f.parse(unescape(encodeURIComponent(e)));
              },
            }),
            m = (s.BufferedBlockAlgorithm = c.extend({
              reset: function () {
                ((this._data = new l.init()), (this._nDataBytes = 0));
              },
              _append: function (e) {
                (typeof e == `string` && (e = p.parse(e)),
                  this._data.concat(e),
                  (this._nDataBytes += e.sigBytes));
              },
              _process: function (e) {
                var n,
                  r = this._data,
                  i = r.words,
                  a = r.sigBytes,
                  o = this.blockSize,
                  s = a / (o * 4);
                s = e ? t.ceil(s) : t.max((s | 0) - this._minBufferSize, 0);
                var c = s * o,
                  u = t.min(c * 4, a);
                if (c) {
                  for (var d = 0; d < c; d += o) this._doProcessBlock(i, d);
                  ((n = i.splice(0, c)), (r.sigBytes -= u));
                }
                return new l.init(n, u);
              },
              clone: function () {
                var e = c.clone.call(this);
                return ((e._data = this._data.clone()), e);
              },
              _minBufferSize: 0,
            }));
          s.Hasher = m.extend({
            cfg: c.extend(),
            init: function (e) {
              ((this.cfg = this.cfg.extend(e)), this.reset());
            },
            reset: function () {
              (m.reset.call(this), this._doReset());
            },
            update: function (e) {
              return (this._append(e), this._process(), this);
            },
            finalize: function (e) {
              return (e && this._append(e), this._doFinalize());
            },
            blockSize: 512 / 32,
            _createHelper: function (e) {
              return function (t, n) {
                return new e.init(n).finalize(t);
              };
            },
            _createHmacHelper: function (e) {
              return function (t, n) {
                return new h.HMAC.init(e, n).finalize(t);
              };
            },
          });
          var h = (o.algo = {});
          return o;
        })(Math);
      return t;
    });
  }),
  kl = n((e, t) => {
    (function (n, r) {
      typeof e == `object`
        ? (t.exports = e = r(Ol()))
        : typeof define == `function` && define.amd
          ? define([`./core`], r)
          : r(n.CryptoJS);
    })(e, function (e) {
      return (
        (function () {
          var t = e,
            n = t.lib.WordArray,
            r = t.enc;
          r.Base64 = {
            stringify: function (e) {
              var t = e.words,
                n = e.sigBytes,
                r = this._map;
              e.clamp();
              for (var i = [], a = 0; a < n; a += 3)
                for (
                  var o = (t[a >>> 2] >>> (24 - (a % 4) * 8)) & 255,
                    s = (t[(a + 1) >>> 2] >>> (24 - ((a + 1) % 4) * 8)) & 255,
                    c = (t[(a + 2) >>> 2] >>> (24 - ((a + 2) % 4) * 8)) & 255,
                    l = (o << 16) | (s << 8) | c,
                    u = 0;
                  u < 4 && a + u * 0.75 < n;
                  u++
                )
                  i.push(r.charAt((l >>> (6 * (3 - u))) & 63));
              var d = r.charAt(64);
              if (d) for (; i.length % 4; ) i.push(d);
              return i.join(``);
            },
            parse: function (e) {
              var t = e.length,
                n = this._map,
                r = this._reverseMap;
              if (!r) {
                r = this._reverseMap = [];
                for (var a = 0; a < n.length; a++) r[n.charCodeAt(a)] = a;
              }
              var o = n.charAt(64);
              if (o) {
                var s = e.indexOf(o);
                s !== -1 && (t = s);
              }
              return i(e, t, r);
            },
            _map: `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=`,
          };
          function i(e, t, r) {
            for (var i = [], a = 0, o = 0; o < t; o++)
              if (o % 4) {
                var s =
                  (r[e.charCodeAt(o - 1)] << ((o % 4) * 2)) |
                  (r[e.charCodeAt(o)] >>> (6 - (o % 4) * 2));
                ((i[a >>> 2] |= s << (24 - (a % 4) * 8)), a++);
              }
            return n.create(i, a);
          }
        })(),
        e.enc.Base64
      );
    });
  }),
  Al = n((e, t) => {
    (function (n, r) {
      typeof e == `object`
        ? (t.exports = e = r(Ol()))
        : typeof define == `function` && define.amd
          ? define([`./core`], r)
          : r(n.CryptoJS);
    })(e, function (e) {
      return (
        (function () {
          if (typeof ArrayBuffer == `function`) {
            var t = e.lib.WordArray,
              n = t.init,
              r = (t.init = function (e) {
                if (
                  (e instanceof ArrayBuffer && (e = new Uint8Array(e)),
                  (e instanceof Int8Array ||
                    (typeof Uint8ClampedArray < `u` &&
                      e instanceof Uint8ClampedArray) ||
                    e instanceof Int16Array ||
                    e instanceof Uint16Array ||
                    e instanceof Int32Array ||
                    e instanceof Uint32Array ||
                    e instanceof Float32Array ||
                    e instanceof Float64Array) &&
                    (e = new Uint8Array(e.buffer, e.byteOffset, e.byteLength)),
                  e instanceof Uint8Array)
                ) {
                  for (var t = e.byteLength, r = [], i = 0; i < t; i++)
                    r[i >>> 2] |= e[i] << (24 - (i % 4) * 8);
                  n.call(this, r, t);
                } else n.apply(this, arguments);
              });
            r.prototype = t;
          }
        })(),
        e.lib.WordArray
      );
    });
  }),
  jl = n((e, t) => {
    (function (n, r) {
      typeof e == `object`
        ? (t.exports = e = r(Ol()))
        : typeof define == `function` && define.amd
          ? define([`./core`], r)
          : r(n.CryptoJS);
    })(e, function (e) {
      return (
        (function (t) {
          var n = e,
            r = n.lib,
            i = r.WordArray,
            a = r.Hasher,
            o = n.algo,
            s = [];
          (function () {
            for (var e = 0; e < 64; e++)
              s[e] = (t.abs(t.sin(e + 1)) * 4294967296) | 0;
          })();
          var c = (o.MD5 = a.extend({
            _doReset: function () {
              this._hash = new i.init([
                1732584193, 4023233417, 2562383102, 271733878,
              ]);
            },
            _doProcessBlock: function (e, t) {
              for (var n = 0; n < 16; n++) {
                var r = t + n,
                  i = e[r];
                e[r] =
                  (((i << 8) | (i >>> 24)) & 16711935) |
                  (((i << 24) | (i >>> 8)) & 4278255360);
              }
              var a = this._hash.words,
                o = e[t + 0],
                c = e[t + 1],
                p = e[t + 2],
                m = e[t + 3],
                h = e[t + 4],
                g = e[t + 5],
                _ = e[t + 6],
                v = e[t + 7],
                y = e[t + 8],
                b = e[t + 9],
                x = e[t + 10],
                S = e[t + 11],
                C = e[t + 12],
                w = e[t + 13],
                T = e[t + 14],
                E = e[t + 15],
                D = a[0],
                O = a[1],
                k = a[2],
                A = a[3];
              ((D = l(D, O, k, A, o, 7, s[0])),
                (A = l(A, D, O, k, c, 12, s[1])),
                (k = l(k, A, D, O, p, 17, s[2])),
                (O = l(O, k, A, D, m, 22, s[3])),
                (D = l(D, O, k, A, h, 7, s[4])),
                (A = l(A, D, O, k, g, 12, s[5])),
                (k = l(k, A, D, O, _, 17, s[6])),
                (O = l(O, k, A, D, v, 22, s[7])),
                (D = l(D, O, k, A, y, 7, s[8])),
                (A = l(A, D, O, k, b, 12, s[9])),
                (k = l(k, A, D, O, x, 17, s[10])),
                (O = l(O, k, A, D, S, 22, s[11])),
                (D = l(D, O, k, A, C, 7, s[12])),
                (A = l(A, D, O, k, w, 12, s[13])),
                (k = l(k, A, D, O, T, 17, s[14])),
                (O = l(O, k, A, D, E, 22, s[15])),
                (D = u(D, O, k, A, c, 5, s[16])),
                (A = u(A, D, O, k, _, 9, s[17])),
                (k = u(k, A, D, O, S, 14, s[18])),
                (O = u(O, k, A, D, o, 20, s[19])),
                (D = u(D, O, k, A, g, 5, s[20])),
                (A = u(A, D, O, k, x, 9, s[21])),
                (k = u(k, A, D, O, E, 14, s[22])),
                (O = u(O, k, A, D, h, 20, s[23])),
                (D = u(D, O, k, A, b, 5, s[24])),
                (A = u(A, D, O, k, T, 9, s[25])),
                (k = u(k, A, D, O, m, 14, s[26])),
                (O = u(O, k, A, D, y, 20, s[27])),
                (D = u(D, O, k, A, w, 5, s[28])),
                (A = u(A, D, O, k, p, 9, s[29])),
                (k = u(k, A, D, O, v, 14, s[30])),
                (O = u(O, k, A, D, C, 20, s[31])),
                (D = d(D, O, k, A, g, 4, s[32])),
                (A = d(A, D, O, k, y, 11, s[33])),
                (k = d(k, A, D, O, S, 16, s[34])),
                (O = d(O, k, A, D, T, 23, s[35])),
                (D = d(D, O, k, A, c, 4, s[36])),
                (A = d(A, D, O, k, h, 11, s[37])),
                (k = d(k, A, D, O, v, 16, s[38])),
                (O = d(O, k, A, D, x, 23, s[39])),
                (D = d(D, O, k, A, w, 4, s[40])),
                (A = d(A, D, O, k, o, 11, s[41])),
                (k = d(k, A, D, O, m, 16, s[42])),
                (O = d(O, k, A, D, _, 23, s[43])),
                (D = d(D, O, k, A, b, 4, s[44])),
                (A = d(A, D, O, k, C, 11, s[45])),
                (k = d(k, A, D, O, E, 16, s[46])),
                (O = d(O, k, A, D, p, 23, s[47])),
                (D = f(D, O, k, A, o, 6, s[48])),
                (A = f(A, D, O, k, v, 10, s[49])),
                (k = f(k, A, D, O, T, 15, s[50])),
                (O = f(O, k, A, D, g, 21, s[51])),
                (D = f(D, O, k, A, C, 6, s[52])),
                (A = f(A, D, O, k, m, 10, s[53])),
                (k = f(k, A, D, O, x, 15, s[54])),
                (O = f(O, k, A, D, c, 21, s[55])),
                (D = f(D, O, k, A, y, 6, s[56])),
                (A = f(A, D, O, k, E, 10, s[57])),
                (k = f(k, A, D, O, _, 15, s[58])),
                (O = f(O, k, A, D, w, 21, s[59])),
                (D = f(D, O, k, A, h, 6, s[60])),
                (A = f(A, D, O, k, S, 10, s[61])),
                (k = f(k, A, D, O, p, 15, s[62])),
                (O = f(O, k, A, D, b, 21, s[63])),
                (a[0] = (a[0] + D) | 0),
                (a[1] = (a[1] + O) | 0),
                (a[2] = (a[2] + k) | 0),
                (a[3] = (a[3] + A) | 0));
            },
            _doFinalize: function () {
              var e = this._data,
                n = e.words,
                r = this._nDataBytes * 8,
                i = e.sigBytes * 8;
              n[i >>> 5] |= 128 << (24 - (i % 32));
              var a = t.floor(r / 4294967296),
                o = r;
              ((n[(((i + 64) >>> 9) << 4) + 15] =
                (((a << 8) | (a >>> 24)) & 16711935) |
                (((a << 24) | (a >>> 8)) & 4278255360)),
                (n[(((i + 64) >>> 9) << 4) + 14] =
                  (((o << 8) | (o >>> 24)) & 16711935) |
                  (((o << 24) | (o >>> 8)) & 4278255360)),
                (e.sigBytes = (n.length + 1) * 4),
                this._process());
              for (var s = this._hash, c = s.words, l = 0; l < 4; l++) {
                var u = c[l];
                c[l] =
                  (((u << 8) | (u >>> 24)) & 16711935) |
                  (((u << 24) | (u >>> 8)) & 4278255360);
              }
              return s;
            },
            clone: function () {
              var e = a.clone.call(this);
              return ((e._hash = this._hash.clone()), e);
            },
          }));
          function l(e, t, n, r, i, a, o) {
            var s = e + ((t & n) | (~t & r)) + i + o;
            return ((s << a) | (s >>> (32 - a))) + t;
          }
          function u(e, t, n, r, i, a, o) {
            var s = e + ((t & r) | (n & ~r)) + i + o;
            return ((s << a) | (s >>> (32 - a))) + t;
          }
          function d(e, t, n, r, i, a, o) {
            var s = e + (t ^ n ^ r) + i + o;
            return ((s << a) | (s >>> (32 - a))) + t;
          }
          function f(e, t, n, r, i, a, o) {
            var s = e + (n ^ (t | ~r)) + i + o;
            return ((s << a) | (s >>> (32 - a))) + t;
          }
          ((n.MD5 = a._createHelper(c)), (n.HmacMD5 = a._createHmacHelper(c)));
        })(Math),
        e.MD5
      );
    });
  }),
  Ml = 4,
  Nl = 0,
  Pl = 1,
  Fl = 2;
function Il(e) {
  let t = e.length;
  for (; --t >= 0; ) e[t] = 0;
}
var Ll = 0,
  Rl = 1,
  zl = 2,
  Bl = 3,
  Vl = 258,
  Hl = 29,
  Ul = 256,
  Wl = Ul + 1 + Hl,
  Gl = 30,
  Kl = 19,
  ql = 2 * Wl + 1,
  Jl = 15,
  Yl = 16,
  Xl = 7,
  Zl = 256,
  Ql = 16,
  $l = 17,
  eu = 18,
  tu = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0,
  ]),
  nu = new Uint8Array([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13,
  ]),
  ru = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 7,
  ]),
  iu = new Uint8Array([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ]),
  au = 512,
  ou = Array((Wl + 2) * 2);
Il(ou);
var su = Array(Gl * 2);
Il(su);
var cu = Array(au);
Il(cu);
var lu = Array(Vl - Bl + 1);
Il(lu);
var uu = Array(Hl);
Il(uu);
var du = Array(Gl);
Il(du);
function fu(e, t, n, r, i) {
  ((this.static_tree = e),
    (this.extra_bits = t),
    (this.extra_base = n),
    (this.elems = r),
    (this.max_length = i),
    (this.has_stree = e && e.length));
}
var pu, mu, hu;
function gu(e, t) {
  ((this.dyn_tree = e), (this.max_code = 0), (this.stat_desc = t));
}
var _u = (e) => (e < 256 ? cu[e] : cu[256 + (e >>> 7)]),
  vu = (e, t) => {
    ((e.pending_buf[e.pending++] = t & 255),
      (e.pending_buf[e.pending++] = (t >>> 8) & 255));
  },
  W = (e, t, n) => {
    e.bi_valid > Yl - n
      ? ((e.bi_buf |= (t << e.bi_valid) & 65535),
        vu(e, e.bi_buf),
        (e.bi_buf = t >> (Yl - e.bi_valid)),
        (e.bi_valid += n - Yl))
      : ((e.bi_buf |= (t << e.bi_valid) & 65535), (e.bi_valid += n));
  },
  yu = (e, t, n) => {
    W(e, n[t * 2], n[t * 2 + 1]);
  },
  bu = (e, t) => {
    let n = 0;
    do ((n |= e & 1), (e >>>= 1), (n <<= 1));
    while (--t > 0);
    return n >>> 1;
  },
  xu = (e) => {
    e.bi_valid === 16
      ? (vu(e, e.bi_buf), (e.bi_buf = 0), (e.bi_valid = 0))
      : e.bi_valid >= 8 &&
        ((e.pending_buf[e.pending++] = e.bi_buf & 255),
        (e.bi_buf >>= 8),
        (e.bi_valid -= 8));
  },
  Su = (e, t) => {
    let n = t.dyn_tree,
      r = t.max_code,
      i = t.stat_desc.static_tree,
      a = t.stat_desc.has_stree,
      o = t.stat_desc.extra_bits,
      s = t.stat_desc.extra_base,
      c = t.stat_desc.max_length,
      l,
      u,
      d,
      f,
      p,
      m,
      h = 0;
    for (f = 0; f <= Jl; f++) e.bl_count[f] = 0;
    for (n[e.heap[e.heap_max] * 2 + 1] = 0, l = e.heap_max + 1; l < ql; l++)
      ((u = e.heap[l]),
        (f = n[n[u * 2 + 1] * 2 + 1] + 1),
        f > c && ((f = c), h++),
        (n[u * 2 + 1] = f),
        !(u > r) &&
          (e.bl_count[f]++,
          (p = 0),
          u >= s && (p = o[u - s]),
          (m = n[u * 2]),
          (e.opt_len += m * (f + p)),
          a && (e.static_len += m * (i[u * 2 + 1] + p))));
    if (h !== 0) {
      do {
        for (f = c - 1; e.bl_count[f] === 0; ) f--;
        (e.bl_count[f]--, (e.bl_count[f + 1] += 2), e.bl_count[c]--, (h -= 2));
      } while (h > 0);
      for (f = c; f !== 0; f--)
        for (u = e.bl_count[f]; u !== 0; )
          ((d = e.heap[--l]),
            !(d > r) &&
              (n[d * 2 + 1] !== f &&
                ((e.opt_len += (f - n[d * 2 + 1]) * n[d * 2]),
                (n[d * 2 + 1] = f)),
              u--));
    }
  },
  Cu = (e, t, n) => {
    let r = Array(Jl + 1),
      i = 0,
      a,
      o;
    for (a = 1; a <= Jl; a++) ((i = (i + n[a - 1]) << 1), (r[a] = i));
    for (o = 0; o <= t; o++) {
      let t = e[o * 2 + 1];
      t !== 0 && (e[o * 2] = bu(r[t]++, t));
    }
  },
  wu = () => {
    let e,
      t,
      n,
      r,
      i,
      a = Array(Jl + 1);
    for (n = 0, r = 0; r < Hl - 1; r++)
      for (uu[r] = n, e = 0; e < 1 << tu[r]; e++) lu[n++] = r;
    for (lu[n - 1] = r, i = 0, r = 0; r < 16; r++)
      for (du[r] = i, e = 0; e < 1 << nu[r]; e++) cu[i++] = r;
    for (i >>= 7; r < Gl; r++)
      for (du[r] = i << 7, e = 0; e < 1 << (nu[r] - 7); e++) cu[256 + i++] = r;
    for (t = 0; t <= Jl; t++) a[t] = 0;
    for (e = 0; e <= 143; ) ((ou[e * 2 + 1] = 8), e++, a[8]++);
    for (; e <= 255; ) ((ou[e * 2 + 1] = 9), e++, a[9]++);
    for (; e <= 279; ) ((ou[e * 2 + 1] = 7), e++, a[7]++);
    for (; e <= 287; ) ((ou[e * 2 + 1] = 8), e++, a[8]++);
    for (Cu(ou, Wl + 1, a), e = 0; e < Gl; e++)
      ((su[e * 2 + 1] = 5), (su[e * 2] = bu(e, 5)));
    ((pu = new fu(ou, tu, Ul + 1, Wl, Jl)),
      (mu = new fu(su, nu, 0, Gl, Jl)),
      (hu = new fu([], ru, 0, Kl, Xl)));
  },
  Tu = (e) => {
    let t;
    for (t = 0; t < Wl; t++) e.dyn_ltree[t * 2] = 0;
    for (t = 0; t < Gl; t++) e.dyn_dtree[t * 2] = 0;
    for (t = 0; t < Kl; t++) e.bl_tree[t * 2] = 0;
    ((e.dyn_ltree[Zl * 2] = 1),
      (e.opt_len = e.static_len = 0),
      (e.sym_next = e.matches = 0));
  },
  Eu = (e) => {
    (e.bi_valid > 8
      ? vu(e, e.bi_buf)
      : e.bi_valid > 0 && (e.pending_buf[e.pending++] = e.bi_buf),
      (e.bi_buf = 0),
      (e.bi_valid = 0));
  },
  Du = (e, t, n, r) => {
    let i = t * 2,
      a = n * 2;
    return e[i] < e[a] || (e[i] === e[a] && r[t] <= r[n]);
  },
  Ou = (e, t, n) => {
    let r = e.heap[n],
      i = n << 1;
    for (
      ;
      i <= e.heap_len &&
      (i < e.heap_len && Du(t, e.heap[i + 1], e.heap[i], e.depth) && i++,
      !Du(t, r, e.heap[i], e.depth));
    )
      ((e.heap[n] = e.heap[i]), (n = i), (i <<= 1));
    e.heap[n] = r;
  },
  ku = (e, t, n) => {
    let r,
      i,
      a = 0,
      o,
      s;
    if (e.sym_next !== 0)
      do
        ((r = e.pending_buf[e.sym_buf + a++] & 255),
          (r += (e.pending_buf[e.sym_buf + a++] & 255) << 8),
          (i = e.pending_buf[e.sym_buf + a++]),
          r === 0
            ? yu(e, i, t)
            : ((o = lu[i]),
              yu(e, o + Ul + 1, t),
              (s = tu[o]),
              s !== 0 && ((i -= uu[o]), W(e, i, s)),
              r--,
              (o = _u(r)),
              yu(e, o, n),
              (s = nu[o]),
              s !== 0 && ((r -= du[o]), W(e, r, s))));
      while (a < e.sym_next);
    yu(e, Zl, t);
  },
  Au = (e, t) => {
    let n = t.dyn_tree,
      r = t.stat_desc.static_tree,
      i = t.stat_desc.has_stree,
      a = t.stat_desc.elems,
      o,
      s,
      c = -1,
      l;
    for (e.heap_len = 0, e.heap_max = ql, o = 0; o < a; o++)
      n[o * 2] === 0
        ? (n[o * 2 + 1] = 0)
        : ((e.heap[++e.heap_len] = c = o), (e.depth[o] = 0));
    for (; e.heap_len < 2; )
      ((l = e.heap[++e.heap_len] = c < 2 ? ++c : 0),
        (n[l * 2] = 1),
        (e.depth[l] = 0),
        e.opt_len--,
        i && (e.static_len -= r[l * 2 + 1]));
    for (t.max_code = c, o = e.heap_len >> 1; o >= 1; o--) Ou(e, n, o);
    l = a;
    do
      ((o = e.heap[1]),
        (e.heap[1] = e.heap[e.heap_len--]),
        Ou(e, n, 1),
        (s = e.heap[1]),
        (e.heap[--e.heap_max] = o),
        (e.heap[--e.heap_max] = s),
        (n[l * 2] = n[o * 2] + n[s * 2]),
        (e.depth[l] = (e.depth[o] >= e.depth[s] ? e.depth[o] : e.depth[s]) + 1),
        (n[o * 2 + 1] = n[s * 2 + 1] = l),
        (e.heap[1] = l++),
        Ou(e, n, 1));
    while (e.heap_len >= 2);
    ((e.heap[--e.heap_max] = e.heap[1]), Su(e, t), Cu(n, c, e.bl_count));
  },
  ju = (e, t, n) => {
    let r,
      i = -1,
      a,
      o = t[1],
      s = 0,
      c = 7,
      l = 4;
    for (
      o === 0 && ((c = 138), (l = 3)), t[(n + 1) * 2 + 1] = 65535, r = 0;
      r <= n;
      r++
    )
      ((a = o),
        (o = t[(r + 1) * 2 + 1]),
        !(++s < c && a === o) &&
          (s < l
            ? (e.bl_tree[a * 2] += s)
            : a === 0
              ? s <= 10
                ? e.bl_tree[$l * 2]++
                : e.bl_tree[eu * 2]++
              : (a !== i && e.bl_tree[a * 2]++, e.bl_tree[Ql * 2]++),
          (s = 0),
          (i = a),
          o === 0
            ? ((c = 138), (l = 3))
            : a === o
              ? ((c = 6), (l = 3))
              : ((c = 7), (l = 4))));
  },
  Mu = (e, t, n) => {
    let r,
      i = -1,
      a,
      o = t[1],
      s = 0,
      c = 7,
      l = 4;
    for (o === 0 && ((c = 138), (l = 3)), r = 0; r <= n; r++)
      if (((a = o), (o = t[(r + 1) * 2 + 1]), !(++s < c && a === o))) {
        if (s < l)
          do yu(e, a, e.bl_tree);
          while (--s !== 0);
        else
          a === 0
            ? s <= 10
              ? (yu(e, $l, e.bl_tree), W(e, s - 3, 3))
              : (yu(e, eu, e.bl_tree), W(e, s - 11, 7))
            : (a !== i && (yu(e, a, e.bl_tree), s--),
              yu(e, Ql, e.bl_tree),
              W(e, s - 3, 2));
        ((s = 0),
          (i = a),
          o === 0
            ? ((c = 138), (l = 3))
            : a === o
              ? ((c = 6), (l = 3))
              : ((c = 7), (l = 4)));
      }
  },
  Nu = (e) => {
    let t;
    for (
      ju(e, e.dyn_ltree, e.l_desc.max_code),
        ju(e, e.dyn_dtree, e.d_desc.max_code),
        Au(e, e.bl_desc),
        t = Kl - 1;
      t >= 3 && e.bl_tree[iu[t] * 2 + 1] === 0;
      t--
    );
    return ((e.opt_len += 3 * (t + 1) + 5 + 5 + 4), t);
  },
  Pu = (e, t, n, r) => {
    let i;
    for (W(e, t - 257, 5), W(e, n - 1, 5), W(e, r - 4, 4), i = 0; i < r; i++)
      W(e, e.bl_tree[iu[i] * 2 + 1], 3);
    (Mu(e, e.dyn_ltree, t - 1), Mu(e, e.dyn_dtree, n - 1));
  },
  Fu = (e) => {
    let t = 4093624447,
      n;
    for (n = 0; n <= 31; n++, t >>>= 1)
      if (t & 1 && e.dyn_ltree[n * 2] !== 0) return Nl;
    if (e.dyn_ltree[18] !== 0 || e.dyn_ltree[20] !== 0 || e.dyn_ltree[26] !== 0)
      return Pl;
    for (n = 32; n < Ul; n++) if (e.dyn_ltree[n * 2] !== 0) return Pl;
    return Nl;
  },
  Iu = !1,
  Lu = (e) => {
    ((Iu ||= (wu(), !0)),
      (e.l_desc = new gu(e.dyn_ltree, pu)),
      (e.d_desc = new gu(e.dyn_dtree, mu)),
      (e.bl_desc = new gu(e.bl_tree, hu)),
      (e.bi_buf = 0),
      (e.bi_valid = 0),
      Tu(e));
  },
  Ru = (e, t, n, r) => {
    (W(e, (Ll << 1) + (r ? 1 : 0), 3),
      Eu(e),
      vu(e, n),
      vu(e, ~n),
      n && e.pending_buf.set(e.window.subarray(t, t + n), e.pending),
      (e.pending += n));
  },
  zu = {
    _tr_init: Lu,
    _tr_stored_block: Ru,
    _tr_flush_block: (e, t, n, r) => {
      let i,
        a,
        o = 0;
      (e.level > 0
        ? (e.strm.data_type === Fl && (e.strm.data_type = Fu(e)),
          Au(e, e.l_desc),
          Au(e, e.d_desc),
          (o = Nu(e)),
          (i = (e.opt_len + 3 + 7) >>> 3),
          (a = (e.static_len + 3 + 7) >>> 3),
          a <= i && (i = a))
        : (i = a = n + 5),
        n + 4 <= i && t !== -1
          ? Ru(e, t, n, r)
          : e.strategy === Ml || a === i
            ? (W(e, (Rl << 1) + (r ? 1 : 0), 3), ku(e, ou, su))
            : (W(e, (zl << 1) + (r ? 1 : 0), 3),
              Pu(e, e.l_desc.max_code + 1, e.d_desc.max_code + 1, o + 1),
              ku(e, e.dyn_ltree, e.dyn_dtree)),
        Tu(e),
        r && Eu(e));
    },
    _tr_tally: (e, t, n) => (
      (e.pending_buf[e.sym_buf + e.sym_next++] = t),
      (e.pending_buf[e.sym_buf + e.sym_next++] = t >> 8),
      (e.pending_buf[e.sym_buf + e.sym_next++] = n),
      t === 0
        ? e.dyn_ltree[n * 2]++
        : (e.matches++,
          t--,
          e.dyn_ltree[(lu[n] + Ul + 1) * 2]++,
          e.dyn_dtree[_u(t) * 2]++),
      e.sym_next === e.sym_end
    ),
    _tr_align: (e) => {
      (W(e, Rl << 1, 3), yu(e, Zl, ou), xu(e));
    },
  },
  Bu = (e, t, n, r) => {
    let i = (e & 65535) | 0,
      a = ((e >>> 16) & 65535) | 0,
      o = 0;
    for (; n !== 0; ) {
      ((o = n > 2e3 ? 2e3 : n), (n -= o));
      do ((i = (i + t[r++]) | 0), (a = (a + i) | 0));
      while (--o);
      ((i %= 65521), (a %= 65521));
    }
    return i | (a << 16) | 0;
  },
  Vu = new Uint32Array(
    (() => {
      let e,
        t = [];
      for (var n = 0; n < 256; n++) {
        e = n;
        for (var r = 0; r < 8; r++)
          e = e & 1 ? 3988292384 ^ (e >>> 1) : e >>> 1;
        t[n] = e;
      }
      return t;
    })(),
  ),
  G = (e, t, n, r) => {
    let i = Vu,
      a = r + n;
    e ^= -1;
    for (let n = r; n < a; n++) e = (e >>> 8) ^ i[(e ^ t[n]) & 255];
    return e ^ -1;
  },
  Hu = {
    2: `need dictionary`,
    1: `stream end`,
    0: ``,
    "-1": `file error`,
    "-2": `stream error`,
    "-3": `data error`,
    "-4": `insufficient memory`,
    "-5": `buffer error`,
    "-6": `incompatible version`,
  },
  Uu = {
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_TREES: 6,
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_DEFAULT_STRATEGY: 0,
    Z_BINARY: 0,
    Z_TEXT: 1,
    Z_UNKNOWN: 2,
    Z_DEFLATED: 8,
  },
  {
    _tr_init: Wu,
    _tr_stored_block: Gu,
    _tr_flush_block: Ku,
    _tr_tally: qu,
    _tr_align: Ju,
  } = zu,
  {
    Z_NO_FLUSH: Yu,
    Z_PARTIAL_FLUSH: Xu,
    Z_FULL_FLUSH: Zu,
    Z_FINISH: K,
    Z_BLOCK: Qu,
    Z_OK: q,
    Z_STREAM_END: $u,
    Z_STREAM_ERROR: ed,
    Z_DATA_ERROR: td,
    Z_BUF_ERROR: nd,
    Z_DEFAULT_COMPRESSION: rd,
    Z_FILTERED: id,
    Z_HUFFMAN_ONLY: ad,
    Z_RLE: od,
    Z_FIXED: sd,
    Z_DEFAULT_STRATEGY: cd,
    Z_UNKNOWN: ld,
    Z_DEFLATED: ud,
  } = Uu,
  dd = 9,
  fd = 15,
  pd = 8,
  md = 286,
  hd = 30,
  gd = 19,
  _d = 2 * md + 1,
  vd = 15,
  J = 3,
  yd = 258,
  bd = yd + J + 1,
  xd = 32,
  Sd = 42,
  Cd = 57,
  wd = 69,
  Td = 73,
  Ed = 91,
  Dd = 103,
  Od = 113,
  kd = 666,
  Y = 1,
  Ad = 2,
  jd = 3,
  Md = 4,
  Nd = 3,
  Pd = (e, t) => ((e.msg = Hu[t]), t),
  Fd = (e) => e * 2 - (e > 4 ? 9 : 0),
  Id = (e) => {
    let t = e.length;
    for (; --t >= 0; ) e[t] = 0;
  },
  Ld = (e) => {
    let t,
      n,
      r,
      i = e.w_size;
    ((t = e.hash_size), (r = t));
    do ((n = e.head[--r]), (e.head[r] = n >= i ? n - i : 0));
    while (--t);
    ((t = i), (r = t));
    do ((n = e.prev[--r]), (e.prev[r] = n >= i ? n - i : 0));
    while (--t);
  },
  Rd = (e, t, n) => ((t << e.hash_shift) ^ n) & e.hash_mask,
  X = (e) => {
    let t = e.state,
      n = t.pending;
    (n > e.avail_out && (n = e.avail_out),
      n !== 0 &&
        (e.output.set(
          t.pending_buf.subarray(t.pending_out, t.pending_out + n),
          e.next_out,
        ),
        (e.next_out += n),
        (t.pending_out += n),
        (e.total_out += n),
        (e.avail_out -= n),
        (t.pending -= n),
        t.pending === 0 && (t.pending_out = 0)));
  },
  Z = (e, t) => {
    (Ku(
      e,
      e.block_start >= 0 ? e.block_start : -1,
      e.strstart - e.block_start,
      t,
    ),
      (e.block_start = e.strstart),
      X(e.strm));
  },
  Q = (e, t) => {
    e.pending_buf[e.pending++] = t;
  },
  zd = (e, t) => {
    ((e.pending_buf[e.pending++] = (t >>> 8) & 255),
      (e.pending_buf[e.pending++] = t & 255));
  },
  Bd = (e, t, n, r) => {
    let i = e.avail_in;
    return (
      i > r && (i = r),
      i === 0
        ? 0
        : ((e.avail_in -= i),
          t.set(e.input.subarray(e.next_in, e.next_in + i), n),
          e.state.wrap === 1
            ? (e.adler = Bu(e.adler, t, i, n))
            : e.state.wrap === 2 && (e.adler = G(e.adler, t, i, n)),
          (e.next_in += i),
          (e.total_in += i),
          i)
    );
  },
  Vd = (e, t) => {
    let n = e.max_chain_length,
      r = e.strstart,
      i,
      a,
      o = e.prev_length,
      s = e.nice_match,
      c = e.strstart > e.w_size - bd ? e.strstart - (e.w_size - bd) : 0,
      l = e.window,
      u = e.w_mask,
      d = e.prev,
      f = e.strstart + yd,
      p = l[r + o - 1],
      m = l[r + o];
    (e.prev_length >= e.good_match && (n >>= 2),
      s > e.lookahead && (s = e.lookahead));
    do {
      if (
        ((i = t),
        l[i + o] !== m ||
          l[i + o - 1] !== p ||
          l[i] !== l[r] ||
          l[++i] !== l[r + 1])
      )
        continue;
      ((r += 2), i++);
      do;
      while (
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        l[++r] === l[++i] &&
        r < f
      );
      if (((a = yd - (f - r)), (r = f - yd), a > o)) {
        if (((e.match_start = t), (o = a), a >= s)) break;
        ((p = l[r + o - 1]), (m = l[r + o]));
      }
    } while ((t = d[t & u]) > c && --n !== 0);
    return o <= e.lookahead ? o : e.lookahead;
  },
  Hd = (e) => {
    let t = e.w_size,
      n,
      r,
      i;
    do {
      if (
        ((r = e.window_size - e.lookahead - e.strstart),
        e.strstart >= t + (t - bd) &&
          (e.window.set(e.window.subarray(t, t + t - r), 0),
          (e.match_start -= t),
          (e.strstart -= t),
          (e.block_start -= t),
          e.insert > e.strstart && (e.insert = e.strstart),
          Ld(e),
          (r += t)),
        e.strm.avail_in === 0)
      )
        break;
      if (
        ((n = Bd(e.strm, e.window, e.strstart + e.lookahead, r)),
        (e.lookahead += n),
        e.lookahead + e.insert >= J)
      )
        for (
          i = e.strstart - e.insert,
            e.ins_h = e.window[i],
            e.ins_h = Rd(e, e.ins_h, e.window[i + 1]);
          e.insert &&
          ((e.ins_h = Rd(e, e.ins_h, e.window[i + J - 1])),
          (e.prev[i & e.w_mask] = e.head[e.ins_h]),
          (e.head[e.ins_h] = i),
          i++,
          e.insert--,
          !(e.lookahead + e.insert < J));
        );
    } while (e.lookahead < bd && e.strm.avail_in !== 0);
  },
  Ud = (e, t) => {
    let n =
        e.pending_buf_size - 5 > e.w_size ? e.w_size : e.pending_buf_size - 5,
      r,
      i,
      a,
      o = 0,
      s = e.strm.avail_in;
    do {
      if (
        ((r = 65535),
        (a = (e.bi_valid + 42) >> 3),
        e.strm.avail_out < a ||
          ((a = e.strm.avail_out - a),
          (i = e.strstart - e.block_start),
          r > i + e.strm.avail_in && (r = i + e.strm.avail_in),
          r > a && (r = a),
          r < n &&
            ((r === 0 && t !== K) || t === Yu || r !== i + e.strm.avail_in)))
      )
        break;
      ((o = t === K && r === i + e.strm.avail_in ? 1 : 0),
        Gu(e, 0, 0, o),
        (e.pending_buf[e.pending - 4] = r),
        (e.pending_buf[e.pending - 3] = r >> 8),
        (e.pending_buf[e.pending - 2] = ~r),
        (e.pending_buf[e.pending - 1] = ~r >> 8),
        X(e.strm),
        i &&
          (i > r && (i = r),
          e.strm.output.set(
            e.window.subarray(e.block_start, e.block_start + i),
            e.strm.next_out,
          ),
          (e.strm.next_out += i),
          (e.strm.avail_out -= i),
          (e.strm.total_out += i),
          (e.block_start += i),
          (r -= i)),
        r &&
          (Bd(e.strm, e.strm.output, e.strm.next_out, r),
          (e.strm.next_out += r),
          (e.strm.avail_out -= r),
          (e.strm.total_out += r)));
    } while (o === 0);
    return (
      (s -= e.strm.avail_in),
      s &&
        (s >= e.w_size
          ? ((e.matches = 2),
            e.window.set(
              e.strm.input.subarray(e.strm.next_in - e.w_size, e.strm.next_in),
              0,
            ),
            (e.strstart = e.w_size),
            (e.insert = e.strstart))
          : (e.window_size - e.strstart <= s &&
              ((e.strstart -= e.w_size),
              e.window.set(
                e.window.subarray(e.w_size, e.w_size + e.strstart),
                0,
              ),
              e.matches < 2 && e.matches++,
              e.insert > e.strstart && (e.insert = e.strstart)),
            e.window.set(
              e.strm.input.subarray(e.strm.next_in - s, e.strm.next_in),
              e.strstart,
            ),
            (e.strstart += s),
            (e.insert += s > e.w_size - e.insert ? e.w_size - e.insert : s)),
        (e.block_start = e.strstart)),
      e.high_water < e.strstart && (e.high_water = e.strstart),
      o
        ? Md
        : t !== Yu &&
            t !== K &&
            e.strm.avail_in === 0 &&
            e.strstart === e.block_start
          ? Ad
          : ((a = e.window_size - e.strstart),
            e.strm.avail_in > a &&
              e.block_start >= e.w_size &&
              ((e.block_start -= e.w_size),
              (e.strstart -= e.w_size),
              e.window.set(
                e.window.subarray(e.w_size, e.w_size + e.strstart),
                0,
              ),
              e.matches < 2 && e.matches++,
              (a += e.w_size),
              e.insert > e.strstart && (e.insert = e.strstart)),
            a > e.strm.avail_in && (a = e.strm.avail_in),
            a &&
              (Bd(e.strm, e.window, e.strstart, a),
              (e.strstart += a),
              (e.insert += a > e.w_size - e.insert ? e.w_size - e.insert : a)),
            e.high_water < e.strstart && (e.high_water = e.strstart),
            (a = (e.bi_valid + 42) >> 3),
            (a =
              e.pending_buf_size - a > 65535 ? 65535 : e.pending_buf_size - a),
            (n = a > e.w_size ? e.w_size : a),
            (i = e.strstart - e.block_start),
            (i >= n ||
              ((i || t === K) &&
                t !== Yu &&
                e.strm.avail_in === 0 &&
                i <= a)) &&
              ((r = i > a ? a : i),
              (o = t === K && e.strm.avail_in === 0 && r === i ? 1 : 0),
              Gu(e, e.block_start, r, o),
              (e.block_start += r),
              X(e.strm)),
            o ? jd : Y)
    );
  },
  Wd = (e, t) => {
    let n, r;
    for (;;) {
      if (e.lookahead < bd) {
        if ((Hd(e), e.lookahead < bd && t === Yu)) return Y;
        if (e.lookahead === 0) break;
      }
      if (
        ((n = 0),
        e.lookahead >= J &&
          ((e.ins_h = Rd(e, e.ins_h, e.window[e.strstart + J - 1])),
          (n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h]),
          (e.head[e.ins_h] = e.strstart)),
        n !== 0 &&
          e.strstart - n <= e.w_size - bd &&
          (e.match_length = Vd(e, n)),
        e.match_length >= J)
      )
        if (
          ((r = qu(e, e.strstart - e.match_start, e.match_length - J)),
          (e.lookahead -= e.match_length),
          e.match_length <= e.max_lazy_match && e.lookahead >= J)
        ) {
          e.match_length--;
          do
            (e.strstart++,
              (e.ins_h = Rd(e, e.ins_h, e.window[e.strstart + J - 1])),
              (n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h]),
              (e.head[e.ins_h] = e.strstart));
          while (--e.match_length !== 0);
          e.strstart++;
        } else
          ((e.strstart += e.match_length),
            (e.match_length = 0),
            (e.ins_h = e.window[e.strstart]),
            (e.ins_h = Rd(e, e.ins_h, e.window[e.strstart + 1])));
      else ((r = qu(e, 0, e.window[e.strstart])), e.lookahead--, e.strstart++);
      if (r && (Z(e, !1), e.strm.avail_out === 0)) return Y;
    }
    return (
      (e.insert = e.strstart < J - 1 ? e.strstart : J - 1),
      t === K
        ? (Z(e, !0), e.strm.avail_out === 0 ? jd : Md)
        : e.sym_next && (Z(e, !1), e.strm.avail_out === 0)
          ? Y
          : Ad
    );
  },
  Gd = (e, t) => {
    let n, r, i;
    for (;;) {
      if (e.lookahead < bd) {
        if ((Hd(e), e.lookahead < bd && t === Yu)) return Y;
        if (e.lookahead === 0) break;
      }
      if (
        ((n = 0),
        e.lookahead >= J &&
          ((e.ins_h = Rd(e, e.ins_h, e.window[e.strstart + J - 1])),
          (n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h]),
          (e.head[e.ins_h] = e.strstart)),
        (e.prev_length = e.match_length),
        (e.prev_match = e.match_start),
        (e.match_length = J - 1),
        n !== 0 &&
          e.prev_length < e.max_lazy_match &&
          e.strstart - n <= e.w_size - bd &&
          ((e.match_length = Vd(e, n)),
          e.match_length <= 5 &&
            (e.strategy === id ||
              (e.match_length === J && e.strstart - e.match_start > 4096)) &&
            (e.match_length = J - 1)),
        e.prev_length >= J && e.match_length <= e.prev_length)
      ) {
        ((i = e.strstart + e.lookahead - J),
          (r = qu(e, e.strstart - 1 - e.prev_match, e.prev_length - J)),
          (e.lookahead -= e.prev_length - 1),
          (e.prev_length -= 2));
        do
          ++e.strstart <= i &&
            ((e.ins_h = Rd(e, e.ins_h, e.window[e.strstart + J - 1])),
            (n = e.prev[e.strstart & e.w_mask] = e.head[e.ins_h]),
            (e.head[e.ins_h] = e.strstart));
        while (--e.prev_length !== 0);
        if (
          ((e.match_available = 0),
          (e.match_length = J - 1),
          e.strstart++,
          r && (Z(e, !1), e.strm.avail_out === 0))
        )
          return Y;
      } else if (e.match_available) {
        if (
          ((r = qu(e, 0, e.window[e.strstart - 1])),
          r && Z(e, !1),
          e.strstart++,
          e.lookahead--,
          e.strm.avail_out === 0)
        )
          return Y;
      } else ((e.match_available = 1), e.strstart++, e.lookahead--);
    }
    return (
      (e.match_available &&= ((r = qu(e, 0, e.window[e.strstart - 1])), 0)),
      (e.insert = e.strstart < J - 1 ? e.strstart : J - 1),
      t === K
        ? (Z(e, !0), e.strm.avail_out === 0 ? jd : Md)
        : e.sym_next && (Z(e, !1), e.strm.avail_out === 0)
          ? Y
          : Ad
    );
  },
  Kd = (e, t) => {
    let n,
      r,
      i,
      a,
      o = e.window;
    for (;;) {
      if (e.lookahead <= yd) {
        if ((Hd(e), e.lookahead <= yd && t === Yu)) return Y;
        if (e.lookahead === 0) break;
      }
      if (
        ((e.match_length = 0),
        e.lookahead >= J &&
          e.strstart > 0 &&
          ((i = e.strstart - 1),
          (r = o[i]),
          r === o[++i] && r === o[++i] && r === o[++i]))
      ) {
        a = e.strstart + yd;
        do;
        while (
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          r === o[++i] &&
          i < a
        );
        ((e.match_length = yd - (a - i)),
          e.match_length > e.lookahead && (e.match_length = e.lookahead));
      }
      if (
        (e.match_length >= J
          ? ((n = qu(e, 1, e.match_length - J)),
            (e.lookahead -= e.match_length),
            (e.strstart += e.match_length),
            (e.match_length = 0))
          : ((n = qu(e, 0, e.window[e.strstart])), e.lookahead--, e.strstart++),
        n && (Z(e, !1), e.strm.avail_out === 0))
      )
        return Y;
    }
    return (
      (e.insert = 0),
      t === K
        ? (Z(e, !0), e.strm.avail_out === 0 ? jd : Md)
        : e.sym_next && (Z(e, !1), e.strm.avail_out === 0)
          ? Y
          : Ad
    );
  },
  qd = (e, t) => {
    let n;
    for (;;) {
      if (e.lookahead === 0 && (Hd(e), e.lookahead === 0)) {
        if (t === Yu) return Y;
        break;
      }
      if (
        ((e.match_length = 0),
        (n = qu(e, 0, e.window[e.strstart])),
        e.lookahead--,
        e.strstart++,
        n && (Z(e, !1), e.strm.avail_out === 0))
      )
        return Y;
    }
    return (
      (e.insert = 0),
      t === K
        ? (Z(e, !0), e.strm.avail_out === 0 ? jd : Md)
        : e.sym_next && (Z(e, !1), e.strm.avail_out === 0)
          ? Y
          : Ad
    );
  };
function Jd(e, t, n, r, i) {
  ((this.good_length = e),
    (this.max_lazy = t),
    (this.nice_length = n),
    (this.max_chain = r),
    (this.func = i));
}
var Yd = [
    new Jd(0, 0, 0, 0, Ud),
    new Jd(4, 4, 8, 4, Wd),
    new Jd(4, 5, 16, 8, Wd),
    new Jd(4, 6, 32, 32, Wd),
    new Jd(4, 4, 16, 16, Gd),
    new Jd(8, 16, 32, 32, Gd),
    new Jd(8, 16, 128, 128, Gd),
    new Jd(8, 32, 128, 256, Gd),
    new Jd(32, 128, 258, 1024, Gd),
    new Jd(32, 258, 258, 4096, Gd),
  ],
  Xd = (e) => {
    ((e.window_size = 2 * e.w_size),
      Id(e.head),
      (e.max_lazy_match = Yd[e.level].max_lazy),
      (e.good_match = Yd[e.level].good_length),
      (e.nice_match = Yd[e.level].nice_length),
      (e.max_chain_length = Yd[e.level].max_chain),
      (e.strstart = 0),
      (e.block_start = 0),
      (e.lookahead = 0),
      (e.insert = 0),
      (e.match_length = e.prev_length = J - 1),
      (e.match_available = 0),
      (e.ins_h = 0));
  };
function Zd() {
  ((this.strm = null),
    (this.status = 0),
    (this.pending_buf = null),
    (this.pending_buf_size = 0),
    (this.pending_out = 0),
    (this.pending = 0),
    (this.wrap = 0),
    (this.gzhead = null),
    (this.gzindex = 0),
    (this.method = ud),
    (this.last_flush = -1),
    (this.w_size = 0),
    (this.w_bits = 0),
    (this.w_mask = 0),
    (this.window = null),
    (this.window_size = 0),
    (this.prev = null),
    (this.head = null),
    (this.ins_h = 0),
    (this.hash_size = 0),
    (this.hash_bits = 0),
    (this.hash_mask = 0),
    (this.hash_shift = 0),
    (this.block_start = 0),
    (this.match_length = 0),
    (this.prev_match = 0),
    (this.match_available = 0),
    (this.strstart = 0),
    (this.match_start = 0),
    (this.lookahead = 0),
    (this.prev_length = 0),
    (this.max_chain_length = 0),
    (this.max_lazy_match = 0),
    (this.level = 0),
    (this.strategy = 0),
    (this.good_match = 0),
    (this.nice_match = 0),
    (this.dyn_ltree = new Uint16Array(_d * 2)),
    (this.dyn_dtree = new Uint16Array((2 * hd + 1) * 2)),
    (this.bl_tree = new Uint16Array((2 * gd + 1) * 2)),
    Id(this.dyn_ltree),
    Id(this.dyn_dtree),
    Id(this.bl_tree),
    (this.l_desc = null),
    (this.d_desc = null),
    (this.bl_desc = null),
    (this.bl_count = new Uint16Array(vd + 1)),
    (this.heap = new Uint16Array(2 * md + 1)),
    Id(this.heap),
    (this.heap_len = 0),
    (this.heap_max = 0),
    (this.depth = new Uint16Array(2 * md + 1)),
    Id(this.depth),
    (this.sym_buf = 0),
    (this.lit_bufsize = 0),
    (this.sym_next = 0),
    (this.sym_end = 0),
    (this.opt_len = 0),
    (this.static_len = 0),
    (this.matches = 0),
    (this.insert = 0),
    (this.bi_buf = 0),
    (this.bi_valid = 0));
}
var Qd = (e) => {
    if (!e) return 1;
    let t = e.state;
    return !t ||
      t.strm !== e ||
      (t.status !== Sd &&
        t.status !== Cd &&
        t.status !== wd &&
        t.status !== Td &&
        t.status !== Ed &&
        t.status !== Dd &&
        t.status !== Od &&
        t.status !== kd)
      ? 1
      : 0;
  },
  $d = (e) => {
    if (Qd(e)) return Pd(e, ed);
    ((e.total_in = e.total_out = 0), (e.data_type = ld));
    let t = e.state;
    return (
      (t.pending = 0),
      (t.pending_out = 0),
      t.wrap < 0 && (t.wrap = -t.wrap),
      (t.status = t.wrap === 2 ? Cd : t.wrap ? Sd : Od),
      (e.adler = t.wrap === 2 ? 0 : 1),
      (t.last_flush = -2),
      Wu(t),
      q
    );
  },
  ef = (e) => {
    let t = $d(e);
    return (t === q && Xd(e.state), t);
  },
  tf = (e, t) => (Qd(e) || e.state.wrap !== 2 ? ed : ((e.state.gzhead = t), q)),
  nf = (e, t, n, r, i, a) => {
    if (!e) return ed;
    let o = 1;
    if (
      (t === rd && (t = 6),
      r < 0 ? ((o = 0), (r = -r)) : r > 15 && ((o = 2), (r -= 16)),
      i < 1 ||
        i > dd ||
        n !== ud ||
        r < 8 ||
        r > 15 ||
        t < 0 ||
        t > 9 ||
        a < 0 ||
        a > sd ||
        (r === 8 && o !== 1))
    )
      return Pd(e, ed);
    r === 8 && (r = 9);
    let s = new Zd();
    return (
      (e.state = s),
      (s.strm = e),
      (s.status = Sd),
      (s.wrap = o),
      (s.gzhead = null),
      (s.w_bits = r),
      (s.w_size = 1 << s.w_bits),
      (s.w_mask = s.w_size - 1),
      (s.hash_bits = i + 7),
      (s.hash_size = 1 << s.hash_bits),
      (s.hash_mask = s.hash_size - 1),
      (s.hash_shift = ~~((s.hash_bits + J - 1) / J)),
      (s.window = new Uint8Array(s.w_size * 2)),
      (s.head = new Uint16Array(s.hash_size)),
      (s.prev = new Uint16Array(s.w_size)),
      (s.lit_bufsize = 1 << (i + 6)),
      (s.pending_buf_size = s.lit_bufsize * 4),
      (s.pending_buf = new Uint8Array(s.pending_buf_size)),
      (s.sym_buf = s.lit_bufsize),
      (s.sym_end = (s.lit_bufsize - 1) * 3),
      (s.level = t),
      (s.strategy = a),
      (s.method = n),
      ef(e)
    );
  },
  rf = {
    deflateInit: (e, t) => nf(e, t, ud, fd, pd, cd),
    deflateInit2: nf,
    deflateReset: ef,
    deflateResetKeep: $d,
    deflateSetHeader: tf,
    deflate: (e, t) => {
      if (Qd(e) || t > Qu || t < 0) return e ? Pd(e, ed) : ed;
      let n = e.state;
      if (
        !e.output ||
        (e.avail_in !== 0 && !e.input) ||
        (n.status === kd && t !== K)
      )
        return Pd(e, e.avail_out === 0 ? nd : ed);
      let r = n.last_flush;
      if (((n.last_flush = t), n.pending !== 0)) {
        if ((X(e), e.avail_out === 0)) return ((n.last_flush = -1), q);
      } else if (e.avail_in === 0 && Fd(t) <= Fd(r) && t !== K)
        return Pd(e, nd);
      if (n.status === kd && e.avail_in !== 0) return Pd(e, nd);
      if (
        (n.status === Sd && n.wrap === 0 && (n.status = Od), n.status === Sd)
      ) {
        let t = (ud + ((n.w_bits - 8) << 4)) << 8,
          r = -1;
        if (
          ((r =
            n.strategy >= ad || n.level < 2
              ? 0
              : n.level < 6
                ? 1
                : n.level === 6
                  ? 2
                  : 3),
          (t |= r << 6),
          n.strstart !== 0 && (t |= xd),
          (t += 31 - (t % 31)),
          zd(n, t),
          n.strstart !== 0 && (zd(n, e.adler >>> 16), zd(n, e.adler & 65535)),
          (e.adler = 1),
          (n.status = Od),
          X(e),
          n.pending !== 0)
        )
          return ((n.last_flush = -1), q);
      }
      if (n.status === Cd) {
        if (((e.adler = 0), Q(n, 31), Q(n, 139), Q(n, 8), n.gzhead))
          (Q(
            n,
            (n.gzhead.text ? 1 : 0) +
              (n.gzhead.hcrc ? 2 : 0) +
              (n.gzhead.extra ? 4 : 0) +
              (n.gzhead.name ? 8 : 0) +
              (n.gzhead.comment ? 16 : 0),
          ),
            Q(n, n.gzhead.time & 255),
            Q(n, (n.gzhead.time >> 8) & 255),
            Q(n, (n.gzhead.time >> 16) & 255),
            Q(n, (n.gzhead.time >> 24) & 255),
            Q(n, n.level === 9 ? 2 : n.strategy >= ad || n.level < 2 ? 4 : 0),
            Q(n, n.gzhead.os & 255),
            n.gzhead.extra &&
              n.gzhead.extra.length &&
              (Q(n, n.gzhead.extra.length & 255),
              Q(n, (n.gzhead.extra.length >> 8) & 255)),
            n.gzhead.hcrc &&
              (e.adler = G(e.adler, n.pending_buf, n.pending, 0)),
            (n.gzindex = 0),
            (n.status = wd));
        else if (
          (Q(n, 0),
          Q(n, 0),
          Q(n, 0),
          Q(n, 0),
          Q(n, 0),
          Q(n, n.level === 9 ? 2 : n.strategy >= ad || n.level < 2 ? 4 : 0),
          Q(n, Nd),
          (n.status = Od),
          X(e),
          n.pending !== 0)
        )
          return ((n.last_flush = -1), q);
      }
      if (n.status === wd) {
        if (n.gzhead.extra) {
          let t = n.pending,
            r = (n.gzhead.extra.length & 65535) - n.gzindex;
          for (; n.pending + r > n.pending_buf_size; ) {
            let i = n.pending_buf_size - n.pending;
            if (
              (n.pending_buf.set(
                n.gzhead.extra.subarray(n.gzindex, n.gzindex + i),
                n.pending,
              ),
              (n.pending = n.pending_buf_size),
              n.gzhead.hcrc &&
                n.pending > t &&
                (e.adler = G(e.adler, n.pending_buf, n.pending - t, t)),
              (n.gzindex += i),
              X(e),
              n.pending !== 0)
            )
              return ((n.last_flush = -1), q);
            ((t = 0), (r -= i));
          }
          let i = new Uint8Array(n.gzhead.extra);
          (n.pending_buf.set(i.subarray(n.gzindex, n.gzindex + r), n.pending),
            (n.pending += r),
            n.gzhead.hcrc &&
              n.pending > t &&
              (e.adler = G(e.adler, n.pending_buf, n.pending - t, t)),
            (n.gzindex = 0));
        }
        n.status = Td;
      }
      if (n.status === Td) {
        if (n.gzhead.name) {
          let t = n.pending,
            r;
          do {
            if (n.pending === n.pending_buf_size) {
              if (
                (n.gzhead.hcrc &&
                  n.pending > t &&
                  (e.adler = G(e.adler, n.pending_buf, n.pending - t, t)),
                X(e),
                n.pending !== 0)
              )
                return ((n.last_flush = -1), q);
              t = 0;
            }
            ((r =
              n.gzindex < n.gzhead.name.length
                ? n.gzhead.name.charCodeAt(n.gzindex++) & 255
                : 0),
              Q(n, r));
          } while (r !== 0);
          (n.gzhead.hcrc &&
            n.pending > t &&
            (e.adler = G(e.adler, n.pending_buf, n.pending - t, t)),
            (n.gzindex = 0));
        }
        n.status = Ed;
      }
      if (n.status === Ed) {
        if (n.gzhead.comment) {
          let t = n.pending,
            r;
          do {
            if (n.pending === n.pending_buf_size) {
              if (
                (n.gzhead.hcrc &&
                  n.pending > t &&
                  (e.adler = G(e.adler, n.pending_buf, n.pending - t, t)),
                X(e),
                n.pending !== 0)
              )
                return ((n.last_flush = -1), q);
              t = 0;
            }
            ((r =
              n.gzindex < n.gzhead.comment.length
                ? n.gzhead.comment.charCodeAt(n.gzindex++) & 255
                : 0),
              Q(n, r));
          } while (r !== 0);
          n.gzhead.hcrc &&
            n.pending > t &&
            (e.adler = G(e.adler, n.pending_buf, n.pending - t, t));
        }
        n.status = Dd;
      }
      if (n.status === Dd) {
        if (n.gzhead.hcrc) {
          if (n.pending + 2 > n.pending_buf_size && (X(e), n.pending !== 0))
            return ((n.last_flush = -1), q);
          (Q(n, e.adler & 255), Q(n, (e.adler >> 8) & 255), (e.adler = 0));
        }
        if (((n.status = Od), X(e), n.pending !== 0))
          return ((n.last_flush = -1), q);
      }
      if (
        e.avail_in !== 0 ||
        n.lookahead !== 0 ||
        (t !== Yu && n.status !== kd)
      ) {
        let r =
          n.level === 0
            ? Ud(n, t)
            : n.strategy === ad
              ? qd(n, t)
              : n.strategy === od
                ? Kd(n, t)
                : Yd[n.level].func(n, t);
        if (((r === jd || r === Md) && (n.status = kd), r === Y || r === jd))
          return (e.avail_out === 0 && (n.last_flush = -1), q);
        if (
          r === Ad &&
          (t === Xu
            ? Ju(n)
            : t !== Qu &&
              (Gu(n, 0, 0, !1),
              t === Zu &&
                (Id(n.head),
                n.lookahead === 0 &&
                  ((n.strstart = 0), (n.block_start = 0), (n.insert = 0)))),
          X(e),
          e.avail_out === 0)
        )
          return ((n.last_flush = -1), q);
      }
      return t === K
        ? n.wrap <= 0
          ? $u
          : (n.wrap === 2
              ? (Q(n, e.adler & 255),
                Q(n, (e.adler >> 8) & 255),
                Q(n, (e.adler >> 16) & 255),
                Q(n, (e.adler >> 24) & 255),
                Q(n, e.total_in & 255),
                Q(n, (e.total_in >> 8) & 255),
                Q(n, (e.total_in >> 16) & 255),
                Q(n, (e.total_in >> 24) & 255))
              : (zd(n, e.adler >>> 16), zd(n, e.adler & 65535)),
            X(e),
            n.wrap > 0 && (n.wrap = -n.wrap),
            n.pending === 0 ? $u : q)
        : q;
    },
    deflateEnd: (e) => {
      if (Qd(e)) return ed;
      let t = e.state.status;
      return ((e.state = null), t === Od ? Pd(e, td) : q);
    },
    deflateSetDictionary: (e, t) => {
      let n = t.length;
      if (Qd(e)) return ed;
      let r = e.state,
        i = r.wrap;
      if (i === 2 || (i === 1 && r.status !== Sd) || r.lookahead) return ed;
      if (
        (i === 1 && (e.adler = Bu(e.adler, t, n, 0)),
        (r.wrap = 0),
        n >= r.w_size)
      ) {
        i === 0 &&
          (Id(r.head), (r.strstart = 0), (r.block_start = 0), (r.insert = 0));
        let e = new Uint8Array(r.w_size);
        (e.set(t.subarray(n - r.w_size, n), 0), (t = e), (n = r.w_size));
      }
      let a = e.avail_in,
        o = e.next_in,
        s = e.input;
      for (
        e.avail_in = n, e.next_in = 0, e.input = t, Hd(r);
        r.lookahead >= J;
      ) {
        let e = r.strstart,
          t = r.lookahead - (J - 1);
        do
          ((r.ins_h = Rd(r, r.ins_h, r.window[e + J - 1])),
            (r.prev[e & r.w_mask] = r.head[r.ins_h]),
            (r.head[r.ins_h] = e),
            e++);
        while (--t);
        ((r.strstart = e), (r.lookahead = J - 1), Hd(r));
      }
      return (
        (r.strstart += r.lookahead),
        (r.block_start = r.strstart),
        (r.insert = r.lookahead),
        (r.lookahead = 0),
        (r.match_length = r.prev_length = J - 1),
        (r.match_available = 0),
        (e.next_in = o),
        (e.input = s),
        (e.avail_in = a),
        (r.wrap = i),
        q
      );
    },
    deflateInfo: `pako deflate (from Nodeca project)`,
  },
  af = (e, t) => Object.prototype.hasOwnProperty.call(e, t),
  of = {
    assign: function (e) {
      let t = Array.prototype.slice.call(arguments, 1);
      for (; t.length; ) {
        let n = t.shift();
        if (n) {
          if (typeof n != `object`) throw TypeError(n + `must be non-object`);
          for (let t in n) af(n, t) && (e[t] = n[t]);
        }
      }
      return e;
    },
    flattenChunks: (e) => {
      let t = 0;
      for (let n = 0, r = e.length; n < r; n++) t += e[n].length;
      let n = new Uint8Array(t);
      for (let t = 0, r = 0, i = e.length; t < i; t++) {
        let i = e[t];
        (n.set(i, r), (r += i.length));
      }
      return n;
    },
  },
  sf = !0;
try {
  String.fromCharCode.apply(null, new Uint8Array(1));
} catch {
  sf = !1;
}
var cf = new Uint8Array(256);
for (let e = 0; e < 256; e++)
  cf[e] =
    e >= 252
      ? 6
      : e >= 248
        ? 5
        : e >= 240
          ? 4
          : e >= 224
            ? 3
            : e >= 192
              ? 2
              : 1;
cf[254] = cf[254] = 1;
var lf = (e) => {
    if (typeof TextEncoder == `function` && TextEncoder.prototype.encode)
      return new TextEncoder().encode(e);
    let t,
      n,
      r,
      i,
      a,
      o = e.length,
      s = 0;
    for (i = 0; i < o; i++)
      ((n = e.charCodeAt(i)),
        (n & 64512) == 55296 &&
          i + 1 < o &&
          ((r = e.charCodeAt(i + 1)),
          (r & 64512) == 56320 &&
            ((n = 65536 + ((n - 55296) << 10) + (r - 56320)), i++)),
        (s += n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4));
    for (t = new Uint8Array(s), a = 0, i = 0; a < s; i++)
      ((n = e.charCodeAt(i)),
        (n & 64512) == 55296 &&
          i + 1 < o &&
          ((r = e.charCodeAt(i + 1)),
          (r & 64512) == 56320 &&
            ((n = 65536 + ((n - 55296) << 10) + (r - 56320)), i++)),
        n < 128
          ? (t[a++] = n)
          : n < 2048
            ? ((t[a++] = 192 | (n >>> 6)), (t[a++] = 128 | (n & 63)))
            : n < 65536
              ? ((t[a++] = 224 | (n >>> 12)),
                (t[a++] = 128 | ((n >>> 6) & 63)),
                (t[a++] = 128 | (n & 63)))
              : ((t[a++] = 240 | (n >>> 18)),
                (t[a++] = 128 | ((n >>> 12) & 63)),
                (t[a++] = 128 | ((n >>> 6) & 63)),
                (t[a++] = 128 | (n & 63))));
    return t;
  },
  uf = (e, t) => {
    if (t < 65534 && e.subarray && sf)
      return String.fromCharCode.apply(
        null,
        e.length === t ? e : e.subarray(0, t),
      );
    let n = ``;
    for (let r = 0; r < t; r++) n += String.fromCharCode(e[r]);
    return n;
  },
  df = {
    string2buf: lf,
    buf2string: (e, t) => {
      let n = t || e.length;
      if (typeof TextDecoder == `function` && TextDecoder.prototype.decode)
        return new TextDecoder().decode(e.subarray(0, t));
      let r,
        i,
        a = Array(n * 2);
      for (i = 0, r = 0; r < n; ) {
        let t = e[r++];
        if (t < 128) {
          a[i++] = t;
          continue;
        }
        let o = cf[t];
        if (o > 4) {
          ((a[i++] = 65533), (r += o - 1));
          continue;
        }
        for (t &= o === 2 ? 31 : o === 3 ? 15 : 7; o > 1 && r < n; )
          ((t = (t << 6) | (e[r++] & 63)), o--);
        if (o > 1) {
          a[i++] = 65533;
          continue;
        }
        t < 65536
          ? (a[i++] = t)
          : ((t -= 65536),
            (a[i++] = 55296 | ((t >> 10) & 1023)),
            (a[i++] = 56320 | (t & 1023)));
      }
      return uf(a, i);
    },
    utf8border: (e, t) => {
      ((t ||= e.length), t > e.length && (t = e.length));
      let n = t - 1;
      for (; n >= 0 && (e[n] & 192) == 128; ) n--;
      return n < 0 || n === 0 ? t : n + cf[e[n]] > t ? n : t;
    },
  };
function ff() {
  ((this.input = null),
    (this.next_in = 0),
    (this.avail_in = 0),
    (this.total_in = 0),
    (this.output = null),
    (this.next_out = 0),
    (this.avail_out = 0),
    (this.total_out = 0),
    (this.msg = ``),
    (this.state = null),
    (this.data_type = 2),
    (this.adler = 0));
}
var pf = ff,
  mf = Object.prototype.toString,
  {
    Z_NO_FLUSH: hf,
    Z_SYNC_FLUSH: gf,
    Z_FULL_FLUSH: _f,
    Z_FINISH: vf,
    Z_OK: yf,
    Z_STREAM_END: bf,
    Z_DEFAULT_COMPRESSION: xf,
    Z_DEFAULT_STRATEGY: Sf,
    Z_DEFLATED: Cf,
  } = Uu;
function wf(e) {
  this.options = of.assign(
    {
      level: xf,
      method: Cf,
      chunkSize: 16384,
      windowBits: 15,
      memLevel: 8,
      strategy: Sf,
    },
    e || {},
  );
  let t = this.options;
  (t.raw && t.windowBits > 0
    ? (t.windowBits = -t.windowBits)
    : t.gzip && t.windowBits > 0 && t.windowBits < 16 && (t.windowBits += 16),
    (this.err = 0),
    (this.msg = ``),
    (this.ended = !1),
    (this.chunks = []),
    (this.strm = new pf()),
    (this.strm.avail_out = 0));
  let n = rf.deflateInit2(
    this.strm,
    t.level,
    t.method,
    t.windowBits,
    t.memLevel,
    t.strategy,
  );
  if (n !== yf) throw Error(Hu[n]);
  if ((t.header && rf.deflateSetHeader(this.strm, t.header), t.dictionary)) {
    let e;
    if (
      ((e =
        typeof t.dictionary == `string`
          ? df.string2buf(t.dictionary)
          : mf.call(t.dictionary) === `[object ArrayBuffer]`
            ? new Uint8Array(t.dictionary)
            : t.dictionary),
      (n = rf.deflateSetDictionary(this.strm, e)),
      n !== yf)
    )
      throw Error(Hu[n]);
    this._dict_set = !0;
  }
}
((wf.prototype.push = function (e, t) {
  let n = this.strm,
    r = this.options.chunkSize,
    i,
    a;
  if (this.ended) return !1;
  for (
    a = t === ~~t ? t : t === !0 ? vf : hf,
      typeof e == `string`
        ? (n.input = df.string2buf(e))
        : mf.call(e) === `[object ArrayBuffer]`
          ? (n.input = new Uint8Array(e))
          : (n.input = e),
      n.next_in = 0,
      n.avail_in = n.input.length;
    ;
  ) {
    if (
      (n.avail_out === 0 &&
        ((n.output = new Uint8Array(r)), (n.next_out = 0), (n.avail_out = r)),
      (a === gf || a === _f) && n.avail_out <= 6)
    ) {
      (this.onData(n.output.subarray(0, n.next_out)), (n.avail_out = 0));
      continue;
    }
    if (((i = rf.deflate(n, a)), i === bf))
      return (
        n.next_out > 0 && this.onData(n.output.subarray(0, n.next_out)),
        (i = rf.deflateEnd(this.strm)),
        this.onEnd(i),
        (this.ended = !0),
        i === yf
      );
    if (n.avail_out === 0) {
      this.onData(n.output);
      continue;
    }
    if (a > 0 && n.next_out > 0) {
      (this.onData(n.output.subarray(0, n.next_out)), (n.avail_out = 0));
      continue;
    }
    if (n.avail_in === 0) break;
  }
  return !0;
}),
  (wf.prototype.onData = function (e) {
    this.chunks.push(e);
  }),
  (wf.prototype.onEnd = function (e) {
    (e === yf && (this.result = of.flattenChunks(this.chunks)),
      (this.chunks = []),
      (this.err = e),
      (this.msg = this.strm.msg));
  }));
function Tf(e, t) {
  let n = new wf(t);
  if ((n.push(e, !0), n.err)) throw n.msg || Hu[n.err];
  return n.result;
}
function Ef(e, t) {
  return ((t ||= {}), (t.raw = !0), Tf(e, t));
}
function Df(e, t) {
  return ((t ||= {}), (t.gzip = !0), Tf(e, t));
}
var Of = { Deflate: wf, deflate: Tf, deflateRaw: Ef, gzip: Df, constants: Uu },
  kf = 16209,
  Af = 16191,
  jf = function (e, t) {
    let n,
      r,
      i,
      a,
      o,
      s,
      c,
      l,
      u,
      d,
      f,
      p,
      m,
      h,
      g,
      _,
      v,
      y,
      b,
      x,
      S,
      C,
      w,
      T,
      E = e.state;
    ((n = e.next_in),
      (w = e.input),
      (r = n + (e.avail_in - 5)),
      (i = e.next_out),
      (T = e.output),
      (a = i - (t - e.avail_out)),
      (o = i + (e.avail_out - 257)),
      (s = E.dmax),
      (c = E.wsize),
      (l = E.whave),
      (u = E.wnext),
      (d = E.window),
      (f = E.hold),
      (p = E.bits),
      (m = E.lencode),
      (h = E.distcode),
      (g = (1 << E.lenbits) - 1),
      (_ = (1 << E.distbits) - 1));
    top: do {
      (p < 15 && ((f += w[n++] << p), (p += 8), (f += w[n++] << p), (p += 8)),
        (v = m[f & g]));
      dolen: for (;;) {
        if (
          ((y = v >>> 24),
          (f >>>= y),
          (p -= y),
          (y = (v >>> 16) & 255),
          y === 0)
        )
          T[i++] = v & 65535;
        else if (y & 16) {
          ((b = v & 65535),
            (y &= 15),
            y &&
              (p < y && ((f += w[n++] << p), (p += 8)),
              (b += f & ((1 << y) - 1)),
              (f >>>= y),
              (p -= y)),
            p < 15 &&
              ((f += w[n++] << p), (p += 8), (f += w[n++] << p), (p += 8)),
            (v = h[f & _]));
          dodist: for (;;) {
            if (
              ((y = v >>> 24),
              (f >>>= y),
              (p -= y),
              (y = (v >>> 16) & 255),
              y & 16)
            ) {
              if (
                ((x = v & 65535),
                (y &= 15),
                p < y &&
                  ((f += w[n++] << p),
                  (p += 8),
                  p < y && ((f += w[n++] << p), (p += 8))),
                (x += f & ((1 << y) - 1)),
                x > s)
              ) {
                ((e.msg = `invalid distance too far back`), (E.mode = kf));
                break top;
              }
              if (((f >>>= y), (p -= y), (y = i - a), x > y)) {
                if (((y = x - y), y > l && E.sane)) {
                  ((e.msg = `invalid distance too far back`), (E.mode = kf));
                  break top;
                }
                if (((S = 0), (C = d), u === 0)) {
                  if (((S += c - y), y < b)) {
                    b -= y;
                    do T[i++] = d[S++];
                    while (--y);
                    ((S = i - x), (C = T));
                  }
                } else if (u < y) {
                  if (((S += c + u - y), (y -= u), y < b)) {
                    b -= y;
                    do T[i++] = d[S++];
                    while (--y);
                    if (((S = 0), u < b)) {
                      ((y = u), (b -= y));
                      do T[i++] = d[S++];
                      while (--y);
                      ((S = i - x), (C = T));
                    }
                  }
                } else if (((S += u - y), y < b)) {
                  b -= y;
                  do T[i++] = d[S++];
                  while (--y);
                  ((S = i - x), (C = T));
                }
                for (; b > 2; )
                  ((T[i++] = C[S++]),
                    (T[i++] = C[S++]),
                    (T[i++] = C[S++]),
                    (b -= 3));
                b && ((T[i++] = C[S++]), b > 1 && (T[i++] = C[S++]));
              } else {
                S = i - x;
                do
                  ((T[i++] = T[S++]),
                    (T[i++] = T[S++]),
                    (T[i++] = T[S++]),
                    (b -= 3));
                while (b > 2);
                b && ((T[i++] = T[S++]), b > 1 && (T[i++] = T[S++]));
              }
            } else if (y & 64) {
              ((e.msg = `invalid distance code`), (E.mode = kf));
              break top;
            } else {
              v = h[(v & 65535) + (f & ((1 << y) - 1))];
              continue dodist;
            }
            break;
          }
        } else if (y & 64)
          if (y & 32) {
            E.mode = Af;
            break top;
          } else {
            ((e.msg = `invalid literal/length code`), (E.mode = kf));
            break top;
          }
        else {
          v = m[(v & 65535) + (f & ((1 << y) - 1))];
          continue dolen;
        }
        break;
      }
    } while (n < r && i < o);
    ((b = p >> 3),
      (n -= b),
      (p -= b << 3),
      (f &= (1 << p) - 1),
      (e.next_in = n),
      (e.next_out = i),
      (e.avail_in = n < r ? 5 + (r - n) : 5 - (n - r)),
      (e.avail_out = i < o ? 257 + (o - i) : 257 - (i - o)),
      (E.hold = f),
      (E.bits = p));
  },
  Mf = 15,
  Nf = 852,
  Pf = 592,
  Ff = 0,
  If = 1,
  Lf = 2,
  Rf = new Uint16Array([
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67,
    83, 99, 115, 131, 163, 195, 227, 258, 0, 0,
  ]),
  zf = new Uint8Array([
    16, 16, 16, 16, 16, 16, 16, 16, 17, 17, 17, 17, 18, 18, 18, 18, 19, 19, 19,
    19, 20, 20, 20, 20, 21, 21, 21, 21, 16, 72, 78,
  ]),
  Bf = new Uint16Array([
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513,
    769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577, 0, 0,
  ]),
  Vf = new Uint8Array([
    16, 16, 16, 16, 17, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 23, 24,
    24, 25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 64, 64,
  ]),
  Hf = (e, t, n, r, i, a, o, s) => {
    let c = s.bits,
      l = 0,
      u = 0,
      d = 0,
      f = 0,
      p = 0,
      m = 0,
      h = 0,
      g = 0,
      _ = 0,
      v = 0,
      y,
      b,
      x,
      S,
      C,
      w = null,
      T,
      E = new Uint16Array(Mf + 1),
      D = new Uint16Array(Mf + 1),
      O = null,
      k,
      A,
      ee;
    for (l = 0; l <= Mf; l++) E[l] = 0;
    for (u = 0; u < r; u++) E[t[n + u]]++;
    for (p = c, f = Mf; f >= 1 && E[f] === 0; f--);
    if ((p > f && (p = f), f === 0))
      return ((i[a++] = 20971520), (i[a++] = 20971520), (s.bits = 1), 0);
    for (d = 1; d < f && E[d] === 0; d++);
    for (p < d && (p = d), g = 1, l = 1; l <= Mf; l++)
      if (((g <<= 1), (g -= E[l]), g < 0)) return -1;
    if (g > 0 && (e === Ff || f !== 1)) return -1;
    for (D[1] = 0, l = 1; l < Mf; l++) D[l + 1] = D[l] + E[l];
    for (u = 0; u < r; u++) t[n + u] !== 0 && (o[D[t[n + u]]++] = u);
    if (
      (e === Ff
        ? ((w = O = o), (T = 20))
        : e === If
          ? ((w = Rf), (O = zf), (T = 257))
          : ((w = Bf), (O = Vf), (T = 0)),
      (v = 0),
      (u = 0),
      (l = d),
      (C = a),
      (m = p),
      (h = 0),
      (x = -1),
      (_ = 1 << p),
      (S = _ - 1),
      (e === If && _ > Nf) || (e === Lf && _ > Pf))
    )
      return 1;
    for (;;) {
      ((k = l - h),
        o[u] + 1 < T
          ? ((A = 0), (ee = o[u]))
          : o[u] >= T
            ? ((A = O[o[u] - T]), (ee = w[o[u] - T]))
            : ((A = 96), (ee = 0)),
        (y = 1 << (l - h)),
        (b = 1 << m),
        (d = b));
      do ((b -= y), (i[C + (v >> h) + b] = (k << 24) | (A << 16) | ee | 0));
      while (b !== 0);
      for (y = 1 << (l - 1); v & y; ) y >>= 1;
      if ((y === 0 ? (v = 0) : ((v &= y - 1), (v += y)), u++, --E[l] === 0)) {
        if (l === f) break;
        l = t[n + o[u]];
      }
      if (l > p && (v & S) !== x) {
        for (
          h === 0 && (h = p), C += d, m = l - h, g = 1 << m;
          m + h < f && ((g -= E[m + h]), !(g <= 0));
        )
          (m++, (g <<= 1));
        if (((_ += 1 << m), (e === If && _ > Nf) || (e === Lf && _ > Pf)))
          return 1;
        ((x = v & S), (i[x] = (p << 24) | (m << 16) | (C - a) | 0));
      }
    }
    return (v !== 0 && (i[C + v] = ((l - h) << 24) | 4194304), (s.bits = p), 0);
  },
  Uf = 0,
  Wf = 1,
  Gf = 2,
  {
    Z_FINISH: Kf,
    Z_BLOCK: qf,
    Z_TREES: Jf,
    Z_OK: Yf,
    Z_STREAM_END: Xf,
    Z_NEED_DICT: Zf,
    Z_STREAM_ERROR: Qf,
    Z_DATA_ERROR: $f,
    Z_MEM_ERROR: ep,
    Z_BUF_ERROR: tp,
    Z_DEFLATED: np,
  } = Uu,
  rp = 16180,
  ip = 16181,
  ap = 16182,
  op = 16183,
  sp = 16184,
  cp = 16185,
  lp = 16186,
  up = 16187,
  dp = 16188,
  fp = 16189,
  pp = 16190,
  mp = 16191,
  hp = 16192,
  gp = 16193,
  _p = 16194,
  vp = 16195,
  yp = 16196,
  bp = 16197,
  xp = 16198,
  Sp = 16199,
  Cp = 16200,
  wp = 16201,
  Tp = 16202,
  Ep = 16203,
  Dp = 16204,
  Op = 16205,
  kp = 16206,
  Ap = 16207,
  jp = 16208,
  $ = 16209,
  Mp = 16210,
  Np = 16211,
  Pp = 852,
  Fp = 592,
  Ip = 15,
  Lp = (e) =>
    ((e >>> 24) & 255) +
    ((e >>> 8) & 65280) +
    ((e & 65280) << 8) +
    ((e & 255) << 24);
function Rp() {
  ((this.strm = null),
    (this.mode = 0),
    (this.last = !1),
    (this.wrap = 0),
    (this.havedict = !1),
    (this.flags = 0),
    (this.dmax = 0),
    (this.check = 0),
    (this.total = 0),
    (this.head = null),
    (this.wbits = 0),
    (this.wsize = 0),
    (this.whave = 0),
    (this.wnext = 0),
    (this.window = null),
    (this.hold = 0),
    (this.bits = 0),
    (this.length = 0),
    (this.offset = 0),
    (this.extra = 0),
    (this.lencode = null),
    (this.distcode = null),
    (this.lenbits = 0),
    (this.distbits = 0),
    (this.ncode = 0),
    (this.nlen = 0),
    (this.ndist = 0),
    (this.have = 0),
    (this.next = null),
    (this.lens = new Uint16Array(320)),
    (this.work = new Uint16Array(288)),
    (this.lendyn = null),
    (this.distdyn = null),
    (this.sane = 0),
    (this.back = 0),
    (this.was = 0));
}
var zp = (e) => {
    if (!e) return 1;
    let t = e.state;
    return !t || t.strm !== e || t.mode < rp || t.mode > Np ? 1 : 0;
  },
  Bp = (e) => {
    if (zp(e)) return Qf;
    let t = e.state;
    return (
      (e.total_in = e.total_out = t.total = 0),
      (e.msg = ``),
      t.wrap && (e.adler = t.wrap & 1),
      (t.mode = rp),
      (t.last = 0),
      (t.havedict = 0),
      (t.flags = -1),
      (t.dmax = 32768),
      (t.head = null),
      (t.hold = 0),
      (t.bits = 0),
      (t.lencode = t.lendyn = new Int32Array(Pp)),
      (t.distcode = t.distdyn = new Int32Array(Fp)),
      (t.sane = 1),
      (t.back = -1),
      Yf
    );
  },
  Vp = (e) => {
    if (zp(e)) return Qf;
    let t = e.state;
    return ((t.wsize = 0), (t.whave = 0), (t.wnext = 0), Bp(e));
  },
  Hp = (e, t) => {
    let n;
    if (zp(e)) return Qf;
    let r = e.state;
    return (
      t < 0 ? ((n = 0), (t = -t)) : ((n = (t >> 4) + 5), t < 48 && (t &= 15)),
      t && (t < 8 || t > 15)
        ? Qf
        : (r.window !== null && r.wbits !== t && (r.window = null),
          (r.wrap = n),
          (r.wbits = t),
          Vp(e))
    );
  },
  Up = (e, t) => {
    if (!e) return Qf;
    let n = new Rp();
    ((e.state = n), (n.strm = e), (n.window = null), (n.mode = rp));
    let r = Hp(e, t);
    return (r !== Yf && (e.state = null), r);
  },
  Wp = (e) => Up(e, Ip),
  Gp = !0,
  Kp,
  qp,
  Jp = (e) => {
    if (Gp) {
      ((Kp = new Int32Array(512)), (qp = new Int32Array(32)));
      let t = 0;
      for (; t < 144; ) e.lens[t++] = 8;
      for (; t < 256; ) e.lens[t++] = 9;
      for (; t < 280; ) e.lens[t++] = 7;
      for (; t < 288; ) e.lens[t++] = 8;
      for (Hf(Wf, e.lens, 0, 288, Kp, 0, e.work, { bits: 9 }), t = 0; t < 32; )
        e.lens[t++] = 5;
      (Hf(Gf, e.lens, 0, 32, qp, 0, e.work, { bits: 5 }), (Gp = !1));
    }
    ((e.lencode = Kp), (e.lenbits = 9), (e.distcode = qp), (e.distbits = 5));
  },
  Yp = (e, t, n, r) => {
    let i,
      a = e.state;
    return (
      a.window === null &&
        ((a.wsize = 1 << a.wbits),
        (a.wnext = 0),
        (a.whave = 0),
        (a.window = new Uint8Array(a.wsize))),
      r >= a.wsize
        ? (a.window.set(t.subarray(n - a.wsize, n), 0),
          (a.wnext = 0),
          (a.whave = a.wsize))
        : ((i = a.wsize - a.wnext),
          i > r && (i = r),
          a.window.set(t.subarray(n - r, n - r + i), a.wnext),
          (r -= i),
          r
            ? (a.window.set(t.subarray(n - r, n), 0),
              (a.wnext = r),
              (a.whave = a.wsize))
            : ((a.wnext += i),
              a.wnext === a.wsize && (a.wnext = 0),
              a.whave < a.wsize && (a.whave += i))),
      0
    );
  },
  Xp = {
    inflateReset: Vp,
    inflateReset2: Hp,
    inflateResetKeep: Bp,
    inflateInit: Wp,
    inflateInit2: Up,
    inflate: (e, t) => {
      let n,
        r,
        i,
        a,
        o,
        s,
        c,
        l,
        u,
        d,
        f,
        p,
        m,
        h,
        g = 0,
        _,
        v,
        y,
        b,
        x,
        S,
        C,
        w,
        T = new Uint8Array(4),
        E,
        D,
        O = new Uint8Array([
          16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
        ]);
      if (zp(e) || !e.output || (!e.input && e.avail_in !== 0)) return Qf;
      ((n = e.state),
        n.mode === mp && (n.mode = hp),
        (o = e.next_out),
        (i = e.output),
        (c = e.avail_out),
        (a = e.next_in),
        (r = e.input),
        (s = e.avail_in),
        (l = n.hold),
        (u = n.bits),
        (d = s),
        (f = c),
        (w = Yf));
      inf_leave: for (;;)
        switch (n.mode) {
          case rp:
            if (n.wrap === 0) {
              n.mode = hp;
              break;
            }
            for (; u < 16; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if (n.wrap & 2 && l === 35615) {
              (n.wbits === 0 && (n.wbits = 15),
                (n.check = 0),
                (T[0] = l & 255),
                (T[1] = (l >>> 8) & 255),
                (n.check = G(n.check, T, 2, 0)),
                (l = 0),
                (u = 0),
                (n.mode = ip));
              break;
            }
            if (
              (n.head && (n.head.done = !1),
              !(n.wrap & 1) || (((l & 255) << 8) + (l >> 8)) % 31)
            ) {
              ((e.msg = `incorrect header check`), (n.mode = $));
              break;
            }
            if ((l & 15) !== np) {
              ((e.msg = `unknown compression method`), (n.mode = $));
              break;
            }
            if (
              ((l >>>= 4),
              (u -= 4),
              (C = (l & 15) + 8),
              n.wbits === 0 && (n.wbits = C),
              C > 15 || C > n.wbits)
            ) {
              ((e.msg = `invalid window size`), (n.mode = $));
              break;
            }
            ((n.dmax = 1 << n.wbits),
              (n.flags = 0),
              (e.adler = n.check = 1),
              (n.mode = l & 512 ? fp : mp),
              (l = 0),
              (u = 0));
            break;
          case ip:
            for (; u < 16; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if (((n.flags = l), (n.flags & 255) !== np)) {
              ((e.msg = `unknown compression method`), (n.mode = $));
              break;
            }
            if (n.flags & 57344) {
              ((e.msg = `unknown header flags set`), (n.mode = $));
              break;
            }
            (n.head && (n.head.text = (l >> 8) & 1),
              n.flags & 512 &&
                n.wrap & 4 &&
                ((T[0] = l & 255),
                (T[1] = (l >>> 8) & 255),
                (n.check = G(n.check, T, 2, 0))),
              (l = 0),
              (u = 0),
              (n.mode = ap));
          case ap:
            for (; u < 32; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            (n.head && (n.head.time = l),
              n.flags & 512 &&
                n.wrap & 4 &&
                ((T[0] = l & 255),
                (T[1] = (l >>> 8) & 255),
                (T[2] = (l >>> 16) & 255),
                (T[3] = (l >>> 24) & 255),
                (n.check = G(n.check, T, 4, 0))),
              (l = 0),
              (u = 0),
              (n.mode = op));
          case op:
            for (; u < 16; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            (n.head && ((n.head.xflags = l & 255), (n.head.os = l >> 8)),
              n.flags & 512 &&
                n.wrap & 4 &&
                ((T[0] = l & 255),
                (T[1] = (l >>> 8) & 255),
                (n.check = G(n.check, T, 2, 0))),
              (l = 0),
              (u = 0),
              (n.mode = sp));
          case sp:
            if (n.flags & 1024) {
              for (; u < 16; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((n.length = l),
                n.head && (n.head.extra_len = l),
                n.flags & 512 &&
                  n.wrap & 4 &&
                  ((T[0] = l & 255),
                  (T[1] = (l >>> 8) & 255),
                  (n.check = G(n.check, T, 2, 0))),
                (l = 0),
                (u = 0));
            } else n.head && (n.head.extra = null);
            n.mode = cp;
          case cp:
            if (
              n.flags & 1024 &&
              ((p = n.length),
              p > s && (p = s),
              p &&
                (n.head &&
                  ((C = n.head.extra_len - n.length),
                  n.head.extra ||
                    (n.head.extra = new Uint8Array(n.head.extra_len)),
                  n.head.extra.set(r.subarray(a, a + p), C)),
                n.flags & 512 && n.wrap & 4 && (n.check = G(n.check, r, p, a)),
                (s -= p),
                (a += p),
                (n.length -= p)),
              n.length)
            )
              break inf_leave;
            ((n.length = 0), (n.mode = lp));
          case lp:
            if (n.flags & 2048) {
              if (s === 0) break inf_leave;
              p = 0;
              do
                ((C = r[a + p++]),
                  n.head &&
                    C &&
                    n.length < 65536 &&
                    (n.head.name += String.fromCharCode(C)));
              while (C && p < s);
              if (
                (n.flags & 512 && n.wrap & 4 && (n.check = G(n.check, r, p, a)),
                (s -= p),
                (a += p),
                C)
              )
                break inf_leave;
            } else n.head && (n.head.name = null);
            ((n.length = 0), (n.mode = up));
          case up:
            if (n.flags & 4096) {
              if (s === 0) break inf_leave;
              p = 0;
              do
                ((C = r[a + p++]),
                  n.head &&
                    C &&
                    n.length < 65536 &&
                    (n.head.comment += String.fromCharCode(C)));
              while (C && p < s);
              if (
                (n.flags & 512 && n.wrap & 4 && (n.check = G(n.check, r, p, a)),
                (s -= p),
                (a += p),
                C)
              )
                break inf_leave;
            } else n.head && (n.head.comment = null);
            n.mode = dp;
          case dp:
            if (n.flags & 512) {
              for (; u < 16; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              if (n.wrap & 4 && l !== (n.check & 65535)) {
                ((e.msg = `header crc mismatch`), (n.mode = $));
                break;
              }
              ((l = 0), (u = 0));
            }
            (n.head && ((n.head.hcrc = (n.flags >> 9) & 1), (n.head.done = !0)),
              (e.adler = n.check = 0),
              (n.mode = mp));
            break;
          case fp:
            for (; u < 32; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            ((e.adler = n.check = Lp(l)), (l = 0), (u = 0), (n.mode = pp));
          case pp:
            if (n.havedict === 0)
              return (
                (e.next_out = o),
                (e.avail_out = c),
                (e.next_in = a),
                (e.avail_in = s),
                (n.hold = l),
                (n.bits = u),
                Zf
              );
            ((e.adler = n.check = 1), (n.mode = mp));
          case mp:
            if (t === qf || t === Jf) break inf_leave;
          case hp:
            if (n.last) {
              ((l >>>= u & 7), (u -= u & 7), (n.mode = kp));
              break;
            }
            for (; u < 3; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            switch (((n.last = l & 1), (l >>>= 1), --u, l & 3)) {
              case 0:
                n.mode = gp;
                break;
              case 1:
                if ((Jp(n), (n.mode = Sp), t === Jf)) {
                  ((l >>>= 2), (u -= 2));
                  break inf_leave;
                }
                break;
              case 2:
                n.mode = yp;
                break;
              case 3:
                ((e.msg = `invalid block type`), (n.mode = $));
            }
            ((l >>>= 2), (u -= 2));
            break;
          case gp:
            for (l >>>= u & 7, u -= u & 7; u < 32; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if ((l & 65535) != ((l >>> 16) ^ 65535)) {
              ((e.msg = `invalid stored block lengths`), (n.mode = $));
              break;
            }
            if (
              ((n.length = l & 65535),
              (l = 0),
              (u = 0),
              (n.mode = _p),
              t === Jf)
            )
              break inf_leave;
          case _p:
            n.mode = vp;
          case vp:
            if (((p = n.length), p)) {
              if ((p > s && (p = s), p > c && (p = c), p === 0))
                break inf_leave;
              (i.set(r.subarray(a, a + p), o),
                (s -= p),
                (a += p),
                (c -= p),
                (o += p),
                (n.length -= p));
              break;
            }
            n.mode = mp;
            break;
          case yp:
            for (; u < 14; ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if (
              ((n.nlen = (l & 31) + 257),
              (l >>>= 5),
              (u -= 5),
              (n.ndist = (l & 31) + 1),
              (l >>>= 5),
              (u -= 5),
              (n.ncode = (l & 15) + 4),
              (l >>>= 4),
              (u -= 4),
              n.nlen > 286 || n.ndist > 30)
            ) {
              ((e.msg = `too many length or distance symbols`), (n.mode = $));
              break;
            }
            ((n.have = 0), (n.mode = bp));
          case bp:
            for (; n.have < n.ncode; ) {
              for (; u < 3; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((n.lens[O[n.have++]] = l & 7), (l >>>= 3), (u -= 3));
            }
            for (; n.have < 19; ) n.lens[O[n.have++]] = 0;
            if (
              ((n.lencode = n.lendyn),
              (n.lenbits = 7),
              (E = { bits: n.lenbits }),
              (w = Hf(Uf, n.lens, 0, 19, n.lencode, 0, n.work, E)),
              (n.lenbits = E.bits),
              w)
            ) {
              ((e.msg = `invalid code lengths set`), (n.mode = $));
              break;
            }
            ((n.have = 0), (n.mode = xp));
          case xp:
            for (; n.have < n.nlen + n.ndist; ) {
              for (
                ;
                (g = n.lencode[l & ((1 << n.lenbits) - 1)]),
                  (_ = g >>> 24),
                  (v = (g >>> 16) & 255),
                  (y = g & 65535),
                  !(_ <= u);
              ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              if (y < 16) ((l >>>= _), (u -= _), (n.lens[n.have++] = y));
              else {
                if (y === 16) {
                  for (D = _ + 2; u < D; ) {
                    if (s === 0) break inf_leave;
                    (s--, (l += r[a++] << u), (u += 8));
                  }
                  if (((l >>>= _), (u -= _), n.have === 0)) {
                    ((e.msg = `invalid bit length repeat`), (n.mode = $));
                    break;
                  }
                  ((C = n.lens[n.have - 1]),
                    (p = 3 + (l & 3)),
                    (l >>>= 2),
                    (u -= 2));
                } else if (y === 17) {
                  for (D = _ + 3; u < D; ) {
                    if (s === 0) break inf_leave;
                    (s--, (l += r[a++] << u), (u += 8));
                  }
                  ((l >>>= _),
                    (u -= _),
                    (C = 0),
                    (p = 3 + (l & 7)),
                    (l >>>= 3),
                    (u -= 3));
                } else {
                  for (D = _ + 7; u < D; ) {
                    if (s === 0) break inf_leave;
                    (s--, (l += r[a++] << u), (u += 8));
                  }
                  ((l >>>= _),
                    (u -= _),
                    (C = 0),
                    (p = 11 + (l & 127)),
                    (l >>>= 7),
                    (u -= 7));
                }
                if (n.have + p > n.nlen + n.ndist) {
                  ((e.msg = `invalid bit length repeat`), (n.mode = $));
                  break;
                }
                for (; p--; ) n.lens[n.have++] = C;
              }
            }
            if (n.mode === $) break;
            if (n.lens[256] === 0) {
              ((e.msg = `invalid code -- missing end-of-block`), (n.mode = $));
              break;
            }
            if (
              ((n.lenbits = 9),
              (E = { bits: n.lenbits }),
              (w = Hf(Wf, n.lens, 0, n.nlen, n.lencode, 0, n.work, E)),
              (n.lenbits = E.bits),
              w)
            ) {
              ((e.msg = `invalid literal/lengths set`), (n.mode = $));
              break;
            }
            if (
              ((n.distbits = 6),
              (n.distcode = n.distdyn),
              (E = { bits: n.distbits }),
              (w = Hf(Gf, n.lens, n.nlen, n.ndist, n.distcode, 0, n.work, E)),
              (n.distbits = E.bits),
              w)
            ) {
              ((e.msg = `invalid distances set`), (n.mode = $));
              break;
            }
            if (((n.mode = Sp), t === Jf)) break inf_leave;
          case Sp:
            n.mode = Cp;
          case Cp:
            if (s >= 6 && c >= 258) {
              ((e.next_out = o),
                (e.avail_out = c),
                (e.next_in = a),
                (e.avail_in = s),
                (n.hold = l),
                (n.bits = u),
                jf(e, f),
                (o = e.next_out),
                (i = e.output),
                (c = e.avail_out),
                (a = e.next_in),
                (r = e.input),
                (s = e.avail_in),
                (l = n.hold),
                (u = n.bits),
                n.mode === mp && (n.back = -1));
              break;
            }
            for (
              n.back = 0;
              (g = n.lencode[l & ((1 << n.lenbits) - 1)]),
                (_ = g >>> 24),
                (v = (g >>> 16) & 255),
                (y = g & 65535),
                !(_ <= u);
            ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if (v && !(v & 240)) {
              for (
                b = _, x = v, S = y;
                (g = n.lencode[S + ((l & ((1 << (b + x)) - 1)) >> b)]),
                  (_ = g >>> 24),
                  (v = (g >>> 16) & 255),
                  (y = g & 65535),
                  !(b + _ <= u);
              ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((l >>>= b), (u -= b), (n.back += b));
            }
            if (
              ((l >>>= _), (u -= _), (n.back += _), (n.length = y), v === 0)
            ) {
              n.mode = Op;
              break;
            }
            if (v & 32) {
              ((n.back = -1), (n.mode = mp));
              break;
            }
            if (v & 64) {
              ((e.msg = `invalid literal/length code`), (n.mode = $));
              break;
            }
            ((n.extra = v & 15), (n.mode = wp));
          case wp:
            if (n.extra) {
              for (D = n.extra; u < D; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((n.length += l & ((1 << n.extra) - 1)),
                (l >>>= n.extra),
                (u -= n.extra),
                (n.back += n.extra));
            }
            ((n.was = n.length), (n.mode = Tp));
          case Tp:
            for (
              ;
              (g = n.distcode[l & ((1 << n.distbits) - 1)]),
                (_ = g >>> 24),
                (v = (g >>> 16) & 255),
                (y = g & 65535),
                !(_ <= u);
            ) {
              if (s === 0) break inf_leave;
              (s--, (l += r[a++] << u), (u += 8));
            }
            if (!(v & 240)) {
              for (
                b = _, x = v, S = y;
                (g = n.distcode[S + ((l & ((1 << (b + x)) - 1)) >> b)]),
                  (_ = g >>> 24),
                  (v = (g >>> 16) & 255),
                  (y = g & 65535),
                  !(b + _ <= u);
              ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((l >>>= b), (u -= b), (n.back += b));
            }
            if (((l >>>= _), (u -= _), (n.back += _), v & 64)) {
              ((e.msg = `invalid distance code`), (n.mode = $));
              break;
            }
            ((n.offset = y), (n.extra = v & 15), (n.mode = Ep));
          case Ep:
            if (n.extra) {
              for (D = n.extra; u < D; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              ((n.offset += l & ((1 << n.extra) - 1)),
                (l >>>= n.extra),
                (u -= n.extra),
                (n.back += n.extra));
            }
            if (n.offset > n.dmax) {
              ((e.msg = `invalid distance too far back`), (n.mode = $));
              break;
            }
            n.mode = Dp;
          case Dp:
            if (c === 0) break inf_leave;
            if (((p = f - c), n.offset > p)) {
              if (((p = n.offset - p), p > n.whave && n.sane)) {
                ((e.msg = `invalid distance too far back`), (n.mode = $));
                break;
              }
              (p > n.wnext
                ? ((p -= n.wnext), (m = n.wsize - p))
                : (m = n.wnext - p),
                p > n.length && (p = n.length),
                (h = n.window));
            } else ((h = i), (m = o - n.offset), (p = n.length));
            (p > c && (p = c), (c -= p), (n.length -= p));
            do i[o++] = h[m++];
            while (--p);
            n.length === 0 && (n.mode = Cp);
            break;
          case Op:
            if (c === 0) break inf_leave;
            ((i[o++] = n.length), c--, (n.mode = Cp));
            break;
          case kp:
            if (n.wrap) {
              for (; u < 32; ) {
                if (s === 0) break inf_leave;
                (s--, (l |= r[a++] << u), (u += 8));
              }
              if (
                ((f -= c),
                (e.total_out += f),
                (n.total += f),
                n.wrap & 4 &&
                  f &&
                  (e.adler = n.check =
                    n.flags
                      ? G(n.check, i, f, o - f)
                      : Bu(n.check, i, f, o - f)),
                (f = c),
                n.wrap & 4 && (n.flags ? l : Lp(l)) !== n.check)
              ) {
                ((e.msg = `incorrect data check`), (n.mode = $));
                break;
              }
              ((l = 0), (u = 0));
            }
            n.mode = Ap;
          case Ap:
            if (n.wrap && n.flags) {
              for (; u < 32; ) {
                if (s === 0) break inf_leave;
                (s--, (l += r[a++] << u), (u += 8));
              }
              if (n.wrap & 4 && l !== (n.total & 4294967295)) {
                ((e.msg = `incorrect length check`), (n.mode = $));
                break;
              }
              ((l = 0), (u = 0));
            }
            n.mode = jp;
          case jp:
            w = Xf;
            break inf_leave;
          case $:
            w = $f;
            break inf_leave;
          case Mp:
            return ep;
          case Np:
          default:
            return Qf;
        }
      return (
        (e.next_out = o),
        (e.avail_out = c),
        (e.next_in = a),
        (e.avail_in = s),
        (n.hold = l),
        (n.bits = u),
        (n.wsize ||
          (f !== e.avail_out && n.mode < $ && (n.mode < kp || t !== Kf))) &&
          Yp(e, e.output, e.next_out, f - e.avail_out),
        (d -= e.avail_in),
        (f -= e.avail_out),
        (e.total_in += d),
        (e.total_out += f),
        (n.total += f),
        n.wrap & 4 &&
          f &&
          (e.adler = n.check =
            n.flags
              ? G(n.check, i, f, e.next_out - f)
              : Bu(n.check, i, f, e.next_out - f)),
        (e.data_type =
          n.bits +
          (n.last ? 64 : 0) +
          (n.mode === mp ? 128 : 0) +
          (n.mode === Sp || n.mode === _p ? 256 : 0)),
        ((d === 0 && f === 0) || t === Kf) && w === Yf && (w = tp),
        w
      );
    },
    inflateEnd: (e) => {
      if (zp(e)) return Qf;
      let t = e.state;
      return ((t.window &&= null), (e.state = null), Yf);
    },
    inflateGetHeader: (e, t) => {
      if (zp(e)) return Qf;
      let n = e.state;
      return n.wrap & 2 ? ((n.head = t), (t.done = !1), Yf) : Qf;
    },
    inflateSetDictionary: (e, t) => {
      let n = t.length,
        r,
        i,
        a;
      return zp(e) || ((r = e.state), r.wrap !== 0 && r.mode !== pp)
        ? Qf
        : r.mode === pp && ((i = 1), (i = Bu(i, t, n, 0)), i !== r.check)
          ? $f
          : ((a = Yp(e, t, n, n)),
            a ? ((r.mode = Mp), ep) : ((r.havedict = 1), Yf));
    },
    inflateInfo: `pako inflate (from Nodeca project)`,
  };
function Zp() {
  ((this.text = 0),
    (this.time = 0),
    (this.xflags = 0),
    (this.os = 0),
    (this.extra = null),
    (this.extra_len = 0),
    (this.name = ``),
    (this.comment = ``),
    (this.hcrc = 0),
    (this.done = !1));
}
var Qp = Zp,
  $p = Object.prototype.toString,
  {
    Z_NO_FLUSH: em,
    Z_FINISH: tm,
    Z_OK: nm,
    Z_STREAM_END: rm,
    Z_NEED_DICT: im,
    Z_STREAM_ERROR: am,
    Z_DATA_ERROR: om,
    Z_MEM_ERROR: sm,
  } = Uu;
function cm(e) {
  this.options = of.assign(
    { chunkSize: 1024 * 64, windowBits: 15, to: `` },
    e || {},
  );
  let t = this.options;
  (t.raw &&
    t.windowBits >= 0 &&
    t.windowBits < 16 &&
    ((t.windowBits = -t.windowBits),
    t.windowBits === 0 && (t.windowBits = -15)),
    t.windowBits >= 0 &&
      t.windowBits < 16 &&
      !(e && e.windowBits) &&
      (t.windowBits += 32),
    t.windowBits > 15 &&
      t.windowBits < 48 &&
      (t.windowBits & 15 || (t.windowBits |= 15)),
    (this.err = 0),
    (this.msg = ``),
    (this.ended = !1),
    (this.chunks = []),
    (this.strm = new pf()),
    (this.strm.avail_out = 0));
  let n = Xp.inflateInit2(this.strm, t.windowBits);
  if (
    n !== nm ||
    ((this.header = new Qp()),
    Xp.inflateGetHeader(this.strm, this.header),
    t.dictionary &&
      (typeof t.dictionary == `string`
        ? (t.dictionary = df.string2buf(t.dictionary))
        : $p.call(t.dictionary) === `[object ArrayBuffer]` &&
          (t.dictionary = new Uint8Array(t.dictionary)),
      t.raw &&
        ((n = Xp.inflateSetDictionary(this.strm, t.dictionary)), n !== nm)))
  )
    throw Error(Hu[n]);
}
((cm.prototype.push = function (e, t) {
  let n = this.strm,
    r = this.options.chunkSize,
    i = this.options.dictionary,
    a,
    o,
    s;
  if (this.ended) return !1;
  for (
    o = t === ~~t ? t : t === !0 ? tm : em,
      $p.call(e) === `[object ArrayBuffer]`
        ? (n.input = new Uint8Array(e))
        : (n.input = e),
      n.next_in = 0,
      n.avail_in = n.input.length;
    ;
  ) {
    for (
      n.avail_out === 0 &&
        ((n.output = new Uint8Array(r)), (n.next_out = 0), (n.avail_out = r)),
        a = Xp.inflate(n, o),
        a === im &&
          i &&
          ((a = Xp.inflateSetDictionary(n, i)),
          a === nm ? (a = Xp.inflate(n, o)) : a === om && (a = im));
      n.avail_in > 0 && a === rm && n.state.wrap > 0 && e[n.next_in] !== 0;
    )
      (Xp.inflateReset(n), (a = Xp.inflate(n, o)));
    switch (a) {
      case am:
      case om:
      case im:
      case sm:
        return (this.onEnd(a), (this.ended = !0), !1);
    }
    if (((s = n.avail_out), n.next_out && (n.avail_out === 0 || a === rm)))
      if (this.options.to === `string`) {
        let e = df.utf8border(n.output, n.next_out),
          t = n.next_out - e,
          i = df.buf2string(n.output, e);
        ((n.next_out = t),
          (n.avail_out = r - t),
          t && n.output.set(n.output.subarray(e, e + t), 0),
          this.onData(i));
      } else
        this.onData(
          n.output.length === n.next_out
            ? n.output
            : n.output.subarray(0, n.next_out),
        );
    if (!(a === nm && s === 0)) {
      if (a === rm)
        return (
          (a = Xp.inflateEnd(this.strm)),
          this.onEnd(a),
          (this.ended = !0),
          !0
        );
      if (n.avail_in === 0) break;
    }
  }
  return !0;
}),
  (cm.prototype.onData = function (e) {
    this.chunks.push(e);
  }),
  (cm.prototype.onEnd = function (e) {
    (e === nm &&
      (this.options.to === `string`
        ? (this.result = this.chunks.join(``))
        : (this.result = of.flattenChunks(this.chunks))),
      (this.chunks = []),
      (this.err = e),
      (this.msg = this.strm.msg));
  }));
function lm(e, t) {
  let n = new cm(t);
  if ((n.push(e), n.err)) throw n.msg || Hu[n.err];
  return n.result;
}
function um(e, t) {
  return ((t ||= {}), (t.raw = !0), lm(e, t));
}
var dm = {
    Inflate: cm,
    inflate: lm,
    inflateRaw: um,
    ungzip: lm,
    constants: Uu,
  },
  { Deflate: fm, deflate: pm, deflateRaw: mm, gzip: hm } = Of,
  { Inflate: gm, inflate: _m, inflateRaw: vm, ungzip: ym } = dm,
  bm = {
    Deflate: fm,
    deflate: pm,
    deflateRaw: mm,
    gzip: hm,
    Inflate: gm,
    inflate: _m,
    inflateRaw: vm,
    ungzip: ym,
    constants: Uu,
  },
  xm = t(kl(), 1),
  Sm = t(Al(), 1),
  Cm = t(jl(), 1),
  wm = async (e, t, n, r, i = 3, a = 1e3) => {
    if (!t) return Error(`Fetch URL is undefined`);
    let o = new File([e], n, { type: `application/gzip` });
    for (let e = 0; e < i; e++)
      try {
        let e = await fetch(t, {
          method: `PUT`,
          body: o,
          headers: {
            "Content-Type": o.type,
            ...(r ? { "Content-MD5": r } : {}),
          },
        });
        if (e.ok) return e;
        throw Error(`Fetch failed with status: ${e.status}`);
      } catch {
        if (e < i - 1) await new Promise((e) => setTimeout(e, a));
        else return Error(`Failed to upload snapshot after ${i} attempts`);
      }
  };
const Tm = async ({
  snapshotType: e,
  workflowId: t,
  stepId: n,
  snapshot: r,
  fileName: i,
}) => {
  let a = async (r, a, o, s) => {
    let c = bm.gzip(r),
      l = new Blob([c], { type: `application/gzip` }),
      u = s ? await Dm(l) : void 0,
      { presignedURL: d, path: f } = await Em({
        snapshotType: e,
        workflowId: t,
        stepId: n,
        fileType: a,
        fileName: i,
        md5: u,
      });
    return (await wm(l, d, i ?? o, u), f);
  };
  if (r.domSnapshot) return a(r.domSnapshot, `html.gz`, `capture.html.gz`, !0);
  if (r.rrWebSnapshot)
    return a(r.rrWebSnapshot, `json.gz`, `capture.json.gz`, !1);
  throw Error(`No snapshot data provided`);
};
var Em = async ({
    snapshotType: e,
    workflowId: t,
    stepId: n,
    fileType: r,
    fileName: i,
    md5: a,
  }) => {
    if (!M.user) throw Error(`User not found`);
    let o = P(M.user);
    try {
      let { presignedURL: s, path: c } = await o.getSnapshotPresignedURL({
        snapshotType: e,
        workflowId: t,
        stepId: n,
        fileType: r,
        fileName: i,
        md5: a,
      });
      return { presignedURL: s, path: c };
    } catch (e) {
      throw Error(`Failed to get snapshot presigned URL`, { cause: e });
    }
  },
  Dm = async (e) => {
    try {
      let t = await e.arrayBuffer(),
        n = (0, Cm.default)(Sm.default.create(t));
      return xm.default.stringify(n);
    } catch {
      return;
    }
  };
const Om = async ({
    snapshotType: e,
    workspaceId: t,
    nuggetId: n,
    snapshot: r,
    fileName: i,
  }) => {
    if (!M.user) return null;
    let a = P(M.user);
    if (!r.rrWebSnapshot) return null;
    let { presignedURL: o, path: s } = await a.getNuggetSnapshotPresignedUrl({
        snapshotType: e,
        workspaceId: t,
        nuggetId: n,
        fileType: `json.gz`,
        fileName: i,
        method: c.Put,
      }),
      l = bm.gzip(r.rrWebSnapshot);
    return (
      wm(new Blob([l], { type: `application/gzip` }), o, i ?? `nugget.json.gz`),
      s
    );
  },
  km = async ({
    snapshotType: e,
    workflowId: t,
    stepId: n,
    method: r,
    fileName: i,
  }) => {
    if (!M.user) return null;
    let a = P(M.user),
      o = {
        snapshotType: e,
        workflowId: t,
        stepId: n,
        method: r,
        fileName: i ?? void 0,
        fileType: `json`,
      };
    async function s(e) {
      try {
        let { presignedURL: t } = await a.getSnapshotPresignedURL({
          ...o,
          fileType: e,
        });
        return await jm(t);
      } catch {
        return null;
      }
    }
    let c = (await s(`json.gz`)) ?? (await s(`json`)),
      l = await s(`html.gz`);
    return !c && !l ? null : { rrWebSnapshot: c, domSnapshot: l };
  },
  Am = async ({
    snapshotType: e,
    workspaceId: t,
    nuggetId: n,
    fileName: r,
  }) => {
    if (!M.user) return null;
    let i = P(M.user),
      a = {
        snapshotType: e,
        workspaceId: t,
        nuggetId: n,
        method: c.Get,
        fileName: r ?? void 0,
        fileType: `json.gz`,
      };
    async function o(e) {
      try {
        let { presignedURL: t } = await i.getNuggetSnapshotPresignedUrl({
          ...a,
          fileType: e,
        });
        return await jm(t);
      } catch {
        return null;
      }
    }
    let s = (await o(`json.gz`)) ?? (await o(`json`));
    return s ? { rrWebSnapshot: s, domSnapshot: null } : null;
  };
var jm = async (e) => {
    let t = await fetch(e),
      n = t.headers.get(`content-type`);
    if (n === `json` || n === `application/json`) return t.text();
    if (n === `application/gzip`) return Mm(t);
    throw Error(`Unexpected content type: ${n}`);
  },
  Mm = async (e) => {
    let t = await e.arrayBuffer(),
      n = new Uint8Array(t);
    return bm.ungzip(n, { to: `string` });
  };
async function Nm(e, t, n) {
  if (e) {
    try {
      let t = await Ve(e, {
        name: d.GenerateSnapshot,
        useTangoDomSnapshot: _e(se.TANGO_HTML_SNAPSHOT),
      });
      t &&
        Tm({
          snapshotType: Be.Guidance,
          workflowId: n.workflowId,
          stepId: n.stepId,
          fileName: n.fileName,
          snapshot: t,
        });
    } catch (e) {
      L(e);
      return;
    }
    n.traceId;
  }
}
var Pm = class {
  constructor() {
    R(this, `results`, {});
  }
  start(e) {
    let t = performance.now(),
      n = !1;
    return () => {
      if (n) return;
      n = !0;
      let r = performance.now() - t;
      (this.results[e] || (this.results[e] = []),
        this.results[e].push(Math.round(r)));
    };
  }
  toJson() {
    return this.results;
  }
};
const Fm = async ({ previousBlocks: e, currentStep: t }) => {
  let n = await fetch(`${ze.webUrl}api/generate-workflow-step-goal`, {
    method: `POST`,
    headers: { "Content-Type": `application/json` },
    body: JSON.stringify({
      previousBlocks: e.map((e) => ({
        title: e.type === D.Heading ? `Navigate to: ${e.title}` : e.title,
        url: e.url,
        goal: e.goal,
      })),
      currentStep: { title: t.title, url: t.url },
      simplifiedDom: t.simplifiedDom,
      simplifiedDomElementId: t.simplifiedDomElementId,
    }),
  });
  if (!n.ok) throw Error(`Failed to fetch workflow goal`);
  return n.json();
};
var Im = chrome.runtime.getURL(`/offscreen/index.html`);
async function Lm() {
  if (!chrome.runtime?.id)
    return Promise.reject(Error(`Extension context invalidated`));
  try {
    if (await chrome.offscreen.hasDocument()) return;
    await chrome.offscreen.createDocument({
      url: Im,
      reasons: [chrome.offscreen.Reason.DOM_PARSER],
      justification: `Parse DOM`,
    });
  } catch (e) {
    let t = e;
    if (!t.message.startsWith(`Only a single offscreen`)) throw t;
  }
}
async function Rm(e, t) {
  let n = await zm(e, t);
  return (n && t && (t = Bm(t, n)), delete t?.cssSelectorGenerationTimedOut, t);
}
async function zm(e, t) {
  if (!t?.cssSelectorGenerationTimedOut) return;
  if (!e) {
    F(B.CaptureOffscreenSelectors, {
      error_message: `No snapshot data provided`,
    });
    return;
  }
  let n = Date.now();
  await Lm();
  let r = await chrome.runtime.sendMessage({
    message: { type: gt.CreateCSSSelectors, target: `offscreen`, data: e },
  });
  if (r?.status !== `success`) {
    let e = r?.errorMessage ?? `Unknown error generating offscreen selectors`;
    (I(`Error generating offscreen css selectors:`, e),
      F(B.CaptureOffscreenSelectors, {
        error_message: e,
        ms_spent: Date.now() - n,
      }));
    return;
  }
  let i = r.cssSelectors;
  return (
    await chrome.offscreen.closeDocument(),
    I(`Time spent generating offscreen selectors:`, Date.now() - n),
    i
  );
}
function Bm(e, t) {
  return (
    t.target && (e.xPath = t.target),
    t.parent && e.parent && (e.parent.xPath = t.parent),
    t.label && e.labelledBy && (e.labelledBy.xPath = t.label),
    e
  );
}
const Vm = () => `${ce}, ${_t()}, ${vt()}`;
var Hm = t(El(), 1),
  Um = class {
    async setBlockTransition(e, t) {
      ((M.blockTransitions[e] = t),
        await N({ blockTransitions: M.blockTransitions }));
    }
    get shouldMergeSteps() {
      return M.workflowType === u.Static && Ee(pe.CombinedSteps);
    }
    constructor(e, t) {
      (R(this, `api`, void 0),
        R(this, `addStepsMode`, !1),
        R(this, `performanceReport`, new Pm()),
        R(this, `pending`, void 0),
        R(this, `timeout`, void 0),
        R(this, `timeBetweenWork`, 500),
        R(this, `maxAttempts`, 15),
        R(this, `handleTimer`, async () => {
          this.pending = this.performWork();
          try {
            (await this.pending,
              (this.timeout = setTimeout(
                this.handleTimer,
                this.timeBetweenWork,
              )));
          } catch (e) {
            (L(e),
              e instanceof Me &&
                (await eh({ route: x.WorkflowCreationFailed })));
          }
        }),
        R(this, `performWork`, async (e = !1) => {
          let t = M.contentBlocks.filter(
            (e) => e.workflowId === this.workflowId,
          );
          if (e && M.branchTransitionId) {
            let e = M.branchExcludedCount,
              n = M.branchExcludedCountBottom,
              r = Math.max(0, t.length - 1 - n),
              i = Math.max(0, t.length - 1 - e),
              a = Math.min(e, r),
              o = Math.min(n, i),
              s = a,
              c = t.length - o;
            if (a > 0) {
              let e = t.slice(0, a);
              for (let t of e) ((t.deleted = !0), (t.synced = !1));
              if (e.some((e) => e.backendId) && M.originalBranchTransitionId) {
                let e = t.slice(s, c),
                  n = e.filter((e) => e.backendId);
                for (let t of e)
                  !t.synced &&
                    !t.backendId &&
                    (await this.saveContentBlock(t), (t.synced = !0));
                await N({ branchTransitionId: M.originalBranchTransitionId });
                let r = n.find((e) => !e.deleted);
                if (r?.backendId) {
                  try {
                    await this.api.deleteContentBlock(this.workflowId, [
                      r.backendId,
                    ]);
                  } catch (e) {
                    if (
                      !(
                        e instanceof Me &&
                        e.message.toLowerCase().includes(`not found`)
                      )
                    )
                      throw e;
                  }
                  ((r.backendId = null), (r.synced = !1));
                }
              }
            }
            if (o > 0) {
              let e = t.slice(t.length - o);
              for (let t of e) ((t.deleted = !0), (t.synced = !1));
            }
          }
          let n = t
            .filter((e) => !e.synced || (e.deleted && !!e.backendId))
            .slice(0, e ? void 0 : -1);
          for (let r of n)
            try {
              let e = r.deleted;
              if (r.syncAttempts <= this.maxAttempts) {
                if (r.deleted) {
                  let e = r.backendId;
                  (await this.deleteContentBlock(r),
                    await this.restoreBranchTransitionAfterDeletion(e, t, r));
                } else if (
                  (await this.saveContentBlock(r), r.deleted && r.backendId)
                ) {
                  let e = r.backendId;
                  (await this.deleteContentBlock(r),
                    await this.restoreBranchTransitionAfterDeletion(e, t, r));
                }
              } else
                r.deleted
                  ? (r.backendId = null)
                  : await this.cleanupContentBlock(r);
              e === r.deleted && (r.synced = !0);
            } catch (t) {
              if (t instanceof Me && !t.errorType?.retryable) throw t;
              (e && (await this.cleanupContentBlock(r)), (r.syncAttempts += 1));
              let n = (e) =>
                e ? `${e.slice(0, 20)}...${e.slice(-10)}` : void 0;
              L(t, {
                extra: {
                  ...r,
                  workflowId: this.workflowId,
                  sourcePath: r.sourcePath,
                  sourcePathPresignedURL: n(r.sourcePathPresignedURL),
                  responseBody: t instanceof Si ? t.responseBody : void 0,
                },
              });
            }
          if (e && this.shouldMergeSteps) {
            let e = (0, Hm.default)(
              t.filter((e) => !!e.mergeEventId && e.synced && !e.deleted),
              `mergeEventId`,
            );
            for (let t of Object.values(e))
              t.length < 2 || (await this.mergeContentBlocks(t));
          }
          N({ contentBlocks: M.contentBlocks });
        }),
        (this.workflowId = t),
        (this.api = e));
    }
    getTransitionIds() {
      let e = new Set();
      return (
        M.branchTransitionId && e.add(M.branchTransitionId),
        M.convergingTransitionInfo?.forEach((t) => e.add(t.transitionId)),
        e.size > 0 ? Array.from(e) : void 0
      );
    }
    start(e, t) {
      ((this.workflowId = e),
        (this.addStepsMode = t),
        (this.timeout = setTimeout(this.handleTimer, this.timeBetweenWork)));
    }
    async finish() {
      let e = this.performanceReport.start(`finish`);
      return (
        await this.stop(),
        await this.performWork(!0),
        e(),
        this.workflowId
      );
    }
    async delete() {
      if (!this.workflowId) throw Error(`No workflow when deleting!`);
      if ((await this.stop(), this.addStepsMode))
        return await this.deleteAllSteps();
      await this.api.deleteWorkflows([this.workflowId]);
    }
    async restart() {
      if (!this.workflowId) throw Error(`No workflow when restarting!`);
      return (await this.stop(), this.deleteAllSteps());
    }
    async stop() {
      (await this.pending, clearTimeout(this.timeout));
    }
    async deleteContentBlock(e) {
      if (e.backendId) {
        try {
          await this.api.deleteContentBlock(this.workflowId, [e.backendId]);
        } catch (t) {
          if (
            t instanceof Me &&
            t.message.toLowerCase().includes(`not found`)
          ) {
            (I(
              `Content block not found during deletion, treating as already deleted:`,
              e.backendId,
            ),
              (e.backendId = null));
            return;
          }
          throw t;
        }
        e.backendId = null;
      }
    }
    async restoreBranchTransitionAfterDeletion(e, t, n) {
      if (!M.branchTransitionId || !e) return;
      let r = M.blockTransitions[e];
      if (r && r === M.branchTransitionId) {
        let e = t
          .filter((e) => !e.deleted && e.backendId && e.index < n.index)
          .pop();
        await N({
          branchTransitionId:
            (e?.backendId ? M.blockTransitions[e.backendId] : null) ??
            M.originalBranchTransitionId ??
            null,
        });
      }
    }
    deleteAllSteps() {
      let e = M.contentBlocks.map((e) => e.backendId).filter(Boolean);
      return this.api.deleteContentBlock(this.workflowId, e);
    }
    async saveContentBlock(e) {
      let t = e.index,
        n = await Co(),
        r = this.performanceReport.start(`getScreenshotFromDatabase`),
        i = (await n.get(`snapshots`, e.id))?.snapshot;
      if ((r(), e.type === Ie.Step)) {
        let r = null,
          o = null,
          s = e.originatedFields?.some((e) => e.originEvent === b.LlmExtract),
          c = this.performanceReport.start(`getScreenshotFromDatabase`),
          l = e.screenshotEventId ?? e.id,
          d = (await n.get(`screenshots`, l))?.url;
        if (
          (c(),
          e.attachedDocument?.screenshot?.url &&
            (d = e.attachedDocument?.screenshot?.url),
          d)
        ) {
          let t = this.performanceReport.start(`createBlobFromDataURL`);
          ((o = await yi(d)), t());
          let n = this.performanceReport.start(`createImageBitmap`),
            i = await createImageBitmap(o);
          n();
          let a = e.bounds;
          ((Ee(pe.FlexibleSteps) || M.workflowType === u.Automation) &&
            e.parentBounds &&
            e.isFlexible &&
            (a = e.parentBounds),
            a && !vi(a) && (a = null),
            (r = {
              url: void 0,
              bounds: a ? { ...a, draw: !0 } : void 0,
              pixelWidth: i.width,
              pixelHeight: i.height,
              pixelRatio: e.screenshotPixelRatio,
              fileType: xi(o),
            }),
            i.close());
        }
        M.insertAfterStepIndex != null && (t += M.insertAfterStepIndex + 1);
        let f = e.targetDetails;
        ((f = await Rm(i, f)), f && !vi(f.bounds) && (f.bounds = null));
        let p = [];
        (e.isFlexible && p.push(k.Generic),
          e.isAuthAction && p.push(k.Authentication));
        let m = null;
        (M.workflowType === u.Automation &&
          e.isHighStakesAction &&
          e.eventType === `click` &&
          ((m = a.Manual), p.push(k.HighStakes)),
          (e.referencedFieldId || s) && (m = a.Automated));
        let g = e.eventType;
        if (
          (e.referencedFieldId && g !== `combobox`
            ? (g = `input`)
            : s && (g = `data_extraction`),
          M.workflowType === u.Automation &&
            e.titleDetails?.template === `Select {{value}}` &&
            ((m = a.Automated), (g = `select`)),
          _e(se.ARTEMIS_GOALS) && e.simplifiedDom && !e.titleDetails)
        )
          try {
            let { goal: t } = await Fm({
              previousBlocks: M.contentBlocks.filter(
                (t) => !t.deleted && t.index < e.index,
              ),
              currentStep: e,
            });
            e.goal = t;
          } catch (e) {
            console.error(`Failed to get workflow goal:`, e);
          }
        if (e.deleted) return;
        let _ = {
            createdAt: new Date(e.timestamp).toISOString(),
            step: {
              attachedDocument: e.attachedDocument,
              description: e.description,
              automation: m,
              classifications: p,
              eventType: g,
              goal: e.goal,
              index: t,
              isFlexible: e.isFlexible,
              mergeKey: e.mergeEventId,
              originatedFields: e.originatedFields,
              referencedFieldId: e.referencedFieldId,
              screenshot: r,
              stepOrigin: h.Extension,
              stepOriginVersion: Vm(),
              targetDetails: f,
              title: e.title,
              titleDetails: e.titleDetails,
              url: e.url,
              workflowId: this.workflowId,
            },
            workflowId: this.workflowId,
          },
          v = this.getTransitionIds();
        v && (_.transitionIds = v);
        let y = !1;
        if (!e.backendId) {
          let t = this.performanceReport.start(`addContentBlockStep`),
            n = await this.api.addContentBlock(this.workflowId, _);
          if ((t(), !n))
            throw Error(`Content block not found in backend response`);
          if (
            ((e.backendId = n.id),
            o &&
              (`screenshotPresignedURLs` in n
                ? ((e.sourcePathPresignedURL =
                    n.screenshotPresignedURLs?.sourcePathPresignedURL),
                  (e.sourcePath = n.screenshotPresignedURLs?.sourcePath))
                : (I(`Did not get presigned URLs from backend, retrying`),
                  (y = !0))),
            M.branchTransitionId || M.convergingTransitionInfo?.length)
          ) {
            let t = n.transitions?.find((e) => (e.order ?? 0) === 0);
            t
              ? (await this.setBlockTransition(e.backendId, t.id),
                await N({ branchTransitionId: t.id }))
              : await N({ branchTransitionId: null });
          }
          M.convergingTransitionInfo &&
            (await N({ convergingTransitionInfo: null }));
        }
        if (o && e.sourcePathPresignedURL)
          try {
            let t = this.performanceReport.start(`uploadScreenshotInitial`);
            (await bi(o, e.sourcePathPresignedURL), t());
          } catch (e) {
            (I(`Failed initial upload to presigned URL, retrying`, e),
              (y = !0),
              L(
                `Failed initial upload to presigned URL, retrying: ${e.message}`,
              ));
          }
        let x = { workflowId: this.workflowId, id: e.backendId };
        if (o && r && y) {
          let t = this.performanceReport.start(`getStepScreenshotPresignedURL`),
            n = await this.api.getStepScreenshotPresignedURL({
              workflowId: this.workflowId,
              stepId: e.backendId,
              fileType: xi(o),
            });
          if ((t(), n?.sourcePathPresignedURL)) {
            ((e.sourcePathPresignedURL = n.sourcePathPresignedURL),
              (e.sourcePath = n.sourcePath));
            try {
              let t = this.performanceReport.start(`uploadScreenshotBackup`);
              (await bi(o, e.sourcePathPresignedURL),
                t(),
                (x.screenshot = { ...r, sourcePath: e.sourcePath }));
            } catch (e) {
              throw Error(
                `Failed backup upload to presigned URL: ${e.message}`,
              );
            }
          } else L(`Did not get presigned URL from backend`);
        }
        if (x.screenshot || x.title || x.description) {
          let e = this.performanceReport.start(`updateContentBlockFields`);
          (await this.api.updateContentBlock({
            workflowId: this.workflowId,
            step: x,
          }),
            e());
        }
        let S = me(e.url)?.hostname ?? ``;
        if (i) {
          let t = this.performanceReport.start(`uploadSnapshot`),
            r = Date.now().toString();
          Tm({
            snapshotType: Be.Capture,
            workflowId: this.workflowId,
            stepId: e.backendId,
            snapshot: i,
            fileName: r,
          })
            .catch((t) => {
              let n = i.rrWebSnapshot || i.domSnapshot || ``,
                a = new Blob([n]).size;
              (F(B.CaptureSnapshotUploadFailed, {
                content_block_id: e.backendId,
                content_block_event_type: e.eventType,
                hostname: S,
                reason: t instanceof Error ? t.message : `Unknown upload error`,
                file_size: a,
                snapshot_type: i.rrWebSnapshot
                  ? dt.RrWeb
                  : i.domSnapshot
                    ? dt.Html
                    : void 0,
              }),
                L(Error(`Failed to upload capture snapshot`), {
                  extra: {
                    cause: JSON.stringify(t),
                    workflowId: this.workflowId,
                    stepId: e.backendId,
                    fileName: r,
                  },
                }));
            })
            .finally(() => (t(), n.delete(`snapshots`, e.id)));
        } else
          F(B.CaptureSnapshotUploadFailed, {
            content_block_id: e.backendId,
            content_block_event_type: e.eventType,
            hostname: S,
            reason: `Not present in database`,
          });
      }
      if (e.type === Ie.Heading) {
        M.insertAfterStepIndex != null && (t += M.insertAfterStepIndex + 1);
        let n = {
            heading: {
              description: e.description,
              text: e.title,
              index: t,
              url: e.url,
            },
            workflowId: this.workflowId,
          },
          r = this.getTransitionIds();
        r && (n.transitionIds = r);
        let i = this.performanceReport.start(`addContentBlockHeading`),
          a = await this.api.addContentBlock(this.workflowId, n);
        if ((i(), !a))
          throw Error(`Content block not found in backend response`);
        if (
          ((e.backendId = a.id),
          M.branchTransitionId || M.convergingTransitionInfo?.length)
        ) {
          let t = a.transitions?.find((e) => (e.order ?? 0) === 0);
          t
            ? (await this.setBlockTransition(e.backendId, t.id),
              await N({ branchTransitionId: t.id }))
            : await N({ branchTransitionId: null });
        }
        M.convergingTransitionInfo &&
          (await N({ convergingTransitionInfo: null }));
      }
    }
    async cleanupContentBlock(e) {
      if (e.backendId && e.type === Ie.Step && e.sourcePathPresignedURL)
        try {
          (await this.api.updateContentBlock({
            workflowId: this.workflowId,
            step: {
              workflowId: this.workflowId,
              id: e.backendId,
              screenshot: null,
            },
          }),
            (e.sourcePathPresignedURL = null));
        } catch (e) {
          L(e, { fingerprint: [`cleanup-step`] });
        }
    }
    async mergeContentBlocks(e) {
      if (!(await _s()).autoCombineSteps) return;
      let t = e.filter((e) => !!e.backendId).map((e) => e.backendId);
      try {
        await this.api.mergeContentBlocks(this.workflowId, t);
      } catch (e) {
        L(
          `Merging content blocks failed, err: ${e instanceof Error ? e.message : ``}`,
        );
      }
    }
  },
  Wm = t(El(), 1);
const Gm = (e) => {
    let t = (0, Wm.default)(
        e.filter((e) => e.type === Ie.Step).filter((e) => !!e.mergeEventId),
        `mergeEventId`,
      ),
      n = Object.values(t)
        .map((e) => e.length)
        .reduce((e, t) => e + t, 0),
      r = e.length;
    if (!r) return 0;
    let i = (r - n + Object.keys(t).length - r) / r;
    return Math.abs(Math.round(i * 100));
  },
  Km = ({ isBranchCapture: e, tabId: t }) => !!(e && !t),
  qm = ({ captureMode: e, branchTransitionId: t, tabId: n }) =>
    e !== ie.Guidance && (!t || !!n);
var Jm = (e, t) => {
  let n = t.currentWorkspaceId,
    r = e.find((e) => e.id === n)?.id;
  if (!r) {
    let n = e.map((e) => e.id),
      i = _e(se.PRICING_AND_PACKAGING_2026_Q1),
      a = t.workspaces?.filter(
        (e) => n.includes(e.id) && (i || !e.limitReached),
      );
    if (!a?.[0] || a.length === 0) throw Error(`No valid workspaces found`);
    ((r = a[0].id), (t.currentWorkspaceId = r));
  }
  return r;
};
async function Ym(e) {
  let {
    tabId: t,
    workflowId: n,
    stepIndex: r,
    stepUrl: i,
    transitionId: a,
    convergingTransitionInfo: o,
    countdown: s,
    eventSource: c,
  } = e;
  try {
    if (!M.user) throw Error(`No user in state${c ? ` source: ${c}` : ``}`);
    let l = await Oe({ bustCache: !0 }),
      d = Jm(l, M.user),
      f = !!l.find((e) => e.id === d)?.automationStartDate;
    t && (await ve(t));
    let p = await he();
    if ((p && We(p), f && !e.workflowType && !n)) {
      Se(x.SelectWorkflowType, { eventSource: c, ...e });
      return;
    }
    if (s === !1) return Xm({ tabId: t });
    if (De()) return;
    (await we(), await Jo());
    let m = e.workflowType || u.Static;
    await N({ workflowType: m });
    let h = lt(),
      g = !!a,
      _ = n && !g ? (e.guidance ?? !1) : !1;
    if (n) {
      await N({
        captureSessionId: h,
        captureMode: _ ? ie.Guidance : ie.AddSteps,
        insertAfterStepIndex: r ?? null,
        insertAfterStepUrl: i || null,
        branchTransitionId: a ?? null,
        originalBranchTransitionId: a ?? null,
        convergingTransitionInfo: o ?? null,
        branchExcludedCount: 0,
        branchExcludedCountBottom: 0,
      });
      let e = await qa(n, _),
        s = (() => {
          if (!g || i) return i;
          if (!e) return;
          let t = e.contentBlocks.find((e) =>
            e.transitions?.some((e) => e.id === a),
          );
          if (!t) return;
          if (`url` in t && t.url) return t.url;
          let n = e.contentBlocks
            .filter((e) => e.index < t.index && `url` in e && e.url)
            .at(-1);
          return n && `url` in n ? n.url : void 0;
        })();
      if (
        (s && !i && (await N({ insertAfterStepUrl: s })),
        s && me(s) && Km({ isBranchCapture: g, tabId: t }))
      )
        await je(s, { tabBehavior: `smart` });
      else if (_ && e) {
        let t = e.contentBlocks.find((e) => `url` in e && e.url);
        t &&
          `url` in t &&
          me(t.url) &&
          (await je(t.url, { tabBehavior: `smart` }));
      }
    } else
      await N({
        captureSessionId: h,
        captureMode: ie.New,
        branchTransitionId: null,
        originalBranchTransitionId: null,
        convergingTransitionInfo: null,
        branchExcludedCount: 0,
        branchExcludedCountBottom: 0,
      });
    let v = P(M.user);
    if (n) {
      if (
        ((j.workflowSync.current = new Um(v, n)),
        j.workflowSync.current.start(n, !0),
        _)
      )
        return Xm({ tabId: t });
    } else {
      let e = await v.createWorkflow({ workspaceId: d, type: m });
      if (!e) throw Error(`Error creating workflow`);
      (N({ workflowId: e.id }),
        (j.workflowSync.current = new Um(v, e.id)),
        j.workflowSync.current.start(e.id, !1));
    }
    await Se(x.Countdown, e);
  } catch (e) {
    let t =
        e instanceof Error &&
        e.message.includes(`Workspace Workflow Limit Reached`),
      r =
        (e instanceof Me && e.errorType?.code === 401) ||
        (e instanceof Error && e.message.includes(`No user in state`));
    (!t &&
      !r &&
      L(e, { extra: { captureMode: n ? `add-steps` : `new`, eventSource: c } }),
      await Jo(),
      Te(x.WorkflowCreationFailed, {
        workflowLimitReached: t,
        isUnauthorized: r,
      }));
  }
  F(B.WorkflowCaptureStarted, { enable_capture_panel: !0, event_source: c });
}
async function Xm({ tabId: e }) {
  let t = await he();
  (t?.url &&
    (qm({
      captureMode: M.captureMode,
      branchTransitionId: M.branchTransitionId,
      tabId: e,
    }) && (await qo(t, { workflowId: M.workflowId })),
    N({ initialUrl: t.url })),
    M.captureMode === ie.Guidance ? Se(x.Paused) : Se(x.Capturing),
    ih());
}
function Zm(e) {
  (F(B.WorkflowPaused, { event_source: e }), Se(x.Paused));
}
function Qm(e) {
  (F(B.WorkflowCaptureRestarted, { event_source: e }), Se(x.Capturing));
}
async function $m(e = { makeStreamTabActive: !0 }) {
  let { route: t, secondCaptureCompleted: n } = e;
  (dh(), ch(), await Te(x.Finishing));
  let r;
  try {
    if (!M.workflowId) throw Error(`No workflowId found, should not come here`);
    if ((await vs(), !j.workflowSync.current)) {
      let e = P(M.user);
      ((j.workflowSync.current = new Um(e, M.workflowId)),
        j.workflowSync.current.start(M.workflowId, M.captureMode !== ie.New));
    }
    r = await j.workflowSync.current.finish();
  } catch (e) {
    (L(e),
      await Te(x.WorkflowCreationFailed, {
        workflowLimitReached: !1,
        isUnauthorized: !1,
        isSaveFailed: !0,
        workflowId: M.workflowId ?? void 0,
      }),
      (j.workflowSync.current = null),
      Jo());
    return;
  }
  F(B.WorkflowCapturePerformance, {
    performance_report: JSON.stringify(
      j.workflowSync.current?.performanceReport.toJson(),
    ),
    extra_sync_attempts: M.contentBlocks
      .map((e) => e.syncAttempts)
      .reduce((e, t) => e + t, 0),
  });
  let i = await _s();
  if (j.workflowSync.current?.shouldMergeSteps && i.autoCombineSteps) {
    let e = Gm(M.contentBlocks);
    F(B.WorkflowStepsCombined, { percentage: e, event_source: `Capture` });
  }
  (N({ currentRoute: t || x.Hidden }),
    Ae(),
    await Te(M.currentRoute),
    await Xo({ secondCaptureCompleted: n, workflowId: r }),
    (j.workflowSync.current = null),
    Jo());
}
async function eh({ route: e }) {
  (dh(), ch(), await Te(e), (j.workflowSync.current = null), Jo());
}
async function th() {
  let e = async () => {
    if (M.workflowId && M.user) {
      let e = P(M.user);
      ((j.workflowSync.current = new Um(e, M.workflowId)),
        j.workflowSync.current.start(M.workflowId, M.captureMode !== ie.New));
      return;
    }
    (await N({ currentRoute: x.Hidden }), await Jo());
  };
  if (await de()) {
    De() && (await e());
    return;
  }
  await nh();
}
const nh = async () => {
  if (M.currentRoute !== x.NewPin)
    return (
      M.currentRoute === x.Viewing && N({ sessionWorkflowFields: {} }),
      (De() || M.currentRoute === x.Countdown) &&
        (M.captureMode === ie.New ? oh() : $m()),
      await Mh(),
      Se(x.Hidden)
    );
};
async function rh(e, t) {
  Bo(e, { ...t, workflowId: t.workflowId });
}
async function ih() {
  Fe({ name: d.GetContentBlocks, contentBlocks: await No() });
}
function ah(e) {
  M.openTabId && Ve(M.openTabId, { name: d.StepEventsProcessed, eventIds: e });
}
async function oh() {
  (ch(), F(B.WorkflowDiscarded, {}), await Te(x.Actions));
  try {
    await j.workflowSync.current?.delete();
  } catch (e) {
    e instanceof Error && !e.message.includes(`No workflow`) && L(e);
  }
  ((j.workflowSync.current = null), Jo());
}
async function sh() {
  await j.workflowSync.current?.restart();
  let e = await Co();
  (await e.clear(`snapshots`),
    await e.clear(`screenshots`),
    N({
      contentBlocks: [],
      voiceTranscripts: [],
      branchTransitionId: M.originalBranchTransitionId,
      branchExcludedCount: 0,
      branchExcludedCountBottom: 0,
      blockTransitions: {},
    }));
  let t = await he();
  (t?.id &&
    (M.initialUrl && M.initialUrl !== t.url
      ? (await chrome.tabs.update(t.id, { url: M.initialUrl }),
        await new Promise((e) => {
          let n = (r, i) => {
            r === t.id &&
              i.status === `complete` &&
              (chrome.tabs.onUpdated.removeListener(n), e(void 0));
          };
          chrome.tabs.onUpdated.addListener(n);
        }))
      : await qo(t, { workflowId: M.workflowId })),
    ih());
}
function ch() {
  Le({ name: d.ClearAllBlur });
}
function lh(e) {
  Le({ name: d.ClearBlurredFields, fields: e });
}
function uh(e, t) {
  if (M.openTabId)
    return Ve(M.openTabId, {
      name: d.RunAutoBlur,
      fields: e,
      secureBlurSettings: t,
    });
}
function dh() {
  Le({ name: d.StopAutoBlur });
}
const fh = async (e) => {
    e.forEach((e) => {
      (M.sessionWorkflowFields[e.id], (M.sessionWorkflowFields[e.id] = e));
    });
    let t = Wa(Object.values(M.sessionWorkflowFields)).reduce(
      (e, t) => ((e[t.id] = t), e),
      {},
    );
    return (await N({ sessionWorkflowFields: t }), t);
  },
  ph = async (e) => {
    let t = M.contentBlocks,
      n = t[t.length - 1];
    if (
      n &&
      n.type === D.Step &&
      !n.originatedFields?.some((t) => t.id === e.id)
    )
      return ((n.referencedFieldId = e.id), ih());
  },
  mh = async () => {
    let e = M.contentBlocks,
      t = e[e.length - 1];
    t && t.type === D.Step && (t.referencedFieldId = void 0);
  },
  hh = async (e) => {
    if (!e || e.length === 0) return;
    let t = e.map((e) => e.id).filter((e) => e !== void 0);
    if (t.length === 0) return;
    let n = M.sessionWorkflowFields;
    (t.forEach((e) => {
      n[e] && delete n[e];
    }),
      await N({ sessionWorkflowFields: n }));
  },
  gh = async (e) => {
    let { stepId: t, document: n } = e,
      r = M.sidekickDocuments;
    await N({ sidekickDocuments: { ...r, [t]: n } });
  },
  _h = async (e) => {
    let { stepId: t } = e,
      { [t]: n, ...r } = M.sidekickDocuments;
    await N({ sidekickDocuments: r });
  },
  vh = async () => {
    await N({ sidekickDocuments: {} });
  },
  yh = (e) => M.sidekickDocuments[e] || null,
  bh = () => M.sessionWorkflowFields;
var xh = () => null;
const Sh = (e) => {
  xh = e;
};
var Ch = null,
  wh = `view-workflow-snapshot`,
  Th = !1,
  Eh = [],
  Dh = async () => {
    if (Th || !Eh[0]) return;
    Th = !0;
    let { snapshot: e } = Eh[0];
    try {
      await kh(e);
    } catch (e) {
      console.error(`Error processing event:`, e);
    }
    (Eh.shift(), (Th = !1), Dh());
  };
const Oh = () => Ch;
var kh = (e) => {
    let t = xh();
    return Promise.all([
      chrome.storage.local.set({ [wh]: e }),
      t
        ? Ve(t, { name: d.ViewWorkflowState, snapshot: e }).catch(() => {})
        : Promise.resolve(),
      Fe({ name: d.ViewWorkflowState, snapshot: e }).catch(() => {}),
    ]);
  },
  Ah = null;
async function jh({
  input: e = { sessionId: crypto.randomUUID() },
  restore: t = !1,
} = {}) {
  Ch?.stop();
  let n;
  if (t)
    try {
      n = (await chrome.storage.local.get(wh))?.[wh];
    } catch (e) {
      console.error(
        `Failed to restore view workflow state from local storage:`,
        e,
      );
    }
  ((Ch = gn(ba, { snapshot: n, input: n ? void 0 : e })),
    n &&
      Ch?.getSnapshot().error &&
      (console.warn(`Failed to restore view workflow state from local storage`),
      (Ch = gn(ba, { input: e }))),
    Ch.start(),
    (Ah = n ?? null),
    (Eh = []),
    Ch.subscribe(() => {
      let e = Ch?.getPersistedSnapshot();
      tt(Ah, e) || !e || ((Ah = e), Eh.push({ snapshot: e }), Dh());
    }));
}
const Mh = async () => (
  await vh(),
  Ch?.stop(),
  (Ch = null),
  chrome.storage.local.remove(wh)
);
typeof window > `u` && jh({ restore: !0 });
function Nh(e) {
  return new Promise((t, n) => {
    let r = new FileReader();
    ((r.onloadend = () => t(r.result)), (r.onerror = n), r.readAsDataURL(e));
  });
}
function Ph(e, t = `file`, n) {
  let r = [],
    i = ``,
    a,
    o,
    s;
  if (e.startsWith(`data:`)) {
    if (((r = e.split(`,`)), r.length < 2))
      throw Error(`Invalid base64 data URL`);
    ((i = r?.[0]?.match(/data:(.*?)(;base64)?$/)?.[1] || ``),
      (a = atob(r?.[1] || ``)));
  } else ((a = atob(e)), (i = n || ``));
  ((o = a.length), (s = new Uint8Array(o)));
  for (let e = 0; e < o; e++) s[e] = a.charCodeAt(e);
  return new File([s], t, { type: i || n || `` });
}
const Fh = (e, t, n, r) => {
    let i = lt(),
      a = r?.useHtmlFormat ? `html.gz` : `json.gz`;
    return {
      snapshotIdentifier: `${n.toLowerCase()}/workflows/${e}/steps/${t}/${i}.${a}`,
      snapshotFileName: i,
    };
  },
  Ih = async (e, t, n, r) => {
    let { snapshotIdentifier: i, snapshotFileName: a } = Fh(
      e.id,
      t,
      Be.Guidance,
      r,
    );
    return (
      await Ue({
        name: d.CaptureGuidanceSnapshot,
        snapshotType: Be.Guidance,
        workflowId: e.id,
        workspaceId: e.workspaceId,
        stepId: t,
        fileName: a,
        snapshotIdentifier: i,
        traceId: n,
      }),
      i
    );
  };
export {
  Oo as $,
  Am as A,
  Ei as At,
  ds as B,
  Ct as Bt,
  rh as C,
  Xi as Ct,
  ih as D,
  ji as Dt,
  uh as E,
  Hi as Et,
  tc as F,
  pi as Ft,
  ps as G,
  ms as H,
  Js as I,
  di as It,
  Uo as J,
  Qo as K,
  Ls as L,
  H as Lt,
  Nm as M,
  bi as Mt,
  Om as N,
  _i as Nt,
  dh as O,
  Ai as Ot,
  bm as P,
  fi as Pt,
  Po as Q,
  _s as R,
  Vr as Rt,
  th as S,
  Ji as St,
  lh as T,
  Wi as Tt,
  cs as U,
  ss as V,
  xt as Vt,
  fs as W,
  Wo as X,
  qo as Y,
  No as Z,
  Qm as _,
  ra as _t,
  Oh as a,
  La as at,
  Zm as b,
  ea as bt,
  fh as c,
  Ea as ct,
  mh as d,
  xa as dt,
  Co as et,
  hh as f,
  _a as ft,
  nh as g,
  ia as gt,
  gh as h,
  pa as ht,
  Nh as i,
  Va as it,
  km as j,
  yi as jt,
  Ym as k,
  Ti as kt,
  bh as l,
  Da as lt,
  ph as m,
  ha as mt,
  Fh as n,
  Ba as nt,
  Sh as o,
  za as ot,
  _h as p,
  ga as pt,
  Zo as q,
  Ph as r,
  Ha as rt,
  jh as s,
  Ra as st,
  Ih as t,
  Ja as tt,
  yh as u,
  ka as ut,
  oh as v,
  oa as vt,
  ch as w,
  Yi as wt,
  sh as x,
  $i as xt,
  $m as y,
  ta as yt,
  gs as z,
  gn as zt,
};
//# sourceMappingURL=BtgoBnV8.js.map
