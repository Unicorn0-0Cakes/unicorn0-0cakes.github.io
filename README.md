# unicorn0-0cakes.github.io

The canonical home of Candice Cantrelle's multidisciplinary portfolio.

**Live:** https://unicorn0-0cakes.github.io/

Static HTML, CSS and JavaScript. No framework, no build step, no tracking.
`.nojekyll` is present so GitHub Pages serves the tree exactly as committed.

## Structure

```
/                       homepage
/simulations/           Simulations wing — front door to the atlas
/simulations/atlas/     the atlas itself (vendored, see below)
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

## The vendored atlas

`/simulations/atlas/` is a verbatim copy of
[`Unicorn0-0Cakes/simulations`](https://github.com/Unicorn0-0Cakes/simulations),
so the instruments are served from this repository rather than depending on a
second GitHub Pages site. That repository remains the source of truth.

To pull in new or updated instruments, replace the directory wholesale:

```sh
rm -rf simulations/atlas
git clone --depth 1 https://github.com/Unicorn0-0Cakes/simulations.git simulations/atlas
rm -rf simulations/atlas/.git simulations/atlas/.gitignore \
       simulations/atlas/.gitattributes simulations/atlas/.nojekyll
```

Nothing inside `simulations/atlas/` is patched during vendoring — every path in
it is relative to the atlas root — so a re-copy never needs re-editing. If an
instrument is added, add its portfolio record to `data/projects.js` as well.

## Local preview

Serve from the repository root, because the site is a user site mounted at `/`:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000/.
