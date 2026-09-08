# Composite WingBox Analyzer model

This is a browser-based preliminary sizing tool for a straight, constant-section,
root-clamped composite half-wing. It is not shell finite-element analysis.

## Coordinates and geometry

`y` runs from root to tip, `x` from leading to trailing edge, and `z` upwards.
Positive applied torque raises the trailing edge. The box contour is clockwise
in the displayed x-z plane. Its signed twice-area is therefore negative.
Imported coordinate files are normalized by their x range and translated so
the mean trailing-edge height is zero. NACA four-digit sections use normal-to-
camber-line thickness and a closed trailing edge.

The load-bearing section is only the upper/lower airfoil contour between two
spars, their vertical webs, and four optional axial cap booms. Wall midlines
coincide with the specified contour. The model does not offset them by laminate
thickness. Caps sit on the skin midline at each corner; their centroid offsets
and own small local second moments are ignored. Cap width times laminate
thickness sets each cap area. Caps contribute axial stiffness and mass, but not
independent shear stiffness. Cap force transfers enter wall shear-flow jumps.

Ribs, outer fairings, adhesive, joints, fittings and equipment are not included
in structural mass or stiffness. They require separate loads and checks.

## Laminate mechanics

One homogeneous UD plane-stress material is used in all physical plies. Each
region has an independent sequence of angle, thickness and repeat count.
Repeats are expanded first; optional mirroring appends the reversed expanded
sequence. Standard transformed reduced stiffness matrices produce A, B and D.

The beam solution requires B=0 and A16=A26=0 within a relative tolerance of
1e-7. Symmetric, balanced laminates satisfy this. D16 and D26 may be nonzero;
local plate bending stiffness is reported, but is not used in global thin-wall
membrane beam stiffness. Local plate curvature and local pressure bending are
not calculated.

For a wall, transverse membrane force is zero. Axial stiffness per unit width is
`k = A11 - A12²/A22`; shear stiffness per unit width is `A66`.

`Nx = k * epsilon_span`, `epsilon_s = -A12/A22 * epsilon_span`,
and `gamma_span,s = q / A66`. Strains are transformed into fibre material axes,
then multiplied by the unrotated plane-stress Q to recover sigma1, sigma2 and
tau12. Cap stress uses the same axial strain and zero independent cap shear.
Ply stresses are membrane values; local ply bending stresses are absent.

## Bending and transverse shear

The elastic centroid uses k ds for walls and E A for cap booms. The complete
2-by-2 weighted second-moment matrix couples vertical and chordwise curvature.
For vertical moment M, axial strain is

`epsilon = -M [betaZ * (z-ze) + betaX * (x-xe)]`,

where beta is the first column of the inverse stiffness matrix. Positive
upward bending compresses the upper wall. Line-segment stiffness integrals are
evaluated exactly. Curved skins have 64 panels each; webs have 24 each.

Unit vertical and chordwise shear-flow solutions follow axial equilibrium,
including jumps at cap booms. A redundant constant flow enforces zero twist:
`integral(q / A66 ds) = 0`. Their force resultants and contour closure are
checked in the automated verification cases. The torques of these flows locate
both shear-centre coordinates. Integrals of products of unit flows divided by
A66 give the vertical and cross-coupled transverse shear compliances. Four-point
Gauss quadrature exactly integrates these panel-wise quartic expressions.

## Torsion and loads

`GJ = (signed twice-area)² / integral(ds/A66)`.
Total wall flow is unit vertical-shear flow times V plus
`T / signed twice-area`. T is measured about the shear centre.

Uniform, root-heavy triangular and elliptical distributed forces use analytic
integrals for shear and moment. Eccentricity is measured from the calculated
shear centre. Self-weight, if enabled, is uniform and acts at the material
centroid. Point loads have their own span and chord coordinates. Additional
uniform torque and tip torque are independent inputs. All loads, including
self-weight, are multiplied by the load multiplier.

The input force is always the force on ONE half-wing. Selecting full wingspan
only halves the entered length for the analysed cantilever. It does not halve
the force or double the reported mass.

Beam curvatures, transverse shear strains and twist rate are integrated with
trapezoidal quadrature over 160 span intervals plus all exact point-load
positions. One-sided loads at interval boundaries prevent integration errors
across shear/torque jumps. Both sides of every point load are inspected for
peak stress. Reported peak indices are sampled estimates, not an exact
continuous optimization. Cross-section stress recovery samples panel ends and
midpoints, plus all caps. At a selected point-load station, inspection uses the
inboard side.

## First-ply screening and limitations

Maximum-stress index is the largest of |sigma1|/X, |sigma2|/Y and |tau12|/S.
X and Y choose the tensile or compressive input according to stress sign.
Reciprocal peak index is a proportional reserve for the complete current load
case, not an overall structural safety factor. No failure interaction,
progressive failure, buckling or damage model is included.

There is no local panel buckling, shear buckling, cross-section distortion,
joint or adhesive failure, delamination, through-thickness stress, stress
concentration, fatigue, environmental degradation, local pressure bending,
geometric nonlinearity, flutter or divergence analysis. Material defaults are
illustrative and have no certified basis. Warnings identify large beam
deflection/rotation and weak slender/thin-wall assumptions. These do not
constitute a complete validity assessment.

## Verification

Run `node --test tests/mechanics.test.mjs` from this checkout. The independent
checks include isotropic laminate identities; symmetric/balanced limits; exact
thin rectangular-box EI, GJ, centroid and mass; shear equilibrium; uniform,
tip and interior point-load cantilever solutions; pure torsion stress;
load-factor scaling; self-weight; span convention; coordinate formats; and
invalid-input rejection. No physical wing or commercial FEA validation has
been performed.

## References

- A. T. Nettles, NASA RP-1351 (1994), *Basic Mechanics of Laminated Composite
  Plates*: https://ntrs.nasa.gov/citations/19950009349
- E. R. Johnson, *Aerospace Structures*, Chapter 3, *Elements of a Thin-walled
  Bar Theory*: https://eng.libretexts.org/Under_Construction/Aerospace_Structures_(Johnson)/03%3A_Elements_of_a_thin-walled_bar_theory

The maximum-stress screen is explicitly defined above; NASA RP-1351 does not
cover laminate strength prediction.
