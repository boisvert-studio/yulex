# yulex

Custom code for the Yulex Webflow site. Built on Finsweet's [developer-starter](https://github.com/finsweet/developer-starter): TypeScript, bundled and minified by esbuild.

## Develop

```bash
pnpm install
pnpm dev
```

Serves `dist/` at `http://localhost:3000` with live reload. Point a Webflow staging embed at `http://localhost:3000/index.js`.

## Ship

```bash
pnpm build
git tag vX.Y.Z && git push --tags
```

Webflow loads the tagged bundle from jsDelivr, pinned with an integrity hash:

```
https://cdn.jsdelivr.net/gh/boisvert-studio/yulex@vX.Y.Z/dist/index.js
```

Compute the `integrity=` value (SHA-384) for the script tag:

```bash
openssl dgst -sha384 -binary dist/index.js | openssl base64 -A
```

Prefix the output with `sha384-`.

## QA

The QA harness lives in `qa/`. See `qa/README.md`.

## Contracts

The data attributes the bundle reads are listed in `docs/contracts.md`.
