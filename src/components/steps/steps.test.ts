import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Label, Rot, type Scene } from "./kit";
import { SceneSvg, controlScene } from "./StepPic";
import { SCENES } from "./scenes/index";
import { DONE_GROUPS, STEP_PICS } from "./registry";
import { STEP_TEXT } from "../../lib/build";
import { PRINT_STRINGS } from "../../lib/print";
import { translate } from "../../i18n";
import { StepList } from "./StepList";

function fakeSvg() {
  const calls: string[] = [];
  return {
    calls,
    svg: {
      pauseAnimations: () => { calls.push("pause"); },
      unpauseAnimations: () => { calls.push("unpause"); },
      setCurrentTime: (s: number) => { calls.push(`set ${s}`); },
    },
  };
}

const demo: Scene = {
  dur: 3.5,
  still: 3,
  draw: (t) => [
    createElement(Rot, { key: "r", about: [160, 120], values: [0, 90, 90], times: [0, 0.6, 1] },
      createElement("rect", { x: 150, y: 100, width: 100, height: 20 })),
    createElement(Label, { key: "l", x: 10, y: 20, text: t("lever") }),
  ],
};

describe("controlScene", () => {
  it("controlScene pauses off-screen", () => {
    let f = fakeSvg();
    controlScene(f.svg, { visible: false, hidden: false, reduced: false, still: 1 });
    expect(f.calls).toEqual(["pause"]);
    f = fakeSvg();
    controlScene(f.svg, { visible: true, hidden: false, reduced: false, still: 1 });
    expect(f.calls).toEqual(["unpause"]);
    f = fakeSvg();
    controlScene(f.svg, { visible: true, hidden: true, reduced: false, still: 1 });
    expect(f.calls).toEqual(["pause"]);
  });
  it("controlScene shows the still under reduced motion", () => {
    const f = fakeSvg();
    controlScene(f.svg, { visible: true, hidden: false, reduced: true, still: 2.4 });
    expect(f.calls).toEqual(["pause", "set 2.4"]);
  });
});

describe("SceneSvg", () => {
  const html = renderToStaticMarkup(createElement(SceneSvg, { scene: demo, t: (s) => s, label: "x" }));
  it("SceneSvg renders an svg with the label", () => {
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="x"');
  });
  it("Rot uses the scene's dur", () => {
    expect(html).toContain('dur="3.5s"');
    expect(html).toContain('repeatCount="indefinite"');
  });
});

describe("step pictures coverage", () => {
  const html = (scene: Scene, t: (s: string, ...a: (string | number)[]) => string = (s) => s) =>
    renderToStaticMarkup(createElement(SceneSvg, { scene, t, label: "x" }));
  const scenes = Object.entries(SCENES as Record<string, Scene>);

  it("every key in DONE_GROUPS has a picture", () => {
    expect(DONE_GROUPS.flat().filter((k) => !STEP_PICS[k])).toEqual([]);
  });
  it("every picture id has a scene", () => {
    for (const id of Object.values(STEP_PICS)) expect(SCENES[id], id).toBeDefined();
  });
  it.each(Object.keys(SCENES))("every scene renders: %s", (id) => {
    expect(html((SCENES as Record<string, Scene>)[id])).toContain("<animate");
  });
  it("still is inside the loop", () => {
    for (const [id, s] of scenes) expect(0 < s.still && s.still <= s.dur && s.dur >= 3 && s.dur <= 5, id).toBe(true);
  });
  it("every label fits", () => {
    const uk = (s: string, ...a: (string | number)[]) => translate("uk", s, ...a);
    for (const [id, s] of scenes) {
      for (const m of html(s, uk).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
        const inner = m[1].replace(/<[^>]+>/g, "");
        expect(inner.length, `${id}: ${inner}`).toBeLessThanOrEqual(22);
      }
    }
  });
  it("no hard-coded colours", () => {
    for (const [id, s] of scenes) {
      const h = html(s);
      expect(h, id).not.toMatch(/#[0-9a-f]{3,6}\b/i);
      expect(h, id).not.toMatch(/rgb\(/);
    }
  });
  it("reports what is still missing", () => {
    const keys = [...Object.values(STEP_TEXT).flatMap((g) => Object.values(g) as string[]), ...PRINT_STRINGS];
    const missing = [...new Set(keys)].filter((k) => !STEP_PICS[k]);
    console.info(`step pictures missing: ${missing.length}`, missing.slice(0, 10));
  });
});

describe("StepList", () => {
  it("rows without a picture are plain text rows", () => {
    const html = renderToStaticMarkup(createElement(StepList, { items: [{ s: "Unmapped step text." }] }));
    expect(html).toBe('<ol class="notes steps"><li><span>Unmapped step text.</span></li></ol>');
  });
  it("a row with a picture gets has-pic and the picture placeholder before its text", () => {
    const html = renderToStaticMarkup(createElement(StepList, { items: [{ s: STEP_TEXT.common.measure }] }));
    expect(STEP_PICS[STEP_TEXT.common.measure]).toBe("measure");
    expect(html).toContain('<li class="has-pic"><div class="step-pic"></div><span>');
  });
});
