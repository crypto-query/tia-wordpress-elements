# Dates and times

DateField, DateRangeField, TimeField, TimeRangeField, Calendar, RangeCalendar, DatePicker, DateRangePicker. Verified against bits-ui 2.18.1.

## The value model

Dates are `DateValue` objects from `@internationalized/date`, a **required peer dependency** of bits-ui since `2.1` — it installs whether or not you use these components. Never a JS `Date`.

| Type | Holds | Build with |
|---|---|---|
| `CalendarDate` | a date, no time | `new CalendarDate(y, m, d)`, `parseDate('2026-08-06')`, `today(getLocalTimeZone())` |
| `CalendarDateTime` | date + time, no zone | `new CalendarDateTime(y, m, d, h, min)`, `parseDateTime('2026-08-06T12:30')` |
| `ZonedDateTime` | date + time + zone | `parseZonedDateTime('2026-08-06T12:30[Europe/Berlin]')`, `parseAbsolute(iso, tz)`, `parseAbsoluteToLocal(iso)` |

Three properties decide most of the code you write against them:

- **Months are 1-indexed.** January is `1`, unlike JS `Date`.
- **They are immutable.** `date.set({ month: 8 })`, `date.add({ days: 1 })`, `date.subtract({ weeks: 2 })` and `date.cycle('month', 'forward')` return new objects — reassign, never mutate.
- **Which type you choose is a behavioural choice.** Give a picker a `CalendarDateTime` and it offers time segments; give it a `CalendarDate` and it does not. Use `ZonedDateTime` for anything that happens at an absolute instant (a meeting, a market open).

Format with `DateFormatter`, which wraps `Intl.DateTimeFormat`. Build it once and reuse it:

```ts
import { DateFormatter, getLocalTimeZone, today } from '@internationalized/date';

const formatter = new DateFormatter('en-GB', { dateStyle: 'long' });
const label = formatter.format(today(getLocalTimeZone()).toDate(getLocalTimeZone()));
```

Convert at the boundary: `parseDate(row.due_date)` on the way in, `value.toString()` on the way out.

## The placeholder

Every date and time component takes a bindable `placeholder` alongside `value`, and it does three jobs at once: it is the starting point for keyboard entry, it decides **which `DateValue` type** the component works in while `value` is empty, and on calendars it controls the visible month.

```svelte
<script lang="ts">
	import { Calendar } from 'bits-ui';
	import { getLocalTimeZone, today, type DateValue } from '@internationalized/date';

	let value = $state<DateValue | undefined>(undefined);
	let placeholder = $state<DateValue>(today(getLocalTimeZone()));
</script>

<button onclick={() => (placeholder = placeholder.add({ months: 1 }))}>Next month</button>

<Calendar.Root type="single" bind:value bind:placeholder>
	{#snippet children({ months, weekdays })}
		{#each months as month (month.value)}
			<Calendar.Grid>
				<Calendar.GridHead>
					<Calendar.GridRow>
						{#each weekdays as day (day)}
							<Calendar.HeadCell>{day}</Calendar.HeadCell>
						{/each}
					</Calendar.GridRow>
				</Calendar.GridHead>
				<Calendar.GridBody>
					{#each month.weeks as week, i (i)}
						<Calendar.GridRow>
							{#each week as date (date)}
								<Calendar.Cell {date} month={month.value}>
									<Calendar.Day />
								</Calendar.Cell>
							{/each}
						</Calendar.GridRow>
					{/each}
				</Calendar.GridBody>
			</Calendar.Grid>
		{/each}
	{/snippet}
</Calendar.Root>
```

Programmatic navigation is a `placeholder` reassignment — there is no `goToMonth()`.

## Day-cell attributes

`Cell` and `Day` carry the same state set, so a calendar can be styled end to end without a single class:

| Attribute | The day |
|---|---|
| `data-today` | is today |
| `data-selected` | is part of the current value |
| `data-disabled` | is out of range, rejected by `isDateDisabled`, or outside the month while `disableDaysOutsideMonth` is on |
| `data-unavailable` | was rejected by `isDateUnavailable` |
| `data-outside-month` | belongs to a neighbouring month |
| `data-outside-visible-months` | falls outside the rendered months altogether |
| `data-focused` | holds the roving tabindex |
| `data-value` | — its ISO string, and `data-type` its `DateValue` flavour |

`RangeCalendar` adds `data-range-start`, `data-range-middle` and `data-range-end` for the highlight bar, plus `data-highlighted` on every day inside the range the pointer is currently previewing. `data-selection-start` and `data-selection-end` are aliases of the range pair — the same booleans, not a finer distinction.

## Fields and segments

`DateField`, `DateRangeField`, `TimeField` and `TimeRangeField` render a segmented control: each segment (`month`, `day`, `year`, `hour`, `dayPeriod`, …) is its own focusable element with arrow-key increment and type-ahead, which is why they read correctly to a screen reader in a way a masked text input does not.

```svelte
<script lang="ts">
	import { DateField } from 'bits-ui';
</script>

<DateField.Root granularity="day" locale="en-GB">
	<DateField.Label>Due date</DateField.Label>
	<DateField.Input>
		{#snippet children({ segments })}
			{#each segments as { part, value }, i (i)}
				<DateField.Segment {part}>{value}</DateField.Segment>
			{/each}
		{/snippet}
	</DateField.Input>
</DateField.Root>
```

Which segments appear follows `granularity` (`"day"` `"hour"` `"minute"` `"second"`) and the value's type. `locale` sets segment order and separators; `hourCycle` forces 12- or 24-hour; `hideTimeZone` drops the zone segment; `readonlySegments` freezes individual parts.

## Validation

- `minValue` / `maxValue` bound the range.
- `validate` returns an error string (or nothing) per value — for business rules such as "no weekends".
- `isDateDisabled` and `isDateUnavailable` on calendars differ in reachability. A **disabled** day loses its `tabindex` entirely and carries `data-disabled` — keyboard navigation never lands on it. An **unavailable** day keeps its tabindex, gets `aria-disabled="true"` and `data-unavailable`, and refuses the click — reachable and announced, but not selectable. Unavailable is for a booked slot the user should hear about; disabled is for a date outside the range at all.
- `onInvalid` fires with the reason; the field sets `data-invalid` for styling. Wire your message to the control with `errorMessageId`.

## Range calendars

`RangeCalendar` adds `minDays` / `maxDays` and `excludeDisabled` (`2.5`, resetting the range when a disabled date falls inside it), and marks the interior of a selection with `data-range-middle` on both `Cell` and `Day` — the attribute that makes a continuous highlight bar possible without index maths. `Calendar type="multiple"` takes `maxDays` to cap the selection.

## Composed pickers

`DatePicker` and `DateRangePicker` are a field plus a calendar in a popover, so they take the union of both prop sets plus the floating-content props from [overlays.md](overlays.md), including `onOpenChangeComplete`. `DateRangePicker` exposes no `Portal` part.

## Locale

Set `locale` per component, or once for a subtree with `<BitsConfig defaultLocale="de">`. Left alone it is `"en"` — an app that localises everything else and forgets this will show the wrong segment order. `Calendar.MonthSelect` and `Calendar.YearSelect` give a fast jump across months and years, with `monthFormat` / `yearFormat` taking either an `Intl` option or your own formatting function.
