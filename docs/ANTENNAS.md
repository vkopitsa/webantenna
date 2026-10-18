# Antenna models: formulas, sources and verification

All builders live in `src/lib/antennas/`. Everything is SI internally (metres, hertz). Each builder returns
the wire/plate geometry, a dimension list, optional tables, performance estimates and build notes.
The formulas give a **starting point**; build slightly long, measure, trim.

## Shared helpers (`src/lib/rf.ts`)

| Helper | Formula | Source |
|---|---|---|
| End-effect factor K | K = 1 − 0.225 / ln(λ / 2d) | Fit to the ARRL Antenna Book curve (λ/2d = 100 → 0.95, 1000 → 0.967, 10⁴ → 0.976) |
| Microstrip width | Wheeler/Hammerstad synthesis (A/B forms) | Pozar, *Microwave Engineering*, §3.8 |
| Microstrip Z0, εeff | Hammerstad analysis formulas (used to round-trip-test the synthesis) | Pozar §3.8 |
| CPW Z0, εeff, gap | Conformal mapping, finite substrate with no ground below: Z0 = 30π/√εeff · K(k′)/K(k), k = s/(s + 2g), εeff = 1 + (εr − 1)/2 · [K(k1′)/K(k1)]/[K(k′)/K(k)], k1 = sinh(πs/4h)/sinh(π(s + 2g)/4h); K′/K by Hilberg's closed form; gap by bisection | Wadell, *Transmission Line Design Handbook*, §3.6; Simons, *Coplanar Waveguide Circuits*, ch. 2. Tests: K′/K(0.5) = 2.156516/1.685750 (A&S 17.3), k = 1/√2 in air is 30π Ω, εeff → (εr + 1)/2 on a thick substrate, gap round trip. No independent tabulated CPW impedance was checked offline |
| Bessel J0 | Abramowitz & Stegun 9.4.1 / 9.4.3 | A&S |

## Frequency bands (`src/lib/bands.ts`)

Every antenna takes a list of bands (`start–stop`, stored as `"144e6-146e6;430e6-440e6"`), with presets for common
band plans. A band table is added to every design.

- **Single-band types** (dipole, ground plane, J-pole, collinear, Yagi, Moxon, quad, biquad, patch, circularly polarised patch, air patch, patch array): dimensions come from the **centre of band 1**. Extra bands get a note and are swept in the NEC export, so you can see how the antenna really behaves there. In NEC-2, a 2 m Moxon on 70 cm shows SWR 7–23.
- **Fan (parallel) dipole:** one element per band.
- **Discone:** broadband. The cone is sized for the lowest band ÷ 1.25, and the app warns if the top band is above 8 × the cut-off.
- **UWB disc monopole (4.5:1):** broadband, printed. The disc is sized for the lowest band edge only (equivalent-cylinder rule); the note warns when the top band is past 4.5 × the lowest. Wider ranges are not covered by published printed discs with a plain truncated ground (below).
- **Sky-tilted capped bicones (6.7:1, 8:1, 21:1):** broadband, a fixed shape scaled by the lowest band; a note warns when the top band is past 6.7 × (8 ×, 21.3 ×) the lowest frequency.
- **Helix:** checks that every band stays in the axial mode, 0.75 < C/λ < 1.33.
- **Cloverleaf:** single band; the leaves are broadband enough for the 4.9–6.2 GHz FPV range (MoM: SWR 2.2 at 4.9 GHz, 1.26 at the 5.55 GHz centre, 1.8 at 6.2 GHz; the 3.1–3.5 GHz version with Ø1.5 mm wire 1.64 / 1.24 / 1.5).
- **Patch:** warns when the band is wider than the Jackson bandwidth.
- **Circularly polarised patch:** warns when the band is wider than its 3 dB axial-ratio bandwidth (model).
- **Patch array:** warns when the spacing at the top of the band reaches a wavelength (grating lobe), when the requested spacing is under 0.5 λ or had to be raised so the feed lines fit, when the feed network loses over 3 dB, when the 100 Ω lines are under 0.15 mm, and when the band is wider than the model's VSWR < 2 (or, for CP, the 3 dB axial-ratio) bandwidth.
- **Air patch:** warns when the band is wider than the model's VSWR < 2 bandwidth (≈ 7 % at h = 0.06 λ), when the probe inductance exceeds 45 % of the edge resistance, and when the edge resistance is too low to cancel it (h ≳ 0.07 λ with a 1.3 mm pin: not matched).
- **Printed collinear:** single band (dimensions from the centre of band 1). Warns when the gain at the horizon falls by more than 1.5 dB at a band edge (the beam tilts off it; the FDTD-fitted tilt is about 1.9° per 1 % of frequency, 0.5° to 5° across 5.725–5.875 GHz for 4 radiators), when the meander does not fit, when the trace is under 0.15 mm, and on FR-4 above 3 GHz.
- **Presets added:** FPV 1.6 GHz (1611–1633 MHz), FPV 3.0–3.7 GHz, C band 6–8 GHz, X band 9.5–12 GHz.

## Per antenna

| Antenna | Model | Source / verification |
|---|---|---|
| **Dipole / inverted V** | L = 0.5 λ K; feed gap max(4d, min(0.015 λ, 50 mm)); droop rotates the arms | NEC-2: 73 + j8 Ω, 2.15 dBi (145 MHz); 72 + j4 Ω (7.1 MHz) |
| **Fan (parallel) dipole** | one element per band, fanned 0, −a, +a, −2a…; each length factor is tuned by the built-in MoM (secant on X = 0 at every band centre, starting from +3 %, or −5 % near 3×) | Converged results: 40/20 m → +2.7 % (69 / 47 Ω); 20/10 m → +3.3 %; 7/21 MHz → −5 %; 40/20/10 m → 68 / 46 / 42 Ω |
| **Ground plane** | vertical = 0.25 λ K × 0.97, radials = 1.05 × vertical, droop 0–60° | Factor 0.97 tuned in NEC-2: 51 + j2 Ω at 45° droop |
| **J-pole** | stub = 0.25 λ K × 1.04, long = stub + 0.5 λ K, tap = 0.019 λ | Tuned on converged models (2 m, Ø6 mm, 25 mm spacing): NEC-2 at λ/320 gives 47.6 − j7 Ω |
| **Coaxial collinear** | section = 0.5 λ × VF, whip = 0.25 λ × 0.95; ideal gain 2.15 + 10 log N | Classic COCO; no wire model possible |
| **Yagi (DL6WU style)** | spacing table (λ): 0.185, 0.079, 0.18, 0.216, 0.252, 0.281, 0.302, 0.317, then +0.015 per director up to 0.40; director taper 0.4381 → 0.4107 λ (D1–D7), then −0.0173·ln(n/7); reflector 0.490 λ; folded DE 0.473 λ; diameter scaling by K ratio; through-metal boom adds 0.343 × boom Ø | Reproduces the DL6WU/AntMaker reference (145.5 MHz, 9 el, Ø12 mm, Ø30 mm boom) within 0.5 % ([YO5OSF](https://www.qsl.net/yo5osf/yagi.html)). NEC-2: 13.4 dBi, 238 − j38 Ω (folded) |
| Yagi gain estimate | G_dBd ≈ 9.85 + 6.9 log10(boom/λ) | Fit to the NBS (Viezbicke) Yagi curves |
| **Moxon** | Cebik regression in x = log10(d/λ): A, B, C, D quadratics, E = B + C + D | Coefficients verbatim from MoxGen ([moxgen.sl](https://jedsoft.org/slang/slshapps/moxgen.sl)). NEC-2: 50 − j4 Ω, 6.1 dBi |
| **Quad (2 el)** | driven perimeter 1.022 λ (1005/f ft), reflector 1.047 λ (1030/f ft) | ARRL. NEC-2: 52 − j6 Ω, 7.8 dBi at 0.15 λ |
| **Biquad** | side λ/4, spacing ≈ 0.122 λ, reflector ≈ 1 λ | Common 2.4 GHz builds. NEC-2: 62 Ω, 10.3 dBi |
| **Helix (axial mode)** | C = Cλ·λ, S = C tan α; D = 15 Cλ² N Sλ, HPBW = 52 / (Cλ √(N Sλ)), Z = 140 Cλ, AR = (2N+1)/2N | Kraus, *Antennas*. NEC-2: 143 Ω, 10.9 dBi for 8 turns (Kraus D says 14.4, hence the note) |
| **Circular polarisation (MoM)** | `cpGainFn`: RHCP = (Eθ + jEφ)/√2, LHCP = (Eθ − jEφ)/√2 (e^{jωt}, IEEE sense) | The right-hand helix gives RHCP 11.4 dBic on its axis, LHCP −14 dBic; the left-hand one the reverse |
| **Cloverleaf (FPV)** | 3 or 4 leaves on a coax end, all in parallel from the pin (z = +g/2) to the shield (z = −g/2), g = max(1.5 d, 0.02 λ). Each leaf: two legs of L/4 at ±45° from its radial line, then an L/2 arc through the leg tips, in a plane tilted by α about the radial line (a propeller blade; mirror image for LHCP). L = K(leaves, α, d/λ)·λ from a table fitted for the lowest SWR at 50 Ω | Build guides: 3 loops at 120°, tilted 45°, wire 307022/f[MHz] mm ≈ 1.025 λ bent λ/4 from each end. The low-Q loop pair at the hub never reaches X = 0 for thick wire, so K is fitted on \|Γ\|, not X. Built-in MoM (40/λ, converged 20–80/λ) vs NEC-2 (necpp) on the same wires at 5.8 GHz, K = 1: 47 − j32 vs 52 − j31 Ω (3 leaves), 53 − j28 vs 56 − j24 Ω (4 leaves). Default (3 leaves, 45°, Ø1 mm, 5.65–5.95 GHz): K = 1.13, 61 − j8 Ω, SWR 1.26 at the centre and 1.37 at the band edges, RHCP 0.9 dBic peak 25° off the horizon, cross-polar −8 dB (4 leaves −12 dB) |
| **Spring (normal-mode helix)** | Coil D (wire centre), pitch S, wire d, straight lead, over four horizontal λ/4 radials. Turns N for the first series resonance from a table fitted with the built-in MoM (8 pieces per turn): D/λ at resonance for S/D ∈ {0.15 … 1}, d/S ∈ {0.3, 0.5, 0.75}, N ∈ {4 … 40}, log–log in N, bilinear in S/D and d/S. R at resonance from the same runs. Outside 4–40 turns the fit is extrapolated (noted); capped at 100 turns (at 100 kHz it asked for millions) | MoM check: X changes sign between 0.98 f and 1.02 f at 315, 433 and 868 MHz and on a 2 m coil (D 20 mm). 433 MHz, Ø4.5 mm, 1.2 mm pitch, 0.8 mm wire: 26.6 turns, 31.9 mm coil, R ≈ 1.8 Ω (commercial springs: 4.5 × 26 mm). Not a 50 Ω antenna: needs an L-match; excluded from Synthesize |
| **Pagoda (FPV)** | Maarten Baert's Pagoda-3 / 3B (CC BY-SA 4.0), dimensions from his `pcb_pagoda_3.py`: HFSS-optimised at 5.8 and 5.5 GHz, linear in f, published for 5.3–6.0 GHz (outside: the whole design scaled from the nearest end). Three 1.0 mm FR-4 discs on RG402: board 1 (core-fed: pad, spoke, ring, three legs of an inner arc c1 at r2 and an outer arc a1 at r1), board 2 (shield-fed, mirror image) D1 below, board 3 (choke disc on its underside) D2 below. Stacked-board model: `Pcb.levels`, a solid shield column (`Pcb.pec`) up to board 1's underside, port = the core across board 1 | D1 / D2 reproduce the assembly-drawing table (3.65 / 10.45 mm at 5.8 GHz, 4.39 / 11.63 at 5.3, 3.36 / 9.98 at 6.0). In-browser FDTD (CPU, 119 × 119 × 72 cells, 0.5 mm on the 1 mm tracks, εr 4.4): one clean resonance, best match 5.57 GHz at 48 + j1 Ω, 28 − j13 Ω at 5.8 GHz: about 4 % below Baert's HFSS centre (staircased curved tracks, square shield column, FR-4 εr). The published geometry is kept as is |
| **Patch** | W = c/2f √(2/(εr+1)); εeff; ΔL (Hammerstad); L = c/(2f√εeff) − 2ΔL; Rin = 1/2(G1+G12) by numeric integration; inset y0 = L/π · acos √(Z0/Rin); BW = 3.77 (εr−1)/εr² · W/L · h/λ, with εr held at 2 in that factor below 2 (the fit goes to 0 for air, which made the impedance NaN) | Balanis, *Antenna Theory* ch. 14 (example 14.1 reproduced in tests); bandwidth: Jackson & Alexopoulos |
| **Circularly polarised patch** | Square patch side a: the Patch row's L with W = L (fixed point, 3–4 passes). Loaded Q = 1/(1/Qr + tan δ), Qr = 1/(√2·bw) with the Jackson bw for W = L. **Truncated:** two opposite corners cut as right isosceles triangles of leg c, ΔS/S = 2(c²/2)/a² = 1/(2Q) (Sharma & Gupta 1983; Garg et al., *Microstrip Antenna Design Handbook*, ch. 9), c = a/√(2Q); probe on the axis where R0 = 2·Z0 (the two split modes are in series, each R0/2). **Nearly square:** sides L, W = L (1 + 1/Q), area kept, diagonal probe where each mode shows Z0. **Dual:** inset-fed square patch at two orthogonal edges behind a plain T-divider (100 Ω branches, the y branch λg/4 longer through a meander on the x branch; no hybrid, no isolation). Analytic model (`simulate.ts`): two modes 1/(1 + jQ(f/fi − fi/f)) split to ±45° at f0 (fi = f0 r^±1, r − 1/r = 1/Q), Zin = Z0 Σ modes; far field Eθ = Ax sx cos φ + Ay sy sin φ, Eφ = cos θ (Ay sy cos φ − Ax sx sin φ) from the patch's two-slot pattern and its 90° rotation; co-polar gain (Eθ ± jEφ)/√2 (the `cpGainFn` convention, IEEE sense: RHCP = Ey lags Ex by 90°), boresight AR = (|Ax + jAy| + |Ax − jAy|) / ||Ax + jAy| − |Ax − jAy||. LHCP is the mirror image y → −y. | **Reference:** de Vos, "Design of a GPS patch antenna" (2022; built, simulated in Sonnet, measured with a NanoVNA/u-blox): 1.574 GHz, εr 4.5, h 1.6 mm FR-4, truncated corner patch 45 × 45 mm, cut Y = L/7.5 = 6 mm. Model: a = 44.9 mm (−0.2 %); c = 5.3 mm for tan δ 0.02 (−12 %), 5.75 mm for 0.025 (−4 %), 6.2 mm for 0.03 (+3 %): the published cut sits in the FR-4 tan δ range. Not checked against full-wave: the sense, the AR bandwidth (~1.7 % at 5.8 GHz on FR-4 1.6 mm, ~0.25 × the VSWR < 2 bandwidth) and the dual feed's phase are model numbers. |
| **Air patch (suspended)** | Metal plate a height h = hf·λ (default 0.06 λ) over a square ground plate (default 1 λ), εr = 1, SMA panel jack probe. W = c/2f; εeff = 1, ΔL (Hammerstad, εr = 1, valid for h/λ ≲ 0.1) and Rin = 1/2(G1 + G12) from the Patch row, with the Patch row's `patchDesign(f, 1, h, Z0)`. **Q:** Jackson & Alexopoulos radiation Q, Qr = (3/16)(εr/(p c1))(L/W)(λ0/h), c1 = 1 − 1/n² + 2/(5n⁴) (0.4 for air), p = 1 + (a2/10)(k0W)² + (3a2² + 2a4)/560 (k0W)⁴ + (c2/5)(k0L)² + (a2c2/70)(k0W k0L)², a2 = −0.16605, a4 = 0.00761, c2 = −0.0914153; no dielectric loss, copper loss neglected (the Patch row's Jackson bw fit goes to 0 for air, so `patch` and `cppatch` are unchanged). **Probe:** series X_L = (η0 k h / 2π)(ln(2/(k a)) − γ), a = max(0.65 mm, 0.0053 λ) ≤ 0.1 h (Balanis ch. 14.5; Lee & Luk). Zin = jX_L f/f0 + R0 / (1 + jQ(f/fr − fr/f)). X_L is 70–90 Ω at h = 0.06 λ, so the plain "resonant patch, R0 = 50 Ω" design cannot be matched: the patch is cut LONG (resonant at fr < f0, capacitive at f0) so that its reactance cancels X_L: u = X_L/Z0 = Q(f0/fr − fr/f0), R0 = Z0(1 + u²) (≈ 180 Ω at 0.06 λ), probe at y0 = L/π · acos √(R0/Redge) from the edge. Above h ≈ 0.07 λ (a 1.3 mm pin) R0 exceeds Redge: the probe sits at the edge and the match is lost (warned). Two-slot pattern with the slot height: (cos(k Le sinθ cosφ/2) · sinc(k W sinθ sinφ/2) · sinc(k h cosθ/2))² (cos²φ + cos²θ sin²φ), upper hemisphere only (no back lobe); Pcb: er 1, tanD 0, board = the ground plate, top copper = patch, probe port, 2 nylon standoffs on the x = 0 zero-field line | **Reference and sources.** The brief's 2.4 GHz air patch (L ≈ 50–55 mm for h = 6–8 mm; I had no access to a primary source offline, so these are not checked against a table): the pure cavity length at 2.44 GHz is 53.2 / 51.9 / 50.6 mm for h = 6 / 7 / 8 mm (inside the range); the probe-fed design is 56.6 mm at those heights (+6 … +12 %, the detuning above). Model bandwidth at 0.06 λ: Q 10.0, VSWR < 2 over 6.8 % (166 MHz), vs 1/(√2 Q) = 7.1 %; 5–12 % for h = 0.05–0.07 λ and every band from 1 to 5.8 GHz (`airpatch.test.ts`); published air-patch bandwidths at h ≈ 0.06–0.08 λ are usually quoted as 6–10 %. Gain 9.8 dBi (model). **In-browser FDTD (CPU, default 2.4–2.4835 GHz, 393 k cells, 4 001 steps, 92 s):** reactance zero at 2307 MHz (5.5 % below f0), 54.7 + j8.5 Ω there (−20.7 dB); a 129 × 129 × 69 mesh gives the same curve (X min +16 Ω at 2.28 GHz); R0 ≈ 130 Ω, parallel resonance ≈ 2.15 GHz; gain 9.4 dBi (HPBW 55°). The Patch row's FR-4 probe patch, same engine, resonates at 2350 MHz (3.8 % low) and the circularly polarised patch 5 % low, so most of the offset is the FDTD's patch-edge discretisation, not this model. "Tune to band" (trim −6.7 %, 2 passes): resonance 2436 MHz, 55 + j21 Ω (−13.9 dB) at f0, VSWR < 2 over 2368–2509 MHz (141 MHz = 5.8 %, model 6.8 %), gain 9.7 dBi. **Director** (`director`, `dr`, `ds`): a second plate above, in the Pcb as a level (BOM, fab, FDTD, openEMS) but NOT in the analytic model. FDTD runs (CPU, plain patch design, no retuning): plate 0.7–1.0 × the patch at 0.1–0.2 λ gave a peak gain of 9.3–9.5 dBi where matched (the plain patch 9.4) and a worse match (best −24 … −3 dB); 1.1–1.4 × at 0.15–0.25 λ were unmatched (R ≈ 8–10 Ω) with a distorted beam (gain 6–7 dBi at 35–40°). A +1.5–2 dB gain from a director is therefore not supported; the option is experimental |
| **Microstrip patch array (2×2 … 8×8)** | Elements: the Patch row's `patchDesign` (inset for **100 Ω**: y0 = (L/π) acos √(100/Rin)), or the truncated-corner CP square of the cppatch row (probe point for R0 = 200 Ω, so Zin = 100 Ω). Grid pitch d = dsp·λ0 (0.4–1.3 λ, default 0.75), nx, ny ∈ {2, 4, 8}; every element fed at the middle of its bottom edge (a patch fed at the opposite edge radiates 180° out of phase). **Corporate feed** (Pozar, *Microwave Engineering*, §5.1 / §2.5; Balanis ch. 6): two 100 Ω lines meet at a T (50 Ω), a λg/4 70.7 Ω section (Zc = √(50·100)) returns to 100 Ω for the next level; a row's levels hang one pitch lower each (no crossings), the rows leave to a vertical bus beyond the last patch, are joined pairwise (±d/2, ±d, …, jog right by one pitch per level) and end in the 50 Ω trunk at an edge port; all paths equal (tested). Chamfered bends (Gupta, Garg, Bahl, *Microstrip Lines and Slotlines*: M = 0.52 + 0.65 e^(−1.35 w/h)). Line widths: `microstripWidth` / Hammerstad εeff. **CP:** each 2×2 cell goes round BL, BR, TR, TL; element k rotated k·90° (fed from its bottom, right, top, left edge) and fed with k·λg/4 extra line (meander bumps, mod λg): sequential rotation (Hall 1989; Huang 1986), RHCP = CCW rotation with lagging phase; the LHCP board is the x-mirror. **Model:** every line a lossy section (α = α_c + α_d, α_c = Rs/(Zc w), α_d = k0 εr (εeff − 1) tan δ / (2 √εeff (εr − 1)), Pozar §3.8), tree solved by ABCD back to the port → Zin, amplitude and phase at every element, η_net; element field (two-slot, or the cppatch modes rotated by the element) × array factor, no mutual coupling, upper hemisphere; gain = D·η_net·(1 − |Γ|²)·η_el, η_el = Q/Qr. CP: AR from the sequentially rotated sum with the real line lengths. | Analytic. Reference: D(4×4, d = λ/2) = 17.3 dBi vs Balanis' planar-array 4π N d²/λ² = 17.0 dBi (2×2: 11.5 vs 11.0). 5.8 GHz RO4003C 60 mil, d = 0.75 λ: **2×2 D 13.6 / G 13.0 dBi (HPBW 37°); 4×4 20.2 / 19.1 (17°); 8×8 26.4 / 24.4 (8.5°)**, feed loss 0.35 / 0.8 / 1.7 dB. 10 GHz RT/duroid 5880 (0.787 mm): 4×4 G 19.8 dBi, 8×8 25.3. **FR-4 1.6 mm at 5.8 GHz: feed loss 1.7 / 4.0 / 8.4 dB, 8×8 gain 16.2 dBi** (+ 1.8 dB patch dielectric loss). D grows 6.6 / 6.2 dB per doubling; 4×4 d = 0.5 / 0.6 / 0.75 / 0.9 / 1.1 λ: 17.3 / 18.6 / 20.2 / 20.0 / 18.0 dBi (grating lobe above λ). CP 4×4: AR 0.0 dB at f0, **AR < 3 dB over 5.0 % vs 1.2 % for the single truncated patch** (AR at ±2 %: 1.8 dB vs 9.4 dB). No published measured array was reproduced offline: the numbers sit in the usual 17–20 dBi range reported for 4×4 corporate arrays at 0.7–0.8 λ. |
| **Discone** | cone slant λ/4 at f_low / 1.25, disc Ø 0.7 × λ/4, half-angle 30°, gap max(3d, 0.0025 λ) | [Wikipedia: Discone](https://en.wikipedia.org/wiki/Discone_antenna). NEC-2 rod model: SWR ≲ 2 from ≈ 1.25 f to 8 f |
| **Sky-tilted capped bicone (6.7:1, 8:1, 21:1)** | Fixed (ρ, z) profiles from the FPV-detector study ([FPV-DETECTOR-ANTENNA.md](FPV-DETECTOR-ANTENNA.md)): compact design S73 (960 MHz – 6.4 GHz, Ø73 × 71 mm; needs a 6-bead ferrite sleeve, BOM row and a 130 mm handle), design B (800 MHz – 6.4 GHz, Ø113 × 110 mm) and design A (300 MHz – 6.4 GHz, Ø275 × 294 mm), scaled by f_design / f_low. Drawn as 32 planar facets per revolved segment; `Design.sheets` holds each part's flat pattern (cone frustum → annular sector r/sin α, angle 360° sin α; cylinder → strip; flat ring → disc), which the BOM lists and the 1:1 template draws. Not a wire model (`necSupported: false`): the Simulation tab interpolates the study's body-of-revolution MoM table (`skycone.data.ts`: R, X and gain every 5° of elevation, 64 / 90 log-spaced frequencies, linear in log f), which scales exactly with size for PEC | Body-of-revolution MoM checked against NEC-2, an energy balance and an independent axisymmetric FDTD (see the study). App reproduces the study: SWR ≤ 1.39 over 800 MHz – 6.4 GHz, 15–50° elevation gain mean 2.2 dBi, lowest −1.2 dBi; flat patterns 285.6° / 203.9° / 336.1° (`skycone.test.ts`). Radiation view: the same solver's surface current (16 tabulated frequencies, nearest one; each segment as a ring of 12 short elements). Printed kit: `print/families/skycone.ts` (cover FDTD-checked, cup, handle, stand, former, wedges, gap fork, cutting templates) |
| **Sky-tilted capped bicone, wire cage (6.7:1)** | Design W16 of the study: the compact profile as 16 radial frames of Ø1 mm wire per side, hoops at every bend, hub rings of Ø6 mm joined to the axis by 4 spokes (washer on the pin, collar on the jacket), built exactly like `tools/wideband-antenna/wirecage.py`; all scaled by f_design / f_low, the wire too. A real wire model (`necSupported: true`), but the built-in MoM's 450-unknown limit is too coarse for 3.1 m of wire at 6.4 GHz, so Simulation interpolates the NEC-2 table (`SKYCONE_W16`, gain = mean over φ). `Design.cuts` holds the cut list (frames and hoops share every node, so `pieces()` cannot chain them) and `Design.frames` one frame per side for the 1:1 template and the printed jigs | App wires = the NEC-2 model (281 wires, 3146 mm, `skycone.test.ts`); table SWR ≤ 1.97 over 960 MHz – 6.4 GHz; the app's NEC deck gives the same Z as `wirecage.py` with the same segments (see the study for the feed and segment sensitivity, ±0.2). Radiation view: the NEC current of one frame × 16 on the frames |
| **Sky-tilted capped bicone, small wire cage (6.7:1)** | Design W65 of the study: the W16 cage re-optimised inside a 66 mm box with **one straight shorting wire** from a hot frame (frame 8) down to the ground frame under it, 11.1 mm from the axis (a shunt inductor across the feed at the bottom of the band: the small cage's 14 − 18j Ω becomes ≈ 50 Ω). Same builder as W16 (`cage.short` in the table adds the wire and its two frame nodes, which carry no hoop); 314 wires, 2972 mm. Simulation interpolates the NEC-2 table (`SKYCONE_W65`, 1.5 mm segments, gain = mean over 8 azimuths); the Radiation view puts frame 0's current × 16 on the frames and the wire's own current on the wire. Ø65.1 × 64.9 mm, SWR ≤ 1.85 over 960 MHz – 6.4 GHz (W16: Ø71.5 × 74.7 mm, 1.95) | [FPV-DETECTOR-ANTENNA.md](FPV-DETECTOR-ANTENNA.md#smaller-wire-cage-one-shorting-wire-w65); `tools/wideband-antenna/family10.py`, `opt_cma.py`, `export_shaped_table.py` |
| **Sky-tilted capped bicone, mini wire cage (4.6:1)** | Design W40 of the study: the W65 cage inside a 40 mm box. A Ø40 × 40 mm cylinder fits a sphere of radius 28 mm (ka = 0.57 at 960 MHz), and the Chu / Bode–Fano bound there allows SWR 4.65 at best, so the band starts at 1.4 GHz (the floor puts SWR 2 at 1.42 GHz); bent, twisted, zigzag, legged and coiled frames were all tried and only move the mismatch (`family13.py`). Same builder and `cage.short` as W65 (the shorting wire 6.9 mm from the axis); 314 wires, 1807 mm. Simulation interpolates the NEC-2 table (`SKYCONE_W40`, 1.5 mm segments, gain = mean over 8 azimuths). Ø39.3 × 39.8 mm, SWR ≤ 2.1 over 1.4 – 6.4 GHz (96-point sweep; a first run's 1.91 hid a 70 MHz feature at 6.3 GHz, removed by re-tuning with `FEXTRA`) | [FPV-DETECTOR-ANTENNA.md](FPV-DETECTOR-ANTENNA.md#how-small-can-the-cage-go-ø40--40-mm-study); `tools/wideband-antenna/family13.py`, `results/run40.sh`, `export_shaped_table.py` |
| **Sky-tilted capped bicone, mini sheet metal (4.6:1)** | Design S40: W40's profile from brass or copper sheet (the sheet builder: flat patterns, 32 facets) plus one straight Ø1 mm shorting wire 8.0 mm from the axis (`SkyconeTable.short`). The solid shape without the wire is SWR 4.3 at 1.48 GHz (BoR). Simulation interpolates a NEC-2 table of the sheet as a wire grid (`SKYCONE_S40`, `sheetgrid.py`: 32 frames on the equal-area radius, hoops every 1.8 mm, 1.5 mm segments; 24 → 40 frames move the SWR ≤ 0.1). Ø39.3 × 39.8 mm, SWR ≤ 1.92 over 1.4 – 6.4 GHz | [FPV-DETECTOR-ANTENNA.md](FPV-DETECTOR-ANTENNA.md#how-small-can-the-cage-go-ø40--40-mm-study); `tools/wideband-antenna/sheetgrid.py`, `export_sheet_table.py` |
| **Sky-tilted capped bicone, mini wire cage 7 GHz (5.1:1)** | Design B44f of the study: the W40 cage one size up (Ø43 × 44 mm, 16 frames per side, one shorting wire 8.0 mm from the axis) re-tuned for 1.36 – 7 GHz as the high-band half of a two-antenna set, searched with the cost floor lowered to 1.5. NEC-2 at 1.5 mm segments: worst SWR 1.73 / 1.74 over the band, +2.1 dBi mean at 15–50°. No ferrite: a Ø10 × 50 mm quarter-wave choke sleeve on the coax keeps 15–35 cm of cable at SWR ≤ 2.0 (bare: 3.2). The low-band half (A55, 960 MHz – 1.36 GHz) needs two capacitors and is not an app type. docs/FPV-DETECTOR-ANTENNA.md, "Two antennas instead of one". |
| **Sky-tilted capped bicone, low-band wire cage (1.4:1)** | Design A55 of the study, the low-band half of the two-antenna set: a Ø51 × 54 mm cage for 960 MHz – 1.36 GHz, 16 frames per side, lid, and **two shorting wires wound into 2-turn coils** (Ø3.6 mm, 37.4 mm of wire each) 10.2 mm from the axis, one of them with **3.6 pF in series** and **2.2 pF in the centre pin**: the double-tuned match a 34 %-wide band needs in a box this small (one shunt wire alone: SWR 2.8 at 55 mm). NEC-2 at 1.5 mm segments (the capacitors as series loads): worst SWR 1.86 / 1.88, +1.0 dBi mean at 15–50°; 52 mm gives 1.94, 51 mm 2.03. Tolerances: pin capacitor ±5 % (±10 %: 2.06), shunt capacitor ±10 %, coils to the count (+¼ turn: 2.2). No ferrite: two Ø20 mm choke tubes of 70 + 50 mm on the coax keep 15–35 cm of cable at SWR ≤ 1.8 (bare: 10). In the app the coils are drawn with the study's geometry (`coilPath`), the capacitors are listed in a table and the notes; the Simulation tab is the NEC-2 table. docs/FPV-DETECTOR-ANTENNA.md, "Two antennas instead of one". |

## Printed (PCB) antennas and openEMS

Printed antennas sit on a dielectric over a partial ground pour, which the free-space wire solver cannot model.
The **design formulas were calibrated with openEMS (FDTD)** using the scripts this app exports:
- openEMS was built from source (github.com/thliebig/openEMS-Project);
- every calibration run is a script produced by `toOpenEMS()`;
- the board is FR-4 unless noted, trace w = 1 mm, ground pour 30–35 × 40 mm.

| Antenna | Model | Calibration |
|---|---|---|
| **PCB trace monopole** | L = λ/4 / √εeff with εeff = 1 + q(εr − 1), **q = 0.048 √(h/w) εr^0.47** | Resonance with L = 22.6 mm: FR-4 1.6 mm 2.80 GHz (q 0.121); FR-4 0.8 mm 2.94 GHz (q 0.082); εr 10.2 1.27 mm (L 16.9 mm) 2.82 GHz (q 0.16). Z ≈ 69 Ω, directivity 3.0 dBi, efficiency 98 % |
| **UWB disc monopole** (`uwbdisc`) | Disc or ellipse (semi-axes a, b = a·ar) over a truncated ground, 50 Ω microstrip (ground on the back) or CPW (grounds beside the line, tied together on the back by a strip and two vias). Lower edge **fL = 7.2 / ((l + r + p) k) GHz** (cm): l = 2b, r = a/4 (cylinder of equal area, 2π r l = π a b), p = feed gap, k = substrate factor; inverted for a. k = √(1 + 0.0949 √(h/1.6 mm) (εr − 1)): 1.15 on FR-4 1.6 mm (Liang), ≈ 1.03 for 0.1 mm polyimide (**uncalibrated**, anchored on FR-4 only). `trim` scales the disc; "Tune to band" aims the FDTD −10 dB lower edge (not a reactance zero) at the lowest band edge | Agrawal, Lo, Lee, Zhang, IEEE TAP 46(2), 1998 (equivalent-cylinder rule); Liang, Chiau, Chen, Parini, IEEE TAP 53(11), 2005 (disc R = 10 mm, gap 0.3 mm, FR-4: measured lower edge 2.69 GHz, formula 2.75 GHz = +2 %; test `uwbdisc.test.ts`; figures quoted from memory of the paper, not re-checked). **Coverage:** printed discs with a plain truncated ground give ≈ 3.7–5:1 (Liang: 2.69 to over 10 GHz; typical 2.7–12 GHz), so `maxRatio` = 4.5; 10:1 and more was reported only for large-ground planar monopoles (Agrawal) or tapered/beveled feeds, and 25–30:1 (300 MHz–8 GHz) is not supported by any printed-disc result found: the app warns and designs the lower edge only. **In-browser FDTD, CPU, default design** (a = 8.84 mm, FR-4, g = 0.3 mm, 25 mm ground; run 2–6 GHz, 137×130×77 = 1.4 M cells, 5.5 k steps, ≈ 8 min; a 2–5 GHz coarse run agrees): S11 < −10 dB from **2.5 to 3.4 GHz**, a shallow dip to −8 dB at 3.7–4.7 GHz, < −10 dB again from 4.8 GHz to the end of the run (6 GHz). The formula edge (3.1 GHz) is thus 19 % above the simulated one: conservative, kept at the published k; FDTD tuning moves it. Mesh at the full 3.1–10.6 GHz sweep: 4.6 M cells (CPW 6.7 M, flex 19 M); 2.7–12 GHz 8.7 M; 300 MHz–8 GHz about 1.1 G cells and 400 MHz–12 GHz 1.7 G cells, so the FDTD refuses (30 M limit). CPW not run in the FDTD (0.05 mm cells at the gap, bridge and vias: dt 1.3e-13 s, > 35 k steps) |
| **Printed IFA** | f · (La + 0.225 H) = c / (4 √εIFA), εIFA = 1 + 0.2745 (h/mm)^0.133 εr^0.47 (εr − 1); 50 Ω tap S = 2.5 mm √(H/5 mm) | FR-4 1.6 mm: H = 5 mm → 2.32 GHz, 48 − j2 Ω (S11 −31 dB); H = 8 mm → 2.65 GHz, 82 Ω with S = 4 mm. RO4003C 0.8 mm, H = 5 mm → 2.52 GHz, 59 + j17 Ω. H = 3 mm could not be matched with S = 0.5 H (R < 25 Ω), so the model is limited to H ≈ 4–10 mm |
| **Printed dipole** | L = 0.855 · λ/2 / √εeff(monopole fit) | K = 0.96 resonated at 2.174 instead of 2.442 GHz, so K = 0.855. Verified: FR-4 2.411 GHz, RO4003C 2.445 GHz |
| **Printed V dipole** | the printed dipole with its arms folded by ψ = (180° − angle)/2 off the dipole axis: L = K_V · λ/2 / √εeff along the arms, square w × w stubs at the port, then diagonal strips (copper polygons). L is multiplied by the FDTD resonance/target ratio at the angle (interpolated; f ∝ 1/L, so a V that resonated low gets shorter). Port 50 Ω | In-browser FDTD (CPU, FR-4 1.6 mm, w = 3 mm, 1.15–1.3 GHz, K = 0.855 for every angle): 180° resonance 1.237 GHz (+1.0 %), 54 Ω; 120° 1.195 GHz (−2.4 %), 41 Ω; 90° 1.212 GHz (−1.1 %), 31 Ω; efficiency 96–98 %. With the corrected length (multiplied by the ratio; it was divided until 2026-10, which doubled the error to ≈ −4.8 % at 120°): 120° resonates at 1.226 GHz (+0.08 %), 41 Ω (CPU engine, 1.14 M cells, 33 k steps). Folding lowers R, so the default is 120° (SWR ≈ 1.2 on 50 Ω), not the 90° the name suggests. First try: polygons with mesh lines only at their vertices left 4.5 mm cells across the 3 mm diagonal strip, the staircase broke into islands and the 90° V "resonated" at 1.51 GHz with 15 Ω; the mesh now fills polygon boxes every min-feature/2 (test: the staircase connects the stub to the tip) |
| **Dual-band printed dipole** | Each arm: a main strip L1 = K1 · λ1/4 / √εeff from the gap, and a fork at the feed with two side branches L2 = K2 · λ2/4 / √εeff at ± s (band 2 = the second band, or 2.24 × band 1). Port 50 Ω | In-browser FDTD (CPU, FR-4 0.8 mm, w = 2 mm, s = 3.5 mm): K1 = K2 = 0.855: band 1 high (X ≈ 0 near 2.58 GHz), band 2 best at 5.04 GHz. K2 = 0.783 puts band 2's best match at 5.54 GHz (47 − j6 Ω, SWR 1.15); K1 0.89 overshot band 1 (R ≈ 70 Ω at 2.45 GHz), K1 = 0.87 gives ≈ 60 − j14 Ω (SWR ≈ 1.4) at 2.45 GHz |
| **Printed sleeve dipole** | Radiator strip and a U-shaped sleeve (two legs either side of the cable slot, joined at the feed), each K · λ/4 / √εeff from the gap. Port 50 Ω | In-browser FDTD (CPU, FR-4 0.8 mm, w = 3 mm, slot 2 mm, 863–870 MHz): K = 0.855 resonated at 921 MHz (R 62 Ω), so K = 0.909: 870 MHz, 62 − j0 Ω, SWR 1.24 at 864 MHz |
| **Printed collinear** (`pcbcollinear`) | Franklin chain on one layer: N half-wave strip radiators L_R = 0.855 · λ/2 / √εeff (the printed-dipole/monopole εeff fit), joined by folded three-run meanders (path 4d + 2(w + s) + w = K_H · λ/2 with **K_H = 0.92 and εeff ≈ 1**: the folded line has hardly any field in the substrate), pitch L_R + 2(w + s) + w; first radiator 0.95 L_R above a 20 × 20 mm ground pour, gap port 50 Ω as the PCB monopole. Pattern-only model: half-sine currents, element × array factor about the board axis, normalised over the sphere, phase step −π[1.95 (K_H,eff − 0.894) + 3.1 (f/f0 − 1)] (the FDTD fit; the ideal chain has 0 + 1), loss = 10 log(1 + 10 tan δ_eff) + 10 log(1 + R_strip / 73 Ω), tan δ_eff = tan δ εr (εeff − 1) / (εeff (εr − 1)): 0.34 dB on FR-4 at 5.8 GHz | Principle: Franklin collinear array (C. S. Franklin; Kraus, Antennas), printed meander versions as on 868/915 MHz and 2.4 GHz boards. All numbers below are from the in-browser FDTD (CPU engine, FR-4 1.6 mm, w = 1 mm, s = 2 mm, 5.8 GHz); no published printed-collinear figures could be checked offline (written from memory). Table below |
| **Meander monopole** | total trace = 1.215 × the straight monopole, folded into runs of width W and pitch P | FR-4 1.6 mm, 2.44 GHz, W 8 mm, P 3 mm: 1.25 gave 2.373 GHz (S11 −20 dB, 41 Ω), so 1.215. One calibration point only |
| **PCB small loop** | Grover inductance (ρ = 0.2235 (w + t)), Rr = 31171 (A/λ²)², Rloss = perimeter/(2w) · Rs, capacitor ESR = XL/Q; L-network Cs (series) + Cp (shunt) to 50 Ω | Analytic (Microchip AN831, TI SWRA046 style). Typical 433 MHz, 30 × 20 mm: L ≈ 80 nH, Rr ≈ 49 mΩ, efficiency ≈ 5 % |
| **Patch** | Balanis TL model (above); now also exported to openEMS | — |
| **Circularly polarised patch** | Square-patch formulas above, cut / side rules as in the Per antenna table; exported to openEMS (polygon corners, probe or edge port) and run by the in-browser FDTD ("Tune to band" scales the patch). | In-browser FDTD (CPU, default 5.8 GHz FR-4 1.6 mm truncated, RHCP): best match at 5.51 GHz, 5 % below the design frequency (617 k cells, 7.5 k steps), directivity 4.9 dBi; use "Tune to band". Not calibrated against openEMS yet; the dual feed has not been run |
| **Air patch (suspended)** | Cavity + probe model above, exported to openEMS (er 1, tanD 0, director as a stacked level) and run by the in-browser FDTD ("Tune to band" scales the patch length). Build pack for a sheet-metal build: BOM = ground plate, patch plate, nylon standoffs, SMA panel jack; the fab zip carries the two plates as the bottom / top layers (DXF) with the hole list. | In-browser FDTD (see Per antenna): −5.5 % resonance before tuning, −0.3 % after "Tune to band", directivity 9.4–9.7 dBi. Not compared with openEMS or a measurement |
| **Microstrip patch array** | Geometry from the formulas above (rectangles for the linear array, polygons for the CP elements and bends); one 50 Ω edge port on the trunk; exported to openEMS and run by the in-browser FDTD for small boards (2×2 on RO4003C 5.8 GHz: 5.1 M cells; 4×4: 21 M; 8×8 stops with "FDTD grid too large", limit 30 M cells). Build pack: board, connector, patch-length tuning row; Gerber / drill / DXF; shell. | Not run in the FDTD (estimated ≈ 40 min on the CPU engine for 2×2); the loss and the 100 Ω element are model values. |

### Verification on designs the fits had not seen (openEMS)

| Design | Target | openEMS result |
|---|---|---|
| IFA FR-4 1.6 mm, H = 6.5 mm (fit used 5 and 8 mm) | 2.442 GHz, 50 Ω | best match 2.471 GHz (+1.2 %), S11 −17.9 dB, 60 + j10 Ω, gain 2.75 dBi |
| Monopole on RO4003C 0.8 mm | X = 0 at 2.442 GHz | X ≈ 0 from 2.2 to 2.6 GHz (flat), but R ≈ 120 Ω, so a matching network is needed |
| Meander 2.44 GHz (factor 1.25) | 2.442 GHz | 2.373 GHz, S11 −20 dB, then refitted to 1.215 |
| Printed dipole (K = 0.96) | 2.442 GHz | 2.174 GHz, then refitted to 0.855 |
| Printed dipole, K = 0.855, FR-4 1.6 mm | 2.442 GHz | resonance 2.411 GHz (−1.3 %), 59 + j11 Ω, 1.9 dBi |
| Printed dipole, K = 0.855, **RO4003C 0.8 mm** (not in the fit) | 2.442 GHz | resonance 2.445 GHz (+0.1 %), S11 −19 dB, 2.05 dBi, 99 % |

### Printed collinear: which structure, and the FDTD fit (in-browser FDTD, CPU engine)

FR-4 1.6 mm (εr 4.4, tan δ 0.02), trace w = 1 mm, meander gap s = 2 mm, ground pour 20 × 20 mm, f0 = 5.8 GHz, gap port 50 Ω.

**Rejected: the transposed-microstrip COCO** (narrow 3 mm strip over a 15 mm wide strip, layers swapped every λg/2 = 14.2 mm, no vias; N = 4, 50 Ω port between the layers at the board edge). FDTD (9 501 steps, 0.58 M cells, 6 min): X = 0 at 5.70 GHz with only 6.9 Ω, radiation efficiency 51 %, maximum 1.2 dBi at θ = 15° (broadside to the board face, HPBW 56°), no collinear lobe. The two layers carry equal and opposite currents, so nothing radiates along the board; the wide strip is no outer conductor. The Franklin chain was chosen instead: its currents are the standing waves of the radiators themselves.

**Franklin chain, N = 4, K_H sweep** (K_H = meander path / (λ0/2); L_R = 0.855 · λ/2/√εeff = 18.6 mm, first radiator 0.95 L_R, pitch 25.6 mm; the beam direction is read from the 5° pattern grid, so ±2.5°):

| K_H | gain at 5.8 GHz | beam above the horizon | S11 at 5.81 GHz | best match |
|---|---|---|---|---|
| 0.85 | 6.50 dBi | −5.7° | −7 dB | −23 dB at 6.16 GHz |
| 0.90 | 6.46 dBi | 0° | −8.5 dB | −20 dB at 6.05 GHz |
| **0.92 (default)** | **6.48 dBi** | **+2.9°** | **−11.5 dB** | −22 dB at 5.93 GHz, below −10 dB from 5.80 to 6.5 GHz; radiation efficiency 78 % |
| 0.95 | 6.21 dBi | +5.7° | −19 dB | −19 dB at 5.81 GHz, below −10 dB from 5.70 to 6.4 GHz |
| 1.00 | 5.38 dBi | +12° | −12 dB | −16 dB at 5.64–5.70 GHz |

At K_H = 0.92 the pattern at 5.3 / 5.8 / 6.3 GHz: 6.57 dBi at −13.6°, 6.48 dBi at +2.9°, 5.27 dBi at +18°: about 1.9° per 1 % of frequency, 3 times the meander delay alone (the radiators' own current phase is dispersive); the model's phase step is fitted to these (and to the K_H = 0.95 runs: −9.4°, +5.7°, +20°). The model's gain for N = 4 is 6.0 dBi (directivity 6.3, loss 0.3 dB), 0.2–0.5 dB below the FDTD gain; the FDTD radiation efficiency is 78 %. First radiator (N = 3, K_H = 1.0): a λ/4 strip (0.5 L_R) left the match 15 % high (6.7 GHz); 0.95 L_R puts it on the design frequency (S11 −16 dB at 5.81 GHz, 68 − j4 Ω, gain 4.9 dBi against the model's 4.9 dBi). Longer ground pours (30, 40 mm, first radiator 0.5 L_R) lowered the gain (4.5, 3.7 dBi at N = 3) without moving the match. Run time: 1 800 s each with three runs side by side on 8 cores (N = 4, 1.76 M cells, 12 000 steps), 366 s for the 0.58 M-cell COCO.

Not checked: other substrates, trace widths, N above 4, 2.4 GHz.

### The openEMS export (`src/lib/openems.ts`)

The script builds the substrate (loss as κ = 2πf0·ε0·εr·tan δ), copper rectangles (PEC sheets, edge "thirds" mesh) and polygons (`AddPolygon`, a mesh line at every vertex; the FDTD staircases them, as does the in-browser engine), a lumped port, a λ/2 air box (MUR) and an NF2FF box. It then:
1. runs openEMS (−50 dB end criterion);
2. prints the resonances (Im Zin = 0) and the directivity, efficiency and gain over the full sphere;
3. saves `<name>_results.json` / `_s11.csv` / `_results.png` next to itself (S11, Zin, polar cuts).

Load the JSON in the app's Simulation tab to see it in the same charts.

**Two pitfalls found while validating it against a free-space strip dipole.** The dipole's Z was right from the start, so only the far field was affected:
- **`CalcNF2FF(center=…)` is in metres, not drawing units.** Passing millimetres moved the phase centre metres away and gave 9–12 dBi "directivity" for a dipole. openEMS also caches NF2FF files (`read_cached`), so the fix only showed after disabling the cache.
- **A λ/4 air margin read 0.4 dB low** (1.82 dBi). λ/2 gives 2.14 dBi (theory 2.15). The official patch tutorial, run as a reference, gave 6.8 dBi and 94 % efficiency.

## In-browser FDTD

`src/lib/fdtd` (CPU reference) and `src/gpu/fdtdGpu.ts` (WebGPU) solve the same printed-antenna model that the openEMS
export writes, inside the browser. "Run FDTD" in the Simulation tab uses WebGPU when the browser has it and the CPU engine otherwise.

- **Mesh** (`mesh.ts`): rectilinear, λmin/20 in air and λmin/(20√εr) in the substrate, copper edges by the thirds rule,
  four cells across the substrate, exact lines at the port terminals and board edges, λ/2 of air at the lowest frequency.
  Lines are graded with ratio ≤ 1.4: cells placed evenly in ∫dx/h with h = s + ln(1.4)·distance grow geometrically by exactly 1.4.
- **Update** (`setup.ts`, `cpu.ts`): standard Yee scheme, dt = 0.95 × the Courant limit. Materials are averaged over the four
  cells around each edge; FR-4 loss is a conductivity σ = 2πf0 ε tanδ. Copper is a zero-thickness PEC sheet.
  Boundaries are first-order Mur.
- **Port:** a lumped 50 Ω resistive voltage source spread over the port edges, with Gaussian excitation over the simulated span.
  Z(f) = DFT(V) / DFT(I), with V sampled at (n+1)dt and I at (n+½)dt.
- **Far field** (`nf2ff.ts`): running DFTs of the tangential E and H on a box four cells inside the boundary, then
  J = n × H, M = −n × E radiated to 5° steps over the full sphere. Gain = 4πU / P_accepted, efficiency = P_rad / P_accepted.
- **Stop:** when the port signals are 40 dB below their peak (as openEMS EndCriteria 1e-4, which is on energy), or at 100 k steps.
  On the IFA below, truncating a 60 k-step run showed the resonance settled at 20 k steps and S11 depth at 25 k (−30 dB signal level).
- **WebGPU:** the kernels mirror the CPU code (H update, E update, port, Mur, NF2FF DFT). Fields and data are packed into
  7 storage buffers, which fits the default limit of 8. Over 400 steps the GPU matched the CPU to 1.5 × 10⁻⁴ relative.

**Validation against openEMS** (CPU engine; the dipole run to −100 dB, the IFA for 80 k steps ≈ −50 dB; openEMS with the exported script):

| Case | This FDTD | openEMS |
|---|---|---|
| Strip dipole in air, 2 × 28 mm, 1 mm gap | 74.6 + j3.7 Ω at 2.442 GHz, 2.17 dBi, efficiency 99 % (77 × 112 × 65 cells) | 74 Ω, 2.14 dBi |
| IFA, FR-4 1.6 mm, H = 5 mm, ground on both layers | best match 2.393 GHz, S11 −22.6 dB, 51.7 + j7.4 Ω, directivity 3.09 dBi, efficiency 90 % (128 × 108 × 65 cells) | 2.320 GHz, 48 − j2 Ω, 3.06 dBi, 91 % |
| Printed dipole, app defaults (FR-4, in Chromium, CPU engine) | resonance 2.398 GHz, SWR 1.39–1.45 in 2.400–2.483 GHz, 2.05 dBi, 392 k cells; 12 k steps / 218 s at −40 dB (−60 dB: 2.397 GHz, 15 k steps) | 2.411 GHz for the calibration board |

Impedance and pattern agree closely. The IFA resonance comes out **about 3 % high**. The likely cause is how the
zero-thickness copper edge and the substrate interface are averaged. Treat the in-browser FDTD as a fast first pass
and openEMS as the reference for a final board.

**Speed:** the CPU engine does ≈ 20 M cell-updates/s (single thread). The IFA above (0.9 M cells, ≈ 25–40 k steps) takes
15–25 min on the CPU and well under a minute on a desktop GPU. Headless Chromium only offers SwiftShader (software WebGPU),
which is about 5× slower than the CPU engine but runs the same kernels.

## Build pack (`src/lib/build.ts`, `fab.ts`, `template.ts`)

- **Pieces:** wires of one kind (group, diameter, mechanical or not) are joined where exactly two meet with nothing else
  attached, or where they continue in a straight line. That turns a quad's four sides into one closed loop and a J-pole's tapped
  radiator into one tube. Free ends (touching nothing) are the trim points.
- **Trim sensitivity:** the design is rebuilt with every band scaled by 1.01; the change in each resonant part gives dL/df.
  A step s at each of E trim points on n parts moves the best match by Δf = s·E / (n·|dL/df|). Steps are rounded to
  0.25/0.5/1/2/3/5/10… mm, aiming at about 0.3 % per step. Check: a 145 MHz dipole gives 2 mm per end → 603 kHz,
  and f·ΔL/L = 145 MHz × 4 mm / 966 mm = 600 kHz.
- **Measured vs model:** best match (lowest |Γ|) within ±20 % of each tuned part's frequency, SWR < 3. Change per trim point
  = (f_target − f_measured)·n·|dL/df| / E. The rescale button sets trim so (1 + trim) is multiplied by f_measured / f_target.
- **Substrate notes:** the layout is fixed, so the frequency it would give on another εr is f × L(εr′) / L(εr), with L the
  resonant dimension the formula would choose at εr′. Default IFA on FR-4: εr + 0.1 → −1.4 %; 4.2…4.7 → 2.34…2.51 GHz.
- **Gerber:** RS-274X, `%FSLAX46Y46*%`, mm, one G36/G37 region per copper rectangle, origin at the board's lower-left corner.
  Files: .GTL, .GBL, .GKO (0.1 mm outline), .DRL (Excellon, metric) for a probe feed, .dxf (R12, layers OUTLINE/TOP/BOTTOM/PORT/DRILL).
  Checked with gerbonara (all files parse, bounding boxes match the board) and ezdxf.

## Printed build parts (`src/lib/print/`)

Every wire antenna gets 3D-printable parts built from `Design.wires`. Dipole: centre block and end insulators. Ground plane: radial hub.
Yagi: element clips and driven block. Helix: grooved tube or rib frame (print one; base flange with SMA hole and feed slot, stacked
with D-keyed spigots above 170 mm). Discone: rod hub with an axial mast socket (`mast` param). Moxon: spreader hub, front and rear
corner caps (one part, turned over) and 2 tip-gap insulators set to C. Quad: a hub per loop and 8 corner caps. Biquad: feed standoff
with a 5 mm plate, a 45° connector flange, a feed-gap slot, and leg grooves that run out past the plate (works at 5.8 GHz). J-pole: stub spacers and a clip-on feed-tap gauge. Fan dipole: centre block and leg
spreaders. Collinear: radome spacers, one per section (`rid` param). Print-only params `rod`, `bd`, `rid`, `mast` do not affect NEC or MoM.
Fan spreaders use only wires within 60° of the leg, between Ymin = gap/2 + 50 mm and Ymax = min(⅔ of the longest arm, gap/2 + 150 mm / spread); midway and Ymax, or only Ymax when closer than 20 mm; none if Ymax < Ymin or fewer than 2 holes.

Shells (`print/shells/`): every antenna gets one `shell` part. A full shell (dome for helix and discone, otherwise a two-half clamshell; PCB antennas get a board enclosure with edge stops, ground posts and a raised roof for the coax) is used when it fits the 180 mm bed, otherwise a one-piece feedpoint hood open at the bottom. Style follows frequency: at 2 GHz and above wall 1.2 mm, gap 1.5 mm, flat screwed joint; below, wall 2 mm, gap 3 mm, lip, silicone and a drain. Plastic near the antenna lowers the resonance by about 1-3 %: retune with Trim and check printed antennas with FDTD. Shells are not simulated.

## Built-in simulator (`src/lib/mom.ts`, `src/lib/simulate.ts`)

The **Simulation** tab shows openEMS-style results:
- S11 (dB), input impedance (Re/Im) and SWR against frequency, with the bands shaded;
- a Smith chart with the SWR 2 circle;
- three polar far-field cuts in dBi (XY, XZ, YZ);
- a rotatable 3D gain surface;
- a summary: maximum gain and its direction, front-to-back, −3 dB beamwidth, and SWR range plus Z per band.

The S11 sweep can be exported as Touchstone `.s1p` (load it in WebVNA as an overlay) and the cuts as CSV.

- **Wire antennas** use a thin-wire Method of Moments in the MININEC formulation:
  - current pulses between segment midpoints, charge pulses on segments, point matching and a reduced kernel;
  - the static 1/R part is integrated analytically (asinh), the rest with 4/8-point Gauss;
  - junctions get k − 1 unknowns;
  - a delta-gap source sits at the feed node.
  It runs in a Web Worker at 60 segments per λ, capped at 450 unknowns.
- **Patch:** cavity-model impedance R0 / (1 + jQ(f/fr − fr/f)), with R0 the inset resistance and Q = 1/(√2 · BW). The pattern uses the two-slot model over an infinite ground plane, normalised to directivity.
- **Collinear:** the array factor of N in-phase λ/2 dipoles; it has no impedance model.

**Validation:** compared at the same geometry, as segments get finer.

| Model | MoM λ/20 → λ/160 | NEC-2 (converged) |
|---|---|---|
| Dipole 145 MHz | 70.7 − j0.1 → 73.3 + j5.6 Ω, 2.13 dBi | 73.4 + j7.5 Ω, 2.15 dBi |
| Quad | 59.5 + j15 → 52.2 − j5.9 Ω | 51.9 − j6.2 Ω |
| Moxon | 34 − j21 → 47.5 − j6.7 Ω | 50.0 − j3.9 Ω |
| Yagi 9 el (folded) | 196 + j24 → 230 − j43 Ω, 13.0 dBi | 238 − j38 Ω, 13.4 dBi |
| J-pole | 35 → 28.6 Ω | 38.5 (λ/80) → 32.6 (λ/160) → 31.3 Ω (λ/320) |

**Lesson:** the first J-pole and fan-dipole tunings were fitted to NEC-2 decks at λ/40, which are **not converged** for close-spaced parts. The J-pole moved from 38.5 to 31.3 Ω as the segments got finer. Both were re-tuned on converged models:
- J-pole: tap 0.019 λ, ≈ 45–48 − j7 Ω.
- Fan dipole: element lengths are now tuned by the solver itself (at most 6 elements; extra bands are ignored with a note).

The NEC export now uses λ/80.

### Radiation view (`src/lib/nearfield.ts`)
Preview's **Radiation** toggle draws Re(E·e^{jωt})·r on the screen plane through the feed, at the design frequency.
Each MoM current element (half-segment, the basis `gainFn` integrates) is a short dipole with its full field:
E = η I dl e^{−jkr}/(4π) · [r̂(r̂·p̂)(a + b) − p̂ b], a = 2/r² − 2j/(k r³), b = jk/r + 1/r² − j/(k r³).
Points closer than max(wire radius, element length) are evaluated at that distance.
- Checks (`nearfield.test.ts`): one element matches the analytic Hertzian dipole within 1 % at 0.1 λ and 5 λ;
  the λ/2 dipole's |E| at 30 λ broadside gives the same gain as `gainFn` within 0.1 dB; a Yagi's far arc in front is > 3× the one behind.
- Display: × r removes the 1/r decay; brightness is normalised by the 99th percentile of the envelope over pixels ≥ λ/2
  from every wire (otherwise the near field at element tips sets the scale and the radiated wave is invisible).
  The view zooms out to ≥ 3 λ and the antenna + 2 λ so wavefronts show.
- **Printed antennas** (`src/lib/pcbwires.ts`): a thin-wire stand-in of the copper. Traces (short side ≤ λs/24 or
  aspect ≥ 3) become centre-line wires of radius w/4, wide pours a wire grid (spacing ≤ λs/12, radius spacing/2π),
  a pour repeated on both layers counts once, touching shapes are joined at the centre of their common area, and the
  lumped port becomes the centre-fed feed wire. The substrate is a frequency scale: the wires are solved at
  fs = 1.1 · f · √εeff (εeff from the monopole fit, or microstrip when copper sits over a bottom pour) and radiate at f.
  The 1.1 makes the printed, V and sleeve dipole stand-ins resonate at the design frequency (X changes sign between
  0.93 fs and 1.07 fs, tested). It shows the current paths and wavefronts, not a substitute for the FDTD.
- **Assumed currents** (`src/lib/idealcurrents.ts`) where no wire model exists: the patch's TM10 sheet current
  (sin along the resonant length, five lines across the width), the coaxial collinear's in-phase half-sine sections
  with a quarter-sine top whip, and the PCB loop's uniform current. The legend says which model is shown.

## NEC-2 export

The deck is in free space:
- `GW` per wire, with λ/80 segments at the top of the sweep, λ/10 for plate grids, and an odd count on centre-fed wires.
- **Tapered segments:** wires attached to a short feed-gap wire start with a segment the size of the gap, growing ×1.4 per segment (`GW` with radius 0, then `GC`), and continue uniform after that. Without the taper, a 5 cm feed segment next to 1 m segments reads −30 % low on an HF dipole (49 Ω instead of 73 Ω).
- `GE 0`, then `EX 0` on the feed segment.
- An `FR` + `RP 0 37 73 1000 0 0 5 5` pair **per band**, each with a ±2 % margin. The discone gets one sweep across all bands.
- `EN`.
Plates (helix ground plane, biquad reflector) become wire grids. Booms are left out. The patch and the coaxial
collinear have no wire model, so the NEC button is disabled for them.

The numbers above came from `nec2++` (necpp) running the exported decks. To repeat:

```bash
nec2++ -i yagi-145.5MHz.nec -o yagi.out     # or open the .nec in 4nec2 / xnec2c
```

## FreeCAD export

`*.FCMacro`: one `Part::Feature` per wire (cylinder) and per plate (extruded polygon), in millimetres, coloured
by role. Run it from *Macro → Macros… → Execute* or paste it into the Python console.
