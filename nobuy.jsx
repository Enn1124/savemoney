import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Plus, X, Lock, Target, Trash2, Undo2, Link2, Check,
  Loader2, Flame, Receipt, CreditCard, Pencil, Image as ImageIcon,
} from "lucide-react";

const KEY = "nobuy:v1";
const HOLD_MS = 1200;

const won = (n) => "₩" + new Intl.NumberFormat("ko-KR").format(Math.round(n || 0));
const uid = () => Math.random().toString(36).slice(2, 10);
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

const EMPTY = {
  goal: { amount: 1000000, label: "" },
  items: [],
  logs: [],
};

/* ---------------------------------- 링크 미리보기 ---------------------------------- */

async function fetchPreview(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl.startsWith("http") ? rawUrl : "https://" + rawUrl);
  } catch {
    return null;
  }
  const favicon = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=128`;
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(u.href)}`);
    if (r.ok) {
      const j = await r.json();
      const img = j?.data?.image?.url || j?.data?.logo?.url;
      return {
        url: u.href,
        host: u.hostname.replace(/^www\./, ""),
        image: img || favicon,
        title: j?.data?.title || "",
        exact: Boolean(img),
      };
    }
  } catch {
    /* 차단되거나 실패하면 파비콘으로 대체 */
  }
  return { url: u.href, host: u.hostname.replace(/^www\./, ""), image: favicon, title: "", exact: false };
}

/* 업로드 이미지는 400px로 줄여서 저장 */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 400 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = () => reject(new Error("이미지를 읽지 못했습니다"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다"));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------ 앱 ------------------------------------ */

export default function App() {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingGoal, setEditingGoal] = useState(false);
  const [paying, setPaying] = useState(null);

  const say = useCallback((msg) => {
    setToast({ id: uid(), msg });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(KEY);
        if (r?.value) setData({ ...EMPTY, ...JSON.parse(r.value) });
      } catch {
        /* 첫 실행 */
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set(KEY, JSON.stringify(data));
      } catch {
        say("저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    })();
  }, [data, loaded, say]);

  const total = useMemo(() => data.logs.reduce((s, l) => s + l.price, 0), [data.logs]);
  const goal = data.goal.amount || 0;
  const pct = goal > 0 ? (total / goal) * 100 : 0;

  const stats = useMemo(() => {
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const month = data.logs
      .filter((l) => dayKey(l.at).startsWith(mk))
      .reduce((s, l) => s + l.price, 0);
    const days = new Set(data.logs.map((l) => dayKey(l.at)));
    let streak = 0;
    const cur = new Date();
    if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1);
    while (days.has(dayKey(cur))) {
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }
    return { month, streak, count: data.logs.length };
  }, [data.logs]);

  const addItem = (item) => {
    setData((d) => ({ ...d, items: [{ ...item, id: uid(), createdAt: Date.now(), resisted: 0 }, ...d.items] }));
    setAdding(false);
    say("담았습니다. 사고 싶어지면 결제 버튼을 길게 누르세요.");
  };

  const removeItem = (id) =>
    setData((d) => ({ ...d, items: d.items.filter((i) => i.id !== id) }));

  const confirmPay = (item) => {
    setData((d) => ({
      ...d,
      items: d.items.map((i) => (i.id === item.id ? { ...i, resisted: (i.resisted || 0) + 1 } : i)),
      logs: [{ id: uid(), itemId: item.id, name: item.name, price: item.price, at: Date.now() }, ...d.logs],
    }));
  };

  const undoLog = (logId) => {
    const log = data.logs.find((l) => l.id === logId);
    if (!log) return;
    setData((d) => ({
      ...d,
      logs: d.logs.filter((l) => l.id !== logId),
      items: d.items.map((i) =>
        i.id === log.itemId ? { ...i, resisted: Math.max(0, (i.resisted || 0) - 1) } : i
      ),
    }));
    say("기록을 지웠습니다.");
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">

        {/* ── 계좌 패널 ── */}
        <header className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
                안 사기 계좌
              </p>
              <p className="mt-2 font-mono text-4xl sm:text-6xl font-bold tracking-tight tabular-nums">
                {won(total)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {stats.count}번 참아서 남긴 돈입니다.
              </p>
            </div>
            <button
              onClick={() => setEditingGoal(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
            >
              <Target className="w-3.5 h-3.5" />
              목표 설정
            </button>
          </div>

          <div className="mt-7">
            <div className="flex items-baseline justify-between font-mono text-xs text-slate-500">
              <span className="truncate">
                {data.goal.label ? data.goal.label : "목표"} · {won(goal)}
              </span>
              <span className="tabular-nums text-slate-900 font-bold">{pct.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all duration-700 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(pct, total > 0 ? 1.5 : 0))}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-xs text-slate-400 tabular-nums">
              {total >= goal
                ? "목표를 채웠습니다. 이제 진짜로 사도 됩니다."
                : `${won(goal - total)} 남았습니다`}
            </p>
          </div>

          <div className="mt-7 grid grid-cols-3 gap-px bg-slate-200 rounded-xl overflow-hidden text-center">
            <Stat label="이번 달" value={won(stats.month)} />
            <Stat label="참은 횟수" value={`${stats.count}회`} />
            <Stat
              label="연속"
              value={`${stats.streak}일`}
              icon={stats.streak >= 2 ? <Flame className="w-3 h-3 text-orange-500" /> : null}
            />
          </div>
        </header>

        {/* ── 본문 ── */}
        <div className="mt-6 grid lg:grid-cols-5 gap-6 items-start">

          {/* 참는 중 */}
          <section className="lg:col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
                참는 중 · {data.items.length}
              </h2>
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
              >
                <Plus className="w-3.5 h-3.5" />
                사고 싶은 것 담기
              </button>
            </div>

            {data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="text-sm font-medium text-slate-700">먼저 담아야 참을 수 있습니다.</p>
                <p className="mt-1 text-xs text-slate-500">
                  지금 사고 싶은 물건의 이름과 가격을 넣어 보세요. 링크를 넣으면 사진도 같이 붙습니다.
                </p>
                <button
                  onClick={() => setAdding(true)}
                  className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-700"
                >
                  첫 항목 담기
                </button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {data.items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onPay={() => setPaying(item)}
                    onDelete={() => removeItem(item.id)}
                    onBlockedLink={() =>
                      say("링크는 열리지 않습니다. 지금은 참는 중이니까요.")
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* 영수증 */}
          <section className="lg:col-span-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400 mb-3">
              안 사기 영수증
            </h2>
            <ReceiptStrip logs={data.logs} total={total} onUndo={undoLog} />
          </section>
        </div>

        <p className="mt-10 text-center font-mono text-[11px] text-slate-400">
          이 앱은 돈을 옮기지 않습니다. 결제 버튼은 아무것도 결제하지 않습니다.
        </p>
      </div>

      {adding && <AddDialog onClose={() => setAdding(false)} onAdd={addItem} say={say} />}
      {editingGoal && (
        <GoalDialog
          goal={data.goal}
          onClose={() => setEditingGoal(false)}
          onSave={(goal) => {
            setData((d) => ({ ...d, goal }));
            setEditingGoal(false);
          }}
        />
      )}
      {paying && (
        <PayTerminal
          item={paying}
          onClose={() => setPaying(null)}
          onConfirm={() => confirmPay(paying)}
        />
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-6 flex justify-center px-4 pointer-events-none z-50"
        >
          <div className="rounded-full bg-slate-900 px-4 py-2.5 text-xs text-white shadow-lg">
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- 조각들 ---------------------------------- */

function Stat({ label, value, icon }) {
  return (
    <div className="bg-white py-3 px-2">
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 flex items-center justify-center gap-1 font-mono text-sm font-bold tabular-nums">
        {icon}
        {value}
      </p>
    </div>
  );
}

function ItemCard({ item, onPay, onDelete, onBlockedLink }) {
  const [broken, setBroken] = useState(false);
  return (
    <article className="group relative rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="relative h-36 bg-slate-100 flex items-center justify-center overflow-hidden">
        {item.image && !broken ? (
          <img
            src={item.image}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className={item.exact ? "w-full h-full object-cover" : "w-12 h-12 object-contain"}
          />
        ) : (
          <ImageIcon className="w-6 h-6 text-slate-300" />
        )}
        {item.resisted > 0 && (
          <span className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
            {item.resisted}번 참음
          </span>
        )}
        <button
          onClick={onDelete}
          aria-label="목록에서 삭제"
          className="absolute top-2 right-2 rounded-full bg-white/90 p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-4">
        <h3 className="text-sm font-semibold leading-snug line-clamp-2">{item.name}</h3>
        <p className="mt-1 font-mono text-lg font-bold tabular-nums">{won(item.price)}</p>

        {item.host && (
          <button
            type="button"
            onClick={onBlockedLink}
            className="mt-2 flex items-center gap-1 font-mono text-[11px] text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:underline"
          >
            <Lock className="w-3 h-3" />
            {item.host}
          </button>
        )}

        <button
          onClick={onPay}
          className="mt-4 w-full rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
        >
          결제하기
        </button>
      </div>
    </article>
  );
}

/* 카드 단말기: 길게 눌러야 승인됩니다 */
function PayTerminal({ item, onClose, onConfirm }) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const raf = useRef(null);
  const start = useRef(0);

  const stop = () => {
    cancelAnimationFrame(raf.current);
    raf.current = null;
    if (!done) setProgress(0);
  };

  const begin = () => {
    if (done || raf.current) return;
    start.current = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - start.current) / HOLD_MS);
      setProgress(p);
      if (p >= 1) {
        raf.current = null;
        setDone(true);
        onConfirm();
        setTimeout(onClose, 1500);
      } else {
        raf.current = requestAnimationFrame(tick);
      }
    };
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <Modal onClose={done ? () => {} : onClose} labelledBy="pay-title">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
          {done ? "승인 취소" : "카드 단말기"}
        </p>
        <h2 id="pay-title" className="mt-3 text-sm text-slate-500 line-clamp-1">
          {item.name}
        </h2>
        <p className="mt-1 font-mono text-4xl font-bold tabular-nums">{won(item.price)}</p>

        {done ? (
          <div className="mt-6">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-lg border-2 border-emerald-600 px-4 py-2 text-emerald-700 -rotate-6">
              <Check className="w-4 h-4" />
              <span className="font-mono text-sm font-bold tracking-widest">출금 없음</span>
            </div>
            <p className="mt-5 text-sm font-medium">
              {won(item.price)}이 계좌에 남았습니다.
            </p>
            <p className="mt-1 text-xs text-slate-500">영수증에 인쇄했습니다.</p>
          </div>
        ) : (
          <>
            <button
              onPointerDown={begin}
              onPointerUp={stop}
              onPointerLeave={stop}
              onPointerCancel={stop}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") { e.preventDefault(); begin(); }
              }}
              onKeyUp={stop}
              className="relative mt-6 w-full overflow-hidden rounded-xl bg-slate-900 py-4 text-sm font-semibold text-white select-none touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-slate-900"
            >
              <span
                className="absolute inset-y-0 left-0 bg-emerald-600"
                style={{ width: `${progress * 100}%` }}
              />
              <span className="relative flex items-center justify-center gap-2">
                <CreditCard className="w-4 h-4" />
                {progress > 0 ? "승인 중…" : "길게 눌러 결제"}
              </span>
            </button>
            <p className="mt-3 text-xs text-slate-500">
              끝까지 누르고 있으면 승인됩니다. 돈은 빠져나가지 않습니다.
            </p>
            <button
              onClick={onClose}
              className="mt-4 text-xs text-slate-400 underline hover:text-slate-600"
            >
              그만두기
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

function ReceiptStrip({ logs, total, onUndo }) {
  return (
    <div className="relative">
      <div className="rounded-t-lg bg-white px-5 pt-6 pb-2">
        <p className="text-center font-mono text-xs font-bold tracking-[0.3em]">SAVED</p>
        <p className="mt-1 text-center font-mono text-[10px] text-slate-400">
          결제하지 않은 항목의 내역
        </p>
        <div className="my-4 border-t border-dashed border-slate-300" />

        {logs.length === 0 ? (
          <p className="py-8 text-center font-mono text-xs text-slate-400">
            아직 인쇄된 줄이 없습니다
          </p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {logs.map((l) => (
              <li key={l.id} className="group flex items-baseline gap-2 py-1.5 font-mono text-xs">
                <span className="text-slate-400 tabular-nums shrink-0">
                  {new Date(l.at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}
                </span>
                <span className="truncate flex-1">{l.name}</span>
                <button
                  onClick={() => onUndo(l.id)}
                  aria-label="이 줄 지우기"
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-300 hover:text-rose-500 focus:outline-none"
                >
                  <Undo2 className="w-3 h-3" />
                </button>
                <span className="tabular-nums font-bold shrink-0">{won(l.price)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="my-3 border-t border-dashed border-slate-300" />
        <div className="flex items-baseline justify-between font-mono text-sm font-bold">
          <span className="tracking-widest">합계</span>
          <span className="tabular-nums">{won(total)}</span>
        </div>
        <p className="mt-3 text-center font-mono text-[10px] text-slate-400">
          출금액 ₩0 · 감사합니다
        </p>
      </div>
      {/* 뜯긴 아랫단 */}
      <svg viewBox="0 0 100 3" preserveAspectRatio="none" className="block w-full h-3">
        <polygon points="0,0 100,0 100,1 96,3 92,1 88,3 84,1 80,3 76,1 72,3 68,1 64,3 60,1 56,3 52,1 48,3 44,1 40,3 36,1 32,3 28,1 24,3 20,1 16,3 12,1 8,3 4,1 0,3" fill="#ffffff" />
      </svg>
    </div>
  );
}

function AddDialog({ onClose, onAdd, say }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = async () => {
    if (!url.trim()) return;
    setLoading(true);
    const p = await fetchPreview(url.trim());
    setLoading(false);
    if (!p) return say("주소 형식을 확인해 주세요.");
    setPreview(p);
    if (!name && p.title) setName(p.title.slice(0, 60));
    if (!p.exact) say("사이트가 사진을 막아 두었습니다. 아래에서 직접 올리세요.");
  };

  const upload = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await shrinkImage(file);
      setPreview((p) => ({ ...(p || {}), image: dataUrl, exact: true }));
    } catch {
      say("이미지를 읽지 못했습니다. 다른 파일을 골라 주세요.");
    }
  };

  const submit = () => {
    const p = Number(String(price).replace(/[^0-9]/g, ""));
    if (!name.trim()) return say("이름을 적어 주세요.");
    if (!p) return say("가격을 숫자로 적어 주세요.");
    onAdd({
      name: name.trim(),
      price: p,
      url: preview?.url || "",
      host: preview?.host || "",
      image: preview?.image || "",
      exact: preview?.exact || false,
    });
  };

  return (
    <Modal onClose={onClose} labelledBy="add-title">
      <h2 id="add-title" className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
        사고 싶은 것 담기
      </h2>

      <label className="mt-5 block text-xs font-medium text-slate-600">상품 링크 (선택)</label>
      <div className="mt-1.5 flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && loadPreview()}
          placeholder="https://…"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <button
          onClick={loadPreview}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          사진 가져오기
        </button>
      </div>

      {preview && (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 p-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-white flex items-center justify-center">
            <img
              src={preview.image}
              alt=""
              referrerPolicy="no-referrer"
              className={preview.exact ? "h-full w-full object-cover" : "h-7 w-7 object-contain"}
            />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
              <Lock className="w-3 h-3" />
              {preview.host}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              주소는 저장만 하고 열리지 않습니다.
            </p>
          </div>
        </div>
      )}

      <label className="mt-4 block text-xs font-medium text-slate-600">
        사진 직접 올리기 (선택)
      </label>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => upload(e.target.files?.[0])}
        className="mt-1.5 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white"
      />

      <label className="mt-4 block text-xs font-medium text-slate-600">이름</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="무선 이어폰"
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
      />

      <label className="mt-4 block text-xs font-medium text-slate-600">가격</label>
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder="179000"
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
      />

      <div className="mt-6 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium hover:bg-slate-50">
          취소
        </button>
        <button onClick={submit} className="flex-1 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700">
          담기
        </button>
      </div>
    </Modal>
  );
}

function GoalDialog({ goal, onClose, onSave }) {
  const [amount, setAmount] = useState(String(goal.amount || ""));
  const [label, setLabel] = useState(goal.label || "");
  return (
    <Modal onClose={onClose} labelledBy="goal-title">
      <h2 id="goal-title" className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-400">
        목표 설정
      </h2>
      <label className="mt-5 block text-xs font-medium text-slate-600">무엇을 위해 모읍니까</label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="제주도 여행"
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
      />
      <label className="mt-4 block text-xs font-medium text-slate-600">목표 금액</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900"
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[300000, 500000, 1000000, 3000000].map((v) => (
          <button
            key={v}
            onClick={() => setAmount(String(v))}
            className="rounded-full border border-slate-200 px-2.5 py-1 font-mono text-[11px] text-slate-500 hover:bg-slate-50"
          >
            {won(v)}
          </button>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium hover:bg-slate-50">
          취소
        </button>
        <button
          onClick={() => onSave({ amount: Number(amount) || 0, label: label.trim() })}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
        >
          <Pencil className="w-3.5 h-3.5" />
          저장
        </button>
      </div>
    </Modal>
  );
}

function Modal({ children, onClose, labelledBy }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 bg-slate-900/40">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-4 top-4 text-slate-300 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
        >
          <X className="w-4 h-4" />
        </button>
        {children}
      </div>
    </div>
  );
}
