# Architecture rules

- Group selection quotes and displayed price breakdowns by class month; use the existing authenticated quote RPC for each month to preserve incremental pricing.
- Keep selected class records across calendar navigation so payment includes precisely the visible selection summary, including selections in other months.
- Group income app payments by class month and collection state, preserving cash monthly totals without hiding outstanding added classes inside collected amounts; only cash payments support manual collection actions.