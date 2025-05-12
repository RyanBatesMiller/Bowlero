# Bowlero
Bowlero is an interactive 3D bowling simulator set in a retro bowling alley. The user will be able to "bowl" using mouse/key controls, with full animation of the ball's motion, pin collisions, and scoring.


# Set up
## Installing the package managers: Node.js and npm. You might have them already installed in your machine, you can check by opening a terminal and running:
`node -v` and `npm -v`. I have `v22.7.0` and `10.8.2`.
If you don't have npm installed, you can install it by following [the instructions](https://nodejs.org/en/download/package-manager).

## Install `Three.js` and `vite` by running:
```bash
# three.js
npm install --save three

# vite
npm install --save-dev vite
```

## Now we need to start the web server and see the result in the browser. In your terminal, run:
```bash
npx vite
```
You should see a message like:
```
  VITE v5.4.2  ready in 106 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

In order to see the scene, we will navigate to `localhost:5173/` in our browser. You can do this by cmd+clicking the link in the terminal or by copying and pasting the link in your browser.

### Potential error: If you see an error in the terminal like:
```
Failed to load PostCSS config: Failed to load PostCSS config
```




   
