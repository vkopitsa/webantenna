import type { Msg } from "../../lib/build";
import { useT } from "../../i18n";
import { useStore } from "../../store";
import { fmtMsg } from "../../msg";
import { StepPic } from "./StepPic";
import { STEP_PICS } from "./registry";

/** Numbered build steps; a row whose text has a scene gets the looping picture beside it, the rest stay text only. */
export function StepList(p: { items: Msg[] }) {
  const t = useT();
  const unit = useStore((s) => s.unit);
  return (
    <ol className="notes steps">
      {p.items.map((m, i) => {
        const id = STEP_PICS[m.s];
        const text = fmtMsg(t, unit, m);
        return (
          <li key={i} className={id ? "has-pic" : undefined}>
            {id && <StepPic id={id} title={text} />}
            <span>{text}</span>
          </li>
        );
      })}
    </ol>
  );
}
