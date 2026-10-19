# Ephemeral — Concept 3D · 2026.10.19.2

Current concept: a horizontal A0 canopy (0.841 × 1.189 m) overhead receives the projection on its underside. Below sits a 700 × 700 mm square timber frame wrapped in pond liner, edged with bricks, filled with mini black pebbles that shape the terrain, and topped up with water to form a puddle. The water level is fixed; water-level interaction is no longer used. The projected sky is unchanged.

Double-click `Start Demo.command` and keep Terminal open. Python 3 and a modern WebGL 2 browser are required; do not open HTML directly. Use `python3 launch.py --lang en` for English. The top-right version tag should read `CONCEPT 3D · 2026.10.19.2`.

## Workspaces

- **Concept 3D**: a fixed model. Drag to orbit, scroll to zoom; arrow keys and + / − also work. Views: overview, visitor view (1.62 m eye height, about 0.6 m from the puddle centre), looking down, build layers. Toggle separated layers, labels and gallery lighting (dark / bright), and set the canopy height. The build list marks which dimensions are decided and which are simulation assumptions.
- **Projection settings**: the sky loops sunrise → sunny → sunset → overcast night → sunrise. The sun follows its real October path over Melbourne (rising east-south-east, about 59° high in the north at noon, setting west-south-west), and sky colour is computed from atmospheric scattering: Rayleigh (blue sky), Mie (bright haze around the sun) and ozone absorption (blue-violet twilight), with automatic exposure. Clouds are lit by sunlight (reddening at low sun, with high cloud lit briefly after sunset), skylight and city glow at night; cloud closes into an overcast night with rain sound and clears before dawn, when a few stars show. The four phases are equal by default (15 s each, 60 s per loop, adjustable under the timeline); sunrise and sunset stay entirely in the most colourful band (about −6.6° to +9°) and the sun slows near the horizon, never jumping or reversing. A low sun lights cloud bases from the side, turning them pink, orange and gold around sunrise and sunset. Output is fixed at 24 fps: sky light blends every frame between two precomputed sun positions while the next one is built in the background, so fast dawn and dusk changes stay smooth. Sky combinations: six atmosphere types (Melbourne everyday, clear after rain, soft sea haze, hazy warm sun, bushfire smoke, volcanic twilight [approx.]) change the air itself while colour is still computed by scattering; six colour grades (natural, warm film, cool morning, dreamy pink-violet, soft pastel, black and white) sit on the final image and combine with any atmosphere, 36 combinations in all. A turbidity slider fine-tunes the haze; night city glow remains. Clouds drift with Melbourne's live wind, their inner texture moving at the same speed, and cloud edges form and fade at half the 10.12.2 rate. The upper layers of each cloud lean towards their own random direction (up to 10.16.2 they all leant towards the centre of the frame, which looked radial). One cloud per visitor: it fades in on a clear patch of the canopy; when it drifts off or dissipates after a minute or two, a new cloud with a different shape forms upwind; it fades out after they leave. Cloud shapes differ on every launch. The reflection check shows what a visitor sees while walking around the puddle.

Projection settings layout: playback stays on top; the sky preview sits left, live parameters (style, audience, atmosphere, clouds, wind, rain) on the right, and tabs below the preview hold reflection check, timing, presets, camera and audio/log. On desktop windows at least 560 px tall the page does not scroll; panels scroll inside, so the preview stays visible while adjusting.

The canopy underside shows the same live sky as added light. "Fill" covers the whole A0 sheet; circle and square outputs cover an 841 mm square in the centre. Projector model, position and throw distance are undecided and not modelled.

## Simulation scope

- The puddle outline comes from the pebble terrain and the fixed water level, about 42 × 41 cm. Water-level drop, shoreline retreat, dripping and flow are not simulated.
- Assumed: 150 mm frame height, 35 mm boards, 230 × 110 × 76 mm bricks in two dry courses, pebbles about 10–20 mm, centre about 35 mm lower, canopy at 2.27 m (previous default).
- Reflection brightness, water colour and pebble form are visual approximations without optical or material calibration.

## Presets

Under the preview, Presets → "Save current parameters" stores sky, timing, visitor count, canopy height and other manual settings. "Set as startup default" restores them on reopening. Colour presets are stored separately.

Presets live outside the app in `~/Documents/Ephemeral User Data/presets.json`, with `presets.previous.json` kept on every save. Older presets still load: sky and timing settings apply; legacy build parts and puddle fields stay in the file but are not shown. JSON export and merge import are available. `python3 launch.py --data-dir PATH` selects another folder; tests must use a temporary folder.

## Checks and dependencies

`node test.mjs`, `python3 test_presets.py`, `python3 test_launch.py`. p5 renders the sky and Three.js 0.180.0 the 3D view (MIT licence in `vendor/three/LICENSE`); all libraries are bundled. Rain recording and licence: `assets/audio/CREDITS.md`. Camera, location and forecast need explicit activation; the forecast needs internet. This version does not connect to Arduino or real plumbing.
