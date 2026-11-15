# One Horsepower

An Amish road-survival game. Jebediah Stoltzfus is driving his buggy to a wedding supper.
He has no television, no radio, and no idea why the English are behaving so strangely.
Survive ten minutes.

## Play

**Play in your browser:** https://legendsequip.github.io/Amish-vs-Zombie/
(Chrome or Edge on a desktop or laptop; needs a keyboard and mouse.)

To run it from a downloaded copy on Windows, double-click **Play.bat** (starts a small local server and opens the game), or just open
`index.html` in Chrome or Edge. An internet connection is needed the first time so the
3D library (three.js) can load from its CDN.

## Controls

| Key | Action |
| --- | --- |
| `W` / `S` | faster / slower gait (whoa, walk, trot, canter, gallop) |
| `Shift` (hold) | gallop |
| `Space` | whoa (stop) |
| `S` when stopped | back up — `W` goes forward again |
| `A` / `D` | steer |
| Mouse | look and aim — you can turn right round and look out the back window |
| Left click or `F` | use the selected weapon |
| `1` or right click | crack the whip (whatever else you are holding) |
| `2`–`8` / wheel | draw knife, shovel, pitchfork, revolver, shotgun, scythe, flamethrower — press the number again to use it (hold for the flamethrower) |
| `E` | feed the horse (stamina) |
| `Q` | eat a shoofly pie (repairs the buggy) |
| `V` | chase camera |
| `X` | look straight ahead |
| `M` / `Esc` | mute / pause |

## How it works

- **The horse** tramples anything in front of her if she is moving fast enough. Bigger
  zombies need more speed. If she is too slow they stop her and start biting.
- **Stamina** drains at a canter and fast at a gallop. Feed her what the dead drop.
- **The horde** behind you gets faster every minute. Watch the mirrors.
- **Hangers-on**: zombies grab the sides and back of the buggy. Rub the side ones off on
  fences, posts, wrecks and bridge walls. Shake the back ones off with a hard swerve or
  a bump, or turn round and hit them.
- **Wrecks and debris** that glint can be whipped as you pass for armor plate, scythe
  blades and speed parts. Each has five levels and shows on the buggy.
- **Repair crates**: white crates with a red cross and a green glow. Drive over one to repair
  the buggy by 20.
- **What a zombie wore decides what it drops**: the farmer has a pitchfork, the road
  worker a shovel, the butcher a knife, the policeman a revolver, the hunter a shotgun.
- The run goes from late afternoon through sunset to a storm under a red moon.

## Files

- `index.html` — page, HUD and menus
- `js/world.js` — endless road, farms, fences, covered bridges, wrecks, debris
- `js/buggy.js` — buggy, horse, working mirrors, first-person weapons
- `js/zombies.js` — zombie types, AI, the horde, spawn director
- `js/game.js` — driving, combat, collisions, loot, flow
- `js/env.js`, `js/fx.js`, `js/audio.js` — sky and weather, particles, synthesised sound
- `assets/` — key art generated with Higgsfield (Nano Banana Pro): `title.jpg`, `win.jpg`,
  `lose.jpg`. Replace any of them with a same-named file and the game picks it up.

- `assets/zombies/` — eight rigged 3D zombie models (GLB) made with Higgsfield: `walker`, `farmer`,
  `cop`, `worker`, `butcher`, `tourist`, `bloater`, `brute`. The outfit a zombie is given picks its
  body (and its loot); bloaters, brutes and the giants have bodies of their own. Delete the folder
  and the game falls back to its built-in code-drawn zombies.
- `tools/glb-face-forward.ps1` — turns a generated mesh to face forward before it is auto-rigged.

The world, buggy, horse, sound and music are generated in code. The zombie bodies and the
title/ending art come from Higgsfield.
