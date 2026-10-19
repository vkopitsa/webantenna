import { Suspense, lazy, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useT } from "../../i18n";
import { Timed, type Scene, type T } from "./kit";
import type { SceneId } from "./registry";

type Svg = Pick<SVGSVGElement, "pauseAnimations" | "unpauseAnimations" | "setCurrentTime">;

/** Run the loop only when on screen and the page is visible; under reduced motion show the still and stay paused. */
// oxlint-disable-next-line react/only-export-components -- pure helper, exported for the test
export function controlScene(svg: Svg, s: { visible: boolean; hidden: boolean; reduced: boolean; still: number }): void {
  if (s.reduced) { svg.pauseAnimations(); svg.setCurrentTime(s.still); return; }
  if (!s.visible || s.hidden) svg.pauseAnimations();
  else svg.unpauseAnimations();
}

/** The scene's <svg>, pure (no effects). */
export const SceneSvg = ({ scene, t, label }: { scene: Scene; t: T; label: string }) => (
  <svg viewBox={scene.view ?? "0 0 320 240"} role="img" aria-label={label} className="step-svg">
    <Timed dur={scene.dur}>{scene.draw(t)}</Timed>
  </svg>
);

/** Wire the <svg> under `box` to visibility, page visibility and the reduced-motion preference. */
function useSceneControl(box: RefObject<HTMLElement | null>, scene: Scene) {
  useEffect(() => {
    const el = box.current;
    const svg = el?.querySelector("svg");
    if (!el || !svg || typeof svg.pauseAnimations !== "function") return;
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    const hasIO = typeof IntersectionObserver !== "undefined";
    let visible = !hasIO;
    const apply = () => controlScene(svg, { visible, hidden: document.hidden, reduced: !!mq?.matches, still: scene.still });
    const io = hasIO ? new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; apply(); }) : null;
    io?.observe(el);
    document.addEventListener("visibilitychange", apply);
    mq?.addEventListener("change", apply);
    apply();
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", apply);
      mq?.removeEventListener("change", apply);
    };
  }, [box, scene]);
}

function Big({ scene, title, onClose }: { scene: Scene; title: string; onClose: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useSceneControl(box, scene);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return createPortal(
    <div className="step-big" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <figure ref={box}>
        <button ref={close} className="step-close" aria-label={t("Close")} onClick={onClose}>✕</button>
        <SceneSvg scene={scene} t={t} label={title} />
        <figcaption>{title}</figcaption>
      </figure>
    </div>,
    document.body,
  );
}

function Player({ scene, title }: { scene: Scene; title: string }) {
  const t = useT();
  const box = useRef<HTMLButtonElement>(null);
  const [big, setBig] = useState(false);
  const shut = useCallback(() => setBig(false), []);
  useSceneControl(box, scene);
  return (
    <>
      <button ref={box} type="button" className="step-pic" aria-label={title} onClick={() => setBig(true)}>
        <SceneSvg scene={scene} t={t} label={title} />
      </button>
      {big && <Big scene={scene} title={title} onClose={shut} />}
    </>
  );
}

const Loaded = lazy(() => import("./scenes/index").then(({ SCENES }) => ({
  default: function Pick({ id, title }: { id: string; title: string }) {
    const scene = (SCENES as Record<string, Scene>)[id];
    return scene ? <Player scene={scene} title={title} /> : null;
  },
})));

/** A build step's looping picture (lazy chunk); click or Enter enlarges it. */
export function StepPic(props: { id: SceneId; title: string }) {
  return (
    <Suspense fallback={<div className="step-pic" />}>
      <Loaded {...props} />
    </Suspense>
  );
}
