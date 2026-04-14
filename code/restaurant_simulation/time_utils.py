from __future__ import annotations


def parse_clock(value: str) -> int:
    parts = value.strip().split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid time format: {value!r}")
    hour = int(parts[0])
    minute = int(parts[1])
    if hour < 0 or minute < 0 or minute > 59:
        raise ValueError(f"Invalid time value: {value!r}")
    return hour * 60 + minute


def format_clock(minute: int) -> str:
    hour, minute = divmod(minute, 60)
    return f"{hour:02d}:{minute:02d}"


def clamp_interval(start: int, end: int, lower: int, upper: int) -> int:
    bounded_start = max(start, lower)
    bounded_end = min(end, upper)
    return max(0, bounded_end - bounded_start)


def percentile(values: list[int | float], fraction: float) -> float:
    if not values:
        return 0.0
    if fraction <= 0:
        return float(min(values))
    if fraction >= 1:
        return float(max(values))
    sorted_values = sorted(float(value) for value in values)
    position = (len(sorted_values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight
