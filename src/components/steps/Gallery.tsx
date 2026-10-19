import { useEffect, useRef, useState } from "react";
import { LANGS, useT, type Lang } from "../../i18n";
import { set, useStore } from "../../store";
import { Select } from "../inputs";
import type { Scene } from "./kit";
import { SCENES } from "./scenes/index";
import { STEP_PICS, type SceneId } from "./registry";
import { SceneSvg, controlScene } from "./StepPic";

/** One scene at 320 px with every English step text it serves. */
function Entry({ id, scene, reduced }: { id: SceneId; scene: Scene; reduced: boolean }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const svg = box.current?.querySelector("svg");
    if (svg && typeof svg.pauseAnimations === "function") controlScene(svg, { visible: true, hidden: false, reduced, still: scene.still });
  }, [reduced, scene]);
  const keys = Object.keys(STEP_PICS).filter((k) => STEP_PICS[k] === id);
  return (
    <section className="box gallery-entry">
      <h3>{id}</h3>
      <div ref={box} className="gallery-pic"><SceneSvg scene={scene} t={t} label={id} /></div>
      <ul className="notes">{keys.map((k) => <li key={k}>{k}</li>)}</ul>
    </section>
  );
}

/** Dev review page (?stepgallery, not linked from the UI): every scene with its step texts, theme / language / reduced-motion toggles. */
export default function Gallery() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const theme = useStore((s) => s.theme);
  const [reduced, setReduced] = useState(false);
  const dark = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const ids = Object.keys(SCENES) as SceneId[];
  return (
    <div className="gallery">
      <header className="toolbar">
        <span className="brand">{t("Step pictures")}</span>
        <span className="spacer" />
        <Select<"light" | "dark"> value={dark ? "dark" : "light"} ariaLabel="Theme" options={[["light", "Light"], ["dark", "Dark"]]} onChange={(v) => set({ theme: v })} />
        <Select<Lang> value={lang} ariaLabel="Language" options={LANGS} onChange={(v) => set({ lang: v })} />
        <label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> {t("Reduced motion")}</label>
      </header>
      {ids.length === 0 ? <p className="hint">{t("No scenes yet.")}</p> : (
        <div className="gallery-grid">
          {ids.map((id) => <Entry key={id} id={id} scene={(SCENES as Record<string, Scene>)[id]} reduced={reduced} />)}
        </div>
      )}
    </div>
  );
}
