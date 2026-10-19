import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Label, Rot, type Scene } from "./kit";
import { SceneSvg, controlScene } from "./StepPic";

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
