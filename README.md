# Composite WingBox Analyzer

A browser-based preliminary structural-analysis tool for a straight composite
wing box. Define an airfoil, wing geometry, spar positions, laminate layups,
material properties and loads, then inspect stiffness, mass, deflection, twist,
shear flow and ply-level stress results.

> **Suggested GitHub repository description:** Browser-based preliminary
> structural analysis of straight composite wing boxes using airfoil geometry,
> laminate layups, material allowables and applied loads.

## What it does

- Generates NACA four-digit airfoils or imports Selig/Lednicer coordinate files.
- Forms a closed two-spar wing box from upper and lower skins, two webs and four
  optional spar caps.
- Accepts independent ply stacks for both skins, both webs and the spar caps.
- Calculates classical laminate `A`, `B` and `D` matrices.
- Calculates elastic centroid, bending rigidity, shear centre, shear compliance
  and single-cell torsional rigidity.
- Integrates cantilever bending, transverse shear and twist along the half-span.
- Recovers ply stresses and evaluates a first-ply maximum-stress index.
- Displays an interactive wing view, cross-section, spanwise plots and ply table.
- Exports the inputs, assumptions and results to CSV.

## Analysis scope

This is a **preliminary sizing tool**, not shell finite-element analysis or a
flightworthiness assessment. The current beam model assumes:

- a straight, constant-chord, constant-section wing;
- one root-clamped half-wing with a free tip;
- a closed, single-cell, thin-walled box between two spars;
- linear-elastic lamina behaviour and small displacements;
- symmetric, balanced laminates; and
- prescribed structural loads rather than aerodynamic load prediction.

It does not analyse local skin/web buckling, joints, adhesives, ribs, root
fittings, delamination, through-thickness stress, fatigue, damage progression,
local pressure bending, large-deflection behaviour or aeroelastic stability.
See [MODEL.md](MODEL.md) for the equations, conventions and full limitations.

The default carbon/epoxy properties and loads are illustrative. Replace them
with verified material data, design allowables and applicable load cases before
using the results for an engineering decision.

## Run locally

No package installation or build step is required. You only need a local HTTP
server because the application uses JavaScript modules.

With Python 3:

```bash
python -m http.server 8000 --directory dist
```

Then open <http://localhost:8000>.

Alternatively, with Node.js:

```bash
npx serve dist
```

Opening `dist/index.html` directly as a `file://` URL may prevent module loading
in some browsers, so an HTTP server is recommended.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow that publishes `dist/` as a
static site.

1. Create a new GitHub repository and upload the contents of this package.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Push to the `main` branch, or run the workflow manually from **Actions**.

The workflow will display the deployed URL when it finishes.

## Verify the calculations

Node.js 20 or later is recommended for the verification suite.

```bash
node --test tests/mechanics.test.mjs
node --check dist/app.mjs
node --check dist/solver.mjs
```

The 14 automated checks cover laminate identities and coupling detection;
rectangular-box `EI`, `GJ`, centroid and mass; shear-flow equilibrium; uniform,
tip and interior point-load beam solutions; pure torsion stress; load scaling;
self-weight; span convention; coordinate parsing; and invalid-input handling.
They are analytical software checks, not experimental validation.

## Repository structure

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml     # GitHub Pages deployment
├── dist/
│   ├── index.html               # Application interface
│   ├── style.css                # Responsive visual design
│   ├── app.mjs                  # Inputs, plots, views and CSV export
│   └── solver.mjs               # Laminate, section and beam calculations
├── tests/
│   └── mechanics.test.mjs       # Analytical verification suite
├── MODEL.md                     # Model equations and limitations
├── README.md                    # Project documentation
└── .gitignore
```

## Data and dependencies

The analysis runs entirely in the browser. The application does not send the
airfoil, layup or load inputs to a server. Runtime calculations use no external
JavaScript dependencies. The stylesheet requests DM Sans and IBM Plex Mono
from Google Fonts; system fonts are used if they cannot be loaded.

Input state is not persisted across page reloads. Use **Export results** to save
the current configuration and calculations.

## Licence

No software licence has been selected for this package. Add an appropriate
`LICENSE` file before granting others permission to reuse or redistribute the
code.
