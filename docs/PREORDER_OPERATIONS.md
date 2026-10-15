# Impersonae pre-orders from BIG MATCH

BIG MATCH records a **pre-order request**, not a payment or completed sale.

## Visitor flow
1. On the BIG MATCH result page the visitor taps **PRE-ORDER IMPERSONAE**.
2. Required: email and quantity. Optional: name and country.
3. The checkbox records the request and acknowledgement of the current privacy notice.
4. Success is shown only after the backend confirms persistence.
5. The request is separate from the visitor's three selected cards and anonymous participation.

## Data
Private schema: `big_match_preorders`.

The application stores email, optional name, quantity, optional country, privacy notice version, status, timestamps and a technical idempotency receipt. It does **not** store the participation ID, anonymous Auth UID or selected cards.

Duplicate submissions with the same event/email do not create a second pre-order. A repeated request ID with changed payload is rejected.

The technical default retention is 180 days. The hourly `big-match-preorder-retention` job removes expired records. The event uses a dedicated `preorder_enabled` gate; the legacy catalogue/contact gate stays off. This period should be reviewed before the event if checkout or fulfilment is expected to take longer.

## Fulfilment
Initial status is `requested`. Recommended operator workflow:

```sql
select id,email,name,quantity,country,created_at
from big_match_preorders.requests
where status='requested'
order by created_at;
```

After contacting the buyer about the final price / checkout:

```sql
update big_match_preorders.requests
set status='contacted'
where id=$1::uuid;
```

Use `confirmed` only after a real order has been completed outside BIG MATCH. Use `cancelled` when the requester asks to cancel.

The app does not subscribe anyone to a newsletter and does not take payment.
