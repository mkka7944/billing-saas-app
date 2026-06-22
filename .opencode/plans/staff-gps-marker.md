# Staff GPS Marker — Distinctive UserMarker

## Goal
Make the staff's GPS position marker on the map distinctive and easy to spot.

## Why
The current UserMarker is a 7px blue CircleMarker — same size/color as other markers. Staff can't easily see themselves on the map relative to delivery targets.

## Change
**1 file:** `src/components/delivery/staff-map.tsx`

### Current (lines 21-38)
Single CircleMarker, 7px radius, blue (#3b82f6), white 3px border.

### After
Two concentric CircleMarkers using cyan (#22d3ee):
- **Outer ring:** 14px radius, cyan fill at 15% opacity, 2px border
- **Inner dot:** 8px radius, solid cyan fill, 3px white border

This is clearly different from all existing markers (5-7px, various colors):
- Assignment markers: 6-7px, color by status (blue/amber/green/red/gray)
- Search result marker: 10px semi-transparent blue

## Files Changed
| File | Change |
|------|--------|
| `src/components/delivery/staff-map.tsx` | Replace `UserMarker` component body with `<></>` fragment wrapping two `CircleMarker`s |

## Verification
1. Open `/map` as field_staff → open UDS → see map
2. A teal/cyan concentric circle marker should appear at the GPS position
3. Compare with assignment markers — clearly different size and color
4. Run `npx tsc --noEmit` — zero errors
