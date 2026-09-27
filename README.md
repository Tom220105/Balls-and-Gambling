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
