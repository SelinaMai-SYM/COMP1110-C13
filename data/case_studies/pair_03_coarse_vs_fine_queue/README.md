# Pair 03: Coarse vs Fine Queue Buckets

This pair changes only the granularity of size-based queue buckets while holding arrivals, table layout, reservation holding, and service rules fixed. Version A uses coarse buckets that merge several party sizes together, while Version B uses finer segmentation. Compare `average_wait_time`, `max_queue_length`, `service_level_within_15_min`, `average_table_fit_efficiency`, and `notes` from the metrics output to discuss whether better matching comes at the cost of perceived fairness and operational simplicity.
