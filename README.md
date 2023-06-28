# Tangle

A 2d symmetry explorer. Bridging project to the 3d version.

HTML, Javascript, Three.js.

## Requirements

Make sure to use `git clone --recursive` as there are submodules.

1. [Nodejs](https://nodejs.org/en/) runtime.
2. Yarn package manager, install with `npm install -g yarn`.

## Develop

1. Install dependancies.

```
yarn install
```

2. Start development server.

```
yarn start
```

Entry point is `src/main.html`.
Attach the debugger from the 'Run and Debug' panel if in VS Code.

## Other commands

* `yarn build` Builds are output to `dist/`.
* `yarn fmt` Makes sure files in `src/` meet javascript formatting rules.