# Balls & Gambling

A neon cyber brick breaker with 5 modes (Classic, Survival, Funky Balls, RPG, Neon Bubbles) and a Cyber-Lottery.
It runs in the browser on PC, tablet and phone. You don't need to install anything.

## Play

**https://tom220105.github.io/Balls-and-Gambling/**

Your progress is saved in the browser on each device.

## Put it online with GitHub Pages

1. Open the repo on GitHub and go to **Settings**.
2. Click **Pages** on the left.
3. Under "Build and deployment" pick **Deploy from a branch**.
4. Choose branch **main** and folder **/ (root)**, then click **Save**.
5. Wait 1 or 2 minutes. The game is then online at the link above.

Every time something new is pushed to `main`, the page updates by itself after a minute.

## Play on a phone or tablet

On the first start the game asks: **PC, PHONE or TABLET?** It then sets up the camera, the graphics and the controls for that device. You can change it later in **Settings > Playing on**.

The game works upright and sideways. On a phone or tablet the controls are:

| Mode | Touch controls |
| --- | --- |
| Classic / Survival | Drag your finger anywhere (best in the free space below the arena) to move the pad, tap to launch the ball |
| Funky Balls | Drag to aim, let go to fire. Drag near the gun to move it. FAST and RECALL buttons while the balls fly |
| Neon Bubbles | Drag to aim, let go to shoot. Tap the next bubble to swap |
| RPG | Drag back and let go to sling a hero. Tap a hero card to arm HYPER. In the formation, drag a hero onto another spot to change the order (1 shoots first) |

The **pause button** is on the left side while you play.

### Add it to your home screen

Then it opens fullscreen like a real app and also works without internet.

* **iPhone / iPad (Safari):** tap the share button, then **Add to Home Screen**.
* **Android (Chrome):** tap the menu (three dots), then **Add to Home screen** or **Install app**.

## Files

* `index.html` the page
* `css/` the looks (`mobil.css` has the phone layout)
* `js/` the game (`mobil.js` has the phone detection)
* `js/lib/` three.js for the 3D graphics
* `manifest.webmanifest`, `icons/` and `sw.js` make it installable and playable offline

# Sling Heroes

A second game in this repo: a 3D fantasy marble RPG in the style of Hyper Heroes. It is in the folder `heroes/`.

**Play: https://tom220105.github.io/Balls-and-Gambling/heroes/**

* A 3D town on an island with buildings you can tap: Campaign, Arena, Demon Tower, Wishing Altar, Expedition, Guild Castle, Hall of Mastery, Shop and Mailbox
* 25 heroes in 5 elements (Fire, Water, Wood, Light, Dark), each with a Hyper skill, a Combo skill and a passive
* 6 chapters with 8 stages each, on Normal, Elite and Nightmare, and a boss at the end of every chapter
* Heroes menu with level up, stars, gear and breakthrough, plus Mastery, Missions, Inventory, Shop, Daily Gift and Mail
* All the graphics are made in the browser: 3D heroes and monsters in anime style, glow, light, particles, water and lava. All sounds and the music are made in the browser too, so there are no extra files to download.

Your progress is saved in the browser on each device.

## How to play

| What | How |
| --- | --- |
| Sling a hero | Drag back anywhere on the arena and let go. The arrow shows where the hero flies |
| Combo | Bump into your own heroes, then their combo skill fires (lasers, blasts, lightning, heals) |
| Hyper Strike | When a hero card glows (100%), tap it on that hero's turn, then sling |
| Weak spot | Hit the orange spot on a boss for 3x damage |
| Elements | Fire beats Wood, Wood beats Water, Water beats Fire. Light and Dark beat each other |
| Enemies | The number over an enemy counts down. At 0 it attacks your team HP |
| 3 stars | Win the stage within the shown number of turns |
| Town | Drag left and right to look around, tap a building to open it |

**Bounce** heroes bounce off enemies and walls. **Pierce** heroes fly straight through enemies.

You can add Sling Heroes to your home screen too (same steps as above). Then it has its own icon and also works without internet.

## Files of Sling Heroes

* `heroes/index.html` the page
* `heroes/css/heroes.css` the looks of the menus
* `heroes/js/core.js` renderer, glow, sound and save game
* `heroes/js/data.js` all heroes, monsters, chapters, items and missions
* `heroes/js/chars.js` and `monsters.js` build the 3D heroes and monsters
* `heroes/js/town.js`, `worldmap.js`, `showroom.js` and `battle.js` the 3D scenes
* `heroes/js/state.js`, `ui.js`, `menus.js` and `modes.js` the game rules and the menus
* `heroes/manifest.webmanifest`, `heroes/icons/` and `heroes/sw.js` make it installable and playable offline
* three.js is shared with Balls & Gambling (`js/lib/`)
