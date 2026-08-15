# unicorn0-0cakes.github.io

The canonical home of Candice Cantrelle's multidisciplinary portfolio.

**Live:** https://unicorn0-0cakes.github.io/

Static HTML, CSS and JavaScript. No framework, no build step, no tracking.
`.nojekyll` is present so GitHub Pages serves the tree exactly as committed.

## Structure

```
/                       homepage
/simulation/            Simulations wing — front door to the atlas
/map/                   star map — the whole site as one figure
/ai-ml/                 AI + ML wing
/software/              Software wing
/research/              Research wing
/games/                 Games wing
/design/                Design wing
/workshop/              Workshop wing
/about/                 About + credentials
/archive/               the previous version of the site, preserved
/projects/              self-hosted project builds (cube timer)
/assets/                shared CSS, JS and images
/data/projects.js       the project registry — the single source of truth
404.html                custom 404
```

## The registry

`data/projects.js` is an allowlist. Nothing renders on this site unless it has
a record there, and no page queries the GitHub API at runtime. A repository
being public does not put it on the portfolio.

## The shared shell

`assets/js/shell.js` injects the header and footer into every page, so the
navigation cannot drift between wings. It resolves the site's base URL from its
own script URL, which means pages work from any directory depth. Page content
remains readable if JavaScript fails.

## Local preview

Serve from the repository root, because the site is a user site mounted at `/`:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.

## The star map

`/map/` draws the whole site as one figure — core, seven discipline
constellations, one star per curated project, dashed spurs for anything that
leaves the site. It is generated at runtime from `data/projects.js`, so adding
a project to the registry adds a star and setting one to `hidden` removes it.
Nothing about the map needs editing when the work changes.

Section 02 of that page renders the identical content as an ordinary nested
list. That list is the accessible version — it is what a screen reader, a
visitor without JavaScript, and a narrow phone get — and the figure is a second
view of it rather than a replacement.

## A note on /simulation/ and /simulations/

The Simulations **wing** is at `/simulation/`. The standalone atlas is at
`/simulations/`, published from `Unicorn0-0Cakes/simulations`.

They differ by one letter for a real reason: GitHub Pages serves a project site
at `/<repo>/` in preference to a same-named directory in the user site, so the
portfolio cannot use `/simulations/` while the atlas repo publishes there. The
wing therefore uses the singular — which is also the discipline name on the
homepage — and links out to the atlas.

`data/projects.js` records this as an explicit `path` on the Simulations
category; every other category derives its URL from its `id`.
