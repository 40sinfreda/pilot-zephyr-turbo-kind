import { useEffect, useState } from "react";
import { BrandMark } from "@/components/logo";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePlaceStore, useT } from "@/lib/tideline/place-store";

export function BootSplash() {
  const t = useT();
  const hydrated = usePlaceStore((s) => s.hydrated);
  const { isPending } = useCurrentUserState();
  const [progress, setProgress] = useState(10);
  const [minTime, setMinTime] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const ready = hydrated && !isPending && minTime;

  useEffect(() => {
    const wait = window.setTimeout(() => setMinTime(true), 1200);
    return () => window.clearTimeout(wait);
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setProgress((p) => (p >= 92 ? p : Math.min(92, p + 1.6 + (92 - p) * 0.04)));
    }, 70);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setProgress(100);
    const leave = window.setTimeout(() => setLeaving(true), 240);
    const hide = window.setTimeout(() => {
      setGone(true);
      document.documentElement.classList.remove("tide-booting");
    }, 720);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(hide);
    };
  }, [ready]);

  if (gone) return null;

  const pct = Math.round(progress);

  return (
    <div
      id="tide-boot"
      className={leaving ? "tide-boot tide-boot-leave" : "tide-boot"}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="tide-boot-sea" aria-hidden>
        <span className="tide-boot-wave" />
        <span className="tide-boot-wave tide-boot-wave-2" />
      </div>
      <div className="tide-boot-inner">
        <div className="tide-boot-mark" aria-hidden>
          <BrandMark className="size-16" />
        </div>
        <p className="tide-boot-name">Tideline</p>
        <p className="tide-boot-copy">{t("boot.line")}</p>
        <div className="tide-boot-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span className="tide-boot-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
