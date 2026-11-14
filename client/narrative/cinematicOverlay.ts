import { CHARACTERS } from "../../shared/narrative/storyBible.js";
import type { CinematicTrack, sampleTrack } from "./cinematicTracks.js";

/** One DOM overlay; no second renderer, scene, animation timer or audio context. */
export class CinematicOverlay {
  public readonly element = document.createElement("section");
  public readonly skip = document.createElement("button");
  private readonly style = document.createElement("style");
  private readonly title = document.createElement("h2");
  private readonly eyebrow = document.createElement("p");
  private readonly caption = document.createElement("p");
  private readonly fade = document.createElement("div");
  private previousFocus: HTMLElement | null = null;
  constructor(onSkip: () => void) {
    this.style.textContent = `
body.cinematic-active #player-hud,body.cinematic-active #telemetry-hud{visibility:hidden}
#cinematic-overlay{position:fixed;inset:0;z-index:80;color:#f3f8fb;font-family:system-ui,sans-serif;pointer-events:none}
#cinematic-overlay[hidden]{display:none}
#cinematic-overlay:before,#cinematic-overlay:after{content:'';position:absolute;left:0;right:0;height:9%;background:#050a10}
#cinematic-overlay:before{top:0}#cinematic-overlay:after{bottom:0}
#cinematic-overlay .cinema-fade{position:absolute;inset:0;background:#050a10}
#cinematic-overlay .cinema-heading{position:absolute;left:6%;top:14%;text-shadow:0 2px 14px #000}
#cinematic-overlay h2{font-size:clamp(24px,4vw,56px);letter-spacing:.12em;margin:0;font-weight:700;max-width:85vw}
#cinematic-overlay .cinema-heading p{font-size:11px;letter-spacing:.22em;color:#7de9db;margin:0 0 12px}
#cinematic-overlay .cinema-caption{position:absolute;bottom:12%;left:15%;width:70%;box-sizing:border-box;text-align:center;padding:14px 20px;background:#07111ce8;font-size:clamp(13px,1.4vw,18px);line-height:1.6;border-top:1px solid #4b7883}
#cinematic-overlay .cinema-caption:empty{display:none}
#cinematic-overlay button{position:absolute;right:4%;top:3%;z-index:2;pointer-events:auto;background:#152633;border:1px solid #6d8d9e;border-radius:4px;padding:8px 14px;color:#f3f8fb;cursor:pointer;font:12px system-ui}
#cinematic-overlay button:focus-visible{outline:2px solid #7de9db;outline-offset:4px}
@media(max-width:600px){#cinematic-overlay .cinema-caption{left:4%;width:92%}#cinematic-overlay .cinema-heading{top:18%}}
`;
    this.element.id = "cinematic-overlay";
    this.element.hidden = true;
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-modal", "true");
    this.title.id = "cinematic-title";
    this.element.setAttribute("aria-labelledby", this.title.id);
    this.caption.className = "cinema-caption";
    this.caption.setAttribute("aria-live", "polite");
    this.caption.setAttribute("aria-atomic", "true");
    const heading = document.createElement("div");
    heading.className = "cinema-heading";
    heading.append(this.eyebrow, this.title);
    this.fade.className = "cinema-fade";
    this.fade.setAttribute("aria-hidden", "true");
    this.skip.textContent = "Skip intro · Esc / Space";
    this.skip.onclick = onSkip;
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        event.preventDefault();
        this.skip.focus();
      }
    });
    this.element.append(this.fade, heading, this.caption, this.skip);
    document.head.append(this.style);
    document.body.append(this.element);
  }
  public show(track: CinematicTrack): void {
    this.previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.title.textContent = track.title;
    this.eyebrow.textContent = track.eyebrow;
    this.caption.textContent = "";
    this.element.dataset.sequence = track.id;
    this.element.hidden = false;
    document.body.classList.add("cinematic-active");
    this.skip.focus();
  }
  public update(sample: ReturnType<typeof sampleTrack>): void {
    this.fade.style.opacity = String(sample.fade);
    const text = sample.cue
      ? `${CHARACTERS[sample.cue.speaker].name}: ${sample.cue.text}`
      : "";
    if (this.caption.textContent !== text) this.caption.textContent = text;
  }
  public hide(): void {
    this.element.hidden = true;
    this.caption.textContent = "";
    document.body.classList.remove("cinematic-active");
    if (
      this.previousFocus?.isConnected &&
      this.previousFocus.getClientRects().length
    )
      this.previousFocus.focus();
    else this.skip.blur();
    this.previousFocus = null;
  }
  public dispose(): void {
    this.hide();
    this.element.remove();
    this.style.remove();
  }
}
