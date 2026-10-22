<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Year data lives in the `fleet_years` table (one row per year, full snapshot in `data`); the app only writes the open year, closed years stay read-only history so a new year never touches the previous one.
- The device and month selectors share `src/components/WheelPicker.tsx` — scroll, drag and reorder behaviour is changed there only, never duplicated in a route.
- Excel import matches devices by normalized plate/identifier, never by row position, and must keep the user's manual device order untouched.
- Number formatting (decimals per unit) follows the rules in project memory; do not introduce per-field overrides in components.
- Optional service cycles live inside each device's annual snapshot, and warning/deadline ordering logic lives in a browser-safe pure module so thresholds can be tested without database access.
- Keep all saved document types intact on load; names, numbers and dates are independent user-owned fields.
