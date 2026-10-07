# Naija Rush — Street Racing

A full-screen 3D street racer set on real Lagos and Abuja roads (Ikorodu Road, Herbert Macaulay Way, Ahmadu Bello Way…), built with React and Three.js. The city layout is stylised, not a geographic map.

## Run

- `npm install`
- `npm run dev -- --host 0.0.0.0`, then open the URL (on Windows PowerShell use `npm.cmd`).
- Production: `npm run build` then `npm start` (port 3000; override with PORT).
- Checks: `npm test`, `npm run lint`, `npm run build`.
- Promo video and OG image (real gameplay, recorded from the dev build): with `npm run dev` running, `node scripts/video/gen-gameplay-audio.mjs`, then `FFMPEG=path/to/ffmpeg node scripts/video/gameplay.mjs video marketing/naija-rush-15s.mp4` and `node scripts/video/gameplay.mjs og public/og-image.png`. Scenes and captions are the `cues` list in gameplay.mjs.
- `npm run fetch-assets` re-downloads the CC0 photo textures and sky into `public/assets` (already included).

## Play

Every drive is a race. You line up on a start grid under a chequered START gantry with flags waving, mid-pack among four rivals, each with their own colour: Ojuelegba Flash (red Dodge Challenger), Area Father (purple Mercedes-AMG G63), Danfo King (yellow danfo) and Lekki Boss (blue Lexus RX 350). Hold the gas during the 3-2-1 countdown to rev the engine in neutral; keep the revs in the sweet spot at GO for a PERFECT START, or bounce off the limiter and spin the wheels. The race is 3 laps of 3 km (9 km, about 3-5 minutes): the road is straight, so each lap ends at a LAP gantry (LAP 2, FINAL LAP) and the last at the chequered FINISH. LAPS and LAP_LENGTH are in physics.js. The rivals are fast and aggressive: each runs their own pace (fall behind and they're gone), and every so often one of them rams your bumper, slams the door in your lane or leans on you side by side. Every rival carries a name marker in their colour that stays readable at any distance, shows as a coloured dot on the minimap and the race-progress bar, and is listed in the live standings under the street sign (position, name, gap in metres). The race card shows your place (3RD/5), the lap, the race time and the distance to go.

Race traffic is lighter than in free driving (danfos, cars, taxis, okadas and kekes, but no BRT buses or go-slows), so the race flows, but it drives worse: most danfos and about half the taxis and okadas are reckless, and reckless drivers cut in sharply in front of you. The road is chaotic on purpose: every 5-11 seconds something kicks off 50-260 m ahead (a reckless driver dives into the next lane without looking, someone slams the brakes for no reason, or a tyre bursts and the vehicle skids to a stop with its hazards on), and the traffic behind piles into it. Every 10-20 seconds a reckless danfo, taxi or car near you picks a fight without being provoked, and okadas swarm between the lanes.

There is a police checkpoint halfway round every lap. Two police vans block the outer lanes, cones funnel traffic into the middle lane, and an officer waves cars through; a sign and an on-screen warning give you 260 m notice. Go through under 60 km/h and you're waved on (+75 RP). Blast through faster, or hit one of the vans, and olokpa come after you with two stars. Traffic queues and slows through the checkpoint; the rivals blast straight through. Hit a vehicle and its driver may come after you: they ram you back, and once the police are chasing you they squeeze you in your lane to slow you down for olokpa.

Reckless driving brings the police. A meter on the HUD fills when you crash into traffic (two crashes is enough), side-swipe, shave past cars, or drive near your car's top speed, and drains slowly when you drive clean. A pursuit gives up after 50 seconds unless they are already boxing you in (+100 RP). Rivals ramming you doesn't count. When it's full, olokpa join the chase. Stars climb fast in a race (two after 12 seconds, three after 25), and every crash into traffic during a chase adds one. In a race you can only be arrested when nearly stopped (under 25 km/h), so slowing for a checkpoint mid-chase isn't an automatic bust; get busted and the race is over. Crossing the finish line ends the chase.

At the finish you get a results screen: a star badge with your place, the finishing order with everyone's times, and your prize (600 / 300 / 150 / 50 RP for 1st to 4th) counting up. Tap NEW RACE to line up again. A clean flat-out run usually lands on the podium; to win, use your Pepsi nitro. Rival pace is set by `skill` in `RIVALS` in physics.js.

Reckless drivers: about half the danfos, plus a fair few taxis and okadas and some private cars, drive recklessly. They speed, tailgate, weave between lanes and cut in sharp right in front of you ("NA ME GET ROAD!"). You don't have to strike first: every 15-30 seconds a reckless danfo, taxi or car near you picks a fight unprovoked ("WHO YOU BE?! COMOT FOR MY ROAD!"). From behind they ram your bumper; beside you they lean into your side; in front they cut in and brake-check you, then drop back and come at you from behind. Outrun them or outlast their anger to win their car's value. Being attacked never brings the police on you; hitting back counts like any other bump, so two hits on the same car still start a race with olokpa in pursuit.

Nitro: blue NOS bottles lie in the lanes, about two blocks in three. Drive through one to pick it up (the tank holds three). Press N or Shift, or tap the NOS button above GAS, to fire one: 3.5 seconds of full thrust up to 90 km/h past your top speed. The blast shoves aside anything boxing you in, police vans included, and clears the arrest bar; anything you hit while boosting gets pushed out of your lane instead of stopping you. Upgrades now cost 1,000 / 2,000 / 3,500 / 6,000 / 10,000 RP per level.

Cars cost RP. Everyone starts in the Dodge Challenger (195 km/h), which is free, as are the Peugeot 504 (120), Toyota Corolla (130) and Mercedes 190E (140). The Toyota Camry (150) costs 2,500 RP, the Lexus RX 350 (150) 3,500, the Honda Accord (160) 5,000 and the Mercedes G63 (175) 9,000. At the top are three supercars: the Lamborghini Huracán (215 km/h, V10) for 25,000 RP, the Ferrari F8 Tributo (230, flat-plane twin-turbo V8) for 40,000 and the Bugatti Chiron (255, quad-turbo W16) for 70,000. Rivals race at your car's pace up to Challenger pace (RIVAL_TOP_SPEED in physics.js), so the supercars can pull away. Browse every car in the garage; locked ones show a padlock and a BUY button. A race earns roughly 800-1,200 RP. Engine upgrades add 10 km/h a level.

First launch walks you through onboarding: pick a street name (type one, tap a suggestion or roll the dice) and an avatar, then pick your ride on the 3D turntable, with stats, engine and paint. There are eight cars: Peugeot 504, Mercedes 190E, Toyota Camry, Dodge Challenger, Toyota Corolla, Honda Accord "Evil Spirit", Lexus RX 350 and Mercedes-AMG G63. The new ones also show up in traffic, and beating a G-Wagon driver in a road rage pays the most (₦900).

W/A/S/D or arrows to drive, S to brake then reverse, Space to brake, H for the horn (traffic ahead clears the lane), Esc to pause. On phones you get on-screen steering, gas, brake and horn buttons; add the game to your home screen to play fullscreen.

The police van chases you in its own lane and rams you to bleed your speed, while traffic moves aside for the siren. Slow down and the van boxes you in, an officer gets out and walks to your door, and you're busted if you stay put. Stay more than 170 m ahead for 6 seconds to escape (+150 RP). A rear-view mirror appears while you're wanted.

Crashes have weight. Hitting a vehicle shoves it according to its mass (an okada flies, a BRT barely moves) and bounces you back. You get sparks, glass, an impact flash, a crunch-and-thump sound and an angry honk. Scratches show on the side that was hit, damaged engines smoke, and heavy damage cuts your top speed. Crashed vehicles skid to a stop with their hazards on. Side-swipes grind paint off both cars, hard braking and fast cornering lay skid marks and tyre smoke, and slipping past traffic with less than a metre to spare earns +10 RP. Drivers shout back in Lagos pidgin ("WEREY! YOU NO GET EYE?"), shown above their vehicle and in the chat feed.

Hit a Mercedes or a Challenger and the owner wants to know: "DO YOU KNOW WHO I AM?!"

Each car has its own engine voice, driven by a six-speed automatic gearbox. RPM follows road speed through the gear ratios, with clutch slip pulling away, a torque cut on each upshift and a rev limiter. The synth runs firing-frequency harmonics (rpm/60 × cylinders/2) through saturation and a load-dependent filter, with exhaust noise and V8 lope on the Challenger. You also get pops and crackle when you lift off, and a turbo whistle with blow-off once you buy turbo upgrades.

Engine sound is physically modelled in an AudioWorklet. A crank turns through the 720° four-stroke cycle, and each cylinder fires at its real angle: inline-4s every 180° into one exhaust, the V6 every 120° alternating banks, and the HEMI V8 every 90° in the cross-plane L-R-L-L-R-L-R-R bank order that makes the burble. Each pulse travels down header and tail pipes modelled as delay lines with lossy reflections, then through a silencer that opens with revs and throttle. Pipe lengths, muffler and rasp differ per car (504: raspy carburettor four; 190E: quiet, smooth M102; Camry: 3.0 V6; Challenger: open dual-exhaust 5.7 HEMI). A six-speed automatic drives the RPM, with launch slip, upshift torque cuts, lift-off pops and turbo blow-off. Browsers without AudioWorklet fall back to an oscillator engine.

Police: one van per star (two stars bring backup, three bring two). Backup vans flank you and block you when you slow down. If any police unit gets within a few metres while you're doing under 40 km/h, the arrest meter fills; drive off to drain it, and if it fills you're BUSTED. Ramming olokpa adds a star, and you only escape once every unit has lost you.

Every vehicle ahead carries a tag with its make, model, year, class (★) and value. Beat a driver in a road rage, by outrunning them or outlasting their anger, and you win their car's value: a keke ₦60, a 504 or danfo ₦100, a 190E ₦200, a Camry ₦350, a Challenger ₦600. Get pinned to a stop and you pay half. Race prizes scale the same way, up to 3× when the challenger is a Challenger.

EKO FM 97.3 Naija Shuffle plays ten original tracks, generated live in the browser and shuffled so every track plays once before any repeats. Six are in Nigerian styles (Afrobeats with shakers and rimshots, amapiano with log drums, Afro-pop, a Fuji groove with talking drums and congas, Afro-house, and highlife with a plucked guitar lead); four are Afro-electro, electro-house and drum & bass. They are original compositions, not covers of real songs, so there is nothing to license. The music is calmer in menus, cruises while you drive, and hits the full drop during races and police chases. Settings and the pause menu have separate SOUND FX and MUSIC volume sliders (remembered between sessions; music defaults to 85). Press M or tap the radio chip for the next song.
Lagos traffic: some 1.4 km blocks contain a 400 m go-slow. Traffic creeps through it in stop-and-go waves, the HUD warns you before you reach it, and danfos ride the shoulder to get through. Danfos drive aggressively everywhere: tight gaps, quick lane changes, pulling over to load passengers and barging back out. They and taxi drivers lean on the horn and shout at slow kekes, okadas, BRTs or you ("KEKE, COMOT FOR ROAD!"). Vehicles that crash into each other stop with their hazards on and argue. Hit a danfo, a big man's Benz or Challenger, or (often) a taxi, and you trigger road rage. They come after you, tailgate, brake-check you once they're in front, try to shove you sideways, and honk and shout until you lose them. If they ram you, that counts as your second bump and the rage turns into a race.

Performance: physics runs at a fixed 60 Hz, so speed and handling are the same at any frame rate. Plain-coloured parts share a few vertex-coloured materials (a car or street block draws in a handful of calls), distant vehicles drop small details and shadows, crowds and far street blocks are culled, and all shaders and vehicle models are prepared while you're on the title screen. Lights are never added mid-game, because that forces a full shader recompile.

Police scale with your stars: one van at one star, two at two stars, three at three. Backup vans flank you, and when you slow down one gets in front to block. Ramming olokpa adds a star, and you only escape once every unit has lost you (the bonus grows with your stars).


Day and night: press T or tap the sun/moon button to cycle AUTO (an 8-minute day), LIVE (your device clock), DAY and NIGHT. It's also in Settings and is remembered. At night you get lit windows and shop signs, streetlight pools on the road, headlight beams, glowing tail lights, stars and a moon.

Each car is recognisable on sight. The Peugeot 504 has trapezoid lamps, a lion badge, chrome bumpers with overriders and drip rails. The Mercedes 190E has an upright chrome grille, the bonnet star, grey Sacco cladding, ribbed tail lamps and 15-hole wheels. The Camry has its chrome grille bar with the Toyota emblem, swept lamps, fog lamps and 5-spoke alloys. The Challenger has quad halo lamps, bonnet scoops, stripes, a full-width tail bar and split-spoke wheels. Cabins are see-through, with seats, a steering wheel and a driver, and danfos are packed with passengers.

The road: one long, straight dual carriageway lined with shops, markets, bus stops, kiosks, filling stations, billboards and footbridges, with traffic in every lane on both sides. The interconnected road network (a grid of streets with junctions you could turn into) is still in the code but commented out, marked `[ROAD NETWORK DISABLED]` in physics.js, cityGrid.js, render.js, Game.jsx and the tests; uncomment those blocks to bring it back.

Angry drivers and race rivals fight dirty: they line up behind you and ram your rear bumper again and again (their rams never count as your bumps), and the second ram brings olokpa. Once the police are on you, rivals get in front, take your lane and brake to hold you for the arrest.

Weather: press R or tap the weather button to cycle AUTO (spells of sun and rain every couple of minutes), SUNNY and RAINY. Rain brings falling streaks, heavy cloud, grey fog, a wet shiny road, spray off your tyres, beads on the windscreen, rain and tyre-wash sounds, and lightning with thunder in heavy rain. Wet roads lengthen braking, slow the steering, and everyone drives a bit slower. Water-filled potholes lie across the lanes: hitting one jolts the car, costs speed and a little damage, and throws up water with a splash sound.

The streets have danfos with conductors hanging out of the door, kekes, okadas weaving between lanes, BRT buses, yellow taxis, oncoming traffic across the median, agberos calling routes at bus stops, hawkers who offer you pure water when you slow down, market umbrellas, kiosks, a filling station, overhead footbridges and green road signs.

## Admin panel

Open `/admin` (for example http://localhost:5173/admin) to see who is playing: drivers online now, peak players today and all time, players and sessions today, average session length, drives started, a 24-hour chart of players online, daily players for the last 14 days, popular cars and cities, game outcomes (races won/lost, busted, wrecked, road-rage wins, Pepsi boosts used, Galas eaten), a live table of who is on the road, and recent players. It refreshes every 5 seconds.

The panel needs the admin token. Set `ADMIN_TOKEN` in the environment, or let the server generate one: it is saved in `data/admin-token` and printed in the console when the server starts. Stats are kept in `data/stats.json` (30 days of daily totals), written every minute and when the server is stopped.

Deploying to Render (or Railway, Heroku and similar): these hosts wipe the app folder on every deploy and restart, and Render's free instances restart after 15 idle minutes. Without settings, each restart makes a new random token (which signs you out of `/admin`) and empties the stats. Set `ADMIN_TOKEN` to a long random string so the token never changes. To keep the stats, set `DATABASE_URL` to a Postgres connection string (a free [Neon](https://neon.tech) database works): the server creates a `mainland_stats` table, loads the stats on startup and saves them every minute and on shutdown. If the database can't be reached at startup the game still runs, but that run's stats stay in memory and are not saved, so the stored ones are never overwritten. Alternatively, attach a persistent disk (Render: Disks, paid instances only), mount it at, for example, `/var/data`, and set `DATA_DIR=/var/data`. The startup log shows where stats are kept (`Stats storage: ...`) and warns when nothing persistent is set. Locally, without `DATABASE_URL`, stats stay in `data/stats.json`. Players are anonymous: a random per-browser ID plus the street name they chose; no location or personal data is collected. `data/` is in `.gitignore`, so keep the token out of version control.

## Files

- `src/game/physics.js`: driving, traffic AI, police pursuit and arrest (covered by `physics.test.js`)
- `src/game/render.js`: the scene, vehicles, camera, mirror, weather
- `src/game/cityGrid.js`: the city grid (blocks, roads, junctions, pedestrians, cross-street traffic)
- `src/game/models.js`: vehicles, people and street props
- `src/game/textures.js`: canvas art (facades, signs, Nigerian plates, danfo slogans, Ankara prints) and the photo-texture loader
- `src/game/city.js`: road names, areas, shops, agbero calls and cars
- `src/game/audio.js`: synthesised engine, siren and horn
- `server/`: guest multiplayer (SSE plus HTTP)

## Credits

Photo textures and sky (asphalt, concrete pavement, plaster wall, corrugated iron, red laterite soil, Kloofendal sky) come from [Poly Haven](https://polyhaven.com) under CC0. Everything else is generated in code.

## Live multiplayer

Open two windows on the same running server, pick the same city and drive together. Deploy the Node server and `dist` together, because static hosting can't serve multiplayer. Simulation and rewards run on each player's machine, so a competitive release would need an authoritative server.
