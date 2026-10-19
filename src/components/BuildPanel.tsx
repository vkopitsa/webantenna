import { useMemo, useState } from "react";
import type { AntennaDef, Design, Params } from "../lib/types";
import { buildPack, type Msg } from "../lib/build";
import { bendRecipes } from "../lib/recipe";
import { buildPackPDF, recipeDrawings, templateKind, templateSVG } from "../lib/template";
import { fabZip, toDXF } from "../lib/fab";
import { useStore } from "../store";
import { useT } from "../i18n";
import { fmtLen } from "../format";
import { fmtHz } from "../lib/units";
import { fmtMsg } from "../msg";
import { download } from "../download";
import { PrintPanel } from "./PrintPanel";
import { partsFor } from "../lib/print";



/** A frequency step to three significant figures. */
const fmtDf = (f: number) => (f >= 1e6 ? fmtHz(+f.toPrecision(3), 3) : `${+(f / 1e3).toPrecision(3)} kHz`);

export function BuildPanel({ def, params, design }: { def: AntennaDef; params: Params; design: Design }) {
  const t = useT();
  const unit = useStore((s) => s.unit);
  const [mirror, setMirror] = useState(false);
  const pack = useMemo(() => buildPack(def, params, design), [def, params, design]);
  const recipes = useMemo(() => bendRecipes(def, params, design).filter((r) => r.bends.length || r.curves.length), [def, params, design]);
  const kind = useMemo(() => templateKind(def, design, params), [def, design, params]);
  const strips = useMemo(() => recipeDrawings(recipes).length > 0, [recipes]);
  const hasParts = useMemo(() => partsFor(def.id, params, design).length > 0, [def.id, params, design]);
  const m = (x?: Msg) => (x ? fmtMsg(t, unit, x) : "");
  const base = `${def.id}-${Math.round(design.f / 1e3) / 1e3}MHz`;
  return (
    <div className="build">
      <div className="box">
        <h3>{t("Build pack")}</h3>
        <div className="exports">
          <button className="primary" onClick={() => download(`${base}-build.pdf`, buildPackPDF(def, params, design, __APP_VERSION__, mirror), "application/pdf")}>{t("Build sheet + 1:1 template (PDF)")}</button>
          {kind !== "none" && <button onClick={() => { const s = templateSVG(def, design, mirror, params); if (s) download(`${base}-template.svg`, s, "image/svg+xml"); }}>{t("1:1 template (SVG)")}</button>}
          {design.pcb && <button onClick={() => download(`${base}-gerber.zip`, fabZip(def, params, design, base.replace(/[^A-Za-z0-9_-]/g, "_"), __APP_VERSION__), "application/zip")}>{t("Gerber + drill + DXF (.zip)")}</button>}
          {design.pcb && <button onClick={() => download(`${base}.dxf`, toDXF(design.pcb!), "application/dxf")}>DXF</button>}
          {design.pcb && <label className="inline small"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> {t("Mirrored (toner transfer)")}</label>}
        </div>
        <p className="hint">{kind === "pcb" ? t("The PDF has the build sheet and the copper layers at 1:1; the zip has Gerber, drill and DXF files for a PCB fab.") : kind === "strip" ? t("The PDF has the build sheet and a 1:1 boom drilling strip to tape along the boom.") : kind === "wire" ? t("The PDF has the build sheet and a 1:1 template to bend or wind the wire on.") : kind === "sheet" ? t("The PDF has the build sheet and the 1:1 flat patterns of the sheet-metal parts.") : kind === "recipe" ? t("The PDF has the build sheet and a 1:1 strip for each bent wire, with the bend marks to copy onto the cut wire.") : recipes.length > 0 ? t("This antenna is too large for a paper template: use the cut list, the bend recipe and a tape measure. The PDF has the build sheet.") : t("This antenna needs no paper template: use the cut list and a tape measure. The PDF has the build sheet.")}{strips && kind !== "recipe" && kind !== "none" ? ` ${t("The PDF also has a 1:1 strip for each bent wire, with the bend marks to copy onto the cut wire.")}` : ""} {t("Print the PDF at 100 % (actual size) and check the 50 mm scale bar. PDF text is in English.")}</p>
      </div>

      {hasParts && <PrintPanel def={def} params={params} design={design} base={base} />}

      <div className="box">
        <h3>{t("Bill of materials")}</h3>
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>{t("Item")}</th><th>{t("Quantity")}</th><th>{t("Note")}</th></tr></thead>
            <tbody>{pack.bom.map((r, i) => <tr key={i}><td>{m(r.item)}</td><td>{m(r.qty)}</td><td className="muted">{m(r.note)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      {pack.cuts.length > 0 && (
        <div className="box">
          <h3>{t("Cut list")}</h3>
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>{t("Part")}</th><th>{t("Tag")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Length")}</th><th className="num">{t("Cut to")}</th><th className="num">{t("Diameter")}</th><th>{t("Note")}</th></tr></thead>
              <tbody>{pack.cuts.map((c, i) => (
                <tr key={i}><td>{m(c.what)}</td><td>{c.tag}</td><td className="num">{c.qty}</td><td className="num">{fmtLen(c.length, unit)}</td><td className="num"><b>{fmtLen(c.cut, unit)}</b></td><td className="num">{fmtLen(c.dia, unit)}</td><td className="muted">{m(c.note)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {recipes.length > 0 && (
        <div className="box">
          <h3>{t("Bend recipe")}</h3>
          <div className="scroll-x">
            <table className="data">
              <thead><tr><th>{t("Piece")}</th><th className="num">{t("Diameter")}</th><th className="num">{t("Qty")}</th><th className="num">{t("Cut to")}</th><th>{t("Bends")}</th><th>{t("Die")}</th></tr></thead>
              <tbody>{recipes.map((r, i) => (
                <tr key={i}><td>{m(r.what)}{r.tag ? ` (${r.tag})` : ""}</td><td className="num">{fmtLen(r.dia, unit)}</td><td className="num">{r.qty}</td><td className="num"><b>{fmtLen(r.cut, unit)}</b></td>
                  <td>{[...r.bends.map((b, k) => `B${k + 1} ${fmtLen(b.mark, unit)} ${Math.round(b.angle)}° ${b.dir}${b.short ? ` (${t("run too short for the die: bend with pliers")})` : ""}`),
                    ...r.curves.map((c) => t("gentle curve from {0} to {1}: shape it by hand or on the groove plate", fmtLen(c.from, unit), fmtLen(c.to, unit)))].join("; ")}</td>
                  <td>{r.die ? t("{0} bolt", r.die.bolt) : t("by hand")}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="hint">{t("B1 is the mark nearest the cut end: bend in order from that end. L or R is the direction the wire turns, looking at the drawing: on the bender, bend R with the wire lying as drawn and L with it turned over, and turn it over only when the letter changes from the previous bend. The die is a steel bolt of the size given.")}</p>
        </div>
      )}

      <div className="box">
        <h3>{t("Tuning")}</h3>
        {pack.tune.length > 0 ? (
          <>
            <div className="scroll-x">
              <table className="data">
                <thead><tr><th>{t("Part")}</th><th>{t("Step")}</th><th className="num">{t("Best match moves up")}</th></tr></thead>
                <tbody>{pack.tune.map((r, i) => (
                  <tr key={i}><td>{m(r.what)}{r.tag ? ` (${r.tag})` : ""}{r.f !== design.f ? ` · ${fmtHz(r.f, 3)}` : ""}</td><td>{t(r.how, fmtLen(r.step, unit))}</td><td className="num">≈ {fmtDf(r.df)} ({(100 * r.df / r.f).toFixed(2)} %)</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="hint">{t("Shortening raises the best-match frequency; adding the same length lowers it by the same amount. From the design formulas, so treat it as a guide and measure after each step.")}</p>
          </>
        ) : <p className="hint">{m(pack.tuneNote) || t("Not tuned by trimming.")}</p>}
      </div>

      {pack.substrate.length > 0 && (
        <div className="box">
          <h3>{t("Substrate")}</h3>
          <ul className="notes">{pack.substrate.map((x, i) => <li key={i}>{m(x)}</li>)}</ul>
        </div>
      )}

      <div className="box">
        <h3>{t("Build steps")}</h3>
        <ol className="notes">{pack.steps.map((x, i) => <li key={i}>{m(x)}</li>)}</ol>
      </div>
    </div>
  );
}
